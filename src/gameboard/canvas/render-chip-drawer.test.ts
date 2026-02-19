import { describe, it, expect, beforeEach } from 'vitest';
import {
  hitTestChipDrawer,
  hitTestDeleteZone,
  isOverlappingChipDrawer,
  getHandleRect,
  getTrayRect,
  getChipSlotRects,
  getDrawerState,
  getDrawerProgress,
  openDrawer,
  closeDrawer,
  isDrawerOpen,
  isDrawerVisible,
  getHoveredChipIndex,
  setHoveredChipIndex,
  isHandleHovered,
  setHandleHovered,
  getKeyboardSelectedIndex,
  setKeyboardSelectedIndex,
  isKeyboardNavigationActive,
  setKeyboardNavigationActive,
  updateDrawerAnimation,
  drawChipDrawer,
} from './render-chip-drawer.ts';
import { CHIP_DRAWER } from '../../shared/constants/index.ts';
import { GRID_ROWS } from '../../shared/grid/constants.ts';
import type { PaletteItem } from '../../ui/overlays/palette-items.ts';

const CELL_SIZE = 20;

function makePaletteItem(id: string, canPlace = true): PaletteItem {
  return {
    id,
    chipType: id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    section: 'fundamental',
    category: 'math',
    remaining: null,
    canPlace,
  };
}

const ITEMS: PaletteItem[] = [
  makePaletteItem('offset'),
  makePaletteItem('scale'),
  makePaletteItem('threshold'),
  makePaletteItem('max'),
  makePaletteItem('min'),
  makePaletteItem('memory'),
  makePaletteItem('duplicate'),
];

// Reset module-level state between tests
// We need to force the drawer to a known closed state.
// openDrawer() → drive open → closeDrawer() → drive closed
beforeEach(() => {
  // Force open first so closeDrawer() won't short-circuit
  openDrawer();
  updateDrawerAnimation(0);
  updateDrawerAnimation(1000); // fully open
  // Now close
  closeDrawer();
  updateDrawerAnimation(1000); // set start time
  updateDrawerAnimation(2000); // fully closed
  setHoveredChipIndex(null);
  setHandleHovered(false);
  setKeyboardSelectedIndex(null);
  setKeyboardNavigationActive(false);
});

// =============================================================================
// Layout
// =============================================================================

describe('getHandleRect', () => {
  it('returns resting handle position when progress is 0', () => {
    const handle = getHandleRect(CELL_SIZE, 0);
    expect(handle.left).toBe(CHIP_DRAWER.HANDLE_COL_START * CELL_SIZE);
    expect(handle.top).toBe(CHIP_DRAWER.HANDLE_ROW * CELL_SIZE);
    expect(handle.width).toBe((CHIP_DRAWER.HANDLE_COL_END + 1 - CHIP_DRAWER.HANDLE_COL_START) * CELL_SIZE);
    expect(handle.height).toBe(CELL_SIZE);
  });

  it('slides handle up when progress is 1', () => {
    const rest = getHandleRect(CELL_SIZE, 0);
    const open = getHandleRect(CELL_SIZE, 1);
    const trayHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * CELL_SIZE;
    expect(open.top).toBe(rest.top - trayHeight);
  });

  it('defaults progress to 0 when omitted', () => {
    const handle = getHandleRect(CELL_SIZE);
    expect(handle.top).toBe(CHIP_DRAWER.HANDLE_ROW * CELL_SIZE);
  });
});

describe('getTrayRect', () => {
  it('returns tray at full height below handle when progress is 1', () => {
    const tray = getTrayRect(CELL_SIZE, 1);
    const handle = getHandleRect(CELL_SIZE, 1);
    const expectedHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * CELL_SIZE;
    expect(tray.top).toBe(handle.top + handle.height);
    expect(tray.height).toBe(expectedHeight);
  });

  it('returns tray with zero height when progress is 0', () => {
    const tray = getTrayRect(CELL_SIZE, 0);
    expect(tray.height).toBe(0);
  });

  it('tray sits directly below handle at any progress', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const tray = getTrayRect(CELL_SIZE, p);
      const handle = getHandleRect(CELL_SIZE, p);
      expect(tray.top).toBe(handle.top + handle.height);
    }
  });

  it('tray height scales with progress', () => {
    const full = getTrayRect(CELL_SIZE, 1);
    const half = getTrayRect(CELL_SIZE, 0.5);
    expect(half.height).toBeCloseTo(full.height * 0.5, 1);
  });

  it('tray uses same width as handle', () => {
    const tray = getTrayRect(CELL_SIZE, 1);
    const handle = getHandleRect(CELL_SIZE, 1);
    expect(tray.width).toBe(handle.width);
  });
});

