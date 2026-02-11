/**
 * Pure keyboard action handler for gameboard canvas.
 * Follows the same pattern as escape-handler.ts: pure getKeyboardAction() + executeKeyboardAction().
 * Handles all non-Escape keys (Tab, arrows, Enter, Delete, N/Space, Ctrl+Z).
 */

import type { PortRef, NodeState, Wire } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import type { ActiveOverlay } from '../../store/slices/overlay-slice.ts';
import { PLAYABLE_START, PLAYABLE_END, GRID_ROWS } from '../../shared/grid/index.ts';
import {
  advanceFocus,
  getFocusTarget,
  setFocusTarget,
  computeValidWiringTargets,
} from './keyboard-focus.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyboardAction =
  | { type: 'advance-focus'; direction: 1 | -1 }
  | { type: 'cycle-wiring-target'; direction: 1 | -1 }
  | { type: 'enter-node'; nodeId: string }
  | { type: 'open-params'; nodeId: string }
  | { type: 'start-wiring'; portRef: PortRef }
  | { type: 'start-wiring-cp'; side: 'input' | 'output'; index: number }
  | { type: 'complete-wiring' }
  | { type: 'place-node' }
  | { type: 'delete-node'; nodeId: string }
  | { type: 'delete-wire'; wireId: string }
  | { type: 'move-ghost'; delta: GridPoint }
  | { type: 'open-palette' }
  | { type: 'rotate-placement' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'noop' };

/** Minimal state interface — avoids importing full GameStore */
export interface KeyboardHandlerState {
  hasActiveOverlay: () => boolean;
  activeBoardReadOnly: boolean;
  interactionMode: InteractionMode;
  selectedNodeId: string | null;
  activeBoard: { nodes: ReadonlyMap<string, NodeState>; wires: ReadonlyArray<Wire> } | null;
  activePuzzle: PuzzleDefinition | null;
  keyboardGhostPosition: GridPoint | null;
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

  // Arrow keys (placement ghost movement)
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    if (isOverlayActive || isReadOnly) return { type: 'noop' };
    if (mode.type !== 'placing-node') return { type: 'noop' };

    const delta: GridPoint = { col: 0, row: 0 };
    if (key === 'ArrowUp') delta.row = -1;
    else if (key === 'ArrowDown') delta.row = 1;
    else if (key === 'ArrowLeft') delta.col = -1;
    else if (key === 'ArrowRight') delta.col = 1;
    return { type: 'move-ghost', delta };
  }

  // Enter
  if (key === 'Enter') {
    if (isOverlayActive) return { type: 'noop' };

    // In keyboard-wiring mode: complete wire
    if (mode.type === 'keyboard-wiring') {
      return { type: 'complete-wiring' };
    }

    // In placing-node mode: place node
    if (mode.type === 'placing-node') {
      if (isReadOnly) return { type: 'noop' };
      return { type: 'place-node' };
    }

    if (isReadOnly) return { type: 'noop' };

    const focus = getFocusTarget();
    if (!focus) return { type: 'noop' };

    if (focus.type === 'node' && state.activeBoard) {
      const node = state.activeBoard.nodes.get(focus.nodeId);
      if (!node) return { type: 'noop' };
      // Utility/puzzle nodes → enter (zoom into)
      if (node.type.startsWith('utility:') || node.type.startsWith('puzzle:')) {
        return { type: 'enter-node', nodeId: focus.nodeId };
      }
      // Fundamental with editable params → open parameter popover
      if (node.type === 'mix' || node.type === 'threshold') {
        return { type: 'open-params', nodeId: focus.nodeId };
      }
    }

    // Port focus → start wiring
    if (focus.type === 'port') {
      return { type: 'start-wiring', portRef: focus.portRef };
    }

    // Connection point focus → start wiring
    if (focus.type === 'connection-point') {
      return { type: 'start-wiring-cp', side: focus.side, index: focus.index };
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
      const node = state.activeBoard?.nodes.get(focus.nodeId);
      if (node?.locked) return { type: 'noop' };
      return { type: 'delete-node', nodeId: focus.nodeId };
    }
    if (focus.type === 'wire') {
      return { type: 'delete-wire', wireId: focus.wireId };
    }
    return { type: 'noop' };
  }

  // N or Space → open palette modal
  if ((key === 'n' || key === ' ') && !e.ctrlKey && !e.metaKey) {
    if (isOverlayActive || isReadOnly) return { type: 'noop' };
    if (mode.type !== 'idle') return { type: 'noop' };
    return { type: 'open-palette' };
  }

  // R key → rotate placement ghost or dragging node
  if (key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
    if (isOverlayActive || isReadOnly) return { type: 'noop' };
    if (mode.type === 'placing-node' || mode.type === 'dragging-node') {
      return { type: 'rotate-placement' };
    }
  }

  return { type: 'noop' };
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

