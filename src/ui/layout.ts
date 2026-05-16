// ---------------------------------------------------------------------------
// Layout — Dynamic Collapsible Grid
//
// btop-inspired layout: all panels live on one screen, user can toggle each
// panel on/off with a key. Hidden panels collapse; remaining panels expand.
//
// Default grid (all panels visible, ~50 row terminal assumed):
//
//   ┌────────────┬────────────┬────────────┐  ← row A  height ~20%
//   │   CPU      │  Memory    │   Disk     │
//   ├────────────┴────────────┴────────────┤  ← row B  height ~18%
//   │   Network            │  Runtime      │
//   ├─────────────────────────────────────┤  ← row C  height ~32%
//   │          Processes                  │
//   ├─────────────────────────────────────┤  ← row D  height ~30%
//   │          Logs                       │
//   └─────────────────────────────────────┘
//
// Panel toggle keys:
//   d  → Disk        n  → Network
//   R  → Runtime     p  → Processes
//   l  → Logs (focus/toggle)
//   (CPU and Memory are always visible)
//
// Heights are recalculated every time a panel is toggled. The layout
// re-builds widget positions using blessed's hide()/show() — no widget
// teardown needed (positions are updated via .top/.height attributes).
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen, BlessedElement } from 'blessed';
import type { ResolvedConfig } from '../types/config.types.ts';
import type { LauncherHandle }   from '../core/launcher.ts';
import type { LogManagerHandle } from '../core/log-manager.ts';
import { createCpuWidget }          from './widgets/cpu.widget.ts';
import { createMemoryWidget }       from './widgets/memory.widget.ts';
import { createDiskWidget }         from './widgets/disk.widget.ts';
import { createNetworkWidget }      from './widgets/network.widget.ts';
import { createRuntimeWidget }      from './widgets/runtime.widget.ts';
import { createProcessTableWidget } from './widgets/process-table.widget.ts';
import { createLogsWidget }         from './widgets/logs.widget.ts';

interface LayoutOptions {
  screen:     BlessedScreen;
  config:     ResolvedConfig;
  launcher:   LauncherHandle | null;
  logManager: LogManagerHandle | null;
}

interface LayoutHandles {
  destroy: () => void;
}

// ── Height constants (percentages, must sum to 100 when all panels visible) ──

const H = {
  ROW_A:    20,   // CPU + Memory + Disk
  ROW_B:    24,   // Network + Runtime (extra height for line graph)
  ROW_C:    30,   // Processes
  ROW_D:    26,   // Logs
} as const;

// ── Utility ───────────────────────────────────────────────────────────────────

type Pct = `${number}%`;
function pct(n: number): Pct { return `${n}%`; }

