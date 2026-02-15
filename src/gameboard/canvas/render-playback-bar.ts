import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { PLAYBACK_BAR } from '../../shared/constants/index.ts';

// --- Types ---

export type PlaybackButton = 'prev' | 'play-pause' | 'next';

export interface PlaybackBarRenderState {
  playMode: 'playing' | 'paused';
  hoveredButton: PlaybackButton | null;
}

export interface PlaybackBarHit {
  button: PlaybackButton;
}

// --- Module-level hover state (singleton pattern like keyboard-focus.ts) ---

let _hoveredButton: PlaybackButton | null = null;

export function getHoveredPlaybackButton(): PlaybackButton | null {
  return _hoveredButton;
}

export function setHoveredPlaybackButton(button: PlaybackButton | null): void {
  _hoveredButton = button;
}

// --- Geometry helpers ---

/** Compute the 4 corner points of the trapezoid in pixel coordinates. */
function getTrapezoidPoints(cellSize: number) {
  const left = PLAYBACK_BAR.COL_START * cellSize;
  const right = (PLAYBACK_BAR.COL_END + 1) * cellSize;
  const top = PLAYBACK_BAR.ROW_START * cellSize;
  const bottom = (PLAYBACK_BAR.ROW_END + 1) * cellSize;
  const width = right - left;
  const inset = 2 * cellSize; // bottom edge is narrower by 2 grid cols on each side

  return {
    // Top-left, top-right, bottom-right, bottom-left
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomRight: { x: right - inset, y: bottom },
    bottomLeft: { x: left + inset, y: bottom },
    // Bounding box
    left, right, top, bottom, width,
    inset,
  };
}

/** Get the 3 button regions within the straight (top-edge) section of the trapezoid. */
function getButtonRegions(cellSize: number) {
  const trap = getTrapezoidPoints(cellSize);
  // Buttons span only the straight section (top edge width)
  const straightLeft = trap.topLeft.x;
  const straightRight = trap.topRight.x;
  const straightWidth = straightRight - straightLeft;
  const third = straightWidth / 3;

  return {
    prev: { left: straightLeft, right: straightLeft + third, centerX: straightLeft + third / 2 },
    'play-pause': { left: straightLeft + third, right: straightLeft + third * 2, centerX: straightLeft + third * 1.5 },
    next: { left: straightLeft + third * 2, right: straightRight, centerX: straightRight - third / 2 },
    centerY: (trap.top + trap.bottom) / 2,
    top: trap.top,
    bottom: trap.bottom,
    straightLeft,
    straightRight,
  };
}

// --- Hit testing ---

/**
 * Hit test the playback bar at canvas pixel coordinates.
 * Returns which button was hit, or null if outside the bar.
 */
export function hitTestPlaybackBar(
  x: number,
  y: number,
  cellSize: number,
  playMode: 'playing' | 'paused' = 'paused',
): PlaybackBarHit | null {
  const trap = getTrapezoidPoints(cellSize);

  // Quick bounds check
  if (y < trap.top || y > trap.bottom || x < trap.left || x > trap.right) {
    return null;
  }

  // Check if point is inside the trapezoid using the sloped sides
  // At height y, the left edge is interpolated: wider at top, narrower at bottom
  const t = (y - trap.top) / (trap.bottom - trap.top); // 0 at top (wider), 1 at bottom (narrower)
  const leftEdge = trap.left + t * trap.inset;
  const rightEdge = trap.right - t * trap.inset;

  if (x < leftEdge || x > rightEdge) {
    return null;
  }

  // When playing, only play-pause is available (prev/next hidden)
  if (playMode === 'playing') {
    return { button: 'play-pause' };
  }

  // When paused, buttons occupy the straight (top-edge) section only
  const straightLeft = trap.topLeft.x;
  const straightRight = trap.topRight.x;
  const straightWidth = straightRight - straightLeft;
  const third = straightWidth / 3;

  // Sloped wing areas outside the straight section → play-pause
  if (x < straightLeft || x > straightRight) {
    return { button: 'play-pause' };
  }

  if (x < straightLeft + third) return { button: 'prev' };
  if (x < straightLeft + third * 2) return { button: 'play-pause' };
  return { button: 'next' };
}

// --- Occupancy blocking ---

/**
 * Check if a node placement rectangle overlaps the playback bar grid region.
 * Uses AABB rectangle intersection with the bar's grid constants.
 */
