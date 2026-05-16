// ---------------------------------------------------------------------------
// Launcher
//
// Owns the lifecycle of every managed process: spawn, restart, stop, and
// exponential back-off on crash. This is the ONLY place in MetWatch that
// calls child_process.spawn().
//
// Back-off schedule (resets if process lives > STABLE_UPTIME_MS):
//   attempt 1 → 1s
//   attempt 2 → 2s
//   attempt 3 → 4s
//   attempt 4 → 8s
//   attempt 5 → 16s
//   attempt 6+ → 30s (cap)
//
// Events emitted on bus:
//   managed:started           — process came up
//   managed:stopped           — process was intentionally stopped
//   managed:crashed           — process exited unexpectedly
//   managed:restarted         — process was restarted (crash or manual)
//   log:line                  — stdout / stderr line from the child
//   log:stream:started        — child stdin/stdout attached
//   log:stream:stopped        — child exited, streams closed
// ---------------------------------------------------------------------------

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { bus } from './event-bus.ts';
import type { ManagedProcess, ManagedProcessDef } from '../types/managed-process.types.ts';

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const STABLE_UPTIME_MS = 10_000; // reset back-off counter after this many ms uptime
const MAX_BACKOFF_MS   = 30_000;

// ── Internal per-process state ─────────────────────────────────────────────

interface ProcessEntry {
  state:       ManagedProcess;
  child:       ChildProcess | null;
  backoffTimer: ReturnType<typeof setTimeout> | null;
  /** Whether stop() was explicitly called (suppresses auto-restart) */
  intentional: boolean;
  /** Timestamp the current run started (for stability check) */
  runStart: number | null;
}

// ── Launcher handle returned to callers ───────────────────────────────────

export interface LauncherHandle {
  /** Start all defined processes. Called once by bootstrap. */
  startAll: () => void;
  /** Restart a process by id. */
  restart: (id: string) => void;
  /** Gracefully stop a process by id (no auto-restart). */
  stop: (id: string) => void;
  /** Stop all managed processes. Called on TUI quit. */
  stopAll: () => void;
  /** Get a snapshot of all managed process states. */
  getAll: () => ManagedProcess[];
  /** Get a single managed process state by id. */
  get: (id: string) => ManagedProcess | undefined;
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createLauncher(defs: ManagedProcessDef[]): LauncherHandle {
  const entries = new Map<string, ProcessEntry>();

  // Build initial entries from defs
  for (const def of defs) {
    entries.set(def.name, {
      state: {
        ...def,
        pid: null,
        status: 'stopped',
        restarts: 0,
        startedAt: null,
        exitCode: null,
      },
      child: null,
      backoffTimer: null,
      intentional: false,
      runStart: null,
    });
  }

  // Subscribe to bus requests so the TUI can trigger restart/stop
  const unsubRestart = bus.on('managed:restart:requested', ({ id }) => restart(id));
  const unsubStop    = bus.on('managed:stop:requested',    ({ id }) => stop(id));

  // ── Spawn ──────────────────────────────────────────────────────────────

  function spawnProcess(entry: ProcessEntry): void {
    const { state } = entry;

    const child = spawn(state.command, state.args, {
      cwd: state.cwd ?? process.cwd(),
      env: { ...process.env, ...(state.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    entry.child    = child;
    entry.runStart = Date.now();
    entry.intentional = false;

    state.pid       = child.pid ?? null;
    state.status    = 'running';
    state.startedAt = entry.runStart;
    state.exitCode  = null;

    bus.emit('managed:started', { id: state.name, pid: state.pid ?? 0 });
    bus.emit('log:stream:started', { id: state.name, pid: state.pid ?? 0 });

    // ── Stream stdout ──────────────────────────────────────────────────

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) {
          bus.emit('log:line', {
            id: state.name,
            stream: 'stdout',
            line,
            timestamp: Date.now(),
          });
        }
      }
    });

    // ── Stream stderr ──────────────────────────────────────────────────

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) {
          bus.emit('log:line', {
            id: state.name,
            stream: 'stderr',
            line,
            timestamp: Date.now(),
          });
        }
      }
    });

    // ── Exit handler ───────────────────────────────────────────────────

    child.on('exit', (code, signal) => {
      const exitCode = code ?? (signal ? 1 : 0);
      state.exitCode = exitCode;
      entry.child    = null;
      entry.runStart = null;

      bus.emit('log:stream:stopped', { id: state.name, exitCode });

      if (entry.intentional) {
        state.status = 'stopped';
        state.pid    = null;
        bus.emit('managed:stopped', { id: state.name });
        return;
      }

      // Unexpected exit — treat as crash
      state.status = 'crashed';
      state.pid    = null;
      state.restarts++;
      bus.emit('managed:crashed', {
        id:       state.name,
        exitCode,
        restarts: state.restarts,
      });

      if (state.autoRestart) {
        scheduleRestart(entry);
      }
    });
  }

  // ── Back-off restart scheduler ─────────────────────────────────────────

  function scheduleRestart(entry: ProcessEntry): void {
    const { state } = entry;

    // Check if previous run was stable → reset back-off
    const uptime = entry.runStart ? Date.now() - entry.runStart : 0;
    if (uptime >= STABLE_UPTIME_MS) {
      state.restarts = 1; // keep count but reset delay
    }

    const stepIndex = Math.min(state.restarts - 1, BACKOFF_STEPS_MS.length - 1);
    const delayMs   = Math.min(BACKOFF_STEPS_MS[stepIndex] ?? MAX_BACKOFF_MS, MAX_BACKOFF_MS);

    state.status = 'restarting';

    entry.backoffTimer = setTimeout(() => {
      entry.backoffTimer = null;
      spawnProcess(entry);
      bus.emit('managed:restarted', {
        id:       state.name,
        pid:      state.pid ?? 0,
        restarts: state.restarts,
      });
    }, delayMs);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  function startAll(): void {
    for (const entry of entries.values()) {
      spawnProcess(entry);
    }
  }

  function restart(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;

    // Cancel any pending back-off timer
    if (entry.backoffTimer) {
      clearTimeout(entry.backoffTimer);
      entry.backoffTimer = null;
    }

    // Kill current child if running
    if (entry.child) {
      entry.intentional = true; // prevent crash handler from re-triggering
      entry.child.kill('SIGTERM');
    }

    // Brief settle then re-spawn
    setTimeout(() => {
      entry.state.restarts++;
      spawnProcess(entry);
      bus.emit('managed:restarted', {
        id,
        pid:      entry.state.pid ?? 0,
        restarts: entry.state.restarts,
      });
    }, 300);
  }

  function stop(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;

    // Cancel any pending back-off restart
    if (entry.backoffTimer) {
      clearTimeout(entry.backoffTimer);
      entry.backoffTimer = null;
    }

    if (entry.child) {
      entry.intentional = true;
      entry.child.kill('SIGTERM');
    } else {
      // Already dead — just mark stopped
      entry.state.status = 'stopped';
      bus.emit('managed:stopped', { id });
    }
  }

  function stopAll(): void {
    unsubRestart();
    unsubStop();
    for (const [id] of entries) {
      stop(id);
    }
  }

  function getAll(): ManagedProcess[] {
    return [...entries.values()].map(e => ({ ...e.state }));
  }

  function get(id: string): ManagedProcess | undefined {
    const entry = entries.get(id);
    return entry ? { ...entry.state } : undefined;
  }

  return { startAll, restart, stop, stopAll, getAll, get };
}
