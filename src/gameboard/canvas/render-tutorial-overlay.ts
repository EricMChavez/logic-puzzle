/**
 * Canvas rendering for the tutorial overlay system.
 * Three layers: dimming with cutout, tooltip card, animated cursor.
 *
 * All coordinates are in viewport pixels (call after resetting transform to DPR-only).
 */
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { TutorialStep, TutorialHighlight, CursorAnimation } from '../../store/slices/tutorial-slice.ts';
import { PLAYABLE_START, PLAYABLE_END, METER_LEFT_START, METER_RIGHT_START, METER_RIGHT_END, GRID_ROWS } from '../../shared/grid/constants.ts';
import { METER_GRID_ROWS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS } from '../meters/meter-types.ts';

export interface TutorialRenderState {
  step: TutorialStep;
  stepStartTime: number;
  /** Dynamically resolved cursor path (overrides step.cursor when present) */
  resolvedCursor?: CursorAnimation;
}

// =============================================================================
// Main entry point
// =============================================================================

export function drawTutorialOverlay(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: TutorialRenderState,
  cellSize: number,
  offset: { x: number; y: number },
  vpWidth: number,
  vpHeight: number,
  timestamp: number,
): void {
  const { step, stepStartTime } = state;

  // 1. Dimming with cutout
  const cutoutRect = getHighlightRect(step.highlight, cellSize, offset);
  drawDimmingLayer(ctx, cutoutRect, vpWidth, vpHeight);

  // 2. Tooltip card
  drawTooltipCard(ctx, tokens, step, cutoutRect, vpWidth, vpHeight);

  // 3. Next button (for next-button advance steps)
  if (step.advanceOn.type === 'next-button') {
    drawNextButton(ctx, vpWidth, vpHeight);
  }

  // 4. Animated cursor (prefer resolved path over static step.cursor)
  const cursor = state.resolvedCursor ?? step.cursor;
  if (cursor) {
    drawAnimatedCursor(ctx, cursor, cellSize, offset, timestamp, stepStartTime);
  }
}

// =============================================================================
// Highlight rect computation
// =============================================================================

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getHighlightRect(
  highlight: TutorialHighlight,
  cellSize: number,
  offset: { x: number; y: number },
): PixelRect | null {
  switch (highlight.type) {
    case 'none':
      return null;

    case 'grid-rect':
      return {
        x: offset.x + highlight.col * cellSize,
        y: offset.y + highlight.row * cellSize,
        w: highlight.cols * cellSize,
        h: highlight.rows * cellSize,
      };

    case 'meter-zone': {
      const meterCol = highlight.side === 'left' ? METER_LEFT_START : METER_RIGHT_START;
      const meterCols = highlight.side === 'left' ? (PLAYABLE_START - METER_LEFT_START) : (METER_RIGHT_END - METER_RIGHT_START + 1);
      const meterStride = METER_GRID_ROWS + METER_GAP_ROWS;
      const meterRow = highlight.slotIndex * meterStride + (METER_VERTICAL_OFFSETS[highlight.slotIndex] ?? 0);
      return {
        x: offset.x + meterCol * cellSize,
        y: offset.y + meterRow * cellSize,
        w: meterCols * cellSize,
        h: METER_GRID_ROWS * cellSize,
      };
    }

    case 'full-board':
      return {
        x: offset.x + PLAYABLE_START * cellSize,
        y: offset.y,
        w: (PLAYABLE_END - PLAYABLE_START + 1) * cellSize,
        h: GRID_ROWS * cellSize,
      };
  }
}

// =============================================================================
// Layer 1: Dimming with cutout
// =============================================================================

const DIM_COLOR = 'rgba(0,0,0,0.55)';
const CUTOUT_BORDER_COLOR = 'rgba(245,175,40,0.4)';
const CUTOUT_BORDER_WIDTH = 2;
const CUTOUT_CORNER_RADIUS = 6;

function drawDimmingLayer(
  ctx: CanvasRenderingContext2D,
  cutoutRect: PixelRect | null,
  vpWidth: number,
  vpHeight: number,
): void {
  ctx.save();

  if (cutoutRect) {
    // Draw full dim with cutout using evenodd fill rule
    ctx.beginPath();
    // Outer rect (full viewport)
    ctx.rect(0, 0, vpWidth, vpHeight);
    // Inner rect (cutout) — wound opposite direction for evenodd
    roundedRectPath(ctx, cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h, CUTOUT_CORNER_RADIUS);
    ctx.fillStyle = DIM_COLOR;
    ctx.fill('evenodd');

    // Cutout border
    ctx.beginPath();
    roundedRectPath(ctx, cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h, CUTOUT_CORNER_RADIUS);
    ctx.strokeStyle = CUTOUT_BORDER_COLOR;
    ctx.lineWidth = CUTOUT_BORDER_WIDTH;
    ctx.stroke();
  } else {
    // No cutout — just a light dim for tooltip readability
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, vpWidth, vpHeight);
  }

  ctx.restore();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number,
): void {
  const r2 = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r2, y);
  ctx.lineTo(x + w - r2, y);
  ctx.arcTo(x + w, y, x + w, y + r2, r2);
  ctx.lineTo(x + w, y + h - r2);
  ctx.arcTo(x + w, y + h, x + w - r2, y + h, r2);
  ctx.lineTo(x + r2, y + h);
  ctx.arcTo(x, y + h, x, y + h - r2, r2);
  ctx.lineTo(x, y + r2);
  ctx.arcTo(x, y, x + r2, y, r2);
  ctx.closePath();
}

