import type { StateCreator } from 'zustand';

/** Capacity of output ring buffers (~30 seconds at 16 samples/sec) */
export const OUTPUT_BUFFER_CAPACITY = 480;

/** Fixed trim window size in WTS (all target waveforms are 16 WTS) */
export const TRIM_WINDOW_WTS = 16;

/** Samples per WTS (16 subdivisions) */
const SAMPLES_PER_WTS = 16;

// Module-level transient state for per-WTS validation
let _wtsSampleCounter = 0;
let _currentWTSHasSignal = false;

function resetRecordingCounters(): void {
  _wtsSampleCounter = 0;
  _currentWTSHasSignal = false;
}

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

/**
 * Clean raw snapshot buffers: truncate to complete WTS boundaries and strip
 * leading neutral WTS (where ALL output slots have all 16 samples === 0).
 *
 * Pure function, exported for testing.
 */
export function prepareSnapshotBuffers(
  rawSnapshot: Map<number, number[]>,
  outputSlotIndices: number[],
): { cleanedSnapshot: Map<number, number[]>; totalCleanWTS: number } {
  if (outputSlotIndices.length === 0) {
    return { cleanedSnapshot: new Map(), totalCleanWTS: 0 };
  }

  // (a) Truncate all buffers to complete-WTS boundary
  // Find the minimum complete-WTS length across output slots
  let minCompleteSamples = Infinity;
  for (const slotIndex of outputSlotIndices) {
    const buf = rawSnapshot.get(slotIndex);
    const len = buf ? buf.length : 0;
    const completeSamples = Math.floor(len / SAMPLES_PER_WTS) * SAMPLES_PER_WTS;
    if (completeSamples < minCompleteSamples) {
      minCompleteSamples = completeSamples;
    }
  }
  if (!isFinite(minCompleteSamples) || minCompleteSamples === 0) {
    return { cleanedSnapshot: new Map(), totalCleanWTS: 0 };
  }

  // Truncate all buffers (not just outputs — keep everything aligned)
  const truncated = new Map<number, number[]>();
  for (const [slotIndex, buf] of rawSnapshot) {
    truncated.set(slotIndex, buf.slice(0, minCompleteSamples));
  }

  const totalWTS = minCompleteSamples / SAMPLES_PER_WTS;

  // (b) Count leading neutral WTS (a WTS where ALL output slots have all 16 samples === 0)
  let neutralPrefix = 0;
  for (let wts = 0; wts < totalWTS; wts++) {
    let allNeutral = true;
    for (const slotIndex of outputSlotIndices) {
      const buf = truncated.get(slotIndex)!;
      const start = wts * SAMPLES_PER_WTS;
      for (let s = 0; s < SAMPLES_PER_WTS; s++) {
        if (buf[start + s] !== 0) {
          allNeutral = false;
          break;
        }
      }
      if (!allNeutral) break;
    }
    if (!allNeutral) break;
    neutralPrefix++;
  }

  // (c) Slice off the neutral prefix from every buffer
  const prefixSamples = neutralPrefix * SAMPLES_PER_WTS;
  const cleanedSnapshot = new Map<number, number[]>();
  for (const [slotIndex, buf] of truncated) {
    cleanedSnapshot.set(slotIndex, buf.slice(prefixSamples));
  }

  const totalCleanWTS = totalWTS - neutralPrefix;
  return { cleanedSnapshot, totalCleanWTS };
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
  /** Total clean WTS in the snapshot (set once when opening trim dialog) */
  trimTotalWTS: number;
  /** Trim bounds in WTS (16 samples per WTS) */
  trimConfig: { startWTS: number; endWTS: number };
  /** Whether any output has received non-zero signal (arms recording) */
  recordingArmed: boolean;
  /** Number of complete WTS with valid (non-dead-air) recording */
  validRecordedWTS: number;

  /** Initialize output buffers for creative mode (call when entering creative mode) */
  initializeOutputBuffers: () => void;
  /** Push a sample to an output buffer */
  pushOutputSample: (slotIndex: number, value: number) => void;
  /** Advance the recording tick counter by 1 */
  advanceRecordingTick: () => void;
  /** Open the trim dialog (snapshots current buffers) */
  openTrimDialog: () => void;
  /** Slide the fixed 16-WTS trim window to a new position */
  slideTrimWindow: (windowStartWTS: number) => void;
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
  trimTotalWTS: 0,
  trimConfig: { startWTS: 0, endWTS: TRIM_WINDOW_WTS },
  recordingArmed: false,
  validRecordedWTS: 0,

  initializeOutputBuffers: () => {
    const buffers = new Map<number, OutputRingBuffer>();
    // Slots 0-5 (0-2 left, 3-5 right)
    for (let i = 0; i < 6; i++) {
      buffers.set(i, new OutputRingBuffer());
    }
    resetRecordingCounters();
    set({ outputBuffers: buffers, recordingArmed: false, validRecordedWTS: 0 });
  },

  pushOutputSample: (slotIndex, value) => {
    const { outputBuffers } = get();
    const buffer = outputBuffers.get(slotIndex);
    if (buffer) {
      buffer.push(value);
    }
    if (value !== 0) _currentWTSHasSignal = true;
  },

  advanceRecordingTick: () => {
    _wtsSampleCounter++;
    if (_wtsSampleCounter >= SAMPLES_PER_WTS) {
      // Complete WTS boundary — check if this chunk has valid signal
      const { recordingArmed, validRecordedWTS } = get();
      if (recordingArmed || _currentWTSHasSignal) {
        set({ recordingArmed: true, validRecordedWTS: validRecordedWTS + 1 });
      }
      _wtsSampleCounter = 0;
      _currentWTSHasSignal = false;
    }
  },

  openTrimDialog: () => {
    const { outputBuffers } = get();
    // Snapshot current buffers
    const rawSnapshot = new Map<number, number[]>();
    for (const [slotIndex, buffer] of outputBuffers) {
      rawSnapshot.set(slotIndex, buffer.toArray());
    }

    // Determine output slot indices from the store
    // We need to access creativeSlots — since AuthoringSlice doesn't have direct
    // access, we read from the raw snapshot: output slots are those with non-empty data
    // However, the plan says to pass outputSlotIndices. We'll use the store's creativeSlots.
    // Since this is a Zustand slice, `get()` returns the full merged store at runtime.
    const fullStore = get() as unknown as { creativeSlots: Array<{ direction: string }> };
    const outputSlotIndices: number[] = [];
    if (fullStore.creativeSlots) {
      fullStore.creativeSlots.forEach((slot: { direction: string }, index: number) => {
        if (slot.direction === 'output') {
          outputSlotIndices.push(index);
        }
      });
    }

    const { cleanedSnapshot, totalCleanWTS } = prepareSnapshotBuffers(rawSnapshot, outputSlotIndices);

    // Default window position: rightmost 16 WTS (or 0 if < 16 WTS)
    const startWTS = Math.max(0, totalCleanWTS - TRIM_WINDOW_WTS);
    const endWTS = startWTS + TRIM_WINDOW_WTS;

    set({
      authoringPhase: 'trimming',
      trimBufferSnapshot: cleanedSnapshot,
      trimTotalWTS: totalCleanWTS,
      trimConfig: { startWTS, endWTS },
    });
  },

  slideTrimWindow: (windowStartWTS: number) => {
    const { trimTotalWTS } = get();
    if (trimTotalWTS <= 0) return;

    const maxStart = Math.max(0, trimTotalWTS - TRIM_WINDOW_WTS);
    const clamped = Math.max(0, Math.min(maxStart, Math.round(windowStartWTS)));
    set({ trimConfig: { startWTS: clamped, endWTS: clamped + TRIM_WINDOW_WTS } });
  },

  proceedToSave: () => {
    set({ authoringPhase: 'saving' });
  },

  cancelAuthoring: () => {
    set({
      authoringPhase: 'idle',
      trimBufferSnapshot: null,
      trimTotalWTS: 0,
      trimConfig: { startWTS: 0, endWTS: TRIM_WINDOW_WTS },
    });
  },

  clearOutputBuffers: () => {
    const { outputBuffers } = get();
    for (const buffer of outputBuffers.values()) {
      buffer.clear();
    }
    resetRecordingCounters();
    set({ recordingArmed: false, validRecordedWTS: 0 });
  },
});
