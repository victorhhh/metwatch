// ---------------------------------------------------------------------------
// Screen
//
// Creates and exports the blessed screen singleton. This is the only place
// in the codebase where `blessed.screen()` is called. All other modules
// receive the screen via parameter or import this module.
//
// Configuration choices:
//   smartCSR  — only redraw damaged regions (significant perf boost)
//   fullUnicode — required for block chars (█) used in bars/gauges
//   dockBorders — adjacent panels share border chars cleanly (┬ ┤ etc.)
//   autoPadding — children auto-respect parent border+padding
// ---------------------------------------------------------------------------

import blessed from 'blessed';
import type { BlessedScreen } from 'blessed';

let _screen: BlessedScreen | null = null;

export function createScreen(): BlessedScreen {
  if (_screen) return _screen;

  _screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true,
    title: 'MetWatch',
    ignoreLocked: ['C-c'],
  });

  return _screen;
}

export function getScreen(): BlessedScreen {
  if (!_screen) throw new Error('Screen not initialized. Call createScreen() first.');
  return _screen;
}

export function destroyScreen(): void {
  if (_screen) {
    _screen.destroy();
    _screen = null;
  }
}
