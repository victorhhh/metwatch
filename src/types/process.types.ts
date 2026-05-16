// ---------------------------------------------------------------------------
// Process Types
// Domain types for process data. ProcessInfo is the normalized shape used
// throughout MetWatch regardless of whether data comes from systeminformation
// or pidusage. Never expose raw library types outside the services layer.
// ---------------------------------------------------------------------------

export type ProcessStatus = 'running' | 'sleeping' | 'stopped' | 'zombie' | 'unknown';

export interface ProcessInfo {
  pid: number;
  /** Human-readable process name */
  name: string;
  /** Full command line with arguments */
  command: string;
  /** CPU usage percentage (0–100, can exceed 100 on multi-core) */
  cpu: number;
  /** Memory usage in bytes (RSS) */
  memory: number;
  /** Memory as a percentage of total RAM (0–100) */
  memoryPercent: number;
  status: ProcessStatus;
  /** Process start time as unix ms, if available */
  startedAt: number | null;
  /** Parent PID */
  ppid: number | null;
  // ── Extended fields (Phase 2) ──────────────────────────────────────────
  /** Username that owns the process (empty string if unavailable) */
  user: string;
  /** Number of threads */
  threads: number;
  /** Open file descriptors / handles */
  handles: number;
}

export type ProcessList = ProcessInfo[];

/** View mode for the process table widget */
export type ProcessViewMode = 'all' | 'watched';

/** Column to sort the process table by */
export type ProcessSortKey = 'cpu' | 'memory' | 'name' | 'pid';

export interface ProcessTableState {
  viewMode: ProcessViewMode;
  sortKey: ProcessSortKey;
  sortDesc: boolean;
  selectedIndex: number;
}
