/**
 * Chip Drawer — canvas-rendered bottom drawer for chip selection.
 *
 * Module-level singleton state (same pattern as render-playback-bar.ts and keyboard-focus.ts).
 * NOT in Zustand — purely visual, per-frame animation updates would spam subscribers.
 *
 * The drawer handle sits at the bottom of the gameboard. Hovering opens the tray,
 * which slides up to reveal available chips. Players click-and-drag chips from the
 * drawer onto the board, and drag existing chips back to the drawer to delete them.
 */

import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PaletteItem } from '../../ui/overlays/palette-items.ts';
import type { CraftedPuzzleEntry, CraftedUtilityEntry } from '../../store/slices/palette-slice.ts';
import type { RenderNodesState, KnobInfo } from './render-types.ts';
import type { ChipState } from '../../shared/types/index.ts';
import { CHIP_DRAWER, RETRO_PANEL } from '../../shared/constants/index.ts';
import { GRID_ROWS } from '../../shared/grid/constants.ts';
import { CARD_BODY_FONT } from '../../shared/fonts/font-ready.ts';
import { isReducedMotion } from '../../shared/tokens/theme-manager.ts';
import { getChipDefinition, getDefaultParams } from '../../engine/nodes/registry.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { drawSingleNode } from './render-nodes.ts';
import { getNodeBodyPixelRect } from './port-positions.ts';
import { getPortCountsFromType } from './render-placement-ghost.ts';

// =============================================================================
// Types
// =============================================================================

export type DrawerState = 'closed' | 'opening' | 'open' | 'closing';

export type ChipDrawerHit =
  | { type: 'handle' }
  | { type: 'chip'; index: number; paletteItem: PaletteItem }
  | { type: 'tray-background' }
  | { type: 'scroll-left' }
  | { type: 'scroll-right' };

interface TooltipInfo {
  item: PaletteItem;
  slot: { left: number; top: number; width: number; height: number };
  tray: { left: number; top: number; width: number; height: number };
}

export interface ChipDrawerRenderState {
  paletteItems: ReadonlyArray<PaletteItem>;
  isDraggingChip: boolean;
  craftedPuzzles: ReadonlyMap<string, CraftedPuzzleEntry>;
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>;
}

// =============================================================================
// Module-Level Singleton State
// =============================================================================

let _drawerState: DrawerState = 'closed';
let _drawerProgress = 0; // 0 = fully closed, 1 = fully open
let _animStartTime = -1;
let _hoveredChipIndex: number | null = null;
let _handleHovered = false;
let _tooltipChipIndex: number | null = null;
let _tooltipHoverStartTime = 0;
let _keyboardSelectedIndex: number | null = null;
let _scrollOffset = 0; // vertical scroll in pixels
let _keyboardNavigationActive = false;
let _deleteMode = false; // true when drawer is open as a delete drop target during node drag


// =============================================================================
// Getters / Setters
// =============================================================================

export function getDrawerState(): DrawerState {
  return _drawerState;
}

export function getDrawerProgress(): number {
  return _drawerProgress;
}

export function isDrawerOpen(): boolean {
  return _drawerState === 'open' || _drawerState === 'opening';
}

export function isDrawerVisible(): boolean {
  return _drawerState !== 'closed' || _drawerProgress > 0;
}

export function openDrawer(): void {
  if (_drawerState === 'open' || _drawerState === 'opening') return;
  if (isReducedMotion()) {
    _drawerState = 'open';
    _drawerProgress = 1;
    return;
  }
  _drawerState = 'opening';
  _animStartTime = -1; // Will be set on first updateDrawerAnimation call
}

export function closeDrawer(): void {
  if (_drawerState === 'closed' || _drawerState === 'closing') return;
  _keyboardNavigationActive = false;
  _keyboardSelectedIndex = null;
  _tooltipChipIndex = null;
  _scrollOffset = 0;
  // _deleteMode persists during close animation so trash icon stays visible.
  // Cleared in updateDrawerAnimation on completion, or immediately for reduced motion.
  if (isReducedMotion()) {
    _drawerState = 'closed';
    _drawerProgress = 0;
    _deleteMode = false;
    return;
  }
  _drawerState = 'closing';
  _animStartTime = -1;
}

export function getHoveredChipIndex(): number | null {
  return _hoveredChipIndex;
}

export function setHoveredChipIndex(index: number | null): void {
  if (index !== _hoveredChipIndex) {
    _hoveredChipIndex = index;
    // Reset tooltip timer on hover change
    if (index !== null) {
      _tooltipChipIndex = null;
      _tooltipHoverStartTime = performance.now();
    } else {
      _tooltipChipIndex = null;
      _tooltipHoverStartTime = 0;
    }
  }
}

