// ---------------------------------------------------------------------------
// Sparkline — simple two-row ASCII throughput chart
//
// Renders two lines of block characters (▁▂▃▄▅▆▇█):
//   Row 1: RX (green)
//   Row 2: TX (red)
//
// Each column = one time sample (oldest left → newest right).
// Height of each character = sample value / maxVal mapped to 8 levels.
// ---------------------------------------------------------------------------

import React from 'react';
import { Box, Text } from 'ink';

// 8-level block chars: index 0 = empty, index 8 = full block
const BLOCKS = ['▁', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

function formatRate(bps: number): string {
  if (bps < 1024)        return `${bps.toFixed(0)} B/s`;
  if (bps < 1_048_576)   return `${(bps / 1024).toFixed(1)} KB/s`;
  if (bps < 1_073_741_824) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  return `${(bps / 1_073_741_824).toFixed(1)} GB/s`;
}

interface SparklineProps {
  /** RX series in bytes/sec (oldest → newest) */
  rxSeries: number[];
  /** TX series in bytes/sec (oldest → newest) */
  txSeries: number[];
  /** Number of columns to display */
  width: number;
  label?: string;
}

function toChars(series: number[], maxVal: number, width: number): string {
  // Pad or trim to exactly `width` samples
  const padded = series.length >= width
    ? series.slice(-width)
    : [...new Array(width - series.length).fill(0) as number[], ...series];

  return padded
    .map(v => {
      if (maxVal <= 0) return BLOCKS[0];
      const idx = Math.min(8, Math.round((v / maxVal) * 8));
      return BLOCKS[idx] ?? BLOCKS[8];
    })
    .join('');
}

export function Sparkline({ rxSeries, txSeries, width, label }: SparklineProps): React.ReactElement {
  const maxVal = Math.max(...rxSeries, ...txSeries, 1);
  const rxChars = toChars(rxSeries, maxVal, width);
  const txChars = toChars(txSeries, maxVal, width);

  const currentRx = rxSeries.at(-1) ?? 0;
  const currentTx = txSeries.at(-1) ?? 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {label !== undefined && <Text color="magenta" bold> {label} </Text>}
      <Box flexDirection="row" gap={1}>
        <Text color="green" bold>↓RX</Text>
        <Text color="green">{formatRate(currentRx)}</Text>
        <Text color="red" bold>↑TX</Text>
        <Text color="red">{formatRate(currentTx)}</Text>
        <Text color="gray">max:{formatRate(maxVal)}</Text>
      </Box>
      <Box flexGrow={1} />
      <Text color="green">{rxChars}</Text>
      <Text color="red">{txChars}</Text>
      <Text color="gray">{'─'.repeat(width)}</Text>
    </Box>
  );
}

// ── RingBuffer ────────────────────────────────────────────────────────────────
// Re-exported for use in network.widget.tsx

export class RingBuffer {
  private readonly buf: number[];
  private head = 0;
  readonly length: number;

  constructor(size: number) {
    this.length = size;
    this.buf = new Array(size).fill(0) as number[];
  }

  push(value: number): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.length;
  }

  toArray(): number[] {
    const out = new Array(this.length) as number[];
    for (let i = 0; i < this.length; i++) {
      out[i] = this.buf[(this.head + i) % this.length]!;
    }
    return out;
  }

  max(): number {
    let m = 0;
    for (const v of this.buf) { if (v > m) m = v; }
    return m;
  }
}
