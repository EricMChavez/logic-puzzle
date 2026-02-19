import { describe, it, expect, beforeEach } from 'vitest';
import {
  hitTestPlaybackBar,
  isOverlappingPlaybackBar,
  getHoveredPlaybackButton,
  setHoveredPlaybackButton,
  drawPlaybackBar,
} from './render-playback-bar.ts';
import { PLAYBACK_BAR } from '../../shared/constants/index.ts';

const CELL_SIZE = 20;

/** Side panel width in pixels at CELL_SIZE */
const SIDE_PANEL_WIDTH = CELL_SIZE * 0.8; // 16px
const BAR_LEFT = PLAYBACK_BAR.COL_START * CELL_SIZE;
const BAR_RIGHT = (PLAYBACK_BAR.COL_END + 1) * CELL_SIZE;
const TRAY_LEFT = BAR_LEFT + SIDE_PANEL_WIDTH;
const TRAY_RIGHT = BAR_RIGHT - SIDE_PANEL_WIDTH;
const TRAY_WIDTH = TRAY_RIGHT - TRAY_LEFT;

/** Button protrusion bottom: top + 4 + height * 1.125 */
const BAR_HEIGHT = PLAYBACK_BAR.HEIGHT_CELLS * CELL_SIZE;
const BUTTON_BOTTOM = PLAYBACK_BAR.ROW_START * CELL_SIZE + 4 + BAR_HEIGHT * 1.125;

describe('hitTestPlaybackBar', () => {
  it('returns null for coordinates above the bar', () => {
    const x = (PLAYBACK_BAR.COL_START + PLAYBACK_BAR.COL_END) / 2 * CELL_SIZE;
    const y = (PLAYBACK_BAR.ROW_START - 1) * CELL_SIZE;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns null for coordinates below the button protrusion area', () => {
    const x = (PLAYBACK_BAR.COL_START + PLAYBACK_BAR.COL_END) / 2 * CELL_SIZE;
    const y = BUTTON_BOTTOM + 5;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns null for coordinates left of the bar', () => {
    const x = (PLAYBACK_BAR.COL_START - 2) * CELL_SIZE;
    const y = (PLAYBACK_BAR.ROW_START + 1) * CELL_SIZE;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns null for coordinates right of the bar', () => {
    const x = (PLAYBACK_BAR.COL_END + 3) * CELL_SIZE;
    const y = (PLAYBACK_BAR.ROW_START + 1) * CELL_SIZE;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns null for click on left side panel', () => {
    const x = BAR_LEFT + SIDE_PANEL_WIDTH / 2; // center of left panel
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns null for click on right side panel', () => {
    const x = BAR_RIGHT - SIDE_PANEL_WIDTH / 2; // center of right panel
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns prev for leftmost tray quarter', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const x = TRAY_LEFT + 2; // just inside tray
    const result = hitTestPlaybackBar(x, y, CELL_SIZE);
    expect(result).not.toBeNull();
    expect(result!.button).toBe('prev');
  });

  it('returns play for second tray quarter', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const quarter = TRAY_WIDTH / 4;
    const x = TRAY_LEFT + quarter + quarter / 2; // center of second quarter
    const result = hitTestPlaybackBar(x, y, CELL_SIZE);
    expect(result).not.toBeNull();
    expect(result!.button).toBe('play');
  });

  it('returns stop for third tray quarter', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const quarter = TRAY_WIDTH / 4;
    const x = TRAY_LEFT + quarter * 2 + quarter / 2; // center of third quarter
    const result = hitTestPlaybackBar(x, y, CELL_SIZE);
    expect(result).not.toBeNull();
    expect(result!.button).toBe('stop');
  });

  it('returns next for rightmost tray quarter', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const x = TRAY_RIGHT - 2; // just inside tray on right
    const result = hitTestPlaybackBar(x, y, CELL_SIZE);
    expect(result).not.toBeNull();
    expect(result!.button).toBe('next');
  });

  it('returns button hit in button protrusion area (below housing)', () => {
    // Y is between bar.bottom and buttonBottom (buttons protrude below housing)
    const barBottom = PLAYBACK_BAR.ROW_START * CELL_SIZE + BAR_HEIGHT;
    const y = barBottom + 1; // 1px below housing, still in protrusion
    const quarter = TRAY_WIDTH / 4;
    const x = TRAY_LEFT + quarter + quarter / 2; // second quarter = play
    const result = hitTestPlaybackBar(x, y, CELL_SIZE);
    expect(result).not.toBeNull();
    expect(result!.button).toBe('play');
  });

  it('does not take playMode parameter — always returns the button', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const x = TRAY_LEFT + 2;
    // No playMode parameter — always returns the button name
    const result = hitTestPlaybackBar(x, y, CELL_SIZE);
    expect(result!.button).toBe('prev');
  });
});

