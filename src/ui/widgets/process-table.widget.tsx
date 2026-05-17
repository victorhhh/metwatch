// ---------------------------------------------------------------------------
// Process Table Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { bus } from '../../core/event-bus.ts';
import { getProcesses } from '../../core/state-manager.ts';
import type { ProcessInfo, ProcessList, ProcessViewMode, ProcessSortKey } from '../../types/process.types.ts';
import type { ResolvedConfig } from '../../types/config.types.ts';
import type { ManagedProcess } from '../../types/managed-process.types.ts';
import { formatBytes, formatPercent, formatUptime, truncate } from '../../utils/formatters.ts';

interface ProcessTableProps {
  config:         ResolvedConfig;
  getManagedById: (id: string) => ManagedProcess | undefined;
  managedNames:   Set<string>;
  isFocused:      boolean;
}

const STATUS_BADGE: Record<string, string> = {
  running:    '● ',
  restarting: '↻ ',
  crashed:    '✕ ',
  stopped:    '■ ',
};

function uptime(p: ProcessInfo): string {
  if (!p.startedAt) return '—';
  return formatUptime(Math.floor((Date.now() - p.startedAt) / 1000));
}

const COL_WIDTHS = [7, 22, 7, 10, 6, 10, 5, 11] as const;
const HEADERS    = ['PID', 'NAME', 'CPU%', 'MEM', 'MEM%', 'USER', 'THR', 'STATUS'];

function ProcessRow({ p, managed, isManaged, selected }: {
  p: ProcessInfo;
  managed?: ManagedProcess;
  isManaged: boolean;
  selected: boolean;
}): React.ReactElement {
  const badge  = managed ? (STATUS_BADGE[managed.status] ?? '') : '  ';
  const name   = badge + truncate(p.name, 19);
  const status = managed
    ? `${managed.status}${managed.restarts > 0 ? ` ×${managed.restarts}` : ''}`
    : p.status;

  const cells = [
    String(p.pid).padEnd(COL_WIDTHS[0]),
    name.padEnd(COL_WIDTHS[1]),
    formatPercent(p.cpu).padEnd(COL_WIDTHS[2]),
    formatBytes(p.memory).padEnd(COL_WIDTHS[3]),
    formatPercent(p.memoryPercent).padEnd(COL_WIDTHS[4]),
    truncate(p.user || '—', 10).padEnd(COL_WIDTHS[5]),
    String(p.threads || 1).padEnd(COL_WIDTHS[4]),
    status.padEnd(COL_WIDTHS[7]),
  ];

  const line = ' ' + cells.join(' ');

  let color: string | undefined;
  if (isManaged)   color = 'cyan';
  else if (p.cpu >= 50) color = 'red';
  else if (p.cpu >= 20) color = 'yellow';

  return (
    <Text inverse={selected} color={color}>{line}</Text>
  );
}

