/**
 * Rotation utilities for node port positioning.
 *
 * When a node is rotated, its ports move to different sides:
 * - 0°:   inputs=left, outputs=right (default)
 * - 90°:  inputs=top, outputs=bottom
 * - 180°: inputs=right, outputs=left
 * - 270°: inputs=bottom, outputs=top
 */

import type { NodeRotation } from '../types/index.ts';

/** Physical side of a node where ports can appear */
export type PortSide = 'left' | 'right' | 'top' | 'bottom';

/** Direction a wire approaches a port from */
export type WireDirection = 'east' | 'west' | 'north' | 'south';

/**
 * Get the physical side where ports appear after rotation.
 *
 * @param logicalSide - 'input' or 'output' (logical role)
 * @param rotation - Node rotation in degrees (0, 90, 180, 270)
 * @returns Physical side of the node where these ports are located
 */
export function getRotatedPortSide(
  logicalSide: 'input' | 'output',
  rotation: NodeRotation,
): PortSide {
  // Base sides: input=left, output=right
  // Rotation cycles: left -> top -> right -> bottom -> left
  const sides: PortSide[] = ['left', 'top', 'right', 'bottom'];
  const baseIndex = logicalSide === 'input' ? 0 : 2;
  const rotationSteps = rotation / 90;
  return sides[(baseIndex + rotationSteps) % 4];
}

/**
 * Get the rotated dimensions of a node.
 * For 90° and 270° rotations, width and height are swapped.
 *
 * @param cols - Original column span
 * @param rows - Original row span
 * @param rotation - Node rotation in degrees
 * @returns Rotated dimensions
 */
export function getRotatedSize(
  cols: number,
  rows: number,
  rotation: NodeRotation,
): { cols: number; rows: number } {
  if (rotation === 90 || rotation === 270) {
    return { cols: rows, rows: cols };
  }
  return { cols, rows };
}

/**
 * Get the direction a wire should approach a port from.
 *
 * @param side - Physical side of the port
 * @returns Direction wires should approach from
 */
export function getPortApproachDirection(side: PortSide): WireDirection {
  switch (side) {
    case 'left':
      return 'west';
    case 'right':
      return 'east';
    case 'top':
      return 'north';
    case 'bottom':
      return 'south';
  }
}

/**
 * Get the opposite direction (for wire routing away from port).
 */
export function getOppositeDirection(dir: WireDirection): WireDirection {
  switch (dir) {
    case 'east':
      return 'west';
    case 'west':
      return 'east';
    case 'north':
      return 'south';
    case 'south':
      return 'north';
  }
}

/**
 * Compute the port position offset within a node based on rotation.
 * Returns the relative position from the node's top-left corner.
 *
 * IMPORTANT: Ports must be at INTEGER grid coordinates for wire routing.
 * Ports are distributed evenly across the node's span on the port-bearing side.
 *
 * @param nodeWidth - Node width in grid cells
 * @param nodeHeight - Node height in grid cells
 * @param portCount - Number of ports on this side
 * @param portIndex - Index of the port (0-based)
 * @param side - Physical side of the port
 * @returns Relative position { col, row } from node's top-left (always integers)
 */
export function getPortOffset(
  nodeWidth: number,
  nodeHeight: number,
  portCount: number,
  portIndex: number,
  side: PortSide,
): { col: number; row: number } {
  const count = Math.max(portCount, 1);

  // Distribute ports at integer positions
  // For n ports in span s: positions at 0, 1, 2, ..., n-1 (if n <= s)
  // Single port goes to center (rounded to integer)
  const getDistributedPosition = (span: number, index: number, total: number): number => {
    if (total === 1) {
      // Single port at center, rounded to integer
      return Math.floor(span / 2);
    }
    // Distribute ports evenly, but keep at integer positions
    // For n ports in span s: port i at floor(i * s / n)
    return Math.floor(index * span / total);
  };

  switch (side) {
    case 'left':
      // Ports distributed vertically along left edge
      return {
        col: 0,
        row: getDistributedPosition(nodeHeight, portIndex, count),
      };
    case 'right':
      // Ports distributed vertically along right edge
      return {
        col: nodeWidth,
        row: getDistributedPosition(nodeHeight, portIndex, count),
      };
    case 'top':
      // Ports distributed horizontally along top edge
      return {
        col: getDistributedPosition(nodeWidth, portIndex, count),
        row: 0,
      };
    case 'bottom':
      // Ports distributed horizontally along bottom edge
      return {
        col: getDistributedPosition(nodeWidth, portIndex, count),
        row: nodeHeight,
      };
  }
}
