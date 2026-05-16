// ---------------------------------------------------------------------------
// Config Types
// Shape of metwatch.config.json. Loaded once at startup; changes require
// restart. The config is intentionally flat and simple — no nested schemas.
// ---------------------------------------------------------------------------

import type { ManagedProcessDef } from './managed-process.types.ts';
import type { PanelName }         from '../core/event-bus.ts';

export interface WatchedProcess {
  /** Process name to match (substring match against ProcessInfo.name) */
  name: string;
  /** Optional display label override shown in the Watched view */
  label?: string;
}

/**
 * Controls which panels are visible by default.
 * Missing keys default to true (all panels shown on first launch).
 * User can toggle panels with keyboard shortcuts at runtime.
 */
export type PanelVisibility = Partial<Record<PanelName, boolean>>;

export interface MetWatchConfig {
  /**
   * Processes to highlight in the "Watched" view (f key).
   * If empty, the watched view will show nothing until the user adds entries.
   */
  watchedProcesses: WatchedProcess[];
  /**
   * Polling interval in milliseconds.
   * Minimum: 250ms. Default: 1000ms.
   */
  refreshInterval: number;
  /**
   * Maximum number of processes to display in the "All" view.
   * Sorted by CPU descending before truncation. Default: 50.
   */
  maxProcesses: number;
  /**
   * Processes that MetWatch should launch and manage (like PM2).
   * These are started automatically on TUI boot.
   * CLI flags (--run) are merged in at runtime and take precedence.
   */
  managedProcesses: ManagedProcessDef[];
  /**
   * Number of log lines to keep in the circular buffer per managed process.
   * Default: 500.
   */
  logScrollback: number;
  /**
   * Which panels are visible on startup.
   * All panels default to visible if this key is omitted.
   * Example: { "disk": false, "runtime": false }
   */
  panels: PanelVisibility;
}

/** Resolved config — all fields guaranteed (defaults merged in) */
export type ResolvedConfig = Required<MetWatchConfig>;

export const DEFAULT_CONFIG: ResolvedConfig = {
  watchedProcesses: [],
  refreshInterval:  1000,
  maxProcesses:     50,
  managedProcesses: [],
  logScrollback:    500,
  panels: {
    cpu:       true,
    memory:    true,
    disk:      true,
    network:   true,
    runtime:   true,
    processes: true,
    logs:      true,
  },
};
