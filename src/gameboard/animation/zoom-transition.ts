import type { GridRect, PixelRect } from '../../shared/grid/types.ts';

// ── Easing functions ──

/**
 * Ease-in-out cubic for smooth animation.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Spring easing with natural bounce.
 * Matches mockup: damping 0.7, angular freq 6.5pi.
 */
export function spring(t: number): number {
  const w = 6.5 * Math.PI;
  const d = 0.7;
  return 1 - Math.exp(-d * t * 10) * Math.cos(w * t);
}

// ── Duration / progress helpers (carried from lid-animation.ts) ──

/**
 * Parse animation duration from token string (e.g. "500ms" -> 500, "0ms" -> 0).
 * Returns milliseconds. Defaults to 500 if unparseable.
 */
export function parseDurationMs(token: string): number {
  const n = parseFloat(token);
  if (isNaN(n) || n < 0) return 500;
  return n;
}

/**
 * Compute animation progress from startTime, current timestamp, and duration.
 * Returns 0-1 clamped. If duration is 0 (reduced motion), returns 1 instantly.
 */
export function computeProgress(startTime: number, now: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const elapsed = now - startTime;
  return Math.min(Math.max(elapsed / durationMs, 0), 1);
}

// ── Zoom transition presets ──

export interface ZoomPreset {
  durationMs: number;
  zoomEasing: (t: number) => number;
  revealEasing: (t: number) => number;
  /** Zoom sub-animation starts at this fraction of total progress. */
  zoomStart: number;
  /** Zoom sub-animation ends at this fraction. */
  zoomEnd: number;
  /** Reveal sub-animation starts at this fraction. */
  revealStart: number;
  /** Reveal sub-animation ends at this fraction. */
  revealEnd: number;
}

export const ZOOM_IN_PRESET: ZoomPreset = {
  durationMs: 1200,
  zoomEasing: easeInOutCubic,
  revealEasing: spring,
  zoomStart: 0.2,
  zoomEnd: 1.0,
  revealStart: 0.0,
  revealEnd: 0.6,
};

export const ZOOM_OUT_PRESET: ZoomPreset = {
  durationMs: 1200,
  zoomEasing: easeInOutCubic,
  revealEasing: easeInOutCubic,
  zoomStart: 0.0,
  zoomEnd: 0.6,
  revealStart: 0.3,
  revealEnd: 1.0,
};

/** Zoom-only preset for second phase of two-part zoom-out. No reveal (portal disabled). */
export const ZOOM_ONLY_PRESET: ZoomPreset = {
  durationMs: 600,
  zoomEasing: easeInOutCubic,
  revealEasing: easeInOutCubic,
  zoomStart: 0.0,
  zoomEnd: 1.0,
  revealStart: 2.0,  // Never activates
  revealEnd: 2.0,
};

// ── Math helpers ──

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Core zoom transform ──

export interface ZoomTransformResult {
  /** Canvas scale factor. */
  scale: number;
  /** Canvas translate X. */
  tx: number;
  /** Canvas translate Y. */
  ty: number;
  /** Target rect in screen space after zoom. */
  stx: number;
  sty: number;
  stw: number;
  sth: number;
}

/**
 * Compute the zoom transform that makes the target rect fill the viewport.
 *
 * @param zoomT - Eased zoom progress 0..1 (0 = no zoom, 1 = fully zoomed to target)
 * @param targetRect - Target rect in viewport pixels (e.g. node bounding box)
 * @param vpW - Viewport width in CSS pixels
 * @param vpH - Viewport height in CSS pixels
 */
export function zoomTransform(
  zoomT: number,
  targetRect: PixelRect,
  vpW: number,
  vpH: number,
): ZoomTransformResult {
  const finalScale = Math.min(vpW / targetRect.width, vpH / targetRect.height);
  const scale = lerp(1, finalScale, zoomT);

  const trCx = targetRect.x + targetRect.width / 2;
  const trCy = targetRect.y + targetRect.height / 2;

  const tx = lerp(trCx, vpW / 2, zoomT) - trCx * scale;
  const ty = lerp(trCy, vpH / 2, zoomT) - trCy * scale;

  // Screen-space target rect
  const stx = targetRect.x * scale + tx;
  const sty = targetRect.y * scale + ty;
  const stw = targetRect.width * scale;
  const sth = targetRect.height * scale;

  return { scale, tx, ty, stx, sty, stw, sth };
}

// ── Animation progress splitter ──

/**
 * Split overall progress into independent zoom and reveal sub-progress values,
 * each with its own easing.
 */
export function animProgress(
  p: number,
  preset: ZoomPreset,
): { zoomT: number; revealT: number } {
  const rawZoom = p <= preset.zoomStart ? 0
    : p >= preset.zoomEnd ? 1
    : (p - preset.zoomStart) / (preset.zoomEnd - preset.zoomStart);

  const rawReveal = p <= preset.revealStart ? 0
    : p >= preset.revealEnd ? 1
    : (p - preset.revealStart) / (preset.revealEnd - preset.revealStart);

  return {
    zoomT: preset.zoomEasing(rawZoom),
    revealT: preset.revealEasing(rawReveal),
  };
}

// ── Portal drawing ──

/**
 * Draw the portal reveal effect: inner snapshot visible in the target rect,
 * with outer content sliding up as a curtain on top.
 */
