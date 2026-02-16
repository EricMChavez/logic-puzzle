import { useRef, useEffect, useCallback, useState } from 'react';
import { startRenderLoop } from './render-loop.ts';
import { useGameStore } from '../../store/index.ts';
import { hitTest, hitTestMeter, findNearestSnapTarget, WIRE_SNAP_RADIUS_CELLS } from './hit-testing.ts';
import { getEscapeAction, executeEscapeAction } from '../interaction/escape-handler.ts';
import { getKeyboardAction, executeKeyboardAction } from '../interaction/keyboard-handler.ts';
import { setFocusVisible } from '../interaction/keyboard-focus.ts';
import { generateId } from '../../shared/generate-id.ts';
import { getNodeDefinition, getDefaultParams } from '../../engine/nodes/registry.ts';
import type { PortRef } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import { cpInputId, cpOutputId, creativeSlotId, cpBidirectionalId, utilitySlotId } from '../../puzzle/connection-point-nodes.ts';
import { slotToDirectionIndex, buildSlotConfig } from '../../puzzle/types.ts';
import type { SlotConfig } from '../../puzzle/types.ts';
import { slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
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
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { hasEditableParams } from '../../ui/overlays/context-menu-items.ts';
import { rejectKnob } from './rejected-knob.ts';
import { playNodeDrop, playWireDrop, playKnobTic } from '../../shared/audio/index.ts';
import { registerSnapshotCapture, unregisterSnapshotCapture, registerViewportCapture, unregisterViewportCapture, captureViewportSnapshot, captureCropSnapshot } from './snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import { hitTestPlaybackBar, setHoveredPlaybackButton } from './render-playback-bar.ts';
import { navigateFromMenuNode } from './menu-navigation.ts';

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
  if (from.chipId === to.chipId) return false;
  return true;
}

/** Check if a port already has a wire connected to it. */
function isPortOccupied(port: PortRef, wires: ReadonlyArray<import('../../shared/types/index.ts').Wire>): boolean {
  return wires.some((w) =>
    (w.source.chipId === port.chipId && w.source.portIndex === port.portIndex && port.side === 'output') ||
    (w.target.chipId === port.chipId && w.target.portIndex === port.portIndex && port.side === 'input'),
  );
}

function orderWire(from: PortRef, to: PortRef): { output: PortRef; input: PortRef } {
  if (from.side === 'output') return { output: from, input: to };
  return { output: to, input: from };
}

/** Return [source, target] PortRefs ready for createWire(). */
function orderWireArgs(from: PortRef, to: PortRef): [PortRef, PortRef] {
  const { output, input } = orderWire(from, to);
  return [{ ...output, side: 'output' }, { ...input, side: 'input' }];
}

/**
 * Convert a connection-point hit into a PortRef referencing its virtual node.
 * Takes a flat slot index (0-5) and direction directly from the HitResult.
 * Returns null if the virtual node doesn't exist on the board.
 *
 * For bidirectional CPs, the `wireContext` determines which port to use:
 * - 'start': user is starting a wire FROM this CP → use output port
 * - 'end': user is ending a wire AT this CP → use input port
 */
