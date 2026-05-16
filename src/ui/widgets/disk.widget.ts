// ---------------------------------------------------------------------------
// Disk Widget
//
// Displays per-mount disk usage and aggregate IO rates.
//
// Layout (inside a bordered box):
//   Row 0:  IO summary  →  Read: 12.3 MB/s   Write: 4.5 MB/s
//   Row 1+: Per mount    →  [bar] /dev/sda1   /  (ext4)  45.2 GB / 200 GB  22.6%
//
// Toggle key: d  (handled in layout.ts, not here)
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, BlessedElement } from 'blessed';
import { bus }            from '../../core/event-bus.ts';
import { getDiskMetrics } from '../../core/state-manager.ts';
import type { DiskMetrics, DiskMount } from '../../types/metrics.types.ts';
import { formatBytes, bar, colorPercent, truncate } from '../../utils/formatters.ts';

interface DiskWidgetOptions {
  screen: BlessedScreen;
  top:    number | string;
  left:   number | string;
  width:  number | string;
  height: number | string;
}

interface DiskWidgetHandle {
  box:     BlessedElement;
  destroy: () => void;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatRate(bps: number): string {
  if (bps < 1024)         return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024)  return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function mountLine(m: DiskMount, innerWidth: number): string {
  const barWidth   = 12;
  const usageBar   = bar(m.percent, barWidth);
  const barColored = m.percent >= 90
    ? `{red-fg}${usageBar}{/red-fg}`
    : m.percent >= 75
      ? `{yellow-fg}${usageBar}{/yellow-fg}`
      : `{green-fg}${usageBar}{/green-fg}`;

  const pct     = colorPercent(m.percent);
  const space   = `${formatBytes(m.used, 0)} / ${formatBytes(m.total, 0)}`;
  const fs      = truncate(m.fs,    14);
  const mnt     = truncate(m.mount, 12);
  const fstype  = truncate(m.type,  6);

  // Right-align the space/pct section
  const right    = `${space}  ${pct}`;
  const leftPart = `[${barColored}] ${fs}  ${mnt}  ${fstype}`;

  return ` ${leftPart.padEnd(innerWidth - right.length - 2)}${right}`;
}

// ── Widget factory ────────────────────────────────────────────────────────────

export function createDiskWidget(options: DiskWidgetOptions): DiskWidgetHandle {
  const { screen, top, left, width, height } = options;

  const box = blessed.box({
    top,
    left,
    width,
    height,
    label: ' Disk [d=toggle] ',
    tags: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    mouse: true,
    style: {
      border: { fg: 'blue' },
      label:  { fg: 'blue', bold: true },
    },
    padding: { top: 0, left: 1, right: 1, bottom: 0 },
  });

  screen.append(box);

  function render(metrics: DiskMetrics): void {
    const lines: string[] = [];

    // IO summary row
    const rStr = formatRate(metrics.totalReadBytesPerSec);
    const wStr = formatRate(metrics.totalWriteBytesPerSec);
    lines.push(
      ` {bold}IO:{/bold}  {green-fg}↓ ${rStr.padEnd(12)}{/green-fg}  {red-fg}↑ ${wStr}{/red-fg}`
    );
    lines.push('');

    if (metrics.mounts.length === 0) {
      lines.push('{gray-fg}  No mounted filesystems detected.{/gray-fg}');
    } else {
      // Header
      lines.push(
        ' {bold}{cyan-fg}' +
        'DEVICE         MOUNT        TYPE    USED / TOTAL     USE%' +
        '{/cyan-fg}{/bold}'
      );
      for (const m of metrics.mounts) {
        lines.push(mountLine(m, 72));
      }
    }

    box.setContent(lines.join('\n'));
    screen.render();
  }

  // ── Initial render ────────────────────────────────────────────────────────
  const initial = getDiskMetrics();
  if (initial) {
    render(initial);
  } else {
    box.setContent('{gray-fg} Collecting disk metrics…{/gray-fg}');
  }

  const unsub = bus.on('metrics:disk:updated', render);

  function destroy(): void {
    unsub();
    box.destroy();
  }

  return { box, destroy };
}
