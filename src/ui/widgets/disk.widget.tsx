// ---------------------------------------------------------------------------
// Disk Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { bus } from '../../core/event-bus.ts';
import { getDiskMetrics } from '../../core/state-manager.ts';
import type { DiskMetrics, DiskMount } from '../../types/metrics.types.ts';
import { formatBytes, colorPercent, truncate } from '../../utils/formatters.ts';

function formatRate(bps: number): string {
  if (bps < 1024)        return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function MountRow({ m }: { m: DiskMount }): React.ReactElement {
  const barWidth = 10;
  const filled   = Math.round((Math.min(100, m.percent) / 100) * barWidth);
  const empty    = barWidth - filled;
  const barColor = m.percent >= 90 ? 'red' : m.percent >= 75 ? 'yellow' : 'green';
  const pctColor = colorPercent(m.percent);

  return (
    <Box>
      <Text> [</Text>
      <Text color={barColor}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text>] </Text>
      <Text>{truncate(m.fs, 14)}  </Text>
      <Text color="gray">{truncate(m.mount, 12)}  </Text>
      <Text color="gray">{truncate(m.type, 6)}  </Text>
      <Text>{formatBytes(m.used, 0)}/{formatBytes(m.total, 0)}  </Text>
      <Text color={pctColor}>{m.percent.toFixed(1)}%</Text>
    </Box>
  );
}

export function DiskPanel(): React.ReactElement {
  const [metrics, setMetrics] = useState<DiskMetrics | null>(getDiskMetrics);

  useEffect(() => {
    const unsub = bus.on('metrics:disk:updated', setMetrics);
    return unsub;
  }, []);

  return (
    <Box
      borderStyle="single"
      borderColor="blue"
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      overflow="hidden"
    >
      <Text color="blue" bold> Disk [d=toggle] </Text>
      {metrics === null ? (
        <Text color="gray"> Collecting disk metrics…</Text>
      ) : (
        <>
          <Box>
            <Text bold> IO:  </Text>
            <Text color="green">↓ {formatRate(metrics.totalReadBytesPerSec).padEnd(12)}</Text>
            <Text>  </Text>
            <Text color="red">↑ {formatRate(metrics.totalWriteBytesPerSec)}</Text>
          </Box>
          <Text> </Text>
          {metrics.mounts.length === 0 ? (
            <Text color="gray">  No mounted filesystems detected.</Text>
          ) : (
            <>
              <Box>
                <Text color="cyan" bold> DEVICE         MOUNT        TYPE    USED / TOTAL     USE%</Text>
              </Box>
              {metrics.mounts.map((m, i) => (
                <MountRow key={i} m={m} />
              ))}
            </>
          )}
        </>
      )}
    </Box>
  );
}