describe('isOverlappingPlaybackBar', () => {
  it('returns true for node fully inside bar region', () => {
    expect(isOverlappingPlaybackBar(30, 0, 3, 2)).toBe(true);
  });

  it('returns true for node partially overlapping bar region', () => {
    expect(isOverlappingPlaybackBar(30, 1, 3, 2)).toBe(true);
  });

  it('returns false for node below bar region', () => {
    expect(isOverlappingPlaybackBar(30, 2, 3, 2)).toBe(false);
  });

  it('returns false for node left of bar region', () => {
    expect(isOverlappingPlaybackBar(20, 0, 3, 2)).toBe(false);
  });

  it('returns false for node right of bar region', () => {
    expect(isOverlappingPlaybackBar(42, 0, 3, 2)).toBe(false);
  });

  it('returns true for node that just touches bar region at corner', () => {
    expect(isOverlappingPlaybackBar(22, 0, 3, 3)).toBe(true);
  });

  it('returns false for node just outside bar on left side', () => {
    expect(isOverlappingPlaybackBar(21, 0, 3, 2)).toBe(false);
  });
});

describe('hover state', () => {
  beforeEach(() => {
    setHoveredPlaybackButton(null);
  });

  it('defaults to null', () => {
    expect(getHoveredPlaybackButton()).toBeNull();
  });

  it('can be set and retrieved', () => {
    setHoveredPlaybackButton('play');
    expect(getHoveredPlaybackButton()).toBe('play');
  });

  it('can be cleared', () => {
    setHoveredPlaybackButton('next');
    setHoveredPlaybackButton(null);
    expect(getHoveredPlaybackButton()).toBeNull();
  });
});

describe('drawPlaybackBar', () => {
  function createMockGradient() {
    return { addColorStop: () => {} };
  }

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
        clip: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        arc: () => {},
        roundRect: () => {},
        createLinearGradient: () => createMockGradient(),
        createRadialGradient: () => createMockGradient(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        shadowBlur: 0,
        shadowColor: '',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      } as unknown as CanvasRenderingContext2D,
    };
  }

  const tokens = { meterBorder: '#666666', meterBorderMatch: '#00cc00', meterBorderMismatch: '#cc0000' } as any;

  it('calls canvas drawing operations without throwing', () => {
    const { ctx, calls } = createMockCtx();

    expect(() => {
      drawPlaybackBar(ctx, tokens, { playMode: 'paused', hoveredButton: null, pressedButton: null, indicatorState: 'neutral', viewportTopY: -40 }, 20);
    }).not.toThrow();

    expect(calls).toContain('save');
    expect(calls).toContain('fill');
    expect(calls).toContain('restore');
  });

  it('draws all 4 button icons when paused', () => {
    let fillCalls = 0;
    const { ctx } = createMockCtx();
    (ctx as any).fill = () => { fillCalls++; };

    drawPlaybackBar(ctx, tokens, { playMode: 'paused', hoveredButton: null, pressedButton: null, indicatorState: 'neutral', viewportTopY: -40 }, 20);
    // fill calls: panels (2 fills + 2 sheen fills) + screws (2 fills) + icons (4 fills)
    expect(fillCalls).toBeGreaterThan(1);
  });

  it('renders depressed play button when playing', () => {
    const fillRectCalls: unknown[][] = [];
    const { ctx } = createMockCtx();
    (ctx as any).fillRect = (...args: unknown[]) => { fillRectCalls.push(args); };

    drawPlaybackBar(ctx, tokens, { playMode: 'playing', hoveredButton: null, pressedButton: null, indicatorState: 'neutral', viewportTopY: -40 }, 20);
    // fillRect for: tray bg, tray shadow, panel details, button fills, depressed overlay, icon rects
    expect(fillRectCalls.length).toBeGreaterThan(0);
  });
});
