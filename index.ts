// ---------------------------------------------------------------------------
// Bootstrap — MetWatch entry point
//
// Initialization order:
//   1. Load config
//   2. Create launcher + log-manager + runtime-manager (if managed procs)
//   3. Wire launcher → runtime-manager (register inspector on start)
//   4. Start metrics + process managers
//   5. Launcher starts all managed processes
//   6. Render ink/React app
//   7. Register signal handlers
//
// Teardown (quit):
//   1. Stop polling managers + runtime-manager
//   2. Stop all managed processes
//   3. Unmount ink app
//   4. process.exit(0)
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { render } from 'ink';
import React from 'react';

import { createMetricsManager }  from './src/core/metrics-manager.ts';
import { createProcessManager }  from './src/core/process-manager.ts';
import { createLauncher }        from './src/core/launcher.ts';
import { createLogManager }      from './src/core/log-manager.ts';
import { createRuntimeManager }  from './src/core/runtime-manager.ts';
import { bus }                   from './src/core/event-bus.ts';
import {
  DEFAULT_CONFIG,
  type MetWatchConfig,
  type ResolvedConfig,
} from './src/types/config.types.ts';
import type { ManagedProcessDef } from './src/types/managed-process.types.ts';
import { App } from './src/ui/App.tsx';

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

  // Wire launcher events to runtime-manager
  const inspectorUrls = new Map<string, string>();
  const managedCount  = mergedDefs.length;
  let unsubLogLine: (() => void) | null = null;

  if (hasManaged) {
    unsubLogLine = bus.on('log:line', ({ id, stream, line }) => {
      if (stream !== 'stderr') return;
      if (inspectorUrls.has(id)) return;
      const m = line.match(/Debugger listening on (ws:\/\/[^\s]+)/);
      if (m && m[1]) {
        inspectorUrls.set(id, m[1]);
        const proc = launcher?.get(id);
        if (proc?.pid) {
          runtimeManager?.register(id, proc.pid, m[1]);
        }
        if (inspectorUrls.size >= managedCount && unsubLogLine) {
          unsubLogLine();
          unsubLogLine = null;
        }
      }
    });
  }

  const unsubStopped = hasManaged ? bus.on('managed:stopped', ({ id }) => {
    runtimeManager?.unregister(id);
    inspectorUrls.delete(id);
  }) : () => undefined;

  const unsubCrashed = hasManaged ? bus.on('managed:crashed', ({ id }) => {
    runtimeManager?.unregister(id);
    inspectorUrls.delete(id);
  }) : () => undefined;

  const metricsManager = createMetricsManager({ intervalMs: config.refreshInterval });
  const processManager = createProcessManager(config);

  metricsManager.start();
  processManager.start();

  launcher?.startAll();

  // ── Error handling ────────────────────────────────────────────────────────

  const unsubError = bus.on('app:error', ({ source, error }) => {
    process.stderr.write(`[MetWatch] error [${source}]: ${error.message}\n`);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    process.stderr.write(`[MetWatch] unhandledRejection: ${msg}\n`);
  });

  // ── Teardown ──────────────────────────────────────────────────────────────

  function quit(): void {
    bus.emit('ui:quit', undefined);
    metricsManager.stop();
    processManager.stop();
    runtimeManager?.stop();
    launcher?.stopAll();
    logManager?.destroy();
    unsubLogLine?.();
    unsubStopped();
    unsubCrashed();
    unsubError();
    unmount();
    process.exit(0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const { unmount } = render(
    React.createElement(App, { config, launcher, logManager, onQuit: quit }),
    { exitOnCtrlC: false }
  );

  // ── Signal handling ───────────────────────────────────────────────────────

  process.on('SIGTERM', quit);
  process.on('uncaughtException', (err) => {
    unmount();
    console.error('[MetWatch] Uncaught exception:', err);
    process.exit(1);
  });
}

await main();
