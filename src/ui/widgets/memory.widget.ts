// ---------------------------------------------------------------------------
// Memory Widget
//
// Renders RAM usage as a visual bar + breakdown of used/free/cached.
// Subscribes to 'metrics:memory:updated' events.
//
// Layout:
//   ┌─ Memory ─────────────────────────────────┐
//   │ Used     ████████████░░░░░░░░  62.4%      │
//   │                                           │
//   │ Used    : 9.8 GB                          │
//   │ Free    : 5.9 GB                          │
//   │ Cached  : 1.2 GB                          │
//   │ Total   : 15.7 GB                         │
//   └───────────────────────────────────────────┘
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, Box } from 'blessed';
import { bus } from '../../core/event-bus.ts';
import { getMemoryMetrics } from '../../core/state-manager.ts';
import type { MemoryMetrics } from '../../types/metrics.types.ts';
import { formatBytes, colorPercent } from '../../utils/formatters.ts';

interface MemoryWidgetOptions {
  screen: BlessedScreen;
  top: number | string;
  left: number | string;
  width: number | string;
  height: number | string;
}

interface MemoryWidgetHandle {
  box: Box;
  destroy: () => void;
}

export function createMemoryWidget(options: MemoryWidgetOptions): MemoryWidgetHandle {
  const { screen, top, left, width, height } = options;

  const box = blessed.box({
    top,
    left,
    width,
    height,
    label: ' Memory ',
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'magenta' },
      label: { fg: 'magenta', bold: true },
    },
    padding: { top: 0, left: 1, right: 1, bottom: 0 },
  });

  screen.append(box as unknown as import('blessed').BlessedElement);

  function renderMetrics(metrics: MemoryMetrics): void {
    const innerWidth = (typeof width === 'string' ? box.width : width as number) - 4;
    const barWidth = Math.max(10, innerWidth - 14);

    const filled = Math.round((Math.min(100, metrics.percent) / 100) * barWidth);
    const empty = barWidth - filled;
    const barColor = metrics.percent >= 85
      ? '{red-fg}'
      : metrics.percent >= 60 ? '{yellow-fg}' : '{green-fg}';
    const bar = `${barColor}${'█'.repeat(filled)}{/}${'░'.repeat(empty)}`;
    const pct = colorPercent(metrics.percent);

    const lines: string[] = [
      ` ${'RAM'.padEnd(8)} ${bar} ${pct}`,
      '',
      ` {bold}Used  {/bold}  : ${formatBytes(metrics.used)}`,
      ` {bold}Free  {/bold}  : ${formatBytes(metrics.free)}`,
      ` {bold}Cached{/bold}  : ${formatBytes(metrics.cached)}`,
      ` {bold}Total {/bold}  : ${formatBytes(metrics.total)}`,
    ];

    box.setContent(lines.join('\n'));
    screen.render();
  }

  const initial = getMemoryMetrics();
  if (initial) renderMetrics(initial);

  const unsub = bus.on('metrics:memory:updated', renderMetrics);

  function destroy(): void {
    unsub();
    box.destroy();
  }

  return { box: box as unknown as Box, destroy };
}
