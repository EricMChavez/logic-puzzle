import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import type { Vec2, NodeRotation } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import type { PuzzleNodeEntry, UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import { pixelToGrid, gridToPixel, getNodeGridSizeFromType, canPlaceNode, canMoveNode, PLAYABLE_START, PLAYABLE_END, GRID_ROWS } from '../../shared/grid/index.ts';
import { NODE_STYLE, NODE_TYPE_LABELS } from '../../shared/constants/index.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';

export interface RenderPlacementGhostState {
  interactionMode: InteractionMode;
  mousePosition: Vec2 | null;
  occupancy: readonly boolean[][];
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>;
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>;
  keyboardGhostPosition: GridPoint | null;
}

/**
 * Get port counts for a node type.
 */
function getPortCountsFromType(
  nodeType: string,
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>,
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>,
): { inputCount: number; outputCount: number } {
  if (nodeType.startsWith('puzzle:')) {
    const puzzleId = nodeType.slice('puzzle:'.length);
    const entry = puzzleNodes.get(puzzleId);
    return { inputCount: entry?.inputCount ?? 1, outputCount: entry?.outputCount ?? 1 };
  }
  if (nodeType.startsWith('utility:')) {
    const utilityId = nodeType.slice('utility:'.length);
    const entry = utilityNodes.get(utilityId);
    return { inputCount: entry?.inputCount ?? 1, outputCount: entry?.outputCount ?? 1 };
  }
  // Fundamental node - get from registry
  const def = getNodeDefinition(nodeType);
  if (def) {
    return { inputCount: def.inputs.length, outputCount: def.outputs.length };
  }
  return { inputCount: 1, outputCount: 1 };
}

/**
 * Calculate the ghost body rect based on port span (matching getNodeBodyPixelRect logic).
 * Returns the pixel rect for the visual body.
 */
function getGhostBodyRect(
  col: number,
  row: number,
  cols: number,
  rows: number,
  inputCount: number,
  outputCount: number,
  rotation: NodeRotation,
  cellSize: number,
): { x: number; y: number; width: number; height: number } {
  const maxPortCount = Math.max(inputCount, outputCount, 1);
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

    const x = col * cellSize;
    const y = (row + firstPortRow - 0.5) * cellSize;
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

    const x = (col + firstPortCol - 0.5) * cellSize;
    const y = row * cellSize;
    const width = portSpan * cellSize;
    const height = rows * cellSize;
    return { x, y, width, height };
  }
}

export function renderPlacementGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  // Handle both placing-node and dragging-node modes
  if (state.interactionMode.type === 'placing-node') {
    renderPlacingNodeGhost(ctx, tokens, state, cellSize);
  } else if (state.interactionMode.type === 'dragging-node') {
    renderDraggingNodeGhost(ctx, tokens, state, cellSize);
  }
}

function renderPlacingNodeGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  if (state.interactionMode.type !== 'placing-node') return;

  // Keyboard ghost position takes priority over mouse
  if (!state.keyboardGhostPosition && !state.mousePosition) return;

  const nodeType = state.interactionMode.nodeType;
  const rotation: NodeRotation = state.interactionMode.rotation ?? 0;
  const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);
  const { inputCount, outputCount } = getPortCountsFromType(nodeType, state.puzzleNodes, state.utilityNodes);

  let col: number;
  let row: number;

  // 1-cell padding inside playable area so port anchors stay routable
  const minCol = PLAYABLE_START + 1;
  const maxCol = PLAYABLE_END - cols;
  const minRow = 1;
  const maxRow = GRID_ROWS - rows - 1;

  if (state.keyboardGhostPosition) {
    // Use keyboard position directly (already in grid coords)
    col = Math.max(minCol, Math.min(state.keyboardGhostPosition.col, maxCol));
    row = Math.max(minRow, Math.min(state.keyboardGhostPosition.row, maxRow));
  } else {
    // Snap mouse to grid
    const grid = pixelToGrid(state.mousePosition!.x, state.mousePosition!.y, cellSize);
    col = Math.max(minCol, Math.min(grid.col, maxCol));
    row = Math.max(minRow, Math.min(grid.row, maxRow));
  }

  const valid = canPlaceNode(state.occupancy as boolean[][], col, row, cols, rows);

  // Calculate body rect based on port span (matching getNodeBodyPixelRect logic)
  const rect = getGhostBodyRect(col, row, cols, rows, inputCount, outputCount, rotation, cellSize);
  const borderRadius = NODE_STYLE.BORDER_RADIUS_RATIO * cellSize;

  ctx.save();
  ctx.globalAlpha = 0.4;

  if (valid) {
    ctx.fillStyle = tokens.surfaceNode;
  } else {
    ctx.fillStyle = '#cc3333';
  }

  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
  ctx.fill();

  // Draw label (rotated with node)
  let label = NODE_TYPE_LABELS[nodeType] ?? nodeType;
  if (nodeType.startsWith('puzzle:')) {
    const puzzleId = nodeType.slice('puzzle:'.length);
    const entry = state.puzzleNodes.get(puzzleId);
    if (entry) label = entry.title;
  } else if (nodeType.startsWith('utility:')) {
    const utilityId = nodeType.slice('utility:'.length);
    const entry = state.utilityNodes.get(utilityId);
    if (entry) label = entry.title;
  }

  const labelFontSize = Math.round(NODE_STYLE.LABEL_FONT_RATIO * cellSize);
  const rotationRad = (rotation * Math.PI) / 180;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  ctx.globalAlpha = 0.7;
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);

  ctx.fillStyle = tokens.textPrimary;
  ctx.font = `${labelFontSize}px ${NODE_STYLE.LABEL_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);

  ctx.restore();
}

function renderDraggingNodeGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  if (state.interactionMode.type !== 'dragging-node') return;
  if (!state.mousePosition) return;

  const { draggedNode, rotation } = state.interactionMode;
  const nodeType = draggedNode.type;
  const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);
  const inputCount = draggedNode.inputCount;
  const outputCount = draggedNode.outputCount;

  // Snap mouse to grid (1-cell padding for port anchor routability)
  const grid = pixelToGrid(state.mousePosition.x, state.mousePosition.y, cellSize);
  const col = Math.max(PLAYABLE_START + 1, Math.min(grid.col, PLAYABLE_END - cols));
  const row = Math.max(1, Math.min(grid.row, GRID_ROWS - rows - 1));

  // Check if move is valid (excluding the dragged node's current position)
  const valid = canMoveNode(state.occupancy as boolean[][], draggedNode, col, row, rotation);

  // Calculate body rect based on port span (matching getNodeBodyPixelRect logic)
  const rect = getGhostBodyRect(col, row, cols, rows, inputCount, outputCount, rotation, cellSize);
  const borderRadius = NODE_STYLE.BORDER_RADIUS_RATIO * cellSize;

  ctx.save();
  ctx.globalAlpha = 0.5;

  if (valid) {
    ctx.fillStyle = tokens.surfaceNode;
  } else {
    ctx.fillStyle = '#cc3333';
  }

  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
  ctx.fill();

  // Draw label (rotated with node)
  let label = NODE_TYPE_LABELS[nodeType] ?? nodeType;
  if (nodeType.startsWith('puzzle:')) {
    const puzzleId = nodeType.slice('puzzle:'.length);
    const entry = state.puzzleNodes.get(puzzleId);
    if (entry) label = entry.title;
  } else if (nodeType.startsWith('utility:')) {
    const utilityId = nodeType.slice('utility:'.length);
    const entry = state.utilityNodes.get(utilityId);
    if (entry) label = entry.title;
  }

  const labelFontSize = Math.round(NODE_STYLE.LABEL_FONT_RATIO * cellSize);
  const rotationRad = (rotation * Math.PI) / 180;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  ctx.globalAlpha = 0.8;
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);

  ctx.fillStyle = tokens.textPrimary;
  ctx.font = `${labelFontSize}px ${NODE_STYLE.LABEL_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);

  ctx.restore();
}
