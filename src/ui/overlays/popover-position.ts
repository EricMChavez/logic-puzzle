export interface PopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type PopoverSide = 'right' | 'left' | 'below' | 'above';

export interface PopoverPosition {
  left: number;
  top: number;
  side: PopoverSide;
}

const GAP = 8;

/**
 * Compute the position for a popover anchored to a rectangle.
 * Preferred side: right. Falls back: left, below, above.
 */
export function computePopoverPosition(
  anchor: PopoverAnchor,
  popoverSize: PopoverSize,
  viewport: Viewport,
  canvasOffset: { x: number; y: number } = { x: 0, y: 0 },
): PopoverPosition {
  const ax = anchor.x + canvasOffset.x;
  const ay = anchor.y + canvasOffset.y;

  // Try right
  const rightLeft = ax + anchor.width + GAP;
  const rightTop = ay + anchor.height / 2 - popoverSize.height / 2;
  if (rightLeft + popoverSize.width <= viewport.width && rightTop >= 0 && rightTop + popoverSize.height <= viewport.height) {
    return { left: rightLeft, top: rightTop, side: 'right' };
  }

  // Try left
  const leftLeft = ax - popoverSize.width - GAP;
  const leftTop = ay + anchor.height / 2 - popoverSize.height / 2;
  if (leftLeft >= 0 && leftTop >= 0 && leftTop + popoverSize.height <= viewport.height) {
    return { left: leftLeft, top: leftTop, side: 'left' };
  }

  // Try below
  const belowLeft = ax + anchor.width / 2 - popoverSize.width / 2;
  const belowTop = ay + anchor.height + GAP;
  if (belowTop + popoverSize.height <= viewport.height && belowLeft >= 0 && belowLeft + popoverSize.width <= viewport.width) {
    return { left: belowLeft, top: belowTop, side: 'below' };
  }

  // Try above
  const aboveLeft = ax + anchor.width / 2 - popoverSize.width / 2;
  const aboveTop = ay - popoverSize.height - GAP;
  if (aboveTop >= 0 && aboveLeft >= 0 && aboveLeft + popoverSize.width <= viewport.width) {
    return { left: aboveLeft, top: aboveTop, side: 'above' };
  }

  // Fallback: clamp right side
  return {
    left: Math.max(0, Math.min(rightLeft, viewport.width - popoverSize.width)),
    top: Math.max(0, Math.min(rightTop, viewport.height - popoverSize.height)),
    side: 'right',
  };
}
