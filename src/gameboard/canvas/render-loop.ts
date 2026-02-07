import { useGameStore } from '../../store/index.ts';
import { getThemeTokens } from '../../shared/tokens/theme-manager.ts';
import { isRunning, getMeterBuffers, getTargetMeterBuffers, getPerSampleMatch } from '../../simulation/simulation-controller.ts';
import { GRID_COLS, GRID_ROWS, METER_LEFT_START, METER_RIGHT_START, gridRectToPixels, pixelToGrid } from '../../shared/grid/index.ts';
import { drawMeter } from '../meters/render-meter.ts';
import type { RenderMeterState } from '../meters/render-meter.ts';
import { METER_GRID_ROWS, METER_GRID_COLS, METERS_PER_SIDE, METER_GAP_ROWS, METER_VERTICAL_OFFSETS, meterKey } from '../meters/meter-types.ts';
import type { MeterKey } from '../meters/meter-types.ts';
import { drawNodes } from './render-nodes.ts';
import { drawWires } from './render-wires.ts';
import { renderConnectionPoints } from './render-connection-points.ts';
import { renderWirePreview } from './render-wire-preview.ts';
import { drawGrid } from './render-grid.ts';
import { renderPlacementGhost } from './render-placement-ghost.ts';
import { drawLidAnimation, computeProgress, parseDurationMs, drawVictoryBurst, drawNameReveal } from '../animation/index.ts';
import { generateId } from '../../shared/generate-id.ts';
import { drawKeyboardFocus } from './render-focus.ts';
import { getFocusTarget, isFocusVisible } from '../interaction/keyboard-focus.ts';
import { getPortGridAnchor, getPortWireDirection, findPath, DIR_E } from '../../shared/routing/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';


// Module-scope cache for wire preview A* path (avoid recomputing every frame)
let lastPreviewGridCol = -1;
let lastPreviewGridRow = -1;
let cachedPreviewPath: GridPoint[] | null = null;

/**
 * Start the requestAnimationFrame render loop.
 * Reads Zustand via getState() each frame — NOT React hooks.
 * Returns a cleanup function to stop the loop.
 *
 * @param canvas - The canvas element to render to.
 * @param getCellSize - Callback that returns the current grid cell size in CSS pixels.
 *   Viewport-derived; updated on resize via the GameboardCanvas component.
 */