function connectionPointToPortRef(
  slotIndex: number,
  direction: 'input' | 'output',
  nodes: ReadonlyMap<string, import('../../shared/types/index.ts').NodeState>,
  wireContext: 'start' | 'end' = 'start',
  slotConfig?: SlotConfig,
): PortRef | null {
  // Try regular puzzle CP nodes first.
  // Puzzle CPs are named by per-direction index, so convert slot → direction index.
  const dirIndex = slotConfig
    ? slotToDirectionIndex(slotConfig, slotIndex)
    : slotPerSideIndex(slotIndex); // fallback: standard mapping
  if (dirIndex >= 0) {
    const regularNodeId = direction === 'input' ? cpInputId(dirIndex) : cpOutputId(dirIndex);
    if (nodes.has(regularNodeId)) {
      return {
        chipId: regularNodeId,
        portIndex: 0,
        side: direction === 'input' ? 'output' : 'input',
      };
    }
  }

  // Try utility slot nodes (slot index used directly)
  const utilNodeId = utilitySlotId(slotIndex);
  if (nodes.has(utilNodeId)) {
    const node = nodes.get(utilNodeId)!;
    return {
      chipId: utilNodeId,
      portIndex: 0,
      side: node.type === 'connection-input' ? 'output' : 'input',
    };
  }

  // Try bidirectional CP nodes (legacy utility editing, slot index used directly)
  const bidirNodeId = cpBidirectionalId(slotIndex);
  if (nodes.has(bidirNodeId)) {
    return {
      chipId: bidirNodeId,
      portIndex: 0,
      side: wireContext === 'start' ? 'output' : 'input',
    };
  }

  // Try creative mode slot nodes (slot index used directly)
  const creativeNodeId = creativeSlotId(slotIndex);
  if (nodes.has(creativeNodeId)) {
    const node = nodes.get(creativeNodeId)!;
    return {
      chipId: creativeNodeId,
      portIndex: 0,
      side: node.type === 'connection-input' ? 'output' : 'input',
    };
  }

  return null;
}

/**
 * Attempt to snap-complete a wire to the nearest valid port/connection-point
 * within WIRE_SNAP_RADIUS_CELLS. Returns true if a wire was created.
 */
function trySnapComplete(
  x: number,
  y: number,
  fromPort: PortRef,
  state: ReturnType<typeof useGameStore.getState>,
  cellSize: number,
): boolean {
  if (!state.activeBoard) return false;
  const maxRadiusPx = WIRE_SNAP_RADIUS_CELLS * cellSize;
  const snapHit = findNearestSnapTarget(
    x, y, maxRadiusPx,
    state.activeBoard.chips, cellSize,
    state.activePuzzle?.slotConfig,
    state.activePuzzle?.activeInputs,
    state.activePuzzle?.activeOutputs,
    state.meterSlots,
    (hit) => {
      if (hit.type === 'port') {
        return canCompleteWire(fromPort, hit.portRef) && !isPortOccupied(hit.portRef, state.activeBoard!.paths);
      }
      if (hit.type === 'connection-point') {
        const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard!.chips, 'end', state.activePuzzle?.slotConfig);
        return !!cpPortRef && canCompleteWire(fromPort, cpPortRef) && !isPortOccupied(cpPortRef, state.activeBoard!.paths);
      }
      return false;
    },
  );
  if (!snapHit) return false;

  if (snapHit.type === 'port') {
    state.addWire(createWire(generateId(), ...orderWireArgs(fromPort, snapHit.portRef)));
    return true;
  }
  if (snapHit.type === 'connection-point') {
    const cpPortRef = connectionPointToPortRef(snapHit.slotIndex, snapHit.direction, state.activeBoard.chips, 'end', state.activePuzzle?.slotConfig);
    if (cpPortRef) {
      state.addWire(createWire(generateId(), ...orderWireArgs(fromPort, cpPortRef)));
      return true;
    }
  }
  return false;
}

/**
 * Create a snapshot of just the grid area from a viewport-sized canvas.
 * The canvas includes margin area; this crops to the grid content.
 */
function createGridSnapshot(
  canvas: HTMLCanvasElement,
  offset: { x: number; y: number },
  cellSize: number,
): OffscreenCanvas | null {
  const dpr = window.devicePixelRatio || 1;
  const gridW = GRID_COLS * cellSize;
  const gridH = GRID_ROWS * cellSize;
  const bitmapX = Math.round(offset.x * dpr);
  const bitmapY = Math.round(offset.y * dpr);
  const bitmapW = Math.round(gridW * dpr);
  const bitmapH = Math.round(gridH * dpr);
  if (bitmapW <= 0 || bitmapH <= 0) return null;
  const snapshot = new OffscreenCanvas(bitmapW, bitmapH);
  const snapCtx = snapshot.getContext('2d');
  if (!snapCtx) return null;
  snapCtx.drawImage(canvas, bitmapX, bitmapY, bitmapW, bitmapH, 0, 0, bitmapW, bitmapH);
  return snapshot;
}

