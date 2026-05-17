// ---------------------------------------------------------------------------
// Memory Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { bus } from '../../core/event-bus.ts';
import { getMemoryMetrics } from '../../core/state-manager.ts';
import type { MemoryMetrics } from '../../types/metrics.types.ts';
import { formatBytes, formatPercent, colorPercent } from '../../utils/formatters.ts';

export function MemoryPanel(): React.ReactElement {
  const { stdout } = useStdout();
  const [metrics, setMetrics] = useState<MemoryMetrics | null>(getMemoryMetrics);

  useEffect(() => {
    const unsub = bus.on('metrics:memory:updated', setMetrics);
    return unsub;
  }, []);

  const barWidth = Math.max(10, Math.floor((stdout.columns ?? 80) * 0.33) - 22);

  const renderBar = (pct: number): React.ReactElement => {
    const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * barWidth);
    const empty  = barWidth - filled;
    const color  = colorPercent(pct);
    return (
      <Box flexDirection="row">
        <Text> {'RAM'.padEnd(8)} </Text>
        <Text color={color}>{'█'.repeat(filled)}</Text><Text color="gray">{'░'.repeat(empty)}</Text>
        <Text> </Text>
        <Text color={color}>{formatPercent(pct)}</Text>
      </Box>
    );
  };

  return (
    <Box
      borderStyle="single"
      borderColor="magenta"
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
    >
      <Text color="magenta" bold> Memory </Text>
      {metrics === null ? (
        <Text color="gray"> Collecting…</Text>
      ) : (
        <>
          {renderBar(metrics.percent)}
          <Text> </Text>
          <Text> <Text bold>Used  </Text>  : {formatBytes(metrics.used)}</Text>
          <Text> <Text bold>Free  </Text>  : {formatBytes(metrics.free)}</Text>
          <Text> <Text bold>Cached</Text>  : {formatBytes(metrics.cached)}</Text>
          <Text> <Text bold>Total </Text>  : {formatBytes(metrics.total)}</Text>
        </>
      )}
    </Box>
  );
}
