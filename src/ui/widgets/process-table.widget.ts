// ---------------------------------------------------------------------------
// Process Table Widget
//
// Dual-mode scrollable process table:
//   [a] All   — all system processes sorted by CPU descending
//   [f] Watch — only processes matching config.watchedProcesses
//
// Keyboard bindings:
//   a / f     → switch view mode
//   ↑ / k     → move selection up
//   ↓ / j     → move selection down
//   K (shift) → kill selected process (with confirmation)
//   r         → restart selected managed process
//   s         → stop selected managed process
//   c / m     → sort by CPU / Memory
//
// Phase 2 columns: PID · NAME · CPU% · MEM · MEM% · USER · THRD · STATUS
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, BlessedElement } from 'blessed';
import { bus }          from '../../core/event-bus.ts';
import { getProcesses } from '../../core/state-manager.ts';
import type { ProcessInfo, ProcessList, ProcessViewMode, ProcessSortKey } from '../../types/process.types.ts';
import type { ResolvedConfig } from '../../types/config.types.ts';
import type { ManagedProcess } from '../../types/managed-process.types.ts';
import { formatBytes, formatPercent, formatUptime, truncate } from '../../utils/formatters.ts';

interface ProcessTableWidgetOptions {
  screen:         BlessedScreen;
  config:         ResolvedConfig;
  getManagedById: (id: string) => ManagedProcess | undefined;
  managedNames:   Set<string>;
  top:    number | string;
  left:   number | string;
  width:  number | string;
  height: number | string;
}

interface ProcessTableWidgetHandle {
  box:     BlessedElement;
  destroy: () => void;
}

// Columns: PID · NAME · CPU% · MEM · MEM% · USER · THRD · STATUS
const HEADERS    = ['PID',  'NAME',  'CPU%', 'MEM',  'MEM%', 'USER', 'THR', 'STATUS'];
const COL_WIDTHS = [7,       22,      7,      10,     6,      10,     5,     11 ];

const STATUS_BADGE: Record<string, string> = {
  running:    '{green-fg}●{/green-fg}',
  restarting: '{yellow-fg}↻{/yellow-fg}',
  crashed:    '{red-fg}✕{/red-fg}',
  stopped:    '{gray-fg}■{/gray-fg}',
};

function uptime(p: ProcessInfo): string {
  if (!p.startedAt) return '—';
  return formatUptime(Math.floor((Date.now() - p.startedAt) / 1000));
}

function buildRow(p: ProcessInfo, managed: ManagedProcess | undefined): string[] {
  const badge  = managed ? (STATUS_BADGE[managed.status] ?? '') + ' ' : '  ';
  const name   = badge + truncate(p.name, 19);
  const status = managed
    ? `${managed.status}${managed.restarts > 0 ? ` ×${managed.restarts}` : ''}`
    : p.status;

  return [
    String(p.pid),
    name,
    formatPercent(p.cpu),
    formatBytes(p.memory),
    formatPercent(p.memoryPercent),
    truncate(p.user || '—', 10),
    String(p.threads || 1),
    status,
  ];
}

function colorRow(cells: string[], p: ProcessInfo, isManaged: boolean): string {
  const padded = cells.map((cell, i) => {
    if (i === 1) return cell; // NAME has blessed tags — don't naive-pad
    return cell.padEnd(COL_WIDTHS[i] ?? 10);
  });
  padded[1] = (padded[1] ?? '').padEnd(COL_WIDTHS[1] ?? 22);
  const line = padded.join(' ');
  if (isManaged)    return `{cyan-fg}${line}{/cyan-fg}`;
  if (p.cpu >= 50)  return `{red-fg}${line}{/red-fg}`;
  if (p.cpu >= 20)  return `{yellow-fg}${line}{/yellow-fg}`;
  return line;
}

