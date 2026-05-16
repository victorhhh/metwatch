// ---------------------------------------------------------------------------
// CLI Help Text
// ---------------------------------------------------------------------------

export const HELP_ROOT = `\
MetWatch — terminal process monitoring & management tool

Usage:
  mw [command] [options]

Commands:
  monitor                Open the TUI dashboard (no managed processes)
  start <file>           Run a script as a managed process and open the TUI
  list                   Print managed process states to stdout
  logs <name>            Print buffered logs for a managed process
  stop <name|all>        Stop a managed process (or all)
  help [command]         Show help

Options:
  -h, --help             Show this help message
  -v, --version          Print version

Examples:
  mw                         Open dashboard (same as "mw monitor")
  mw start server.ts         Run server.ts with Bun and watch it in the TUI
  mw start app.py --name api Run app.py with Python, label it "api"
  mw start ./bin --no-restart  Run without auto-restart
  mw list                    Show all managed process states
  mw logs api                Show buffered logs for "api"
  mw logs api --follow       Tail live logs for "api"
  mw stop api                Stop "api"
  mw stop all                Stop all managed processes
`;

export const HELP_START = `\
Usage:
  mw start <file> [options]

Launch a script as a MetWatch-managed process, then open the TUI dashboard.
The runtime is inferred from the file extension unless --runtime is provided.

  .ts / .tsx        → bun
  .js / .mjs / .cjs → node
  .py               → python
  other             → executed directly

Options:
  --name <label>      Display name in the TUI  (default: basename of <file>)
  --runtime <cmd>     Override the inferred runtime executable
  --no-restart        Disable auto-restart on crash
  --cwd <dir>         Working directory for the child process
  --env KEY=VALUE     Set an environment variable (repeatable)

Examples:
  mw start server.ts
  mw start app.py --name api --no-restart
  mw start worker.js --cwd ./workers --env PORT=4000
`;

export const HELP_LIST = `\
Usage:
  mw list

Print the current state of all managed processes to stdout.
Opens the TUI first if not already running (reads live state from the session).

Columns: NAME  PID  STATUS  RESTARTS  UPTIME
`;

export const HELP_LOGS = `\
Usage:
  mw logs <name> [options]

Print buffered stdout/stderr for a managed process.

Options:
  --follow, -f    Tail live output (Ctrl+C to exit)
  --lines <n>     Number of lines to show  (default: 50)

Examples:
  mw logs api
  mw logs api --follow
  mw logs api --lines 100
`;

export const HELP_STOP = `\
Usage:
  mw stop <name|all>

Gracefully stop a managed process (SIGTERM).
Use "all" to stop every managed process.

Examples:
  mw stop api
  mw stop all
`;
