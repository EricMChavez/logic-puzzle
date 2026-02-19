import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import type { GameboardId, GameboardState, ChipId, ChipState, Path, ChipRotation } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import { recomputeOccupancy, markNodeOccupied, clearNodeOccupied, createOccupancyGrid } from '../../shared/grid/index.ts';
import { creativeSlotId, utilitySlotId, createUtilitySlotNode } from '../../puzzle/connection-point-nodes.ts';
import type { MeterMode } from '../../gameboard/meters/meter-types.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';
import { getChipDefinition } from '../../engine/nodes/registry.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';

export interface GameboardSlice {
  /** The currently active gameboard */
  activeBoard: GameboardState | null;
  /** ID of the active gameboard */
  activeBoardId: GameboardId | null;
  /** Constant values for unconnected input ports. Key: "chipId:portIndex" */
  portConstants: Map<string, number>;
  /** Incremented on structural graph mutations (add/remove chip/path, param change) */
  graphVersion: number;
  /** Incremented only on topology-changing actions (add/remove/move chip/path). NOT incremented by param changes. */
  routingVersion: number;
  /** Occupancy grid (66x36): true = cell occupied by a chip bounding box */
  occupancy: boolean[][];

  /** Set the active gameboard */
  setActiveBoard: (board: GameboardState) => void;
  /** Add a chip to the active gameboard */
  addChip: (chip: ChipState) => void;
  /** Remove a chip from the active gameboard */
  removeChip: (chipId: ChipId) => void;
  /** Move a chip to a new position (and optionally rotate) */
  moveChip: (chipId: ChipId, newPosition: GridPoint, newRotation?: ChipRotation) => void;
  /** Add a path to the active gameboard */
  addPath: (path: Path) => void;
  /** Remove a path from the active gameboard */
  removePath: (pathId: string) => void;
  /** Update parameters on an existing chip */
  updateChipParams: (chipId: ChipId, params: Record<string, number | string | boolean>) => void;
  /** Replace path array on the active board (preserves portConstants) */
  updatePaths: (paths: Path[]) => void;
  /** Set a constant value for an unconnected input port */
  setPortConstant: (chipId: ChipId, portIndex: number, value: number) => void;
  /** Restore a board and its port constants (used by navigation zoom-out) */
  restoreBoard: (board: GameboardState, portConstants: Map<string, number>) => void;
  /** Update a creative slot node's direction (input/output/off) */
  updateCreativeSlotNode: (slotIndex: number, direction: 'input' | 'output' | 'off') => void;
  /** Add back a creative slot node that was previously removed (for 'off' -> other transition) */
  addCreativeSlotNode: (slotIndex: number, direction: 'input' | 'output') => void;
  /** Batch update chip params + port constant in a single set() with one graphVersion bump. Used during knob drag. */
  batchKnobAdjust: (chipId: ChipId, paramKey: string, portIndex: number, value: number) => void;
  /** Toggle a meter slot's mode during utility editing: input→output→off→input. Returns false if blocked by paths. */
  toggleMeterMode: (cpIndex: number) => boolean;
}

/**
 * Reconstruct knob-derived portConstants from chip params.
 * Called when loading a saved board so knob values feed into the cycle evaluator.
 */
export function reconstructKnobConstants(board: GameboardState): Map<string, number> {
  const map = new Map<string, number>();
  for (const [chipId, chip] of board.chips) {
    const def = getChipDefinition(chip.type);
    const knob = getKnobConfig(def);
    if (knob) {
      const value = chip.params[knob.paramKey];
      if (typeof value === 'number') {
        map.set(`${chipId}:${knob.portIndex}`, value);
      }
    }
  }
  return map;
}

