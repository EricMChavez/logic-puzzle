import { useRef, useEffect, useCallback, useState } from 'react';
import { startRenderLoop } from './render-loop.ts';
import { useGameStore } from '../../store/index.ts';
import { hitTest, hitTestMeter } from './hit-testing.ts';
import { getEscapeAction, executeEscapeAction } from '../interaction/escape-handler.ts';
import { getKeyboardAction, executeKeyboardAction } from '../interaction/keyboard-handler.ts';
import { setFocusVisible } from '../interaction/keyboard-focus.ts';
import { generateId } from '../../shared/generate-id.ts';
import { getNodeDefinition, getDefaultParams } from '../../engine/nodes/registry.ts';
import type { PortRef } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import { cpInputId, cpOutputId, creativeSlotId } from '../../puzzle/connection-point-nodes.ts';
import { getDevOverrides } from '../../dev/index.ts';
import {
  GRID_COLS,
  GRID_ROWS,
  MIN_CELL_SIZE,
  PLAYABLE_START,
  PLAYABLE_END,
  computeCellSize,
  computeCenterOffset,
  pixelToGrid,
  setCellSize as setGlobalCellSize,
  getNodeGridSizeFromType,
  canPlaceNode,
  canMoveNode,
} from '../../shared/grid/index.ts';
import { hasEditableParams } from '../../ui/overlays/context-menu-items.ts';

function getCanvasLogicalSize(canvas: HTMLCanvasElement) {
  const cellSize = parseInt(canvas.dataset.cellSize || '0', 10);
  if (cellSize > 0) {
    return { w: GRID_COLS * cellSize, h: GRID_ROWS * cellSize };
  }
  const parent = canvas.parentElement;
  if (!parent) return { w: canvas.width, h: canvas.height };
  return { w: parent.clientWidth, h: parent.clientHeight };
}

/**
 * Determine the valid wire endpoints from a source port click.
 * Output port → needs input port to complete.
 * Input port → needs output port to complete (wire drawn in reverse).
 */
function canCompleteWire(from: PortRef, to: PortRef): boolean {
  // Must connect output → input (in either click order)
  if (from.side === to.side) return false;
  // No self-loops
  if (from.nodeId === to.nodeId) return false;
  return true;
}

function orderWire(from: PortRef, to: PortRef): { output: PortRef; input: PortRef } {
  if (from.side === 'output') return { output: from, input: to };
  return { output: to, input: from };
}

/**
 * Convert a connection-point hit into a PortRef referencing its virtual node.
 * Input CPs expose their output port (side: 'output'), output CPs expose their input port (side: 'input').
 * Returns null if the virtual node doesn't exist on the board.
 *
 * Supports both regular puzzle mode CP nodes (__cp_input_N__, __cp_output_N__)
 * and creative mode slot nodes (__cp_creative_N__).
 */
function connectionPointToPortRef(
  cpSide: 'input' | 'output',
  index: number,
  nodes: ReadonlyMap<string, import('../../shared/types/index.ts').NodeState>,
): PortRef | null {
  // Try regular CP nodes first
  const regularNodeId = cpSide === 'input' ? cpInputId(index) : cpOutputId(index);
  if (nodes.has(regularNodeId)) {
    // Input CPs emit signals → their wireable port is the output side
    // Output CPs receive signals → their wireable port is the input side
    return {
      nodeId: regularNodeId,
      portIndex: 0,
      side: cpSide === 'input' ? 'output' : 'input',
    };
  }

  // Try creative mode slot nodes
  // Left side (cpSide='input') → slots 0-2, Right side (cpSide='output') → slots 3-5
  const slotIndex = cpSide === 'input' ? index : index + 3;
  const creativeNodeId = creativeSlotId(slotIndex);
  if (nodes.has(creativeNodeId)) {
    const node = nodes.get(creativeNodeId)!;
    // Creative slots can be either input or output based on their current type
    // connection-input nodes emit signals (wireable port is output)
    // connection-output nodes receive signals (wireable port is input)
    return {
      nodeId: creativeNodeId,
      portIndex: 0,
      side: node.type === 'connection-input' ? 'output' : 'input',
    };
  }

  return null;
}

// Drag detection constants
const DRAG_THRESHOLD_PX = 5;
const DRAG_DELAY_MS = 150;

