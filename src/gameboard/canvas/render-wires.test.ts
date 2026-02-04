import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hexToRgb,
  lerpColor,
  signalToColor,
  signalToGlow,
  getSegmentSignal,
  drawWires,
} from './render-wires';
import type { ThemeTokens } from '../../shared/tokens/token-types';
import type { Wire } from '../../shared/types/index';

/** Minimal tokens for signal colour tests (dark theme values) */
const tokens: Pick<ThemeTokens, 'signalPositive' | 'signalNegative' | 'colorNeutral' | 'wireWidthBase'> = {
  signalPositive: '#e8a838',
  signalNegative: '#38b8a0',
  colorNeutral: '#3a3a4a',
  wireWidthBase: '2.5',
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

  it('lerp(neutral, positive, 0) = neutral', () => {
    const neutral = hexToRgb(tokens.colorNeutral);
    const positive = hexToRgb(tokens.signalPositive);
    expect(lerpColor(neutral, positive, 0)).toBe(
      `rgb(${neutral[0]},${neutral[1]},${neutral[2]})`,
    );
  });

  it('lerp(neutral, positive, 1) = positive', () => {
    const neutral = hexToRgb(tokens.colorNeutral);
    const positive = hexToRgb(tokens.signalPositive);
    expect(lerpColor(neutral, positive, 1)).toBe(
      `rgb(${positive[0]},${positive[1]},${positive[2]})`,
    );
  });
});

// ── signalToColor ───────────────────────────────────────────────────────────

describe('signalToColor', () => {
  it('signal 0 → neutral', () => {
    const result = signalToColor(0, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.colorNeutral);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal +75 → full positive', () => {
    const result = signalToColor(75, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalPositive);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal +100 → clamped at full positive', () => {
    const result = signalToColor(100, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalPositive);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal -75 → full negative', () => {
    const result = signalToColor(-75, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalNegative);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal -100 → clamped at full negative', () => {
    const result = signalToColor(-100, tokens as ThemeTokens);
    const [r, g, b] = hexToRgb(tokens.signalNegative);
    expect(result).toBe(`rgb(${r},${g},${b})`);
  });

  it('signal +50 → intermediate between neutral and positive', () => {
    const result = signalToColor(50, tokens as ThemeTokens);
    // t = 50/75 ≈ 0.667
    const neutral = hexToRgb(tokens.colorNeutral);
    const pos = hexToRgb(tokens.signalPositive);
    const t = 50 / 75;
    const expected = `rgb(${Math.round(neutral[0] + (pos[0] - neutral[0]) * t)},${Math.round(neutral[1] + (pos[1] - neutral[1]) * t)},${Math.round(neutral[2] + (pos[2] - neutral[2]) * t)})`;
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

  it('87.5 → 6 (midpoint of ramp)', () => {
    expect(signalToGlow(87.5)).toBe(6);
  });

  it('-87.5 → 6 (negative midpoint)', () => {
    expect(signalToGlow(-87.5)).toBe(6);
  });

  it('100 → 12 (max glow)', () => {
    expect(signalToGlow(100)).toBe(12);
  });

  it('-100 → 12 (max glow, negative)', () => {
    expect(signalToGlow(-100)).toBe(12);
  });
});

// ── getSegmentSignal ────────────────────────────────────────────────────────

describe('getSegmentSignal', () => {
  function makeWire(buffer: number[], writeHead: number) {
    return { signalBuffer: buffer, writeHead };
  }

  it('segment 0 (source) returns newest sample', () => {
    // Buffer: [10,20,30,...], writeHead=3 → newest = index 2 (value 30)
    const buf = new Array(16).fill(0);
    buf[0] = 10; buf[1] = 20; buf[2] = 30;
    const wire = makeWire(buf, 3);
    expect(getSegmentSignal(wire, 0, 10)).toBe(30);
  });

  it('last segment (target) returns oldest sample', () => {
    // Buffer filled 0..15, writeHead=0 (wrapped) → newest = idx 15, oldest = idx 0
    const buf = Array.from({ length: 16 }, (_, i) => i);
    const wire = makeWire(buf, 0);
    // segment N-1 of N → t=1 → sampleOffset=15 → bufIdx = (15-15+16)%16 = 0
    expect(getSegmentSignal(wire, 9, 10)).toBe(0);
  });

  it('single-segment wire returns newest sample', () => {
    const buf = new Array(16).fill(0);
    buf[5] = 42;
    const wire = makeWire(buf, 6);
    // totalSegments=1 → t=0 → newest
    expect(getSegmentSignal(wire, 0, 1)).toBe(42);
  });

  it('midpoint segment maps to middle of buffer', () => {
    // Buffer: indices 0..15, writeHead=0 → newest=15
    const buf = Array.from({ length: 16 }, (_, i) => i * 10);
    const wire = makeWire(buf, 0);
    // segment 5 of 16 segments → t=5/15 ≈ 0.333 → offset = floor(0.333*15) = 5
    // bufIdx = (15-5+16)%16 = 10 → value = 100
    expect(getSegmentSignal(wire, 5, 16)).toBe(100);
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
    signalPositive: '#e8a838',
    signalNegative: '#38b8a0',
    colorNeutral: '#3a3a4a',
    wireWidthBase: '2.5',
  } as ThemeTokens;

  it('skips wires with empty path', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [],
      signalBuffer: new Array(16).fill(0),
      writeHead: 0,
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
      signalBuffer: new Array(16).fill(0),
      writeHead: 0,
    };
    drawWires(ctx, fullTokens, [wire], 40);
    // At minimum: 1 base-pass beginPath + 2 segment color passes = 3
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('single-point path draws base only, no segments', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'a', portIndex: 0, side: 'output' },
      target: { nodeId: 'b', portIndex: 0, side: 'input' },
      path: [{ col: 5, row: 5 }],
      signalBuffer: new Array(16).fill(0),
      writeHead: 0,
    };
    drawWires(ctx, fullTokens, [wire], 40);
    // Only 1 beginPath call for the base polyline (a single moveTo, no lineTo segments)
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
