// ---------------------------------------------------------------------------
// Runtime Manager
//
// Collects Node/Bun runtime metrics from managed processes via the Chrome
// DevTools Protocol (inspector).
//
// How it works:
//   1. The launcher passes --inspect=0 to each Node/Bun child process,
//      which picks a random available port and prints:
//        "Debugger listening on ws://127.0.0.1:<port>/..."
//   2. RuntimeManager reads that port (supplied via managedPorts map),
//      opens a WebSocket to the inspector endpoint, and polls CDP APIs.
//   3. Metrics are emitted as 'metrics:runtime:updated' events on the bus.
//
// CDP methods used:
//   Runtime.getHeapUsage()        → heapUsed, heapTotal
//   Runtime.evaluate(expression)  → RSS, external, uptime, handles etc.
//     (Uses process.memoryUsage() and process._getActiveHandles() evaluated
//      inside the target process via the inspector)
//
// Event loop lag measurement:
//   A lightweight probe is evaluated in the target via inspector:
//     const start = Date.now(); setImmediate(() => resolve(Date.now() - start));
//   Lag = actual delay - expected 0ms.
//
// GC metrics are not available via stable CDP; they require the
// --expose-gc flag and custom instrumentation. We track cumulative
// estimate via heap growth heuristic (Phase 2). Native GC events
// will be added in Phase 3 via v8.GCProfiler or perf_hooks.
// ---------------------------------------------------------------------------

import { bus }                  from './event-bus.ts';
import { updateRuntimeMetrics } from './state-manager.ts';
import type { RuntimeMetrics, GcMetrics } from '../types/metrics.types.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WsLike {
  send: (data: string) => void;
  close: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface InspectorSession {
  ws:      WsLike;
  id:      number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
}

export interface RuntimeManagerHandle {
  /** Register a managed process inspector port. Called by the launcher after spawn. */
  register:   (id: string, pid: number, wsUrl: string) => void;
  /** Unregister a managed process. Called when the process exits. */
  unregister: (id: string) => void;
  /** Stop all inspector sessions and timers. */
  stop:       () => void;
}

// ── Internal session state ────────────────────────────────────────────────────

interface ProcessSession {
  id:      string;
  pid:     number;
  wsUrl:   string;
  session: InspectorSession | null;
  gcState: { lastHeap: number; count: number; totalMs: number; lastPauseMs: number | null };
}

// ── WebSocket helper ──────────────────────────────────────────────────────────
// Use the global WebSocket available in Bun 1+ and Node 22+.
// Falls back gracefully if the runtime doesn't support it.

