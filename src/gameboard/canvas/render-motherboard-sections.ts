import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { MotherboardSection } from '../../store/motherboard-types.ts';
import type { PaginationState } from '../../store/motherboard-types.ts';
import { drawHighlightStreakRounded, getLightDirection } from './render-highlight-streak.ts';
import { HIGHLIGHT_STREAK, DEPTH } from '../../shared/constants/index.ts';
import { drawNoiseGrain } from './render-noise-grain.ts';
import { CARD_BODY_FONT } from '../../shared/fonts/font-ready.ts';

// ---------------------------------------------------------------------------
// Section container rendering
// ---------------------------------------------------------------------------

/** Section container corner radius in cells. */
const SECTION_CORNER_RADIUS_CELLS = 0.5;

/** Dot matrix parameters (matching gameboard grid style). */
const DOT_OPACITY = 0.3;

/**
 * Draw all motherboard section containers styled like gameboard surfaces.
 * Each section gets: green fill, inset shadow, dot matrix, noise grain,
 * highlight streak — matching the look of the regular gameboard background.
 *
 * Called in the render loop instead of drawGrid() on the motherboard.
 */
export function drawMotherboardSections(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  sections: readonly MotherboardSection[],
  cellSize: number,
): void {
  for (const section of sections) {
    const { col, row, cols, rows } = section.gridBounds;
    const x = col * cellSize;
    const y = row * cellSize;
    const w = cols * cellSize;
    const h = rows * cellSize;
    const r = SECTION_CORNER_RADIUS_CELLS * cellSize;
    const rect = { x, y, width: w, height: h };

    // 1. Green gameboard fill
    ctx.fillStyle = tokens.gridArea;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();

    // 2. Inset shadow (gameboard-matched depth)
    drawSectionInsetShadow(ctx, rect, r);

    // 3. Dot matrix at grid intersections (clipped to rounded rect)
    drawSectionDots(ctx, tokens, section.gridBounds, cellSize, r);

    // 4. Noise grain (surface texture)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    drawNoiseGrain(ctx, rect, 0.045, 2);
    ctx.restore();

    // 5. Highlight streak (diagonal light band)
    drawHighlightStreakRounded(
      ctx, rect, r,
      HIGHLIGHT_STREAK.HARD_OPACITY,
      HIGHLIGHT_STREAK.SOFT_OPACITY,
      HIGHLIGHT_STREAK.VERTICAL_FADE_RATIO,
    );
  }
}

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

/** Height of the pagination area in cells (at bottom of puzzle section). */
const PAGINATION_HEIGHT_CELLS = 2;

/**
 * Draw pagination controls at the bottom of the puzzle section.
 * Shows left/right arrows and a page indicator.
 */
