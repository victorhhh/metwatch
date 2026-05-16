// ---------------------------------------------------------------------------
// Logs Widget
//
// Displays realtime stdout/stderr from managed processes.
//
//   stdout lines → white
//   stderr lines → {red-fg}
//   prefix       → [{id}] shown when more than one process is managed
//
// On mount: reads existing lines from LogManager (history).
// Live:     subscribes to 'log:line' events on the bus.
//
// Focus key 'l' → this box scrolls; 'Escape' returns focus to screen.
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, BlessedElement } from 'blessed';
import { bus } from '../../core/event-bus.ts';
import type { LogManagerHandle } from '../../core/log-manager.ts';

interface LogsWidgetOptions {
  screen:     BlessedScreen;
  logManager: LogManagerHandle;
  /** How many distinct managed process IDs exist — used to decide prefix display */
  processCount: number;
  top:    number | string;
  left:   number | string;
  width:  number | string;
  height: number | string;
}

interface LogsWidgetHandle {
  box:     BlessedElement;
  destroy: () => void;
}

export function createLogsWidget(options: LogsWidgetOptions): LogsWidgetHandle {
  const { screen, logManager, processCount, top, left, width, height } = options;

  const showPrefix = processCount > 1;

  const box = blessed.box({
    top,
    left,
    width,
    height,
    label: ' Logs [l=focus  ↑↓=scroll] ',
    tags: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: false,
    mouse: true,
    scrollbar: { ch: '│', style: { fg: 'green' } } as never,
    style: {
      border: { fg: 'green' },
      label:  { fg: 'green', bold: true },
      scrollbar: { fg: 'green' },
    },
    padding: { top: 0, left: 1, right: 1, bottom: 0 },
  });

  screen.append(box);

  // ── Line formatter ────────────────────────────────────────────────────────

  function formatLine(
    id: string,
    stream: 'stdout' | 'stderr',
    line: string,
    timestamp: number
  ): string {
    const time = new Date(timestamp).toLocaleTimeString('en', { hour12: false });
    const prefix = showPrefix ? `{cyan-fg}[${id}]{/cyan-fg} ` : '';
    const ts     = `{gray-fg}${time}{/gray-fg} `;
    const text   = stream === 'stderr'
      ? `{red-fg}${line}{/red-fg}`
      : line;
    return `${ts}${prefix}${text}`;
  }

  // ── Render history on mount ────────────────────────────────────────────────

  const history = logManager.getAllLines();
  const historyLines = history.map(l => formatLine(l.id, l.stream, l.line, l.timestamp));
  if (historyLines.length > 0) {
    box.setContent(historyLines.join('\n'));
    // Scroll to bottom after setting content
    (box as unknown as { setScrollPerc: (n: number) => void }).setScrollPerc(100);
  } else {
    box.setContent(
      '{gray-fg}Waiting for output from managed processes...{/gray-fg}'
    );
  }

  // ── Live subscription ─────────────────────────────────────────────────────

  // Maintain a local line buffer for efficient append
  const lines: string[] = [...historyLines];

  const unsubLine = bus.on('log:line', ({ id, stream, line, timestamp }) => {
    // Replace placeholder on first real line
    if (lines.length === 0 || (lines.length === 1 && lines[0]?.includes('Waiting'))) {
      lines.length = 0;
    }
    lines.push(formatLine(id, stream, line, timestamp));
    box.setContent(lines.join('\n'));
    (box as unknown as { setScrollPerc: (n: number) => void }).setScrollPerc(100);
    screen.render();
  });

  const unsubStarted = bus.on('managed:started', ({ id, pid }) => {
    lines.push(`{gray-fg}── ${id} started (pid ${pid}) ──{/gray-fg}`);
    box.setContent(lines.join('\n'));
    (box as unknown as { setScrollPerc: (n: number) => void }).setScrollPerc(100);
    screen.render();
  });

  const unsubCrashed = bus.on('managed:crashed', ({ id, exitCode, restarts }) => {
    lines.push(
      `{red-fg}── ${id} crashed (exit ${exitCode ?? '?'}) — restart #${restarts} scheduled ──{/red-fg}`
    );
    box.setContent(lines.join('\n'));
    (box as unknown as { setScrollPerc: (n: number) => void }).setScrollPerc(100);
    screen.render();
  });

  const unsubRestarted = bus.on('managed:restarted', ({ id, pid, restarts }) => {
    lines.push(`{yellow-fg}── ${id} restarted (pid ${pid}, #${restarts}) ──{/yellow-fg}`);
    box.setContent(lines.join('\n'));
    (box as unknown as { setScrollPerc: (n: number) => void }).setScrollPerc(100);
    screen.render();
  });

  const unsubStopped = bus.on('managed:stopped', ({ id }) => {
    lines.push(`{gray-fg}── ${id} stopped ──{/gray-fg}`);
    box.setContent(lines.join('\n'));
    (box as unknown as { setScrollPerc: (n: number) => void }).setScrollPerc(100);
    screen.render();
  });

  // ── Focus key ─────────────────────────────────────────────────────────────

  screen.key(['l'], () => {
    box.focus();
    screen.render();
  });

  box.key(['escape'], () => {
    // Return focus to the screen root so other key bindings take over again
    (screen as unknown as { focusPop: () => void }).focusPop?.();
    screen.render();
  });

  // ── Destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    unsubLine();
    unsubStarted();
    unsubCrashed();
    unsubRestarted();
    unsubStopped();
    box.destroy();
  }

  return { box, destroy };
}
