import type { StateCreator } from 'zustand';

/** Capacity of output ring buffers (~30 seconds at 16 samples/sec) */
export const OUTPUT_BUFFER_CAPACITY = 480;

/** A simple circular buffer for output samples */
export class OutputRingBuffer {
  private data: number[];
  private writeHead: number = 0;
  private count: number = 0;
  private capacity: number;

  constructor(capacity: number = OUTPUT_BUFFER_CAPACITY) {
    this.capacity = capacity;
    this.data = new Array(capacity).fill(0);
  }

  push(value: number): void {
    this.data[this.writeHead] = value;
    this.writeHead = (this.writeHead + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Get all samples in order (oldest to newest) */
  toArray(): number[] {
    if (this.count < this.capacity) {
      // Buffer hasn't wrapped yet
      return this.data.slice(0, this.count);
    }
    // Buffer has wrapped - concatenate from writeHead to end, then start to writeHead
    return [
      ...this.data.slice(this.writeHead),
      ...this.data.slice(0, this.writeHead),
    ];
  }

  /** Get the number of samples in the buffer */
  get length(): number {
    return this.count;
  }

  /** Clear the buffer */
  clear(): void {
    this.data.fill(0);
    this.writeHead = 0;
    this.count = 0;
  }

  /** Clone the buffer */
  clone(): OutputRingBuffer {
    const copy = new OutputRingBuffer(this.capacity);
    copy.data = [...this.data];
    copy.writeHead = this.writeHead;
    copy.count = this.count;
    return copy;
  }
}

/** Authoring workflow phase */
export type AuthoringPhase = 'idle' | 'trimming' | 'saving';

export interface AuthoringSlice {
  /** Current authoring workflow phase */
  authoringPhase: AuthoringPhase;
  /** Continuous output ring buffers (slotIndex → buffer) */
  outputBuffers: Map<number, OutputRingBuffer>;
  /** Snapshot of buffers taken when entering trim dialog */
  trimBufferSnapshot: Map<number, number[]> | null;
  /** Trim bounds in WTS (16 samples per WTS) */
  trimConfig: { startWTS: number; endWTS: number };

  /** Initialize output buffers for creative mode (call when entering creative mode) */
  initializeOutputBuffers: () => void;
  /** Push a sample to an output buffer */
  pushOutputSample: (slotIndex: number, value: number) => void;
  /** Open the trim dialog (snapshots current buffers) */
  openTrimDialog: () => void;
  /** Set trim bounds */
  setTrimBounds: (startWTS: number, endWTS: number) => void;
  /** Proceed from trim to save dialog */
  proceedToSave: () => void;
  /** Cancel authoring workflow */
  cancelAuthoring: () => void;
  /** Clear output buffers */
  clearOutputBuffers: () => void;
}

export const createAuthoringSlice: StateCreator<AuthoringSlice> = (set, get) => ({
  authoringPhase: 'idle',
  outputBuffers: new Map(),
  trimBufferSnapshot: null,
  trimConfig: { startWTS: 0, endWTS: 4 },

  initializeOutputBuffers: () => {
    const buffers = new Map<number, OutputRingBuffer>();
    // Slots 0-5 (0-2 left, 3-5 right)
    for (let i = 0; i < 6; i++) {
      buffers.set(i, new OutputRingBuffer());
    }
    set({ outputBuffers: buffers });
  },

  pushOutputSample: (slotIndex, value) => {
    const { outputBuffers } = get();
    const buffer = outputBuffers.get(slotIndex);
    if (buffer) {
      buffer.push(value);
    }
  },

  openTrimDialog: () => {
    const { outputBuffers } = get();
    // Snapshot current buffers
    const snapshot = new Map<number, number[]>();
    for (const [slotIndex, buffer] of outputBuffers) {
      snapshot.set(slotIndex, buffer.toArray());
    }
    // Calculate default trim bounds based on buffer length
    const firstBuffer = outputBuffers.get(3); // First output slot
    const bufferLength = firstBuffer?.length ?? 0;
    const totalWTS = Math.floor(bufferLength / 16);
    // Default to last 4 WTS or full buffer if shorter
    const defaultDuration = Math.min(4, totalWTS);
    const startWTS = Math.max(0, totalWTS - defaultDuration);
    const endWTS = totalWTS;

    set({
      authoringPhase: 'trimming',
      trimBufferSnapshot: snapshot,
      trimConfig: { startWTS, endWTS },
    });
  },

  setTrimBounds: (startWTS, endWTS) => {
    set({ trimConfig: { startWTS, endWTS } });
  },

  proceedToSave: () => {
    set({ authoringPhase: 'saving' });
  },

  cancelAuthoring: () => {
    set({
      authoringPhase: 'idle',
      trimBufferSnapshot: null,
      trimConfig: { startWTS: 0, endWTS: 4 },
    });
  },

  clearOutputBuffers: () => {
    const { outputBuffers } = get();
    for (const buffer of outputBuffers.values()) {
      buffer.clear();
    }
  },
});
