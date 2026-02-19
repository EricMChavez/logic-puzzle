/**
 * Pure keyboard action handler for gameboard canvas.
 * Follows the same pattern as escape-handler.ts: pure getKeyboardAction() + executeKeyboardAction().
 * Handles all non-Escape keys (Tab, arrows, Enter, Delete, N/Space, Ctrl+Z).
 */

import type { PortRef, ChipState, Path } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import { getChipDefinition } from '../../engine/nodes/registry.ts';
import type { ActiveOverlay } from '../../store/slices/overlay-slice.ts';
import { PLAYABLE_START, PLAYABLE_END, GRID_ROWS } from '../../shared/grid/index.ts';
import { slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
import {
  advanceFocus,
  getFocusTarget,
  setFocusTarget,
  computeValidWiringTargets,
} from './keyboard-focus.ts';
import {
  isDrawerOpen,
  openDrawer,
  closeDrawer,
  getKeyboardSelectedIndex,
  setKeyboardSelectedIndex,
  setKeyboardNavigationActive,
  isKeyboardNavigationActive,
} from '../../gameboard/canvas/render-chip-drawer.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyboardAction =
  | { type: 'advance-focus'; direction: 1 | -1 }
  | { type: 'cycle-wiring-target'; direction: 1 | -1 }
  | { type: 'enter-node'; chipId: string }
  | { type: 'open-params'; chipId: string }
  | { type: 'start-wiring'; portRef: PortRef }
  | { type: 'start-wiring-cp'; side: 'input' | 'output'; index: number }
  | { type: 'complete-wiring' }
  | { type: 'place-node' }
  | { type: 'delete-node'; chipId: string }
  | { type: 'delete-wire'; wireId: string }
  | { type: 'move-ghost'; delta: GridPoint }
  | { type: 'open-palette' }
  | { type: 'toggle-drawer' }
  | { type: 'drawer-navigate'; direction: 1 | -1 }
  | { type: 'drawer-select' }
  | { type: 'rotate-placement' }
  | { type: 'toggle-play' }
  | { type: 'step-playpoint'; delta: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'noop' };

/** Minimal state interface — avoids importing full GameStore */
export interface KeyboardHandlerState {
  hasActiveOverlay: () => boolean;
  activeBoardReadOnly: boolean;
  interactionMode: InteractionMode;
  selectedChipId: string | null;
  activeBoard: { chips: ReadonlyMap<string, ChipState>; paths: ReadonlyArray<Path> } | null;
  activePuzzle: PuzzleDefinition | null;
  keyboardGhostPosition: GridPoint | null;
  playMode: 'playing' | 'paused';
}

// ---------------------------------------------------------------------------
// Pure action determination
// ---------------------------------------------------------------------------

export function getKeyboardAction(key: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, state: KeyboardHandlerState): KeyboardAction {
  const isOverlayActive = state.hasActiveOverlay();
  const isReadOnly = state.activeBoardReadOnly;
  const mode = state.interactionMode;

  // Undo/Redo: Ctrl/Cmd+Z
  if (key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
    if (isOverlayActive || isReadOnly) return { type: 'noop' };
    return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
  }

  // Tab / Shift+Tab
  if (key === 'Tab') {
    if (isOverlayActive) return { type: 'noop' };
    const direction = e.shiftKey ? -1 : 1;
    // In keyboard-wiring mode, Tab cycles targets
    if (mode.type === 'keyboard-wiring') {
      return { type: 'cycle-wiring-target', direction };
    }
    return { type: 'advance-focus', direction };
  }

  // Arrow keys (placement ghost movement OR playpoint stepping when paused)
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    if (isOverlayActive) return { type: 'noop' };

    // Placing-node mode: arrow keys move the ghost
    if (mode.type === 'placing-chip' && !isReadOnly) {
      const delta: GridPoint = { col: 0, row: 0 };
      if (key === 'ArrowUp') delta.row = -1;
      else if (key === 'ArrowDown') delta.row = 1;
      else if (key === 'ArrowLeft') delta.col = -1;
      else if (key === 'ArrowRight') delta.col = 1;
      return { type: 'move-ghost', delta };
    }

    // When paused and idle: left/right step playpoint
    if (state.playMode === 'paused' && mode.type === 'idle') {
      if (key === 'ArrowLeft') return { type: 'step-playpoint', delta: -1 };
      if (key === 'ArrowRight') return { type: 'step-playpoint', delta: 1 };
    }

    return { type: 'noop' };
  }

  // Enter
  if (key === 'Enter') {
    if (isOverlayActive) return { type: 'noop' };

    // In keyboard-wiring mode: complete wire
    if (mode.type === 'keyboard-wiring') {
      return { type: 'complete-wiring' };
    }

    // In placing-node mode: place node
    if (mode.type === 'placing-chip') {
      if (isReadOnly) return { type: 'noop' };
      return { type: 'place-node' };
    }

    if (isReadOnly) return { type: 'noop' };

    const focus = getFocusTarget();
    if (!focus) return { type: 'noop' };

    if (focus.type === 'node' && state.activeBoard) {
      const node = state.activeBoard.chips.get(focus.chipId);
      if (!node) return { type: 'noop' };
      // Utility/puzzle nodes → enter (zoom into)
      if (node.type.startsWith('utility:') || node.type.startsWith('puzzle:')) {
        return { type: 'enter-node', chipId: focus.chipId };
      }
      // Fundamental with editable params → open parameter popover
      const def = getChipDefinition(node.type);
      if (def && (def.params?.length ?? 0) > 0) {
        return { type: 'open-params', chipId: focus.chipId };
      }
    }

    // Port focus → start wiring
    if (focus.type === 'port') {
      return { type: 'start-wiring', portRef: focus.portRef };
    }

    // Connection point focus → start wiring
    if (focus.type === 'connection-point') {
      const cpSide: 'input' | 'output' = slotSide(focus.slotIndex) === 'left' ? 'input' : 'output';
      return { type: 'start-wiring-cp', side: cpSide, index: slotPerSideIndex(focus.slotIndex) };
    }

    return { type: 'noop' };
  }

  // Delete / Backspace
  if (key === 'Delete' || key === 'Backspace') {
    if (isOverlayActive || isReadOnly) return { type: 'noop' };

    const focus = getFocusTarget();
    if (!focus) return { type: 'noop' };

    if (focus.type === 'node') {
      // Locked nodes cannot be deleted
      const node = state.activeBoard?.chips.get(focus.chipId);
      if (node?.locked) return { type: 'noop' };
      return { type: 'delete-node', chipId: focus.chipId };
    }
    if (focus.type === 'wire') {
      return { type: 'delete-wire', wireId: focus.wireId };
    }
    return { type: 'noop' };
  }

  // N → toggle chip drawer
  if (key === 'n' && !e.ctrlKey && !e.metaKey) {
    if (isOverlayActive || isReadOnly) return { type: 'noop' };
    if (mode.type !== 'idle') return { type: 'noop' };
    return { type: 'toggle-drawer' };
  }

  // Arrow keys while drawer is open → navigate chips
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && isDrawerOpen() && isKeyboardNavigationActive()) {
    if (isOverlayActive) return { type: 'noop' };
    return { type: 'drawer-navigate', direction: key === 'ArrowLeft' ? -1 : 1 };
  }

  // Enter while drawer is open → select chip
  if (key === 'Enter' && isDrawerOpen() && isKeyboardNavigationActive()) {
    if (isOverlayActive) return { type: 'noop' };
    return { type: 'drawer-select' };
  }

  // Space or P → toggle play/pause
  if ((key === ' ' || key.toLowerCase() === 'p') && !e.ctrlKey && !e.metaKey) {
    if (isOverlayActive) return { type: 'noop' };
    if (mode.type === 'idle' || mode.type === 'keyboard-wiring') {
      return { type: 'toggle-play' };
    }
  }

  // R key rotation disabled — feature not ready
  // if (key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
  //   if (isOverlayActive || isReadOnly) return { type: 'noop' };
  //   if (mode.type === 'placing-chip' || mode.type === 'dragging-chip') {
  //     return { type: 'rotate-placement' };
  //   }
  // }

  return { type: 'noop' };
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