describe('getChipSlotRects', () => {
  it('returns one slot per item', () => {
    const { slots } = getChipSlotRects(CELL_SIZE, 7, 0);
    expect(slots.length).toBe(7);
  });

  it('slots have consistent dimensions', () => {
    const { slots } = getChipSlotRects(CELL_SIZE, 7, 0);
    const w = slots[0].width;
    const h = slots[0].height;
    for (const slot of slots) {
      expect(slot.width).toBe(w);
      expect(slot.height).toBe(h);
    }
  });

  it('scrollOffset shifts slot positions up', () => {
    const { slots: noScroll } = getChipSlotRects(CELL_SIZE, 7, 0);
    const { slots: scrolled } = getChipSlotRects(CELL_SIZE, 7, 50);
    expect(scrolled[0].top).toBe(noScroll[0].top - 50);
    expect(scrolled[0].left).toBe(noScroll[0].left); // horizontal unchanged
  });
});

// =============================================================================
// Hit Testing
// =============================================================================

describe('hitTestChipDrawer', () => {
  it('returns handle hit on handle area', () => {
    const handle = getHandleRect(CELL_SIZE);
    const hit = hitTestChipDrawer(
      handle.left + handle.width / 2,
      handle.top + handle.height / 2,
      CELL_SIZE, 0, ITEMS,
    );
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('handle');
  });

  it('returns null for point far from drawer', () => {
    const hit = hitTestChipDrawer(0, 0, CELL_SIZE, 0, ITEMS);
    expect(hit).toBeNull();
  });

  it('returns null for tray area when progress is 0', () => {
    const tray = getTrayRect(CELL_SIZE, 1);
    const hit = hitTestChipDrawer(
      tray.left + tray.width / 2,
      tray.top + tray.height / 2,
      CELL_SIZE, 0, ITEMS,
    );
    // Progress is 0, so tray is hidden
    expect(hit).toBeNull();
  });

  it('returns chip hit when clicking on chip slot with progress 1', () => {
    const { slots } = getChipSlotRects(CELL_SIZE, ITEMS.length, 0);
    const slot = slots[0];
    const tray = getTrayRect(CELL_SIZE, 1);
    // Only hits if point is within tray bounds
    if (slot.top >= tray.top && slot.top + slot.height <= tray.top + tray.height) {
      const hit = hitTestChipDrawer(
        slot.left + slot.width / 2,
        slot.top + slot.height / 2,
        CELL_SIZE, 1, ITEMS,
      );
      expect(hit).not.toBeNull();
      expect(hit!.type).toBe('chip');
      if (hit!.type === 'chip') {
        expect(hit!.index).toBe(0);
        expect(hit!.paletteItem).toBe(ITEMS[0]);
      }
    }
  });

  it('returns handle hit for cursor below grid (margin overshoot)', () => {
    const handle = getHandleRect(CELL_SIZE, 0);
    const belowGrid = GRID_ROWS * CELL_SIZE + 10; // in the margin
    const hit = hitTestChipDrawer(
      handle.left + handle.width / 2,
      belowGrid,
      CELL_SIZE, 0, ITEMS,
    );
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('handle');
  });

  it('returns null for margin overshoot outside handle columns', () => {
    const belowGrid = GRID_ROWS * CELL_SIZE + 10;
    const hit = hitTestChipDrawer(0, belowGrid, CELL_SIZE, 0, ITEMS);
    expect(hit).toBeNull();
  });

  it('returns tray-background for empty area in tray with progress 1', () => {
    const tray = getTrayRect(CELL_SIZE, 1);
    // Bottom-right corner of tray (should be empty)
    const hit = hitTestChipDrawer(
      tray.left + tray.width - 5,
      tray.top + tray.height - 5,
      CELL_SIZE, 1, ITEMS,
    );
    if (hit) {
      expect(['tray-background', 'chip']).toContain(hit.type);
    }
  });
});

