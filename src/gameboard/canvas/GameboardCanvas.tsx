import { useRef, useEffect, useCallback, useState } from 'react';
import { startRenderLoop } from './render-loop.ts';
import { useGameStore } from '../../store/index.ts';
import { hitTest, hitTestMeter, findNearestSnapTarget, WIRE_SNAP_RADIUS_CELLS } from './hit-testing.ts';
import { getEscapeAction, executeEscapeAction } from '../interaction/escape-handler.ts';
import { getKeyboardAction, executeKeyboardAction } from '../interaction/keyboard-handler.ts';
import { setFocusVisible } from '../interaction/keyboard-focus.ts';
import { generateId } from '../../shared/generate-id.ts';
import { getChipDefinition, getDefaultParams } from '../../engine/nodes/registry.ts';
import type { PortRef } from '../../shared/types/index.ts';
import { createPath } from '../../shared/types/index.ts';
import { cpInputId, cpOutputId, creativeSlotId, cpBidirectionalId, utilitySlotId } from '../../puzzle/connection-point-nodes.ts';
import { slotToDirectionIndex } from '../../puzzle/types.ts';
import type { SlotConfig } from '../../puzzle/types.ts';
import { slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
import { bakeGraph } from '../../engine/baking/index.ts';
import { getDevOverrides } from '../../dev/index.ts';
import {
  GRID_COLS,
  GRID_ROWS,
  MIN_CELL_SIZE,
  computeCellSize,
  computeCenterOffset,
  pixelToGrid,
  setCellSize as setGlobalCellSize,
  getNodeGridSizeFromType,
  canPlaceNode,
  canMoveNode,
  getPlayableBounds,
} from '../../shared/grid/index.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { hasEditableParams } from '../../ui/overlays/context-menu-items.ts';
import { rejectKnob } from './rejected-knob.ts';
import { radialAngleToValue } from './render-knob.ts';
import { getKnobMode } from '../../shared/settings/knob-mode.ts';
import { playNodeDrop, playWireDrop, playKnobTic } from '../../shared/audio/index.ts';
import { registerSnapshotCapture, unregisterSnapshotCapture, registerViewportCapture, unregisterViewportCapture, captureViewportSnapshot, captureCropSnapshot } from './snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import { hitTestPlaybackBar, setHoveredPlaybackButton, setPressedPlaybackButton } from './render-playback-bar.ts';
import { hitTestBackButton, setHoveredBackButton } from './render-back-button.ts';
import { hitTestRecordButton, setHoveredRecordButton, isRecordButtonDisabled } from './render-record-button.ts';
import { hitTestPagination } from './render-motherboard-sections.ts';
import { navigateFromMenuNode } from './menu-navigation.ts';
import { createMotherboard } from '../../store/motherboard.ts';
import { isTutorialPaletteBlocked } from '../../tutorial/tutorial-input-guard.ts';
import { getNextButtonRect } from './render-tutorial-overlay.ts';
import {
  hitTestChipDrawer, hitTestDeleteZone, hitTestDeleteTrigger,
  getDrawerProgress, isDrawerOpen, openDrawer, closeDrawer,
  setHoveredChipIndex, setHandleHovered, getDrawerState,
  isKeyboardNavigationActive,
  getScrollOffset, setScrollOffset, getMaxScrollOffset,
  isDrawerVisible,
  getTrayRect,
  isDeleteMode, setDeleteMode,
} from './render-chip-drawer.ts';
import { buildPaletteItems, computeRemainingBudgets } from '../../ui/overlays/palette-items.ts';

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

/** Check if a port already has a path connected to it. */
function isPortOccupied(port: PortRef, paths: ReadonlyArray<import('../../shared/types/index.ts').Path>): boolean {
  return paths.some((p) =>
    (p.source.chipId === port.chipId && p.source.portIndex === port.portIndex && port.side === 'plug') ||
    (p.target.chipId === port.chipId && p.target.portIndex === port.portIndex && port.side === 'socket'),
  );
}

function orderPath(from: PortRef, to: PortRef): { plug: PortRef; socket: PortRef } {
  if (from.side === 'plug') return { plug: from, socket: to };
  return { plug: to, socket: from };
}

/** Return [source, target] PortRefs ready for createPath(). */
function orderPathArgs(from: PortRef, to: PortRef): [PortRef, PortRef] {
  const { plug, socket } = orderPath(from, to);
  return [{ ...plug, side: 'plug' }, { ...socket, side: 'socket' }];
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
  chips: ReadonlyMap<string, import('../../shared/types/index.ts').ChipState>,
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
    if (chips.has(regularNodeId)) {
      return {
        chipId: regularNodeId,
        portIndex: 0,
        side: direction === 'input' ? 'plug' : 'socket',
      };
    }
  }

  // Try utility slot nodes (slot index used directly)
  const utilNodeId = utilitySlotId(slotIndex);
  if (chips.has(utilNodeId)) {
    const chip = chips.get(utilNodeId)!;
    return {
      chipId: utilNodeId,
      portIndex: 0,
      side: chip.type === 'connection-input' ? 'plug' : 'socket',
    };
  }

  // Try bidirectional CP nodes (legacy utility editing, slot index used directly)
  const bidirNodeId = cpBidirectionalId(slotIndex);
  if (chips.has(bidirNodeId)) {
    return {
      chipId: bidirNodeId,
      portIndex: 0,
      side: wireContext === 'start' ? 'plug' : 'socket',
    };
  }

  // Try creative mode slot nodes (slot index used directly)
  const creativeNodeId = creativeSlotId(slotIndex);
  if (chips.has(creativeNodeId)) {
    const chip = chips.get(creativeNodeId)!;
    return {
      chipId: creativeNodeId,
      portIndex: 0,
      side: chip.type === 'connection-input' ? 'plug' : 'socket',
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
    state.addPath(createPath(generateId(), ...orderPathArgs(fromPort, snapHit.portRef)));
    return true;
  }
  if (snapHit.type === 'connection-point') {
    const cpPortRef = connectionPointToPortRef(snapHit.slotIndex, snapHit.direction, state.activeBoard.chips, 'end', state.activePuzzle?.slotConfig);
    if (cpPortRef) {
      state.addPath(createPath(generateId(), ...orderPathArgs(fromPort, cpPortRef)));
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
    hoveredChipId: string | null;
    chipsRef: ReadonlyMap<string, import('../../shared/types/index.ts').ChipState> | null;
    pathsRef: ReadonlyArray<import('../../shared/types/index.ts').Path> | null;
  }>({ col: -1, row: -1, hoveredChipId: null, chipsRef: null, pathsRef: null });

  // Drag detection refs
  const potentialDragRef = useRef<{
    chipId: string;
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);
  const justDraggedRef = useRef(false);

  // Path drag tracking refs
  const potentialPathDragRef = useRef<{ portRef: PortRef; position: { x: number; y: number }; startX: number; startY: number } | null>(null);
  const pathDragActiveRef = useRef(false);

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
          revealScreen: () => {
            if (state.isCreativeMode && state.activeBoardId === 'motherboard') state.exitCreativeMode();
            state.revealScreen();
          },
          dismissScreen: state.dismissScreen,
          hasActiveOverlay: state.hasActiveOverlay,
          isOverlayEscapeDismissible: state.isOverlayEscapeDismissible,
          closeOverlay: state.closeOverlay,
          interactionMode: state.interactionMode,
          cancelPathDraw: state.cancelPathDraw,
          cancelPlacing: state.cancelPlacing,
          cancelKeyboardWiring: state.cancelKeyboardWiring,
          commitKnobAdjust: state.commitKnobAdjust,
          selectedChipId: state.selectedChipId,
          clearSelection: state.clearSelection,
          zoomTransitionType: state.zoomTransitionState.type,
          isTutorialActive: state.isTutorialActive(),
          endTutorial: state.endTutorial,
          isDrawerOpen: isDrawerOpen(),
        };
        const action = getEscapeAction(escState);
        if (action === 'close-drawer') {
          closeDrawer();
        } else {
          executeEscapeAction(escState, action);
        }
        // After ending tutorial, zoom out to motherboard
        if (action === 'end-tutorial') {
          state.zoomOut();
        }
        return;
      }

      // Skip when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const state = useGameStore.getState();

      // Skip all non-Escape keys when a screen page is covering the gameboard
      if (state.activeScreen !== null) return;

      const kbAction = getKeyboardAction(e.key, e, state);
      if (kbAction.type === 'noop') return;

      // Tutorial: block palette before it's introduced
      if (kbAction.type === 'open-palette' && state.tutorialState.type === 'active') {
        const step = state.getCurrentTutorialStep();
        if (step && isTutorialPaletteBlocked(step)) return;
      }

      e.preventDefault();
      setFocusVisible(true);

      executeKeyboardAction(kbAction, {
        undo: state.undo,
        redo: state.redo,
        openOverlay: state.openOverlay,
        removeChip: state.removeChip,
        removePath: state.removePath,
        selectChip: state.selectChip,
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
          state.addPath(
            createPath(
              generateId(),
              ...orderPathArgs(fromPort, toPort),
            ),
          );
          playWireDrop();
        },
        onPlaceNode: (position) => {
          const mode = state.interactionMode;
          if (mode.type !== 'placing-chip') return;
          const chipType = mode.chipType;
          const rotation = mode.rotation;
          const { cols, rows } = getNodeGridSizeFromType(chipType, state.craftedPuzzles, state.craftedUtilities, rotation);
          const bounds = getPlayableBounds(state.activeBoardId);
          const col = Math.max(bounds.playableStart + 1, Math.min(position.col, bounds.playableEnd - cols));
          const row = Math.max(1, Math.min(position.row, GRID_ROWS - rows - 1));
          if (!canPlaceNode(state.occupancy, col, row, cols, rows, bounds)) return;

          if (chipType === 'custom-blank') {
            state.addChip({
              id: generateId(), type: 'custom-blank', position: { col, row },
              params: {}, socketCount: 0, plugCount: 0, rotation,
            });
          } else if (chipType.startsWith('puzzle:')) {
            const puzzleId = chipType.slice('puzzle:'.length);
            const entry = state.craftedPuzzles.get(puzzleId);
            if (!entry) return;
            state.addChip({
              id: generateId(), type: chipType, position: { col, row },
              params: {}, socketCount: entry.socketCount, plugCount: entry.plugCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          } else if (chipType.startsWith('utility:')) {
            const utilityId = chipType.slice('utility:'.length);
            const entry = state.craftedUtilities.get(utilityId);
            if (!entry) return;
            state.addChip({
              id: generateId(), type: chipType, position: { col, row },
              params: { ...(entry.cpLayout ? { cpLayout: entry.cpLayout } : {}) },
              socketCount: entry.socketCount, plugCount: entry.plugCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          } else {
            const def = getChipDefinition(chipType);
            if (!def) return;
            const kbNodeId = generateId();
            const kbParams = getDefaultParams(chipType);
            state.addChip({
              id: kbNodeId, type: def.type, position: { col, row },
              params: kbParams, socketCount: def.sockets.length, plugCount: def.plugs.length,
              rotation,
            });
            const kbKnobConfig = getKnobConfig(getChipDefinition(chipType));
            if (kbKnobConfig) {
              state.setPortConstant(kbNodeId, kbKnobConfig.portIndex, Number(kbParams[kbKnobConfig.paramKey] ?? 0));
            }
          }
          playNodeDrop();
          state.cancelPlacing();
        },
        togglePlayMode: state.togglePlayMode,
        stepPlaypoint: state.stepPlaypoint,
        paletteItemCount: (() => {
          const allowedChips = state.activePuzzle?.allowedChips ?? null;
          const budgets = state.activeBoard
            ? computeRemainingBudgets(allowedChips, state.activeBoard.chips)
            : null;
          return buildPaletteItems(allowedChips, state.craftedUtilities, budgets).filter(item => item.canPlace).length;
        })(),
        onDrawerSelect: (index: number) => {
          const allowedChips = state.activePuzzle?.allowedChips ?? null;
          const budgets = state.activeBoard
            ? computeRemainingBudgets(allowedChips, state.activeBoard.chips)
            : null;
          const items = buildPaletteItems(allowedChips, state.craftedUtilities, budgets).filter(item => item.canPlace);
          const item = items[index];
          if (item) {
            state.startPlacingChip(item.chipType);
          }
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
    const clickState = useGameStore.getState();

    // Tutorial: advance on click-anywhere or next-button steps
    if (clickState.tutorialState.type === 'active') {
      const step = clickState.getCurrentTutorialStep();
      if (step?.advanceOn.type === 'click-anywhere') {
        clickState.advanceTutorial();
        return;
      }
      if (step?.advanceOn.type === 'next-button') {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const bx = e.clientX - rect.left;
          const by = e.clientY - rect.top;
          const btnRect = getNextButtonRect(rect.width, rect.height);
          if (bx >= btnRect.x && bx <= btnRect.x + btnRect.w &&
              by >= btnRect.y && by <= btnRect.y + btnRect.h) {
            clickState.advanceTutorial();
          }
        }
        return;
      }
    }

    // Block all clicks during zoom transitions
    if (clickState.zoomTransitionState.type !== 'idle') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetRef.current.x;
    const y = e.clientY - rect.top - offsetRef.current.y;
    const { w, h } = getCanvasLogicalSize(canvas);

    const state = useGameStore.getState();

    // --- Back button: check first, before overlay guard ---
    if (hitTestBackButton(x, y, cellSizeRef.current)) {
      if (state.activeBoardId === 'motherboard') {
        if (state.isCreativeMode) state.exitCreativeMode();
        state.revealScreen();
      } else if (state.editingUtilityId !== null) {
        // Utility editing: two-part zoom-out with save/cancel dialog
        const entry = state.boardStack[state.boardStack.length - 1];
        if (entry?.zoomedCrop) {
          const parentNode = entry.board.chips.get(entry.chipIdInParent);
          let targetRect;
          if (parentNode) {
            const { cols, rows } = getNodeGridSize(parentNode);
            targetRect = { col: parentNode.position.col, row: parentNode.position.row, cols, rows };
          } else {
            targetRect = { col: 28, row: 16, cols: 5, rows: 3 };
          }
          state.startReveal(entry.zoomedCrop, targetRect);
        } else {
          state.openOverlay({ type: 'unsaved-changes' });
        }
      } else {
        // Cancel tutorial if active
        if (state.isTutorialActive()) {
          state.endTutorial();
        }
        // Exit creative mode if active (saves state for later restoration)
        if (state.isCreativeMode) state.exitCreativeMode();
        // Bake-on-leave: if puzzle is solved, bake the graph and register/update the crafted puzzle
        if (state.puzzleStatus === 'victory' && state.activePuzzle && state.activeBoard) {
          const bakeResult = bakeGraph(state.activeBoard.chips, state.activeBoard.paths);
          if (bakeResult.ok) {
            const puzzleId = state.activePuzzle.id;
            const boardSnapshot = state.activeBoard;
            const isResolve = state.completedLevels.has(puzzleId);
            state.completeLevel(puzzleId);
            if (isResolve) {
              state.updateCraftedPuzzle(puzzleId, bakeResult.value.metadata, boardSnapshot);
            } else {
              state.addCraftedPuzzle({
                puzzleId,
                title: state.activePuzzle.title,
                description: state.activePuzzle.description ?? '',
                socketCount: bakeResult.value.metadata.socketCount,
                plugCount: bakeResult.value.metadata.plugCount,
                bakeMetadata: bakeResult.value.metadata,
                versionHash: '',
                savedBoard: boardSnapshot,
              });
            }
          }
        }
        // Unload active puzzle when leaving a puzzle board (clears stale activePuzzle)
        if (state.activePuzzle) state.unloadPuzzle();
        // Read-only inspection or creative mode: zoom-out animation
        const snapshot = captureViewportSnapshot();
        if (snapshot) {
          const lastEntry = state.boardStack[state.boardStack.length - 1];
          if (lastEntry) {
            const parentNode = lastEntry.board.chips.get(lastEntry.chipIdInParent);
            if (parentNode) {
              const { cols, rows } = getNodeGridSize(parentNode);
              const targetRect = { col: parentNode.position.col, row: parentNode.position.row, cols, rows };
              state.startZoomCapture(snapshot, targetRect, 'out', lastEntry.zoomedCrop);
            }
          }
        }
        state.zoomOut();
      }
      return;
    }

    if (clickState.hasActiveOverlay()) {
      return;
    }

    // --- Record button: creative mode idle only (top-right) ---
    if (state.isCreativeMode && state.authoringPhase === 'idle') {
      if (hitTestRecordButton(x, y, cellSizeRef.current)) {
        if (!isRecordButtonDisabled()) {
          state.beginRecordTarget();
        }
        return;
      }
    }

    // --- Playback bar: check before all other hit tests ---
    if (!state.activeBoardReadOnly) {
      const pbHit = hitTestPlaybackBar(x, y, cellSizeRef.current);
      if (pbHit) {
        if (pbHit.button === 'play' && state.playMode === 'paused') state.setPlayMode('playing');
        else if (pbHit.button === 'stop' && state.playMode === 'playing') state.setPlayMode('paused');
        else if (pbHit.button === 'prev' && state.playMode === 'paused') state.stepPlaypoint(-1);
        else if (pbHit.button === 'next' && state.playMode === 'paused') state.stepPlaypoint(1);
        return;
      }
    }

    // --- Motherboard pagination click ---
    if (state.activeBoardId === 'motherboard' && state.motherboardLayout) {
      const puzzleSection = state.motherboardLayout.sections.find(s => s.id === 'puzzles');
      if (puzzleSection) {
        const pageHit = hitTestPagination(x, y, puzzleSection, state.motherboardLayout.pagination, cellSizeRef.current);
        if (pageHit) {
          const currentPage = state.motherboardLayout.pagination.currentPage;
          const newPage = pageHit === 'prev' ? currentPage - 1 : currentPage + 1;
          const { board, layout } = createMotherboard(
            state.completedLevels, state.isLevelUnlocked, state.customPuzzles, newPage,
          );
          state.setActiveBoard(board);
          state.setMotherboardLayout(layout);
          return;
        }
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

    // --- Read-only mode: allow selection + menu chip navigation ---
    if (state.activeBoardReadOnly) {
      if (!state.activeBoard) return;
      const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);
      if (hit.type === 'node') {
        const node = state.activeBoard.chips.get(hit.chipId);
        if (node && node.type.startsWith('menu:')) {
          navigateFromMenuNode(node);
          return;
        }
        state.selectChip(hit.chipId);
      } else {
        state.clearSelection();
      }
      return;
    }

    // --- Placing chip mode ---
    if (state.interactionMode.type === 'placing-chip') {
      const chipType = state.interactionMode.chipType;
      const rotation = state.interactionMode.rotation;
      const { cols, rows } = getNodeGridSizeFromType(chipType, state.craftedPuzzles, state.craftedUtilities, rotation);
      const grid = pixelToGrid(x, y, cellSizeRef.current);
      // Center chip on cursor, then clamp to playable area with 1-cell padding
      const bounds = getPlayableBounds(state.activeBoardId);
      const col = Math.max(bounds.playableStart + 1, Math.min(grid.col - Math.floor(cols / 2), bounds.playableEnd - cols));
      const row = Math.max(1, Math.min(grid.row - Math.floor(rows / 2), GRID_ROWS - rows - 1));

      // Validate occupancy before placing
      if (!canPlaceNode(state.occupancy, col, row, cols, rows, bounds)) return;

      const position = { col, row };

      // Handle puzzle chip placement
      if (chipType.startsWith('puzzle:')) {
        const puzzleId = chipType.slice('puzzle:'.length);
        const entry = state.craftedPuzzles.get(puzzleId);
        if (!entry) return;

        state.addChip({
          id: generateId(),
          type: chipType,
          position,
          params: {},
          socketCount: entry.socketCount,
          plugCount: entry.plugCount,
          libraryVersionHash: entry.versionHash,
          rotation,
        });
        playNodeDrop();
        state.cancelPlacing();
        return;
      }

      // Handle custom-blank chip placement
      if (chipType === 'custom-blank') {
        state.addChip({
          id: generateId(),
          type: 'custom-blank',
          position,
          params: {},
          socketCount: 0,
          plugCount: 0,
          rotation,
        });
        playNodeDrop();
        state.cancelPlacing();
        return;
      }

      // Handle utility chip placement
      if (chipType.startsWith('utility:')) {
        const utilityId = chipType.slice('utility:'.length);
        const entry = state.craftedUtilities.get(utilityId);
        if (!entry) return;

        state.addChip({
          id: generateId(),
          type: chipType,
          position,
          params: { ...(entry.cpLayout ? { cpLayout: entry.cpLayout } : {}) },
          socketCount: entry.socketCount,
          plugCount: entry.plugCount,
          libraryVersionHash: entry.versionHash,
          rotation,
        });
        playNodeDrop();
        state.cancelPlacing();
        return;
      }

      const def = getChipDefinition(chipType);
      if (!def) return;

      const chipId = generateId();
      const params = getDefaultParams(chipType);
      state.addChip({
        id: chipId,
        type: def.type,
        position,
        params,
        socketCount: def.sockets.length,
        plugCount: def.plugs.length,
        rotation,
      });
      // Set initial port constant for knob input to match param
      const clickKnobConfig = getKnobConfig(getChipDefinition(chipType));
      if (clickKnobConfig) {
        state.setPortConstant(chipId, clickKnobConfig.portIndex, Number(params[clickKnobConfig.paramKey] ?? 0));
      }
      playNodeDrop();
      state.cancelPlacing();
      return;
    }

    if (!state.activeBoard) return;
    const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);

    // --- Drawing path mode ---
    if (state.interactionMode.type === 'drawing-path') {
      const fromPort = state.interactionMode.fromPort;

      // Complete path to a chip port
      if (hit.type === 'port') {
        if (canCompleteWire(fromPort, hit.portRef) && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
          state.addPath(
            createPath(
              generateId(),
              ...orderPathArgs(fromPort, hit.portRef),
            ),
          );
          playWireDrop();
        }
        state.cancelPathDraw();
        return;
      }

      // Complete path to a connection point
      if (hit.type === 'connection-point') {
        const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'end', state.activePuzzle?.slotConfig);
        if (cpPortRef && canCompleteWire(fromPort, cpPortRef) && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
          state.addPath(
            createPath(
              generateId(),
              ...orderPathArgs(fromPort, cpPortRef),
            ),
          );
          playWireDrop();
        }
        state.cancelPathDraw();
        return;
      }

      // Clicked empty space or chip body — try snap before cancelling
      if (trySnapComplete(x, y, fromPort, state, cellSizeRef.current)) {
        playWireDrop();
      }
      state.cancelPathDraw();
      return;
    }

    // --- Idle mode ---
    // Only plug ports can start a path
    if (hit.type === 'port') {
      if (hit.portRef.side === 'plug' && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
        state.startPathDraw(hit.portRef, hit.position);
      }
      return;
    }

    // Start path from connection point (only plug-emitting CPs)
    if (hit.type === 'connection-point') {
      const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'start', state.activePuzzle?.slotConfig);
      if (cpPortRef && cpPortRef.side === 'plug' && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
        state.startPathDraw(cpPortRef, hit.position);
      }
      return;
    }

    if (hit.type === 'knob') {
      // Knob click in idle mode (wired knob) — just select the chip
      state.selectChip(hit.chipId);
      return;
    }

    if (hit.type === 'node') {
      const node = state.activeBoard.chips.get(hit.chipId);
      // Menu nodes navigate on click (even in non-read-only mode on motherboard)
      if (node && node.type.startsWith('menu:')) {
        navigateFromMenuNode(node);
        return;
      }
      state.selectChip(hit.chipId);
      if (!state.activeBoardReadOnly) {
        // Don't auto-open parameter popover for knob nodes (knob is the primary control)
        if (node && !getKnobConfig(getChipDefinition(node.type)) && hasEditableParams(node.type)) {
          state.openOverlay({ type: 'parameter-popover', chipId: hit.chipId });
        }
      }
      return;
    }

    if (hit.type === 'path') {
      state.openOverlay({
        type: 'context-menu',
        position: { x: e.clientX, y: e.clientY },
        target: { type: 'path', pathId: hit.pathId },
      });
      return;
    }

    state.clearSelection();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctxState = useGameStore.getState();
    if (ctxState.hasActiveOverlay()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = useGameStore.getState();

    if (state.interactionMode.type === 'drawing-path') {
      state.cancelPathDraw();
      return;
    }

    if (state.activeBoardReadOnly) return;
    if (!state.activeBoard || state.interactionMode.type !== 'idle') return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left - offsetRef.current.x;
    const cy = e.clientY - rect.top - offsetRef.current.y;

    // No context menu on playback bar, back button, or record button
    if (hitTestPlaybackBar(cx, cy, cellSizeRef.current)) return;
    if (hitTestBackButton(cx, cy, cellSizeRef.current)) return;
    if (hitTestRecordButton(cx, cy, cellSizeRef.current)) return;

    const { w, h } = getCanvasLogicalSize(canvas);
    const hit = hitTest(cx, cy, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);

    if (hit.type === 'node') {
      const node = state.activeBoard.chips.get(hit.chipId);
      state.openOverlay({
        type: 'context-menu',
        position: { x: e.clientX, y: e.clientY },
        target: { type: 'chip', chipId: hit.chipId, locked: node?.locked },
      });
      return;
    }

    if (hit.type === 'path') {
      state.openOverlay({
        type: 'context-menu',
        position: { x: e.clientX, y: e.clientY },
        target: { type: 'path', pathId: hit.pathId },
      });
      return;
    }

    // Empty space → do nothing (use chip drawer at bottom instead)
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const mdState = useGameStore.getState();
    if (mdState.hasActiveOverlay()) return;
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

    // Check playback bar, back button, and record button first (prevent drag initiation)
    const pbDown = hitTestPlaybackBar(x, y, cellSizeRef.current);
    if (pbDown) {
      setPressedPlaybackButton(pbDown.button);
      return;
    }
    if (hitTestBackButton(x, y, cellSizeRef.current)) return;
    if (hitTestRecordButton(x, y, cellSizeRef.current)) return;

    // Chip drawer: drag chip from drawer
    if (state.activeBoardId !== 'motherboard') {
      const allowedChips = state.activePuzzle?.allowedChips ?? null;
      const budgets = computeRemainingBudgets(allowedChips, state.activeBoard.chips);
      const paletteItems = buildPaletteItems(allowedChips, state.craftedUtilities, budgets).filter(item => item.canPlace);
      const drawerHit = hitTestChipDrawer(x, y, cellSizeRef.current, getDrawerProgress(), paletteItems);
      if (drawerHit?.type === 'chip') {
        // Close drawer and enter placing-chip mode with dragPlacement
        closeDrawer();
        state.startPlacingChip(drawerHit.paletteItem.chipType);
        // Set dragPlacement flag
        const mode = useGameStore.getState().interactionMode;
        if (mode.type === 'placing-chip') {
          useGameStore.setState({
            interactionMode: { ...mode, dragPlacement: true },
          });
        }
        return;
      }
      // Consume clicks on handle/tray background (don't pass through)
      if (drawerHit) return;
    }

    const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);

    // Start potential path drag from plug port
    if (hit.type === 'port' && hit.portRef.side === 'plug' && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
      potentialPathDragRef.current = { portRef: hit.portRef, position: hit.position, startX: x, startY: y };
      return;
    }

    // Start potential path drag from plug-emitting CP
    if (hit.type === 'connection-point') {
      const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'start', state.activePuzzle?.slotConfig);
      if (cpPortRef && cpPortRef.side === 'plug' && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
        potentialPathDragRef.current = { portRef: cpPortRef, position: hit.position, startX: x, startY: y };
        return;
      }
    }

    // Start knob adjust on knob hit (when knob port is unwired)
    if (hit.type === 'knob') {
      const node = state.activeBoard.chips.get(hit.chipId);
      if (node) {
        const knobConfig = getKnobConfig(getChipDefinition(node.type));
        if (knobConfig) {
          const isXWired = state.activeBoard.paths.some(
            w => w.target.chipId === node.id && w.target.portIndex === knobConfig.portIndex,
          );
          if (!isXWired) {
            const currentValue = Number(node.params[knobConfig.paramKey] ?? 0);
            lastKnobValueRef.current = currentValue;
            const center = getKnobMode() === 'radial' ? hit.center : null;
            state.startKnobAdjust(hit.chipId, y, currentValue, center);
            return;
          }
          // Wired knob clicked — flash error overlay
          rejectKnob(hit.chipId);
        }
      }
    }

    // Only start potential drag on chip body hit
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
    setPressedPlaybackButton(null);
    const state = useGameStore.getState();

    // Handle path drag complete
    if (pathDragActiveRef.current && state.interactionMode.type === 'drawing-path') {
      const canvas = canvasRef.current;
      if (canvas && state.activeBoard) {
        const rect = canvas.getBoundingClientRect();
        const ux = e.clientX - rect.left - offsetRef.current.x;
        const uy = e.clientY - rect.top - offsetRef.current.y;
        const { w, h } = getCanvasLogicalSize(canvas);
        const hit = hitTest(ux, uy, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);
        const fromPort = state.interactionMode.fromPort;

        if (hit.type === 'port' && canCompleteWire(fromPort, hit.portRef) && !isPortOccupied(hit.portRef, state.activeBoard.paths)) {
          state.addPath(createPath(generateId(), ...orderPathArgs(fromPort, hit.portRef)));
          playWireDrop();
        } else if (hit.type === 'connection-point') {
          const cpPortRef = connectionPointToPortRef(hit.slotIndex, hit.direction, state.activeBoard.chips, 'end', state.activePuzzle?.slotConfig);
          if (cpPortRef && canCompleteWire(fromPort, cpPortRef) && !isPortOccupied(cpPortRef, state.activeBoard.paths)) {
            state.addPath(createPath(generateId(), ...orderPathArgs(fromPort, cpPortRef)));
            playWireDrop();
          }
        } else {
          // No direct hit — try snap to nearest valid target
          if (trySnapComplete(ux, uy, fromPort, state, cellSizeRef.current)) {
            playWireDrop();
          }
        }
        state.cancelPathDraw();
      }
      pathDragActiveRef.current = false;
      justDraggedRef.current = true;
      potentialPathDragRef.current = null;
      return;
    }

    // Clear potential path drag on mouseup (no drag happened — let click handle it)
    if (potentialPathDragRef.current) {
      potentialPathDragRef.current = null;
    }

    // Handle knob adjust commit
    if (state.interactionMode.type === 'adjusting-knob') {
      const { chipId, startY, startValue, knobCenter } = state.interactionMode;
      const canvas = canvasRef.current;
      if (canvas) {
        const node = state.activeBoard?.chips.get(chipId);
        const knobConfig = node ? getKnobConfig(getChipDefinition(node.type)) : null;
        if (knobConfig) {
          const rect = canvas.getBoundingClientRect();
          const ux = e.clientX - rect.left - offsetRef.current.x;
          const uy = e.clientY - rect.top - offsetRef.current.y;
          let clampedValue: number;
          if (knobCenter) {
            clampedValue = radialAngleToValue(ux, uy, knobCenter.x, knobCenter.y);
          } else {
            const deltaY = startY - uy; // Up = positive
            const sensitivity = 32; // pixels per 50-unit step
            const rawDelta = (deltaY / sensitivity) * 50;
            const newValue = Math.round((startValue + rawDelta) / 50) * 50;
            clampedValue = Math.max(-100, Math.min(100, newValue));
          }
          state.batchKnobAdjust(chipId, knobConfig.paramKey, knobConfig.portIndex, clampedValue);
        }
      }
      state.commitKnobAdjust();
      lastKnobValueRef.current = null;
      justDraggedRef.current = true;
      return;
    }

    // Handle drag placement commit (chip dragged from drawer)
    if (state.interactionMode.type === 'placing-chip' && state.interactionMode.dragPlacement) {
      const canvas = canvasRef.current;
      if (!canvas) {
        state.cancelPlacing();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetRef.current.x;
      const y = e.clientY - rect.top - offsetRef.current.y;

      const chipType = state.interactionMode.chipType;
      const rotation = state.interactionMode.rotation;
      const { cols, rows } = getNodeGridSizeFromType(chipType, state.craftedPuzzles, state.craftedUtilities, rotation);
      const grid = pixelToGrid(x, y, cellSizeRef.current);
      const bounds = getPlayableBounds(state.activeBoardId);
      const col = Math.max(bounds.playableStart + 1, Math.min(grid.col - Math.floor(cols / 2), bounds.playableEnd - cols));
      const row = Math.max(1, Math.min(grid.row - Math.floor(rows / 2), GRID_ROWS - rows - 1));

      if (canPlaceNode(state.occupancy, col, row, cols, rows, bounds)) {
        const position = { col, row };
        if (chipType.startsWith('puzzle:')) {
          const puzzleId = chipType.slice('puzzle:'.length);
          const entry = state.craftedPuzzles.get(puzzleId);
          if (entry) {
            state.addChip({
              id: generateId(), type: chipType, position,
              params: {}, socketCount: entry.socketCount, plugCount: entry.plugCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          }
        } else if (chipType === 'custom-blank') {
          state.addChip({
            id: generateId(), type: 'custom-blank', position,
            params: {}, socketCount: 0, plugCount: 0, rotation,
          });
        } else if (chipType.startsWith('utility:')) {
          const utilityId = chipType.slice('utility:'.length);
          const entry = state.craftedUtilities.get(utilityId);
          if (entry) {
            state.addChip({
              id: generateId(), type: chipType, position,
              params: { ...(entry.cpLayout ? { cpLayout: entry.cpLayout } : {}) },
              socketCount: entry.socketCount, plugCount: entry.plugCount,
              libraryVersionHash: entry.versionHash, rotation,
            });
          }
        } else {
          const def = getChipDefinition(chipType);
          if (def) {
            const chipId = generateId();
            const params = getDefaultParams(chipType);
            state.addChip({
              id: chipId, type: def.type, position, params,
              socketCount: def.sockets.length, plugCount: def.plugs.length, rotation,
            });
            const knobCfg = getKnobConfig(getChipDefinition(chipType));
            if (knobCfg) {
              state.setPortConstant(chipId, knobCfg.portIndex, Number(params[knobCfg.paramKey] ?? 0));
            }
          }
        }
        playNodeDrop();
      }
      state.cancelPlacing();
      justDraggedRef.current = true;
      return;
    }

    // Handle dragging-chip commit
    if (state.interactionMode.type === 'dragging-chip') {
      const canvas = canvasRef.current;
      if (!canvas) {
        state.cancelDrag();
        potentialDragRef.current = null;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetRef.current.x;
      const y = e.clientY - rect.top - offsetRef.current.y;

      // Check if dropped on delete zone (drawer handle / open delete tray)
      if (state.activeBoardId !== 'motherboard' && hitTestDeleteZone(x, y, cellSizeRef.current)) {
        const { draggedChip } = state.interactionMode;
        if (!draggedChip.locked) {
          state.removeChip(draggedChip.id);
        }
        closeDrawer(); // deleteMode cleared when close animation completes
        state.cancelDrag();
        potentialDragRef.current = null;
        justDraggedRef.current = true;
        return;
      }

      const { draggedChip, grabOffset, rotation } = state.interactionMode;
      const chipType = draggedChip.type;
      const { cols, rows } = getNodeGridSizeFromType(chipType, state.craftedPuzzles, state.craftedUtilities, rotation);

      // Snap to grid, subtract grab offset so chip stays under cursor
      const grid = pixelToGrid(x, y, cellSizeRef.current);
      const bounds = getPlayableBounds(state.activeBoardId);
      const col = Math.max(bounds.playableStart + 1, Math.min(grid.col - grabOffset.col, bounds.playableEnd - cols));
      const row = Math.max(1, Math.min(grid.row - grabOffset.row, GRID_ROWS - rows - 1));

      // Check if move is valid
      if (canMoveNode(state.occupancy, draggedChip, col, row, rotation, bounds)) {
        state.moveChip(draggedChip.id, { col, row }, rotation);
        playNodeDrop();
      }
      // Clean up delete mode if it was active (cursor missed the zone)
      if (isDeleteMode()) {
        closeDrawer(); // deleteMode cleared when close animation completes
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetRef.current.x;
    const y = e.clientY - rect.top - offsetRef.current.y;
    const state = useGameStore.getState();
    state.setMousePosition({ x, y });

    // Back button hover must work even during overlay
    const backHoverEarly = hitTestBackButton(x, y, cellSizeRef.current);
    setHoveredBackButton(backHoverEarly);

    if (mmState.hasActiveOverlay()) return;

    // Handle knob adjustment drag (live update)
    if (state.interactionMode.type === 'adjusting-knob') {
      const { chipId, startY, startValue, knobCenter } = state.interactionMode;
      const node = state.activeBoard?.chips.get(chipId);
      const knobConfig = node ? getKnobConfig(getChipDefinition(node.type)) : null;
      if (knobConfig) {
        let clampedValue: number;
        if (knobCenter) {
          clampedValue = radialAngleToValue(x, y, knobCenter.x, knobCenter.y);
        } else {
          const deltaY = startY - y;
          const sensitivity = 32; // pixels per 50-unit step
          const rawDelta = (deltaY / sensitivity) * 50;
          const newValue = Math.round((startValue + rawDelta) / 50) * 50;
          clampedValue = Math.max(-100, Math.min(100, newValue));
        }
        if (lastKnobValueRef.current !== clampedValue) {
          lastKnobValueRef.current = clampedValue;
          playKnobTic();
        }
        state.batchKnobAdjust(chipId, knobConfig.paramKey, knobConfig.portIndex, clampedValue);
      }
      return;
    }

    // Check if we should start path drag
    if (potentialPathDragRef.current && state.interactionMode.type === 'idle') {
      const { startX, startY } = potentialPathDragRef.current;
      const dx = x - startX;
      const dy = y - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > DRAG_THRESHOLD_PX) {
        state.startPathDraw(potentialPathDragRef.current.portRef, potentialPathDragRef.current.position);
        potentialPathDragRef.current = null;
        pathDragActiveRef.current = true;
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

    // Update record button hover state
    const recordHover = state.isCreativeMode && state.authoringPhase === 'idle'
      ? hitTestRecordButton(x, y, cellSizeRef.current)
      : false;
    setHoveredRecordButton(recordHover);

    // Update playback bar hover state and cursor
    const pbHover = hitTestPlaybackBar(x, y, cellSizeRef.current);
    setHoveredPlaybackButton(pbHover?.button ?? null);

    // Chip drawer: delete mode during chip drag (open drawer with trash icon on hover)
    const isOnHomeBoard = state.activeBoardId === 'motherboard';
    if (!isOnHomeBoard && state.interactionMode.type === 'dragging-chip') {
      if (hitTestDeleteTrigger(x, y, cellSizeRef.current)) {
        if (!isDeleteMode()) setDeleteMode(true);
        openDrawer(); // no-op if already open/opening; re-opens if closing
      } else if (isDeleteMode()) {
        closeDrawer(); // deleteMode cleared when close animation completes
      }
    }

    // Chip drawer hover handling (not during chip drag)
    if (!isOnHomeBoard && state.interactionMode.type !== 'dragging-chip') {
      // Build palette items for drawer hit test
      const allowedChips = state.activePuzzle?.allowedChips ?? null;
      const budgets = state.activeBoard
        ? computeRemainingBudgets(allowedChips, state.activeBoard.chips)
        : null;
      const paletteItems = buildPaletteItems(allowedChips, state.craftedUtilities, budgets).filter(item => item.canPlace);

      const drawerHit = hitTestChipDrawer(x, y, cellSizeRef.current, getDrawerProgress(), paletteItems);
      if (drawerHit) {
        if (drawerHit.type === 'handle') {
          setHandleHovered(true);
          setHoveredChipIndex(null);
          // Only open from fully closed — not during closing animation
          // (the handle slides up with progress, so re-hitting it during close
          // would cause an open/close oscillation loop)
          if (getDrawerState() === 'closed') openDrawer();
        } else if (drawerHit.type === 'chip') {
          setHandleHovered(false);
          setHoveredChipIndex(drawerHit.index);
        } else {
          setHandleHovered(false);
          setHoveredChipIndex(null);
        }
      } else {
        setHandleHovered(false);
        setHoveredChipIndex(null);
        // Close drawer when cursor leaves entirely (only if not keyboard-navigating)
        const drawerState = getDrawerState();
        if ((drawerState === 'open' || drawerState === 'opening') && !isKeyboardNavigationActive()) {
          closeDrawer();
        }
      }
    }

    if (canvas && state.interactionMode.type === 'idle') {
      if (backHoverEarly) {
        canvas.style.cursor = 'pointer';
      } else if (recordHover && !isRecordButtonDisabled()) {
        canvas.style.cursor = 'pointer';
      } else if (pbHover) {
        const playMode = useGameStore.getState().playMode;
        const isDisabled = (pbHover.button === 'prev' || pbHover.button === 'next') && playMode === 'playing';
        const isDepressed = pbHover.button === 'play' && playMode === 'playing';
        canvas.style.cursor = (isDisabled || isDepressed) ? 'default' : 'pointer';
      } else {
        canvas.style.cursor = 'default';
      }
    }

    // Update hover state for chip highlighting (skip if dragging)
    if (state.interactionMode.type !== 'dragging-chip' && state.activeBoard) {
      // Cache: skip hitTest if cursor is in the same grid cell with same board refs
      const gridCell = pixelToGrid(x, y, cellSizeRef.current);
      const cache = hitCacheRef.current;
      if (
        gridCell.col === cache.col &&
        gridCell.row === cache.row &&
        state.activeBoard.chips === cache.chipsRef &&
        state.activeBoard.paths === cache.pathsRef
      ) {
        // Same cell, same board — reuse cached hover result
        if (cache.hoveredChipId !== state.hoveredChipId) {
          state.setHoveredChip(cache.hoveredChipId);
        }
      } else {
        const { w, h } = getCanvasLogicalSize(canvas);
        const hit = hitTest(x, y, state.activeBoard.chips, w, h, cellSizeRef.current, state.activeBoard.paths, state.activePuzzle?.activeInputs, state.activePuzzle?.activeOutputs, state.activePuzzle?.slotConfig, state.editingUtilityId, state.meterSlots);
        const newHovered = hit.type === 'node' ? hit.chipId : null;
        cache.col = gridCell.col;
        cache.row = gridCell.row;
        cache.hoveredChipId = newHovered;
        cache.chipsRef = state.activeBoard.chips;
        cache.pathsRef = state.activeBoard.paths;
        if (newHovered !== state.hoveredChipId) {
          state.setHoveredChip(newHovered);
        }
      }
    }
  }, []);

  // Close the chip drawer when the cursor leaves the canvas entirely.
  // Without this, fast mouse exits skip the mousemove-based close logic.
  const handleMouseLeave = useCallback(() => {
    setPressedPlaybackButton(null);
    // deleteMode cleared by closeDrawer animation completion
    const drawerState = getDrawerState();
    if ((drawerState === 'open' || drawerState === 'opening') && !isKeyboardNavigationActive()) {
      closeDrawer();
    }
    setHandleHovered(false);
    setHoveredChipIndex(null);
  }, []);

  // Wheel scroll for chip drawer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onWheel(e: WheelEvent) {
      if (!isDrawerVisible()) return;

      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetRef.current.x;
      const y = e.clientY - rect.top - offsetRef.current.y;
      const cs = cellSizeRef.current;

      // Only scroll when cursor is over the tray area
      const tray = getTrayRect(cs, getDrawerProgress());
      if (x < tray.left || x > tray.left + tray.width ||
          y < tray.top || y > tray.top + tray.height) return;

      const state = useGameStore.getState();
      const allowedChips = state.activePuzzle?.allowedChips ?? null;
      const budgets = state.activeBoard
        ? computeRemainingBudgets(allowedChips, state.activeBoard.chips)
        : null;
      const itemCount = buildPaletteItems(allowedChips, state.craftedUtilities, budgets).filter(item => item.canPlace).length;
      const maxScroll = getMaxScrollOffset(cs, itemCount);
      if (maxScroll <= 0) return;

      e.preventDefault();
      const newOffset = Math.min(maxScroll, Math.max(0, getScrollOffset() + e.deltaY));
      setScrollOffset(newOffset);
    }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const cursorStyle = useGameStore((s) => {
    if (s.interactionMode.type === 'placing-chip') return 'crosshair';
    if (s.interactionMode.type === 'drawing-path') return 'crosshair';
    if (s.interactionMode.type === 'keyboard-wiring') return 'crosshair';
    if (s.interactionMode.type === 'dragging-chip') return 'grabbing';
    if (s.interactionMode.type === 'adjusting-knob') return s.interactionMode.knobCenter ? 'default' : 'ns-resize';
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
        onMouseLeave={handleMouseLeave}
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
