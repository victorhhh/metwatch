// ---------------------------------------------------------------------------
// Bootstrap — MetWatch entry point
//
// Initialization order:
//   1. Load config
//   2. Create blessed screen
//   3. Create launcher + log-manager + runtime-manager (if managed procs)
//   4. Wire launcher → runtime-manager (register inspector on start)
//   5. Build layout (widgets register bus subscriptions)
//   6. Start metrics + process managers
//   7. Launcher starts all managed processes
//   8. Register global keybindings + signal handlers
//   9. First screen render
//
// Teardown (quit):
//   1. Stop polling managers + runtime-manager
//   2. Stop all managed processes
//   3. Destroy layout (widgets unsubscribe)
//   4. Destroy screen (restore terminal)
//   5. process.exit(0)
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import { createScreen, destroyScreen }      from './src/ui/screen.ts';
import { buildLayout }                       from './src/ui/layout.ts';
import { createMetricsManager }              from './src/core/metrics-manager.ts';
import { createProcessManager }             from './src/core/process-manager.ts';
import { createLauncher }                   from './src/core/launcher.ts';
import { createLogManager }                 from './src/core/log-manager.ts';
import { createRuntimeManager }             from './src/core/runtime-manager.ts';
import { bus }                               from './src/core/event-bus.ts';
import {
  DEFAULT_CONFIG,
  type MetWatchConfig,
  type ResolvedConfig,
} from './src/types/config.types.ts';
import type { ManagedProcessDef }            from './src/types/managed-process.types.ts';

// ── Config loading ──────────────────────────────────────────────────────────

function loadConfig(): ResolvedConfig {
  const configPath = resolve(process.cwd(), 'metwatch.config.json');

  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const raw    = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MetWatchConfig>;
    return {
      watchedProcesses:  parsed.watchedProcesses  ?? DEFAULT_CONFIG.watchedProcesses,
      managedProcesses:  parsed.managedProcesses  ?? DEFAULT_CONFIG.managedProcesses,
      refreshInterval:   Math.max(250, parsed.refreshInterval ?? DEFAULT_CONFIG.refreshInterval),
      maxProcesses:      parsed.maxProcesses      ?? DEFAULT_CONFIG.maxProcesses,
      logScrollback:     parsed.logScrollback     ?? DEFAULT_CONFIG.logScrollback,
      panels: {
        ...DEFAULT_CONFIG.panels,
        ...(parsed.panels ?? {}),
      },
    };
  } catch (err) {
    console.error(`[MetWatch] Failed to parse metwatch.config.json: ${String(err)}`);
    return { ...DEFAULT_CONFIG };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function main(extraDefs: ManagedProcessDef[] = []): Promise<void> {
  const config = loadConfig();

  // Merge managed process defs: config-defined + CLI-supplied
  const configDefs: ManagedProcessDef[] = config.managedProcesses ?? [];
  const cliNames   = new Set(extraDefs.map(d => d.name));
  const mergedDefs = [
    ...configDefs.filter(d => !cliNames.has(d.name)),
    ...extraDefs,
  ];

  const hasManaged = mergedDefs.length > 0;

  const launcher        = hasManaged ? createLauncher(mergedDefs)                    : null;
  const logManager      = hasManaged ? createLogManager(config.logScrollback ?? 500) : null;
  const runtimeManager  = hasManaged ? createRuntimeManager(config.refreshInterval)  : null;

  // Wire launcher events to runtime-manager so we get inspector connections
  // automatically whenever a managed process starts or stops.
  const unsubStarted   = hasManaged ? bus.on('managed:started', ({ id, pid }) => {
    // The launcher appends --inspect=0; the WS URL is reported on stderr.
    // We receive it via the log:line event below.
    void id; void pid;
  }) : () => undefined;

  // Parse inspector URL from log lines (Node/Bun print it to stderr on start)
  const inspectorUrls = new Map<string, string>();
  const unsubLogLine  = hasManaged ? bus.on('log:line', ({ id, stream, line }) => {
    if (stream !== 'stderr') return;
    // e.g.: "Debugger listening on ws://127.0.0.1:9229/uuid"
    const m = line.match(/Debugger listening on (ws:\/\/[^\s]+)/);
    if (m && m[1] && !inspectorUrls.has(id)) {
      inspectorUrls.set(id, m[1]);
      // Find the pid from the latest managed:started event via launcher
      const proc = launcher?.get(id);
      if (proc?.pid) {
        runtimeManager?.register(id, proc.pid, m[1]);
      }
    }
  }) : () => undefined;

  const unsubStopped  = hasManaged ? bus.on('managed:stopped', ({ id }) => {
    runtimeManager?.unregister(id);
    inspectorUrls.delete(id);
  }) : () => undefined;

  const unsubCrashed  = hasManaged ? bus.on('managed:crashed', ({ id }) => {
    runtimeManager?.unregister(id);
    inspectorUrls.delete(id);
  }) : () => undefined;

  const screen = createScreen();
  const layout = buildLayout({ screen, config, launcher, logManager });

  const metricsManager = createMetricsManager({ intervalMs: config.refreshInterval });
  const processManager = createProcessManager(config);

  metricsManager.start();
  processManager.start();

  // Start managed processes after widgets are ready
  launcher?.startAll();

  // ── Global keybindings ────────────────────────────────────────────────────

  function quit(): void {
    bus.emit('ui:quit', undefined);
    metricsManager.stop();
    processManager.stop();
    runtimeManager?.stop();
    launcher?.stopAll();
    logManager?.destroy();
    unsubStarted();
    unsubLogLine();
    unsubStopped();
    unsubCrashed();
    layout.destroy();
    destroyScreen();
    process.exit(0);
  }

  screen.key(['q', 'C-c'], quit);

  // ── Error handling ────────────────────────────────────────────────────────

  bus.on('app:error', ({ source, error }) => {
    void source;
    void error;
  });

  // ── First render ──────────────────────────────────────────────────────────

  screen.render();

  // ── Signal handling ───────────────────────────────────────────────────────

  process.on('SIGTERM', quit);
  process.on('uncaughtException', (err) => {
    destroyScreen();
    console.error('[MetWatch] Uncaught exception:', err);
    process.exit(1);
  });
}

await main();
