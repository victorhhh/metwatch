// ---------------------------------------------------------------------------
// CLI command: stop
//
// Gracefully stops a named managed process or all of them.
//
// In Phase 2 stop runs inside the same process as the TUI — it is wired
// through the event bus. Phase 3 will add out-of-process IPC.
//
// Usage:
//   mw stop <name|all>
// ---------------------------------------------------------------------------

import { HELP_STOP } from '../help.ts';

export function runStop(argv: string[]): void {
  const [target] = argv;

  if (!target) {
    console.error('Error: missing target name.\n');
    console.log(HELP_STOP);
    process.exit(1);
  }

  // Phase 3: emit over IPC socket to the running TUI process.
  // For now we inform the user to use the in-TUI keybindings.
  if (target === 'all') {
    console.log('[MetWatch] To stop all managed processes, press q in the TUI (graceful shutdown).');
  } else {
    console.log(`[MetWatch] To stop "${target}", select it in the TUI and press [s].`);
  }
  console.log();
  console.log('Phase 3 will add out-of-process `mw stop` support via socket IPC.');
}
