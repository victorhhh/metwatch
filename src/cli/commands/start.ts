// ---------------------------------------------------------------------------
// CLI command: start
//
// Parses CLI flags and launches one managed process, then opens the TUI.
//
// Usage:
//   mw start <file> [options]
//
// Runtime inference:
//   .ts / .tsx           → bun
//   .js / .mjs / .cjs    → node
//   .py                  → python
//   other                → execute directly (no runtime wrapper)
// ---------------------------------------------------------------------------

import { basename, extname, resolve } from 'path';
import { HELP_START } from '../help.ts';
import type { ManagedProcessDef } from '../../types/managed-process.types.ts';
import { main } from '../../../index.ts';

function inferRuntime(file: string): { command: string; args: string[] } {
  const ext = extname(file).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return { command: 'bun', args: ['run', file] };
    case '.js':
    case '.mjs':
    case '.cjs':
      return { command: 'node', args: [file] };
    case '.py':
      return { command: 'python', args: [file] };
    default:
      return { command: file, args: [] };
  }
}

interface StartOptions {
  file:       string;
  name:       string;
  runtime:    string | null;
  autoRestart: boolean;
  cwd:        string;
  env:        Record<string, string>;
}

function parseStartArgs(argv: string[]): StartOptions | null {
  const [file, ...rest] = argv;

  if (!file || file.startsWith('-')) {
    console.error('Error: missing <file> argument.\n');
    console.log(HELP_START);
    return null;
  }

  const absFile = resolve(process.cwd(), file);
  let name        = basename(file, extname(file));
  let runtime: string | null = null;
  let autoRestart = true;
  let cwd         = process.cwd();
  const env: Record<string, string> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--name') {
      name = rest[++i] ?? name;
    } else if (arg === '--runtime') {
      runtime = rest[++i] ?? null;
    } else if (arg === '--no-restart') {
      autoRestart = false;
    } else if (arg === '--cwd') {
      cwd = resolve(rest[++i] ?? process.cwd());
    } else if (arg === '--env') {
      const pair = rest[++i] ?? '';
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        env[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      } else {
        console.error(`Error: --env value must be KEY=VALUE, got: ${pair}`);
        return null;
      }
    } else if (arg === '-h' || arg === '--help') {
      console.log(HELP_START);
      process.exit(0);
    } else {
      console.error(`Error: unknown option "${arg}"\n`);
      console.log(HELP_START);
      return null;
    }
  }

  return { file: absFile, name, runtime, autoRestart, cwd, env };
}

export async function runStart(argv: string[]): Promise<void> {
  const opts = parseStartArgs(argv);
  if (!opts) {
    process.exit(1);
  }

  const inferred = inferRuntime(opts.file);

  let command: string;
  let args: string[];

  if (opts.runtime) {
    command = opts.runtime;
    args    = [opts.file];
  } else {
    command = inferred.command;
    args    = inferred.args;
  }

  const def: ManagedProcessDef = {
    name:        opts.name,
    command,
    args,
    autoRestart: opts.autoRestart,
    cwd:         opts.cwd,
    env:         Object.keys(opts.env).length > 0 ? opts.env : undefined,
  };

  await main([def]);
}
