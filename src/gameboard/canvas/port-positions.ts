import type { NodeState, Vec2 } from '../../shared/types/index.ts';
import { getNodeGridSize, PLAYABLE_START, METER_RIGHT_START, getRotatedPortSide, getPortOffset } from '../../shared/grid/index.ts';
import { METER_GRID_ROWS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS } from '../meters/meter-types.ts';

/**
 * Compute the pixel position of a port on a node.
 * Ports are centered within the node body with 0.5 cell inset from edges.
 * For vertical port sides (left/right), ports are at y = 0.5, 1.5, 2.5, etc.
 * For horizontal port sides (top/bottom), ports are at x = 0.5, 1.5, 2.5, etc.
 */
export function getNodePortPosition(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number,
  cellSize: number,
): Vec2 {
  const { cols, rows } = getNodeGridSize(node);
  const rotation = node.rotation ?? 0;
  const count = side === 'input' ? node.inputCount : node.outputCount;

  // Get the physical side based on rotation
  const physicalSide = getRotatedPortSide(side, rotation);

  // Get the port offset within the node's grid footprint
  const offset = getPortOffset(cols, rows, count, portIndex, physicalSide);

  // Calculate pixel position - ports are on grid lines (no body offset)
  const x = (node.position.col + offset.col) * cellSize;
  const y = (node.position.row + offset.row) * cellSize;

  return { x, y };
}

/**
 * Get the pixel rectangle for a node's body.
 *
 * The body spans from port-to-port on the port-bearing edges, and extends
 * 0.5 cells beyond the port span on the non-port edges:
 * - For unrotated nodes (ports left/right): body spans full width, extends 0.5 cells above/below ports
 * - For 90°/270° rotated nodes (ports top/bottom): body spans full height, extends 0.5 cells left/right of ports
 *
 * This creates the visual appearance where ports sit at the body edges on port-bearing sides,
 * and the body provides 0.5 cell padding on non-port sides.
 */
export function getNodeBodyPixelRect(
  node: NodeState,
  cellSize: number,
): { x: number; y: number; width: number; height: number } {
  const { cols, rows } = getNodeGridSize(node);
  const rotation = node.rotation ?? 0;
  const maxPortCount = Math.max(node.inputCount, node.outputCount, 1);

  // Determine if ports are on vertical sides (left/right) or horizontal sides (top/bottom)
  const portsOnVerticalSides = rotation === 0 || rotation === 180;

  if (portsOnVerticalSides) {
    // Ports on left/right edges - body extends 0.5 above/below port span
    // Calculate first and last port positions (same formula as getPortOffset)
    const firstPortRow = maxPortCount === 1
      ? Math.floor(rows / 2)
      : Math.floor(0 * rows / maxPortCount);
    const lastPortRow = maxPortCount === 1
      ? Math.floor(rows / 2)
      : Math.floor((maxPortCount - 1) * rows / maxPortCount);
    const portSpan = lastPortRow - firstPortRow + 1;

    // Body extends 0.5 above first port and 0.5 below last port
    const x = node.position.col * cellSize;
    const y = (node.position.row + firstPortRow - 0.5) * cellSize;
    const width = cols * cellSize;
    const height = portSpan * cellSize;

    return { x, y, width, height };
  } else {
    // Ports on top/bottom edges - body extends 0.5 left/right of port span
    // Calculate first and last port positions (same formula as getPortOffset)
    const firstPortCol = maxPortCount === 1
      ? Math.floor(cols / 2)
      : Math.floor(0 * cols / maxPortCount);
    const lastPortCol = maxPortCount === 1
      ? Math.floor(cols / 2)
      : Math.floor((maxPortCount - 1) * cols / maxPortCount);
    const portSpan = lastPortCol - firstPortCol + 1;

    // Body extends 0.5 left of first port and 0.5 right of last port
    const x = (node.position.col + firstPortCol - 0.5) * cellSize;
    const y = node.position.row * cellSize;
    const width = portSpan * cellSize;
    const height = rows * cellSize;

    return { x, y, width, height };
  }
}

/**
 * Get the pixel rectangle for a node's hit testing region.
 * Uses the full grid footprint for easier clicking, regardless of body visual size.
 */
export function getNodeHitRect(
  node: NodeState,
  cellSize: number,
): { x: number; y: number; width: number; height: number } {
  const { cols, rows } = getNodeGridSize(node);

  const x = node.position.col * cellSize;
  const y = node.position.row * cellSize;
  const width = cols * cellSize;
  const height = rows * cellSize;

  return { x, y, width, height };
}

/**
 * Compute the pixel position of a gameboard connection point.
 * Input CPs sit on the left gridline (col 3), outputs on the right (col 29).
 * Vertically centered within each meter slot, accounting for meter gaps.
 *
 * Meter layout: 0.5 row top margin, then 3 meters of 5 rows each with 1 row gaps.
 * Meter centers: rows 3, 9, 15 (0.5 + index * 6 + 2.5)
 */
export function getConnectionPointPosition(
  side: 'input' | 'output',
  index: number,
  cellSize: number,
): Vec2 {
  const x = side === 'input'
    ? PLAYABLE_START * cellSize
    : METER_RIGHT_START * cellSize;
  // Meter layout: no margin, meters fill full height (6 rows each, no gaps)
  const meterTopMargin = 0;
  const meterStride = METER_GRID_ROWS + METER_GAP_ROWS; // 12 + 0 = 12
  const verticalOffset = METER_VERTICAL_OFFSETS[index] ?? 0;
  const y = (meterTopMargin + index * meterStride + verticalOffset + METER_GRID_ROWS / 2) * cellSize;
  return { x, y };
}