export function startRenderLoop(
  canvas: HTMLCanvasElement,
  getCellSize: () => number,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let animationId = 0;
  let running = true;

  function render(timestamp: number) {
    if (!running) return;

    // Single getState() + getThemeTokens() per frame
    const state = useGameStore.getState();
    const tokens = getThemeTokens();

    // Derive logical dimensions from grid cell size
    const cellSize = getCellSize();
    const logicalWidth = GRID_COLS * cellSize;
    const logicalHeight = GRID_ROWS * cellSize;

    // Clear
    ctx!.fillStyle = tokens.gameboardSurface;
    ctx!.fillRect(0, 0, logicalWidth, logicalHeight);

    // During legacy zoom transition, keep canvas cleared and skip drawing
    // so the snapshot overlay is the only thing visible.
    if (state.zoomTransition) {
      animationId = requestAnimationFrame(render);
      return;
    }

    // --- Lid animation: advance progress and check completion ---
    const lidAnim = state.lidAnimation;
    const lidActive = lidAnim.type === 'opening' || lidAnim.type === 'closing';
    let lidProgress = 0;

    if (lidActive) {
      const durationMs = parseDurationMs(tokens.animZoomDuration);
      lidProgress = computeProgress(lidAnim.startTime, timestamp, durationMs);

      if (lidProgress >= 1) {
        state.endLidAnimation();
        // Animation complete — render the live board below without overlay
        animationId = requestAnimationFrame(render);
        return;
      }
    }

    // --- Ceremony animation: read state ---
    const ceremony = state.ceremonyAnimation;

    // Grid zones and lines (lowest z-order)
    drawGrid(ctx!, tokens, {}, cellSize);

    // Draw meters in side zones
    const meterBuffers = getMeterBuffers();
    const targetMeterBuffers = getTargetMeterBuffers();
    const perSampleMatch = getPerSampleMatch();
    const isSimRunning = isRunning();

    // Calculate meter starting offset (meters fill the full height)
    // 3 meters × 6 rows = 18 rows total (no gaps, no margins)
    const meterTopMargin = 0; // in grid rows
    const meterStride = METER_GRID_ROWS + METER_GAP_ROWS; // rows per meter + gap

    for (let i = 0; i < METERS_PER_SIDE; i++) {
      // Left meters
      const leftKey: MeterKey = meterKey('left', i);
      const leftSlot = state.meterSlots.get(leftKey);
      if (leftSlot) {
        const meterRow = meterTopMargin + i * meterStride + METER_VERTICAL_OFFSETS[i];
        const leftRect = gridRectToPixels({
          col: METER_LEFT_START,
          row: meterRow,
          cols: METER_GRID_COLS,
          rows: METER_GRID_ROWS,
        }, cellSize);
        // Derive confirming/mismatch from perPortMatch at render time
        const meterState = deriveMeterVisualState(leftSlot, i, 'input', state.perPortMatch, isSimRunning);
        const renderState: RenderMeterState = {
          slot: meterState,
          signalBuffer: meterBuffers.get(`input:${i}`) ?? null,
          targetBuffer: null,
        };
        drawMeter(ctx!, tokens, renderState, leftRect);
      }

      // Right meters
      const rightKey: MeterKey = meterKey('right', i);
      const rightSlot = state.meterSlots.get(rightKey);
      if (rightSlot) {
        const meterRowRight = meterTopMargin + i * meterStride + METER_VERTICAL_OFFSETS[i];
        const rightRect = gridRectToPixels({
          col: METER_RIGHT_START,
          row: meterRowRight,
          cols: METER_GRID_COLS,
          rows: METER_GRID_ROWS,
        }, cellSize);
        const meterState = deriveMeterVisualState(rightSlot, i, 'output', state.perPortMatch, isSimRunning);
        const renderState: RenderMeterState = {
          slot: meterState,
          signalBuffer: meterBuffers.get(`output:${i}`) ?? null,
          targetBuffer: targetMeterBuffers.get(`target:${i}`) ?? null,
          matchStatus: perSampleMatch.get(`output:${i}`) ?? null,
        };
        drawMeter(ctx!, tokens, renderState, rightRect);
      }
    }

    if (state.activeBoard) {
      drawWires(ctx!, tokens, state.activeBoard.wires, cellSize, state.activeBoard.nodes);
      drawNodes(ctx!, tokens, {
        puzzleNodes: state.puzzleNodes,
        utilityNodes: state.utilityNodes,
        nodes: state.activeBoard.nodes,
        selectedNodeId: state.selectedNodeId,
        hoveredNodeId: state.hoveredNodeId,
      }, cellSize);

      // Keyboard focus ring (after nodes, before wire preview)
      drawKeyboardFocus(
        ctx!, tokens, getFocusTarget(), isFocusVisible(),
        state.activeBoard.nodes, state.activeBoard.wires,
        logicalWidth, logicalHeight, cellSize,
        state.interactionMode.type === 'keyboard-wiring' ? state.interactionMode : null,
      );
    }

    // Draw connection points on top of wires (always visible)
    renderConnectionPoints(ctx!, tokens, {
      activePuzzle: state.activePuzzle,
      perPortMatch: state.perPortMatch,
      isSimRunning,
    }, cellSize);

    // Wire preview during drawing-wire mode (suppressed when overlay is active)
    const overlayActive = state.activeOverlay.type !== 'none';
    if (!overlayActive && state.interactionMode.type === 'drawing-wire' && state.mousePosition && state.activeBoard) {
      const cursorGrid = pixelToGrid(state.mousePosition.x, state.mousePosition.y, cellSize);

      // Recompute A* path only when cursor moves to a different grid cell
      if (cursorGrid.col !== lastPreviewGridCol || cursorGrid.row !== lastPreviewGridRow) {
        lastPreviewGridCol = cursorGrid.col;
        lastPreviewGridRow = cursorGrid.row;

        const fromPort = state.interactionMode.fromPort;
        const sourceNode = state.activeBoard.nodes.get(fromPort.nodeId);
        if (sourceNode) {
          const sourceAnchor = getPortGridAnchor(sourceNode, fromPort.side, fromPort.portIndex);
          const startDir = getPortWireDirection(sourceNode, fromPort.side);
          cachedPreviewPath = findPath(sourceAnchor, cursorGrid, state.occupancy, startDir, DIR_E);
        } else {
          cachedPreviewPath = null;
        }
      }

      renderWirePreview(ctx!, tokens, state.interactionMode.fromPosition, state.mousePosition, cachedPreviewPath, cellSize);
    } else {
      // Reset cache when not in drawing-wire mode
      lastPreviewGridCol = -1;
      lastPreviewGridRow = -1;
      cachedPreviewPath = null;
    }

    // Placement ghost (suppressed when overlay is active)
    if (!overlayActive) {
      renderPlacementGhost(ctx!, tokens, {
        interactionMode: state.interactionMode,
        mousePosition: state.mousePosition,
        occupancy: state.occupancy,
        puzzleNodes: state.puzzleNodes,
        utilityNodes: state.utilityNodes,
        keyboardGhostPosition: state.keyboardGhostPosition,
      }, cellSize);
    }

    // Lid animation overlay (drawn on top of the live board)
    if (lidActive) {
      drawLidAnimation(ctx!, tokens, lidAnim, lidProgress, logicalWidth, logicalHeight);
    }

    // --- Ceremony animation overlays (drawn on top of everything) ---
    if (ceremony.type === 'victory-burst') {
      const burstDuration = parseDurationMs(tokens.animCeremonyBurstDuration);
      const burstProgress = computeProgress(ceremony.startTime, timestamp, burstDuration);
      drawVictoryBurst(ctx!, tokens, burstProgress, logicalWidth, logicalHeight);

      if (burstProgress >= 1) {
        state.startNameReveal();
      }
    } else if (ceremony.type === 'name-reveal') {
      const revealDuration = parseDurationMs(tokens.animCeremonyRevealDuration);
      const revealProgress = computeProgress(ceremony.startTime, timestamp, revealDuration);

      const puzzleName = state.ceremonyPuzzle?.title ?? '';
      const puzzleDesc = state.ceremonyPuzzle?.description ?? '';
      drawNameReveal(ctx!, tokens, revealProgress, puzzleName, puzzleDesc, logicalWidth, logicalHeight);

      if (revealProgress >= 1) {
        // Capture OffscreenCanvas snapshot for zoom-out
        const snapshot = new OffscreenCanvas(logicalWidth, logicalHeight);
        const snapshotCtx = snapshot.getContext('2d');
        if (snapshotCtx) {
          snapshotCtx.drawImage(canvas, 0, 0, logicalWidth, logicalHeight);
        }
        state.startCeremonyZoomOut(snapshot);
      }
    } else if (ceremony.type === 'zoom-out') {
      const zoomDuration = parseDurationMs(tokens.animZoomDuration);
      const zoomProgress = computeProgress(ceremony.startTime, timestamp, zoomDuration);

      // Synthesize a closing lid animation state from the ceremony snapshot
      drawLidAnimation(ctx!, tokens, {
        type: 'closing',
        progress: zoomProgress,
        snapshot: ceremony.snapshot,
        startTime: ceremony.startTime,
      }, zoomProgress, logicalWidth, logicalHeight);

      if (zoomProgress >= 1) {
        // Ceremony complete — finalize
        handleCeremonyCompletion(state);
      }
    }

    // Dim canvas when an overlay is active (but not during ceremony or lid)
    const ceremonyActive = ceremony.type !== 'inactive';
    if (overlayActive && !lidActive && !ceremonyActive) {
      ctx!.fillStyle = 'rgba(0,0,0,0.15)';
      ctx!.fillRect(0, 0, logicalWidth, logicalHeight);
    }

    animationId = requestAnimationFrame(render);
  }

  animationId = requestAnimationFrame(render);

  return () => {
    running = false;
    cancelAnimationFrame(animationId);
  };
}

