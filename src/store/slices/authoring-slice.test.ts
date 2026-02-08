import { describe, it, expect } from 'vitest';
import { prepareSnapshotBuffers, TRIM_WINDOW_WTS } from './authoring-slice.ts';

describe('prepareSnapshotBuffers', () => {
  const SAMPLES_PER_WTS = 16;

  /** Helper: create a buffer of N WTS filled with a value */
  function makeBuffer(wtsCount: number, value: number, extraSamples = 0): number[] {
    return new Array(wtsCount * SAMPLES_PER_WTS + extraSamples).fill(value);
  }

  /** Helper: create a buffer of N neutral WTS followed by M non-neutral WTS */
  function makeBufferWithNeutralPrefix(neutralWTS: number, dataWTS: number, value: number): number[] {
    return [
      ...new Array(neutralWTS * SAMPLES_PER_WTS).fill(0),
      ...new Array(dataWTS * SAMPLES_PER_WTS).fill(value),
    ];
  }

  it('returns empty result when outputSlotIndices is empty', () => {
    const snapshot = new Map([[3, makeBuffer(4, 50)]]);
    const result = prepareSnapshotBuffers(snapshot, []);
    expect(result.cleanedSnapshot.size).toBe(0);
    expect(result.totalCleanWTS).toBe(0);
  });

  it('returns empty result when output buffer is empty', () => {
    const snapshot = new Map([[3, []]]);
    const result = prepareSnapshotBuffers(snapshot, [3]);
    expect(result.cleanedSnapshot.size).toBe(0);
    expect(result.totalCleanWTS).toBe(0);
  });

  it('truncates partial trailing chunk', () => {
    // 4 complete WTS + 5 extra samples
    const snapshot = new Map([[3, makeBuffer(4, 50, 5)]]);
    const result = prepareSnapshotBuffers(snapshot, [3]);
    const buf = result.cleanedSnapshot.get(3)!;
    expect(buf.length).toBe(4 * SAMPLES_PER_WTS);
    expect(result.totalCleanWTS).toBe(4);
  });

  it('strips leading neutral WTS', () => {
    // 3 neutral WTS + 5 data WTS
    const snapshot = new Map([[3, makeBufferWithNeutralPrefix(3, 5, 42)]]);
    const result = prepareSnapshotBuffers(snapshot, [3]);
    expect(result.totalCleanWTS).toBe(5);
    const buf = result.cleanedSnapshot.get(3)!;
    expect(buf.length).toBe(5 * SAMPLES_PER_WTS);
    // First sample should be the non-neutral value
    expect(buf[0]).toBe(42);
  });

  it('preserves all data when there are no neutral WTS', () => {
    const snapshot = new Map([[3, makeBuffer(10, 75)]]);
    const result = prepareSnapshotBuffers(snapshot, [3]);
    expect(result.totalCleanWTS).toBe(10);
    expect(result.cleanedSnapshot.get(3)!.length).toBe(10 * SAMPLES_PER_WTS);
  });

  it('handles multiple output slots — uses minimum length', () => {
    // Slot 3 has 5 WTS, slot 4 has 3 WTS + extra
    const snapshot = new Map([
      [3, makeBuffer(5, 50)],
      [4, makeBuffer(3, 60, 8)],
    ]);
    const result = prepareSnapshotBuffers(snapshot, [3, 4]);
    // Both truncated to 3 WTS (min complete)
    expect(result.totalCleanWTS).toBe(3);
    expect(result.cleanedSnapshot.get(3)!.length).toBe(3 * SAMPLES_PER_WTS);
    expect(result.cleanedSnapshot.get(4)!.length).toBe(3 * SAMPLES_PER_WTS);
  });

  it('strips neutral prefix across multiple output slots', () => {
    // Both slots have 2 neutral WTS, but slot 3 becomes non-neutral at WTS 2
    // while slot 4 is all non-neutral after WTS 2
    const buf3 = makeBufferWithNeutralPrefix(2, 4, 50);
    const buf4 = makeBufferWithNeutralPrefix(2, 4, 30);
    const snapshot = new Map([
      [3, buf3],
      [4, buf4],
    ]);
    const result = prepareSnapshotBuffers(snapshot, [3, 4]);
    expect(result.totalCleanWTS).toBe(4);
    expect(result.cleanedSnapshot.get(3)![0]).toBe(50);
    expect(result.cleanedSnapshot.get(4)![0]).toBe(30);
  });

  it('keeps neutral prefix if only one output slot is neutral', () => {
    // Slot 3 has neutral first WTS, slot 4 has data from the start
    // Since not ALL output slots are neutral at WTS 0, no stripping
    const buf3 = makeBufferWithNeutralPrefix(1, 3, 50);
    const buf4 = makeBuffer(4, 60);
    const snapshot = new Map([
      [3, buf3],
      [4, buf4],
    ]);
    const result = prepareSnapshotBuffers(snapshot, [3, 4]);
    expect(result.totalCleanWTS).toBe(4);
    // Slot 3 still has the neutral prefix since not ALL outputs were neutral
    expect(result.cleanedSnapshot.get(3)![0]).toBe(0);
    expect(result.cleanedSnapshot.get(4)![0]).toBe(60);
  });

  it('returns empty when all data is neutral', () => {
    const snapshot = new Map([[3, makeBuffer(5, 0)]]);
    const result = prepareSnapshotBuffers(snapshot, [3]);
    expect(result.totalCleanWTS).toBe(0);
    expect(result.cleanedSnapshot.get(3)!.length).toBe(0);
  });

  it('includes non-output buffers and keeps them aligned', () => {
    // Input slot 0 + output slot 3, with 2 neutral prefix WTS on output
    const snapshot = new Map([
      [0, makeBuffer(6, 80)], // Input slot
      [3, makeBufferWithNeutralPrefix(2, 4, 50)], // Output slot
    ]);
    const result = prepareSnapshotBuffers(snapshot, [3]);
    expect(result.totalCleanWTS).toBe(4);
    // Input buffer is also trimmed and aligned
    const inputBuf = result.cleanedSnapshot.get(0)!;
    expect(inputBuf.length).toBe(4 * SAMPLES_PER_WTS);
  });

  it('TRIM_WINDOW_WTS constant is 16', () => {
    expect(TRIM_WINDOW_WTS).toBe(16);
  });
});
