// ---------------------------------------------------------------------------
// Managed Process Types
//
// A "managed process" is a child process that MetWatch launched and owns —
// distinct from the passive observation of system processes (ProcessInfo).
//
// Lifecycle:
//   ManagedProcessDef  →  created at config / CLI parse time (static intent)
//   ManagedProcess     →  runtime state wrapping the def (mutable, in launcher)
// ---------------------------------------------------------------------------

export type ManagedProcessStatus =
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'restarting';

/**
 * Static definition of a process MetWatch should launch and manage.
 * Comes from metwatch.config.json `managedProcesses[]` or CLI flags.
 */
export interface ManagedProcessDef {
  /** Display label shown in the TUI. Defaults to command basename. */
  name: string;
  /** Executable to run: "bun", "node", "python", etc. */
  command: string;
  /** Arguments passed to the executable. */
  args: string[];
  /**
   * Restart the process automatically on crash.
   * Uses exponential back-off: 1s → 2s → 4s → 8s → 16s → 30s (cap).
   * Counter resets if the process lives > 10s consecutively.
   * Default: true
   */
  autoRestart: boolean;
  /** Working directory for the child process. Defaults to process.cwd(). */
  cwd?: string;
  /** Additional environment variables merged into process.env. */
  env?: Record<string, string>;
}

/**
 * Runtime state for a managed process. Extends the static def with live data.
 * Mutated by the launcher; never mutated by widgets or managers.
 */
export interface ManagedProcess extends ManagedProcessDef {
  pid: number | null;
  status: ManagedProcessStatus;
  /** Total number of times this process has been restarted (crash or manual). */
  restarts: number;
  /** Unix ms when the current (or most recent) run started. */
  startedAt: number | null;
  /** Exit code of the most recent run. null if still running. */
  exitCode: number | null;
}
