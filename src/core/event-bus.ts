// ---------------------------------------------------------------------------
// Event Bus
//
// A strongly-typed, singleton event bus built on Node's EventEmitter.
// All inter-module communication in MetWatch MUST go through this bus —
// never import one module directly into another to trigger side-effects.
//
// Design rationale:
//   - Generic type parameter on emit/on enforces payload shapes at compile time.
//   - Singleton export means any module can import { bus } without wiring.
//   - The EventMap type is the canonical catalog of all events in the system.
//     Adding a new event = add it here first, then implement producer + consumer.
//
// Event naming convention:  <domain>:<noun>:<verb>
//   e.g.  metrics:cpu:updated  |  process:kill:requested  |  ui:view:toggled
// ---------------------------------------------------------------------------

import { EventEmitter } from 'events';
import type {
  CpuMetrics,
  MemoryMetrics,
  DiskMetrics,
  NetworkMetrics,
  RuntimeMetrics,
} from '../types/metrics.types.ts';
import type { ProcessList, ProcessViewMode } from '../types/process.types.ts';

// ── Event catalog ─────────────────────────────────────────────────────────────
// Every event name and its payload type lives here. The bus is a closed system:
// if the event isn't in this map, it doesn't exist in MetWatch.

export interface EventMap {
  // Metrics
  'metrics:cpu:updated':     CpuMetrics;
  'metrics:memory:updated':  MemoryMetrics;
  'metrics:disk:updated':    DiskMetrics;
  'metrics:network:updated': NetworkMetrics;
  'metrics:runtime:updated': RuntimeMetrics;

  // System processes (observed, not owned)
  'processes:updated':     ProcessList;
  'process:kill:requested': { pid: number };
  'process:kill:result':   { pid: number; success: boolean; error?: string };

  // Managed processes (launched and owned by MetWatch)
  'managed:started':           { id: string; pid: number };
  'managed:stopped':           { id: string };
  'managed:crashed':           { id: string; exitCode: number | null; restarts: number };
  'managed:restarted':         { id: string; pid: number; restarts: number };
  'managed:restart:requested': { id: string };
  'managed:stop:requested':    { id: string };

  // Log streaming (stdout/stderr from managed processes)
  'log:line':           { id: string; stream: 'stdout' | 'stderr'; line: string; timestamp: number };
  'log:stream:started': { id: string; pid: number };
  'log:stream:stopped': { id: string; exitCode: number | null };

  // UI
  'ui:view:toggled':   ProcessViewMode;
  'ui:panel:toggled':  { panel: PanelName; visible: boolean };
  'ui:quit':           undefined;

  // Lifecycle
  'app:error': { source: string; error: Error };
  'app:ready': undefined;
}

/** All panel names that can be toggled on/off */
export type PanelName = 'cpu' | 'memory' | 'disk' | 'network' | 'runtime' | 'processes' | 'logs';

export type EventName = keyof EventMap;

// ── Typed EventEmitter wrapper ────────────────────────────────────────────────

class TypedEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Increase limit to accommodate all widget subscriptions without warnings.
    this.emitter.setMaxListeners(100);
  }

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): () => void {
    this.emitter.on(event, handler);
    // Return unsubscribe function — always clean up in widget destroy()
    return () => this.emitter.off(event, handler);
  }

  once<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.once(event, handler);
  }

  off<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.off(event, handler);
  }

  /** Remove all listeners for a given event. Use sparingly. */
  removeAllListeners<K extends EventName>(event?: K): void {
    this.emitter.removeAllListeners(event);
  }

  listenerCount<K extends EventName>(event: K): number {
    return this.emitter.listenerCount(event);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// One bus for the entire application lifetime.
export const bus = new TypedEventBus();