export function isHandleHovered(): boolean {
  return _handleHovered;
}

export function setHandleHovered(hovered: boolean): void {
  _handleHovered = hovered;
}

export function getKeyboardSelectedIndex(): number | null {
  return _keyboardSelectedIndex;
}

export function setKeyboardSelectedIndex(index: number | null): void {
  _keyboardSelectedIndex = index;
  if (index !== null) {
    _tooltipChipIndex = null;
    _tooltipHoverStartTime = performance.now();
  }
}

export function isKeyboardNavigationActive(): boolean {
  return _keyboardNavigationActive;
}

export function setKeyboardNavigationActive(active: boolean): void {
  _keyboardNavigationActive = active;
}

export function getScrollOffset(): number {
  return _scrollOffset;
}

/** Maximum vertical scroll offset before content runs out. */
export function getMaxScrollOffset(cellSize: number, itemCount: number): number {
  const slotH = CHIP_DRAWER.SLOT_ROWS * cellSize;
  const gap = cellSize * 0.5;
  const padding = cellSize * 0.5;
  const trayInnerWidth = (CHIP_DRAWER.TRAY_COL_END - CHIP_DRAWER.TRAY_COL_START + 1) * cellSize - padding * 2;
  const slotW = CHIP_DRAWER.SLOT_COLS * cellSize;
  const slotsPerRow = Math.max(1, Math.floor((trayInnerWidth + gap) / (slotW + gap)));
  const numRows = Math.ceil(itemCount / slotsPerRow);
  const contentHeight = numRows * slotH + (numRows - 1) * gap;
  const trayInnerHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * cellSize - padding * 2;
  return Math.max(0, contentHeight - trayInnerHeight);
}

export function setScrollOffset(offset: number): void {
  _scrollOffset = Math.max(0, offset);
}

export function isDeleteMode(): boolean {
  return _deleteMode;
}

export function setDeleteMode(active: boolean): void {
  _deleteMode = active;
}

// =============================================================================
// Easing Functions
// =============================================================================

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

// =============================================================================
// Animation
// =============================================================================

/**
 * Update drawer animation progress. Called each frame from render-loop.ts.
 */
export function updateDrawerAnimation(timestamp: number): void {
  if (_drawerState === 'open' || _drawerState === 'closed') return;

  if (_animStartTime < 0) {
    _animStartTime = timestamp;
    return; // First frame — just set start time
  }

  const elapsed = timestamp - _animStartTime;

  if (_drawerState === 'opening') {
    const duration = CHIP_DRAWER.OPEN_DURATION_MS;
    const raw = Math.min(elapsed / duration, 1);
    _drawerProgress = easeOutCubic(raw);
    if (raw >= 1) {
      _drawerState = 'open';
      _drawerProgress = 1;
    }
  } else if (_drawerState === 'closing') {
    const duration = CHIP_DRAWER.CLOSE_DURATION_MS;
    const raw = Math.min(elapsed / duration, 1);
    _drawerProgress = 1 - easeInCubic(raw);
    if (raw >= 1) {
      _drawerState = 'closed';
      _drawerProgress = 0;
      _deleteMode = false;
    }
  }
}

// =============================================================================
// Layout Computation
// =============================================================================

/** Get the handle rectangle in pixel coordinates. Handle slides up with progress. */
export function getHandleRect(cellSize: number, progress = 0) {
  const left = CHIP_DRAWER.HANDLE_COL_START * cellSize;
  const right = (CHIP_DRAWER.HANDLE_COL_END + 1) * cellSize;
  const trayHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * cellSize;
  const restTop = CHIP_DRAWER.HANDLE_ROW * cellSize;
  const top = restTop - trayHeight * progress;
  const height = cellSize; // 1 row tall
  return { left, top, width: right - left, height };
}

/** Get the tray rectangle in pixel coordinates, accounting for animation progress. */
export function getTrayRect(cellSize: number, progress: number) {
  // Tray sits directly below the handle, same width
  const left = CHIP_DRAWER.TRAY_COL_START * cellSize;
  const right = (CHIP_DRAWER.TRAY_COL_END + 1) * cellSize;
  const trayFullHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * cellSize;
  const handle = getHandleRect(cellSize, progress);
  const top = handle.top + handle.height;
  // Only the revealed portion — height grows with progress
  const height = trayFullHeight * progress;

  return { left, top, width: right - left, height };
}

