// ---------------------------------------------------------------------------
// CPU Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { bus } from '../../core/event-bus.ts';
import { getCpuMetrics } from '../../core/state-manager.ts';
import type { CpuMetrics } from '../../types/metrics.types.ts';
import { formatPercent, colorPercent } from '../../utils/formatters.ts';

interface BarRowProps {
  label: string;
  usage: number;
  barWidth: number;
}

function BarRow({ label, usage, barWidth }: BarRowProps): React.ReactElement {
  const filled = Math.round((Math.min(100, Math.max(0, usage)) / 100) * barWidth);
  const empty  = barWidth - filled;
  const color  = colorPercent(usage);
  return (
    <Box flexDirection="row">
      <Text> {label.padEnd(8)} </Text>
      <Text color={color}>{'█'.repeat(filled)}</Text><Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> </Text>
      <Text color={color}>{formatPercent(usage)}</Text>
    </Box>
  );
}

export function CpuPanel(): React.ReactElement {
  const { stdout } = useStdout();
  const [metrics, setMetrics] = useState<CpuMetrics | null>(getCpuMetrics);

  useEffect(() => {
    const unsub = bus.on('metrics:cpu:updated', setMetrics);
    return unsub;
  }, []);

  // ~34% of terminal width minus borders/label/padding
  const barWidth = Math.max(10, Math.floor((stdout.columns ?? 80) * 0.34) - 22);

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
    >
      <Text color="cyan" bold> CPU </Text>
      {metrics === null ? (
        <Text color="gray"> Collecting…</Text>
      ) : (
        <>
          <BarRow label="Overall" usage={metrics.usage} barWidth={barWidth} />
          <Text> </Text>
          {metrics.cores.slice(0, 8).map(core => (
            <BarRow key={core.index} label={`Core ${core.index}`} usage={core.usage} barWidth={barWidth} />
          ))}
          {metrics.cores.length > 8 && (
            <Text color="gray">   ... +{metrics.cores.length - 8} cores</Text>
          )}
          <Text> </Text>
          <Text color="gray"> Model: {metrics.model}</Text>
        </>
      )}
    </Box>
  );
}
