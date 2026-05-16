// ---------------------------------------------------------------------------
// Metrics Manager
//
// Orchestrates the CPU, memory, disk, and network polling loop.
// Responsibilities:
//   1. Call system services at the configured interval
//   2. Write results into state manager
//   3. Emit typed events on the bus
//   4. Handle errors without crashing (emit app:error instead)
//
// The manager knows nothing about the UI. It is a pure data pipeline.
// ---------------------------------------------------------------------------

import { bus } from './event-bus.ts';
import {
  updateCpuMetrics,
  updateMemoryMetrics,
  updateDiskMetrics,
  updateNetworkMetrics,
} from './state-manager.ts';
import { fetchCpuMetrics, fetchMemoryMetrics } from '../services/system.service.ts';
import { fetchDiskMetrics }                     from '../services/disk.service.ts';
import { fetchNetworkMetrics }                  from '../services/network.service.ts';

interface MetricsManagerOptions {
  intervalMs: number;
}

interface MetricsManagerHandle {
  start: () => void;
  stop:  () => void;
}

export function createMetricsManager(options: MetricsManagerOptions): MetricsManagerHandle {
  const { intervalMs } = options;
  let timer:   ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick(): Promise<void> {
    // Run all fetches in parallel — they are independent OS calls
    const [cpuResult, memResult, diskResult, netResult] = await Promise.allSettled([
      fetchCpuMetrics(),
      fetchMemoryMetrics(),
      fetchDiskMetrics(),
      fetchNetworkMetrics(),
    ]);

    if (cpuResult.status === 'fulfilled') {
      updateCpuMetrics(cpuResult.value);
      bus.emit('metrics:cpu:updated', cpuResult.value);
    } else {
      bus.emit('app:error', {
        source: 'metrics-manager:cpu',
        error: cpuResult.reason instanceof Error
          ? cpuResult.reason
          : new Error(String(cpuResult.reason)),
      });
    }

    if (memResult.status === 'fulfilled') {
      updateMemoryMetrics(memResult.value);
      bus.emit('metrics:memory:updated', memResult.value);
    } else {
      bus.emit('app:error', {
        source: 'metrics-manager:memory',
        error: memResult.reason instanceof Error
          ? memResult.reason
          : new Error(String(memResult.reason)),
      });
    }

    if (diskResult.status === 'fulfilled') {
      updateDiskMetrics(diskResult.value);
      bus.emit('metrics:disk:updated', diskResult.value);
    } else {
      bus.emit('app:error', {
        source: 'metrics-manager:disk',
        error: diskResult.reason instanceof Error
          ? diskResult.reason
          : new Error(String(diskResult.reason)),
      });
    }

    if (netResult.status === 'fulfilled') {
      updateNetworkMetrics(netResult.value);
      bus.emit('metrics:network:updated', netResult.value);
    } else {
      bus.emit('app:error', {
        source: 'metrics-manager:network',
        error: netResult.reason instanceof Error
          ? netResult.reason
          : new Error(String(netResult.reason)),
      });
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    // Immediate first tick so the UI isn't blank on startup
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop };
}
