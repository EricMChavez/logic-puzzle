/**
 * Pure escape-key cascade handler.
 * Determines the correct action for the Escape key based on current state priority.
 *
 * Five-level cascade (highest to lowest priority):
 * 1. Close escape-dismissible overlay
 * 2. Block if non-dismissible overlay is open (noop)
 * 3. Cancel wire drawing
 * 4. Cancel placement or deselect node
 * 5. Zoom out (if navigationDepth > 0)
 * 6. Otherwise noop
 */

export type EscapeAction =
  | 'close-overlay'
  | 'cancel-wiring'
  | 'deselect'
  | 'zoom-out'
  | 'noop';

/** Minimal state interface for escape handler — avoids importing full GameStore */
export interface EscapeHandlerState {
  hasActiveOverlay: () => boolean;
  isOverlayEscapeDismissible: () => boolean;
  closeOverlay: () => void;
  interactionMode: { type: string };
  cancelWireDraw: () => void;
  cancelPlacing: () => void;
  cancelKeyboardWiring: () => void;
  commitKnobAdjust: () => void;
  selectedNodeId: string | null;
  clearSelection: () => void;
  navigationDepth: number;
  zoomOut: () => void;
}

/**
 * Determine which escape action to take without executing it.
 * Pure function — no side effects.
 */
export function getEscapeAction(state: EscapeHandlerState): EscapeAction {
  if (state.hasActiveOverlay()) {
    return state.isOverlayEscapeDismissible() ? 'close-overlay' : 'noop';
  }
  if (state.interactionMode.type === 'drawing-wire' || state.interactionMode.type === 'keyboard-wiring') return 'cancel-wiring';
  if (state.interactionMode.type === 'adjusting-knob') return 'deselect';
  if (state.interactionMode.type === 'placing-node') return 'deselect';
  if (state.selectedNodeId !== null) return 'deselect';
  if (state.navigationDepth > 0) return 'zoom-out';
  return 'noop';
}

/**
 * Execute a previously determined escape action.
 */
export function executeEscapeAction(state: EscapeHandlerState, action: EscapeAction): void {
  switch (action) {
    case 'close-overlay':
      state.closeOverlay();
      break;
    case 'cancel-wiring':
      if (state.interactionMode.type === 'keyboard-wiring') {
        state.cancelKeyboardWiring();
      } else {
        state.cancelWireDraw();
      }
      break;
    case 'deselect':
      if (state.interactionMode.type === 'placing-node') {
        state.cancelPlacing();
      } else if (state.interactionMode.type === 'adjusting-knob') {
        state.commitKnobAdjust();
      } else {
        state.clearSelection();
      }
      break;
    case 'zoom-out':
      state.zoomOut();
      break;
  }
}

/**
 * Determine and execute the escape action in one call.
 * Convenience wrapper over getEscapeAction + executeEscapeAction.
 */
export function handleEscape(state: EscapeHandlerState): EscapeAction {
  const action = getEscapeAction(state);
  executeEscapeAction(state, action);
  return action;
}
