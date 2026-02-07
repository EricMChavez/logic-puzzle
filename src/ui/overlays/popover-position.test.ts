import { describe, it, expect } from 'vitest';
import { computePopoverPosition } from './popover-position.ts';

const viewport = { width: 1280, height: 720 };
const popoverSize = { width: 200, height: 100 };

describe('computePopoverPosition', () => {
  it('prefers right side when there is space', () => {
    const anchor = { x: 100, y: 300, width: 120, height: 80 };
    const result = computePopoverPosition(anchor, popoverSize, viewport);
    expect(result.side).toBe('right');
    expect(result.left).toBe(100 + 120 + 8);
  });

  it('falls back to left when right overflows', () => {
    const anchor = { x: 1100, y: 300, width: 120, height: 80 };
    const result = computePopoverPosition(anchor, popoverSize, viewport);
    expect(result.side).toBe('left');
    expect(result.left).toBe(1100 - 200 - 8);
  });

  it('falls back to below when left also overflows', () => {
    const anchor = { x: 50, y: 300, width: 1200, height: 80 };
    const result = computePopoverPosition(anchor, popoverSize, viewport);
    // Both left and right overflow, should try below
    expect(result.side).toBe('below');
  });

  it('falls back to above when below overflows', () => {
    const anchor = { x: 50, y: 620, width: 1200, height: 80 };
    const result = computePopoverPosition(anchor, popoverSize, viewport);
    expect(result.side).toBe('above');
    expect(result.top).toBe(620 - 100 - 8);
  });

  it('applies canvas offset', () => {
    const anchor = { x: 100, y: 100, width: 120, height: 80 };
    const offset = { x: 50, y: 30 };
    const result = computePopoverPosition(anchor, popoverSize, viewport, offset);
    expect(result.side).toBe('right');
    expect(result.left).toBe(100 + 50 + 120 + 8);
    expect(result.top).toBe(100 + 30 + 80 / 2 - 100 / 2);
  });

  it('vertically centers relative to anchor', () => {
    const anchor = { x: 100, y: 300, width: 120, height: 80 };
    const result = computePopoverPosition(anchor, popoverSize, viewport);
    expect(result.top).toBe(300 + 80 / 2 - 100 / 2);
  });

  it('handles zero-size viewport gracefully (fallback)', () => {
    const anchor = { x: 100, y: 100, width: 120, height: 80 };
    const smallViewport = { width: 100, height: 100 };
    const result = computePopoverPosition(anchor, popoverSize, smallViewport);
    // Should return a clamped position
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.top).toBeGreaterThanOrEqual(0);
  });

  it('handles popover larger than viewport', () => {
    const anchor = { x: 10, y: 10, width: 50, height: 50 };
    const bigPopover = { width: 2000, height: 1000 };
    const result = computePopoverPosition(anchor, bigPopover, viewport);
    expect(result.left).toBeGreaterThanOrEqual(0);
  });
});
