// ---------------------------------------------------------------------------
// Process Service
//
// Fetches and normalizes the process list using systeminformation.
// Maps raw si data to the canonical ProcessInfo shape — including the
// Phase 2 extended fields: user, threads, handles.
// ---------------------------------------------------------------------------

import si from 'systeminformation';
import type { ProcessInfo, ProcessList, ProcessStatus } from '../types/process.types.ts';

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

export async function fetchProcessList(limit = 100): Promise<ProcessList> {
  const { list } = await si.processes();

  // Sort by CPU descending before slicing so we surface the most active
  const sorted = [...list].sort((a, b) => b.cpu - a.cpu);
  const top = sorted.slice(0, limit);

  const totalMem = (await si.mem()).total;

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
    startedAt: p.started ? new Date(p.started).getTime() : null,
    ppid:      p.parentPid   ?? null,
    // ── Extended (Phase 2) ──────────────────────────────────────────────────
    user:      (p as unknown as { user?: string }).user      ?? '',
    threads:   (p as unknown as { threads?: number }).threads ?? 1,
    handles:   (p as unknown as { fd?: number }).fd          ?? 0,
  }));
}
