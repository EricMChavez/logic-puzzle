import type { NodeState, Vec2 } from '../../shared/types/index.ts';
import { getNodeGridSize, PLAYABLE_START, METER_RIGHT_START, getRotatedPortSide, getPortOffset, rotateExplicitSide } from '../../shared/grid/index.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';
import { METER_GRID_ROWS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS } from '../meters/meter-types.ts';
import type { PortSide } from '../../shared/grid/index.ts';

/**
 * Get the physical side for a specific port, accounting for per-port side overrides.
 * Falls back to the default rotation-based side if no override exists.
 * For utility nodes with cpLayout, ports are placed on the side of their originating CP.
 */
export function getPortPhysicalSide(
  node: NodeState,
  logicalSide: 'input' | 'output',
  portIndex: number,
): PortSide {
  // Utility nodes with cpLayout: port side derives from CP position
  if ((node.type.startsWith('utility:') || node.type === 'custom-blank') && node.params?.cpLayout) {
    const cpLayout = node.params.cpLayout as string[];
    let count = 0;
    for (let i = 0; i < cpLayout.length; i++) {
      if (cpLayout[i] === logicalSide) {
        if (count === portIndex) return i < 3 ? 'left' : 'right';
        count++;
      }
    }
    // Fallback
    return logicalSide === 'input' ? 'left' : 'right';
  }

  const rotation = node.rotation ?? 0;
  const def = getNodeDefinition(node.type);
  if (def) {
    const ports = logicalSide === 'input' ? def.inputs : def.outputs;
    const portDef = ports[portIndex];
    if (portDef?.side) {
      return rotateExplicitSide(portDef.side, rotation);
    }
  }
  return getRotatedPortSide(logicalSide, rotation);
}

/**
 * Count how many ports on a given logical side land on a specific physical side.
 */
function countPortsOnPhysicalSide(
  node: NodeState,
  logicalSide: 'input' | 'output',
  physicalSide: PortSide,
): number {
  const count = logicalSide === 'input' ? node.inputCount : node.outputCount;
  let n = 0;
  for (let i = 0; i < count; i++) {
    if (getPortPhysicalSide(node, logicalSide, i) === physicalSide) n++;
  }
  return n;
}

/**
 * Get the index of a port among ports on the same physical side.
 */
function getPortIndexOnSide(
  node: NodeState,
  logicalSide: 'input' | 'output',
  portIndex: number,
  physicalSide: PortSide,
): number {
  let idx = 0;
  for (let i = 0; i < portIndex; i++) {
    if (getPortPhysicalSide(node, logicalSide, i) === physicalSide) idx++;
  }
  return idx;
}

/**
 * Compute the pixel position of a port on a node.
 * Supports per-port side overrides from node definitions.
 * Ports are distributed evenly across their physical side.
 * Utility nodes with cpLayout use fixed 3-slot positions per side.
 */
export function getNodePortPosition(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number,
  cellSize: number,
): Vec2 {
  // Utility nodes with cpLayout: fixed slot positions preserving CP layout
  if ((node.type.startsWith('utility:') || node.type === 'custom-blank') && node.params?.cpLayout) {
    return getUtilityPortPosition(node, side, portIndex, cellSize);
  }

  const { cols, rows } = getNodeGridSize(node);

  // Get the physical side for this specific port
  const physicalSide = getPortPhysicalSide(node, side, portIndex);

  // Count only ports on this same physical side (across both input and output)
  const sameInputs = countPortsOnPhysicalSide(node, 'input', physicalSide);
  const sameOutputs = countPortsOnPhysicalSide(node, 'output', physicalSide);
  const totalOnSide = sameInputs + sameOutputs;

  // Get this port's index within the ports on this side
  // Inputs come first, then outputs
  const indexOnSide = side === 'input'
    ? getPortIndexOnSide(node, 'input', portIndex, physicalSide)
    : sameInputs + getPortIndexOnSide(node, 'output', portIndex, physicalSide);

  // Get the port offset within the node's grid footprint
  const offset = getPortOffset(cols, rows, totalOnSide, indexOnSide, physicalSide);

  // Calculate pixel position - ports are on grid lines (no body offset)
  const x = (node.position.col + offset.col) * cellSize;
  const y = (node.position.row + offset.row) * cellSize;

  return { x, y };
}

/**
 * Get port position for utility nodes using cpLayout.
 * Ports appear at fixed slot positions (3 slots per side),
 * preserving gaps where CPs are 'off'.
 */
function getUtilityPortPosition(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number,
  cellSize: number,
): Vec2 {
  const cpLayout = node.params!.cpLayout as string[];
  const { cols, rows } = getNodeGridSize(node);

  // Find the CP index for this port
  let count = 0;
  for (let i = 0; i < cpLayout.length; i++) {
    if (cpLayout[i] === side) {
      if (count === portIndex) {
        const isLeft = i < 3;
        const slotOnSide = i < 3 ? i : i - 3; // 0, 1, or 2 within the side
        const x = isLeft
          ? node.position.col * cellSize
          : (node.position.col + cols) * cellSize;
        // Distribute 3 slots evenly across the height (same as standard 3-port distribution)
        const y = (node.position.row + (slotOnSide + 0.5) * rows / 3) * cellSize;
        return { x, y };
      }
      count++;
    }
  }

  // Fallback (shouldn't reach here)
  return {
    x: node.position.col * cellSize,
    y: node.position.row * cellSize,
  };
}

