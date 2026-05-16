// ---------------------------------------------------------------------------
// System Service
//
// Pure async functions that fetch raw data from systeminformation and
// normalize it into MetWatch domain types. This is the ONLY place in the
// codebase that imports systeminformation. Swap the data source here without
// touching anything else.
//
// All functions are stateless and have no side-effects beyond network/OS I/O.
// ---------------------------------------------------------------------------

import si from 'systeminformation';
import type { CpuMetrics, MemoryMetrics } from '../types/metrics.types.ts';

// Cache CPU model to avoid redundant si.cpu() calls on every tick
let _cpuModelCache: string | null = null;

async function resolveCpuModel(): Promise<string> {
  if (_cpuModelCache) return _cpuModelCache;
  try {
    const info = await si.cpu();
    _cpuModelCache = `${info.manufacturer} ${info.brand}`.trim() || 'Unknown CPU';
  } catch {
    _cpuModelCache = 'Unknown CPU';
  }
  return _cpuModelCache;
}

// ── CPU ───────────────────────────────────────────────────────────────────────

export async function fetchCpuMetrics(): Promise<CpuMetrics> {
  const [load, model] = await Promise.all([si.currentLoad(), resolveCpuModel()]);

  return {
    usage: Math.round(load.currentLoad * 10) / 10,
    cores: load.cpus.map((core, index) => ({
      index,
      usage: Math.round(core.load * 10) / 10,
    })),
    model,
    coreCount: load.cpus.length,
    timestamp: Date.now(),
  };
}

// ── Memory ────────────────────────────────────────────────────────────────────

export async function fetchMemoryMetrics(): Promise<MemoryMetrics> {
  const mem = await si.mem();

  const used = mem.active; // active is more accurate than total - free
  const percent = mem.total > 0 ? Math.round((used / mem.total) * 1000) / 10 : 0;

  return {
    total: mem.total,
    used,
    free: mem.available,
    percent,
    active: mem.active,
    cached: mem.cached,
    timestamp: Date.now(),
  };
}