// =============================================================================
// Layer 2: Tooltip card
// =============================================================================

const TOOLTIP_PAD_X = 16;
const TOOLTIP_PAD_Y = 12;
const TOOLTIP_CORNER_RADIUS = 8;
const TOOLTIP_BG = 'rgba(20,20,30,0.92)';
const TOOLTIP_BORDER = 'rgba(245,175,40,0.6)';
const TOOLTIP_MARGIN = 12;
const TEXT_FONT_SIZE = 16;
const SUBTEXT_FONT_SIZE = 13;
const LINE_SPACING = 6;

function drawTooltipCard(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  step: TutorialStep,
  cutoutRect: PixelRect | null,
  vpWidth: number,
  vpHeight: number,
): void {
  ctx.save();

  // Measure text
  ctx.font = `bold ${TEXT_FONT_SIZE}px 'Bungee', monospace`;
  const textWidth = ctx.measureText(step.text).width;
  ctx.font = `${SUBTEXT_FONT_SIZE}px 'IBM Plex Mono', monospace`;
  const subtextWidth = step.subtext ? ctx.measureText(step.subtext).width : 0;

  const contentWidth = Math.max(textWidth, subtextWidth);
  const cardWidth = contentWidth + TOOLTIP_PAD_X * 2;
  const cardHeight = TOOLTIP_PAD_Y * 2 + TEXT_FONT_SIZE
    + (step.subtext ? LINE_SPACING + SUBTEXT_FONT_SIZE : 0);

  // Position the card
  const pos = computeTooltipPosition(
    step.tooltipPosition, cutoutRect, cardWidth, cardHeight, vpWidth, vpHeight,
  );

  // Card background
  ctx.beginPath();
  roundedRectPath(ctx, pos.x, pos.y, cardWidth, cardHeight, TOOLTIP_CORNER_RADIUS);
  ctx.fillStyle = TOOLTIP_BG;
  ctx.fill();
  ctx.strokeStyle = TOOLTIP_BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Primary text
  ctx.font = `bold ${TEXT_FONT_SIZE}px 'Bungee', monospace`;
  ctx.fillStyle = tokens.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(step.text, pos.x + TOOLTIP_PAD_X, pos.y + TOOLTIP_PAD_Y);

  // Subtext
  if (step.subtext) {
    ctx.font = `${SUBTEXT_FONT_SIZE}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = tokens.textSecondary;
    ctx.fillText(
      step.subtext,
      pos.x + TOOLTIP_PAD_X,
      pos.y + TOOLTIP_PAD_Y + TEXT_FONT_SIZE + LINE_SPACING,
    );
  }

  ctx.restore();
}

function computeTooltipPosition(
  position: string,
  cutoutRect: PixelRect | null,
  cardWidth: number,
  cardHeight: number,
  vpWidth: number,
  vpHeight: number,
): { x: number; y: number } {
  let x: number;
  let y: number;

  if (!cutoutRect || position === 'center') {
    // Center of viewport
    x = (vpWidth - cardWidth) / 2;
    y = (vpHeight - cardHeight) / 2;
  } else {
    switch (position) {
      case 'above':
        x = cutoutRect.x + (cutoutRect.w - cardWidth) / 2;
        y = cutoutRect.y - cardHeight - TOOLTIP_MARGIN;
        break;
      case 'below':
        x = cutoutRect.x + (cutoutRect.w - cardWidth) / 2;
        y = cutoutRect.y + cutoutRect.h + TOOLTIP_MARGIN;
        break;
      case 'left':
        x = cutoutRect.x - cardWidth - TOOLTIP_MARGIN;
        y = cutoutRect.y + (cutoutRect.h - cardHeight) / 2;
        break;
      case 'right':
        x = cutoutRect.x + cutoutRect.w + TOOLTIP_MARGIN;
        y = cutoutRect.y + (cutoutRect.h - cardHeight) / 2;
        break;
      default:
        x = (vpWidth - cardWidth) / 2;
        y = (vpHeight - cardHeight) / 2;
    }
  }

  // Clamp to viewport
  x = Math.max(TOOLTIP_MARGIN, Math.min(x, vpWidth - cardWidth - TOOLTIP_MARGIN));
  y = Math.max(TOOLTIP_MARGIN, Math.min(y, vpHeight - cardHeight - TOOLTIP_MARGIN));

  return { x, y };
}

// =============================================================================
// Next button (bottom-right)
// =============================================================================

const NEXT_BTN_WIDTH = 100;
const NEXT_BTN_HEIGHT = 36;
const NEXT_BTN_MARGIN = 24;
const NEXT_BTN_RADIUS = 6;
const NEXT_BTN_BG = 'rgba(245,175,40,0.9)';
const NEXT_BTN_TEXT_COLOR = '#0d0f14';
const NEXT_BTN_FONT_SIZE = 15;

/** Returns the pixel rect for the Next button. Used for hit testing. */
export function getNextButtonRect(vpWidth: number, vpHeight: number): PixelRect {
  return {
    x: vpWidth - NEXT_BTN_WIDTH - NEXT_BTN_MARGIN,
    y: vpHeight - NEXT_BTN_HEIGHT - NEXT_BTN_MARGIN,
    w: NEXT_BTN_WIDTH,
    h: NEXT_BTN_HEIGHT,
  };
}

function drawNextButton(
  ctx: CanvasRenderingContext2D,
  vpWidth: number,
  vpHeight: number,
): void {
  const r = getNextButtonRect(vpWidth, vpHeight);
  ctx.save();

  // Button background
  ctx.beginPath();
  roundedRectPath(ctx, r.x, r.y, r.w, r.h, NEXT_BTN_RADIUS);
  ctx.fillStyle = NEXT_BTN_BG;
  ctx.fill();

  // Button text
  ctx.font = `bold ${NEXT_BTN_FONT_SIZE}px 'Bungee', monospace`;
  ctx.fillStyle = NEXT_BTN_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Next >', r.x + r.w / 2, r.y + r.h / 2);

  ctx.restore();
}

// =============================================================================
// Layer 4: Animated cursor
// =============================================================================

const CURSOR_SIZE = 16;
const CURSOR_COLOR = '#F5AF28';
const CURSOR_CLICK_COLOR = 'rgba(245,175,40,0.5)';
const CLICK_RIPPLE_DURATION = 400;
const CLICK_RIPPLE_MAX_RADIUS = 20;

function drawAnimatedCursor(
  ctx: CanvasRenderingContext2D,
  cursor: CursorAnimation,
  cellSize: number,
  offset: { x: number; y: number },
  timestamp: number,
  stepStartTime: number,
): void {
  const elapsed = timestamp - stepStartTime;
  const totalDuration = cursor.delayMs + cursor.durationMs;
  const cycleTime = cursor.loop
    ? totalDuration + CLICK_RIPPLE_DURATION
    : totalDuration + CLICK_RIPPLE_DURATION;
  const cycleElapsed = cursor.loop
    ? elapsed % cycleTime
    : Math.min(elapsed, cycleTime);

  if (cycleElapsed < cursor.delayMs) return; // In delay phase

  const moveElapsed = cycleElapsed - cursor.delayMs;
  const moveT = Math.min(moveElapsed / cursor.durationMs, 1);
  const easedT = easeInOutCubic(moveT);

  // Interpolate along path
  const pos = interpolatePath(cursor.path, easedT, cellSize, offset);

  ctx.save();

  // Cursor pointer (triangle + dot)
  ctx.translate(pos.x, pos.y);
  ctx.fillStyle = CURSOR_COLOR;
  ctx.beginPath();
  // Simple pointer triangle
  ctx.moveTo(0, 0);
  ctx.lineTo(0, CURSOR_SIZE);
  ctx.lineTo(CURSOR_SIZE * 0.6, CURSOR_SIZE * 0.7);
  ctx.closePath();
  ctx.fill();
  // Dot at tip
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  // Click ripple at end of path
  if (cursor.clickAtEnd && moveT >= 1) {
    const rippleElapsed = moveElapsed - cursor.durationMs;
    if (rippleElapsed > 0 && rippleElapsed < CLICK_RIPPLE_DURATION) {
      const rippleT = rippleElapsed / CLICK_RIPPLE_DURATION;
      const radius = rippleT * CLICK_RIPPLE_MAX_RADIUS;
      const alpha = 1 - rippleT;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = CURSOR_CLICK_COLOR.replace('0.5', String(alpha * 0.5));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function interpolatePath(
  path: { col: number; row: number }[],
  t: number,
  cellSize: number,
  offset: { x: number; y: number },
): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1 || t <= 0) {
    return {
      x: offset.x + path[0].col * cellSize + cellSize / 2,
      y: offset.y + path[0].row * cellSize + cellSize / 2,
    };
  }
  if (t >= 1) {
    const last = path[path.length - 1];
    return {
      x: offset.x + last.col * cellSize + cellSize / 2,
      y: offset.y + last.row * cellSize + cellSize / 2,
    };
  }

  // Distribute t across segments
  const segments = path.length - 1;
  const segT = t * segments;
  const segIndex = Math.min(Math.floor(segT), segments - 1);
  const localT = segT - segIndex;

  const from = path[segIndex];
  const to = path[segIndex + 1];

  return {
    x: offset.x + (from.col + (to.col - from.col) * localT) * cellSize + cellSize / 2,
    y: offset.y + (from.row + (to.row - from.row) * localT) * cellSize + cellSize / 2,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