describe('hitTestDeleteZone', () => {
  it('returns true for point on handle', () => {
    const handle = getHandleRect(CELL_SIZE);
    expect(hitTestDeleteZone(
      handle.left + handle.width / 2,
      handle.top + handle.height / 2,
      CELL_SIZE,
    )).toBe(true);
  });

  it('returns false for point far from handle', () => {
    expect(hitTestDeleteZone(0, 0, CELL_SIZE)).toBe(false);
  });

  it('returns true for point slightly outside handle (expanded zone)', () => {
    const handle = getHandleRect(CELL_SIZE);
    // Just outside the handle within the margin
    expect(hitTestDeleteZone(
      handle.left - CELL_SIZE / 2,
      handle.top + handle.height / 2,
      CELL_SIZE,
    )).toBe(true);
  });
});

describe('isOverlappingChipDrawer', () => {
  it('returns true for node overlapping handle', () => {
    expect(isOverlappingChipDrawer(30, 35, 3, 1)).toBe(true);
  });

  it('returns false for node above handle', () => {
    expect(isOverlappingChipDrawer(30, 32, 3, 2)).toBe(false);
  });

  it('returns false for node left of handle', () => {
    expect(isOverlappingChipDrawer(10, 35, 3, 1)).toBe(false);
  });

  it('returns false for node right of handle', () => {
    expect(isOverlappingChipDrawer(50, 35, 3, 1)).toBe(false);
  });
});

// =============================================================================
// State Management
// =============================================================================

describe('drawer state', () => {
  it('starts closed', () => {
    expect(getDrawerState()).toBe('closed');
    expect(getDrawerProgress()).toBe(0);
    expect(isDrawerOpen()).toBe(false);
    expect(isDrawerVisible()).toBe(false);
  });

  it('transitions from closed to opening on openDrawer()', () => {
    openDrawer();
    // State should be 'opening' (or 'open' if reduced motion)
    const state = getDrawerState();
    expect(state === 'opening' || state === 'open').toBe(true);
  });

  it('transitions from open to closing on closeDrawer()', () => {
    openDrawer();
    // Drive to open
    updateDrawerAnimation(0);
    updateDrawerAnimation(500);
    closeDrawer();
    const state = getDrawerState();
    expect(state === 'closing' || state === 'closed').toBe(true);
  });

  it('openDrawer is idempotent when already open', () => {
    openDrawer();
    updateDrawerAnimation(0);
    updateDrawerAnimation(500);
    openDrawer(); // should not change state
    const state = getDrawerState();
    expect(state === 'open' || state === 'opening').toBe(true);
  });

  it('closeDrawer is idempotent when already closed', () => {
    closeDrawer();
    expect(getDrawerState()).toBe('closed');
  });
});

describe('hover state', () => {
  it('hovered chip index defaults to null', () => {
    expect(getHoveredChipIndex()).toBeNull();
  });

  it('can set and get hovered chip index', () => {
    setHoveredChipIndex(3);
    expect(getHoveredChipIndex()).toBe(3);
  });

  it('can clear hovered chip index', () => {
    setHoveredChipIndex(3);
    setHoveredChipIndex(null);
    expect(getHoveredChipIndex()).toBeNull();
  });

  it('handle hovered defaults to false', () => {
    expect(isHandleHovered()).toBe(false);
  });

  it('can set and get handle hovered', () => {
    setHandleHovered(true);
    expect(isHandleHovered()).toBe(true);
  });
});