import type { MeterSlotState, MeterVisualState } from '../meters/meter-types.ts';

/**
 * Derive the visual state for a meter at render time.
 * Output meters get confirming/mismatch based on perPortMatch + isSimRunning.
 * Input meters stay as-is from the store.
 */
function deriveMeterVisualState(
  slot: MeterSlotState,
  index: number,
  direction: 'input' | 'output',
  perPortMatch: readonly boolean[],
  isSimRunning: boolean,
): MeterSlotState {
  if (slot.visualState !== 'active' || direction !== 'output' || !isSimRunning) {
    return slot;
  }

  // perPortMatch is indexed by output port index
  if (index < perPortMatch.length) {
    const visualState: MeterVisualState = perPortMatch[index] ? 'confirming' : 'mismatch';
    return { ...slot, visualState };
  }

  return slot;
}

/**
 * Handle ceremony completion: add puzzle node, complete level, dismiss ceremony.
 * Called from render loop when ceremony zoom-out reaches progress >= 1.
 */
function handleCeremonyCompletion(state: ReturnType<typeof useGameStore.getState>): void {
  const { ceremonyPuzzle, ceremonyBakeMetadata, ceremonyIsResolve: _ceremonyIsResolve } = state;

  // End animation
  state.endCeremony();

  if (!ceremonyPuzzle || !ceremonyBakeMetadata) {
    state.dismissCeremony();
    return;
  }

  // Add puzzle node to palette on first completion
  if (!state.puzzleNodes.has(ceremonyPuzzle.id)) {
    const puzzle = state.activePuzzle;
    if (puzzle) {
      state.addPuzzleNode({
        puzzleId: ceremonyPuzzle.id,
        title: ceremonyPuzzle.title,
        description: ceremonyPuzzle.description,
        inputCount: puzzle.activeInputs,
        outputCount: puzzle.activeOutputs,
        bakeMetadata: ceremonyBakeMetadata,
        versionHash: generateId(),
      });
    }
  }

  // Mark level as completed
  state.completeLevel(ceremonyPuzzle.id);

  // Clear ceremony data
  state.dismissCeremony();
}
