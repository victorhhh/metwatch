// ---------------------------------------------------------------------------
// Process Manager
//
// Orchestrates the process list polling loop and handles process lifecycle
// actions (kill). Follows the same pattern as metrics-manager:
//   poll → normalize → write state → emit events
//
// Kill flow:
//   Widget emits 'process:kill:requested' → manager catches it → sends SIGTERM
//   → emits 'process:kill:result' back → widget shows feedback
// ---------------------------------------------------------------------------

import { bus } from './event-bus.ts';
import { updateProcesses } from './state-manager.ts';
import { fetchProcessList } from '../services/process.service.ts';
import type { ResolvedConfig } from '../types/config.types.ts';

interface ProcessManagerHandle {
  start: () => void;
  stop: () => void;
}

export function createProcessManager(config: ResolvedConfig): ProcessManagerHandle {
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  // Listen for kill requests from the UI
  const unsubKill = bus.on('process:kill:requested', ({ pid }) => {
    void handleKill(pid);
  });

  async function tick(): Promise<void> {
    try {
      const list = await fetchProcessList(config.maxProcesses);
      updateProcesses(list);
      bus.emit('processes:updated', list);
    } catch (err) {
      bus.emit('app:error', {
        source: 'process-manager:poll',
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function handleKill(pid: number): Promise<void> {
    try {
      process.kill(pid, 'SIGTERM');
      // Brief delay then trigger a fresh poll so the table updates
      await new Promise<void>(resolve => setTimeout(resolve, 300));
      await tick();
      bus.emit('process:kill:result', { pid, success: true });
    } catch (err) {
      bus.emit('process:kill:result', {
        pid,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    // Stagger 200ms behind metrics-manager to avoid simultaneous event-loop saturation.
    // Use 2× the metrics interval so process polls never coincide with metrics polls.
    startTimer = setTimeout(() => {
      startTimer = null;
      void tick();
      timer = setInterval(() => void tick(), config.refreshInterval * 2);
    }, 200);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    unsubKill();
    if (startTimer !== null) { clearTimeout(startTimer); startTimer = null; }
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  return { start, stop };
}
