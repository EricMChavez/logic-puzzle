import { describe, it, expect } from 'vitest';
import { drawVictoryBurst, drawNameReveal } from './validation-ceremony.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';

// Minimal mock tokens for ceremony draw functions
const mockTokens: ThemeTokens = {
  signalPositive: '#e8a838',
  signalNegative: '#38b8a0',
  textPrimary: '#e0e0f0',
  textSecondary: '#9090b0',
  colorNeutral: '#3a3a4a',
} as ThemeTokens;

function createMockCtx() {
  const calls: { method: string; args: unknown[] }[] = [];

  const proxy = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop) {
      if (prop === 'save' || prop === 'restore' || prop === 'beginPath') {
        return (...args: unknown[]) => { calls.push({ method: prop as string, args }); };
      }
      if (prop === 'fillRect' || prop === 'fillText' || prop === 'strokeRect') {
        return (...args: unknown[]) => { calls.push({ method: prop as string, args }); };
      }
      if (prop === 'translate' || prop === 'scale') {
        return (...args: unknown[]) => { calls.push({ method: prop as string, args }); };
      }
      if (prop === 'createRadialGradient') {
        return (...args: unknown[]) => {
          calls.push({ method: 'createRadialGradient', args });
          return {
            addColorStop: (...csArgs: unknown[]) => {
              calls.push({ method: 'addColorStop', args: csArgs });
            },
          };
        };
      }
      // Writable properties track sets
      if (typeof prop === 'string') {
        return undefined;
      }
    },
    set(_target, prop, value) {
      calls.push({ method: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });

  return { ctx: proxy, calls };
}

describe('drawVictoryBurst', () => {
  it('draws a radial gradient at progress=0 (full flash)', () => {
    const { ctx, calls } = createMockCtx();
    drawVictoryBurst(ctx, mockTokens, 0, 1920, 1080);

    expect(calls.some(c => c.method === 'createRadialGradient')).toBe(true);
    expect(calls.some(c => c.method === 'fillRect')).toBe(true);

    // Alpha should be 1 at progress=0
    const alphaSet = calls.find(c => c.method === 'set:globalAlpha' && c.args[0] === 1);
    expect(alphaSet).toBeDefined();
  });

  it('draws with reduced alpha at progress=0.5', () => {
    const { ctx, calls } = createMockCtx();
    drawVictoryBurst(ctx, mockTokens, 0.5, 1920, 1080);

    const alphaSet = calls.filter(c => c.method === 'set:globalAlpha');
    // The eased alpha at 0.5 should be 0.5 (easeInOutCubic(0.5) = 0.5)
    expect(alphaSet.some(c => (c.args[0] as number) === 0.5)).toBe(true);
  });

  it('is a no-op at progress=1 (fully faded)', () => {
    const { ctx, calls } = createMockCtx();
    drawVictoryBurst(ctx, mockTokens, 1, 1920, 1080);

    expect(calls.some(c => c.method === 'fillRect')).toBe(false);
  });

  it('saves and restores context', () => {
    const { ctx, calls } = createMockCtx();
    drawVictoryBurst(ctx, mockTokens, 0.3, 1920, 1080);

    expect(calls[0].method).toBe('save');
    expect(calls[calls.length - 1].method).toBe('restore');
  });
});

describe('drawNameReveal', () => {
  it('is a no-op at progress=0', () => {
    const { ctx, calls } = createMockCtx();
    drawNameReveal(ctx, mockTokens, 0, 'Test Puzzle', 'A test description', 1920, 1080);

    expect(calls.some(c => c.method === 'fillText')).toBe(false);
  });

  it('draws text at progress=0.5', () => {
    const { ctx, calls } = createMockCtx();
    drawNameReveal(ctx, mockTokens, 0.5, 'Test Puzzle', 'A test description', 1920, 1080);

    const textCalls = calls.filter(c => c.method === 'fillText');
    expect(textCalls.length).toBe(2); // name + description
    expect(textCalls[0].args[0]).toBe('Test Puzzle');
    expect(textCalls[1].args[0]).toBe('A test description');
  });

  it('draws at full alpha at progress=1', () => {
    const { ctx, calls } = createMockCtx();
    drawNameReveal(ctx, mockTokens, 1, 'Test Puzzle', 'A test description', 1920, 1080);

    const textCalls = calls.filter(c => c.method === 'fillText');
    expect(textCalls.length).toBe(2);
  });

  it('applies scale transform', () => {
    const { ctx, calls } = createMockCtx();
    drawNameReveal(ctx, mockTokens, 0.5, 'Name', 'Desc', 1920, 1080);

    const scaleCalls = calls.filter(c => c.method === 'scale');
    expect(scaleCalls.length).toBe(1);
    // At progress=0.5, eased t=0.5, scale = 0.8 + 0.2*0.5 = 0.9
    const s = scaleCalls[0].args[0] as number;
    expect(s).toBeCloseTo(0.9, 1);
  });

  it('draws semi-transparent backdrop', () => {
    const { ctx, calls } = createMockCtx();
    drawNameReveal(ctx, mockTokens, 0.5, 'Name', 'Desc', 1920, 1080);

    const fillStyleSets = calls.filter(c => c.method === 'set:fillStyle' && (c.args[0] as string).includes('rgba'));
    expect(fillStyleSets.length).toBeGreaterThanOrEqual(1);
  });

  it('saves and restores context', () => {
    const { ctx, calls } = createMockCtx();
    drawNameReveal(ctx, mockTokens, 0.5, 'Name', 'Desc', 1920, 1080);

    expect(calls[0].method).toBe('save');
    expect(calls[calls.length - 1].method).toBe('restore');
  });
});
