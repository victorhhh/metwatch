// ---------------------------------------------------------------------------
// Runtime Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { bus } from '../../core/event-bus.ts';
import { getAllRuntimeMetrics } from '../../core/state-manager.ts';
import type { RuntimeMetrics } from '../../types/metrics.types.ts';
import { formatBytes, formatUptime, colorPercent } from '../../utils/formatters.ts';

function lagColor(ms: number): 'red' | 'yellow' | 'green' {
  if (ms >= 100) return 'red';
  if (ms >= 20)  return 'yellow';
  return 'green';
}

function ProcessRuntime({ m }: { m: RuntimeMetrics }): React.ReactElement {
  const heapPct  = m.heapTotal > 0 ? (m.heapUsed / m.heapTotal) * 100 : 0;
  const barWidth = 16;
  const filled   = Math.round((Math.min(100, heapPct) / 100) * barWidth);
  const empty    = barWidth - filled;
  const barColor = colorPercent(heapPct);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>◈ {m.managedId}</Text>
        <Text color="gray">  pid:{m.pid}  uptime:{formatUptime(m.uptime)}</Text>
      </Box>
      <Box>
        <Text>   Heap [</Text>
        <Text color={barColor}>{'█'.repeat(filled)}</Text>
        <Text color="gray">{'░'.repeat(empty)}</Text>
        <Text>] {formatBytes(m.heapUsed)}/{formatBytes(m.heapTotal)}  </Text>
        <Text color={barColor}>{heapPct.toFixed(1)}%</Text>
      </Box>
      <Text>   RSS: {formatBytes(m.rss)}   External: {formatBytes(m.external)}   ArrayBuf: {formatBytes(m.arrayBuffers)}</Text>
      <Box>
        <Text>   EventLoop Lag: </Text>
        <Text color={lagColor(m.eventLoopLag)}>{m.eventLoopLag.toFixed(1)}ms</Text>
        <Text>   Handles: {m.activeHandles}   Requests: {m.activeRequests}</Text>
      </Box>
      <Text>
        {'   GC: '}{m.gc.count} events   Total: {m.gc.totalPauseMs.toFixed(0)}ms
        {m.gc.lastPauseMs !== null ? `   Last: ${m.gc.lastPauseMs.toFixed(1)}ms` : ''}
      </Text>
    </Box>
  );
}

export function RuntimePanel(): React.ReactElement {
  const [all, setAll] = useState<RuntimeMetrics[]>(getAllRuntimeMetrics);

  useEffect(() => {
    const unsub = bus.on('metrics:runtime:updated', () => {
      setAll(getAllRuntimeMetrics());
    });
    return unsub;
  }, []);

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      overflow="hidden"
    >
      <Text color="cyan" bold> Runtime [R=toggle] </Text>
      {all.length === 0 ? (
        <>
          <Text color="gray"> No runtime metrics yet.</Text>
          <Text color="gray"> Launch a managed process with `mw start &lt;file&gt;` to see Node/Bun internals.</Text>
        </>
      ) : (
        all.map(m => <ProcessRuntime key={m.managedId} m={m} />)
      )}
    </Box>
  );
}
