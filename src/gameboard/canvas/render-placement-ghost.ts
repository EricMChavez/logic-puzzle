import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import type { Vec2, ChipState, ChipRotation } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import type { CraftedPuzzleEntry, CraftedUtilityEntry } from '../../store/slices/palette-slice.ts';
import type { RenderNodesState, KnobInfo } from './render-types.ts';
import { pixelToGrid, getNodeGridSizeFromType, canPlaceNode, canMoveNode, GRID_ROWS, getPlayableBounds } from '../../shared/grid/index.ts';
import { getChipDefinition, getDefaultParams } from '../../engine/nodes/registry.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { drawSingleNode } from './render-nodes.ts';
import { getNodeBodyPixelRect } from './port-positions.ts';

export interface RenderPlacementGhostState {
  interactionMode: InteractionMode;
  mousePosition: Vec2 | null;
  occupancy: readonly boolean[][];
  craftedPuzzles: ReadonlyMap<string, CraftedPuzzleEntry>;
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>;
  keyboardGhostPosition: GridPoint | null;
  activeBoardId?: string;
}

/**
 * Get port counts for a node type.
 */
export function getPortCountsFromType(
  nodeType: string,
  craftedPuzzles: ReadonlyMap<string, CraftedPuzzleEntry>,
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>,
): { socketCount: number; plugCount: number } {
  if (nodeType.startsWith('puzzle:')) {
    const puzzleId = nodeType.slice('puzzle:'.length);
    const entry = craftedPuzzles.get(puzzleId);
    return { socketCount: entry?.socketCount ?? 1, plugCount: entry?.plugCount ?? 1 };
  }
  if (nodeType.startsWith('utility:')) {
    const utilityId = nodeType.slice('utility:'.length);
    const entry = craftedUtilities.get(utilityId);
    return { socketCount: entry?.socketCount ?? 1, plugCount: entry?.plugCount ?? 1 };
  }
  // Fundamental chip - get from registry
  const def = getChipDefinition(nodeType);
  if (def) {
    return { socketCount: def.sockets.length, plugCount: def.plugs.length };
  }
  return { socketCount: 1, plugCount: 1 };
}

/**
 * Build a synthetic ChipState for the placement ghost preview.
 */
function buildGhostChipState(
  nodeType: string,
  col: number,
  row: number,
  rotation: ChipRotation,
  craftedPuzzles: ReadonlyMap<string, CraftedPuzzleEntry>,
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>,
): ChipState {
  const { socketCount, plugCount } = getPortCountsFromType(nodeType, craftedPuzzles, craftedUtilities);
  const params = getDefaultParams(nodeType);
  return {
    id: '__ghost__',
    type: nodeType,
    position: { col, row },
    params,
    socketCount,
    plugCount,
    rotation,
  };
}

/**
 * Build a minimal RenderNodesState containing only the ghost node.
 */
function buildGhostRenderState(
  ghostNode: ChipState,
  craftedPuzzles: ReadonlyMap<string, CraftedPuzzleEntry>,
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>,
): RenderNodesState {
  const knobValues = new Map<string, KnobInfo>();
  const knobCfg = getKnobConfig(getChipDefinition(ghostNode.type));
  if (knobCfg) {
    const defaultValue = (ghostNode.params[knobCfg.paramKey] as number) ?? 0;
    knobValues.set('__ghost__', { value: defaultValue, isWired: false });
  }

  return {
    craftedPuzzles,
    craftedUtilities,
    chips: new Map([['__ghost__', ghostNode]]),
    selectedChipId: null,
    hoveredChipId: null,
    knobValues,
    portSignals: new Map(),
    rejectedKnobChipId: null,
    connectedSocketPorts: new Set(),
    connectedPlugPorts: new Set(),
    liveChipIds: new Set(['__ghost__']),
  };
}

export function renderPlacementGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  if (state.interactionMode.type === 'placing-chip') {
    renderPlacingChipGhost(ctx, tokens, state, cellSize);
  } else if (state.interactionMode.type === 'dragging-chip') {
    renderDraggingChipGhost(ctx, tokens, state, cellSize);
  }
}

function renderPlacingChipGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  if (state.interactionMode.type !== 'placing-chip') return;

  // Keyboard ghost position takes priority over mouse
  if (!state.keyboardGhostPosition && !state.mousePosition) return;

  const nodeType = state.interactionMode.chipType;
  const rotation: ChipRotation = state.interactionMode.rotation ?? 0;
  const { cols, rows } = getNodeGridSizeFromType(nodeType, state.craftedPuzzles, state.craftedUtilities, rotation);

  let col: number;
  let row: number;

  // 1-cell padding inside playable area so port anchors stay routable
  const bounds = getPlayableBounds(state.activeBoardId);
  const minCol = bounds.playableStart + 1;
  const maxCol = bounds.playableEnd - cols;
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

  const valid = canPlaceNode(state.occupancy as boolean[][], col, row, cols, rows, bounds);

  // Build synthetic node and render state
  const ghostNode = buildGhostChipState(nodeType, col, row, rotation, state.craftedPuzzles, state.craftedUtilities);
  const renderState = buildGhostRenderState(ghostNode, state.craftedPuzzles, state.craftedUtilities);

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

function renderDraggingChipGhost(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderPlacementGhostState,
  cellSize: number,
): void {
  if (state.interactionMode.type !== 'dragging-chip') return;
  if (!state.mousePosition) return;

  const { draggedChip, grabOffset, rotation } = state.interactionMode;
  const nodeType = draggedChip.type;
  const { cols, rows } = getNodeGridSizeFromType(nodeType, state.craftedPuzzles, state.craftedUtilities, rotation);

  // Snap mouse to grid, subtract grab offset so ghost stays under cursor
  const grid = pixelToGrid(state.mousePosition.x, state.mousePosition.y, cellSize);
  const bounds = getPlayableBounds(state.activeBoardId);
  const col = Math.max(bounds.playableStart + 1, Math.min(grid.col - grabOffset.col, bounds.playableEnd - cols));
  const row = Math.max(1, Math.min(grid.row - grabOffset.row, GRID_ROWS - rows - 1));

  const valid = canMoveNode(state.occupancy as boolean[][], draggedChip, col, row, rotation, bounds);

  // Copy the dragged chip with overridden position/rotation
  const ghostNode: ChipState = {
    ...draggedChip,
    id: '__ghost__',
    position: { col, row },
    rotation,
  };
  const renderState = buildGhostRenderState(ghostNode, state.craftedPuzzles, state.craftedUtilities);

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