export function GameboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellSizeRef = useRef(0);
  const [tooSmall, setTooSmall] = useState(false);

  // Drag detection refs
  const potentialDragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);
  const justDraggedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let resizePending = false;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;

      const dpr = window.devicePixelRatio || 1;
      const viewportW = parent.clientWidth;
      const viewportH = parent.clientHeight;

      // Compute cell size for 16:9 locked grid
      const cellSize = computeCellSize(viewportW, viewportH);
      cellSizeRef.current = cellSize;
      setGlobalCellSize(cellSize);
      canvas!.dataset.cellSize = String(cellSize);

      // Check minimum cell size
      setTooSmall(cellSize < MIN_CELL_SIZE);

      // Gameboard dimensions from grid
      const gbW = GRID_COLS * cellSize;
      const gbH = GRID_ROWS * cellSize;

      // Canvas covers only the gameboard area
      canvas!.width = gbW * dpr;
      canvas!.height = gbH * dpr;
      canvas!.style.width = `${gbW}px`;
      canvas!.style.height = `${gbH}px`;

      // Center canvas in parent (letterbox)
      const offset = computeCenterOffset(viewportW, viewportH, cellSize);
      canvas!.style.left = `${offset.x}px`;
      canvas!.style.top = `${offset.y}px`;

      // Parent background is the letterbox color
      updateParentBackground(parent);

      const ctx = canvas!.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }

    function updateParentBackground(parent: HTMLElement) {
      const devOverrides = getDevOverrides();
      if (devOverrides.enabled) {
        parent.style.backgroundColor = devOverrides.colors.pageBackground;
      } else {
        parent.style.backgroundColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--token-surface-page-background')
          .trim();
      }
    }

    function onResize() {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(() => {
        resizePending = false;
        resize();
      });
    }

    function onDevOverridesChanged() {
      const parent = canvas!.parentElement;
      if (parent) updateParentBackground(parent);
    }

    resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('dev-overrides-changed', onDevOverridesChanged);
    const getCellSize = () => cellSizeRef.current;
    const stopLoop = startRenderLoop(canvas, getCellSize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('dev-overrides-changed', onDevOverridesChanged);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape key: separate handler (escape-handler.ts)
      if (e.key === 'Escape') {
        const state = useGameStore.getState();
        const action = getEscapeAction(state);

        // If zoom-out, capture snapshot for lid-close animation
        if (action === 'zoom-out') {
          const canvas = canvasRef.current;
          if (canvas) {
            const snapshot = new OffscreenCanvas(canvas.width, canvas.height);
            const snapCtx = snapshot.getContext('2d');
            if (snapCtx) {
              snapCtx.drawImage(canvas, 0, 0);
              state.startLidClose(snapshot);
            }
          }
        }

        executeEscapeAction(state, action);
        return;
      }

      // Skip when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const state = useGameStore.getState();
      const kbAction = getKeyboardAction(e.key, e, state);
      if (kbAction.type === 'noop') return;

      e.preventDefault();
      setFocusVisible(true);

      executeKeyboardAction(kbAction, {
        undo: state.undo,
        redo: state.redo,
        openOverlay: state.openOverlay,
        removeNode: state.removeNode,
        removeWire: state.removeWire,
        selectNode: state.selectNode,
        clearSelection: state.clearSelection,
        startKeyboardWiring: state.startKeyboardWiring,
        cycleWiringTarget: state.cycleWiringTarget,
        cancelKeyboardWiring: state.cancelKeyboardWiring,
        setKeyboardGhostPosition: state.setKeyboardGhostPosition,
        rotatePlacement: state.rotatePlacement,
        interactionMode: state.interactionMode,
        activeBoard: state.activeBoard,
        activePuzzle: state.activePuzzle,
        keyboardGhostPosition: state.keyboardGhostPosition,
        onEnterNode: (nodeId: string) => {
          const canvas = canvasRef.current;
          if (canvas) {
            const snapshot = new OffscreenCanvas(canvas.width, canvas.height);
            const snapCtx = snapshot.getContext('2d');
            if (snapCtx) {
              snapCtx.drawImage(canvas, 0, 0);
              state.startLidOpen(snapshot);
            }
          }
          state.zoomIntoNode(nodeId);
        },
        onCompleteWire: (fromPort: PortRef, toPort: PortRef) => {
          if (!state.activeBoard) return;
          const { output, input } = orderWire(fromPort, toPort);
          const duplicate = state.activeBoard.wires.some(
            (w) =>
              w.source.nodeId === output.nodeId &&
              w.source.portIndex === output.portIndex &&
              w.target.nodeId === input.nodeId &&
              w.target.portIndex === input.portIndex,
          );
          if (!duplicate) {
            state.addWire(
              createWire(
                generateId(),
                { ...output, side: 'output' },
                { ...input, side: 'input' },
              ),
            );
          }
        },
        onPlaceNode: (position) => {
          const mode = state.interactionMode;
          if (mode.type !== 'placing-node') return;
          const nodeType = mode.nodeType;
          const rotation = mode.rotation;
          const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);
          const col = Math.max(PLAYABLE_START + 1, Math.min(position.col, PLAYABLE_END - cols));
          const row = Math.max(1, Math.min(position.row, GRID_ROWS - rows - 1));
          if (!canPlaceNode(state.occupancy, col, row, cols, rows)) return;

          if (nodeType.startsWith('puzzle:')) {
            const puzzleId = nodeType.slice('puzzle:'.length);
            const entry = state.puzzleNodes.get(puzzleId);
            if (!entry) return;
            state.addNode({
              id: generateId(), type: nodeType, position: { col, row },
              params: {}, inputCount: entry.inputCount, outputCount: entry.outputCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          } else if (nodeType.startsWith('utility:')) {
            const utilityId = nodeType.slice('utility:'.length);
            const entry = state.utilityNodes.get(utilityId);
            if (!entry) return;
            state.addNode({
              id: generateId(), type: nodeType, position: { col, row },
              params: {}, inputCount: entry.inputCount, outputCount: entry.outputCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          } else {
            const def = getNodeDefinition(nodeType);
            if (!def) return;
            state.addNode({
              id: generateId(), type: def.type, position: { col, row },
              params: getDefaultParams(nodeType), inputCount: def.inputs.length, outputCount: def.outputs.length,
              rotation,
            });
          }
          state.cancelPlacing();
        },
      });
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Skip click if it's the tail end of a drag operation
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (useGameStore.getState().hasActiveOverlay()) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { w, h } = getCanvasLogicalSize(canvas);

    const state = useGameStore.getState();

    // --- Creative mode: check for meter clicks first ---
    if (state.isCreativeMode) {
      const meterHit = hitTestMeter(x, y, cellSizeRef.current, state.meterSlots);
      if (meterHit && meterHit.type === 'meter') {
        state.openOverlay({ type: 'waveform-selector', slotIndex: meterHit.slotIndex });
        return;
      }
    }

    // --- Read-only mode: only allow selection ---
    if (state.activeBoardReadOnly) {
      if (!state.activeBoard) return;
      const hit = hitTest(x, y, state.activeBoard.nodes, w, h, cellSizeRef.current, state.activeBoard.wires, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs);
      if (hit.type === 'node') {
        state.selectNode(hit.nodeId);
      } else {
        state.clearSelection();
      }
      return;
    }

    // --- Placing node mode ---
    if (state.interactionMode.type === 'placing-node') {
      const nodeType = state.interactionMode.nodeType;
      const rotation = state.interactionMode.rotation;
      const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);
      const grid = pixelToGrid(x, y, cellSizeRef.current);
      // Clamp to playable area with 1-cell padding (same logic as placement ghost)
      const col = Math.max(PLAYABLE_START + 1, Math.min(grid.col, PLAYABLE_END - cols));
      const row = Math.max(1, Math.min(grid.row, GRID_ROWS - rows - 1));

      // Validate occupancy before placing
      if (!canPlaceNode(state.occupancy, col, row, cols, rows)) return;

      const position = { col, row };

      // Handle puzzle node placement
      if (nodeType.startsWith('puzzle:')) {
        const puzzleId = nodeType.slice('puzzle:'.length);
        const entry = state.puzzleNodes.get(puzzleId);
        if (!entry) return;

        state.addNode({
          id: generateId(),
          type: nodeType,
          position,
          params: {},
          inputCount: entry.inputCount,
          outputCount: entry.outputCount,
          libraryVersionHash: entry.versionHash,
          rotation,
        });
        state.cancelPlacing();
        return;
      }

      // Handle utility node placement
      if (nodeType.startsWith('utility:')) {
        const utilityId = nodeType.slice('utility:'.length);
        const entry = state.utilityNodes.get(utilityId);
        if (!entry) return;

        state.addNode({
          id: generateId(),
          type: nodeType,
          position,
          params: {},
          inputCount: entry.inputCount,
          outputCount: entry.outputCount,
          libraryVersionHash: entry.versionHash,
          rotation,
        });
        state.cancelPlacing();
        return;
      }

      const def = getNodeDefinition(nodeType);
      if (!def) return;

      state.addNode({
        id: generateId(),
        type: def.type,
        position,
        params: getDefaultParams(nodeType),
        inputCount: def.inputs.length,
        outputCount: def.outputs.length,
        rotation,
      });
      state.cancelPlacing();
      return;
    }

    if (!state.activeBoard) return;
    const hit = hitTest(x, y, state.activeBoard.nodes, w, h, cellSizeRef.current, state.activeBoard.wires, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs);

    // --- Drawing wire mode ---
    if (state.interactionMode.type === 'drawing-wire') {
      const fromPort = state.interactionMode.fromPort;

      // Complete wire to a node port
      if (hit.type === 'port') {
        if (canCompleteWire(fromPort, hit.portRef)) {
          const { output, input } = orderWire(fromPort, hit.portRef);
          // Check for duplicate wire
          const duplicate = state.activeBoard.wires.some(
            (w) =>
              w.source.nodeId === output.nodeId &&
              w.source.portIndex === output.portIndex &&
              w.target.nodeId === input.nodeId &&
              w.target.portIndex === input.portIndex,
          );
          if (!duplicate) {
            state.addWire(
              createWire(
                generateId(),
                { ...output, side: 'output' },
                { ...input, side: 'input' },
              ),
            );
          }
        }
        state.cancelWireDraw();
        return;
      }

      // Complete wire to a connection point
      if (hit.type === 'connection-point') {
        const cpPortRef = connectionPointToPortRef(hit.side, hit.index, state.activeBoard.nodes);
        if (cpPortRef && canCompleteWire(fromPort, cpPortRef)) {
          const { output, input } = orderWire(fromPort, cpPortRef);
          const duplicate = state.activeBoard.wires.some(
            (w) =>
              w.source.nodeId === output.nodeId &&
              w.source.portIndex === output.portIndex &&
              w.target.nodeId === input.nodeId &&
              w.target.portIndex === input.portIndex,
          );
          if (!duplicate) {
            state.addWire(
              createWire(
                generateId(),
                { ...output, side: 'output' },
                { ...input, side: 'input' },
              ),
            );
          }
        }
        state.cancelWireDraw();
        return;
      }

      // Clicked empty space or node body — cancel wire draw
      state.cancelWireDraw();
      return;
    }

    // --- Idle mode ---
    if (hit.type === 'port') {
      state.startWireDraw(hit.portRef, hit.position);
      return;
    }

    // Start wire from connection point
    if (hit.type === 'connection-point') {
      const cpPortRef = connectionPointToPortRef(hit.side, hit.index, state.activeBoard.nodes);
      if (cpPortRef) {
        state.startWireDraw(cpPortRef, hit.position);
      }
      return;
    }

    if (hit.type === 'node') {
      state.selectNode(hit.nodeId);
      if (!state.activeBoardReadOnly) {
        const node = state.activeBoard.nodes.get(hit.nodeId);
        if (node && hasEditableParams(node.type)) {
          state.openOverlay({ type: 'parameter-popover', nodeId: hit.nodeId });
        }
      }
      return;
    }

    state.clearSelection();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (useGameStore.getState().hasActiveOverlay()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = useGameStore.getState();

    if (state.interactionMode.type === 'drawing-wire') {
      state.cancelWireDraw();
      return;
    }

    if (state.activeBoardReadOnly) return;
    if (!state.activeBoard || state.interactionMode.type !== 'idle') return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { w, h } = getCanvasLogicalSize(canvas);
    const hit = hitTest(cx, cy, state.activeBoard.nodes, w, h, cellSizeRef.current, state.activeBoard.wires, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs);

    // Right-click on input port still opens constant value editor
    if (hit.type === 'port' && hit.portRef.side === 'input') {
      state.startEditingPort(hit.portRef.nodeId, hit.portRef.portIndex, hit.position);
      return;
    }

    if (hit.type === 'node') {
      state.openOverlay({
        type: 'context-menu',
        position: { x: e.clientX, y: e.clientY },
        target: { type: 'node', nodeId: hit.nodeId },
      });
      return;
    }

    if (hit.type === 'wire') {
      state.openOverlay({
        type: 'context-menu',
        position: { x: e.clientX, y: e.clientY },
        target: { type: 'wire', wireId: hit.wireId },
      });
      return;
    }

    // Empty space → open palette modal
    state.openOverlay({ type: 'palette-modal' });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (useGameStore.getState().hasActiveOverlay()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = useGameStore.getState();
    if (state.activeBoardReadOnly) return;
    if (state.interactionMode.type !== 'idle') return;
    if (!state.activeBoard) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { w, h } = getCanvasLogicalSize(canvas);

    const hit = hitTest(x, y, state.activeBoard.nodes, w, h, cellSizeRef.current, state.activeBoard.wires, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs);

    // Only start potential drag on node body hit
    if (hit.type === 'node') {
      potentialDragRef.current = {
        nodeId: hit.nodeId,
        startX: x,
        startY: y,
        startTime: Date.now(),
      };
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const state = useGameStore.getState();

    // Handle dragging-node commit
    if (state.interactionMode.type === 'dragging-node') {
      const canvas = canvasRef.current;
      if (!canvas) {
        state.cancelDrag();
        potentialDragRef.current = null;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const { draggedNode, rotation } = state.interactionMode;
      const nodeType = draggedNode.type;
      const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);

      // Snap to grid (1-cell padding for port anchor routability)
      const grid = pixelToGrid(x, y, cellSizeRef.current);
      const col = Math.max(PLAYABLE_START + 1, Math.min(grid.col, PLAYABLE_END - cols));
      const row = Math.max(1, Math.min(grid.row, GRID_ROWS - rows - 1));

      // Check if move is valid
      if (canMoveNode(state.occupancy, draggedNode, col, row, rotation)) {
        state.moveNode(draggedNode.id, { col, row }, rotation);
      }
      state.cancelDrag();
      potentialDragRef.current = null;
      justDraggedRef.current = true;
      return;
    }

    // Clear potential drag reference
    potentialDragRef.current = null;
  }, []);

  // Update handleMouseMove to detect drag start and update drag position
  const handleMouseMoveWithDrag = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setFocusVisible(false);
    if (useGameStore.getState().hasActiveOverlay()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const state = useGameStore.getState();
    state.setMousePosition({ x, y });

    // Check if we should start dragging
    if (potentialDragRef.current && state.interactionMode.type === 'idle') {
      const { nodeId, startX, startY, startTime } = potentialDragRef.current;
      const dx = x - startX;
      const dy = y - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - startTime;

      // Start drag if moved enough or held long enough
      if (distance > DRAG_THRESHOLD_PX || elapsed > DRAG_DELAY_MS) {
        if (!state.activeBoard) return;
        const node = state.activeBoard.nodes.get(nodeId);
        if (node) {
          state.startDragging(node, { x, y });
        }
        potentialDragRef.current = null;
      }
    }

    // Update hover state for node highlighting (skip if dragging)
    if (state.interactionMode.type !== 'dragging-node' && state.activeBoard) {
      const { w, h } = getCanvasLogicalSize(canvas);
      const hit = hitTest(x, y, state.activeBoard.nodes, w, h, cellSizeRef.current, state.activeBoard.wires, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs);
      state.setHoveredNode(hit.type === 'node' ? hit.nodeId : null);
    }
  }, []);

  const cursorStyle = useGameStore((s) => {
    if (s.interactionMode.type === 'placing-node') return 'crosshair';
    if (s.interactionMode.type === 'drawing-wire') return 'crosshair';
    if (s.interactionMode.type === 'keyboard-wiring') return 'crosshair';
    if (s.interactionMode.type === 'dragging-node') return 'grabbing';
    return 'default';
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Gameboard"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveWithDrag}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          cursor: cursorStyle,
          outline: 'none',
        }}
      />
      {tooSmall && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--token-surface-page-background)',
            color: '#e0e0f0',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '18px',
            textAlign: 'center',
            padding: '2rem',
            zIndex: 10,
          }}
        >
          Viewport too small. Please resize your window to at least 1024×576.
        </div>
      )}
    </>
  );
}