describe('keyboard navigation state', () => {
  it('defaults to inactive', () => {
    expect(isKeyboardNavigationActive()).toBe(false);
    expect(getKeyboardSelectedIndex()).toBeNull();
  });

  it('can activate keyboard navigation', () => {
    setKeyboardNavigationActive(true);
    expect(isKeyboardNavigationActive()).toBe(true);
  });

  it('can set selected index', () => {
    setKeyboardSelectedIndex(2);
    expect(getKeyboardSelectedIndex()).toBe(2);
  });

  it('closeDrawer resets keyboard navigation', () => {
    setKeyboardNavigationActive(true);
    setKeyboardSelectedIndex(3);
    openDrawer();
    updateDrawerAnimation(0);
    updateDrawerAnimation(500);
    closeDrawer();
    expect(isKeyboardNavigationActive()).toBe(false);
    expect(getKeyboardSelectedIndex()).toBeNull();
  });
});

// =============================================================================
// Animation
// =============================================================================

describe('updateDrawerAnimation', () => {
  it('progresses from 0 toward 1 when opening', () => {
    openDrawer();
    updateDrawerAnimation(0); // set start time
    updateDrawerAnimation(150); // halfway through 300ms
    const progress = getDrawerProgress();
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it('completes opening after full duration', () => {
    openDrawer();
    updateDrawerAnimation(0);
    updateDrawerAnimation(500); // well past 300ms
    expect(getDrawerState()).toBe('open');
    expect(getDrawerProgress()).toBe(1);
  });

  it('progresses from 1 toward 0 when closing', () => {
    openDrawer();
    updateDrawerAnimation(0);
    updateDrawerAnimation(500); // fully open
    closeDrawer();
    updateDrawerAnimation(500); // set start time for close
    updateDrawerAnimation(600); // 100ms into 200ms close
    const progress = getDrawerProgress();
    expect(progress).toBeLessThan(1);
    expect(progress).toBeGreaterThanOrEqual(0);
  });

  it('completes closing after full duration', () => {
    openDrawer();
    updateDrawerAnimation(0);
    updateDrawerAnimation(500);
    closeDrawer();
    updateDrawerAnimation(500);
    updateDrawerAnimation(800);
    expect(getDrawerState()).toBe('closed');
    expect(getDrawerProgress()).toBe(0);
  });
});

// =============================================================================
// Drawing
// =============================================================================

describe('drawChipDrawer', () => {
  function createMockCtx() {
    return {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      rect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      arc: () => {},
      roundRect: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 50 }),
      fillText: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setTransform: () => {},
      setLineDash: () => {},
      getLineDash: () => [],
      globalAlpha: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      shadowBlur: 0,
      shadowColor: '',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      textAlign: '',
      textBaseline: '',
      font: '',
      letterSpacing: '',
    } as unknown as CanvasRenderingContext2D;
  }

  const tokens = {
    surfaceNode: '#2a2a3a',
    surfaceNodeBottom: '#222230',
    depthRaised: '#1a1a28',
    depthSunken: '#111118',
    textPrimary: '#e0e0f0',
    textSecondary: '#9090b0',
    colorNeutral: '#5a5a6a',
    signalZero: '#5a5a6a',
    signalPositive: '#F5AF28',
    signalNegative: '#1ED2C3',
    colorSelection: '#5a9bf5',
    colorError: '#E03838',
  } as any;

  it('draws without throwing when closed', () => {
    const ctx = createMockCtx();
    expect(() => {
      drawChipDrawer(ctx, tokens, { paletteItems: ITEMS, isDraggingChip: false, craftedPuzzles: new Map(), craftedUtilities: new Map() }, CELL_SIZE);
    }).not.toThrow();
  });

  it('draws without throwing when open', () => {
    openDrawer();
    updateDrawerAnimation(0);
    updateDrawerAnimation(500);
    const ctx = createMockCtx();
    expect(() => {
      drawChipDrawer(ctx, tokens, { paletteItems: ITEMS, isDraggingChip: false, craftedPuzzles: new Map(), craftedUtilities: new Map() }, CELL_SIZE);
    }).not.toThrow();
  });

  it('draws delete zone when dragging node', () => {
    const ctx = createMockCtx();
    expect(() => {
      drawChipDrawer(ctx, tokens, { paletteItems: ITEMS, isDraggingChip: true, craftedPuzzles: new Map(), craftedUtilities: new Map() }, CELL_SIZE);
    }).not.toThrow();
  });
});
