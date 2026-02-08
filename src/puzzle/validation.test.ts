import { describe, it, expect } from 'vitest';
import { validatePort, validateAllPorts, validateBuffers } from './validation.ts';
import { MeterCircularBuffer } from '../gameboard/meters/circular-buffer.ts';
import { METER_BUFFER_CAPACITY } from '../gameboard/meters/meter-types.ts';

describe('validatePort', () => {
  it('matches when actual equals target', () => {
    expect(validatePort(50, 50, 5)).toBe(true);
  });

  it('matches when difference is exactly at tolerance boundary', () => {
    expect(validatePort(55, 50, 5)).toBe(true);
    expect(validatePort(45, 50, 5)).toBe(true);
  });

  it('does not match when difference exceeds tolerance', () => {
    expect(validatePort(56, 50, 5)).toBe(false);
    expect(validatePort(44, 50, 5)).toBe(false);
  });

  it('handles negative values', () => {
    expect(validatePort(-50, -50, 5)).toBe(true);
    expect(validatePort(-45, -50, 5)).toBe(true);
    expect(validatePort(-44, -50, 5)).toBe(false);
  });

  it('handles zero tolerance', () => {
    expect(validatePort(50, 50, 0)).toBe(true);
    expect(validatePort(50.1, 50, 0)).toBe(false);
  });
});

describe('validateAllPorts', () => {
  it('returns allMatch true when all ports match', () => {
    const result = validateAllPorts([50, 60], [50, 60], 5);
    expect(result.allMatch).toBe(true);
    expect(result.perPort).toEqual([true, true]);
  });

  it('returns allMatch false when one port fails', () => {
    const result = validateAllPorts([50, 70], [50, 60], 5);
    expect(result.allMatch).toBe(false);
    expect(result.perPort).toEqual([true, false]);
  });

  it('returns allMatch false when all ports fail', () => {
    const result = validateAllPorts([0, 0], [50, 60], 5);
    expect(result.allMatch).toBe(false);
    expect(result.perPort).toEqual([false, false]);
  });

  it('returns allMatch false for empty arrays', () => {
    const result = validateAllPorts([], [], 5);
    expect(result.allMatch).toBe(false);
    expect(result.perPort).toEqual([]);
  });

  it('uses min length when arrays differ in length', () => {
    const result = validateAllPorts([50, 60, 70], [50, 60], 5);
    expect(result.perPort).toHaveLength(2);
    expect(result.allMatch).toBe(true);
  });

  it('handles single port', () => {
    const result = validateAllPorts([50], [55], 5);
    expect(result.allMatch).toBe(true);
    expect(result.perPort).toEqual([true]);
  });
});

describe('validateBuffers', () => {
  it('returns allMatch true when full buffers match exactly', () => {
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < METER_BUFFER_CAPACITY; i++) {
      output.push(50);
      target.push(50);
    }
    const result = validateBuffers(output, target, 0);
    expect(result.allMatch).toBe(true);
    expect(result.matchCount).toBe(METER_BUFFER_CAPACITY);
    expect(result.perSample.every(v => v)).toBe(true);
  });

  it('returns allMatch false when buffers are not full', () => {
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < 100; i++) {
      output.push(50);
      target.push(50);
    }
    const result = validateBuffers(output, target, 0);
    expect(result.allMatch).toBe(false);
    expect(result.matchCount).toBe(100);
  });

  it('returns per-sample match status', () => {
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < METER_BUFFER_CAPACITY; i++) {
      output.push(i < 128 ? 50 : 0);
      target.push(50);
    }
    const result = validateBuffers(output, target, 0);
    expect(result.allMatch).toBe(false);
    expect(result.matchCount).toBe(128);
    // First 128 match, last 128 don't
    for (let i = 0; i < 128; i++) {
      expect(result.perSample[i]).toBe(true);
    }
    for (let i = 128; i < METER_BUFFER_CAPACITY; i++) {
      expect(result.perSample[i]).toBe(false);
    }
  });

  it('detects mismatch with zero tolerance', () => {
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < METER_BUFFER_CAPACITY; i++) {
      output.push(53);
      target.push(50);
    }
    const result = validateBuffers(output, target, 0);
    expect(result.allMatch).toBe(false);
    expect(result.matchCount).toBe(0);
  });

  it('returns allMatch false for empty buffers', () => {
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const result = validateBuffers(output, target, 0);
    expect(result.allMatch).toBe(false);
    expect(result.matchCount).toBe(0);
    expect(result.perSample).toHaveLength(0);
  });

  it('aligns newest samples when output is partially filled and target is full', () => {
    // Target: full buffer with distinct values per position
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < METER_BUFFER_CAPACITY; i++) {
      target.push(i); // target.at(i) = i
    }

    // Output: only 10 samples, matching the LAST 10 target values (newest-aligned)
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    const offset = METER_BUFFER_CAPACITY - 10;
    for (let i = 0; i < 10; i++) {
      output.push(offset + i); // matches target.at(offset + i)
    }

    const result = validateBuffers(output, target, 0);
    expect(result.perSample).toHaveLength(10);
    expect(result.matchCount).toBe(10);
    expect(result.perSample.every(v => v)).toBe(true);
  });

  it('detects mismatches with offset alignment', () => {
    const target = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < METER_BUFFER_CAPACITY; i++) {
      target.push(i);
    }

    // Output: 10 samples matching the FIRST 10 target values (wrong alignment)
    const output = new MeterCircularBuffer(METER_BUFFER_CAPACITY);
    for (let i = 0; i < 10; i++) {
      output.push(i); // matches target.at(i) but NOT target.at(i + offset)
    }

    const result = validateBuffers(output, target, 0);
    expect(result.perSample).toHaveLength(10);
    expect(result.matchCount).toBe(0);
  });
});
