// ---------------------------------------------------------------------------
// Network Widget — ink/React
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { bus } from '../../core/event-bus.ts';
import { getNetworkMetrics } from '../../core/state-manager.ts';
import type { NetworkMetrics, NetworkInterface } from '../../types/metrics.types.ts';
import { truncate } from '../../utils/formatters.ts';
import { Sparkline, RingBuffer } from './sparkline.tsx';

const HISTORY_LEN = 60;

function fmtRate(bps: number): string {
  if (bps < 1024)          return `${bps.toFixed(0)} B/s`;
  if (bps < 1_048_576)     return `${(bps / 1024).toFixed(1)} KB/s`;
  if (bps < 1_073_741_824) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  return `${(bps / 1_073_741_824).toFixed(1)} GB/s`;
}

function IfaceRow({ iface }: { iface: NetworkInterface }): React.ReactElement {
  const stateColor = iface.operstate === 'up' ? 'green' : iface.operstate === 'down' ? 'red' : 'gray';
  const stateChar  = iface.operstate === 'up' ? '▲' : iface.operstate === 'down' ? '▼' : '?';
  const errors = iface.rxErrors + iface.txErrors;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <Text color={stateColor}>{stateChar} </Text>
        <Text bold>{truncate(iface.iface, 12)}</Text>
      </Box>
      <Text>  {truncate(iface.ip4 || iface.ip6 || '—', 15)}</Text>
      <Box flexDirection="row">
        <Text>  </Text><Text color="green">↓ {fmtRate(iface.rxBytesPerSec)}</Text>
      </Box>
      <Box flexDirection="row">
        <Text>  </Text><Text color="red">↑ {fmtRate(iface.txBytesPerSec)}</Text>
      </Box>
      {errors > 0 && (
        <Box flexDirection="row"><Text>  </Text><Text color="red">err:{errors}</Text></Box>
      )}
    </Box>
  );
}

export function NetworkPanel(): React.ReactElement {
  const { stdout } = useStdout();
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(getNetworkMetrics);

  // Ring buffers persist across re-renders via refs
  const rxHistory = useRef(new RingBuffer(HISTORY_LEN));
  const txHistory = useRef(new RingBuffer(HISTORY_LEN));

  // Arrays derived from ring buffers — updated on each metrics tick
  const [rxSeries, setRxSeries] = useState<number[]>(() => rxHistory.current.toArray());
  const [txSeries, setTxSeries] = useState<number[]>(() => txHistory.current.toArray());

  useEffect(() => {
    const unsub = bus.on('metrics:network:updated', (m) => {
      setMetrics(m);
      rxHistory.current.push(m.totalRxBytesPerSec);
      txHistory.current.push(m.totalTxBytesPerSec);
      setRxSeries(rxHistory.current.toArray());
      setTxSeries(txHistory.current.toArray());
    });
    return unsub;
  }, []);

  // Chart takes 72% of the network row; subtract borders, padding, Y-label space
  const totalCols  = stdout.columns ?? 80;
  const chartCols  = Math.max(20, Math.floor(totalCols * 0.55 * 0.72) - 4);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Left: interfaces panel */}
      <Box
        borderStyle="single"
        borderColor="magenta"
        flexDirection="column"
        width="28%"
        paddingX={1}
        overflow="hidden"
      >
        <Text color="magenta" bold> Interfaces </Text>
        {metrics === null ? (
          <Text color="gray">Collecting…</Text>
        ) : (
          <>
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>Total</Text>
              <Box flexDirection="row">
                <Text color="green">↓ {fmtRate(metrics.totalRxBytesPerSec)}</Text>
              </Box>
              <Box flexDirection="row">
                <Text color="red">↑ {fmtRate(metrics.totalTxBytesPerSec)}</Text>
              </Box>
            </Box>
            {metrics.interfaces.length === 0 ? (
              <Text color="gray">No interfaces</Text>
            ) : (
              metrics.interfaces.map((iface, i) => <IfaceRow key={i} iface={iface} />)
            )}
          </>
        )}
      </Box>

      {/* Right: sparkline throughput chart */}
      <Box
        borderStyle="single"
        borderColor="magenta"
        flexDirection="column"
        flexGrow={1}
        paddingX={1}
      >
        <Sparkline
          rxSeries={rxSeries}
          txSeries={txSeries}
          width={chartCols}
          label="Throughput [n=toggle]"
        />
      </Box>
    </Box>
  );
}