async function openSession(wsUrl: string): Promise<InspectorSession> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WS = (globalThis as Record<string, unknown>)['WebSocket'] as (new (url: string) => WsLike) | undefined;
  if (!WS) throw new Error('WebSocket not available in this runtime (need Bun 1+ or Node 22+)');

  const ws = new WS(wsUrl);

  return new Promise((resolve, reject) => {
    const session: InspectorSession = {
      ws,
      id: 1,
      pending: new Map(),
    };

    ws.on('open', () => resolve(session));
    ws.on('error', (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
    ws.on('message', (raw: unknown) => {
      try {
        const str = typeof raw === 'string' ? raw : String(raw);
        const msg = JSON.parse(str) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (msg.id !== undefined) {
          const cb = session.pending.get(msg.id);
          if (cb) {
            session.pending.delete(msg.id);
            if (msg.error) {
              cb.reject(new Error(msg.error.message));
            } else {
              cb.resolve(msg.result);
            }
          }
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}

function cdpCall<T>(
  session: InspectorSession,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = session.id++;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    session.pending.set(id, {
      resolve: (v) => {
        if (timeoutHandle !== null) { clearTimeout(timeoutHandle); timeoutHandle = null; }
        (resolve as (v: unknown) => void)(v);
      },
      reject: (e) => {
        if (timeoutHandle !== null) { clearTimeout(timeoutHandle); timeoutHandle = null; }
        reject(e);
      },
    });
    session.ws.send(JSON.stringify({ id, method, params }));
    // Timeout individual calls to avoid hanging
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      if (session.pending.has(id)) {
        session.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 3000);
  });
}

// JS expression evaluated inside the target process
const METRICS_EXPR = `(function() {
  const m = process.memoryUsage();
  const handles  = (process._getActiveHandles  ? process._getActiveHandles().length  : 0);
  const requests = (process._getActiveRequests ? process._getActiveRequests().length : 0);
  const uptime   = process.uptime();
  return JSON.stringify({ rss: m.rss, external: m.external, arrayBuffers: m.arrayBuffers, handles, requests, uptime });
})()`;

const LAG_EXPR = `(function() {
  return new Promise(resolve => {
    const start = Date.now();
    setImmediate(() => resolve(Date.now() - start));
  });
})()`;

// ── Poll a single process ──────────────────────────────────────────────────────

async function pollProcess(
  ps: ProcessSession,
  intervalMs: number
): Promise<RuntimeMetrics | null> {
  if (!ps.session) return null;

  try {
    const [heapResult, evalResult, lagResult] = await Promise.allSettled([
      cdpCall<{ usedSize: number; totalSize: number }>(
        ps.session, 'Runtime.getHeapUsage'
      ),
      cdpCall<{ result: { value: string } }>(
        ps.session, 'Runtime.evaluate',
        { expression: METRICS_EXPR, returnByValue: true, awaitPromise: false }
      ),
      cdpCall<{ result: { value: number } }>(
        ps.session, 'Runtime.evaluate',
        { expression: LAG_EXPR, returnByValue: true, awaitPromise: true,
          timeout: Math.min(intervalMs, 2000) }
      ),
    ]);

    const heap = heapResult.status === 'fulfilled' ? heapResult.value : null;
    const evalData = evalResult.status === 'fulfilled'
      ? JSON.parse(evalResult.value.result.value) as {
          rss: number; external: number; arrayBuffers: number;
          handles: number; requests: number; uptime: number;
        }
      : null;
    const lag = lagResult.status === 'fulfilled'
      ? lagResult.value.result.value
      : 0;

    // GC heuristic: if heap used dropped significantly, a GC likely ran
    const heapUsed  = heap?.usedSize ?? 0;
    const heapTotal = heap?.totalSize ?? 0;
    const prevHeap  = ps.gcState.lastHeap;
    if (prevHeap > 0 && heapUsed < prevHeap * 0.85) {
      const freedMs = Math.round((prevHeap - heapUsed) / (1024 * 1024)); // crude proxy
      ps.gcState.count++;
      ps.gcState.totalMs   += freedMs;
      ps.gcState.lastPauseMs = freedMs;
    }
    ps.gcState.lastHeap = heapUsed;

    const gc: GcMetrics = {
      count:        ps.gcState.count,
      totalPauseMs: ps.gcState.totalMs,
      lastPauseMs:  ps.gcState.lastPauseMs,
    };

    return {
      managedId:      ps.id,
      pid:            ps.pid,
      heapUsed,
      heapTotal,
      rss:            evalData?.rss         ?? 0,
      external:       evalData?.external    ?? 0,
      arrayBuffers:   evalData?.arrayBuffers ?? 0,
      eventLoopLag:   typeof lag === 'number' ? lag : 0,
      activeHandles:  evalData?.handles     ?? 0,
      activeRequests: evalData?.requests    ?? 0,
      gc,
      uptime:         evalData?.uptime      ?? 0,
      timestamp:      Date.now(),
    };
  } catch {
    return null;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRuntimeManager(intervalMs: number): RuntimeManagerHandle {
  const sessions = new Map<string, ProcessSession>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let warmupTimer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    for (const ps of sessions.values()) {
      if (!ps.session) continue;
      const metrics = await pollProcess(ps, intervalMs);
      if (metrics) {
        updateRuntimeMetrics(metrics);
        bus.emit('metrics:runtime:updated', metrics);
      }
    }
  }

  function startTimer(): void {
    if (timer !== null || warmupTimer !== null) return;
    warmupTimer = setTimeout(() => {
      warmupTimer = null;
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
    }, 1500);
  }

  async function register(id: string, pid: number, wsUrl: string): Promise<void> {
    const ps: ProcessSession = {
      id, pid, wsUrl,
      session: null,
      gcState: { lastHeap: 0, count: 0, totalMs: 0, lastPauseMs: null },
    };
    sessions.set(id, ps);

    try {
      ps.session = await openSession(wsUrl);
      // Enable Runtime domain
      await cdpCall(ps.session, 'Runtime.enable');
    } catch (err) {
      bus.emit('app:error', {
        source: `runtime-manager:${id}`,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      ps.session = null;
    }

    startTimer();
  }

  function unregister(id: string): void {
    const ps = sessions.get(id);
    if (ps?.session) {
      try { ps.session.ws.close(); } catch { /* ignore */ }
    }
    sessions.delete(id);
  }

  function stop(): void {
    if (warmupTimer !== null) { clearTimeout(warmupTimer); warmupTimer = null; }
    if (timer !== null) { clearInterval(timer); timer = null; }
    for (const ps of sessions.values()) {
      try { ps.session?.ws.close(); } catch { /* ignore */ }
    }
    sessions.clear();
  }

  // Expose register as async but return the synchronous-compatible handle
  const handle: RuntimeManagerHandle = {
    register: (id, pid, wsUrl) => { void register(id, pid, wsUrl); },
    unregister,
    stop,
  };

  return handle;
}
