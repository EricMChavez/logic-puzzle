import { describe, it, expect, vi } from 'vitest';
import {
  computeCumulativeDistances,
  interpolateAlongPath,
  drawWireBlips,
} from './render-wire-blips';
import type { WireAnimationCache } from './wire-animation';
import type { Wire } from '../../shared/types/index';
import type { ThemeTokens } from '../../shared/tokens/token-types';

// ── computeCumulativeDistances ──────────────────────────────────────────────

describe('computeCumulativeDistances', () => {
  it('returns [0] for a single point', () => {
    expect(computeCumulativeDistances([{ x: 10, y: 20 }])).toEqual([0]);
  });

  it('computes correct distances for horizontal line', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 7, y: 0 }];
    const dists = computeCumulativeDistances(pts);
    expect(dists).toEqual([0, 3, 7]);
  });

  it('computes correct distances for vertical line', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 0, y: 10 }];
    const dists = computeCumulativeDistances(pts);
    expect(dists).toEqual([0, 4, 10]);
  });

  it('computes correct distances for diagonal', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
    const dists = computeCumulativeDistances(pts);
    expect(dists[0]).toBe(0);
    expect(dists[1]).toBe(5); // 3-4-5 triangle
  });

  it('handles multiple segments', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ];
    const dists = computeCumulativeDistances(pts);
    expect(dists).toEqual([0, 10, 20, 30]);
  });
});

// ── interpolateAlongPath ────────────────────────────────────────────────────

describe('interpolateAlongPath', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const cumDist = [0, 10, 20];

  it('returns first point at distance 0', () => {
    const p = interpolateAlongPath(pts, cumDist, 0);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('returns last point at total distance', () => {
    const p = interpolateAlongPath(pts, cumDist, 20);
    expect(p.x).toBe(10);
    expect(p.y).toBe(10);
  });

  it('returns last point when distance exceeds total', () => {
    const p = interpolateAlongPath(pts, cumDist, 100);
    expect(p.x).toBe(10);
    expect(p.y).toBe(10);
  });

  it('returns first point for negative distance', () => {
    const p = interpolateAlongPath(pts, cumDist, -5);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('interpolates midpoint of first segment', () => {
    const p = interpolateAlongPath(pts, cumDist, 5);
    expect(p.x).toBe(5);
    expect(p.y).toBe(0);
  });

  it('interpolates midpoint of second segment', () => {
    const p = interpolateAlongPath(pts, cumDist, 15);
    expect(p.x).toBe(10);
    expect(p.y).toBe(5);
  });

  it('interpolates at segment boundary', () => {
    const p = interpolateAlongPath(pts, cumDist, 10);
    expect(p.x).toBe(10);
    expect(p.y).toBe(0);
  });

  it('handles empty points array', () => {
    const p = interpolateAlongPath([], [], 5);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });
});

// ── drawWireBlips ───────────────────────────────────────────────────────────

describe('drawWireBlips', () => {
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

  it('makes no draw calls when globalProgress = 0 and all depart > 0', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'nodeA', portIndex: 0, side: 'output' },
      target: { nodeId: '__cp_output_0__', portIndex: 0, side: 'input' },
      path: [{ col: 10, row: 5 }, { col: 15, row: 5 }],
    };

    const cache: WireAnimationCache = {
      timings: new Map([['w1', {
        wireId: 'w1',
        departPhase: 0.5,
        arrivePhase: 1,
        signalValue: 50,
      }]]),
    };

    drawWireBlips(ctx, fullTokens, [wire], new Map(), 20, cache, 0);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws blip segments when globalProgress is within wire phase', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: '__cp_input_0__', portIndex: 0, side: 'output' },
      target: { nodeId: '__cp_output_0__', portIndex: 0, side: 'input' },
      path: [{ col: 10, row: 5 }, { col: 15, row: 5 }],
    };

    const cache: WireAnimationCache = {
      timings: new Map([['w1', {
        wireId: 'w1',
        departPhase: 0,
        arrivePhase: 1,
        signalValue: 50,
      }]]),
    };

    drawWireBlips(ctx, fullTokens, [wire], new Map(), 20, cache, 0.5);
    // Should have drawn blip segments (5 alpha steps)
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBe(5);
  });

  it('makes no draw calls when globalProgress >= arrivePhase (blip exits at arrival)', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: '__cp_input_0__', portIndex: 0, side: 'output' },
      target: { nodeId: '__cp_output_0__', portIndex: 0, side: 'input' },
      path: [{ col: 10, row: 5 }, { col: 15, row: 5 }],
    };

    const cache: WireAnimationCache = {
      timings: new Map([['w1', {
        wireId: 'w1',
        departPhase: 0,
        arrivePhase: 0.5,
        signalValue: 50,
      }]]),
    };

    // globalProgress at exactly arrivePhase — blip should have exited
    drawWireBlips(ctx, fullTokens, [wire], new Map(), 20, cache, 0.5);
    expect(ctx.beginPath).not.toHaveBeenCalled();

    // globalProgress past arrivePhase — still no blip
    drawWireBlips(ctx, fullTokens, [wire], new Map(), 20, cache, 0.8);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('skips wire with no timing entry', () => {
    const ctx = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: '__cp_input_0__', portIndex: 0, side: 'output' },
      target: { nodeId: '__cp_output_0__', portIndex: 0, side: 'input' },
      path: [{ col: 10, row: 5 }, { col: 15, row: 5 }],
    };

    const cache: WireAnimationCache = { timings: new Map() };
    drawWireBlips(ctx, fullTokens, [wire], new Map(), 20, cache, 0.5);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('skips wire with less than 2 pixel path points', () => {
    const ctx = makeMockCtx();
    // Use non-CP nodes that aren't in the nodes map, so getPortPixelPosition returns null
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'missing_a', portIndex: 0, side: 'output' },
      target: { nodeId: 'missing_b', portIndex: 0, side: 'input' },
      path: [], // No path, no matching nodes → empty pixel path
    };

    const cache: WireAnimationCache = {
      timings: new Map([['w1', {
        wireId: 'w1',
        departPhase: 0,
        arrivePhase: 1,
        signalValue: 50,
      }]]),
    };

    drawWireBlips(ctx, fullTokens, [wire], new Map(), 20, cache, 0.5);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });
});
