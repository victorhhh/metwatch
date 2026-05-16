// ---------------------------------------------------------------------------
// Metrics Types
//
// Domain types for all system metrics flowing through the event bus and state
// manager. Never expose raw systeminformation objects outside the services layer.
// ---------------------------------------------------------------------------

// ── CPU ───────────────────────────────────────────────────────────────────────

export interface CpuCore {
  /** Core index (0-based) */
  index: number;
  /** Usage percentage 0–100 */
  usage: number;
}

export interface CpuMetrics {
  /** Overall CPU usage percentage (0–100) */
  usage: number;
  /** Per-core usage */
  cores: CpuCore[];
  /** Human-readable model string e.g. "Intel Core i7-1185G7" */
  model: string;
  /** Number of logical cores */
  coreCount: number;
  /** Timestamp of this snapshot (unix ms) */
  timestamp: number;
}

// ── Memory ────────────────────────────────────────────────────────────────────

export interface MemoryMetrics {
  /** Total physical memory in bytes */
  total: number;
  /** Used memory in bytes */
  used: number;
  /** Free memory in bytes */
  free: number;
  /** Used percentage 0–100 */
  percent: number;
  /** Active memory in bytes */
  active: number;
  /** Cached/buffered memory in bytes */
  cached: number;
  /** Timestamp of this snapshot (unix ms) */
  timestamp: number;
}

// ── System (convenience composite) ───────────────────────────────────────────

export interface SystemMetrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
}

// ── Disk ──────────────────────────────────────────────────────────────────────

export interface DiskIO {
  /** Read throughput in bytes/sec */
  readBytesPerSec: number;
  /** Write throughput in bytes/sec */
  writeBytesPerSec: number;
  /** Read operations per second */
  readIOPS: number;
  /** Write operations per second */
  writeIOPS: number;
  /** Disk utilization 0–100% */
  utilization: number;
}

export interface DiskMount {
  /** Block device path e.g. "/dev/sda1" */
  fs: string;
  /** Mount point e.g. "/" or "/home" */
  mount: string;
  /** Filesystem type e.g. "ext4", "NTFS" */
  type: string;
  /** Total capacity in bytes */
  total: number;
  /** Used bytes */
  used: number;
  /** Free bytes */
  free: number;
  /** Used percentage 0–100 */
  percent: number;
  /** IO stats — null if unavailable on this platform */
  io: DiskIO | null;
}

export interface DiskMetrics {
  /** One entry per mounted filesystem */
  mounts: DiskMount[];
  /** Aggregate read across all disks (bytes/sec) */
  totalReadBytesPerSec: number;
  /** Aggregate write across all disks (bytes/sec) */
  totalWriteBytesPerSec: number;
  /** Timestamp of this snapshot (unix ms) */
  timestamp: number;
}

// ── Network ───────────────────────────────────────────────────────────────────

export interface NetworkInterface {
  /** Interface name e.g. "eth0", "en0", "Wi-Fi" */
  iface: string;
  /** IPv4 address (empty string if none) */
  ip4: string;
  /** IPv6 address (empty string if none) */
  ip6: string;
  /** Whether the interface is up */
  operstate: 'up' | 'down' | 'unknown';
  /** Received bytes per second */
  rxBytesPerSec: number;
  /** Transmitted bytes per second */
  txBytesPerSec: number;
  /** Received packets per second */
  rxPacketsPerSec: number;
  /** Transmitted packets per second */
  txPacketsPerSec: number;
  /** Cumulative RX errors */
  rxErrors: number;
  /** Cumulative TX errors */
  txErrors: number;
  /** Cumulative RX drops */
  rxDrops: number;
  /** Cumulative TX drops */
  txDrops: number;
}

export interface NetworkMetrics {
  /** One entry per active network interface */
  interfaces: NetworkInterface[];
  /** Total download across all interfaces (bytes/sec) */
  totalRxBytesPerSec: number;
  /** Total upload across all interfaces (bytes/sec) */
  totalTxBytesPerSec: number;
  /** Timestamp of this snapshot (unix ms) */
  timestamp: number;
}

// ── Runtime (Node / Bun specific) ─────────────────────────────────────────────

export interface GcMetrics {
  /** Most recent GC pause duration in ms (null if no GC has occurred) */
  lastPauseMs: number | null;
  /** Total GC pause time in ms since process start */
  totalPauseMs: number;
  /** Number of GC events since process start */
  count: number;
}

export interface RuntimeMetrics {
  /** Managed process ID (name from ManagedProcessDef) */
  managedId: string;
  /** OS PID of the process */
  pid: number;
  /** V8 heap used in bytes */
  heapUsed: number;
  /** V8 heap total allocated in bytes */
  heapTotal: number;
  /** RSS (Resident Set Size) in bytes */
  rss: number;
  /** External memory held by C++ objects in bytes */
  external: number;
  /** ArrayBuffer memory in bytes */
  arrayBuffers: number;
  /**
   * Event loop lag in milliseconds — how long the event loop is blocked
   * beyond the expected tick interval. > 100ms = problematic.
   */
  eventLoopLag: number;
  /** Number of active libuv handles (timers, sockets, etc.) */
  activeHandles: number;
  /** Number of active libuv requests */
  activeRequests: number;
  /** Garbage collector metrics */
  gc: GcMetrics;
  /** Process uptime in seconds */
  uptime: number;
  /** Timestamp of this snapshot (unix ms) */
  timestamp: number;
}