/**
 * Check if a node has any ports with explicit side overrides in its definition,
 * or is a utility node with cpLayout (ports can be on both sides).
 */
function hasMultiSidePorts(node: NodeState): boolean {
  // Utility nodes with cpLayout can have ports on both sides
  if ((node.type.startsWith('utility:') || node.type === 'custom-blank') && node.params?.cpLayout) {
    return true;
  }
  const def = getNodeDefinition(node.type);
  if (!def) return false;
  return def.inputs.some(p => p.side !== undefined) || def.outputs.some(p => p.side !== undefined);
}

/**
 * Get the set of physical sides that have ports on them.
 */
function getPortBearingSides(node: NodeState): Set<PortSide> {
  const sides = new Set<PortSide>();
  for (let i = 0; i < node.inputCount; i++) {
    sides.add(getPortPhysicalSide(node, 'input', i));
  }
  for (let i = 0; i < node.outputCount; i++) {
    sides.add(getPortPhysicalSide(node, 'output', i));
  }
  return sides;
}

/**
 * Get the pixel rectangle for a node's body.
 *
 * For standard 2-side nodes: body spans port-to-port on port edges, 0.5 cell padding on non-port edges.
 * For multi-side nodes (like Mixer with ports on left/right/bottom): body fills the grid footprint
 * with 0.5 cell padding on sides that have no ports.
 */
export function getNodeBodyPixelRect(
  node: NodeState,
  cellSize: number,
): { x: number; y: number; width: number; height: number } {
  const { cols, rows } = getNodeGridSize(node);

  // custom-blank with no ports: full grid footprint, no padding
  if (node.type === 'custom-blank' && node.inputCount === 0 && node.outputCount === 0) {
    const x = node.position.col * cellSize;
    const y = node.position.row * cellSize;
    return { x, y, width: cols * cellSize, height: rows * cellSize };
  }

  // Multi-side port nodes: body extends to grid edge on port-bearing sides,
  // and 0.5 cells OUTWARD on non-port sides (to wrap around adjacent ports).
  // This matches standard node behavior where the body extends 0.5 beyond
  // the grid footprint perpendicular to port-bearing edges.
  if (hasMultiSidePorts(node)) {
    const portSides = getPortBearingSides(node);
    const pad = 0.5;
    const leftPad = portSides.has('left') ? 0 : pad;
    const rightPad = portSides.has('right') ? 0 : pad;
    const topPad = portSides.has('top') ? 0 : -pad;
    const bottomPad = portSides.has('bottom') ? 0 : -pad;

    const x = (node.position.col + leftPad) * cellSize;
    const y = (node.position.row + topPad) * cellSize;
    const width = (cols - leftPad - rightPad) * cellSize;
    const height = (rows - topPad - bottomPad) * cellSize;

    return { x, y, width, height };
  }

  const rotation = node.rotation ?? 0;
  const maxPortCount = Math.max(node.inputCount, node.outputCount, 1);

  // Determine if ports are on vertical sides (left/right) or horizontal sides (top/bottom)
  const portsOnVerticalSides = rotation === 0 || rotation === 180;

  if (portsOnVerticalSides) {
    // Ports on left/right edges - body extends 0.5 above/below port span
    const firstPortRow = maxPortCount === 1
      ? Math.floor(rows / 2)
      : Math.floor(0 * rows / maxPortCount);
    const lastPortRow = maxPortCount === 1
      ? Math.floor(rows / 2)
      : Math.floor((maxPortCount - 1) * rows / maxPortCount);
    const portSpan = lastPortRow - firstPortRow + 1;

    const x = node.position.col * cellSize;
    const y = (node.position.row + firstPortRow - 0.5) * cellSize;
    const width = cols * cellSize;
    const height = portSpan * cellSize;

    return { x, y, width, height };
  } else {
    // Ports on top/bottom edges - body extends 0.5 left/right of port span
    const firstPortCol = maxPortCount === 1
      ? Math.floor(cols / 2)
      : Math.floor(0 * cols / maxPortCount);
    const lastPortCol = maxPortCount === 1
      ? Math.floor(cols / 2)
      : Math.floor((maxPortCount - 1) * cols / maxPortCount);
    const portSpan = lastPortCol - firstPortCol + 1;

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
 * Left CPs sit on the left gridline (PLAYABLE_START), right on the right (METER_RIGHT_START).
 * Vertically centered within each meter slot, accounting for meter gaps.
 *
 * @param side - Physical side: 'left' or 'right'
 * @param index - Meter slot index (0-2) within that side
 */
export function getConnectionPointPosition(
  side: 'left' | 'right',
  index: number,
  cellSize: number,
): Vec2 {
  const x = side === 'left'
    ? PLAYABLE_START * cellSize
    : METER_RIGHT_START * cellSize;
  // Meter layout: no margin, meters fill full height (6 rows each, no gaps)
  const meterTopMargin = 0;
  const meterStride = METER_GRID_ROWS + METER_GAP_ROWS; // 12 + 0 = 12
  const verticalOffset = METER_VERTICAL_OFFSETS[index] ?? 0;
  const y = (meterTopMargin + index * meterStride + verticalOffset + METER_GRID_ROWS / 2) * cellSize;
  return { x, y };
}
