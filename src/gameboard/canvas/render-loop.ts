import { useGameStore } from '../../store/index.ts';
import { COLORS } from '../../shared/constants/index.ts';
import { renderNodes, renderSelectionHighlight } from './render-nodes.ts';
import { renderWires } from './render-wires.ts';
import { renderConnectionPoints } from './render-connection-points.ts';
import { renderWirePreview } from './render-wire-preview.ts';
import { renderWaveforms } from './render-waveforms.ts';

/**
 * Start the requestAnimationFrame render loop.
 * Reads Zustand via getState() each frame — NOT React hooks.
 * Returns a cleanup function to stop the loop.
 */
export function startRenderLoop(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let animationId = 0;
  let running = true;

  function render() {
    if (!running) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx!.fillStyle = COLORS.BACKGROUND;
    ctx!.fillRect(0, 0, width, height);

    // Read state directly from store (not React hooks)
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = width / dpr;
    const logicalHeight = height / dpr;

    const { activeBoard, selectedNodeId, interactionMode, mousePosition } = useGameStore.getState();

    // Draw connection points and waveforms (always visible)
    renderConnectionPoints(ctx!, logicalWidth, logicalHeight);
    renderWaveforms(ctx!, logicalWidth, logicalHeight);

    if (activeBoard) {
      renderWires(ctx!, activeBoard.wires, activeBoard.nodes, logicalWidth, logicalHeight);
      renderNodes(ctx!, activeBoard.nodes);

      if (selectedNodeId) {
        const selectedNode = activeBoard.nodes.get(selectedNodeId);
        if (selectedNode) {
          renderSelectionHighlight(ctx!, selectedNode);
        }
      }
    }

    // Wire preview during drawing-wire mode
    if (interactionMode.type === 'drawing-wire' && mousePosition) {
      renderWirePreview(ctx!, interactionMode.fromPosition, mousePosition);
    }

    animationId = requestAnimationFrame(render);
  }

  animationId = requestAnimationFrame(render);

  return () => {
    running = false;
    cancelAnimationFrame(animationId);
  };
}
