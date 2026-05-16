// ---------------------------------------------------------------------------
// Network Widget
//
// Layout (side by side inside a borderless container):
//   Left  ~28%: Interfaces panel (total summary + per-interface rows)
//   Right ~72%: Throughput line chart (rx green / tx red, rolling 60s)
//
// Toggle key: n  (handled in layout.ts)
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import type { BlessedScreen, BlessedElement } from 'blessed';
import { bus }               from '../../core/event-bus.ts';
import { getNetworkMetrics } from '../../core/state-manager.ts';
import type { NetworkMetrics, NetworkInterface } from '../../types/metrics.types.ts';
import { truncate } from '../../utils/formatters.ts';

interface NetworkWidgetOptions {
  screen: BlessedScreen;
  top:    number | string;
  left:   number | string;
  width:  number | string;
  height: number | string;
}

interface NetworkWidgetHandle {
  box:     BlessedElement;
  destroy: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HISTORY_LEN = 30;

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtRate(bps: number): string {
  if (bps < 1024)        return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  if (bps < 1024 ** 3)   return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bps / (1024 ** 3)).toFixed(1)} GB/s`;
}

function stateTag(s: NetworkInterface['operstate']): string {
  if (s === 'up')   return '{green-fg}▲{/green-fg}';
  if (s === 'down') return '{red-fg}▼{/red-fg}';
  return '{gray-fg}?{/gray-fg}';
}

// X-axis labels: real time strings at every position so blessed-contrib's
// internal showNthLabel recalc never skips them. We show seconds ago from right to left.
function makeXLabels(): string[] {
  return Array.from({ length: HISTORY_LEN }, (_, i) => {
    const age = HISTORY_LEN - 1 - i;
    return `-${age}s`;
  });
}

// ── Widget factory ────────────────────────────────────────────────────────────

export function createNetworkWidget(options: NetworkWidgetOptions): NetworkWidgetHandle {
  const { screen, top, left, width, height } = options;

  // Outer container — no border; children carry their own borders.
  // NOTE: appended to screen AFTER all children are parented so that
  // contrib.line's 'attach' event fires with real dimensions.
  const box = blessed.box({ top, left, width, height, tags: false });

  // ── Left: Interfaces panel ────────────────────────────────────────────────

  const statsBox = blessed.box({
    parent: box as unknown as BlessedElement,
    top: 0,
    left: 0,
    width: '28%',
    height: '100%',
    label: ' Interfaces ',
    tags: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    style: {
      border: { fg: 'magenta' },
      label:  { fg: 'magenta', bold: true },
    },
    padding: { top: 0, left: 1, right: 1, bottom: 0 },
  });

  // ── Right: Throughput line chart ──────────────────────────────────────────

  const rxHistory: number[] = new Array(HISTORY_LEN).fill(0);
  const txHistory: number[] = new Array(HISTORY_LEN).fill(0);

  const chart = new contrib.line({
    parent: box as unknown as BlessedElement,
    top: 0,
    left: '28%',
    width: '72%',
    height: '100%',
    label: ' Throughput MB/s [n=toggle] ',
    showLegend: true,
    legend: { width: 10 },
    xLabelPadding: 1,
    xPadding: 2,
    numYLabels: 3,
    showNthLabel: 5,
    minY: 0,
    style: {
      line:     ['green', 'red'],
      text:     'white',
      baseline: 'black',
    },
  });

  // Append box AFTER all children are parented → 'attach' fires on chart with real dims
  screen.append(box);

  // ── Render ────────────────────────────────────────────────────────────────

  function render(metrics: NetworkMetrics): void {
    // ── Update chart history ─────────────────────────────────────────────
    rxHistory.push(metrics.totalRxBytesPerSec);
    rxHistory.shift();
    txHistory.push(metrics.totalTxBytesPerSec);
    txHistory.shift();

    const MB = 1024 * 1024;
    const maxVal = Math.max(...rxHistory, ...txHistory, 1024);
    const xLabels = makeXLabels();

    (chart as unknown as { options: { maxY: number } }).options.maxY = (maxVal / MB) * 1.2;
    (chart as unknown as { setData: (d: unknown) => void }).setData([
      { title: '↓ RX', x: xLabels, y: rxHistory.map(v => v / MB), style: { line: 'green' } },
      { title: '↑ TX', x: xLabels, y: txHistory.map(v => v / MB), style: { line: 'red'   } },
    ]);

    // ── Update interfaces panel ──────────────────────────────────────────
    const lines: string[] = [];

    lines.push(
      `{bold}Total{/bold}`,
      `{green-fg}↓ ${fmtRate(metrics.totalRxBytesPerSec)}{/green-fg}`,
      `{red-fg}↑ ${fmtRate(metrics.totalTxBytesPerSec)}{/red-fg}`,
      '',
    );

    if (metrics.interfaces.length === 0) {
      lines.push('{gray-fg}No interfaces{/gray-fg}');
    } else {
      for (const iface of metrics.interfaces) {
        const state = stateTag(iface.operstate);
        const name  = truncate(iface.iface, 12);
        const ip    = truncate(iface.ip4 || iface.ip6 || '—', 15);
        const rx    = `{green-fg}↓ ${fmtRate(iface.rxBytesPerSec)}{/green-fg}`;
        const tx    = `{red-fg}↑ ${fmtRate(iface.txBytesPerSec)}{/red-fg}`;
        const err   = iface.rxErrors + iface.txErrors > 0
          ? `\n  {red-fg}err:${iface.rxErrors + iface.txErrors}{/red-fg}`
          : '';
        lines.push(`${state} {bold}${name}{/bold}`, `  ${ip}`, `  ${rx}`, `  ${tx}${err}`, '');
      }
    }

    statsBox.setContent(lines.join('\n'));
    screen.render();
  }

  // Initial paint
  const initial = getNetworkMetrics();
  if (initial) {
    render(initial);
  } else {
    statsBox.setContent('{gray-fg}Collecting…{/gray-fg}');
  }

  const unsub = bus.on('metrics:network:updated', render);

  function destroy(): void {
    unsub();
    box.destroy();
  }

  return { box, destroy };
}
