import type { StateCreator } from 'zustand';
import type { NodeId, PortRef, Vec2, NodeRotation, NodeState } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';

/** Interaction mode discriminated union */
export type InteractionMode =
  | { type: 'idle' }
  | { type: 'placing-node'; nodeType: string; rotation: NodeRotation }
  | { type: 'drawing-wire'; fromPort: PortRef; fromPosition: Vec2 }
  | { type: 'keyboard-wiring'; fromPort: PortRef; validTargets: PortRef[]; targetIndex: number }
  | { type: 'dragging-node'; draggedNode: NodeState; offset: Vec2; originalPosition: GridPoint; rotation: NodeRotation };

/** Port currently being edited for a constant value */
export interface EditingPort {
  nodeId: NodeId;
  portIndex: number;
  position: Vec2;
}

export interface InteractionSlice {
  /** Current interaction mode */
  interactionMode: InteractionMode;
  /** Currently selected node (for parameter editing) */
  selectedNodeId: NodeId | null;
  /** Currently hovered node (for visual highlight) */
  hoveredNodeId: NodeId | null;
  /** Current mouse position on canvas (for wire preview) */
  mousePosition: Vec2 | null;
  /** Port currently open for constant value editing */
  editingPort: EditingPort | null;
  /** Arrow-key driven placement position for keyboard node placement */
  keyboardGhostPosition: GridPoint | null;

  /** Enter placing-node mode */
  startPlacingNode: (nodeType: string) => void;
  /** Cancel placement, return to idle */
  cancelPlacing: () => void;
  /** Rotate the current placement/drag by 90 degrees */
  rotatePlacement: () => void;
  /** Select a node on the gameboard */
  selectNode: (nodeId: NodeId) => void;
  /** Clear the current selection */
  clearSelection: () => void;
  /** Start drawing a wire from a port */
  startWireDraw: (fromPort: PortRef, fromPosition: Vec2) => void;
  /** Cancel wire drawing, return to idle */
  cancelWireDraw: () => void;
  /** Update mouse position (for wire preview) */
  setMousePosition: (pos: Vec2 | null) => void;
  /** Track which node the cursor is over */
  setHoveredNode: (nodeId: NodeId | null) => void;
  /** Open constant value editor for a port */
  startEditingPort: (nodeId: NodeId, portIndex: number, position: Vec2) => void;
  /** Close constant value editor */
  stopEditingPort: () => void;
  /** Enter keyboard wiring mode */
  startKeyboardWiring: (fromPort: PortRef, validTargets: PortRef[]) => void;
  /** Cycle through valid wiring targets */
  cycleWiringTarget: (direction: 1 | -1) => void;
  /** Cancel keyboard wiring, return to idle */
  cancelKeyboardWiring: () => void;
  /** Set the keyboard ghost position for arrow-key placement */
  setKeyboardGhostPosition: (pos: GridPoint | null) => void;
  /** Start dragging a node */
  startDragging: (node: NodeState, mousePos: Vec2) => void;
  /** Update drag position */
  updateDragPosition: (mousePos: Vec2) => void;
  /** Commit drag, move node to new position */
  commitDrag: () => { node: NodeState; newPosition: GridPoint; newRotation: NodeRotation } | null;
  /** Cancel drag, return to idle */
  cancelDrag: () => void;
}

/** Cycle rotation: 0 -> 90 -> 180 -> 270 -> 0 */
function nextRotation(rotation: NodeRotation): NodeRotation {
  const rotations: NodeRotation[] = [0, 90, 180, 270];
  const idx = rotations.indexOf(rotation);
  return rotations[(idx + 1) % 4];
}

export const createInteractionSlice: StateCreator<InteractionSlice> = (set, get) => ({
  interactionMode: { type: 'idle' },
  selectedNodeId: null,
  hoveredNodeId: null,
  mousePosition: null,
  editingPort: null,
  keyboardGhostPosition: null,

  startPlacingNode: (nodeType) =>
    set({ interactionMode: { type: 'placing-node', nodeType, rotation: 0 }, selectedNodeId: null }),

  cancelPlacing: () =>
    set({ interactionMode: { type: 'idle' }, keyboardGhostPosition: null }),

  rotatePlacement: () => {
    const mode = get().interactionMode;
    if (mode.type === 'placing-node') {
      set({ interactionMode: { ...mode, rotation: nextRotation(mode.rotation) } });
    } else if (mode.type === 'dragging-node') {
      set({ interactionMode: { ...mode, rotation: nextRotation(mode.rotation) } });
    }
  },

  selectNode: (nodeId) =>
    set({ selectedNodeId: nodeId, interactionMode: { type: 'idle' } }),

  clearSelection: () =>
    set({ selectedNodeId: null }),

  startWireDraw: (fromPort, fromPosition) =>
    set({
      interactionMode: { type: 'drawing-wire', fromPort, fromPosition },
      selectedNodeId: null,
    }),

  cancelWireDraw: () =>
    set({ interactionMode: { type: 'idle' } }),

  setMousePosition: (pos) =>
    set({ mousePosition: pos }),

  setHoveredNode: (nodeId) =>
    set({ hoveredNodeId: nodeId }),

  startEditingPort: (nodeId, portIndex, position) =>
    set({ editingPort: { nodeId, portIndex, position } }),

  stopEditingPort: () =>
    set({ editingPort: null }),

  startKeyboardWiring: (fromPort, validTargets) =>
    set({
      interactionMode: {
        type: 'keyboard-wiring',
        fromPort,
        validTargets,
        targetIndex: 0,
      },
      selectedNodeId: null,
    }),

  cycleWiringTarget: (direction) => {
    const mode = get().interactionMode;
    if (mode.type !== 'keyboard-wiring') return;
    const len = mode.validTargets.length;
    if (len === 0) return;
    const next = ((mode.targetIndex + direction) % len + len) % len;
    set({
      interactionMode: { ...mode, targetIndex: next },
    });
  },

  cancelKeyboardWiring: () =>
    set({ interactionMode: { type: 'idle' } }),

  setKeyboardGhostPosition: (pos) =>
    set({ keyboardGhostPosition: pos }),

  startDragging: (node, mousePos) => {
    // Calculate offset from mouse position to node position
    // This offset will be used to maintain the grab point during drag
    set({
      interactionMode: {
        type: 'dragging-node',
        draggedNode: node,
        offset: mousePos, // Store the initial mouse position
        originalPosition: node.position,
        rotation: node.rotation ?? 0,
      },
      selectedNodeId: node.id,
    });
  },

  updateDragPosition: (mousePos) => {
    set({ mousePosition: mousePos });
  },

  commitDrag: () => {
    const mode = get().interactionMode;
    if (mode.type !== 'dragging-node') return null;

    const mousePos = get().mousePosition;
    if (!mousePos) return null;

    const result = {
      node: mode.draggedNode,
      newPosition: { col: 0, row: 0 }, // Will be calculated by the caller
      newRotation: mode.rotation,
    };

    set({ interactionMode: { type: 'idle' } });
    return result;
  },

  cancelDrag: () =>
    set({ interactionMode: { type: 'idle' } }),
});
