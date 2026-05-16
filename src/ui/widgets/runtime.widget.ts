// ---------------------------------------------------------------------------
// Runtime Widget
//
// Displays Node/Bun runtime metrics for managed processes collected via
// the inspector protocol (runtime-manager.ts).
//
// Shows per-process panels with:
//   Heap: [bar] used / total   RSS: x MB   External: x KB
//   Event Loop Lag: x ms       Handles: x   Requests: x
//   GC: count  totalMs  lastPauseMs
//   Uptime: x
//
// Toggle key: R  (handled in layout.ts)
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, BlessedElement } from 'blessed';
import { bus }                from '../../core/event-bus.ts';
import { getAllRuntimeMetrics } from '../../core/state-manager.ts';
import type { RuntimeMetrics } from '../../types/metrics.types.ts';
import { formatBytes, formatUptime, bar, colorPercent } from '../../utils/formatters.ts';

interface RuntimeWidgetOptions {
  screen: BlessedScreen;
  top:    number | string;
  left:   number | string;
  width:  number | string;
  height: number | string;
}

interface RuntimeWidgetHandle {
  box:     BlessedElement;
  destroy: () => void;
}

function lagColor(ms: number): string {
  if (ms >= 100) return `{red-fg}${ms.toFixed(1)}ms{/red-fg}`;
  if (ms >= 20)  return `{yellow-fg}${ms.toFixed(1)}ms{/yellow-fg}`;
  return `{green-fg}${ms.toFixed(1)}ms{/green-fg}`;
}

function renderProcess(m: RuntimeMetrics): string[] {
  const heapPct  = m.heapTotal > 0 ? (m.heapUsed / m.heapTotal) * 100 : 0;
  const heapBar  = bar(heapPct, 16);
  const heapBarC = heapPct >= 85
    ? `{red-fg}${heapBar}{/red-fg}`
    : heapPct >= 65
      ? `{yellow-fg}${heapBar}{/yellow-fg}`
      : `{green-fg}${heapBar}{/green-fg}`;

  const lines: string[] = [
    ` {bold}{cyan-fg}◈ ${m.managedId}{/cyan-fg}{/bold}  pid:${m.pid}  uptime:${formatUptime(m.uptime)}`,
    `   Heap [${heapBarC}] ${formatBytes(m.heapUsed)} / ${formatBytes(m.heapTotal)}  ${colorPercent(heapPct)}`,
    `   RSS: ${formatBytes(m.rss)}   External: ${formatBytes(m.external)}   ArrayBuf: ${formatBytes(m.arrayBuffers)}`,
    `   EventLoop Lag: ${lagColor(m.eventLoopLag)}   Handles: ${m.activeHandles}   Requests: ${m.activeRequests}`,
    `   GC: ${m.gc.count} events   Total: ${m.gc.totalPauseMs.toFixed(0)}ms` +
      (m.gc.lastPauseMs !== null ? `   Last: ${m.gc.lastPauseMs.toFixed(1)}ms` : ''),
  ];
  return lines;
}

export function createRuntimeWidget(options: RuntimeWidgetOptions): RuntimeWidgetHandle {
  const { screen, top, left, width, height } = options;

  const box = blessed.box({
    top,
    left,
    width,
    height,
    label: ' Runtime [R=toggle] ',
    tags: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    mouse: true,
    style: {
      border: { fg: 'cyan' },
      label:  { fg: 'cyan', bold: true },
    },
    padding: { top: 0, left: 1, right: 1, bottom: 0 },
  });

  screen.append(box);

  function render(all: RuntimeMetrics[]): void {
    if (all.length === 0) {
      box.setContent(
        '{gray-fg} No runtime metrics yet.\n' +
        ' Launch a managed process with `mw start <file>` to see Node/Bun internals.{/gray-fg}'
      );
      screen.render();
      return;
    }

    const lines: string[] = [];
    for (let i = 0; i < all.length; i++) {
      if (i > 0) lines.push('');
      lines.push(...renderProcess(all[i]!));
    }

    box.setContent(lines.join('\n'));
    screen.render();
  }

  // Initial render from state
  render(getAllRuntimeMetrics());

  const unsub = bus.on('metrics:runtime:updated', () => {
    render(getAllRuntimeMetrics());
  });

  function destroy(): void {
    unsub();
    box.destroy();
  }

  return { box, destroy };
}
