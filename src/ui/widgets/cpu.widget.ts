// ---------------------------------------------------------------------------
// CPU Widget
//
// Renders per-core CPU usage as stacked horizontal gauges plus an overall
// usage bar. Subscribes to 'metrics:cpu:updated' events and re-renders.
//
// Layout:
//   ┌─ CPU ──────────────────────────────────┐
//   │ Overall  ████████░░░░░░░░  45.3%        │
//   │ Core 0   ██████░░░░░░░░░░  38.1%        │
//   │ Core 1   █████████░░░░░░░  52.4%        │
//   │ ...                                      │
//   └─────────────────────────────────────────┘
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, Box } from 'blessed';
import { bus } from '../../core/event-bus.ts';
import { getCpuMetrics } from '../../core/state-manager.ts';
import type { CpuMetrics } from '../../types/metrics.types.ts';
import { formatPercent, colorPercent } from '../../utils/formatters.ts';

interface CpuWidgetOptions {
  screen: BlessedScreen;
  top: number | string;
  left: number | string;
  width: number | string;
  height: number | string;
}

interface CpuWidgetHandle {
  box: Box;
  destroy: () => void;
}

export function createCpuWidget(options: CpuWidgetOptions): CpuWidgetHandle {
  const { screen, top, left, width, height } = options;

  const box = blessed.box({
    top,
    left,
    width,
    height,
    label: ' CPU ',
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      label: { fg: 'cyan', bold: true },
    },
    padding: { top: 0, left: 1, right: 1, bottom: 0 },
  });

  screen.append(box as unknown as import('blessed').BlessedElement);

  function renderMetrics(metrics: CpuMetrics): void {
    const innerWidth = (typeof width === 'string' ? box.width : width as number) - 4;
    const barWidth = Math.max(10, innerWidth - 14); // reserve space for label + percent

    function makeLine(label: string, usage: number): string {
      const filled = Math.round((Math.min(100, usage) / 100) * barWidth);
      const empty = barWidth - filled;
      const barColor = usage >= 85 ? '{red-fg}' : usage >= 60 ? '{yellow-fg}' : '{green-fg}';
      const bar = `${barColor}${'█'.repeat(filled)}{/}${'░'.repeat(empty)}`;
      const pct = colorPercent(usage);
      return ` ${label.padEnd(8)} ${bar} ${pct}`;
    }

    const lines: string[] = [
      makeLine('Overall', metrics.usage),
      '',
      ...metrics.cores.slice(0, 8).map(c => makeLine(`Core ${c.index}`, c.usage)),
    ];

    if (metrics.cores.length > 8) {
      lines.push(` {gray-fg}  ... +${metrics.cores.length - 8} cores{/gray-fg}`);
    }

    lines.push('');
    lines.push(` {gray-fg}Model: ${metrics.model}{/gray-fg}`);

    box.setContent(lines.join('\n'));
    screen.render();
  }

  // Paint immediately if state is already populated (re-mount case)
  const initial = getCpuMetrics();
  if (initial) renderMetrics(initial);

  const unsub = bus.on('metrics:cpu:updated', renderMetrics);

  function destroy(): void {
    unsub();
    box.destroy();
  }

  return { box: box as unknown as Box, destroy };
}
