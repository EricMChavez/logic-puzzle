import type { StateCreator } from 'zustand';
import type { NodeState, GameboardState, Wire } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import type { WaveformDef, PuzzleDefinition, AllowedNodes, SlotConfig } from '../../puzzle/types.ts';
import type { MeterMode } from '../../gameboard/meters/meter-types.ts';
import { buildSlotConfigFromDirections } from '../../puzzle/types.ts';
import { createConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';

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
  /** Initial nodes (serialized) — starting nodes pre-placed on the board */
  initialNodes: Array<{
    id: string;
    type: string;
    position: { col: number; row: number };
    params: Record<string, unknown>;
    inputCount: number;
    outputCount: number;
    rotation?: 0 | 90 | 180 | 270;
    locked?: boolean;
  }>;
  /** Initial wires (serialized) */
  initialWires: Array<{
    source: { chipId: string; portIndex: number };
    target: { chipId: string; portIndex: number };
  }>;
  /** Node type budgets. null = all unlimited. Record maps type → max count (-1 = unlimited). */
  allowedNodes: AllowedNodes;
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
  initialNodes: CustomPuzzle['initialNodes'];
  initialWires: CustomPuzzle['initialWires'];
  /** Node type budgets. Accepts legacy string[] or new Record<string, number>. null = all. */
  allowedNodes?: string[] | Record<string, number> | null;
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
      exitCreativeMode: () => void;
      setActiveBoard: (board: GameboardState) => void;
      loadPuzzle: (puzzle: PuzzleDefinition) => void;
      initializeMeters: (config: SlotConfig, inactiveMode?: MeterMode) => void;
    };

    // Exit creative mode
    store.exitCreativeMode();

    // Build gameboard with CP nodes based on slot configuration
    const nodes = new Map<string, NodeState>();
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

    // Place starting nodes at their saved positions
    for (const sn of puzzle.initialNodes) {
      const startingNode: NodeState = {
        id: sn.id,
        type: sn.type,
        position: { col: sn.position.col, row: sn.position.row },
        params: sn.params as Record<string, number | string | boolean>,
        inputCount: sn.inputCount,
        outputCount: sn.outputCount,
        rotation: sn.rotation,
        locked: sn.locked ?? false,
      };
      nodes.set(startingNode.id, startingNode);
    }

    // Build initial wires from puzzle definition
    const paths: Wire[] = [];
    for (const wireDef of puzzle.initialWires) {
      const wireId = `wire-${wireDef.source.chipId}-${wireDef.source.portIndex}-${wireDef.target.chipId}-${wireDef.target.portIndex}`;
      paths.push(createWire(
        wireId,
        { chipId: wireDef.source.chipId, portIndex: wireDef.source.portIndex, side: 'output' },
        { chipId: wireDef.target.chipId, portIndex: wireDef.target.portIndex, side: 'input' },
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
      allowedNodes: puzzle.allowedNodes ?? null,
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
    store.loadPuzzle(puzzleDef);
    store.setActiveBoard(board);
    store.initializeMeters(slotConfig, 'hidden');
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
        initialNodes: puzzle.initialNodes,
        initialWires: puzzle.initialWires,
        allowedNodes: puzzle.allowedNodes,
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
      let allowedNodes: AllowedNodes;
      if (Array.isArray(s.allowedNodes)) {
        allowedNodes = Object.fromEntries(s.allowedNodes.map(t => [t, -1]));
      } else {
        allowedNodes = s.allowedNodes ?? null;
      }

      // Ensure locked field defaults to false for old entries
      const initialNodes = s.initialNodes.map(n => ({
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
        initialNodes,
        initialWires: s.initialWires,
        allowedNodes,
        tutorialMessage: s.tutorialMessage,
        tutorialTitle: s.tutorialTitle,
      });
    }
    set({ customPuzzles: puzzles });
  },
});
