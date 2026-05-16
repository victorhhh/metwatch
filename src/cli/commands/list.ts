// ---------------------------------------------------------------------------
// CLI command: list
//
// Prints the current managed process states to stdout as a table.
// Does NOT open the TUI — intended for scripting / quick checks.
//
// If no managed processes are configured or running, prints a notice.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_CONFIG,
  type MetWatchConfig,
  type ResolvedConfig,
} from '../../types/config.types.ts';
import { formatUptime } from '../../utils/formatters.ts';

function loadConfig(): ResolvedConfig {
  const p = resolve(process.cwd(), 'metwatch.config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<MetWatchConfig>;
    return {
      watchedProcesses: parsed.watchedProcesses ?? DEFAULT_CONFIG.watchedProcesses,
      managedProcesses: parsed.managedProcesses ?? DEFAULT_CONFIG.managedProcesses,
      refreshInterval:  Math.max(250, parsed.refreshInterval ?? DEFAULT_CONFIG.refreshInterval),
      maxProcesses:     parsed.maxProcesses     ?? DEFAULT_CONFIG.maxProcesses,
      logScrollback:    parsed.logScrollback    ?? DEFAULT_CONFIG.logScrollback,
      panels:           { ...DEFAULT_CONFIG.panels, ...(parsed.panels ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function runList(): void {
  const config = loadConfig();
  const defs   = config.managedProcesses ?? [];

  if (defs.length === 0) {
    console.log('No managed processes defined in metwatch.config.json.');
    console.log('Use `mw start <file>` to launch a managed process.');
    return;
  }

  const COL = { name: 20, status: 12, pid: 8, restarts: 9, cmd: 30 };
  const header = [
    'NAME'.padEnd(COL.name),
    'STATUS'.padEnd(COL.status),
    'PID'.padEnd(COL.pid),
    'RESTARTS'.padEnd(COL.restarts),
    'COMMAND'.padEnd(COL.cmd),
  ].join('  ');

  const sep = '-'.repeat(header.length);
  console.log(header);
  console.log(sep);

  for (const def of defs) {
    const row = [
      def.name.padEnd(COL.name),
      'stopped'.padEnd(COL.status),      // static — no live state here
      '-'.padEnd(COL.pid),
      '0'.padEnd(COL.restarts),
      `${def.command} ${def.args.join(' ')}`.slice(0, COL.cmd).padEnd(COL.cmd),
    ].join('  ');
    console.log(row);
  }

  console.log();
  console.log('(Static view from config. Open the TUI with `mw` to see live states.)');
}

// Suppress unused import warning for formatUptime — it will be used once
// live IPC is wired in Phase 3. Keep it here so the import stays auditable.
void formatUptime;