/** Compute chip slot positions within the tray. Slots are anchored to the handle so they slide up with it. */
export function getChipSlotRects(
  cellSize: number,
  itemCount: number,
  scrollOffset: number,
  progress = 1,
) {
  const slotW = CHIP_DRAWER.SLOT_COLS * cellSize;
  const slotH = CHIP_DRAWER.SLOT_ROWS * cellSize;
  const padding = cellSize * 0.5;
  const gap = cellSize * 0.5;

  // Tray sits below handle at current progress — content slides up with the handle
  const handle = getHandleRect(cellSize, progress);
  const trayLeft = CHIP_DRAWER.TRAY_COL_START * cellSize;
  const trayTop = handle.top + handle.height;

  // Calculate how many slots fit per row
  const trayInnerWidth = (CHIP_DRAWER.TRAY_COL_END - CHIP_DRAWER.TRAY_COL_START + 1) * cellSize - padding * 2;
  const slotsPerRow = Math.max(1, Math.floor((trayInnerWidth + gap) / (slotW + gap)));

  // Vertical centering: compute total content height and offset within tray
  const numRows = Math.ceil(itemCount / slotsPerRow);
  const contentHeight = numRows * slotH + (numRows - 1) * gap;
  const trayInnerHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * cellSize - padding * 2;
  const verticalOffset = Math.max(0, (trayInnerHeight - contentHeight) / 2);

  const slots: Array<{ left: number; top: number; width: number; height: number }> = [];

  for (let i = 0; i < itemCount; i++) {
    const colIdx = i % slotsPerRow;
    const rowIdx = Math.floor(i / slotsPerRow);

    // Horizontal centering: count chips in this row and center them
    const chipsInThisRow = Math.min(slotsPerRow, itemCount - rowIdx * slotsPerRow);
    const rowWidth = chipsInThisRow * slotW + (chipsInThisRow - 1) * gap;
    const rowOffsetX = (trayInnerWidth - rowWidth) / 2;

    const left = trayLeft + padding + rowOffsetX + colIdx * (slotW + gap);
    const top = trayTop + padding + verticalOffset + rowIdx * (slotH + gap) - scrollOffset;
    slots.push({ left, top, width: slotW, height: slotH });
  }

  return { slots, slotsPerRow, totalWidth: slotsPerRow * (slotW + gap) - gap + padding * 2 };
}

/** Check if content overflows and needs scrolling. */
export function needsScroll(cellSize: number, itemCount: number): boolean {
  const slotW = CHIP_DRAWER.SLOT_COLS * cellSize;
  const gap = cellSize * 0.5;
  const padding = cellSize * 0.5;
  const trayInnerWidth = (CHIP_DRAWER.TRAY_COL_END - CHIP_DRAWER.TRAY_COL_START + 1) * cellSize - padding * 2;
  const slotsPerRow = Math.max(1, Math.floor((trayInnerWidth + gap) / (slotW + gap)));
  const rows = Math.ceil(itemCount / slotsPerRow);
  const trayInnerHeight = CHIP_DRAWER.TRAY_HEIGHT_ROWS * cellSize - padding * 2;
  const contentHeight = rows * (CHIP_DRAWER.SLOT_ROWS * cellSize + gap) - gap;
  return contentHeight > trayInnerHeight;
}

// =============================================================================
// Hit Testing
// =============================================================================

/**
 * Hit test the chip drawer at canvas pixel coordinates.
 * Returns null if outside the drawer entirely.
 */
export function hitTestChipDrawer(
  x: number,
  y: number,
  cellSize: number,
  progress: number,
  paletteItems: ReadonlyArray<PaletteItem>,
): ChipDrawerHit | null {
  // Handle hit test (slides up with progress)
  const handle = getHandleRect(cellSize, progress);
  if (x >= handle.left && x <= handle.left + handle.width &&
      y >= handle.top && y <= handle.top + handle.height) {
    return { type: 'handle' };
  }

  // Margin extension: cursor overshot below the grid but within handle columns
  const gridBottom = GRID_ROWS * cellSize;
  if (y >= gridBottom && x >= handle.left && x <= handle.left + handle.width) {
    return { type: 'handle' };
  }

  // Tray hit test (only when open/opening)
  if (progress <= 0) return null;

  const tray = getTrayRect(cellSize, progress);
  if (x < tray.left || x > tray.left + tray.width ||
      y < tray.top || y > tray.top + tray.height) {
    return null;
  }

  // Check individual chip slots (positioned at current progress)
  const { slots } = getChipSlotRects(cellSize, paletteItems.length, _scrollOffset, progress);
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (x >= slot.left && x <= slot.left + slot.width &&
        y >= slot.top && y <= slot.top + slot.height &&
        y >= tray.top && y <= tray.top + tray.height) {
      return { type: 'chip', index: i, paletteItem: paletteItems[i] };
    }
  }

  return { type: 'tray-background' };
}

