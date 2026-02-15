/**
 * Module-level singleton for canvas snapshot capture.
 * Matches the keyboard-focus.ts pattern: register a capture function from the
 * component that owns the canvas, call it from anywhere.
 */

let _capture: (() => OffscreenCanvas | null) | null = null;

/** Register the snapshot capture function. Called from GameboardCanvas effect setup. */
export function registerSnapshotCapture(fn: () => OffscreenCanvas | null): void {
  _capture = fn;
}

/** Unregister the snapshot capture function. Called on cleanup. */
export function unregisterSnapshotCapture(): void {
  _capture = null;
}

/** Capture a snapshot of the current grid area. Returns null if not registered or capture fails. */
export function captureGridSnapshot(): OffscreenCanvas | null {
  return _capture ? _capture() : null;
}

// ── Viewport capture (full canvas including margins) ──

let _viewportCapture: (() => OffscreenCanvas | null) | null = null;

/** Register the viewport capture function. Called from GameboardCanvas effect setup. */
export function registerViewportCapture(fn: () => OffscreenCanvas | null): void {
  _viewportCapture = fn;
}

/** Unregister the viewport capture function. Called on cleanup. */
export function unregisterViewportCapture(): void {
  _viewportCapture = null;
}

/** Capture a full-viewport snapshot (including margins/page bg). */
export function captureViewportSnapshot(): OffscreenCanvas | null {
  return _viewportCapture ? _viewportCapture() : null;
}

// ── Crop capture (high-res single-node render for zoom portal) ──

import type { GridRect } from '../../shared/grid/types.ts';

let _cropCapture: ((chipId: string, targetRect: GridRect) => OffscreenCanvas | null) | null = null;

/** Register the crop capture function. Called from render-loop setup. */
export function registerCropCapture(fn: (chipId: string, targetRect: GridRect) => OffscreenCanvas | null): void {
  _cropCapture = fn;
}

/** Unregister the crop capture function. Called on cleanup. */
export function unregisterCropCapture(): void {
  _cropCapture = null;
}

/** Capture a high-res render of a single node for zoom portal curtain. */
export function captureCropSnapshot(chipId: string, targetRect: GridRect): OffscreenCanvas | null {
  return _cropCapture ? _cropCapture(chipId, targetRect) : null;
}
