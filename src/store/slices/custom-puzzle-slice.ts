import type { StateCreator } from 'zustand';
import type { ChipState, GameboardState, Path } from '../../shared/types/index.ts';
import { createPath } from '../../shared/types/index.ts';
import type { WaveformDef, PuzzleDefinition, AllowedChips, SlotConfig } from '../../puzzle/types.ts';
import type { MeterMode } from '../../gameboard/meters/meter-types.ts';
import { buildSlotConfigFromDirections } from '../../puzzle/types.ts';
import { createConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { withSoundsSuppressed } from '../../shared/audio/index.ts';

/** Definition of a custom puzzle created in Creative Mode */
export interface CustomPuzzle {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  /** Slot configuration for all 6 connection points */
  slots: Array<{
    direction: 'input' | 'output' | 'off';
    waveform?: WaveformDef;
  }>;
  /** Target output samples (one array per active output slot) */
  targetSamples: Map<number, number[]>;
  /** Initial chips (serialized) — starting chips pre-placed on the board */
  initialChips: Array<{
    id: string;
    type: string;
    position: { col: number; row: number };
    params: Record<string, unknown>;
    socketCount: number;
    plugCount: number;
    rotation?: 0 | 90 | 180 | 270;
    locked?: boolean;
  }>;
  /** Initial paths (serialized) */
  initialPaths: Array<{
    source: { chipId: string; portIndex: number };
    target: { chipId: string; portIndex: number };
  }>;
  /** Chip type budgets. null = all unlimited. Record maps type → max count (-1 = unlimited). */
  allowedChips: AllowedChips;
  /** Optional tutorial message displayed on the gameboard surface */
  tutorialMessage?: string;
  /** Optional card title (rendered in Bungee font above message) */
  tutorialTitle?: string;
}

/** Serialized format for localStorage */
export interface SerializedCustomPuzzle {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  slots: Array<{
    direction: 'input' | 'output' | 'off';
    waveform?: WaveformDef;
  }>;
  /** Target samples as array of [slotIndex, samples[]] pairs */
  targetSamples: Array<[number, number[]]>;
  initialChips: CustomPuzzle['initialChips'];
  initialPaths: CustomPuzzle['initialPaths'];
  /** Chip type budgets. Accepts legacy string[] or new Record<string, number>. null = all. */
  allowedChips?: string[] | Record<string, number> | null;
  tutorialMessage?: string;
  tutorialTitle?: string;
}

export interface CustomPuzzleSlice {
  /** Map of custom puzzle ID to definition */
  customPuzzles: Map<string, CustomPuzzle>;

  /** Add a new custom puzzle */
  addCustomPuzzle: (puzzle: CustomPuzzle) => void;
  /** Remove a custom puzzle by ID */
  removeCustomPuzzle: (puzzleId: string) => void;
  /** Load a custom puzzle into the active board */
  loadCustomPuzzle: (puzzleId: string) => void;
  /** Get serializable state for persistence */
  getSerializableCustomPuzzles: () => SerializedCustomPuzzle[];
  /** Hydrate from serialized state */
  hydrateCustomPuzzles: (puzzles: SerializedCustomPuzzle[]) => void;
}

export const createCustomPuzzleSlice: StateCreator<CustomPuzzleSlice> = (set, get) => ({
  customPuzzles: new Map(),

  addCustomPuzzle: (puzzle) =>
    set((state) => {
      const newMap = new Map(state.customPuzzles);
      newMap.set(puzzle.id, puzzle);
      return { customPuzzles: newMap };
    }),

  removeCustomPuzzle: (puzzleId) =>
    set((state) => {
      const newMap = new Map(state.customPuzzles);
      newMap.delete(puzzleId);
      return { customPuzzles: newMap };
    }),

  loadCustomPuzzle: (puzzleId) => {
    const puzzle = get().customPuzzles.get(puzzleId);
    if (!puzzle) return;

    // Cast get() to full store type to access other slices
    // This is safe because Zustand composes all slices into one store
    const store = get() as unknown as {
      setActiveBoard: (board: GameboardState) => void;
      loadPuzzle: (puzzle: PuzzleDefinition) => void;
      initializeMeters: (config: SlotConfig, inactiveMode?: MeterMode) => void;
    };

    // Build gameboard with CP nodes based on slot configuration
    const nodes = new Map<string, ChipState>();
    let inputCount = 0;
    let outputCount = 0;

    for (let i = 0; i < puzzle.slots.length; i++) {
      const slot = puzzle.slots[i];
      if (slot.direction === 'off') continue;

      const isLeftSide = i < 3;
      const physicalSide: 'left' | 'right' = isLeftSide ? 'left' : 'right';
      const meterIndex = isLeftSide ? i : i - 3;
      const cpType = slot.direction === 'input' ? 'input' : 'output';
      const cpIndex = slot.direction === 'input' ? inputCount++ : outputCount++;

      const node = createConnectionPointNode(cpType, cpIndex, { physicalSide, meterIndex });
      nodes.set(node.id, node);
    }

    // Place starting chips at their saved positions
    for (const sn of puzzle.initialChips) {
      const startingChip: ChipState = {
        id: sn.id,
        type: sn.type,
        position: { col: sn.position.col, row: sn.position.row },
        params: sn.params as Record<string, number | string | boolean>,
        socketCount: sn.socketCount,
        plugCount: sn.plugCount,
        rotation: sn.rotation,
        locked: sn.locked ?? false,
      };
      nodes.set(startingChip.id, startingChip);
    }

    // Build initial paths from puzzle definition
    const paths: Path[] = [];
    for (const pathDef of puzzle.initialPaths) {
      const pathId = `path-${pathDef.source.chipId}-${pathDef.source.portIndex}-${pathDef.target.chipId}-${pathDef.target.portIndex}`;
      paths.push(createPath(
        pathId,
        { chipId: pathDef.source.chipId, portIndex: pathDef.source.portIndex, side: 'plug' },
        { chipId: pathDef.target.chipId, portIndex: pathDef.target.portIndex, side: 'socket' },
      ));
    }

    // Create gameboard
    const board: GameboardState = {
      id: `custom-puzzle-${puzzle.id}`,
      chips: nodes,
      paths,
    };

    // Build test case with inputs (from slot waveforms) and expected outputs (from samples)
    const inputs: WaveformDef[] = [];
    const expectedOutputs: WaveformDef[] = [];

    for (let i = 0; i < puzzle.slots.length; i++) {
      const slot = puzzle.slots[i];
      if (slot.direction === 'input' && slot.waveform) {
        inputs.push(slot.waveform);
      } else if (slot.direction === 'output') {
        const samples = puzzle.targetSamples.get(i);
        if (samples) {
          expectedOutputs.push({
            shape: 'samples',
            amplitude: 100,
            period: samples.length,
            phase: 0,
            offset: 0,
            samples: samples,
          });
        }
      }
    }

    // Build SlotConfig from slot layout — 1:1 positional mapping (no packing)
    const dirs = puzzle.slots.map(s => s.direction);
    const slotConfig = buildSlotConfigFromDirections(dirs);

    // Build puzzle definition
    const puzzleDef: PuzzleDefinition = {
      id: puzzle.id,
      title: puzzle.title,
      description: puzzle.description,
      activeInputs: inputCount,
      activeOutputs: outputCount,
      allowedChips: puzzle.allowedChips ?? null,
      testCases: [{
        name: 'Custom',
        inputs,
        expectedOutputs,
      }],
      slotConfig,
      tutorialMessage: puzzle.tutorialMessage,
      tutorialTitle: puzzle.tutorialTitle,
    };

    // Load into store — loadPuzzle MUST come before setActiveBoard so that
    // the cycle runner subscriber sees activePuzzle when evaluating the new board
    withSoundsSuppressed(() => {
      store.loadPuzzle(puzzleDef);
      store.setActiveBoard(board);
      store.initializeMeters(slotConfig, 'off');
    });
  },

  getSerializableCustomPuzzles: () => {
    const puzzles: SerializedCustomPuzzle[] = [];
    for (const puzzle of get().customPuzzles.values()) {
      puzzles.push({
        id: puzzle.id,
        title: puzzle.title,
        description: puzzle.description,
        createdAt: puzzle.createdAt,
        slots: puzzle.slots,
        targetSamples: Array.from(puzzle.targetSamples.entries()),
        initialChips: puzzle.initialChips,
        initialPaths: puzzle.initialPaths,
        allowedChips: puzzle.allowedChips,
        tutorialMessage: puzzle.tutorialMessage,
        tutorialTitle: puzzle.tutorialTitle,
      });
    }
    return puzzles;
  },

  hydrateCustomPuzzles: (serialized) => {
    const puzzles = new Map<string, CustomPuzzle>();
    for (const s of serialized) {
      // Migrate legacy string[] → Record<string, -1>
      let allowedChips: AllowedChips;
      if (Array.isArray(s.allowedChips)) {
        allowedChips = Object.fromEntries(s.allowedChips.map(t => [t, -1]));
      } else {
        allowedChips = s.allowedChips ?? null;
      }

      // Ensure locked field defaults to false for old entries
      const initialChips = s.initialChips.map(n => ({
        ...n,
        locked: n.locked ?? false,
      }));

      puzzles.set(s.id, {
        id: s.id,
        title: s.title,
        description: s.description,
        createdAt: s.createdAt,
        slots: s.slots,
        targetSamples: new Map(s.targetSamples),
        initialChips,
        initialPaths: s.initialPaths,
        allowedChips,
        tutorialMessage: s.tutorialMessage,
        tutorialTitle: s.tutorialTitle,
      });
    }
    set({ customPuzzles: puzzles });
  },
});