export function isOverlappingPlaybackBar(
  col: number,
  row: number,
  cols: number,
  rows: number,
): boolean {
  const nodeRight = col + cols - 1;
  const nodeBottom = row + rows - 1;

  return (
    col <= PLAYBACK_BAR.COL_END &&
    nodeRight >= PLAYBACK_BAR.COL_START &&
    row <= PLAYBACK_BAR.ROW_END &&
    nodeBottom >= PLAYBACK_BAR.ROW_START
  );
}

// --- Drawing ---

/** Draw the trapezoid path on the context (does not fill/stroke). */
function traceTrapezoid(ctx: CanvasRenderingContext2D, cellSize: number): void {
  const trap = getTrapezoidPoints(cellSize);

  ctx.beginPath();
  ctx.moveTo(trap.topLeft.x, trap.topLeft.y);
  ctx.lineTo(trap.topRight.x, trap.topRight.y);
  ctx.lineTo(trap.bottomRight.x, trap.bottomRight.y);
  ctx.lineTo(trap.bottomLeft.x, trap.bottomLeft.y);
  ctx.closePath();
}

/** Draw a play triangle (right-pointing) */
function drawPlayIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.6, cy - half);
  ctx.lineTo(cx + half, cy);
  ctx.lineTo(cx - half * 0.6, cy + half);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw two vertical pause bars */
function drawPauseIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  const barW = size * 0.25;
  const gap = size * 0.15;
  ctx.fillStyle = color;
  ctx.fillRect(cx - gap - barW, cy - half, barW, size);
  ctx.fillRect(cx + gap, cy - half, barW, size);
}

/** Draw prev icon: vertical bar + left triangle */
function drawPrevIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  const barW = size * 0.15;
  // Bar on the left
  ctx.fillStyle = color;
  ctx.fillRect(cx - half * 0.8, cy - half, barW, size);
  // Triangle pointing left (to the right of the bar)
  ctx.beginPath();
  ctx.moveTo(cx + half * 0.8, cy - half * 0.85);
  ctx.lineTo(cx - half * 0.4, cy);
  ctx.lineTo(cx + half * 0.8, cy + half * 0.85);
  ctx.closePath();
  ctx.fill();
}

/** Draw next icon: right triangle + vertical bar */
function drawNextIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  const barW = size * 0.15;
  // Triangle pointing right
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.8, cy - half * 0.85);
  ctx.lineTo(cx + half * 0.4, cy);
  ctx.lineTo(cx - half * 0.8, cy + half * 0.85);
  ctx.closePath();
  ctx.fill();
  // Bar on the right
  ctx.fillRect(cx + half * 0.8 - barW, cy - half, barW, size);
}

/**
 * Draw the playback button bar.
 * Should be called after placement ghost, before lid animation overlay.
 */
export function drawPlaybackBar(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: PlaybackBarRenderState,
  cellSize: number,
): void {
  ctx.save();

  // Draw trapezoid background
  traceTrapezoid(ctx, cellSize);
  ctx.fillStyle = tokens.surfaceNode;
  ctx.fill();

  // Subtle top border
  traceTrapezoid(ctx, cellSize);
  ctx.strokeStyle = tokens.depthRaised;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Button regions and icon rendering
  const regions = getButtonRegions(cellSize);
  const iconSize = cellSize * 0.8;
  const buttons: PlaybackButton[] = ['prev', 'play-pause', 'next'];

  const isPaused = state.playMode === 'paused';
  // When playing, only show play-pause; when paused, show all three buttons
  const visibleButtons: PlaybackButton[] = isPaused ? buttons : ['play-pause'];

  for (const btn of visibleButtons) {
    const region = regions[btn];
    const isHovered = state.hoveredButton === btn;

    // Hover highlight (uses straight-section button bounds)
    if (isHovered) {
      ctx.save();
      traceTrapezoid(ctx, cellSize);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(region.left, regions.top, region.right - region.left, regions.bottom - regions.top);
      ctx.restore();
    }

    const color = isHovered ? tokens.textPrimary : tokens.textSecondary;

    if (btn === 'prev') {
      drawPrevIcon(ctx, region.centerX, regions.centerY, iconSize, color);
    } else if (btn === 'next') {
      drawNextIcon(ctx, region.centerX, regions.centerY, iconSize, color);
    } else {
      // play-pause: show play or pause based on state
      if (state.playMode === 'playing') {
        drawPauseIcon(ctx, region.centerX, regions.centerY, iconSize, color);
      } else {
        drawPlayIcon(ctx, region.centerX, regions.centerY, iconSize, color);
      }
    }
  }

  ctx.restore();
}
