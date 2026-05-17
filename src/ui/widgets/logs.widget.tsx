// ---------------------------------------------------------------------------
// Logs Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { bus } from '../../core/event-bus.ts';
import type { LogManagerHandle } from '../../core/log-manager.ts';

const MAX_LINES = 500;

interface LogsProps {
  logManager:   LogManagerHandle;
  processCount: number;
  isFocused:    boolean;
}

function fmtTime(ts: number): string {
  const totalSec = Math.floor(ts / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60) % 24;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface LogLine {
  id: string;
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
  kind: 'log' | 'system';
  systemColor?: 'gray' | 'red' | 'yellow';
}

export function LogsPanel({ logManager, processCount, isFocused }: LogsProps): React.ReactElement {
  const { stdout } = useStdout();
  const showPrefix = processCount > 1;

  const [lines, setLines] = useState<LogLine[]>(() => {
    const history = logManager.getAllLines();
    return history.slice(-MAX_LINES).map(l => ({
      id: l.id, stream: l.stream, text: l.line,
      timestamp: l.timestamp, kind: 'log' as const,
    }));
  });

  // Scroll offset: 0 = show tail (auto-scroll), positive = locked at offset from tail
  const [scrollOffset, setScrollOffset] = useState(0);
  const pendingLines = useRef<LogLine[]>([]);
  const flushPending = useRef(false);

  const pushLine = (line: LogLine): void => {
    pendingLines.current.push(line);
    if (!flushPending.current) {
      flushPending.current = true;
      setImmediate(() => {
        flushPending.current = false;
        setLines(prev => {
          const next = [...prev, ...pendingLines.current];
          pendingLines.current = [];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      });
    }
  };

  useEffect(() => {
    const unsubLine = bus.on('log:line', ({ id, stream, line, timestamp }) => {
      pushLine({ id, stream, text: line, timestamp, kind: 'log' });
    });
    const unsubStarted = bus.on('managed:started', ({ id, pid }) => {
      pushLine({ id, stream: 'stdout', text: `── ${id} started (pid ${pid}) ──`, timestamp: Date.now(), kind: 'system', systemColor: 'gray' });
    });
    const unsubCrashed = bus.on('managed:crashed', ({ id, exitCode, restarts }) => {
      pushLine({ id, stream: 'stderr', text: `── ${id} crashed (exit ${exitCode ?? '?'}) — restart #${restarts} scheduled ──`, timestamp: Date.now(), kind: 'system', systemColor: 'red' });
    });
    const unsubRestarted = bus.on('managed:restarted', ({ id, pid, restarts }) => {
      pushLine({ id, stream: 'stdout', text: `── ${id} restarted (pid ${pid}, #${restarts}) ──`, timestamp: Date.now(), kind: 'system', systemColor: 'yellow' });
    });
    const unsubStopped = bus.on('managed:stopped', ({ id }) => {
      pushLine({ id, stream: 'stdout', text: `── ${id} stopped ──`, timestamp: Date.now(), kind: 'system', systemColor: 'gray' });
    });

    return () => {
      unsubLine(); unsubStarted(); unsubCrashed(); unsubRestarted(); unsubStopped();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // How many rows are available for log lines (rough estimate)
  const visibleRows = Math.max(4, Math.floor((stdout.rows ?? 24) * 0.26) - 4);

  // Determine what slice to show
  const total = lines.length;
  const tailStart = Math.max(0, total - visibleRows - scrollOffset);
  const visible = lines.slice(tailStart, tailStart + visibleRows);

  return (
    <Box
      borderStyle="single"
      borderColor="green"
      flexDirection="column"
      flexGrow={1}
      overflow="hidden"
    >
      <Text color="green" bold> Logs [↑↓=scroll when focused]{isFocused ? ' — FOCUSED' : ''} </Text>
      {lines.length === 0 ? (
        <Text color="gray"> Waiting for output from managed processes...</Text>
      ) : (
        visible.map((line, i) => {
          if (line.kind === 'system') {
            return <Text key={i} color={line.systemColor ?? 'gray'}>{fmtTime(line.timestamp)} {line.text}</Text>;
          }
          return (
            <Box key={i}>
              <Text color="gray">{fmtTime(line.timestamp)} </Text>
              {showPrefix && <Text color="cyan">[{line.id}] </Text>}
              <Text color={line.stream === 'stderr' ? 'red' : undefined}>{line.text}</Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