export function createProcessTableWidget(options: ProcessTableWidgetOptions): ProcessTableWidgetHandle {
  const { screen, config, getManagedById, managedNames, top, left, width, height } = options;

  let viewMode: ProcessViewMode = 'all';
  let sortKey:  ProcessSortKey  = 'cpu';
  let selectedIndex = 0;
  let currentList:  ProcessList = [];

  const hasManagedKeys = managedNames.size > 0;
  const LABEL_DEFAULT = hasManagedKeys
    ? ' Processes [a/f=view c/m=sort ↑↓=nav K=kill r=restart s=stop] '
    : ' Processes [a/f=view c/m=sort ↑↓=nav K=kill] ';

  // ── Container ──────────────────────────────────────────────────────────────

  const container = blessed.box({
    top, left, width, height,
    label: LABEL_DEFAULT,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'yellow' },
      label:  { fg: 'yellow', bold: true },
    },
  });

  const modeBar = blessed.box({
    parent: container,
    top: 0, left: 0,
    width: '100%', height: 1,
    tags: true,
    content: buildModeBar(),
  });

  const listBox = blessed.box({
    parent: container,
    top: 1, left: 0,
    width: '100%', height: '100%-3',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: false,
    mouse: true,
    scrollbar: { ch: '│', style: { fg: 'yellow' } } as never,
    style: { scrollbar: { fg: 'yellow' } },
  });

  const question = blessed.question({
    parent: screen as unknown as BlessedElement,
    top: 'center', left: 'center',
    width: 56, height: 7,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'red' }, label: { fg: 'red' } },
    label: ' Confirm Kill ',
    hidden: true,
  });

  screen.append(container);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function buildModeBar(): string {
    const allTag     = viewMode === 'all'
      ? '{black-fg}{cyan-bg} ALL {/} '
      : '{gray-fg} ALL {/} ';
    const watchedTag = viewMode === 'watched'
      ? '{black-fg}{cyan-bg} WATCH {/}'
      : '{gray-fg} WATCH {/}';
    const sortTag    = `  {gray-fg}sort:${sortKey}{/gray-fg}`;
    const extraHint  = hasManagedKeys
      ? '  {gray-fg}[r]=restart [s]=stop managed{/gray-fg}'
      : '';
    return ` ${allTag}${watchedTag}${sortTag}${extraHint}`;
  }

  function sortList(list: ProcessList): ProcessList {
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'cpu':    return b.cpu    - a.cpu;
        case 'memory': return b.memory - a.memory;
        case 'name':   return a.name.localeCompare(b.name);
        case 'pid':    return a.pid    - b.pid;
      }
    });
  }

  function filterList(list: ProcessList): ProcessList {
    if (viewMode === 'all') return sortList(list);
    const patterns = config.watchedProcesses.map(w => w.name.toLowerCase());
    const managed  = [...managedNames].map(n => n.toLowerCase());
    return sortList(list.filter(p => {
      const name = p.name.toLowerCase();
      return patterns.some(pat => name.includes(pat))
          || managed.some(m   => name.includes(m));
    }));
  }

  function render(list: ProcessList): void {
    currentList   = filterList(list);
    selectedIndex = Math.min(selectedIndex, Math.max(0, currentList.length - 1));

    modeBar.setContent(buildModeBar());

    const headerCells = HEADERS.map((h, i) => h.padEnd(COL_WIDTHS[i] ?? 10));
    const headerLine  = `{bold}{cyan-fg} ${headerCells.join(' ')}{/cyan-fg}{/bold}`;

    const rows = currentList.map((p, i) => {
      const managed   = getManagedById(p.name);
      const isManaged = managedNames.has(p.name);
      const cells     = buildRow(p, managed);
      const line      = colorRow(cells, p, isManaged);
      const pre  = i === selectedIndex ? '{inverse}' : '';
      const post = i === selectedIndex ? '{/inverse}' : '';
      return ` ${pre}${line}${post}`;
    });

    const content = currentList.length === 0
      ? `${headerLine}\n\n{gray-fg}  No processes found.{/gray-fg}`
      : [headerLine, ...rows].join('\n');

    listBox.setContent(content);
    screen.render();
  }

  function flashLabel(msg: string, ms = 2500): void {
    container.setLabel(` ${msg} `);
    screen.render();
    setTimeout(() => { container.setLabel(LABEL_DEFAULT); screen.render(); }, ms);
  }

  function scrollTo(idx: number): void {
    selectedIndex = Math.max(0, Math.min(idx, currentList.length - 1));
    render(getProcesses());
  }

  // ── Keybindings ────────────────────────────────────────────────────────────

  screen.key(['a'], () => { viewMode = 'all';     render(getProcesses()); });
  screen.key(['f'], () => { viewMode = 'watched'; render(getProcesses()); });
  screen.key(['c'], () => { sortKey  = 'cpu';     render(getProcesses()); });
  screen.key(['m'], () => { sortKey  = 'memory';  render(getProcesses()); });

  screen.key(['up',   'k'], () => scrollTo(selectedIndex - 1));
  screen.key(['down', 'j'], () => scrollTo(selectedIndex + 1));

  screen.key(['K'], () => {
    const proc = currentList[selectedIndex];
    if (!proc) return;
    question.ask(
      `Kill process "${proc.name}" (PID ${proc.pid})?`,
      (_err, confirmed) => {
        if (confirmed) bus.emit('process:kill:requested', { pid: proc.pid });
        screen.render();
      }
    );
    screen.render();
  });

  screen.key(['r'], () => {
    const proc = currentList[selectedIndex];
    if (!proc || !managedNames.has(proc.name)) return;
    bus.emit('managed:restart:requested', { id: proc.name });
    flashLabel(`{yellow-fg}Restarting ${proc.name}…{/yellow-fg}`);
  });

  screen.key(['s'], () => {
    const proc = currentList[selectedIndex];
    if (!proc || !managedNames.has(proc.name)) return;
    bus.emit('managed:stop:requested', { id: proc.name });
    flashLabel(`{gray-fg}Stopping ${proc.name}…{/gray-fg}`);
  });

  // ── Bus subscriptions ──────────────────────────────────────────────────────

  const unsubProcesses       = bus.on('processes:updated',  render);
  const unsubManagedStarted  = bus.on('managed:started',    () => render(getProcesses()));
  const unsubManagedStopped  = bus.on('managed:stopped',    () => render(getProcesses()));
  const unsubManagedCrashed  = bus.on('managed:crashed',    () => render(getProcesses()));
  const unsubManagedRestart  = bus.on('managed:restarted',  () => render(getProcesses()));
  const unsubKillResult      = bus.on('process:kill:result', ({ pid, success, error }) => {
    flashLabel(success
      ? `{green-fg}Process ${pid} terminated.{/green-fg}`
      : `{red-fg}Kill failed for ${pid}: ${error ?? 'unknown'}{/red-fg}`);
  });

  render(getProcesses());

  function destroy(): void {
    unsubProcesses();
    unsubManagedStarted();
    unsubManagedStopped();
    unsubManagedCrashed();
    unsubManagedRestart();
    unsubKillResult();
    container.destroy();
  }

  return { box: container, destroy };
}
