// ---------------------------------------------------------------------------
// State Manager
//
// Single source of truth for the latest system snapshot.
// Widgets NEVER fetch data — they read from state and react to bus events.
//
// This is intentionally NOT a reactive store (no proxies, no signals).
// The event bus handles reactivity. State is just a plain in-memory cache
// so widgets can read the last known value synchronously on first render
// without waiting for the next poll cycle.
// ---------------------------------------------------------------------------

import type {
  CpuMetrics,
  MemoryMetrics,
  SystemMetrics,
  DiskMetrics,
  NetworkMetrics,
  RuntimeMetrics,
} from '../types/metrics.types.ts';
import type { ProcessList } from '../types/process.types.ts';

// ── Internal state (module-scoped, not exported) ──────────────────────────────

let _cpu:        CpuMetrics     | null = null;
let _memory:     MemoryMetrics  | null = null;
let _disk:       DiskMetrics    | null = null;
let _network:    NetworkMetrics | null = null;
let _processes:  ProcessList          = [];
// Runtime metrics keyed by managed process id
const _runtime   = new Map<string, RuntimeMetrics>();

// ── CPU ───────────────────────────────────────────────────────────────────────

export function getCpuMetrics(): CpuMetrics | null    { return _cpu; }
export function updateCpuMetrics(m: CpuMetrics): void { _cpu = m; }

// ── Memory ────────────────────────────────────────────────────────────────────

export function getMemoryMetrics(): MemoryMetrics | null    { return _memory; }
export function updateMemoryMetrics(m: MemoryMetrics): void { _memory = m; }

// ── System (convenience) ──────────────────────────────────────────────────────

export function getSystemMetrics(): SystemMetrics | null {
  if (!_cpu || !_memory) return null;
  return { cpu: _cpu, memory: _memory };
}

// ── Disk ──────────────────────────────────────────────────────────────────────

export function getDiskMetrics(): DiskMetrics | null    { return _disk; }
export function updateDiskMetrics(m: DiskMetrics): void { _disk = m; }

// ── Network ───────────────────────────────────────────────────────────────────

export function getNetworkMetrics(): NetworkMetrics | null    { return _network; }
export function updateNetworkMetrics(m: NetworkMetrics): void { _network = m; }

// ── Processes ─────────────────────────────────────────────────────────────────

export function getProcesses(): ProcessList             { return _processes; }
export function updateProcesses(list: ProcessList): void { _processes = list; }

// ── Runtime (per managed process) ─────────────────────────────────────────────

export function getRuntimeMetrics(id: string): RuntimeMetrics | null {
  return _runtime.get(id) ?? null;
}

export function getAllRuntimeMetrics(): RuntimeMetrics[] {
  return [..._runtime.values()];
}

export function updateRuntimeMetrics(m: RuntimeMetrics): void {
  _runtime.set(m.managedId, m);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function resetState(): void {
  _cpu       = null;
  _memory    = null;
  _disk      = null;
  _network   = null;
  _processes = [];
  _runtime.clear();
}
