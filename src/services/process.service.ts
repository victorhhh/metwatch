// ---------------------------------------------------------------------------
// Process Service
//
// Fetches and normalizes the process list using systeminformation.
// Maps raw si data to the canonical ProcessInfo shape — including the
// Phase 2 extended fields: user, threads, handles.
// ---------------------------------------------------------------------------

import si from 'systeminformation';
import type { ProcessInfo, ProcessList, ProcessStatus } from '../types/process.types.ts';
import { getMemoryMetrics } from '../core/state-manager.ts';

function mapStatus(raw: string): ProcessStatus {
  switch (raw.toLowerCase()) {
    case 'running': return 'running';
    case 'sleeping':
    case 'sleep': return 'sleeping';
    case 'stopped': return 'stopped';
    case 'zombie': return 'zombie';
    default: return 'unknown';
  }
}

/**
 * Partial selection sort — O(n * limit) but avoids copying the entire list
 * and sorting it when limit << n. For limit=50, n=1000 → 50k comparisons vs
 * 10k for a full sort but saves the O(n) spread allocation.
 * For larger limits a min-heap approach would be O(n log limit); given our
 * default maxProcesses=50 the simple selection is fast enough and GC-friendly.
 */
function topKByCpu<T extends { cpu: number }>(list: T[], k: number): T[] {
  const n      = list.length;
  const count  = Math.min(k, n);
  // Work on indices to avoid object allocations
  const result: T[] = [];

  // Track which indices have already been picked
  const used = new Uint8Array(n);

  for (let i = 0; i < count; i++) {
    let bestIdx = -1;
    let bestCpu = -1;
    for (let j = 0; j < n; j++) {
      if (!used[j] && list[j]!.cpu > bestCpu) {
        bestCpu = list[j]!.cpu;
        bestIdx = j;
      }
    }
    if (bestIdx === -1) break;
    used[bestIdx] = 1;
    result.push(list[bestIdx]!);
  }

  return result;
}

export async function fetchProcessList(limit = 100): Promise<ProcessList> {
  const { list } = await si.processes();

  // Top-K by CPU — avoids full O(n log n) sort + O(n) spread for large process lists.
  const top = topKByCpu(list, limit);

  const totalMem = getMemoryMetrics()?.total ?? (await si.mem()).total;

  return top.map((p): ProcessInfo => ({
    pid:           p.pid,
    name:          p.name    || 'unknown',
    command:       p.command || p.name || '',
    cpu:           Math.round((p.cpu    ?? 0) * 10) / 10,
    memory:        p.memRss  ?? 0,
    memoryPercent: totalMem > 0
      ? Math.round(((p.memRss ?? 0) / totalMem) * 1000) / 10
      : 0,
    status:    mapStatus(p.state      ?? ''),
    // Avoid Date construction: use numeric check first, then Date.parse as fallback.
    startedAt: p.started
      ? (typeof p.started === 'number' ? p.started : Date.parse(p.started as string) || null)
      : null,
    ppid:      p.parentPid   ?? null,
    // ── Extended (Phase 2) ──────────────────────────────────────────────────
    user:      (p as unknown as { user?: string }).user      ?? '',
    threads:   (p as unknown as { threads?: number }).threads ?? 1,
    handles:   (p as unknown as { fd?: number }).fd          ?? 0,
  }));
}
