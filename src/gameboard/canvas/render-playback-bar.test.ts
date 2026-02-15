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

describe('hitTestPlaybackBar', () => {
  it('returns null for coordinates above the bar', () => {
    const x = (PLAYBACK_BAR.COL_START + PLAYBACK_BAR.COL_END) / 2 * CELL_SIZE;
    const y = (PLAYBACK_BAR.ROW_START - 1) * CELL_SIZE;
    expect(hitTestPlaybackBar(x, y, CELL_SIZE)).toBeNull();
  });

  it('returns null for coordinates below the bar', () => {
    const x = (PLAYBACK_BAR.COL_START + PLAYBACK_BAR.COL_END) / 2 * CELL_SIZE;
    const y = (PLAYBACK_BAR.ROW_END + 2) * CELL_SIZE;
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

  it('returns play-pause for center of the bar when paused', () => {
    const centerX = ((PLAYBACK_BAR.COL_START + PLAYBACK_BAR.COL_END + 1) / 2) * CELL_SIZE;
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const result = hitTestPlaybackBar(centerX, y, CELL_SIZE, 'paused');
    expect(result).not.toBeNull();
    expect(result!.button).toBe('play-pause');
  });

  it('returns prev for left region when paused', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const x = (PLAYBACK_BAR.COL_START + 2) * CELL_SIZE;
    const result = hitTestPlaybackBar(x, y, CELL_SIZE, 'paused');
    expect(result).not.toBeNull();
    expect(result!.button).toBe('prev');
  });

  it('returns next for right region when paused', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    const x = (PLAYBACK_BAR.COL_END - 1) * CELL_SIZE;
    const result = hitTestPlaybackBar(x, y, CELL_SIZE, 'paused');
    expect(result).not.toBeNull();
    expect(result!.button).toBe('next');
  });

  it('returns play-pause for all regions when playing', () => {
    const y = PLAYBACK_BAR.ROW_END * CELL_SIZE;
    // Left region
    const leftX = (PLAYBACK_BAR.COL_START + 2) * CELL_SIZE;
    expect(hitTestPlaybackBar(leftX, y, CELL_SIZE, 'playing')!.button).toBe('play-pause');
    // Center
    const centerX = ((PLAYBACK_BAR.COL_START + PLAYBACK_BAR.COL_END + 1) / 2) * CELL_SIZE;
    expect(hitTestPlaybackBar(centerX, y, CELL_SIZE, 'playing')!.button).toBe('play-pause');
    // Right region
    const rightX = (PLAYBACK_BAR.COL_END - 1) * CELL_SIZE;
    expect(hitTestPlaybackBar(rightX, y, CELL_SIZE, 'playing')!.button).toBe('play-pause');
  });
});

describe('isOverlappingPlaybackBar', () => {
  it('returns true for node fully inside bar region', () => {
    expect(isOverlappingPlaybackBar(30, 0, 3, 2)).toBe(true);
  });

  it('returns true for node partially overlapping bar region', () => {
    // Node starts at bottom of bar and extends below it
    expect(isOverlappingPlaybackBar(30, 1, 3, 2)).toBe(true);
  });

  it('returns false for node below bar region', () => {
    // Node starts at row 2, bar ends at row 1
    expect(isOverlappingPlaybackBar(30, 2, 3, 2)).toBe(false);
  });

  it('returns false for node left of bar region', () => {
    // Node ends at col 22 (exclusive), bar starts at col 24
    expect(isOverlappingPlaybackBar(20, 0, 3, 2)).toBe(false);
  });

  it('returns false for node right of bar region', () => {
    // Node starts at col 42, bar ends at col 41
    expect(isOverlappingPlaybackBar(42, 0, 3, 2)).toBe(false);
  });

  it('returns true for node that just touches bar region at corner', () => {
    // Node at cols 22-24, rows 0-2 — overlaps at col 24, rows 0-1
    expect(isOverlappingPlaybackBar(22, 0, 3, 3)).toBe(true);
  });

  it('returns false for node just outside bar on left side', () => {
    // Node cols 21-23, bar starts at col 24
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
    setHoveredPlaybackButton('play-pause');
    expect(getHoveredPlaybackButton()).toBe('play-pause');
  });

  it('can be cleared', () => {
    setHoveredPlaybackButton('next');
    setHoveredPlaybackButton(null);
    expect(getHoveredPlaybackButton()).toBeNull();
  });
});

describe('drawPlaybackBar', () => {
  it('calls canvas drawing operations without throwing', () => {
    const calls: string[] = [];
    const ctx = {
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
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const tokens = {
      surfaceNode: '#212121',
      depthRaised: '#333',
      textPrimary: '#fff',
      textSecondary: '#888',
    } as any;

    expect(() => {
      drawPlaybackBar(ctx, tokens, { playMode: 'paused', hoveredButton: null }, 20);
    }).not.toThrow();

    expect(calls).toContain('save');
    expect(calls).toContain('fill');
    expect(calls).toContain('restore');
  });

  it('draws play icon when paused', () => {
    let fillCalls = 0;
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},

      closePath: () => {},
      fill: () => { fillCalls++; },
      stroke: () => {},
      clip: () => {},
      fillRect: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const tokens = {
      surfaceNode: '#212121',
      depthRaised: '#333',
      textPrimary: '#fff',
      textSecondary: '#888',
    } as any;

    drawPlaybackBar(ctx, tokens, { playMode: 'paused', hoveredButton: null }, 20);
    // Should have multiple fill calls (background + icons)
    expect(fillCalls).toBeGreaterThan(1);
  });
});