/** Given a set of visible row heights (% units), compute their cumulative tops. */
function tops(heights: number[]): number[] {
  const result: number[] = [];
  let acc = 0;
  for (const h of heights) {
    result.push(acc);
    acc += h;
  }
  return result;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function buildLayout(opts: LayoutOptions): LayoutHandles {
  const { screen, config, launcher, logManager } = opts;

  const panels = config.panels;
  const managedNames = new Set<string>(
    launcher ? launcher.getAll().map(p => p.name) : []
  );

  // Track which optional panels are currently visible
  const visible = {
    disk:      panels.disk      !== false,
    network:   panels.network   !== false,
    runtime:   panels.runtime   !== false,
    processes: panels.processes !== false,
    logs:      panels.logs      !== false,
  };

  // ── Create all widgets ─────────────────────────────────────────────────────
  // Initial positions are placeholders; recalc() sets real values.

  const cpu = createCpuWidget({
    screen, top: 0, left: 0, width: '34%', height: pct(H.ROW_A),
  });

  const memory = createMemoryWidget({
    screen, top: 0, left: '34%', width: '33%', height: pct(H.ROW_A),
  });

  const disk = createDiskWidget({
    screen, top: 0, left: '67%', width: '33%', height: pct(H.ROW_A),
  });

  const network = createNetworkWidget({
    screen, top: pct(H.ROW_A), left: 0, width: '55%', height: pct(H.ROW_B),
  });

  const runtime = createRuntimeWidget({
    screen, top: pct(H.ROW_A), left: '55%', width: '45%', height: pct(H.ROW_B),
  });

  const processes = createProcessTableWidget({
    screen,
    config,
    getManagedById: (id) => launcher?.get(id),
    managedNames,
    top: pct(H.ROW_A + H.ROW_B),
    left: 0,
    width: '100%',
    height: pct(H.ROW_C),
  });

  const logs = createLogsWidget({
    screen,
    logManager: logManager ?? {
      getLines:   () => [],
      getAllLines: () => [],
      clearLines: () => undefined,
      destroy:    () => undefined,
    },
    processCount: managedNames.size,
    top: pct(H.ROW_A + H.ROW_B + H.ROW_C),
    left: 0,
    width: '100%',
    height: pct(H.ROW_D),
  });

  // ── Apply initial visibility from config ───────────────────────────────────

  function applyVisibility(): void {
    // Row A: CPU + Memory always shown; Disk optional.
    // When Disk is hidden, CPU and Memory each take 50%.
    const cpuBox     = cpu.box     as unknown as { top: string; left: string; width: string; height: string };
    const memBox     = memory.box  as unknown as { top: string; left: string; width: string; height: string };
    const diskBox    = disk.box    as unknown as { top: string; left: string; width: string; height: string; hide: () => void; show: () => void };
    const netBox     = network.box as unknown as { top: string; left: string; width: string; height: string; hide: () => void; show: () => void };
    const runtimeBox = runtime.box as unknown as { top: string; left: string; width: string; height: string; hide: () => void; show: () => void };
    const procBox    = processes.box as unknown as { top: string; height: string; hide: () => void; show: () => void };
    const logsBox    = logs.box    as unknown as { top: string; height: string; hide: () => void; show: () => void };

    // Row A widths
    if (visible.disk) {
      cpuBox.width = '34%'; cpuBox.left = '0%';
      memBox.width = '33%'; memBox.left = '34%';
      diskBox.width = '33%'; diskBox.left = '67%';
      diskBox.show();
    } else {
      cpuBox.width = '50%'; cpuBox.left = '0%';
      memBox.width = '50%'; memBox.left = '50%';
      diskBox.hide();
    }

    // Row A height
    const rowAH = H.ROW_A;
    cpuBox.height = pct(rowAH); memBox.height = pct(rowAH);

    // Row B: Network + Runtime. If both hidden, row B has height 0.
    let rowBTop = rowAH;
    let rowBH   = 0;

    if (visible.network || visible.runtime) {
      rowBH = H.ROW_B;
      if (visible.network && visible.runtime) {
        netBox.width  = '55%'; netBox.left  = '0%';
        runtimeBox.width = '45%'; runtimeBox.left = '55%';
      } else if (visible.network) {
        netBox.width  = '100%'; netBox.left = '0%';
      } else {
        runtimeBox.width = '100%'; runtimeBox.left = '0%';
      }
      if (visible.network) { netBox.top = pct(rowBTop); netBox.height = pct(rowBH); netBox.show(); }
      else netBox.hide();
      if (visible.runtime) { runtimeBox.top = pct(rowBTop); runtimeBox.height = pct(rowBH); runtimeBox.show(); }
      else runtimeBox.hide();
    } else {
      netBox.hide();
      runtimeBox.hide();
    }

    // Remaining height after rows A and B
    const remaining = 100 - rowAH - rowBH;

    // Split remaining between Processes and Logs
    const showProc = visible.processes;
    const showLogs = visible.logs;

    let procH = 0;
    let logsH = 0;

    if (showProc && showLogs) {
      procH = Math.round(remaining * 0.55);
      logsH = remaining - procH;
    } else if (showProc) {
      procH = remaining;
    } else if (showLogs) {
      logsH = remaining;
    }

    const rowCTop = rowAH + rowBH;
    const rowDTop = rowCTop + procH;

    if (showProc) {
      procBox.top = pct(rowCTop); procBox.height = pct(procH); procBox.show();
    } else {
      procBox.hide();
    }

    if (showLogs) {
      logsBox.top = pct(rowDTop); logsBox.height = pct(logsH); logsBox.show();
    } else {
      logsBox.hide();
    }

    screen.render();
  }

  applyVisibility();

  // ── Toggle keybindings ─────────────────────────────────────────────────────

  screen.key(['d'], () => {
    visible.disk = !visible.disk;
    applyVisibility();
  });

  screen.key(['n'], () => {
    visible.network = !visible.network;
    applyVisibility();
  });

  screen.key(['R'], () => {
    visible.runtime = !visible.runtime;
    applyVisibility();
  });

  screen.key(['p'], () => {
    visible.processes = !visible.processes;
    applyVisibility();
  });

  // ── Help overlay ───────────────────────────────────────────────────────────
  // Press ? to show keybindings overlay

  const helpBox = blessed.box({
    parent: screen as unknown as BlessedElement,
    top: 'center', left: 'center',
    width: 52, height: 18,
    tags: true,
    border: { type: 'line' },
    hidden: true,
    style: { border: { fg: 'white' }, bg: 'black' },
    label: ' MetWatch — Keybindings ',
    content: [
      '',
      '  {bold}Navigation{/bold}',
      '  ↑ / k       Move process selection up',
      '  ↓ / j       Move process selection down',
      '',
      '  {bold}View{/bold}',
      '  a           Process table: All mode',
      '  f           Process table: Watched mode',
      '  c / m       Sort by CPU / Memory',
      '',
      '  {bold}Panel Toggles{/bold}',
      '  d           Toggle Disk panel',
      '  n           Toggle Network panel',
      '  R           Toggle Runtime panel',
      '  p           Toggle Process panel',
      '',
      '  {bold}Actions{/bold}',
      '  K           Kill selected process',
      '  r           Restart managed process',
      '  s           Stop managed process',
      '  q / Ctrl+C  Quit',
      '  ?           Close this help',
    ].join('\n'),
  });

  screen.key(['?'], () => {
    const box = helpBox as unknown as { hidden: boolean; show: () => void; hide: () => void };
    if (box.hidden) { box.show(); } else { box.hide(); }
    screen.render();
  });

  // ── Destroy ────────────────────────────────────────────────────────────────

  function destroy(): void {
    cpu.destroy();
    memory.destroy();
    disk.destroy();
    network.destroy();
    runtime.destroy();
    processes.destroy();
    logs.destroy();
    helpBox.destroy();
  }

  return { destroy };
}
