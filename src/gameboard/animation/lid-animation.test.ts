import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drawLidAnimation, computeProgress, parseDurationMs } from './lid-animation.ts';
import type { LidAnimationState } from '../../store/slices/animation-slice.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';

// Minimal mock ThemeTokens
function mockTokens(): ThemeTokens {
  const tokens: Record<string, string> = {};
  tokens.animZoomDuration = '500ms';
  tokens.gameboardSurface = '#0a0a12';
  return tokens as unknown as ThemeTokens;
}

// Mock OffscreenCanvas with drawable surface
function mockSnapshot(w = 1920, h = 1080): OffscreenCanvas {
  return { width: w, height: h } as unknown as OffscreenCanvas;
}

// Capture all drawImage calls
function mockContext() {
  const calls: { method: string; args: unknown[] }[] = [];

  return {
    calls,
    ctx: {
      drawImage: vi.fn((...args: unknown[]) => calls.push({ method: 'drawImage', args })),
      fillRect: vi.fn((...args: unknown[]) => calls.push({ method: 'fillRect', args })),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillStyle: '',
      save: vi.fn(),
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D,
  };
}

describe('parseDurationMs', () => {
  it('parses "500ms" to 500', () => {
    expect(parseDurationMs('500ms')).toBe(500);
  });

  it('parses "0ms" to 0', () => {
    expect(parseDurationMs('0ms')).toBe(0);
  });

  it('parses "300" to 300', () => {
    expect(parseDurationMs('300')).toBe(300);
  });

  it('defaults to 500 for non-numeric input', () => {
    expect(parseDurationMs('abc')).toBe(500);
  });

  it('defaults to 500 for empty string', () => {
    expect(parseDurationMs('')).toBe(500);
  });
});

describe('computeProgress', () => {
  it('returns 0 at startTime', () => {
    expect(computeProgress(1000, 1000, 500)).toBe(0);
  });

  it('returns 0.5 at halfway', () => {
    expect(computeProgress(1000, 1250, 500)).toBe(0.5);
  });

  it('returns 1 at end', () => {
    expect(computeProgress(1000, 1500, 500)).toBe(1);
  });

  it('clamps to 1 past end', () => {
    expect(computeProgress(1000, 2000, 500)).toBe(1);
  });

  it('clamps to 0 before start', () => {
    expect(computeProgress(1000, 500, 500)).toBe(0);
  });

  it('returns 1 instantly when duration is 0 (reduced motion)', () => {
    expect(computeProgress(1000, 1000, 0)).toBe(1);
  });

  it('returns 1 when duration is negative', () => {
    expect(computeProgress(1000, 1000, -100)).toBe(1);
  });
});

describe('drawLidAnimation', () => {
  const tokens = mockTokens();

  describe('idle state', () => {
    it('does nothing when idle', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = { type: 'idle' };
      drawLidAnimation(ctx, tokens, state, 0, 1920, 1080);
      expect(calls.length).toBe(0);
    });
  });

  describe('opening animation', () => {
    it('draws two halves of parent snapshot at progress 0 (covering canvas)', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = {
        type: 'opening',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      drawLidAnimation(ctx, tokens, state, 0, 1920, 1080);

      // At t=0 (eased = 0), both halves should cover full canvas
      const drawCalls = calls.filter((c) => c.method === 'drawImage');
      expect(drawCalls.length).toBe(2);

      // Left half: dest width = halfW * (1-0) = 960
      expect(drawCalls[0].args[5]).toBe(0);    // dest x
      expect(drawCalls[0].args[7]).toBe(960);  // dest width

      // Right half: dest x = 1920 - 960 = 960, width = 960
      expect(drawCalls[1].args[5]).toBe(960);   // dest x
      expect(drawCalls[1].args[7]).toBe(960);   // dest width
    });

    it('draws narrower halves at mid-progress', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = {
        type: 'opening',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      // Progress ~0.5 → eased ~0.5
      drawLidAnimation(ctx, tokens, state, 0.5, 1920, 1080);

      const drawCalls = calls.filter((c) => c.method === 'drawImage');
      expect(drawCalls.length).toBe(2);

      // Eased 0.5 = 0.5 (cubic ease-in-out at 0.5 = 0.5)
      // stripW = 960 * (1 - 0.5) = 480
      expect(drawCalls[0].args[7]).toBe(480);  // left half width
      expect(drawCalls[1].args[7]).toBe(480);  // right half width
    });

    it('draws nothing at progress 1 (fully open)', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = {
        type: 'opening',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      drawLidAnimation(ctx, tokens, state, 1, 1920, 1080);

      // At t=1 (eased = 1), stripW = 0 → no drawImage calls
      const drawCalls = calls.filter((c) => c.method === 'drawImage');
      expect(drawCalls.length).toBe(0);
    });

    it('renders shadow gradients on inner edges', () => {
      const { ctx } = mockContext();
      const state: LidAnimationState = {
        type: 'opening',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      drawLidAnimation(ctx, tokens, state, 0.3, 1920, 1080);

      // Shadow gradients created for inner edges
      expect(ctx.createLinearGradient).toHaveBeenCalled();
    });
  });

  describe('closing animation', () => {
    it('draws child snapshot filling canvas at progress 0', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = {
        type: 'closing',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      drawLidAnimation(ctx, tokens, state, 0, 1920, 1080);

      // At t=0 (eased = 0), centerW = 1920 * 1 = 1920 (full width)
      const drawCalls = calls.filter((c) => c.method === 'drawImage');
      expect(drawCalls.length).toBe(1);
      expect(drawCalls[0].args[7]).toBe(1920);  // dest width = full canvas
    });

    it('draws nothing at progress 1 (fully closed)', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = {
        type: 'closing',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      drawLidAnimation(ctx, tokens, state, 1, 1920, 1080);

      // At t=1, centerW = 0 → no drawImage
      const drawCalls = calls.filter((c) => c.method === 'drawImage');
      expect(drawCalls.length).toBe(0);
    });

    it('draws shrinking center at mid-progress', () => {
      const { ctx, calls } = mockContext();
      const state: LidAnimationState = {
        type: 'closing',
        progress: 0,
        snapshot: mockSnapshot(),
        startTime: 0,
      };
      drawLidAnimation(ctx, tokens, state, 0.5, 1920, 1080);

      const drawCalls = calls.filter((c) => c.method === 'drawImage');
      expect(drawCalls.length).toBe(1);
      // Eased 0.5 = 0.5, centerW = 1920 * 0.5 = 960
      expect(drawCalls[0].args[7]).toBe(960);
    });
  });

  describe('reduced motion', () => {
    it('computeProgress returns 1 instantly with 0ms duration', () => {
      expect(computeProgress(0, 0, 0)).toBe(1);
    });

    it('parseDurationMs returns 0 for "0ms"', () => {
      expect(parseDurationMs('0ms')).toBe(0);
    });
  });
});
