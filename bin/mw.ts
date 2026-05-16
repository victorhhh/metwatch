#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// bin/mw.ts — MetWatch CLI entry point
//
// This file is the binary registered in package.json under "bin.mw".
// It simply delegates to the args router which handles all subcommands.
//
// Install globally:
//   bun add -g metwatch        (from npm)
//   bun link                   (from local checkout, for development)
//
// Then use:
//   mw                         Open the TUI
//   mw start server.ts         Run + watch a script
//   mw list                    Print managed process states
//   mw logs api --follow       Tail logs
//   mw stop all                Stop everything
// ---------------------------------------------------------------------------

import '../src/cli/args.ts';
