import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import type { Vec2, NodeState, NodeRotation } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import type { PuzzleNodeEntry, UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import type { RenderNodesState, KnobInfo } from './render-types.ts';
import { pixelToGrid, getNodeGridSizeFromType, canPlaceNode, canMoveNode, PLAYABLE_START, PLAYABLE_END, GRID_ROWS } from '../../shared/grid/index.ts';
import { getNodeDefinition, getDefaultParams } from '../../engine/nodes/registry.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { drawSingleNode } from './render-nodes.ts';
import { getNodeBodyPixelRect } from './port-positions.ts';

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
 * Build a synthetic NodeState for the placement ghost preview.
 */
function buildGhostNodeState(
  nodeType: string,
  col: number,
  row: number,
  rotation: NodeRotation,
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>,
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>,
): NodeState {
  const { inputCount, outputCount } = getPortCountsFromType(nodeType, puzzleNodes, utilityNodes);
  const params = getDefaultParams(nodeType);
  return {
    id: '__ghost__',
    type: nodeType,
    position: { col, row },
    params,
    inputCount,
    outputCount,
    rotation,
  };
}

/**
 * Build a minimal RenderNodesState containing only the ghost node.
 */
function buildGhostRenderState(
  ghostNode: NodeState,
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>,
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>,
): RenderNodesState {
  const knobValues = new Map<string, KnobInfo>();
  const knobCfg = getKnobConfig(getNodeDefinition(ghostNode.type));
  if (knobCfg) {
    const defaultValue = (ghostNode.params[knobCfg.paramKey] as number) ?? 0;
    knobValues.set('__ghost__', { value: defaultValue, isWired: false });
  }

  return {
    puzzleNodes,
    utilityNodes,
    chips: new Map([['__ghost__', ghostNode]]),
    selectedNodeId: null,
    hoveredNodeId: null,
    knobValues,
    portSignals: new Map(),
    rejectedKnobNodeId: null,
    connectedInputPorts: new Set(),
    liveNodeIds: new Set(['__ghost__']),
  };
}

export function renderPlacementGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
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

  let col: number;
  let row: number;

  // 1-cell padding inside playable area so port anchors stay routable
  const minCol = PLAYABLE_START + 1;
  const maxCol = PLAYABLE_END - cols;
  const minRow = 1;
  const maxRow = GRID_ROWS - rows - 1;

  if (state.keyboardGhostPosition) {
    col = Math.max(minCol, Math.min(state.keyboardGhostPosition.col, maxCol));
    row = Math.max(minRow, Math.min(state.keyboardGhostPosition.row, maxRow));
  } else {
    const grid = pixelToGrid(state.mousePosition!.x, state.mousePosition!.y, cellSize);
    col = Math.max(minCol, Math.min(grid.col - Math.floor(cols / 2), maxCol));
    row = Math.max(minRow, Math.min(grid.row - Math.floor(rows / 2), maxRow));
  }

  const valid = canPlaceNode(state.occupancy as boolean[][], col, row, cols, rows);

  // Build synthetic node and render state
  const ghostNode = buildGhostNodeState(nodeType, col, row, rotation, state.puzzleNodes, state.utilityNodes);
  const renderState = buildGhostRenderState(ghostNode, state.puzzleNodes, state.utilityNodes);

  // Draw using real node renderer at reduced opacity
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawSingleNode(ctx, tokens, ghostNode, renderState, cellSize);
  ctx.restore();

  // Invalid overlay: semitransparent red rect over the node body
  if (!valid) {
    const rect = getNodeBodyPixelRect(ghostNode, cellSize);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tokens.colorError;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 0);
    ctx.fill();
    ctx.restore();
  }
}

function renderDraggingNodeGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  if (state.interactionMode.type !== 'dragging-node') return;
  if (!state.mousePosition) return;

  const { draggedNode, grabOffset, rotation } = state.interactionMode;
  const nodeType = draggedNode.type;
  const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);

  // Snap mouse to grid, subtract grab offset so ghost stays under cursor
  const grid = pixelToGrid(state.mousePosition.x, state.mousePosition.y, cellSize);
  const col = Math.max(PLAYABLE_START + 1, Math.min(grid.col - grabOffset.col, PLAYABLE_END - cols));
  const row = Math.max(1, Math.min(grid.row - grabOffset.row, GRID_ROWS - rows - 1));

  const valid = canMoveNode(state.occupancy as boolean[][], draggedNode, col, row, rotation);

  // Copy the dragged node with overridden position/rotation
  const ghostNode: NodeState = {
    ...draggedNode,
    id: '__ghost__',
    position: { col, row },
    rotation,
  };
  const renderState = buildGhostRenderState(ghostNode, state.puzzleNodes, state.utilityNodes);

  // Draw using real node renderer at reduced opacity
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawSingleNode(ctx, tokens, ghostNode, renderState, cellSize);
  ctx.restore();

  // Invalid overlay
  if (!valid) {
    const rect = getNodeBodyPixelRect(ghostNode, cellSize);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tokens.colorError;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 0);
    ctx.fill();
    ctx.restore();
  }
}
