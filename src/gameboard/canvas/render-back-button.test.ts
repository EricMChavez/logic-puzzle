import { describe, it, expect, beforeEach } from 'vitest';
import {
  hitTestBackButton,
  getHoveredBackButton,
  setHoveredBackButton,
  drawBackButton,
} from './render-back-button.ts';
import { BACK_BUTTON } from '../../shared/constants/index.ts';

const CELL_SIZE = 20;

const BTN_LEFT = BACK_BUTTON.COL_START * CELL_SIZE;
const BTN_RIGHT = (BACK_BUTTON.COL_END + 1) * CELL_SIZE;
const BTN_TOP = BACK_BUTTON.ROW_START * CELL_SIZE;
const BTN_BOTTOM = (BACK_BUTTON.ROW_END + 1) * CELL_SIZE;

describe('hitTestBackButton', () => {
  it('returns true for coordinates inside the button', () => {
    const cx = (BTN_LEFT + BTN_RIGHT) / 2;
    const cy = (BTN_TOP + BTN_BOTTOM) / 2;
    expect(hitTestBackButton(cx, cy, CELL_SIZE)).toBe(true);
  });

  it('returns true for top-left corner', () => {
    expect(hitTestBackButton(BTN_LEFT, BTN_TOP, CELL_SIZE)).toBe(true);
  });

  it('returns true for bottom-right corner', () => {
    expect(hitTestBackButton(BTN_RIGHT, BTN_BOTTOM, CELL_SIZE)).toBe(true);
  });

  it('returns false for coordinates above the button', () => {
    expect(hitTestBackButton(BTN_LEFT + 10, BTN_TOP - 1, CELL_SIZE)).toBe(false);
  });

  it('returns false for coordinates below the button', () => {
    expect(hitTestBackButton(BTN_LEFT + 10, BTN_BOTTOM + 1, CELL_SIZE)).toBe(false);
  });

  it('returns false for coordinates left of the button', () => {
    expect(hitTestBackButton(BTN_LEFT - 1, BTN_TOP + 10, CELL_SIZE)).toBe(false);
  });

  it('returns false for coordinates right of the button', () => {
    expect(hitTestBackButton(BTN_RIGHT + 1, BTN_TOP + 10, CELL_SIZE)).toBe(false);
  });
});

describe('hover state', () => {
  beforeEach(() => {
    setHoveredBackButton(false);
  });

  it('defaults to false', () => {
    expect(getHoveredBackButton()).toBe(false);
  });

  it('can be set to true', () => {
    setHoveredBackButton(true);
    expect(getHoveredBackButton()).toBe(true);
  });

  it('can be cleared', () => {
    setHoveredBackButton(true);
    setHoveredBackButton(false);
    expect(getHoveredBackButton()).toBe(false);
  });
});

describe('drawBackButton', () => {
  function createMockCtx() {
    const calls: string[] = [];
    return {
      calls,
      ctx: {
        save: () => calls.push('save'),
        restore: () => calls.push('restore'),
        beginPath: () => calls.push('beginPath'),
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => calls.push('fill'),
        stroke: () => calls.push('stroke'),
        roundRect: () => {},
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        lineCap: '',
        lineJoin: '',
        globalAlpha: 1,
        shadowColor: '',
        shadowBlur: 0,
      } as unknown as CanvasRenderingContext2D,
    };
  }

  const tokens = { meterBorder: '#666', textPrimary: '#fff' } as any;

  it('draws without throwing', () => {
    const { ctx, calls } = createMockCtx();
    expect(() => {
      drawBackButton(ctx, tokens, { hovered: false, pulsing: false }, 20);
    }).not.toThrow();
    expect(calls).toContain('save');
    expect(calls).toContain('stroke');
    expect(calls).toContain('fill');
    expect(calls).toContain('restore');
  });

  it('draws with hover state without throwing', () => {
    const { ctx } = createMockCtx();
    expect(() => {
      drawBackButton(ctx, tokens, { hovered: true, pulsing: false }, 20);
    }).not.toThrow();
  });

  it('draws with pulsing state without throwing', () => {
    const { ctx } = createMockCtx();
    expect(() => {
      drawBackButton(ctx, tokens, { hovered: false, pulsing: true }, 20);
    }).not.toThrow();
  });
});
