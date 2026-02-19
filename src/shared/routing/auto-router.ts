import type { GridPoint } from '../grid/types.ts';
import type { ChipState, ChipRotation } from '../types/index.ts';
import { GRID_COLS, GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from '../grid/constants.ts';
import { getNodeGridSize } from '../grid/occupancy.ts';
import {
  getRotatedPortSide,
  getPortOffset,
  rotateExplicitSide,
  type PortSide,
} from '../grid/rotation.ts';
import { getChipDefinition } from '../../engine/nodes/registry.ts';
import {
  isConnectionPointNode,
  isConnectionInputNode,
  getConnectionPointIndex,
  isCreativeSlotNode,
  getCreativeSlotIndex,
  isBidirectionalCpNode,
  getBidirectionalCpIndex,
  isUtilitySlotNode,
  getUtilitySlotIndex,
} from '../../puzzle/connection-point-nodes.ts';
import { METER_GRID_ROWS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS } from '../../gameboard/meters/meter-types.ts';
import {
  DIR_DELTA,
  DIR_COUNT,
  DIR_E,
  DIR_S,
  DIR_W,
  DIR_N,
  STEM_PHASES,
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
 * For utility nodes with cpLayout, ports are placed on the side of their originating CP.
 */
function resolvePortSide(
  node: ChipState,
  side: 'input' | 'output',
  portIndex: number,
): PortSide {
  // Utility nodes with cpLayout: port side derives from CP position
  if ((node.type.startsWith('utility:') || node.type === 'custom-blank') && node.params?.cpLayout) {
    const cpLayout = node.params.cpLayout as string[];
    let count = 0;
    for (let i = 0; i < cpLayout.length; i++) {
      if (cpLayout[i] === side) {
        if (count === portIndex) return i < 3 ? 'left' : 'right';
        count++;
      }
    }
    // Fallback
    return side === 'input' ? 'left' : 'right';
  }

  const rotation: ChipRotation = node.rotation ?? 0;
  const def = getChipDefinition(node.type);
  if (def) {
    const ports = side === 'input' ? def.sockets : def.plugs;
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
  node: ChipState,
  physicalSide: PortSide,
): { inputCount: number; outputCount: number } {
  let inputCount = 0;
  let outputCount = 0;
  for (let i = 0; i < node.socketCount; i++) {
    if (resolvePortSide(node, 'input', i) === physicalSide) inputCount++;
  }
  for (let i = 0; i < node.plugCount; i++) {
    if (resolvePortSide(node, 'output', i) === physicalSide) outputCount++;
  }
  return { inputCount, outputCount };
}

/**
 * Get a port's index among ports on the same physical side.
 */
function getPortIndexOnPhysicalSide(
  node: ChipState,
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
  node: ChipState,
  side: 'input' | 'output' | 'socket' | 'plug',
  portIndex: number = 0,
): number {
  // Normalize PortRef side names to logical side
  const logicalSide: 'input' | 'output' = side === 'socket' ? 'input' : side === 'plug' ? 'output' : side;
  if (isConnectionPointNode(node.id)) {
    // Determine which physical side the CP is on
    let isLeftPhysical: boolean;
    if (isCreativeSlotNode(node.id)) {
      isLeftPhysical = getCreativeSlotIndex(node.id) < 3;
    } else if (isUtilitySlotNode(node.id)) {
      isLeftPhysical = getUtilitySlotIndex(node.id) < 3;
    } else if (isBidirectionalCpNode(node.id)) {
      isLeftPhysical = getBidirectionalCpIndex(node.id) < 3;
    } else if (node.params.physicalSide) {
      isLeftPhysical = node.params.physicalSide === 'left';
    } else {
      isLeftPhysical = isConnectionInputNode(node.id);
    }
    // Facing direction: left CPs face east, right CPs face west
    const facingDir = isLeftPhysical ? DIR_E : DIR_W;
    // Output port (source): wire exits in facing direction
    // Input port (target): wire enters from opposite direction
    return logicalSide === 'output' ? facingDir : (facingDir + 4) % 8;
  }

  const portSide = resolvePortSide(node, logicalSide, portIndex);
  const portFacingDir = portSideToWireDirection(portSide);

  if (logicalSide === 'output') {
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
  node: ChipState,
  side: 'input' | 'output' | 'socket' | 'plug',
  portIndex: number,
): GridPoint {
  // Normalize PortRef side names to logical side
  const logicalSide: 'input' | 'output' = side === 'socket' ? 'input' : side === 'plug' ? 'output' : side;
  if (isConnectionPointNode(node.id)) {
    return getConnectionPointAnchor(node);
  }

  const { cols, rows } = getNodeGridSize(node);

  // Utility nodes with cpLayout: use fixed slot positions to match render
  if ((node.type.startsWith('utility:') || node.type === 'custom-blank') && node.params?.cpLayout) {
    const cpLayout = node.params.cpLayout as string[];
    let count = 0;
    for (let i = 0; i < cpLayout.length; i++) {
      if (cpLayout[i] === logicalSide) {
        if (count === portIndex) {
          const isLeft = i < 3;
          const slotOnSide = i < 3 ? i : i - 3; // 0, 1, or 2 within the side
          return {
            col: isLeft ? node.position.col : node.position.col + cols,
            row: node.position.row + Math.floor(slotOnSide * rows / 3),
          };
        }
        count++;
      }
    }
    // Fallback (shouldn't reach here)
    return { col: node.position.col, row: node.position.row };
  }

  // Get the physical side for this specific port (handles per-port overrides)
  const portSide = resolvePortSide(node, logicalSide, portIndex);

  // Count ports on this same physical side (across both inputs and outputs)
  const { inputCount: sameInputs, outputCount: sameOutputs } = countPortsOnSide(node, portSide);
  const totalOnSide = sameInputs + sameOutputs;

  // Get this port's index within ports on this side (inputs first, then outputs)
  const indexOnSide = logicalSide === 'input'
    ? getPortIndexOnPhysicalSide(node, 'input', portIndex, portSide)
    : sameInputs + getPortIndexOnPhysicalSide(node, 'output', portIndex, portSide);

  // Get the port's offset from node's top-left
  const offset = getPortOffset(cols, rows, totalOnSide, indexOnSide, portSide);

  // Apply explicit gridPosition override from port definition (must match renderer)
  const def = getChipDefinition(node.type);
  if (def) {
    const ports = logicalSide === 'input' ? def.sockets : def.plugs;
    const portDef = ports[portIndex];
    if (portDef?.gridPosition !== undefined) {
      if (portSide === 'left' || portSide === 'right') {
        offset.row = portDef.gridPosition;
      } else {
        offset.col = portDef.gridPosition;
      }
    }
  }

  // Compute anchor at the port's grid line (matching the port pixel position).
  // getPortOffset returns col=0 for left, col=nodeWidth for right, etc.
  // These land on the node's grid lines — the boundary between the node body
  // and the adjacent cell. A* start/target exemptions allow routing from/to here.
  const nodeCol = node.position.col;
  const nodeRow = node.position.row;

  return {
    col: nodeCol + offset.col,
    row: nodeRow + offset.row,
  };
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
function getConnectionPointAnchor(node: ChipState): GridPoint {
  // All CP node types encode a slot index (0-5). Extract it.
  let slotIdx: number;
  if (isCreativeSlotNode(node.id)) {
    slotIdx = getCreativeSlotIndex(node.id);
  } else if (isUtilitySlotNode(node.id)) {
    slotIdx = getUtilitySlotIndex(node.id);
  } else if (isBidirectionalCpNode(node.id)) {
    slotIdx = getBidirectionalCpIndex(node.id);
  } else if (node.params.physicalSide) {
    // Custom puzzle: use explicit physical side and meter index → derive slot
    const pSide = node.params.physicalSide as 'left' | 'right';
    const idx = node.params.meterIndex as number;
    slotIdx = pSide === 'left' ? idx : idx + 3;
  } else {
    // Standard puzzle: input→left, output→right
    const isInput = isConnectionInputNode(node.id);
    const cpIndex = getConnectionPointIndex(node.id);
    slotIdx = isInput ? cpIndex : cpIndex + 3;
  }

  // Derive physical side and per-side index from flat slot index
  const isLeftSide = slotIdx < 3;
  const index = slotIdx % 3;

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
  /** Stem phase: 0 = still in forced start stem, 1 = free routing */
  stem: number;
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
  // Strip stem phase bit (lowest bit)
  const withoutStem = Math.floor(key / STEM_PHASES);
  const dir = withoutStem % DIR_COUNT;
  const posKey = (withoutStem - dir) / DIR_COUNT;
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
 * - Forced stem: the first `stemLength` steps must travel straight in `startDir`
 * - Avoids occupied cells in the occupancy grid
 * - Only routes within the playable area (cols 10-55, rows 0-35)
 *
 * @param source - Start grid point
 * @param target - End grid point
 * @param occupancy - Grid of occupied cells
 * @param startDir - Direction wire travels when leaving source (default: DIR_E)
 * @param endDir - Direction wire should be traveling when reaching target (default: DIR_E)
 * @param stemLength - Number of forced straight steps from source in startDir (default: 1)
 * @returns GridPoint[] path or null if no path exists
 */
export function findPath(
  source: GridPoint,
  target: GridPoint,
  occupancy: readonly boolean[][],
  startDir: number = DIR_E,
  endDir: number = DIR_E,
  stemLength: number = 1,
): GridPoint[] | null {
  // Trivial case: source and target are the same cell
  if (source.col === target.col && source.row === target.row) {
    return [{ col: source.col, row: source.row }];
  }

  // Source may be on the node body (anchors sit on node edge), so check bounds but
  // not occupancy — the stem will move the path off the occupied cell immediately.
  // Use full grid bounds (not isRoutable) because CPs at col 56 can be sources when
  // creative mode swaps input/output sides.
  if (source.col < 0 || source.col >= GRID_COLS || source.row < 0 || source.row >= GRID_ROWS) return null;
  // Target may be outside the routable area (e.g. output CPs at col 56)
  // but must be within the full grid bounds
  if (target.col < 0 || target.col >= GRID_COLS || target.row < 0 || target.row >= GRID_ROWS) return null;

  const open: PQEntry[] = [];
  const gScore = new Map<number, number>();
  const parent = new Map<number, number>();

  // Start: at source, traveling in specified direction, in stem phase (stem=0)
  const inStem = stemLength > 0 ? 0 : 1;
  const startKey = stateKey(source.col, source.row, startDir, inStem);
  gScore.set(startKey, 0);

  const h0 = chebyshevDistance(source.col, source.row, target.col, target.row);
  pqPush(open, { f: h0, g: 0, col: source.col, row: source.row, dir: startDir, stem: inStem });

  while (open.length > 0) {
    const cur = pqPop(open)!;
    const curKey = stateKey(cur.col, cur.row, cur.dir, cur.stem);

    // Skip stale entries
    const bestG = gScore.get(curKey);
    if (bestG !== undefined && cur.g > bestG) continue;

    // Goal: at target, arriving in specified direction (only reachable in free phase)
    if (cur.col === target.col && cur.row === target.row && cur.dir === endDir && cur.stem === 1) {
      return reconstructPath(parent, curKey);
    }

    // Determine allowed directions: stem phase forces straight only
    const directions = cur.stem === 0
      ? [cur.dir] as const  // Forced straight in start direction
      : getAllowedDirections(cur.dir);

    // Expand neighbors
    for (const nextDir of directions) {
      const [dc, dr] = DIR_DELTA[nextDir];
      const nc = cur.col + dc;
      const nr = cur.row + dr;

      // Allow reaching the target cell even if outside routable area
      if (!isPassable(nc, nr, occupancy) && !(nc === target.col && nr === target.row)) continue;

      // Uniform step cost + turn penalty
      const turnCost = nextDir !== cur.dir ? TURN_PENALTY : 0;
      const tentG = cur.g + 1 + turnCost;

      // Transition stem phase: after stemLength steps from source, switch to free
      // g tracks total steps from source; stem completes after stemLength steps
      let nextStem = cur.stem;
      if (cur.stem === 0 && tentG >= stemLength) {
        nextStem = 1; // Exit stem phase
      }

      const nextKey = stateKey(nc, nr, nextDir, nextStem);
      const existing = gScore.get(nextKey);

      if (existing === undefined || tentG < existing) {
        gScore.set(nextKey, tentG);
        parent.set(nextKey, curKey);
        const h = chebyshevDistance(nc, nr, target.col, target.row);
        pqPush(open, { f: tentG + h, g: tentG, col: nc, row: nr, dir: nextDir, stem: nextStem });
      }
    }
  }

  // No path found
  return null;
}
