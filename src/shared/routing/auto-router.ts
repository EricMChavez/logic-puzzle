import type { GridPoint } from '../grid/types.ts';
import type { NodeState, NodeRotation } from '../types/index.ts';
import { GRID_COLS, GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from '../grid/constants.ts';
import { getNodeGridSize } from '../grid/occupancy.ts';
import {
  getRotatedPortSide,
  getPortOffset,
  rotateExplicitSide,
  type PortSide,
} from '../grid/rotation.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';
import {
  isConnectionPointNode,
  isConnectionInputNode,
  getConnectionPointIndex,
  isCreativeSlotNode,
  getCreativeSlotIndex,
} from '../../puzzle/connection-point-nodes.ts';
import { METER_GRID_ROWS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS } from '../../gameboard/meters/meter-types.ts';
import {
  DIR_DELTA,
  DIR_COUNT,
  DIR_E,
  DIR_S,
  DIR_W,
  DIR_N,
  getAllowedDirections,
  isPassable,
  stateKey,
  chebyshevDistance,
} from './grid-graph.ts';

/** Cost penalty per 45-degree direction change (encourages straighter paths) */
const TURN_PENALTY = 0.3;

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

/**
 * Convert a physical port side to the wire direction traveling AWAY from the port.
 * For output ports: direction wire travels when leaving the node.
 * For input ports: direction wire should be traveling when arriving.
 */
export function portSideToWireDirection(portSide: PortSide): number {
  switch (portSide) {
    case 'right':
      return DIR_E; // Wire exits/enters traveling East
    case 'bottom':
      return DIR_S; // Wire exits/enters traveling South
    case 'left':
      return DIR_W; // Wire exits/enters traveling West
    case 'top':
      return DIR_N; // Wire exits/enters traveling North
  }
}

/**
 * Get the direction a wire should travel at a port.
 * For output ports (wire source): direction wire exits (traveling away from node).
 * For input ports (wire target): direction wire is traveling when it arrives.
 *
 * Key insight: For INPUT ports, the wire travels INTO the port, so the direction
 * is opposite to the port's facing direction. A wire entering a LEFT-side port
 * is traveling EAST, not WEST.
 */
/**
 * Resolve the physical side for a specific port, accounting for per-port side overrides.
 */
function resolvePortSide(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number,
): PortSide {
  const rotation: NodeRotation = node.rotation ?? 0;
  const def = getNodeDefinition(node.type);
  if (def) {
    const ports = side === 'input' ? def.inputs : def.outputs;
    const portDef = ports[portIndex];
    if (portDef?.side) {
      return rotateExplicitSide(portDef.side, rotation);
    }
  }
  return getRotatedPortSide(side, rotation);
}

/**
 * Count ports on a specific physical side (across both inputs and outputs).
 */
function countPortsOnSide(
  node: NodeState,
  physicalSide: PortSide,
): { inputCount: number; outputCount: number } {
  let inputCount = 0;
  let outputCount = 0;
  for (let i = 0; i < node.inputCount; i++) {
    if (resolvePortSide(node, 'input', i) === physicalSide) inputCount++;
  }
  for (let i = 0; i < node.outputCount; i++) {
    if (resolvePortSide(node, 'output', i) === physicalSide) outputCount++;
  }
  return { inputCount, outputCount };
}

/**
 * Get a port's index among ports on the same physical side.
 */
function getPortIndexOnPhysicalSide(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number,
  physicalSide: PortSide,
): number {
  let idx = 0;
  for (let i = 0; i < portIndex; i++) {
    if (resolvePortSide(node, side, i) === physicalSide) idx++;
  }
  return idx;
}

export function getPortWireDirection(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number = 0,
): number {
  if (isConnectionPointNode(node.id)) {
    // Determine which physical side the CP is on
    let isLeftPhysical: boolean;
    if (isCreativeSlotNode(node.id)) {
      isLeftPhysical = getCreativeSlotIndex(node.id) < 3;
    } else if (node.params.physicalSide) {
      isLeftPhysical = node.params.physicalSide === 'left';
    } else {
      isLeftPhysical = isConnectionInputNode(node.id);
    }
    // Facing direction: left CPs face east, right CPs face west
    const facingDir = isLeftPhysical ? DIR_E : DIR_W;
    // Output port (source): wire exits in facing direction
    // Input port (target): wire enters from opposite direction
    return side === 'output' ? facingDir : (facingDir + 4) % 8;
  }

  const portSide = resolvePortSide(node, side, portIndex);
  const portFacingDir = portSideToWireDirection(portSide);

  if (side === 'output') {
    return portFacingDir;
  } else {
    return (portFacingDir + 4) % 8;
  }
}

// ---------------------------------------------------------------------------
// Port grid anchor computation
// ---------------------------------------------------------------------------

/**
 * Compute the grid cell where a wire starts or ends for a given port.
 * For regular nodes: one cell outside the node bounding box on the port side.
 * For connection point nodes: at the playable area boundary.
 *
 * With rotation support, ports can be on any side of the node:
 * - 0°:   inputs=left, outputs=right
 * - 90°:  inputs=top, outputs=bottom
 * - 180°: inputs=right, outputs=left
 * - 270°: inputs=bottom, outputs=top
 */
export function getPortGridAnchor(
  node: NodeState,
  side: 'input' | 'output',
  portIndex: number,
): GridPoint {
  if (isConnectionPointNode(node.id)) {
    return getConnectionPointAnchor(node);
  }

  const { cols, rows } = getNodeGridSize(node);

  // Get the physical side for this specific port (handles per-port overrides)
  const portSide = resolvePortSide(node, side, portIndex);

  // Count ports on this same physical side (across both inputs and outputs)
  const { inputCount: sameInputs, outputCount: sameOutputs } = countPortsOnSide(node, portSide);
  const totalOnSide = sameInputs + sameOutputs;

  // Get this port's index within ports on this side (inputs first, then outputs)
  const indexOnSide = side === 'input'
    ? getPortIndexOnPhysicalSide(node, 'input', portIndex, portSide)
    : sameInputs + getPortIndexOnPhysicalSide(node, 'output', portIndex, portSide);

  // Get the port's offset from node's top-left
  const offset = getPortOffset(cols, rows, totalOnSide, indexOnSide, portSide);

  // Compute anchor one cell outside the node on the port's side
  const nodeCol = node.position.col;
  const nodeRow = node.position.row;

  switch (portSide) {
    case 'left':
      return { col: nodeCol - 1, row: nodeRow + offset.row };
    case 'right':
      return { col: nodeCol + cols, row: nodeRow + offset.row };
    case 'top':
      return { col: nodeCol + offset.col, row: nodeRow - 1 };
    case 'bottom':
      return { col: nodeCol + offset.col, row: nodeRow + rows };
  }
}

/**
 * Compute the grid anchor for a connection point virtual node.
 * Input CPs (emitters) anchor at PLAYABLE_START.
 * Output CPs (receivers) anchor at PLAYABLE_END.
 *
 * Positions must match the meter layout for visual alignment:
 * - No margin, meters fill full height (6 rows each, no gaps)
 * - CP row = floor(index * stride + METER_GRID_ROWS / 2)
 */
function getConnectionPointAnchor(node: NodeState): GridPoint {
  let isLeftSide: boolean;
  let index: number;

  if (isCreativeSlotNode(node.id)) {
    // Creative slots: 0-2 are left (input side), 3-5 are right (output side)
    const slotIndex = getCreativeSlotIndex(node.id);
    isLeftSide = slotIndex < 3;
    index = isLeftSide ? slotIndex : slotIndex - 3;
  } else if (node.params.physicalSide) {
    // Custom puzzle: use explicit physical side and meter index
    isLeftSide = node.params.physicalSide === 'left';
    index = node.params.meterIndex as number;
  } else {
    // Standard puzzle: input→left, output→right
    isLeftSide = isConnectionInputNode(node.id);
    index = getConnectionPointIndex(node.id);
  }

  // Match meter layout: no margin, meters fill full height
  const meterTopMargin = 0;
  const meterStride = METER_GRID_ROWS + METER_GAP_ROWS; // 12 + 0 = 12
  const verticalOffset = METER_VERTICAL_OFFSETS[index] ?? 0;
  const row = Math.floor(meterTopMargin + index * meterStride + verticalOffset + METER_GRID_ROWS / 2);

  // Left CPs anchor at PLAYABLE_START, right CPs at PLAYABLE_END + 1
  const col = isLeftSide ? PLAYABLE_START : PLAYABLE_END + 1;
  return { col, row };
}

// ---------------------------------------------------------------------------
// Binary min-heap priority queue
// ---------------------------------------------------------------------------

interface PQEntry {
  f: number;
  g: number;
  col: number;
  row: number;
  dir: number;
}

function pqPush(heap: PQEntry[], entry: PQEntry): void {
  heap.push(entry);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].f <= heap[i].f) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function pqPop(heap: PQEntry[]): PQEntry | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      let s = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < heap.length && heap[l].f < heap[s].f) s = l;
      if (r < heap.length && heap[r].f < heap[s].f) s = r;
      if (s === i) break;
      [heap[i], heap[s]] = [heap[s], heap[i]];
      i = s;
    }
  }
  return top;
}