export const createGameboardSlice: StateCreator<GameStore, [], [], GameboardSlice> = (set, get) => ({
  activeBoard: null,
  activeBoardId: null,
  portConstants: new Map<string, number>(),
  graphVersion: 0,
  routingVersion: 0,
  occupancy: createOccupancyGrid(),

  setActiveBoard: (board) =>
    set((state) => ({
      activeBoard: board,
      activeBoardId: board.id,
      portConstants: reconstructKnobConstants(board),
      occupancy: recomputeOccupancy(board.chips),
      graphVersion: state.graphVersion + 1,
      routingVersion: state.routingVersion + 1,
    })),

  addChip: (chip) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chips = new Map(state.activeBoard.chips);
      chips.set(chip.id, chip);
      const occupancy = state.occupancy.map((col) => [...col]);
      markNodeOccupied(occupancy, chip);
      return {
        activeBoard: { ...state.activeBoard, chips },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  removeChip: (chipId) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chip = state.activeBoard.chips.get(chipId);
      // Locked chips cannot be deleted
      if (chip?.locked) return state;
      const chips = new Map(state.activeBoard.chips);
      chips.delete(chipId);
      const paths = state.activeBoard.paths.filter(
        (w) => w.source.chipId !== chipId && w.target.chipId !== chipId
      );
      const occupancy = state.occupancy.map((col) => [...col]);
      if (chip) clearNodeOccupied(occupancy, chip);
      return {
        activeBoard: { ...state.activeBoard, chips, paths },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  moveChip: (chipId, newPosition, newRotation) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chip = state.activeBoard.chips.get(chipId);
      if (!chip) return state;

      // Clear old position
      const occupancy = state.occupancy.map((col) => [...col]);
      clearNodeOccupied(occupancy, chip);

      // Update chip with new position and rotation
      const updatedChip: ChipState = {
        ...chip,
        position: newPosition,
        rotation: newRotation ?? chip.rotation,
      };

      // Mark new position
      markNodeOccupied(occupancy, updatedChip);

      const chips = new Map(state.activeBoard.chips);
      chips.set(chipId, updatedChip);

      return {
        activeBoard: { ...state.activeBoard, chips },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  addPath: (path) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: {
          ...state.activeBoard,
          paths: [...state.activeBoard.paths, path],
        },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
      };
    }),

  removePath: (pathId) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: {
          ...state.activeBoard,
          paths: state.activeBoard.paths.filter((w) => w.id !== pathId),
        },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
      };
    }),

  updateChipParams: (chipId, params) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chip = state.activeBoard.chips.get(chipId);
      if (!chip) return state;
      const chips = new Map(state.activeBoard.chips);
      chips.set(chipId, { ...chip, params: { ...chip.params, ...params } });
      return {
        activeBoard: { ...state.activeBoard, chips },
        graphVersion: state.graphVersion + 1,
      };
    }),

  updatePaths: (paths) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: { ...state.activeBoard, paths },
      };
    }),

  setPortConstant: (chipId, portIndex, value) =>
    set((state) => {
      const key = `${chipId}:${portIndex}`;
      const portConstants = new Map(state.portConstants);
      portConstants.set(key, value);
      return { portConstants, graphVersion: state.graphVersion + 1 };
    }),

  restoreBoard: (board, portConstants) =>
    set((state) => ({
      activeBoard: board,
      activeBoardId: board.id,
      portConstants,
      occupancy: recomputeOccupancy(board.chips),
      graphVersion: state.graphVersion + 1,
      routingVersion: state.routingVersion + 1,
    })),

  updateCreativeSlotNode: (slotIndex, direction) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chipId = creativeSlotId(slotIndex);
      const existingChip = state.activeBoard.chips.get(chipId);

      const chips = new Map(state.activeBoard.chips);
      const occupancy = state.occupancy.map((col) => [...col]);

      // Handle 'off' direction: remove the chip
      if (direction === 'off') {
        if (existingChip) {
          chips.delete(chipId);
          clearNodeOccupied(occupancy, existingChip);
        }
        return {
          activeBoard: { ...state.activeBoard, chips },
          graphVersion: state.graphVersion + 1,
          routingVersion: state.routingVersion + 1,
          occupancy,
        };
      }

      // For input/output: update existing chip
      if (!existingChip) return state;
      chips.set(chipId, {
        ...existingChip,
        type: direction === 'input' ? 'connection-input' : 'connection-output',
        socketCount: direction === 'input' ? 0 : 1,
        plugCount: direction === 'input' ? 1 : 0,
      });
      return {
        activeBoard: { ...state.activeBoard, chips },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
      };
    }),

  addCreativeSlotNode: (slotIndex, direction) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chipId = creativeSlotId(slotIndex);

      // Don't add if already exists
      if (state.activeBoard.chips.has(chipId)) return state;

      // Create a minimal chip structure
      const chip: ChipState = {
        id: chipId,
        type: direction === 'input' ? 'connection-input' : 'connection-output',
        position: { col: slotIndex < 3 ? 0 : 60, row: 6 + slotIndex % 3 * 10 },
        rotation: 0,
        socketCount: direction === 'input' ? 0 : 1,
        plugCount: direction === 'input' ? 1 : 0,
        params: {},
      };

      const chips = new Map(state.activeBoard.chips);
      chips.set(chipId, chip);
      const occupancy = state.occupancy.map((col) => [...col]);
      markNodeOccupied(occupancy, chip);

      return {
        activeBoard: { ...state.activeBoard, chips },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  toggleMeterMode: (cpIndex) => {
    const state = get();
    if (!state.activeBoard) return false;

    const chipId = utilitySlotId(cpIndex);

    // Check if any paths connect to this CP — block toggle if so
    const hasPaths = state.activeBoard.paths.some(
      (w) => w.source.chipId === chipId || w.target.chipId === chipId,
    );
    if (hasPaths) return false;

    // Read current mode from meter slot (flat slot index key)
    const key = meterKey(cpIndex);
    const slot = state.meterSlots.get(key);
    const currentMode: MeterMode = slot?.mode ?? 'off';

    const nextModeMap: Record<string, MeterMode> = {
      input: 'output',
      output: 'off',
      off: 'input',
    };
    const nextMode = nextModeMap[currentMode] ?? 'input';

    // Update meter slot
    const slots = new Map(state.meterSlots);
    slots.set(key, { mode: nextMode });

    // Update board chips
    const chips = new Map(state.activeBoard.chips);
    if (chips.has(chipId)) {
      chips.delete(chipId);
    }
    if (nextMode === 'input' || nextMode === 'output') {
      const newChip = createUtilitySlotNode(cpIndex, nextMode);
      chips.set(newChip.id, newChip);
    }

    set({
      activeBoard: { ...state.activeBoard, chips },
      meterSlots: slots,
      graphVersion: state.graphVersion + 1,
      routingVersion: state.routingVersion + 1,
    });

    return true;
  },

  batchKnobAdjust: (chipId, paramKey, portIndex, value) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chip = state.activeBoard.chips.get(chipId);
      if (!chip) return state;
      const chips = new Map(state.activeBoard.chips);
      chips.set(chipId, { ...chip, params: { ...chip.params, [paramKey]: value } });
      const key = `${chipId}:${portIndex}`;
      const portConstants = new Map(state.portConstants);
      portConstants.set(key, value);
      return {
        activeBoard: { ...state.activeBoard, chips },
        portConstants,
        graphVersion: state.graphVersion + 1,
      };
    }),
});