function drawPortal(
  ctx: CanvasRenderingContext2D,
  outerSnapshot: OffscreenCanvas,
  innerSnapshot: OffscreenCanvas,
  z: ZoomTransformResult,
  revealT: number,
  vpW: number,
  vpH: number,
  zoomedCrop?: OffscreenCanvas,
): void {
  if (revealT <= 0) {
    // During zoom-only phase, draw the crop in the target rect to prevent pixelation
    if (zoomedCrop) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(z.stx, z.sty, z.stw, z.sth);
      ctx.clip();
      ctx.drawImage(zoomedCrop, 0, 0, zoomedCrop.width, zoomedCrop.height,
                    z.stx, z.sty, z.stw, z.sth);
      ctx.restore();
    }
    return;
  }

  const slideOff = z.sth * revealT;

  // 1. Inner snapshot revealed in the bottom portion of target rect
  ctx.save();
  ctx.beginPath();
  ctx.rect(z.stx, z.sty, z.stw, z.sth);
  ctx.clip();
  // Draw inner snapshot scaled to fill the target rect
  ctx.drawImage(innerSnapshot, 0, 0, innerSnapshot.width, innerSnapshot.height, z.stx, z.sty, z.stw, z.sth);
  ctx.restore();

  // 2. Outer content slides up ON TOP (extends above target rect)
  if (zoomedCrop) {
    // High-res pre-rendered crop — always sharp, just clip + position
    ctx.save();
    ctx.beginPath();
    ctx.rect(z.stx, z.sty - slideOff, z.stw, z.sth);
    ctx.clip();
    ctx.drawImage(zoomedCrop, 0, 0, zoomedCrop.width, zoomedCrop.height,
                  z.stx, z.sty - slideOff, z.stw, z.sth);
    ctx.restore();
  } else {
    // Fallback: zoom-transform the outer snapshot (may pixelate at high zoom)
    ctx.save();
    ctx.beginPath();
    ctx.rect(z.stx, z.sty - slideOff, z.stw, z.sth);
    ctx.clip();
    ctx.translate(z.tx, z.ty - slideOff);
    ctx.scale(z.scale, z.scale);
    ctx.drawImage(outerSnapshot, 0, 0, outerSnapshot.width, outerSnapshot.height, 0, 0, vpW, vpH);
    ctx.restore();
  }
}

// ── Main draw function ──

/**
 * Draw one frame of the portal-based zoom transition.
 *
 * @param ctx - Canvas 2D context (already DPR-scaled)
 * @param outerSnapshot - Parent board snapshot (OffscreenCanvas at DPR resolution)
 * @param innerSnapshot - Child board snapshot (OffscreenCanvas at DPR resolution)
 * @param targetRect - Target node rect in viewport pixels
 * @param direction - 'in' (parent->child) or 'out' (child->parent)
 * @param progress - Raw 0..1 time progress (NOT eased)
 * @param preset - Zoom preset with timing/easing config
 * @param vpW - Viewport width in CSS pixels
 * @param vpH - Viewport height in CSS pixels
 */
export function drawZoomTransition(
  ctx: CanvasRenderingContext2D,
  outerSnapshot: OffscreenCanvas,
  innerSnapshot: OffscreenCanvas,
  targetRect: PixelRect,
  direction: 'in' | 'out',
  progress: number,
  preset: ZoomPreset,
  vpW: number,
  vpH: number,
  zoomedCrop?: OffscreenCanvas,
): void {
  // Reverse direction: zoom-out plays the same animation backwards
  const p = direction === 'out' ? 1 - progress : progress;
  const { zoomT, revealT } = animProgress(p, preset);
  const z = zoomTransform(zoomT, targetRect, vpW, vpH);

  // Draw zoomed outer snapshot (parent layer)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, vpW, vpH);
  ctx.clip();
  ctx.translate(z.tx, z.ty);
  ctx.scale(z.scale, z.scale);
  ctx.drawImage(outerSnapshot, 0, 0, outerSnapshot.width, outerSnapshot.height, 0, 0, vpW, vpH);
  ctx.restore();

  // Portal: target rect slides up to reveal inner content
  drawPortal(ctx, outerSnapshot, innerSnapshot, z, revealT, vpW, vpH, zoomedCrop);
}

// ── Grid rect to viewport pixel rect conversion ──

/**
 * Convert a grid rect to a 16:9 viewport pixel rect centered on the node body.
 * Applies NODE_STYLE.BODY_OFFSET (0.5 cells up), then expands the rect to 16:9
 * so the portal doesn't squish the child board into a non-matching aspect ratio.
 */
export function gridRectToViewport(
  rect: GridRect,
  cellSize: number,
  offset: { x: number; y: number },
): PixelRect {
  // Node body center (with BODY_OFFSET applied)
  const cx = (rect.col + rect.cols / 2) * cellSize + offset.x;
  const cy = (rect.row - 0.5 + rect.rows / 2) * cellSize + offset.y;

  // Start from the node body height
  const bodyH = rect.rows * cellSize;

  // Expand to 16:9, always matching the node's height
  const TARGET_ASPECT = 16 / 9;
  const h = bodyH;
  const w = bodyH * TARGET_ASPECT;

  return {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
  };
}

// ── Reveal overlay (two-part zoom-out curtain) ──

/**
 * Draw the crop sliding down from above the viewport to cover it.
 * Used during 'revealing' and 'reveal-paused' states.
 *
 * @param revealT - 1 = crop fully above (invisible), 0 = crop covers viewport
 */
export function drawRevealOverlay(
  ctx: CanvasRenderingContext2D,
  crop: OffscreenCanvas,
  revealT: number,
  vpW: number,
  vpH: number,
): void {
  if (revealT >= 1) return;
  const slideOff = vpH * revealT;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, -slideOff, vpW, vpH);
  ctx.clip();
  ctx.drawImage(crop, 0, 0, crop.width, crop.height, 0, -slideOff, vpW, vpH);
  ctx.restore();
}
