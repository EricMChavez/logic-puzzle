import type { StateCreator } from 'zustand';
import type { ChipId, PortRef, Vec2, ChipRotation, ChipState } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';

/** Interaction mode discriminated union */
export type InteractionMode =
  | { type: 'idle' }
  | { type: 'placing-chip'; chipType: string; rotation: ChipRotation; dragPlacement?: boolean }
  | { type: 'drawing-path'; fromPort: PortRef; fromPosition: Vec2 }
  | { type: 'keyboard-wiring'; fromPort: PortRef; validTargets: PortRef[]; targetIndex: number }
  | { type: 'dragging-chip'; draggedChip: ChipState; grabOffset: GridPoint; originalPosition: GridPoint; rotation: ChipRotation }
  | { type: 'adjusting-knob'; chipId: ChipId; startY: number; startValue: number; knobCenter: { x: number; y: number } | null };

/** Port currently being edited for a constant value */
export interface EditingPort {
  chipId: ChipId;
  portIndex: number;
  position: Vec2;
}

export interface InteractionSlice {
  /** Current interaction mode */
  interactionMode: InteractionMode;
  /** Currently selected chip (for parameter editing) */
  selectedChipId: ChipId | null;
  /** Currently hovered chip (for visual highlight) */
  hoveredChipId: ChipId | null;
  /** Current mouse position on canvas (for path preview) */
  mousePosition: Vec2 | null;
  /** Port currently open for constant value editing */
  editingPort: EditingPort | null;
  /** Arrow-key driven placement position for keyboard chip placement */
  keyboardGhostPosition: GridPoint | null;

  /** Enter placing-chip mode */
  startPlacingChip: (chipType: string) => void;
  /** Cancel placement, return to idle */
  cancelPlacing: () => void;
  /** Rotate the current placement/drag by 90 degrees */
  rotatePlacement: () => void;
  /** Select a chip on the gameboard */
  selectChip: (chipId: ChipId) => void;
  /** Clear the current selection */
  clearSelection: () => void;
  /** Start drawing a path from a port */
  startPathDraw: (fromPort: PortRef, fromPosition: Vec2) => void;
  /** Cancel path drawing, return to idle */
  cancelPathDraw: () => void;
  /** Update mouse position (for path preview) */
  setMousePosition: (pos: Vec2 | null) => void;
  /** Track which chip the cursor is over */
  setHoveredChip: (chipId: ChipId | null) => void;
  /** Open constant value editor for a port */
  startEditingPort: (chipId: ChipId, portIndex: number, position: Vec2) => void;
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
  /** Start adjusting a mixer knob */
  startKnobAdjust: (chipId: ChipId, startY: number, startValue: number, knobCenter?: { x: number; y: number } | null) => void;
  /** Commit knob adjustment and return to idle */
  commitKnobAdjust: () => void;
  /** Start dragging a chip */
  startDragging: (chip: ChipState, grabOffset: GridPoint) => void;
  /** Update drag position */
  updateDragPosition: (mousePos: Vec2) => void;
  /** Commit drag, move chip to new position */
  commitDrag: () => { chip: ChipState; newPosition: GridPoint; newRotation: ChipRotation } | null;
  /** Cancel drag, return to idle */
  cancelDrag: () => void;
}

/** Cycle rotation: 0 -> 90 -> 180 -> 270 -> 0 */
function nextRotation(rotation: ChipRotation): ChipRotation {
  const rotations: ChipRotation[] = [0, 90, 180, 270];
  const idx = rotations.indexOf(rotation);
  return rotations[(idx + 1) % 4];
}

export const createInteractionSlice: StateCreator<InteractionSlice> = (set, get) => ({
  interactionMode: { type: 'idle' },
  selectedChipId: null,
  hoveredChipId: null,
  mousePosition: null,
  editingPort: null,
  keyboardGhostPosition: null,

  startPlacingChip: (chipType) =>
    set({ interactionMode: { type: 'placing-chip', chipType, rotation: 0 }, selectedChipId: null }),

  cancelPlacing: () =>
    set({ interactionMode: { type: 'idle' }, keyboardGhostPosition: null }),

  rotatePlacement: () => {
    const mode = get().interactionMode;
    if (mode.type === 'placing-chip') {
      set({ interactionMode: { ...mode, rotation: nextRotation(mode.rotation) } });
    } else if (mode.type === 'dragging-chip') {
      set({ interactionMode: { ...mode, rotation: nextRotation(mode.rotation) } });
    }
  },

  selectChip: (chipId) =>
    set({ selectedChipId: chipId, interactionMode: { type: 'idle' } }),

  clearSelection: () =>
    set({ selectedChipId: null }),

  startPathDraw: (fromPort, fromPosition) =>
    set({
      interactionMode: { type: 'drawing-path', fromPort, fromPosition },
      selectedChipId: null,
    }),

  cancelPathDraw: () =>
    set({ interactionMode: { type: 'idle' } }),

  setMousePosition: (pos) =>
    set({ mousePosition: pos }),

  setHoveredChip: (chipId) =>
    set({ hoveredChipId: chipId }),

  startEditingPort: (chipId, portIndex, position) =>
    set({ editingPort: { chipId, portIndex, position } }),

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
      selectedChipId: null,
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

  startKnobAdjust: (chipId, startY, startValue, knobCenter = null) =>
    set({
      interactionMode: { type: 'adjusting-knob', chipId, startY, startValue, knobCenter: knobCenter ?? null },
      selectedChipId: chipId,
    }),

  commitKnobAdjust: () =>
    set({ interactionMode: { type: 'idle' } }),

  startDragging: (chip, grabOffset) => {
    set({
      interactionMode: {
        type: 'dragging-chip',
        draggedChip: chip,
        grabOffset,
        originalPosition: chip.position,
        rotation: chip.rotation ?? 0,
      },
      selectedChipId: chip.id,
    });
  },

  updateDragPosition: (mousePos) => {
    set({ mousePosition: mousePos });
  },

  commitDrag: () => {
    const mode = get().interactionMode;
    if (mode.type !== 'dragging-chip') return null;

    const mousePos = get().mousePosition;
    if (!mousePos) return null;

    const result = {
      chip: mode.draggedChip,
      newPosition: { col: 0, row: 0 }, // Will be calculated by the caller
      newRotation: mode.rotation,
    };

    set({ interactionMode: { type: 'idle' } });
    return result;
  },

  cancelDrag: () =>
    set({ interactionMode: { type: 'idle' } }),
});