// ---------------------------------------------------------------------------
// A* pathfinding
// ---------------------------------------------------------------------------

/** Decode a state key back to (col, row, dir). */
function decodeKey(key: number): { col: number; row: number; dir: number } {
  const dir = key % DIR_COUNT;
  const posKey = (key - dir) / DIR_COUNT;
  const row = posKey % GRID_ROWS;
  const col = (posKey - row) / GRID_ROWS;
  return { col, row, dir };
}

/** Reconstruct the path from the parent map. */
function reconstructPath(
  parent: Map<number, number>,
  goalKey: number,
): GridPoint[] {
  const path: GridPoint[] = [];
  let key: number | undefined = goalKey;

  while (key !== undefined) {
    const { col, row } = decodeKey(key);
    path.push({ col, row });
    key = parent.get(key);
  }

  path.reverse();
  return path;
}

/**
 * Find a path from source to target using A* on the constrained grid.
 *
 * Constraints:
 * - Only H/V/45-degree moves (8 compass directions)
 * - No turns wider than 45 degrees
 * - Wire exits source in specified direction and enters target in specified direction
 * - Avoids occupied cells in the occupancy grid
 * - Only routes within the playable area (cols 6-57, rows 0-35)
 *
 * @param source - Start grid point
 * @param target - End grid point
 * @param occupancy - Grid of occupied cells
 * @param startDir - Direction wire travels when leaving source (default: DIR_E)
 * @param endDir - Direction wire should be traveling when reaching target (default: DIR_E)
 * @returns GridPoint[] path or null if no path exists
 */
