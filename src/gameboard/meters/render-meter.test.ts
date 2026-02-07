import { describe, it, expect } from 'vitest';
import { drawMeter } from './render-meter.ts';
import type { RenderMeterState } from './render-meter.ts';
import type { MeterSlotState } from './meter-types.ts';
import { MeterCircularBuffer } from './circular-buffer.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';

// Minimal mock tokens
const mockTokens: ThemeTokens = {
  pageBackground: '#000',
  gameboardSurface: '#111',
  gridArea: '#222',
  meterHousing: '#333',
  meterInterior: '#444',
  surfaceNode: '#555',
  surfaceNodeBottom: '#556',
  signalPositive: '#0f0',
  signalNegative: '#f00',
  colorNeutral: '#888',
  colorTarget: '#0ff',
  meterNeedle: '#fff',
  depthRaised: '#aaa',
  depthSunken: '#222',
  textPrimary: '#fff',
  textSecondary: '#ccc',
  colorSelection: '#00f',
  wireWidthBase: '2',
  portFill: '#36b',
  portStroke: '#59f',
  portConnected: '#5c8',
  gridLine: '#1e1e38',
  animZoomDuration: '500ms',
  animNodeScaleDuration: '300ms',
  animWireDrawDuration: '200ms',
  animEasingDefault: 'ease',
  animEasingBounce: 'ease-out',
  animCeremonyBurstDuration: '500ms',
  animCeremonyRevealDuration: '300ms',
};

const testRect: PixelRect = { x: 0, y: 0, width: 96, height: 192 };

function createMockCtx() {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === '_calls') return calls;
      if (typeof prop === 'string') {
        return (...args: unknown[]) => {
          calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(',')})`);
        };
      }
    },
    set(_target, prop, value) {
      calls.push(`set:${String(prop)}=${JSON.stringify(value)}`);
      return true;
    },
  };
  return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D & { _calls: string[] };
}

describe('drawMeter', () => {
  it('hidden state makes no canvas calls', () => {
    const ctx = createMockCtx();
    const slot: MeterSlotState = { side: 'left', index: 0, visualState: 'hidden', direction: 'input' };
    const state: RenderMeterState = { slot, signalBuffer: null, targetBuffer: null };
    drawMeter(ctx, mockTokens, state, testRect);
    expect(ctx._calls).toHaveLength(0);
  });

  it('dimmed state draws interior and overlay only (no channels)', () => {
    const ctx = createMockCtx();
    const slot: MeterSlotState = { side: 'left', index: 0, visualState: 'dimmed', direction: 'input' };
    const state: RenderMeterState = { slot, signalBuffer: null, targetBuffer: null };
    drawMeter(ctx, mockTokens, state, testRect);

    // Should have fillRect calls for interior and overlay
    const fillRectCalls = ctx._calls.filter((c) => c.startsWith('fillRect'));
    expect(fillRectCalls.length).toBe(2); // interior + dimmed overlay
    // Interior drawing uses beginPath for cutout clipping, but no channel drawing
    const beginPathCalls = ctx._calls.filter((c) => c.startsWith('beginPath'));
    expect(beginPathCalls).toHaveLength(1); // interior cutout clip path only
  });

  it('active state draws interior, centerline, and channels', () => {
    const ctx = createMockCtx();
    const buf = new MeterCircularBuffer(8);
    buf.push(50);
    buf.push(-30);
    const slot: MeterSlotState = { side: 'right', index: 0, visualState: 'active', direction: 'output' };
    const state: RenderMeterState = { slot, signalBuffer: buf, targetBuffer: null };
    drawMeter(ctx, mockTokens, state, testRect);

    // Should have at least: interior fill, centerline (beginPath+moveTo+lineTo+stroke),
    // and channel fills
    const fillRectCalls = ctx._calls.filter((c) => c.startsWith('fillRect'));
    expect(fillRectCalls.length).toBeGreaterThanOrEqual(2); // interior + at least 1 channel fill
    const beginPathCalls = ctx._calls.filter((c) => c.startsWith('beginPath'));
    expect(beginPathCalls.length).toBeGreaterThanOrEqual(1); // centerline + needle
  });

  it('does not import useGameStore or COLORS', async () => {
    // Contract test: read the source files
    const fs = await import('node:fs');
    const path = await import('node:path');
    const meterDir = path.resolve(__dirname);
    const renderFiles = [
      'render-meter.ts',
      'render-waveform-channel.ts',
      'render-level-bar.ts',
      'render-needle.ts',
      'render-target-overlay.ts',
    ];
    for (const file of renderFiles) {
      const content = fs.readFileSync(path.join(meterDir, file), 'utf-8');
      expect(content).not.toMatch(/useGameStore/);
      expect(content).not.toMatch(/\bCOLORS\b/);
    }
  });

  it('all meter render files accept ThemeTokens', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const meterDir = path.resolve(__dirname);
    const renderFiles = [
      'render-meter.ts',
      'render-waveform-channel.ts',
      'render-level-bar.ts',
      'render-needle.ts',
      'render-target-overlay.ts',
    ];
    for (const file of renderFiles) {
      const content = fs.readFileSync(path.join(meterDir, file), 'utf-8');
      expect(content).toMatch(/ThemeTokens/);
    }
  });
});