// Drag detection constants
const DRAG_THRESHOLD_PX = 5;
const DRAG_DELAY_MS = 150;

export function GameboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellSizeRef = useRef(0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [tooSmall, setTooSmall] = useState(false);

  // Hit test cache: skip hitTest when cursor stays in the same grid cell
  const hitCacheRef = useRef<{
    col: number;
    row: number;
    hoveredNodeId: string | null;
    nodesRef: ReadonlyMap<string, import('../../shared/types/index.ts').NodeState> | null;
    wiresRef: ReadonlyArray<import('../../shared/types/index.ts').Wire> | null;
  }>({ col: -1, row: -1, hoveredNodeId: null, nodesRef: null, wiresRef: null });

  // Drag detection refs
  const potentialDragRef = useRef<{
    chipId: string;
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);
  const justDraggedRef = useRef(false);

  // Wire drag tracking refs
  const potentialWireDragRef = useRef<{ portRef: PortRef; position: { x: number; y: number }; startX: number; startY: number } | null>(null);
  const wireDragActiveRef = useRef(false);

  // Knob drag: track last snapped value to play tic only on change
  const lastKnobValueRef = useRef<number | null>(null);

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

      // Canvas covers full viewport so page streak extends into margins
      canvas!.width = viewportW * dpr;
      canvas!.height = viewportH * dpr;
      canvas!.style.width = `${viewportW}px`;
      canvas!.style.height = `${viewportH}px`;
      canvas!.style.left = '0px';
      canvas!.style.top = '0px';

      // Grid offset within the viewport-sized canvas
      const offset = computeCenterOffset(viewportW, viewportH, cellSize);
      offsetRef.current = offset;

      // Parent background as fallback (canvas covers it in normal operation)
      updateParentBackground(parent);

      const ctx = canvas!.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }

    function updateParentBackground(parent: HTMLElement) {
      const devOverrides = getDevOverrides();
      if (devOverrides.enabled) {
        parent.style.background = devOverrides.colors.pageBackground;
      } else {
        parent.style.background = '#0d0f14';
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
    const getOffset = () => offsetRef.current;
    const stopLoop = startRenderLoop(canvas, getCellSize, getOffset);

    // Register snapshot capture for the VictoryCompleteButton
    registerSnapshotCapture(() =>
      createGridSnapshot(canvas, offsetRef.current, cellSizeRef.current),
    );

    // Register viewport capture for zoom transitions (full viewport including margins)
    registerViewportCapture(() => {
      const snapshot = new OffscreenCanvas(canvas.width, canvas.height);
      const snapCtx = snapshot.getContext('2d');
      if (!snapCtx) return null;
      snapCtx.drawImage(canvas, 0, 0);
      return snapshot;
    });

    return () => {
      stopLoop();
      unregisterSnapshotCapture();
      unregisterViewportCapture();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('dev-overrides-changed', onDevOverridesChanged);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape key: toggles main menu (escape-handler.ts)
      if (e.key === 'Escape') {
        const state = useGameStore.getState();
        const escState: import('../interaction/escape-handler.ts').EscapeHandlerState = {
          activeScreen: state.activeScreen,
          revealScreen: state.revealScreen,
          dismissScreen: state.dismissScreen,
          hasActiveOverlay: state.hasActiveOverlay,
          isOverlayEscapeDismissible: state.isOverlayEscapeDismissible,
          closeOverlay: state.closeOverlay,
          interactionMode: state.interactionMode,
          cancelWireDraw: state.cancelWireDraw,
          cancelPlacing: state.cancelPlacing,
          cancelKeyboardWiring: state.cancelKeyboardWiring,
          commitKnobAdjust: state.commitKnobAdjust,
          selectedNodeId: state.selectedNodeId,
          clearSelection: state.clearSelection,
          zoomTransitionType: state.zoomTransitionState.type,
          ceremonyType: state.ceremonyState.type,
        };
        const action = getEscapeAction(escState);
        executeEscapeAction(escState, action);
        return;
      }

      // Skip when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const state = useGameStore.getState();
      // Block all keyboard actions during ceremony overlay
      if (state.ceremonyActive) return;
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
        onEnterNode: (chipId: string) => {
          if (state.zoomTransitionState.type !== 'idle') return;
          if (state.activeBoard) {
            const node = state.activeBoard.chips.get(chipId);
            if (node) {
              const snapshot = captureViewportSnapshot();
              if (snapshot) {
                const { cols, rows } = getNodeGridSize(node);
                const targetRect = { col: node.position.col, row: node.position.row, cols, rows };
                const crop = captureCropSnapshot(chipId, targetRect) ?? undefined;
                state.startZoomCapture(snapshot, targetRect, 'in', crop);
              }
            }
          }
          state.zoomIntoNode(chipId);
        },
        onCompleteWire: (fromPort: PortRef, toPort: PortRef) => {
          if (!state.activeBoard) return;
          if (isPortOccupied(toPort, state.activeBoard.paths)) return;
          state.addWire(
            createWire(
              generateId(),
              ...orderWireArgs(fromPort, toPort),
            ),
          );
          playWireDrop();
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

          if (nodeType === 'custom-blank') {
            state.addNode({
              id: generateId(), type: 'custom-blank', position: { col, row },
              params: {}, inputCount: 0, outputCount: 0, rotation,
            });
          } else if (nodeType.startsWith('puzzle:')) {
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
              params: { ...(entry.cpLayout ? { cpLayout: entry.cpLayout } : {}) },
              inputCount: entry.inputCount, outputCount: entry.outputCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          } else {
            const def = getNodeDefinition(nodeType);
            if (!def) return;
            const kbNodeId = generateId();
            const kbParams = getDefaultParams(nodeType);
            state.addNode({
              id: kbNodeId, type: def.type, position: { col, row },
              params: kbParams, inputCount: def.inputs.length, outputCount: def.outputs.length,
              rotation,
            });
            const kbKnobConfig = getKnobConfig(getNodeDefinition(nodeType));
            if (kbKnobConfig) {
              state.setPortConstant(kbNodeId, kbKnobConfig.portIndex, Number(kbParams[kbKnobConfig.paramKey] ?? 0));
            }
          }
          playNodeDrop();
          state.cancelPlacing();
        },
        togglePlayMode: state.togglePlayMode,
        stepPlaypoint: state.stepPlaypoint,
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
    const clickState = useGameStore.getState();
    if (clickState.hasActiveOverlay() || clickState.ceremonyActive) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetRef.current.x;
    const y = e.clientY - rect.top - offsetRef.current.y;
    const { w, h } = getCanvasLogicalSize(canvas);

    const state = useGameStore.getState();

    // --- Playback bar: check before all other hit tests ---
    if (!state.activeBoardReadOnly) {
      const pbHit = hitTestPlaybackBar(x, y, cellSizeRef.current, state.playMode);
      if (pbHit) {
        if (pbHit.button === 'play-pause') state.togglePlayMode();
        else if (pbHit.button === 'prev') state.stepPlaypoint(-1);
        else if (pbHit.button === 'next') state.stepPlaypoint(1);
        return;
      }
    }

    // --- Utility editing / Creative mode: check for meter clicks first ---
    if (state.editingUtilityId || state.isCreativeMode) {
      const meterHit = hitTestMeter(x, y, cellSizeRef.current, state.meterSlots);
      if (meterHit && meterHit.type === 'meter') {
        if (state.editingUtilityId) {
          // Utility editing: toggle CP direction (takes priority over creative mode)
          state.toggleMeterMode(meterHit.slotIndex);
        } else {
          state.openOverlay({ type: 'waveform-selector', slotIndex: meterHit.slotIndex });
        }
        return;
      }
    }

    // --- Read-only mode: allow selection + menu node navigation ---
    if (state.activeBoardReadOnly) {
      if (!state.activeBoard) return;
      const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);
      if (hit.type === 'node') {
        const node = state.activeBoard.chips.get(hit.chipId);
        if (node && node.type.startsWith('menu:')) {
          navigateFromMenuNode(node);
          return;
        }
        state.selectNode(hit.chipId);
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
      // Center node on cursor, then clamp to playable area with 1-cell padding
      const col = Math.max(PLAYABLE_START + 1, Math.min(grid.col - Math.floor(cols / 2), PLAYABLE_END - cols));
      const row = Math.max(1, Math.min(grid.row - Math.floor(rows / 2), GRID_ROWS - rows - 1));

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
        playNodeDrop();
        state.cancelPlacing();
        return;
      }

      // Handle custom-blank node placement
      if (nodeType === 'custom-blank') {
        state.addNode({
          id: generateId(),
          type: 'custom-blank',
          position,
          params: {},
          inputCount: 0,
          outputCount: 0,
          rotation,
        });
        playNodeDrop();
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
          params: { ...(entry.cpLayout ? { cpLayout: entry.cpLayout } : {}) },
          inputCount: entry.inputCount,
          outputCount: entry.outputCount,
          libraryVersionHash: entry.versionHash,
          rotation,
        });
        playNodeDrop();
        state.cancelPlacing();
        return;
      }

      const def = getNodeDefinition(nodeType);
      if (!def) return;

      const chipId = generateId();
      const params = getDefaultParams(nodeType);
      state.addNode({
        id: chipId,
        type: def.type,
        position,
        params,
        inputCount: def.inputs.length,
        outputCount: def.outputs.length,
        rotation,
      });
      // Set initial port constant for knob input to match param
      const clickKnobConfig = getKnobConfig(getNodeDefinition(nodeType));
      if (clickKnobConfig) {
        state.setPortConstant(chipId, clickKnobConfig.portIndex, Number(params[clickKnobConfig.paramKey] ?? 0));
      }
      playNodeDrop();
      state.cancelPlacing();
      return;
    }

    if (!state.activeBoard) return;
    const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);

    // --- Drawing wire mode ---
    if (state.interactionMode.type === 'drawing-wire') {
      const fromPort = state.interactionMode.fromPort;

      // Complete wire to a node port
      if (hit.type === 'port') {
        if (canCompleteWire(fromPort, hit.portRef) && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
          state.addWire(
            createWire(
              generateId(),
              ...orderWireArgs(fromPort, hit.portRef),
            ),
          );
          playWireDrop();
        }
        state.cancelWireDraw();
        return;
      }

      // Complete wire to a connection point
      if (hit.type === 'connection-point') {
        const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'end', state.activePuzzle?.slotConfig);
        if (cpPortRef && canCompleteWire(fromPort, cpPortRef) && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
          state.addWire(
            createWire(
              generateId(),
              ...orderWireArgs(fromPort, cpPortRef),
            ),
          );
          playWireDrop();
        }
        state.cancelWireDraw();
        return;
      }

      // Clicked empty space or node body — try snap before cancelling
      if (trySnapComplete(x, y, fromPort, state, cellSizeRef.current)) {
        playWireDrop();
      }
      state.cancelWireDraw();
      return;
    }

    // --- Idle mode ---
    // Only output ports can start a wire
    if (hit.type === 'port') {
      if (hit.portRef.side === 'output' && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
        state.startWireDraw(hit.portRef, hit.position);
      }
      return;
    }

    // Start wire from connection point (only output-emitting CPs)
    if (hit.type === 'connection-point') {
      const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'start', state.activePuzzle?.slotConfig);
      if (cpPortRef && cpPortRef.side === 'output' && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
        state.startWireDraw(cpPortRef, hit.position);
      }
      return;
    }

    if (hit.type === 'knob') {
      // Knob click in idle mode (wired knob) — just select the node
      state.selectNode(hit.chipId);
      return;
    }

    if (hit.type === 'node') {
      state.selectNode(hit.chipId);
      if (!state.activeBoardReadOnly) {
        const node = state.activeBoard.chips.get(hit.chipId);
        // Don't auto-open parameter popover for knob nodes (knob is the primary control)
        if (node && !getKnobConfig(getNodeDefinition(node.type)) && hasEditableParams(node.type)) {
          state.openOverlay({ type: 'parameter-popover', chipId: hit.chipId });
        }
      }
      return;
    }

    state.clearSelection();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctxState = useGameStore.getState();
    if (ctxState.hasActiveOverlay() || ctxState.ceremonyActive) return;
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
    const cx = e.clientX - rect.left - offsetRef.current.x;
    const cy = e.clientY - rect.top - offsetRef.current.y;

    // No context menu on playback bar
    if (hitTestPlaybackBar(cx, cy, cellSizeRef.current, state.playMode)) return;

    const { w, h } = getCanvasLogicalSize(canvas);
    const hit = hitTest(cx, cy, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);

    if (hit.type === 'node') {
      const node = state.activeBoard.chips.get(hit.chipId);
      state.openOverlay({
        type: 'context-menu',
        position: { x: e.clientX, y: e.clientY },
        target: { type: 'node', chipId: hit.chipId, locked: node?.locked },
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
    const mdState = useGameStore.getState();
    if (mdState.hasActiveOverlay() || mdState.ceremonyActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = useGameStore.getState();
    if (state.activeBoardReadOnly) return;
    if (state.interactionMode.type !== 'idle') return;
    if (!state.activeBoard) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetRef.current.x;
    const y = e.clientY - rect.top - offsetRef.current.y;
    const { w, h } = getCanvasLogicalSize(canvas);

    // Check playback bar first (prevent drag initiation on bar)
    if (hitTestPlaybackBar(x, y, cellSizeRef.current, state.playMode)) return;

    const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);

    // Start potential wire drag from output port
    if (hit.type === 'port' && hit.portRef.side === 'output' && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
      potentialWireDragRef.current = { portRef: hit.portRef, position: hit.position, startX: x, startY: y };
      return;
    }

    // Start potential wire drag from output-emitting CP
    if (hit.type === 'connection-point') {
      const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'start', state.activePuzzle?.slotConfig);
      if (cpPortRef && cpPortRef.side === 'output' && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
        potentialWireDragRef.current = { portRef: cpPortRef, position: hit.position, startX: x, startY: y };
        return;
      }
    }

    // Start knob adjust on knob hit (when knob port is unwired)
    if (hit.type === 'knob') {
      const node = state.activeBoard.chips.get(hit.chipId);
      if (node) {
        const knobConfig = getKnobConfig(getNodeDefinition(node.type));
        if (knobConfig) {
          const isXWired = state.activeBoard.paths.some(
            w => w.target.chipId === node.id && w.target.portIndex === knobConfig.portIndex,
          );
          if (!isXWired) {
            const currentValue = Number(node.params[knobConfig.paramKey] ?? 0);
            lastKnobValueRef.current = currentValue;
            state.startKnobAdjust(hit.chipId, y, currentValue);
            return;
          }
          // Wired knob clicked — flash error overlay
          rejectKnob(hit.chipId);
        }
      }
    }

    // Only start potential drag on node body hit
    if (hit.type === 'node') {
      potentialDragRef.current = {
        chipId: hit.chipId,
        startX: x,
        startY: y,
        startTime: Date.now(),
      };
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const state = useGameStore.getState();

    // Handle wire drag complete
    if (wireDragActiveRef.current && state.interactionMode.type === 'drawing-wire') {
      const canvas = canvasRef.current;
      if (canvas && state.activeBoard) {
        const rect = canvas.getBoundingClientRect();
        const ux = e.clientX - rect.left - offsetRef.current.x;
        const uy = e.clientY - rect.top - offsetRef.current.y;
        const { w, h } = getCanvasLogicalSize(canvas);
        const hit = hitTest(ux, uy, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);
        const fromPort = state.interactionMode.fromPort;

        if (hit.type === 'port' && canCompleteWire(fromPort, hit.portRef) && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
          state.addWire(createWire(generateId(), ...orderWireArgs(fromPort, hit.portRef)));
          playWireDrop();
        } else if (hit.type === 'connection-point') {
          const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'end', state.activePuzzle?.slotConfig);
          if (cpPortRef && canCompleteWire(fromPort, cpPortRef) && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
            state.addWire(createWire(generateId(), ...orderWireArgs(fromPort, cpPortRef)));
            playWireDrop();
          }
        } else {
          // No direct hit — try snap to nearest valid target
          if (trySnapComplete(ux, uy, fromPort, state, cellSizeRef.current)) {
            playWireDrop();
          }
        }
        state.cancelWireDraw();
      }
      wireDragActiveRef.current = false;
      justDraggedRef.current = true;
      potentialWireDragRef.current = null;
      return;
    }

    // Clear potential wire drag on mouseup (no drag happened — let click handle it)
    if (potentialWireDragRef.current) {
      potentialWireDragRef.current = null;
    }

    // Handle knob adjust commit
    if (state.interactionMode.type === 'adjusting-knob') {
      const { chipId, startY, startValue } = state.interactionMode;
      const canvas = canvasRef.current;
      if (canvas) {
        const node = state.activeBoard?.chips.get(chipId);
        const knobConfig = node ? getKnobConfig(getNodeDefinition(node.type)) : null;
        if (knobConfig) {
          const rect = canvas.getBoundingClientRect();
          const y = e.clientY - rect.top - offsetRef.current.y;
          const deltaY = startY - y; // Up = positive
          const sensitivity = 32; // pixels per 50-unit step
          const rawDelta = (deltaY / sensitivity) * 50;
          const newValue = Math.round((startValue + rawDelta) / 50) * 50;
          const clampedValue = Math.max(-100, Math.min(100, newValue));
          state.batchKnobAdjust(chipId, knobConfig.paramKey, knobConfig.portIndex, clampedValue);
        }
      }
      state.commitKnobAdjust();
      lastKnobValueRef.current = null;
      justDraggedRef.current = true;
      return;
    }

    // Handle dragging-node commit
    if (state.interactionMode.type === 'dragging-node') {
      const canvas = canvasRef.current;
      if (!canvas) {
        state.cancelDrag();
        potentialDragRef.current = null;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetRef.current.x;
      const y = e.clientY - rect.top - offsetRef.current.y;

      const { draggedNode, grabOffset, rotation } = state.interactionMode;
      const nodeType = draggedNode.type;
      const { cols, rows } = getNodeGridSizeFromType(nodeType, state.puzzleNodes, state.utilityNodes, rotation);

      // Snap to grid, subtract grab offset so node stays under cursor
      const grid = pixelToGrid(x, y, cellSizeRef.current);
      const col = Math.max(PLAYABLE_START + 1, Math.min(grid.col - grabOffset.col, PLAYABLE_END - cols));
      const row = Math.max(1, Math.min(grid.row - grabOffset.row, GRID_ROWS - rows - 1));

      // Check if move is valid
      if (canMoveNode(state.occupancy, draggedNode, col, row, rotation)) {
        state.moveNode(draggedNode.id, { col, row }, rotation);
        playNodeDrop();
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
    const mmState = useGameStore.getState();
    if (mmState.hasActiveOverlay() || mmState.ceremonyActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetRef.current.x;
    const y = e.clientY - rect.top - offsetRef.current.y;
    const state = useGameStore.getState();
    state.setMousePosition({ x, y });

    // Handle knob adjustment drag (live update)
    if (state.interactionMode.type === 'adjusting-knob') {
      const { chipId, startY, startValue } = state.interactionMode;
      const node = state.activeBoard?.chips.get(chipId);
      const knobConfig = node ? getKnobConfig(getNodeDefinition(node.type)) : null;
      if (knobConfig) {
        const deltaY = startY - y;
        const sensitivity = 32; // pixels per 50-unit step
        const rawDelta = (deltaY / sensitivity) * 50;
        const newValue = Math.round((startValue + rawDelta) / 50) * 50;
        const clampedValue = Math.max(-100, Math.min(100, newValue));
        if (lastKnobValueRef.current !== clampedValue) {
          lastKnobValueRef.current = clampedValue;
          playKnobTic();
        }
        state.batchKnobAdjust(chipId, knobConfig.paramKey, knobConfig.portIndex, clampedValue);
      }
      return;
    }

    // Check if we should start wire drag
    if (potentialWireDragRef.current && state.interactionMode.type === 'idle') {
      const { startX, startY } = potentialWireDragRef.current;
      const dx = x - startX;
      const dy = y - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > DRAG_THRESHOLD_PX) {
        state.startWireDraw(potentialWireDragRef.current.portRef, potentialWireDragRef.current.position);
        potentialWireDragRef.current = null;
        wireDragActiveRef.current = true;
      }
    }

    // Check if we should start dragging
    if (potentialDragRef.current && state.interactionMode.type === 'idle') {
      const { chipId, startX, startY, startTime } = potentialDragRef.current;
      const dx = x - startX;
      const dy = y - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - startTime;

      // Start drag if moved enough or held long enough
      if (distance > DRAG_THRESHOLD_PX || elapsed > DRAG_DELAY_MS) {
        if (!state.activeBoard) return;
        const node = state.activeBoard.chips.get(chipId);
        if (node) {
          const grid = pixelToGrid(x, y, cellSizeRef.current);
          const grabOffset = { col: grid.col - node.position.col, row: grid.row - node.position.row };
          state.startDragging(node, grabOffset);
        }
        potentialDragRef.current = null;
      }
    }

    // Update playback bar hover state and cursor
    const pbHover = hitTestPlaybackBar(x, y, cellSizeRef.current, useGameStore.getState().playMode);
    setHoveredPlaybackButton(pbHover?.button ?? null);
    if (canvas && state.interactionMode.type === 'idle') {
      canvas.style.cursor = pbHover ? 'pointer' : 'default';
    }

    // Update hover state for node highlighting (skip if dragging)
    if (state.interactionMode.type !== 'dragging-node' && state.activeBoard) {
      // Cache: skip hitTest if cursor is in the same grid cell with same board refs
      const gridCell = pixelToGrid(x, y, cellSizeRef.current);
      const cache = hitCacheRef.current;
      if (
        gridCell.col === cache.col &&
        gridCell.row === cache.row &&
        state.activeBoard.chips === cache.nodesRef &&
        state.activeBoard.paths === cache.wiresRef
      ) {
        // Same cell, same board — reuse cached hover result
        if (cache.hoveredNodeId !== state.hoveredNodeId) {
          state.setHoveredNode(cache.hoveredNodeId);
        }
      } else {
        const { w, h } = getCanvasLogicalSize(canvas);
        const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);
        const newHovered = hit.type === 'node' ? hit.chipId : null;
        cache.col = gridCell.col;
        cache.row = gridCell.row;
        cache.hoveredNodeId = newHovered;
        cache.nodesRef = state.activeBoard.chips;
        cache.wiresRef = state.activeBoard.paths;
        if (newHovered !== state.hoveredNodeId) {
          state.setHoveredNode(newHovered);
        }
      }
    }
  }, []);

  const cursorStyle = useGameStore((s) => {
    if (s.interactionMode.type === 'placing-node') return 'crosshair';
    if (s.interactionMode.type === 'drawing-wire') return 'crosshair';
    if (s.interactionMode.type === 'keyboard-wiring') return 'crosshair';
    if (s.interactionMode.type === 'dragging-node') return 'grabbing';
    if (s.interactionMode.type === 'adjusting-knob') return 'ns-resize';
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
