// ---------------------------------------------------------------------------
// Network Service
//
// Wraps systeminformation network APIs to produce normalized NetworkMetrics.
//
// Two si calls per tick:
//   si.networkInterfaces()  → static info (IP addresses, operstate)
//   si.networkStats()       → cumulative byte/packet counters (delta-based)
//
// Rates are calculated as deltas between successive calls — same approach as
// disk.service.ts. First call returns zero rates.
// ---------------------------------------------------------------------------

import si from 'systeminformation';
import type { NetworkMetrics, NetworkInterface } from '../types/metrics.types.ts';

// ── Delta tracking ────────────────────────────────────────────────────────────

interface IfaceSnapshot {
  rx_bytes:   number;
  tx_bytes:   number;
  rx_sec:     number;   // packets
  tx_sec:     number;
  rx_errors:  number;
  tx_errors:  number;
  rx_dropped: number;
  tx_dropped: number;
  ts:         number;
}

const _prev = new Map<string, IfaceSnapshot>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function operstate(s: string | undefined): 'up' | 'down' | 'unknown' {
  if (s === 'up')   return 'up';
  if (s === 'down') return 'down';
  return 'unknown';
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchNetworkMetrics(): Promise<NetworkMetrics> {
  const now = Date.now();

  const [ifaces, stats] = await Promise.all([
    si.networkInterfaces(),
    si.networkStats('*'),
  ]);

  // Build a map of static info keyed by iface name
  const ifaceArray = Array.isArray(ifaces) ? ifaces : [ifaces];
  const staticInfo = new Map(ifaceArray.map(i => [i.iface, i]));

  const statsArray = Array.isArray(stats) ? stats : [stats];

  const interfaces: NetworkInterface[] = [];
  let totalRx = 0;
  let totalTx = 0;

  for (const s of statsArray) {
    const iface = s.iface ?? '';
    if (!iface) continue;

    const prev = _prev.get(iface);
    const dtSec = prev ? Math.max(0.001, (now - prev.ts) / 1000) : 1;

    const rxBPS = prev
      ? Math.max(0, ((s.rx_bytes ?? 0) - prev.rx_bytes) / dtSec)
      : 0;
    const txBPS = prev
      ? Math.max(0, ((s.tx_bytes ?? 0) - prev.tx_bytes) / dtSec)
      : 0;
    const rxPPS = prev
      ? Math.max(0, ((s.rx_sec   ?? 0) - prev.rx_sec)   / dtSec)
      : 0;
    const txPPS = prev
      ? Math.max(0, ((s.tx_sec   ?? 0) - prev.tx_sec)   / dtSec)
      : 0;

    _prev.set(iface, {
      rx_bytes:   s.rx_bytes   ?? 0,
      tx_bytes:   s.tx_bytes   ?? 0,
      rx_sec:     s.rx_sec     ?? 0,
      tx_sec:     s.tx_sec     ?? 0,
      rx_errors:  s.rx_errors  ?? 0,
      tx_errors:  s.tx_errors  ?? 0,
      rx_dropped: s.rx_dropped ?? 0,
      tx_dropped: s.tx_dropped ?? 0,
      ts:         now,
    });

    const info = staticInfo.get(iface);

    totalRx += rxBPS;
    totalTx += txBPS;

    // Skip loopback in displayed interfaces but keep it in totals
    if (iface === 'lo' || iface === 'loopback') continue;

    interfaces.push({
      iface,
      ip4:             info?.ip4  ?? '',
      ip6:             info?.ip6  ?? '',
      operstate:       operstate(info?.operstate),
      rxBytesPerSec:   Math.round(rxBPS),
      txBytesPerSec:   Math.round(txBPS),
      rxPacketsPerSec: Math.round(rxPPS),
      txPacketsPerSec: Math.round(txPPS),
      rxErrors:        s.rx_errors  ?? 0,
      txErrors:        s.tx_errors  ?? 0,
      rxDrops:         s.rx_dropped ?? 0,
      txDrops:         s.tx_dropped ?? 0,
    });
  }

  // Sort: up interfaces first, then by name
  interfaces.sort((a, b) => {
    if (a.operstate !== b.operstate) {
      return a.operstate === 'up' ? -1 : 1;
    }
    return a.iface.localeCompare(b.iface);
  });

  return {
    interfaces,
    totalRxBytesPerSec: Math.round(totalRx),
    totalTxBytesPerSec: Math.round(totalTx),
    timestamp: now,
  };
}
