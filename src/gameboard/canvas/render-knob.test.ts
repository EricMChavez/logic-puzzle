import { describe, it, expect } from 'vitest';
import { radialAngleToValue } from './render-knob.ts';

describe('radialAngleToValue', () => {
  const cx = 100;
  const cy = 100;

  // Helper: place cursor at a given angle (canvas degrees) and distance from center
  function cursorAt(canvasDeg: number, dist = 50): [number, number] {
    const rad = (canvasDeg * Math.PI) / 180;
    return [cx + Math.cos(rad) * dist, cy + Math.sin(rad) * dist];
  }

  it('returns 0 when cursor is at center (degenerate case)', () => {
    expect(radialAngleToValue(cx, cy, cx, cy)).toBe(0);
  });

  it('maps left (180°, 9 o\'clock) to -50', () => {
    // 180° is 45° offset from start (135°) → t ≈ 0.167 → raw -66.7 → snap -50
    const [x, y] = cursorAt(180);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(-50);
  });

  it('maps top (270°, 12 o\'clock) to 0', () => {
    // 270° is 135° offset from start → t = 0.5 → raw 0 → snap 0
    const [x, y] = cursorAt(270);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(0);
  });

  it('maps right (0°/360°, 3 o\'clock) to 50', () => {
    // 0° is 225° offset from start → t ≈ 0.833 → raw 66.7 → snap 50
    const [x, y] = cursorAt(0);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(50);
  });

  it('maps start angle (135°, 7 o\'clock) to -100', () => {
    // Exactly at start → t = 0 → raw -100
    const [x, y] = cursorAt(135);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(-100);
  });

  it('maps end angle (45°, 5 o\'clock) to 100', () => {
    // At the boundary of dead zone, should snap to +100
    const [x, y] = cursorAt(45);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(100);
  });

  // Dead zone tests (the 90° gap at bottom: 45° to 135°)
  it('clamps dead zone angle near end (60°) to +100', () => {
    // 60° is in dead zone [45°, 135°], closer to 45° end → +100
    const [x, y] = cursorAt(60);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(100);
  });

  it('clamps dead zone angle near start (120°) to -100', () => {
    // 120° is in dead zone, past midpoint (90°) → -100
    const [x, y] = cursorAt(120);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(-100);
  });

  it('clamps dead zone midpoint (90°, straight down) to -100', () => {
    // Exactly at 90° — at midpoint, goes to -100 side
    const [x, y] = cursorAt(90);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(-100);
  });

  // Snap behavior: result should always be a multiple of 50
  it('snaps intermediate positions to nearest 50-unit value', () => {
    // 225° → offset = 90° → t = 90/270 = 1/3 → raw = -33.3 → snap to -50
    const [x, y] = cursorAt(225);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(-50);
  });

  it('snaps upper-right (315°) to 0', () => {
    // 315° → offset = 180° → t = 180/270 = 2/3 → raw = 33.3 → snap to 50
    const [x, y] = cursorAt(315);
    expect(radialAngleToValue(x, y, cx, cy)).toBe(50);
  });

  it('all returned values are multiples of 50', () => {
    for (let deg = 0; deg < 360; deg += 5) {
      const [x, y] = cursorAt(deg);
      const value = radialAngleToValue(x, y, cx, cy);
      expect(value % 50 === 0).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-100);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