export interface KeyboardActionExecutor {
  undo: () => void;
  redo: () => void;
  openOverlay: (overlay: ActiveOverlay) => void;
  removeNode: (nodeId: string) => void;
  removeWire: (wireId: string) => void;
  selectNode: (nodeId: string) => void;
  clearSelection: () => void;
  startKeyboardWiring: (fromPort: PortRef, validTargets: PortRef[]) => void;
  cycleWiringTarget: (direction: 1 | -1) => void;
  cancelKeyboardWiring: () => void;
  setKeyboardGhostPosition: (pos: GridPoint | null) => void;
  rotatePlacement: () => void;
  interactionMode: InteractionMode;
  activeBoard: { nodes: ReadonlyMap<string, NodeState>; wires: ReadonlyArray<Wire> } | null;
  activePuzzle: PuzzleDefinition | null;
  keyboardGhostPosition: GridPoint | null;
  /** Callback for node enter (zoom-in) requiring snapshot capture */
  onEnterNode?: (nodeId: string) => void;
  /** Callback for completing a wire */
  onCompleteWire?: (fromPort: PortRef, toPort: PortRef) => void;
  /** Callback for placing a node at keyboard ghost position */
  onPlaceNode?: (position: GridPoint) => void;
}

export function executeKeyboardAction(action: KeyboardAction, executor: KeyboardActionExecutor): void {
  switch (action.type) {
    case 'advance-focus': {
      if (!executor.activeBoard) break;
      advanceFocus(
        action.direction,
        executor.activeBoard.nodes,
        executor.activeBoard.wires,
        null, // expandedNodeId not tracked in executor; pass null for top-level navigation
        executor.activePuzzle,
      );
      // Select the focused node for visual consistency
      const ft = getFocusTarget();
      if (ft?.type === 'node') {
        executor.selectNode(ft.nodeId);
      } else {
        executor.clearSelection();
      }
      break;
    }
    case 'cycle-wiring-target':
      executor.cycleWiringTarget(action.direction);
      break;
    case 'enter-node':
      executor.onEnterNode?.(action.nodeId);
      break;
    case 'open-params':
      executor.openOverlay({ type: 'parameter-popover', nodeId: action.nodeId });
      break;
    case 'start-wiring': {
      if (!executor.activeBoard) break;
      const targets = computeValidWiringTargets(action.portRef, executor.activeBoard.nodes, executor.activeBoard.wires);
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
      if (!executor.activeBoard.nodes.has(cpNodeId)) break;
      const portRef: PortRef = {
        nodeId: cpNodeId,
        portIndex: 0,
        side: action.side === 'input' ? 'output' : 'input',
      };
      const targets = computeValidWiringTargets(portRef, executor.activeBoard.nodes, executor.activeBoard.wires);
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
      executor.removeNode(action.nodeId);
      setFocusTarget(null);
      break;
    }
    case 'delete-wire': {
      executor.removeWire(action.wireId);
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
    case 'rotate-placement':
      executor.rotatePlacement();
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
