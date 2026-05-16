// ---------------------------------------------------------------------------
// Disk Service
//
// Wraps systeminformation filesystem APIs to produce normalized DiskMetrics.
//
// Two si calls per tick:
//   si.fsSize()   → per-mount space usage (total/used/free/%)
//   si.fsStats()  → aggregate read/write bytes since last call (delta-based)
//
// IO rates are calculated as deltas between successive calls. The first call
// returns zero rates (no baseline yet). Subsequent calls divide the byte delta
// by the elapsed seconds to get bytes/sec.
// ---------------------------------------------------------------------------

import si from 'systeminformation';
import type { DiskMetrics, DiskMount, DiskIO } from '../types/metrics.types.ts';

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchDiskMetrics(): Promise<DiskMetrics> {
  const now = Date.now();

  const [fsSizes, disksIO] = await Promise.all([
    si.fsSize(),
    si.disksIO().catch(() => null),
  ]);

  // ── IO delta calculation ────────────────────────────────────────────────────
  // disksIO may return null on some platforms (e.g. Windows without admin).

  let diskIo: DiskIO | null = null;

  // disksIO returns an object with rIO/wIO/tIO/rIO_sec/wIO_sec/tIO_sec/rIO_ms/wIO_ms...
  // The *_sec fields are already rates calculated by systeminformation.
  if (disksIO !== null && typeof disksIO === 'object') {
    const d = disksIO as unknown as Record<string, number>;
    const readBPS   = (d['rIO_sec']  ?? 0) * 512;  // sectors → bytes (approx)
    const writeBPS  = (d['wIO_sec']  ?? 0) * 512;
    const readIops  = d['rIO_sec']   ?? 0;
    const writeIops = d['wIO_sec']   ?? 0;
    const totalBPS  = readBPS + writeBPS;
    const utilization = Math.min(100, (totalBPS / (500 * 1024 * 1024)) * 100);

    diskIo = {
      readBytesPerSec:  Math.round(readBPS),
      writeBytesPerSec: Math.round(writeBPS),
      readIOPS:         Math.round(readIops),
      writeIOPS:        Math.round(writeIops),
      utilization:      Math.round(utilization * 10) / 10,
    };
  }

  void 0; // placeholder
  // ── Mount entries ──────────────────────────────────────────────────────────
  // Filter out pseudo-filesystems (tmpfs, devfs, etc.) that have 0 total size.

  const mounts: DiskMount[] = fsSizes
    .filter(fs => fs.size > 0)
    .map(fs => ({
      fs:      fs.fs     ?? 'unknown',
      mount:   fs.mount  ?? '/',
      type:    fs.type   ?? 'unknown',
      total:   fs.size   ?? 0,
      used:    fs.used   ?? 0,
      free:    (fs.size ?? 0) - (fs.used ?? 0),
      percent: fs.use    ?? 0,
      io:      diskIo,   // same IO object for all mounts (aggregate only for now)
    }));

  return {
    mounts,
    totalReadBytesPerSec:  diskIo?.readBytesPerSec  ?? 0,
    totalWriteBytesPerSec: diskIo?.writeBytesPerSec ?? 0,
    timestamp: now,
  };
}
