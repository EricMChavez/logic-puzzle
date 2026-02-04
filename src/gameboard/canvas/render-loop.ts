import { useGameStore } from '../../store/index.ts';
import { getThemeTokens } from '../../shared/tokens/theme-manager.ts';
import { isRunning, getWaveformBuffers, getMeterBuffers, getTargetMeterBuffers } from '../../simulation/simulation-controller.ts';
import { GRID_COLS, GRID_ROWS, METER_LEFT_START, METER_RIGHT_START, gridRectToPixels } from '../../shared/grid/index.ts';
import { drawMeter } from '../meters/render-meter.ts';
import type { RenderMeterState } from '../meters/render-meter.ts';
import { METER_GRID_ROWS, METER_GRID_COLS, METERS_PER_SIDE, meterKey } from '../meters/meter-types.ts';
import type { MeterKey } from '../meters/meter-types.ts';
import { renderNodes, renderSelectionHighlight } from './render-nodes.ts';
import { drawWires } from './render-wires.ts';
import { renderConnectionPoints } from './render-connection-points.ts';
import { renderWirePreview } from './render-wire-preview.ts';
import { renderWaveforms } from './render-waveforms.ts';
import { drawGrid } from './render-grid.ts';

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

  function render() {
    if (!running) return;

    // Single getState() + getThemeTokens() per frame
    const state = useGameStore.getState();
    const tokens = getThemeTokens();

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx!.fillStyle = tokens.gameboardSurface;
    ctx!.fillRect(0, 0, width, height);

    // During zoom transition, keep canvas cleared and skip drawing
    // so the snapshot overlay is the only thing visible.
    if (state.zoomTransition) {
      animationId = requestAnimationFrame(render);
      return;
    }

    // Derive logical dimensions from grid cell size
    const cellSize = getCellSize();
    const logicalWidth = GRID_COLS * cellSize;
    const logicalHeight = GRID_ROWS * cellSize;

    // Grid zones and lines (lowest z-order)
    drawGrid(ctx!, tokens, {}, cellSize);

    // Draw meters in side zones
    const meterBuffers = getMeterBuffers();
    const targetMeterBuffers = getTargetMeterBuffers();
    const isSimRunning = isRunning();

    for (let i = 0; i < METERS_PER_SIDE; i++) {
      // Left meters
      const leftKey: MeterKey = meterKey('left', i);
      const leftSlot = state.meterSlots.get(leftKey);
      if (leftSlot) {
        const leftRect = gridRectToPixels({
          col: METER_LEFT_START,
          row: i * METER_GRID_ROWS,
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
        const rightRect = gridRectToPixels({
          col: METER_RIGHT_START,
          row: i * METER_GRID_ROWS,
          cols: METER_GRID_COLS,
          rows: METER_GRID_ROWS,
        }, cellSize);
        const meterState = deriveMeterVisualState(rightSlot, i, 'output', state.perPortMatch, isSimRunning);
        const renderState: RenderMeterState = {
          slot: meterState,
          signalBuffer: meterBuffers.get(`output:${i}`) ?? null,
          targetBuffer: targetMeterBuffers.get(`target:${i}`) ?? null,
        };
        drawMeter(ctx!, tokens, renderState, rightRect);
      }
    }

    // Read simulation state once per frame
    const waveformBuffers = getWaveformBuffers();

    // Draw connection points and waveforms (always visible)
    renderConnectionPoints(ctx!, tokens, {
      activePuzzle: state.activePuzzle,
      perPortMatch: state.perPortMatch,
      isSimRunning,
    }, logicalWidth, logicalHeight);

    renderWaveforms(ctx!, tokens, {
      waveformBuffers,
      activePuzzle: state.activePuzzle,
    }, logicalWidth, logicalHeight);

    if (state.activeBoard) {
      drawWires(ctx!, tokens, state.activeBoard.wires, cellSize);
      renderNodes(ctx!, tokens, {
        puzzleNodes: state.puzzleNodes,
        utilityNodes: state.utilityNodes,
      }, state.activeBoard.nodes, cellSize);

      if (state.selectedNodeId) {
        const selectedNode = state.activeBoard.nodes.get(state.selectedNodeId);
        if (selectedNode) {
          renderSelectionHighlight(ctx!, tokens, selectedNode, cellSize);
        }
      }
    }

    // Wire preview during drawing-wire mode
    if (state.interactionMode.type === 'drawing-wire' && state.mousePosition) {
      renderWirePreview(ctx!, tokens, state.interactionMode.fromPosition, state.mousePosition);
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
