import { describe, it, expect } from 'vitest';
import {
  getRotatedPortSide,
  getRotatedSize,
  getPortApproachDirection,
  getPortOffset,
} from './rotation';

describe('getRotatedPortSide', () => {
  it('returns left/right for 0° rotation', () => {
    expect(getRotatedPortSide('input', 0)).toBe('left');
    expect(getRotatedPortSide('output', 0)).toBe('right');
  });

  it('returns top/bottom for 90° rotation', () => {
    expect(getRotatedPortSide('input', 90)).toBe('top');
    expect(getRotatedPortSide('output', 90)).toBe('bottom');
  });

  it('returns right/left for 180° rotation', () => {
    expect(getRotatedPortSide('input', 180)).toBe('right');
    expect(getRotatedPortSide('output', 180)).toBe('left');
  });

  it('returns bottom/top for 270° rotation', () => {
    expect(getRotatedPortSide('input', 270)).toBe('bottom');
    expect(getRotatedPortSide('output', 270)).toBe('top');
  });
});

describe('getRotatedSize', () => {
  it('preserves dimensions at 0° and 180°', () => {
    expect(getRotatedSize(3, 2, 0)).toEqual({ cols: 3, rows: 2 });
    expect(getRotatedSize(3, 2, 180)).toEqual({ cols: 3, rows: 2 });
  });

  it('swaps dimensions at 90° and 270°', () => {
    expect(getRotatedSize(3, 2, 90)).toEqual({ cols: 2, rows: 3 });
    expect(getRotatedSize(3, 2, 270)).toEqual({ cols: 2, rows: 3 });
  });

  it('handles square nodes', () => {
    expect(getRotatedSize(2, 2, 0)).toEqual({ cols: 2, rows: 2 });
    expect(getRotatedSize(2, 2, 90)).toEqual({ cols: 2, rows: 2 });
  });
});

describe('getPortApproachDirection', () => {
  it('returns correct approach directions', () => {
    expect(getPortApproachDirection('left')).toBe('west');
    expect(getPortApproachDirection('right')).toBe('east');
    expect(getPortApproachDirection('top')).toBe('north');
    expect(getPortApproachDirection('bottom')).toBe('south');
  });
});

describe('getPortOffset', () => {
  describe('left side ports', () => {
    it('distributes ports at integer grid positions', () => {
      // 3x2 node with 2 input ports on left
      // Ports at rows 0 and 1 (integer grid positions)
      expect(getPortOffset(3, 2, 2, 0, 'left')).toEqual({ col: 0, row: 0 });
      expect(getPortOffset(3, 2, 2, 1, 'left')).toEqual({ col: 0, row: 1 });
    });
  });

  describe('right side ports', () => {
    it('centers single port at integer position', () => {
      // 3x2 node with 1 output port on right
      // Single port centered at row = floor(2 / 2) = 1
      expect(getPortOffset(3, 2, 1, 0, 'right')).toEqual({ col: 3, row: 1 });
    });
  });

  describe('top side ports', () => {
    it('distributes ports at integer grid positions', () => {
      // 3x2 node with 2 input ports on top (after 90° rotation)
      // Ports at cols 0 and 1 (integer grid positions)
      expect(getPortOffset(3, 2, 2, 0, 'top')).toEqual({ col: 0, row: 0 });
      expect(getPortOffset(3, 2, 2, 1, 'top')).toEqual({ col: 1, row: 0 });
    });
  });

  describe('bottom side ports', () => {
    it('centers single port at integer position', () => {
      // 3x2 node with 1 output port on bottom
      // Single port centered at col = floor(3 / 2) = 1
      expect(getPortOffset(3, 2, 1, 0, 'bottom')).toEqual({ col: 1, row: 2 });
    });
  });
});
