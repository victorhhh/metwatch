// ---------------------------------------------------------------------------
// CLI argument router
//
// Dispatches to the appropriate command handler based on the first positional
// argument in process.argv. Uses the built-in `parseArgs` from 'util' for
// top-level flags; each subcommand parses its own flags independently.
//
// Subcommand dispatch table:
//   (none) / monitor  → open TUI, no managed processes
//   start <file>      → launch managed process + open TUI
//   list              → print managed process table
//   logs <name>       → print / tail buffered logs
//   stop <name|all>   → stop managed process(es)
//   help [cmd]        → print help
// ---------------------------------------------------------------------------

import { parseArgs } from 'util';
import {
  HELP_ROOT,
  HELP_START,
  HELP_LIST,
  HELP_LOGS,
  HELP_STOP,
} from './help.ts';
import { runMonitor }  from './commands/monitor.ts';
import { runStart }    from './commands/start.ts';
import { runList }     from './commands/list.ts';
import { runLogs }     from './commands/logs.ts';
import { runStop }     from './commands/stop.ts';

// Top-level flags only (--help / --version).
// Subcommand flags are parsed inside each command module.
const { values: topFlags, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help:    { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
  strict: false,
});

if (topFlags.version) {
  // Version is injected at publish time; fall back to package.json read.
  try {
    const { readFileSync } = await import('fs');
    const { resolve }      = await import('path');
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dir, '../../package.json'), 'utf-8')
    ) as { version?: string };
    console.log(`metwatch ${pkg.version ?? '0.0.0'}`);
  } catch {
    console.log('metwatch 0.0.0');
  }
  process.exit(0);
}

const [subcommand, ...subArgs] = positionals;

if (topFlags.help && !subcommand) {
  console.log(HELP_ROOT);
  process.exit(0);
}

if (topFlags.help && subcommand) {
  const helpMap: Record<string, string> = {
    start:   HELP_START,
    list:    HELP_LIST,
    logs:    HELP_LOGS,
    stop:    HELP_STOP,
    monitor: 'Usage: mw monitor\n\nOpen the TUI dashboard in read-only (observe) mode.\n',
  };
  console.log(helpMap[subcommand] ?? HELP_ROOT);
  process.exit(0);
}

switch (subcommand) {
  case undefined:
  case 'monitor':
    await runMonitor();
    break;

  case 'start':
    await runStart(subArgs);
    break;

  case 'list':
    runList();
    break;

  case 'logs':
    runLogs(subArgs);
    break;

  case 'stop':
    runStop(subArgs);
    break;

  case 'help': {
    const helpMap: Record<string, string> = {
      start:   HELP_START,
      list:    HELP_LIST,
      logs:    HELP_LOGS,
      stop:    HELP_STOP,
    };
    const target = subArgs[0];
    console.log(target && helpMap[target] ? helpMap[target] : HELP_ROOT);
    break;
  }

  default:
    console.error(`Unknown command: "${subcommand}"\n`);
    console.log(HELP_ROOT);
    process.exit(1);
}
