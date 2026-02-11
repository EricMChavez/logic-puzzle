import { describe, it, expect, vi } from 'vitest';
import {
  hexToRgb,
  lerpColor,
  signalToColor,
  signalToGlow,
  getWireSignal,
  drawWires,
  buildWirePixelPath,
} from './render-wires';
import type { ThemeTokens } from '../../shared/tokens/token-types';
import type { Wire } from '../../shared/types/index';

/** Minimal tokens for signal colour tests (dark theme values) */
const tokens: Pick<ThemeTokens, 'signalPositive' | 'signalNegative' | 'signalZero' | 'colorNeutral' | 'wireWidthBase'> = {
  signalPositive: '#ff9200',
  signalNegative: '#0782e0',
  signalZero: '#d0d0d8',
  colorNeutral: '#242424',
  wireWidthBase: '6',
};

// ── hexToRgb ────────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#e8a838')).toEqual([232, 168, 56]);
  });

  it('parses 3-digit hex', () => {
    // #abc → #aabbcc → [170, 187, 204]
    expect(hexToRgb('#abc')).toEqual([170, 187, 204]);
  });

  it('works without leading hash', () => {
    expect(hexToRgb('38b8a0')).toEqual([56, 184, 160]);
  });

  it('parses black', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('parses white', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
  });
});

// ── lerpColor ───────────────────────────────────────────────────────────────

describe('lerpColor', () => {
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [100, 200, 50];

  it('t=0 returns first colour', () => {
    expect(lerpColor(a, b, 0)).toBe('rgb(0,0,0)');
  });

  it('t=1 returns second colour', () => {
    expect(lerpColor(a, b, 1)).toBe('rgb(100,200,50)');
  });

  it('t=0.5 returns midpoint', () => {
    expect(lerpColor(a, b, 0.5)).toBe('rgb(50,100,25)');
  });

  it('lerp(signalZero, positive, 0) = signalZero', () => {
    const zero = hexToRgb(tokens.signalZero);
    const positive = hexToRgb(tokens.signalPositive);
    expect(lerpColor(zero, positive, 0)).toBe(
      `rgb(${zero[0]},${zero[1]},${zero[2]})`,
    );
  });

  it('lerp(signalZero, positive, 1) = positive', () => {
    const zero = hexToRgb(tokens.signalZero);
    const positive = hexToRgb(tokens.signalPositive);
    expect(lerpColor(zero, positive, 1)).toBe(
      `rgb(${positive[0]},${positive[1]},${positive[2]})`,
    );
  });
});

// ── signalToColor ───────────────────────────────────────────────────────────

describe('signalToColor', () => {
  it('signal 0 → signalZero (soft white)', () => {
    const result = signalToColor(0, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalZero);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal +100 → full positive (colorRampEnd=100)', () => {
    const result = signalToColor(100, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalPositive);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal -100 → full negative (colorRampEnd=100)', () => {
    const result = signalToColor(-100, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalNegative);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal +50 → intermediate between signalZero and positive', () => {
    const result = signalToColor(50, tokens as ThemeTokens);
    // t = 50/100 = 0.5
    const zero = hexToRgb(tokens.signalZero);
    const pos = hexToRgb(tokens.signalPositive);
    const t = 50 / 100;
    const expected = `rgb(${Math.round(zero[0] + (pos[0] - zero[0]) * t)},${Math.round(zero[1] + (pos[1] - zero[1]) * t)},${Math.round(zero[2] + (pos[2] - zero[2]) * t)})`;
    expect(result).toBe(expected);
  });
});

// ── signalToGlow ────────────────────────────────────────────────────────────

