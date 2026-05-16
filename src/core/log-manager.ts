// ---------------------------------------------------------------------------
// Log Manager
//
// Maintains a per-process circular buffer of log lines captured from
// managed process stdout/stderr. Widgets read from this buffer on mount
// (so they show history immediately) and then subscribe to 'log:line'
// events for live updates.
//
// Design:
//   - One circular buffer (fixed-size array + head pointer) per process ID
//   - Lines are never sorted — insertion order is display order
//   - Scrollback limit comes from ResolvedConfig.logScrollback
//   - No UI awareness: log-manager only stores; widgets only render
// ---------------------------------------------------------------------------

import { bus } from './event-bus.ts';

interface LogLine {
  id:        string;
  stream:    'stdout' | 'stderr';
  line:      string;
  timestamp: number;
}

// ── Circular buffer ────────────────────────────────────────────────────────

class CircularBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  toArray(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buf.slice(0, this.size) as T[];
    }
    // Buffer is full — head points to oldest entry
    return [
      ...this.buf.slice(this.head),
      ...this.buf.slice(0, this.head),
    ] as T[];
  }

  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.size = 0;
  }

  get length(): number {
    return this.size;
  }
}

// ── Log Manager ────────────────────────────────────────────────────────────

export interface LogManagerHandle {
  /** Get all buffered lines for a process id. */
  getLines: (id: string) => LogLine[];
  /** Get all lines across all processes, sorted by timestamp. */
  getAllLines: () => LogLine[];
  /** Clear the buffer for a specific process. */
  clearLines: (id: string) => void;
  /** Stop listening to bus events. Call on TUI destroy. */
  destroy: () => void;
}

export function createLogManager(scrollback: number): LogManagerHandle {
  const buffers = new Map<string, CircularBuffer<LogLine>>();

  function getOrCreate(id: string): CircularBuffer<LogLine> {
    let buf = buffers.get(id);
    if (!buf) {
      buf = new CircularBuffer<LogLine>(scrollback);
      buffers.set(id, buf);
    }
    return buf;
  }

  const unsub = bus.on('log:line', (payload) => {
    getOrCreate(payload.id).push(payload);
  });

  function getLines(id: string): LogLine[] {
    return buffers.get(id)?.toArray() ?? [];
  }

  function getAllLines(): LogLine[] {
    const all: LogLine[] = [];
    for (const buf of buffers.values()) {
      all.push(...buf.toArray());
    }
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }

  function clearLines(id: string): void {
    buffers.get(id)?.clear();
  }

  function destroy(): void {
    unsub();
    buffers.clear();
  }

  return { getLines, getAllLines, clearLines, destroy };
}