export function drawPaginationControls(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  puzzleSection: MotherboardSection,
  pagination: PaginationState,
  cellSize: number,
): void {
  if (pagination.totalPages <= 1) return;

  const { col, row, cols, rows } = puzzleSection.gridBounds;
  const sectionBottom = (row + rows) * cellSize;
  const centerX = (col + cols / 2) * cellSize;
  const controlY = sectionBottom - PAGINATION_HEIGHT_CELLS * cellSize;

  const arrowSize = cellSize * 0.6;
  const spacing = cellSize * 3;

  // Page indicator text
  const label = `${pagination.currentPage + 1} / ${pagination.totalPages}`;
  const fontSize = Math.round(cellSize * 0.55);
  ctx.fillStyle = tokens.textSecondary;
  ctx.font = `${fontSize}px ${CARD_BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, centerX, controlY + cellSize);

  // Left arrow
  const canGoLeft = pagination.currentPage > 0;
  drawArrow(ctx, centerX - spacing, controlY + cellSize, arrowSize, 'left',
    canGoLeft ? tokens.textPrimary : tokens.textSecondary, canGoLeft ? 0.8 : 0.3);

  // Right arrow
  const canGoRight = pagination.currentPage < pagination.totalPages - 1;
  drawArrow(ctx, centerX + spacing, controlY + cellSize, arrowSize, 'right',
    canGoRight ? tokens.textPrimary : tokens.textSecondary, canGoRight ? 0.8 : 0.3);
}

/**
 * Hit-test pagination arrows. Returns 'prev' | 'next' | null.
 */
export function hitTestPagination(
  x: number, y: number,
  puzzleSection: MotherboardSection,
  pagination: PaginationState,
  cellSize: number,
): 'prev' | 'next' | null {
  if (pagination.totalPages <= 1) return null;

  const { col, row, cols, rows } = puzzleSection.gridBounds;
  const sectionBottom = (row + rows) * cellSize;
  const centerX = (col + cols / 2) * cellSize;
  const controlY = sectionBottom - PAGINATION_HEIGHT_CELLS * cellSize;

  const spacing = cellSize * 3;
  const hitRadius = cellSize * 1.2;

  const leftCx = centerX - spacing;
  const rightCx = centerX + spacing;
  const cy = controlY + cellSize;

  if (Math.abs(x - leftCx) < hitRadius && Math.abs(y - cy) < hitRadius) {
    return pagination.currentPage > 0 ? 'prev' : null;
  }
  if (Math.abs(x - rightCx) < hitRadius && Math.abs(y - cy) < hitRadius) {
    return pagination.currentPage < pagination.totalPages - 1 ? 'next' : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  size: number,
  direction: 'left' | 'right',
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (direction === 'left') {
    ctx.moveTo(cx + size / 2, cy - size / 2);
    ctx.lineTo(cx - size / 2, cy);
    ctx.lineTo(cx + size / 2, cy + size / 2);
  } else {
    ctx.moveTo(cx - size / 2, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy);
    ctx.lineTo(cx - size / 2, cy + size / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw dot matrix at grid intersections inside a section, clipped to rounded corners.
 * Matches the gameboard dot style from render-grid.ts.
 */
function drawSectionDots(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  bounds: { col: number; row: number; cols: number; rows: number },
  cellSize: number,
  cornerRadius: number,
): void {
  const x = bounds.col * cellSize;
  const y = bounds.row * cellSize;
  const w = bounds.cols * cellSize;
  const h = bounds.rows * cellSize;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, cornerRadius);
  ctx.clip();

  ctx.fillStyle = tokens.gridLine;
  ctx.globalAlpha = DOT_OPACITY;
  const dotRadius = Math.max(1, cellSize * 0.06);

  ctx.beginPath();
  // Draw dots at interior grid intersections within the section
  for (let c = bounds.col + 1; c < bounds.col + bounds.cols; c++) {
    const dx = c * cellSize;
    for (let r = bounds.row + 1; r < bounds.row + bounds.rows; r++) {
      const dy = r * cellSize;
      ctx.moveTo(dx + dotRadius, dy);
      ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Puzzle indicator lights
// ---------------------------------------------------------------------------

export interface PuzzleIndicatorLight {
  gridRow: number;
  state: 'locked' | 'unlocked' | 'completed';
}

/**
 * Draw LED indicator lights to the right of the puzzle section.
 * Each light is vertically centered with its corresponding puzzle chip.
 *
 * - locked: dark gray, no glow
 * - unlocked: pulsing red
 * - completed: steady green glow
 */
export function drawPuzzleIndicatorLights(
  ctx: CanvasRenderingContext2D,
  _tokens: ThemeTokens,
  lights: readonly PuzzleIndicatorLight[],
  puzzleSectionRightCol: number,
  cellSize: number,
): void {
  const cx = (puzzleSectionRightCol + 1.5) * cellSize;
  const radius = 0.35 * cellSize;
  const now = Date.now();

  for (const light of lights) {
    const cy = light.gridRow * cellSize;

    // --- Housing bezel (dark ring) ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + cellSize * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a16';
    ctx.fill();

    // Inset shadow on housing
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = cellSize * 0.15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = cellSize * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2a22';
    ctx.fill();
    ctx.restore();

    // --- Glow pass ---
    if (light.state === 'unlocked') {
      // Pulsing red glow: sin wave over 1200ms period
      const pulse = 0.5 + 0.5 * Math.sin((now / 1200) * Math.PI * 2);
      const glowAlpha = 0.3 + 0.5 * pulse;
      ctx.save();
      ctx.shadowColor = `rgba(224, 56, 56, ${glowAlpha})`;
      ctx.shadowBlur = cellSize * (0.3 + 0.4 * pulse);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224, 56, 56, 0)'; // transparent fill, shadow provides glow
      ctx.fill();
      ctx.restore();
    } else if (light.state === 'completed') {
      // Steady green glow
      ctx.save();
      ctx.shadowColor = 'rgba(80, 200, 120, 0.6)';
      ctx.shadowBlur = cellSize * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(80, 200, 120, 0)';
      ctx.fill();
      ctx.restore();
    }

    // --- LED fill ---
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (light.state === 'locked') {
      ctx.fillStyle = '#4a4a3a';
    } else if (light.state === 'unlocked') {
      const pulse = 0.5 + 0.5 * Math.sin((now / 1200) * Math.PI * 2);
      const brightness = 0.55 + 0.45 * pulse;
      const r = Math.round(224 * brightness);
      const g = Math.round(56 * brightness);
      const b = Math.round(56 * brightness);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
    } else {
      ctx.fillStyle = '#50c878';
    }
    ctx.fill();

    // --- Border ring ---
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, cellSize * 0.06);
    ctx.stroke();

    // --- Specular highlight (small bright spot, upper-left) ---
    const hlX = cx - radius * 0.3;
    const hlY = cy - radius * 0.3;
    const hlRadius = radius * 0.35;
    const grad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlRadius);
    if (light.state === 'locked') {
      grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    } else if (light.state === 'unlocked') {
      grad.addColorStop(0, 'rgba(255,200,200,0.4)');
    } else {
      grad.addColorStop(0, 'rgba(200,255,220,0.45)');
    }
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(hlX, hlY, hlRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inset shadow using gameboard-matched DEPTH constants.
 * Two passes: dark (lower-right) + light catch (upper-left).
 */
function drawSectionInsetShadow(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  cornerRadius: number,
): void {
  const light = getLightDirection();
  const darkBlur = DEPTH.INSET.DARK_BLUR;
  const darkOffset = DEPTH.INSET.DARK_OFFSET;
  const lightBlur = DEPTH.INSET.LIGHT_BLUR;
  const lightOffset = DEPTH.INSET.LIGHT_OFFSET;
  const margin = Math.max(darkBlur, lightBlur) + Math.max(darkOffset, lightOffset) + 20;

  // Dark pass
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.clip();

  ctx.shadowColor = DEPTH.INSET.DARK_COLOR;
  ctx.shadowBlur = darkBlur;
  ctx.shadowOffsetX = -light.x * darkOffset;
  ctx.shadowOffsetY = -light.y * darkOffset;
  ctx.fillStyle = 'rgba(0,0,0,1)';

  ctx.beginPath();
  ctx.rect(rect.x - margin, rect.y - margin, rect.width + margin * 2, rect.height + margin * 2);
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.fill('evenodd');
  ctx.restore();

  // Light pass
  const warmTint = HIGHLIGHT_STREAK.WARM_TINT;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.clip();

  ctx.shadowColor = `rgba(${warmTint.r},${warmTint.g},${warmTint.b},${DEPTH.INSET.LIGHT_OPACITY})`;
  ctx.shadowBlur = lightBlur;
  ctx.shadowOffsetX = light.x * lightOffset;
  ctx.shadowOffsetY = light.y * lightOffset;
  ctx.fillStyle = 'rgba(0,0,0,1)';

  ctx.beginPath();
  ctx.rect(rect.x - margin, rect.y - margin, rect.width + margin * 2, rect.height + margin * 2);
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.fill('evenodd');
  ctx.restore();
}
