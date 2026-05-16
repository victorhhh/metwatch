// ---------------------------------------------------------------------------
// CLI command: logs
//
// Prints buffered logs for a managed process to stdout.
// With --follow / -f, tails live output until Ctrl+C.
//
// In Phase 2 this reads from the in-process LogManager (same Bun process as
// the TUI). Phase 3 will replace this with a socket-based IPC read.
//
// Usage:
//   mw logs <name> [--follow] [--lines <n>]
// ---------------------------------------------------------------------------

import { HELP_LOGS } from '../help.ts';

interface LogsOptions {
  name:   string;
  follow: boolean;
  lines:  number;
}

export function parseLogsArgs(argv: string[]): LogsOptions | null {
  const [name, ...rest] = argv;
  if (!name) {
    console.error('Error: missing process name.\n');
    console.log(HELP_LOGS);
    return null;
  }

  let follow = false;
  let lines  = 50;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--follow' || arg === '-f') {
      follow = true;
    } else if (arg === '--lines') {
      const n = parseInt(rest[++i] ?? '', 10);
      if (isNaN(n) || n < 1) {
        console.error('Error: --lines must be a positive integer.');
        return null;
      }
      lines = n;
    }
  }

  return { name, follow, lines };
}

/**
 * `mw logs` launched WITHOUT the TUI — reads from a static snapshot.
 *
 * In the current architecture the log buffer only exists inside the TUI
 * process. Until Phase 3 IPC is implemented we print a helpful message
 * directing the user to the TUI.
 */
export function runLogs(argv: string[]): void {
  const opts = parseLogsArgs(argv);
  if (!opts) return;

  // Phase 3 will establish a socket connection to the running TUI process
  // and stream log lines from its LogManager over IPC. For now we inform
  // the user that live logs are visible inside the TUI itself.
  console.log(`[MetWatch] Logs for "${opts.name}" are available in the TUI dashboard.`);
  console.log('  Open the dashboard:  mw');
  console.log('  Then press [l] to focus the Logs panel and scroll with ↑ / ↓.');
  console.log();
  console.log('Phase 3 will add out-of-process `mw logs` support via socket IPC.');
}
