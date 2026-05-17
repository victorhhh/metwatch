// ---------------------------------------------------------------------------
// Formatters
//
// Pure utility functions for display formatting. No imports, no side-effects.
// Every function here is deterministic: same input → same output.
// Used by widgets to convert raw numbers into human-readable strings.
// ---------------------------------------------------------------------------

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

// Hoisted constants — avoid recomputing inside hot-path functions.
const LOG_1024  = Math.log(1024);
const BYTE_DIVS = [1, 1024, 1_048_576, 1_073_741_824, 1_099_511_627_776] as const;

/**
 * Format bytes into the most appropriate human-readable unit.
 * @example formatBytes(1536) → "1.5 KB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const i      = Math.floor(Math.log(bytes) / LOG_1024);
  const capped = Math.min(i, BYTE_UNITS.length - 1);
  const value  = bytes / BYTE_DIVS[capped]!;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[capped]}`;
}

/**
 * Format a 0–100 float as a percentage string.
 * @example formatPercent(73.456) → "73.5%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format uptime in seconds into a human-readable duration.
 * @example formatUptime(3723) → "1h 2m 3s"
 */
export function formatUptime(seconds: number): string {
  if (seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Pad or truncate a string to an exact width.
 * @example truncate('hello world', 8) → "hello..."
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length === maxLen) return str;          // already exact — no allocation
  if (str.length < maxLen)  return str.padEnd(maxLen);
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Build a simple ASCII bar for a 0–100 percentage value.
 * @example bar(60, 10) → "██████    "
 */
export function bar(percent: number, width = 20): string {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width);
  return '█'.repeat(filled) + ' '.repeat(width - filled);
}

/**
 * Return an ink/React color string for a percentage value.
 * green < 60, yellow < 85, red >= 85
 */
export function colorPercent(percent: number): 'red' | 'yellow' | 'green' {
  if (percent >= 85) return 'red';
  if (percent >= 60) return 'yellow';
  return 'green';
}
