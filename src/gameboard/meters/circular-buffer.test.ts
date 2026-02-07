import { describe, it, expect } from 'vitest';
import { MeterCircularBuffer } from './circular-buffer.ts';

describe('MeterCircularBuffer', () => {
  it('starts empty with count 0', () => {
    const buf = new MeterCircularBuffer(4);
    expect(buf.count).toBe(0);
    expect(buf.latest()).toBe(0);
  });

  it('pushes and reads sequentially', () => {
    const buf = new MeterCircularBuffer(4);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    expect(buf.count).toBe(3);
    expect(buf.at(0)).toBe(10); // oldest
    expect(buf.at(1)).toBe(20);
    expect(buf.at(2)).toBe(30); // newest
    expect(buf.latest()).toBe(30);
  });

  it('wraps around when full', () => {
    const buf = new MeterCircularBuffer(4);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    expect(buf.count).toBe(4);

    // Push a 5th — oldest (1) is evicted
    buf.push(5);
    expect(buf.count).toBe(4);
    expect(buf.at(0)).toBe(2); // oldest is now 2
    expect(buf.at(1)).toBe(3);
    expect(buf.at(2)).toBe(4);
    expect(buf.at(3)).toBe(5); // newest
    expect(buf.latest()).toBe(5);
  });

  it('returns 0 for out-of-range indices', () => {
    const buf = new MeterCircularBuffer(4);
    buf.push(10);
    expect(buf.at(-1)).toBe(0);
    expect(buf.at(1)).toBe(0); // only 1 element (index 0)
    expect(buf.at(100)).toBe(0);
  });

  it('clear resets all state', () => {
    const buf = new MeterCircularBuffer(4);
    buf.push(10);
    buf.push(20);
    buf.clear();
    expect(buf.count).toBe(0);
    expect(buf.latest()).toBe(0);
    expect(buf.at(0)).toBe(0);
  });

  it('handles single-capacity buffer', () => {
    const buf = new MeterCircularBuffer(1);
    buf.push(42);
    expect(buf.count).toBe(1);
    expect(buf.at(0)).toBe(42);
    expect(buf.latest()).toBe(42);

    buf.push(99);
    expect(buf.count).toBe(1);
    expect(buf.at(0)).toBe(99);
    expect(buf.latest()).toBe(99);
  });

  it('uses default capacity of 256', () => {
    const buf = new MeterCircularBuffer();
    expect(buf.capacity).toBe(256);
    // Fill completely
    for (let i = 0; i < 256; i++) {
      buf.push(i);
    }
    expect(buf.count).toBe(256);
    expect(buf.at(0)).toBe(0);
    expect(buf.at(255)).toBe(255);

    // One more push wraps
    buf.push(999);
    expect(buf.count).toBe(256);
    expect(buf.at(0)).toBe(1);
    expect(buf.at(255)).toBe(999);
  });

  it('latest returns most recent after wrapping', () => {
    const buf = new MeterCircularBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // wraps, evicts 1
    buf.push(5); // wraps, evicts 2
    expect(buf.latest()).toBe(5);
    expect(buf.at(0)).toBe(3);
  });
});
