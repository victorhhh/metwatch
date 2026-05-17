// ---------------------------------------------------------------------------
// App — Top-level ink/React component
//
// Owns:
//   - Panel visibility state (collapsible layout)
//   - Global keyboard bindings (q, ?, d, n, R, p, l)
//   - Help overlay
//   - Focus management (process table vs logs panel)
// ---------------------------------------------------------------------------

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { ResolvedConfig } from '../types/config.types.ts';
import type { LauncherHandle } from '../core/launcher.ts';
import type { LogManagerHandle } from '../core/log-manager.ts';
import { CpuPanel }          from './widgets/cpu.widget.tsx';
import { MemoryPanel }       from './widgets/memory.widget.tsx';
import { DiskPanel }         from './widgets/disk.widget.tsx';
import { NetworkPanel }      from './widgets/network.widget.tsx';
import { RuntimePanel }      from './widgets/runtime.widget.tsx';
import { ProcessTablePanel } from './widgets/process-table.widget.tsx';
import { LogsPanel }         from './widgets/logs.widget.tsx';

interface AppProps {
  config:     ResolvedConfig;
  launcher:   LauncherHandle | null;
  logManager: LogManagerHandle | null;
  onQuit:     () => void;
}

type FocusTarget = 'processes' | 'logs';

const HELP_CONTENT = `
  Navigation
  ↑ / k       Move process selection up
  ↓ / j       Move process selection down

  View
  a           Process table: All mode
  f           Process table: Watched mode
  c / m       Sort by CPU / Memory

  Panel Toggles
  d           Toggle Disk panel
  n           Toggle Network panel
  R           Toggle Runtime panel
  p           Toggle Process panel

  Actions
  K           Kill selected process
  r           Restart managed process
  s           Stop managed process
  l           Focus log panel
  Escape      Unfocus log panel
  q / Ctrl+C  Quit
  ?           Close this help
`.trim();

export function App({ config, launcher, logManager, onQuit }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const panels = config.panels;

  const [visible, setVisible] = useState({
    disk:      panels.disk      !== false,
    network:   panels.network   !== false,
    runtime:   panels.runtime   !== false,
    processes: panels.processes !== false,
    logs:      panels.logs      !== false,
  });

  const [showHelp, setShowHelp]     = useState(false);
  const [focused, setFocused]       = useState<FocusTarget>('processes');

  const toggle = useCallback((key: keyof typeof visible): void => {
    setVisible(v => ({ ...v, [key]: !v[key] }));
  }, []);

  const quit = useCallback((): void => {
    onQuit();
    exit();
  }, [onQuit, exit]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { quit(); return; }
    if (input === 'q') { quit(); return; }
    if (input === '?') { setShowHelp(s => !s); return; }
    if (input === 'd') { toggle('disk');      return; }
    if (input === 'n') { toggle('network');   return; }
    if (input === 'R') { toggle('runtime');   return; }
    if (input === 'p') { toggle('processes'); return; }
    if (input === 'l') { setFocused('logs');  return; }
    if (key.escape && focused === 'logs') { setFocused('processes'); return; }
  });

  const managedNames = new Set<string>(launcher ? launcher.getAll().map(p => p.name) : []);
  const getManagedById = (id: string) => launcher?.get(id);

  const nullLogManager: LogManagerHandle = {
    getLines:   () => [],
    getAllLines: () => [],
    clearLines: () => undefined,
    destroy:    () => undefined,
  };

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Row A: CPU + Memory + (Disk) — fixed height ~20% */}
      <Box flexDirection="row" height="20%" flexShrink={0}>
        <CpuPanel />
        <MemoryPanel />
        {visible.disk && <DiskPanel />}
      </Box>

      {/* Row B: Network + Runtime — ~24% if either visible */}
      {(visible.network || visible.runtime) && (
        <Box flexDirection="row" height="24%" flexShrink={0}>
          {visible.network && <NetworkPanel />}
          {visible.runtime && <RuntimePanel />}
        </Box>
      )}

      {/* Row C + D: Processes + Logs — share remaining space */}
      <Box flexDirection="column" flexGrow={1}>
        {visible.processes && (
          <Box height={visible.logs ? "55%" : "100%"}>
            <ProcessTablePanel
              config={config}
              getManagedById={getManagedById}
              managedNames={managedNames}
              isFocused={focused === 'processes'}
            />
          </Box>
        )}
        {visible.logs && (
          <Box height={visible.processes ? "45%" : "100%"}>
            <LogsPanel
              logManager={logManager ?? nullLogManager}
              processCount={managedNames.size}
              isFocused={focused === 'logs'}
            />
          </Box>
        )}
      </Box>

      {/* Help overlay */}
      {showHelp && (
        <Box
          position="absolute"
          borderStyle="single"
          borderColor="white"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          width={54}
        >
          <Text bold> MetWatch — Keybindings </Text>
          <Text> </Text>
          {HELP_CONTENT.split('\n').map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
