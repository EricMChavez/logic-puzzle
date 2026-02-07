import { METER_BUFFER_CAPACITY } from './meter-types.ts';

/**
 * Fixed-capacity circular buffer backed by Float64Array.
 * Used to store meter waveform history without allocations on each tick.
 */
export class MeterCircularBuffer {
  readonly capacity: number;
  private readonly data: Float64Array;
  private head = 0;
  private size = 0;

  constructor(capacity: number = METER_BUFFER_CAPACITY) {
    this.capacity = capacity;
    this.data = new Float64Array(capacity);
  }

  /** Push a new value into the buffer (overwrites oldest when full). */
  push(value: number): void {
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Read a value by logical index (0 = oldest in buffer).
   * Returns 0 for out-of-range indices.
   */
  at(logicalIndex: number): number {
    if (logicalIndex < 0 || logicalIndex >= this.size) return 0;
    const physicalIndex = (this.head - this.size + logicalIndex + this.capacity) % this.capacity;
    return this.data[physicalIndex];
  }

  /** The most recently pushed value, or 0 if empty. */
  latest(): number {
    if (this.size === 0) return 0;
    return this.data[(this.head - 1 + this.capacity) % this.capacity];
  }

  /** Number of values currently in the buffer. */
  get count(): number {
    return this.size;
  }

  /** Clear all values and reset the buffer. */
  clear(): void {
    this.data.fill(0);
    this.head = 0;
    this.size = 0;
  }
}
