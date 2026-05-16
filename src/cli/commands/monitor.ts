// ---------------------------------------------------------------------------
// CLI command: monitor
//
// Opens the MetWatch TUI with no managed processes — pure observation mode.
// This is also the default when `mw` is invoked with no subcommand.
// ---------------------------------------------------------------------------

import { main } from '../../../index.ts';

export async function runMonitor(): Promise<void> {
  await main([]);
}