export interface KeyboardActionExecutor {
  undo: () => void;
  redo: () => void;
  openOverlay: (overlay: ActiveOverlay) => void;
  removeChip: (chipId: string) => void;
  removePath: (wireId: string) => void;
  selectChip: (chipId: string) => void;
  clearSelection: () => void;
  startKeyboardWiring: (fromPort: PortRef, validTargets: PortRef[]) => void;
  cycleWiringTarget: (direction: 1 | -1) => void;
  cancelKeyboardWiring: () => void;
  setKeyboardGhostPosition: (pos: GridPoint | null) => void;
  rotatePlacement: () => void;
  interactionMode: InteractionMode;
  activeBoard: { chips: ReadonlyMap<string, ChipState>; paths: ReadonlyArray<Path> } | null;
  activePuzzle: PuzzleDefinition | null;
  keyboardGhostPosition: GridPoint | null;
  /** Callback for node enter (zoom-in) requiring snapshot capture */
  onEnterNode?: (chipId: string) => void;
  /** Callback for completing a wire */
  onCompleteWire?: (fromPort: PortRef, toPort: PortRef) => void;
  /** Callback for placing a node at keyboard ghost position */
  onPlaceNode?: (position: GridPoint) => void;
  /** Toggle play/pause mode */
  togglePlayMode: () => void;
  /** Step playpoint by delta cycles */
  stepPlaypoint: (delta: number) => void;
  /** Palette items for drawer chip selection */
  paletteItemCount?: number;
  /** Callback for selecting a chip from the drawer by index */
  onDrawerSelect?: (index: number) => void;
}