export function findPath(
  source: GridPoint,
  target: GridPoint,
  occupancy: readonly boolean[][],
  startDir: number = DIR_E,
  endDir: number = DIR_E,
): GridPoint[] | null {
  // Trivial case: source and target are the same cell
  if (source.col === target.col && source.row === target.row) {
    return [{ col: source.col, row: source.row }];
  }

  // Check source is passable
  if (!isPassable(source.col, source.row, occupancy)) return null;
  // Target may be outside the routable area (e.g. output CPs at col 56)
  // but must be within the full grid bounds
  if (target.col < 0 || target.col >= GRID_COLS || target.row < 0 || target.row >= GRID_ROWS) return null;

  const open: PQEntry[] = [];
  const gScore = new Map<number, number>();
  const parent = new Map<number, number>();

  // Start: at source, traveling in specified direction
  const startKey = stateKey(source.col, source.row, startDir);
  gScore.set(startKey, 0);

  const h0 = chebyshevDistance(source.col, source.row, target.col, target.row);
  pqPush(open, { f: h0, g: 0, col: source.col, row: source.row, dir: startDir });

  while (open.length > 0) {
    const cur = pqPop(open)!;
    const curKey = stateKey(cur.col, cur.row, cur.dir);

    // Skip stale entries
    const bestG = gScore.get(curKey);
    if (bestG !== undefined && cur.g > bestG) continue;

    // Goal: at target, arriving in specified direction
    if (cur.col === target.col && cur.row === target.row && cur.dir === endDir) {
      return reconstructPath(parent, curKey);
    }

    // Expand neighbors (straight, +45, -45)
    for (const nextDir of getAllowedDirections(cur.dir)) {
      const [dc, dr] = DIR_DELTA[nextDir];
      const nc = cur.col + dc;
      const nr = cur.row + dr;

      // Allow reaching the target cell even if outside routable area
      if (!isPassable(nc, nr, occupancy) && !(nc === target.col && nr === target.row)) continue;

      // Uniform step cost + turn penalty
      const turnCost = nextDir !== cur.dir ? TURN_PENALTY : 0;
      const tentG = cur.g + 1 + turnCost;

      const nextKey = stateKey(nc, nr, nextDir);
      const existing = gScore.get(nextKey);

      if (existing === undefined || tentG < existing) {
        gScore.set(nextKey, tentG);
        parent.set(nextKey, curKey);
        const h = chebyshevDistance(nc, nr, target.col, target.row);
        pqPush(open, { f: tentG + h, g: tentG, col: nc, row: nr, dir: nextDir });
      }
    }
  }

  // No path found
  return null;
}