/**
 * Check if a point is over the drawer delete trigger zone (handle area or below).
 * Used during node drag to decide when to open the drawer in delete mode.
 */
export function hitTestDeleteTrigger(
  x: number,
  y: number,
  cellSize: number,
): boolean {
  const handle = getHandleRect(cellSize, _drawerProgress);
  const margin = cellSize;
  const gridBottom = GRID_ROWS * cellSize;
  // Trigger zone: handle area (at current progress) + everything below to canvas bottom
  return x >= handle.left - margin && x <= handle.left + handle.width + margin &&
         y >= handle.top - margin && y <= Math.max(gridBottom, handle.top + handle.height) + margin;
}

/**
 * Check if a point is over the drawer delete zone during drag.
 * When delete mode is active and the drawer is open, the entire tray + handle is a drop target.
 * Otherwise falls back to the resting handle position for the initial drag hint.
 */
export function hitTestDeleteZone(
  x: number,
  y: number,
  cellSize: number,
): boolean {
  if (_deleteMode && _drawerProgress > 0) {
    // Expanded zone: handle + full tray area
    const handle = getHandleRect(cellSize, _drawerProgress);
    const tray = getTrayRect(cellSize, _drawerProgress);
    const margin = cellSize * 0.5;
    const top = handle.top - margin;
    const bottom = tray.top + tray.height + margin;
    const left = Math.min(handle.left, tray.left) - margin;
    const right = Math.max(handle.left + handle.width, tray.left + tray.width) + margin;
    return x >= left && x <= right && y >= top && y <= bottom;
  }
  // Fallback: resting handle position (progress=0)
  const handle = getHandleRect(cellSize, 0);
  const margin = cellSize;
  return x >= handle.left - margin && x <= handle.left + handle.width + margin &&
         y >= handle.top - margin && y <= handle.top + handle.height + margin;
}

// =============================================================================
// Hardcoded Colors (Physical Device Aesthetic)
// =============================================================================

// Unified beige panel (from shared retro-plastic constants)
const PANEL_GRAD_TOP = RETRO_PANEL.GRAD_TOP;
const PANEL_GRAD_MID = RETRO_PANEL.GRAD_MID;
const PANEL_GRAD_BOT = RETRO_PANEL.GRAD_BOT;

// Grip lines on handle
const GRIP_COLOR = 'rgba(0,0,0,0.15)';
const GRIP_HIGHLIGHT = 'rgba(255,255,255,0.25)';

// Chip slot (dark insets on beige background)
const SLOT_BG = 'rgba(0,0,0,0.06)';
const SLOT_HOVER_BG = 'rgba(0,0,0,0.10)';
const SLOT_SELECTED_BORDER = '#5a9bf5';

// Tooltip
const TOOLTIP_BG = 'rgba(20,20,28,0.95)';
const TOOLTIP_BORDER = 'rgba(255,255,255,0.15)';
const TOOLTIP_TEXT = '#e0e0f0';
const TOOLTIP_DESC = '#9090b0';

// Delete zone
const DELETE_ZONE_BG = 'rgba(224,56,56,0.25)';
const DELETE_ZONE_BORDER = '#E03838';

// Badge
const BADGE_BG = 'rgba(0,0,0,0.7)';
const BADGE_TEXT = '#c0c0d0';

// =============================================================================
// Drawing
// =============================================================================

/**
 * Draw the chip drawer (handle + tray if open).
 * Called each frame from render-loop.ts.
 */
export function drawChipDrawer(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: ChipDrawerRenderState,
  cellSize: number,
): void {
  // Update tooltip timing
  const now = performance.now();
  const activeIndex = _keyboardNavigationActive ? _keyboardSelectedIndex : _hoveredChipIndex;
  if (activeIndex !== null && _tooltipHoverStartTime > 0 &&
      now - _tooltipHoverStartTime >= CHIP_DRAWER.TOOLTIP_DELAY_MS) {
    _tooltipChipIndex = activeIndex;
  }

  // Draw tray first (if visible) so handle overlaps it
  let tooltipInfo: TooltipInfo | null = null;
  if (_drawerProgress > 0) {
    if (_deleteMode) {
      drawDeleteTray(ctx, cellSize);
    } else {
      tooltipInfo = drawTray(ctx, tokens, state, cellSize);
    }
  }

  // Draw handle on top at animated position
  drawHandle(ctx, cellSize, state.isDraggingChip);

  // Draw tooltip last so it appears above the handle
  if (tooltipInfo) {
    drawTooltip(ctx, tokens, tooltipInfo.item, tooltipInfo.slot, cellSize, tooltipInfo.tray);
  }
}