export function executeKeyboardAction(action: KeyboardAction, executor: KeyboardActionExecutor): void {
  switch (action.type) {
    case 'advance-focus': {
      if (!executor.activeBoard) break;
      advanceFocus(
        action.direction,
        executor.activeBoard.chips,
        executor.activeBoard.paths,
        null, // expandedNodeId not tracked in executor; pass null for top-level navigation
        executor.activePuzzle,
      );
      // Select the focused node for visual consistency
      const ft = getFocusTarget();
      if (ft?.type === 'node') {
        executor.selectChip(ft.chipId);
      } else {
        executor.clearSelection();
      }
      break;
    }
    case 'cycle-wiring-target':
      executor.cycleWiringTarget(action.direction);
      break;
    case 'enter-node':
      executor.onEnterNode?.(action.chipId);
      break;
    case 'open-params':
      executor.openOverlay({ type: 'parameter-popover', chipId: action.chipId });
      break;
    case 'start-wiring': {
      if (!executor.activeBoard) break;
      const targets = computeValidWiringTargets(action.portRef, executor.activeBoard.chips, executor.activeBoard.paths);
      if (targets.length > 0) {
        executor.startKeyboardWiring(action.portRef, targets);
      }
      break;
    }
    case 'start-wiring-cp': {
      if (!executor.activeBoard) break;
      // Build the port ref from the connection point
      const cpNodeId = action.side === 'input'
        ? `__cp_input_${action.index}__`
        : `__cp_output_${action.index}__`;
      if (!executor.activeBoard.chips.has(cpNodeId)) break;
      const portRef: PortRef = {
        chipId: cpNodeId,
        portIndex: 0,
        side: action.side === 'input' ? 'plug' : 'socket',
      };
      const targets = computeValidWiringTargets(portRef, executor.activeBoard.chips, executor.activeBoard.paths);
      if (targets.length > 0) {
        executor.startKeyboardWiring(portRef, targets);
      }
      break;
    }
    case 'complete-wiring': {
      const mode = executor.interactionMode;
      if (mode.type !== 'keyboard-wiring') break;
      const target = mode.validTargets[mode.targetIndex];
      if (target) {
        executor.onCompleteWire?.(mode.fromPort, target);
      }
      executor.cancelKeyboardWiring();
      break;
    }
    case 'place-node': {
      const pos = executor.keyboardGhostPosition;
      if (pos) {
        executor.onPlaceNode?.(pos);
      }
      break;
    }
    case 'delete-node': {
      executor.removeChip(action.chipId);
      setFocusTarget(null);
      break;
    }
    case 'delete-wire': {
      executor.removePath(action.wireId);
      setFocusTarget(null);
      break;
    }
    case 'move-ghost': {
      const current = executor.keyboardGhostPosition ?? {
        col: Math.floor((PLAYABLE_START + PLAYABLE_END) / 2),
        row: Math.floor(GRID_ROWS / 2),
      };
      // 1-cell padding inside playable area so port anchors stay routable
      const newCol = Math.max(PLAYABLE_START + 1, Math.min(PLAYABLE_END - 2, current.col + action.delta.col));
      const newRow = Math.max(1, Math.min(GRID_ROWS - 2, current.row + action.delta.row));
      executor.setKeyboardGhostPosition({ col: newCol, row: newRow });
      break;
    }
    case 'open-palette':
      executor.openOverlay({ type: 'palette-modal' });
      break;
    case 'toggle-drawer':
      if (isDrawerOpen()) {
        closeDrawer();
      } else {
        openDrawer();
        setKeyboardNavigationActive(true);
        setKeyboardSelectedIndex(0);
      }
      break;
    case 'drawer-navigate': {
      const count = executor.paletteItemCount ?? 0;
      if (count === 0) break;
      const current = getKeyboardSelectedIndex() ?? 0;
      const next = ((current + action.direction) % count + count) % count;
      setKeyboardSelectedIndex(next);
      break;
    }
    case 'drawer-select': {
      const selIdx = getKeyboardSelectedIndex();
      if (selIdx !== null) {
        closeDrawer();
        // The actual startPlacingNode call happens in GameboardCanvas.tsx
        // via the onDrawerSelect callback, since we need palette item data
        executor.onDrawerSelect?.(selIdx);
      }
      break;
    }
    case 'rotate-placement':
      executor.rotatePlacement();
      break;
    case 'toggle-play':
      executor.togglePlayMode();
      break;
    case 'step-playpoint':
      executor.stepPlaypoint(action.delta);
      break;
    case 'undo':
      executor.undo();
      break;
    case 'redo':
      executor.redo();
      break;
    case 'noop':
      break;
  }
}