describe('signalToGlow', () => {
  it('0 → 0', () => {
    expect(signalToGlow(0)).toBe(0);
  });

  it('50 → 0 (below threshold)', () => {
    expect(signalToGlow(50)).toBe(0);
  });

  it('75 → 0 (at threshold boundary)', () => {
    expect(signalToGlow(75)).toBe(0);
  });

  it('-75 → 0 (at threshold boundary, negative)', () => {
    expect(signalToGlow(-75)).toBe(0);
  });

  it('87.5 → 15 (midpoint of ramp)', () => {
    expect(signalToGlow(87.5)).toBe(15);
  });

  it('-87.5 → 15 (negative midpoint)', () => {
    expect(signalToGlow(-87.5)).toBe(15);
  });

  it('100 → 30 (max glow)', () => {
    expect(signalToGlow(100)).toBe(30);
  });

  it('-100 → 30 (max glow, negative)', () => {
    expect(signalToGlow(-100)).toBe(30);
  });
});

// ── getWireSignal ─────────────────────────────────────────────────────────

describe('getWireSignal', () => {
  it('returns 0 when wireValues is undefined', () => {
    expect(getWireSignal('w1', undefined)).toBe(0);
  });

  it('returns 0 when wire not in map', () => {
    const map = new Map<string, number>();
    expect(getWireSignal('w1', map)).toBe(0);
  });

  it('returns the value from the map', () => {
    const map = new Map<string, number>([['w1', 42]]);
    expect(getWireSignal('w1', map)).toBe(42);
  });

  it('returns negative values', () => {
    const map = new Map<string, number>([['w1', -75]]);
    expect(getWireSignal('w1', map)).toBe(-75);
  });
});

// ── drawWires ───────────────────────────────────────────────────────────────

describe('drawWires', () => {
  function makeMockCtx() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
      lineJoin: 'miter',
      lineCap: 'butt',
      shadowColor: '',
      shadowBlur: 0,
    } as unknown as CanvasRenderingContext2D;
  }

  const fullTokens = {
    signalPositive: '#ff9200',
    signalNegative: '#0782e0',
    signalZero: '#d0d0d8',
    colorNeutral: '#242424',
    wireWidthBase: '6',
  } as ThemeTokens;

  it('skips wires with empty path', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [],
    };
    drawWires(ctx, fullTokens, [wire], 40);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws a wire with a multi-point path', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
      ],
    };
    drawWires(ctx, fullTokens, [wire], 40);
    // 3 passes: base polyline + polarity polyline (signal=0 so no glow) = 2 beginPath calls
    // But with signal=0, glow pass is skipped. So: base (1) + polarity (1) = 2
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('single-point path draws base only, no segments', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [{ col: 5, row: 5 }],
    };
    drawWires(ctx, fullTokens, [wire], 40);
    // Only 1 beginPath call for the base polyline (a single moveTo, no lineTo segments)
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('neutralOnly draws only 1 beginPath per wire (pass 1 only)', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
      ],
    };
    const wireValues = new Map([['w1', 100]]); // would normally trigger glow + polarity
    drawWires(ctx, fullTokens, [wire], 40, undefined, wireValues, true);
    // neutralOnly: only 1 beginPath call (base pass only), glow + polarity skipped
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

// ── buildWirePixelPath ──────────────────────────────────────────────────────

describe('buildWirePixelPath', () => {
  it('returns empty array for wire with empty path and no nodes', () => {
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [],
    };
    expect(buildWirePixelPath(wire, 40)).toEqual([]);
  });

  it('converts grid path to pixel coordinates', () => {
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [{ col: 2, row: 3 }, { col: 4, row: 3 }],
    };
    const pts = buildWirePixelPath(wire, 10);
    expect(pts).toEqual([{ x: 20, y: 30 }, { x: 40, y: 30 }]);
  });

  it('deduplicates adjacent coincident points', () => {
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [
        { col: 2, row: 3 },
        { col: 2, row: 3 }, // duplicate
        { col: 4, row: 3 },
      ],
    };
    const pts = buildWirePixelPath(wire, 10);
    expect(pts.length).toBe(2);
    expect(pts).toEqual([{ x: 20, y: 30 }, { x: 40, y: 30 }]);
  });
});