// --- Handle ---

function drawHandle(
  ctx: CanvasRenderingContext2D,
  cellSize: number,
  isDraggingChip: boolean,
): void {
  const handle = getHandleRect(cellSize, _drawerProgress);
  const cr = 6;

  ctx.save();

  if (_deleteMode) {
    // Delete mode: red-tinted handle (no text — trash icon is in the tray)
    ctx.fillStyle = DELETE_ZONE_BG;
    ctx.beginPath();
    ctx.roundRect(handle.left, handle.top, handle.width, handle.height, [cr, cr, 0, 0]);
    ctx.fill();

    ctx.strokeStyle = DELETE_ZONE_BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(handle.left, handle.top, handle.width, handle.height, [cr, cr, 0, 0]);
    ctx.stroke();
  } else if (isDraggingChip) {
    // Dragging hint: beige handle with faint red border + dimmed "DROP TO DELETE" text
    const grad = ctx.createLinearGradient(0, handle.top, 0, handle.top + handle.height);
    grad.addColorStop(0, PANEL_GRAD_TOP);
    grad.addColorStop(0.4, PANEL_GRAD_MID);
    grad.addColorStop(1, PANEL_GRAD_BOT);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(handle.left, handle.top, handle.width, handle.height, [cr, cr, 0, 0]);
    ctx.fill();

    ctx.strokeStyle = 'rgba(224,56,56,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(handle.left, handle.top, handle.width, handle.height, [cr, cr, 0, 0]);
    ctx.stroke();

    // Dimmed "DROP TO DELETE" text
    const fontSize = Math.round(cellSize * 0.35);
    ctx.fillStyle = 'rgba(224,56,56,0.5)';
    ctx.font = `bold ${fontSize}px ${CARD_BODY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP TO DELETE', handle.left + handle.width / 2, handle.top + handle.height / 2);
  } else {
    // Normal handle: beige panel with grip lines
    const grad = ctx.createLinearGradient(0, handle.top, 0, handle.top + handle.height);
    grad.addColorStop(0, PANEL_GRAD_TOP);
    grad.addColorStop(0.4, PANEL_GRAD_MID);
    grad.addColorStop(1, PANEL_GRAD_BOT);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(handle.left, handle.top, handle.width, handle.height, [cr, cr, 0, 0]);
    ctx.fill();

    // Top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(handle.left + cr, handle.top, handle.width - cr * 2, 1);

    // Grip lines (horizontal lines in center)
    const gripCount = 3;
    const gripSpacing = handle.height / (gripCount + 1);
    const gripWidth = Math.min(60, handle.width * 0.15);
    const gripCenterX = handle.left + handle.width / 2;
    for (let i = 1; i <= gripCount; i++) {
      const gy = handle.top + i * gripSpacing;
      ctx.fillStyle = GRIP_COLOR;
      ctx.fillRect(gripCenterX - gripWidth / 2, gy, gripWidth, 1);
      ctx.fillStyle = GRIP_HIGHLIGHT;
      ctx.fillRect(gripCenterX - gripWidth / 2, gy + 1, gripWidth, 1);
    }

    // Hover brightness
    if (_handleHovered) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(handle.left, handle.top, handle.width, handle.height, [cr, cr, 0, 0]);
      ctx.fill();
    }
  }

  ctx.restore();
}

// --- Delete Tray ---

function drawDeleteTray(
  ctx: CanvasRenderingContext2D,
  cellSize: number,
): void {
  const tray = getTrayRect(cellSize, _drawerProgress);
  if (tray.height <= 0) return;

  ctx.save();

  // Clip to tray visible bounds
  ctx.beginPath();
  ctx.rect(tray.left, tray.top, tray.width, tray.height);
  ctx.clip();

  // Beige gradient background with red wash
  const grad = ctx.createLinearGradient(0, tray.top, 0, tray.top + tray.height);
  grad.addColorStop(0, PANEL_GRAD_MID);
  grad.addColorStop(0.3, PANEL_GRAD_MID);
  grad.addColorStop(1, PANEL_GRAD_BOT);
  ctx.fillStyle = grad;
  ctx.fillRect(tray.left, tray.top, tray.width, tray.height);

  // Red wash overlay
  ctx.fillStyle = 'rgba(224,56,56,0.08)';
  ctx.fillRect(tray.left, tray.top, tray.width, tray.height);

  // Subtle inner shadow at top edge
  const insetShadow = ctx.createLinearGradient(0, tray.top, 0, tray.top + 6);
  insetShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
  insetShadow.addColorStop(1, 'transparent');
  ctx.fillStyle = insetShadow;
  ctx.fillRect(tray.left, tray.top, tray.width, 6);

  // Trash can icon centered in the tray
  drawTrashCanIcon(ctx, tray, cellSize);

  ctx.restore();
}

function drawTrashCanIcon(
  ctx: CanvasRenderingContext2D,
  tray: { left: number; top: number; width: number; height: number },
  cellSize: number,
): void {
  const scale = cellSize / 20; // base scale factor (20px reference cell)
  const cx = tray.left + tray.width / 2;
  const cy = tray.top + tray.height / 2;

  // Icon dimensions (scaled)
  const bodyW = 36 * scale;
  const bodyH = 44 * scale;
  const lidW = 42 * scale;
  const lidH = 4 * scale;
  const knobW = 12 * scale;
  const knobH = 4 * scale;
  const lidGap = 3 * scale;
  const taper = 4 * scale; // body narrows at bottom
  const cr = 3 * scale;

  // Vertical layout: knob, lid, gap, body
  const totalH = knobH + lidH + lidGap + bodyH;
  const topY = cy - totalH / 2;

  ctx.save();

  // --- Knob (small rectangle on top of lid) ---
  const knobX = cx - knobW / 2;
  const knobY = topY;
  ctx.fillStyle = DELETE_ZONE_BORDER;
  ctx.beginPath();
  ctx.roundRect(knobX, knobY, knobW, knobH, 2 * scale);
  ctx.fill();

  // --- Lid bar ---
  const lidX = cx - lidW / 2;
  const lidY = topY + knobH;
  ctx.fillStyle = DELETE_ZONE_BORDER;
  ctx.beginPath();
  ctx.roundRect(lidX, lidY, lidW, lidH, 1.5 * scale);
  ctx.fill();

  // --- Body (tapered trapezoid) ---
  const bodyTop = lidY + lidH + lidGap;
  const bodyTopLeft = cx - bodyW / 2;
  const bodyTopRight = cx + bodyW / 2;
  const bodyBotLeft = cx - bodyW / 2 + taper;
  const bodyBotRight = cx + bodyW / 2 - taper;
  const bodyBot = bodyTop + bodyH;

  // Semi-transparent fill
  ctx.fillStyle = 'rgba(224,56,56,0.15)';
  ctx.beginPath();
  ctx.moveTo(bodyTopLeft + cr, bodyTop);
  ctx.lineTo(bodyTopRight - cr, bodyTop);
  ctx.quadraticCurveTo(bodyTopRight, bodyTop, bodyTopRight, bodyTop + cr);
  ctx.lineTo(bodyBotRight, bodyBot - cr);
  ctx.quadraticCurveTo(bodyBotRight, bodyBot, bodyBotRight - cr, bodyBot);
  ctx.lineTo(bodyBotLeft + cr, bodyBot);
  ctx.quadraticCurveTo(bodyBotLeft, bodyBot, bodyBotLeft, bodyBot - cr);
  ctx.lineTo(bodyTopLeft, bodyTop + cr);
  ctx.quadraticCurveTo(bodyTopLeft, bodyTop, bodyTopLeft + cr, bodyTop);
  ctx.closePath();
  ctx.fill();

  // Outline
  ctx.strokeStyle = DELETE_ZONE_BORDER;
  ctx.lineWidth = 2 * scale;
  ctx.stroke();

  // --- 3 vertical slat lines ---
  const slatInset = 6 * scale;
  const slatTop = bodyTop + slatInset;
  const slatBot = bodyBot - slatInset;
  ctx.strokeStyle = DELETE_ZONE_BORDER;
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = 'round';

  for (let i = -1; i <= 1; i++) {
    const sx = cx + i * (bodyW * 0.22);
    // Adjust for taper: slats converge slightly at bottom
    const topX = sx;
    const botX = sx + i * (-taper * 0.3);
    ctx.beginPath();
    ctx.moveTo(topX, slatTop);
    ctx.lineTo(botX, slatBot);
    ctx.stroke();
  }

  ctx.restore();
}

// --- Tray ---

function drawTray(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: ChipDrawerRenderState,
  cellSize: number,
): TooltipInfo | null {
  const { paletteItems, craftedPuzzles, craftedUtilities } = state;
  const tray = getTrayRect(cellSize, _drawerProgress);
  if (tray.height <= 0) return null;

  ctx.save();

  // Clip to tray visible bounds (no top rounding — handle sits on top)
  ctx.beginPath();
  ctx.rect(tray.left, tray.top, tray.width, tray.height);
  ctx.clip();

  // Beige gradient background (matching handle/playback bar panels)
  const grad = ctx.createLinearGradient(0, tray.top, 0, tray.top + tray.height);
  grad.addColorStop(0, PANEL_GRAD_MID);
  grad.addColorStop(0.3, PANEL_GRAD_MID);
  grad.addColorStop(1, PANEL_GRAD_BOT);
  ctx.fillStyle = grad;
  ctx.fillRect(tray.left, tray.top, tray.width, tray.height);

  // Radial sheen (matching playback bar panel style)
  const sheenCtx = ctx;
  sheenCtx.save();
  const sheen = sheenCtx.createRadialGradient(
    tray.left + tray.width / 2, tray.top + tray.height * 0.2, 0,
    tray.left + tray.width / 2, tray.top + tray.height * 0.2,
    Math.max(tray.width, tray.height) * 0.7,
  );
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'transparent');
  sheenCtx.fillStyle = sheen;
  sheenCtx.fillRect(tray.left, tray.top, tray.width, tray.height);
  sheenCtx.restore();

  // Subtle inner shadow at top edge (inset look under handle)
  const insetShadow = ctx.createLinearGradient(0, tray.top, 0, tray.top + 6);
  insetShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
  insetShadow.addColorStop(1, 'transparent');
  ctx.fillStyle = insetShadow;
  ctx.fillRect(tray.left, tray.top, tray.width, 6);

  // Bottom shadow line
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(tray.left, tray.top + tray.height - 1, tray.width, 1);

  // Draw chip slots (positioned at current progress — slide up with handle)
  const { slots } = getChipSlotRects(cellSize, paletteItems.length, _scrollOffset, _drawerProgress);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const item = paletteItems[i];
    if (!item) continue;

    // Skip slots entirely outside tray
    if (slot.left + slot.width < tray.left || slot.left > tray.left + tray.width) continue;
    if (slot.top + slot.height < tray.top || slot.top > tray.top + tray.height) continue;

    const isHovered = _hoveredChipIndex === i;
    const isSelected = _keyboardSelectedIndex === i;

    // Slot background (subtle recessed inset on beige)
    ctx.fillStyle = (isHovered || isSelected) ? SLOT_HOVER_BG : SLOT_BG;
    ctx.beginPath();
    ctx.roundRect(slot.left, slot.top, slot.width, slot.height, 4);
    ctx.fill();

    // Draw chip using the real node renderer (same as board chips)
    drawChipInSlot(ctx, tokens, item, slot, cellSize, craftedPuzzles, craftedUtilities);

    // Remaining count badge
    if (item.remaining !== null && item.remaining >= 0) {
      drawBadge(ctx, slot.left + slot.width - 8, slot.top + 6, item.remaining, cellSize);
    }

    // Selected border (keyboard navigation)
    if (isSelected) {
      ctx.strokeStyle = SLOT_SELECTED_BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(slot.left, slot.top, slot.width, slot.height, 4);
      ctx.stroke();
    }
  }

  ctx.restore();

  // Return tooltip info to be drawn after the handle (so it appears on top)
  if (_tooltipChipIndex !== null && _tooltipChipIndex < paletteItems.length && slots[_tooltipChipIndex]) {
    return { item: paletteItems[_tooltipChipIndex], slot: slots[_tooltipChipIndex], tray };
  }
  return null;
}

// --- Chip in Slot (using real node renderer) ---

/**
 * Render a chip inside a drawer slot using the full drawSingleNode pipeline.
 * Follows the placement ghost pattern: builds a synthetic ChipState at origin,
 * probes its body rect, computes a miniCellSize to fit the slot, then
 * translates + draws.
 */
function drawChipInSlot(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  item: PaletteItem,
  slot: { left: number; top: number; width: number; height: number },
  cellSize: number,
  craftedPuzzles: ReadonlyMap<string, CraftedPuzzleEntry>,
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>,
): void {
  const { socketCount, plugCount } = getPortCountsFromType(item.chipType, craftedPuzzles, craftedUtilities);
  const params = getDefaultParams(item.chipType);

  // Build synthetic chip at grid origin
  const ghostNode: ChipState = {
    id: '__drawer__',
    type: item.chipType,
    position: { col: 0, row: 0 },
    params,
    socketCount,
    plugCount,
    rotation: 0,
  };

  // Use the same cellSize as the gameboard so all chips appear at true board scale
  const miniCellSize = cellSize;
  const miniRect = getNodeBodyPixelRect(ghostNode, miniCellSize);

  // Center the chip body in the slot
  const cx = slot.left + slot.width / 2;
  const cy = slot.top + slot.height / 2;
  const offsetX = cx - (miniRect.x + miniRect.width / 2);
  const offsetY = cy - (miniRect.y + miniRect.height / 2);

  // Build minimal render state with no signals/connections
  const knobValues = new Map<string, KnobInfo>();
  const knobCfg = getKnobConfig(getChipDefinition(ghostNode.type));
  if (knobCfg) {
    const defaultValue = (ghostNode.params[knobCfg.paramKey] as number) ?? 0;
    knobValues.set('__drawer__', { value: defaultValue, isWired: false });
  }

  const renderState: RenderNodesState = {
    craftedPuzzles,
    craftedUtilities,
    chips: new Map([['__drawer__', ghostNode]]),
    selectedChipId: null,
    hoveredChipId: null,
    knobValues,
    portSignals: new Map(),
    rejectedKnobChipId: null,
    connectedSocketPorts: new Set(),
    connectedPlugPorts: new Set(),
    liveChipIds: new Set(['__drawer__']),
  };

  ctx.save();
  ctx.translate(offsetX, offsetY);
  drawSingleNode(ctx, tokens, ghostNode, renderState, miniCellSize);
  ctx.restore();
}

// --- Badge ---

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  cellSize: number,
): void {
  const fontSize = Math.round(cellSize * 0.3);
  const text = String(count);
  ctx.font = `bold ${fontSize}px ${CARD_BODY_FONT}`;
  const tw = ctx.measureText(text).width;
  const padX = 4;
  const padY = 2;
  const w = tw + padX * 2;
  const h = fontSize + padY * 2;

  ctx.fillStyle = BADGE_BG;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
  ctx.fill();

  ctx.fillStyle = count > 0 ? BADGE_TEXT : '#E03838';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// --- Tooltip ---

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  _tokens: ThemeTokens,
  item: PaletteItem,
  slot: { left: number; top: number; width: number; height: number } | undefined,
  cellSize: number,
  tray: { left: number; top: number; width: number; height: number },
): void {
  if (!slot) return;

  // Get description from node definition or item
  const def = getChipDefinition(item.chipType);
  const description = def?.description ?? '';

  const titleSize = Math.round(cellSize * 0.4);
  const descSize = Math.round(cellSize * 0.32);
  const padX = cellSize * 0.4;
  const padY = cellSize * 0.3;
  const gap = cellSize * 0.15;

  ctx.font = `bold ${titleSize}px ${CARD_BODY_FONT}`;
  const titleW = ctx.measureText(item.label).width;
  ctx.font = `${descSize}px ${CARD_BODY_FONT}`;
  const descW = description ? ctx.measureText(description).width : 0;

  const boxW = Math.max(titleW, descW) + padX * 2;
  const boxH = titleSize + (description ? gap + descSize : 0) + padY * 2;

  // Position above the slot, centered
  let boxX = slot.left + slot.width / 2 - boxW / 2;
  const boxY = slot.top - boxH - 6;

  // Clamp to tray bounds
  if (boxX < tray.left + 4) boxX = tray.left + 4;
  if (boxX + boxW > tray.left + tray.width - 4) boxX = tray.left + tray.width - 4 - boxW;

  ctx.save();

  // Background
  ctx.fillStyle = TOOLTIP_BG;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = TOOLTIP_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title
  ctx.fillStyle = TOOLTIP_TEXT;
  ctx.font = `bold ${titleSize}px ${CARD_BODY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(item.label, boxX + padX, boxY + padY);

  // Description
  if (description) {
    ctx.fillStyle = TOOLTIP_DESC;
    ctx.font = `${descSize}px ${CARD_BODY_FONT}`;
    ctx.fillText(description, boxX + padX, boxY + padY + titleSize + gap);
  }

  ctx.restore();
}

// =============================================================================
// Occupancy blocking
// =============================================================================

/**
 * Check if a node placement rectangle overlaps the chip drawer handle region.
 */
export function isOverlappingChipDrawer(
  col: number,
  row: number,
  cols: number,
  rows: number,
): boolean {
  const nodeRight = col + cols - 1;
  const nodeBottom = row + rows - 1;

  return (
    col <= CHIP_DRAWER.HANDLE_COL_END &&
    nodeRight >= CHIP_DRAWER.HANDLE_COL_START &&
    row <= CHIP_DRAWER.HANDLE_ROW &&
    nodeBottom >= CHIP_DRAWER.HANDLE_ROW
  );
}