export function ProcessTablePanel({ config, getManagedById, managedNames, isFocused }: ProcessTableProps): React.ReactElement {
  const [viewMode, setViewMode]   = useState<ProcessViewMode>('all');
  const [sortKey, setSortKey]     = useState<ProcessSortKey>('cpu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [list, setList]           = useState<ProcessList>([]);
  const [flash, setFlash]         = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);

  // Patterns (rebuilt when managedNames changes)
  const watchedPatterns = config.watchedProcesses.map(w => w.name.toLowerCase());
  const managedPatterns = [...managedNames].map(n => n.toLowerCase());

  const buildList = useCallback((raw: ProcessList, mode: ProcessViewMode, sort: ProcessSortKey): ProcessList => {
    let filtered = mode === 'all' ? raw : raw.filter(p => {
      const name = p.name.toLowerCase();
      return watchedPatterns.some(pat => name.includes(pat))
          || managedPatterns.some(m   => name.includes(m));
    });
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'cpu':    return b.cpu    - a.cpu;
        case 'memory': return b.memory - a.memory;
        case 'name':   return a.name.localeCompare(b.name);
        case 'pid':    return a.pid    - b.pid;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, sortKey, managedNames]);

  useEffect(() => {
    const refresh = (raw: ProcessList): void => {
      const built = buildList(raw, viewMode, sortKey);
      setList(built);
      setSelectedIdx(i => Math.min(i, Math.max(0, built.length - 1)));
    };

    const unsubProc     = bus.on('processes:updated', refresh);
    const unsubStarted  = bus.on('managed:started',  () => refresh(getProcesses()));
    const unsubStopped  = bus.on('managed:stopped',  () => refresh(getProcesses()));
    const unsubCrashed  = bus.on('managed:crashed',  () => refresh(getProcesses()));
    const unsubRestart  = bus.on('managed:restarted',() => refresh(getProcesses()));
    const unsubKill     = bus.on('process:kill:result', ({ pid, success, error }) => {
      const msg = success
        ? `Process ${pid} terminated.`
        : `Kill failed for ${pid}: ${error ?? 'unknown'}`;
      showFlash(msg, success ? 'green' : 'red');
    });

    // Initial fill
    refresh(getProcesses());

    return () => {
      unsubProc(); unsubStarted(); unsubStopped();
      unsubCrashed(); unsubRestart(); unsubKill();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, sortKey, managedNames]);

  function showFlash(msg: string, _color?: string): void {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  useInput((input, key) => {
    if (!isFocused) return;

    // Kill confirm modal intercepts all input
    if (killTarget !== null) {
      if (input.toLowerCase() === 'y') {
        bus.emit('process:kill:requested', { pid: killTarget.pid });
        setKillTarget(null);
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setKillTarget(null);
      }
      return;
    }

    if (input === 'a') { setViewMode('all');     return; }
    if (input === 'f') { setViewMode('watched'); return; }
    if (input === 'c') { setSortKey('cpu');      return; }
    if (input === 'm') { setSortKey('memory');   return; }

    if (key.upArrow || input === 'k') {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx(i => Math.min(list.length - 1, i + 1));
      return;
    }

    if (input === 'K') {
      const proc = list[selectedIdx];
      if (proc) setKillTarget(proc);
      return;
    }

    if (input === 'r') {
      const proc = list[selectedIdx];
      if (proc && managedNames.has(proc.name)) {
        bus.emit('managed:restart:requested', { id: proc.name });
        showFlash(`Restarting ${proc.name}…`);
      }
      return;
    }

    if (input === 's') {
      const proc = list[selectedIdx];
      if (proc && managedNames.has(proc.name)) {
        bus.emit('managed:stop:requested', { id: proc.name });
        showFlash(`Stopping ${proc.name}…`);
      }
      return;
    }
  });

  const { stdout } = useStdout();

  // Cap rows to what fits in the process panel (~30% of terminal height minus chrome rows)
  const panelRows = Math.max(4, Math.floor((stdout.rows ?? 24) * 0.30) - 4);
  const visibleList = list.slice(0, panelRows);

  const hasManagedKeys = managedNames.size > 0;
  const labelHint = hasManagedKeys
    ? ' Processes [a/f c/m ↑↓ K=kill r=restart s=stop] '
    : ' Processes [a/f c/m ↑↓ K=kill] ';
  const title = flash !== null ? ` ${flash} ` : labelHint;

  const headerLine = ' ' + HEADERS.map((h, i) => h.padEnd(COL_WIDTHS[i] ?? 10)).join(' ');

  return (
    <Box
      borderStyle="single"
      borderColor="yellow"
      flexDirection="column"
      flexGrow={1}
      overflow="hidden"
    >
      {/* Title / flash */}
      <Text color="yellow" bold>{title}</Text>

      {/* Mode bar */}
      <Box>
        <Text>{' '}</Text>
        <Text
          inverse={viewMode === 'all'}
          color={viewMode === 'all' ? 'cyan' : 'gray'}
        > ALL </Text>
        <Text> </Text>
        <Text
          inverse={viewMode === 'watched'}
          color={viewMode === 'watched' ? 'cyan' : 'gray'}
        > WATCH </Text>
        <Text color="gray">  sort:{sortKey}</Text>
        {hasManagedKeys && <Text color="gray">  [r]=restart [s]=stop managed</Text>}
      </Box>

      {/* Header */}
      <Text color="cyan" bold>{headerLine}</Text>

      {/* Rows */}
      {list.length === 0 ? (
        <Text color="gray">  No processes found.</Text>
      ) : (
        visibleList.map((p, i) => (
          <ProcessRow
            key={p.pid}
            p={p}
            managed={getManagedById(p.name)}
            isManaged={managedNames.has(p.name)}
            selected={i === selectedIdx}
          />
        ))
      )}

      {/* Kill confirm modal */}
      {killTarget !== null && (
        <Box
          borderStyle="single"
          borderColor="red"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
        >
          <Text color="red" bold> Confirm Kill </Text>
          <Text>Kill "{killTarget.name}" (PID {killTarget.pid})?</Text>
          <Text color="gray">Press <Text color="white" bold>y</Text> to confirm, <Text color="white" bold>n</Text> to cancel</Text>
        </Box>
      )}
    </Box>
  );
}
