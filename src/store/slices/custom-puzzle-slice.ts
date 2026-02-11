import type { StateCreator } from 'zustand';
import type { NodeState, Wire, GameboardState } from '../../shared/types/index.ts';
import type { WaveformDef, ConnectionPointConfig, PuzzleDefinition, PuzzleTestCase } from '../../puzzle/types.ts';
import { createConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';
import { PLAYABLE_START } from '../../shared/grid/index.ts';

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
  }>;
  /** Initial wires (serialized) */
  initialWires: Array<{
    source: { nodeId: string; portIndex: number };
    target: { nodeId: string; portIndex: number };
  }>;
  /** Which fundamental node types are available in the palette. null = all allowed */
  allowedNodes: string[] | null;
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
  /** Which fundamental node types are available. null = all. Optional for backward compat. */
  allowedNodes?: string[] | null;
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
      initializeMeters: (config: ConnectionPointConfig, state?: string) => void;
    };

    // Exit creative mode
    store.exitCreativeMode();

    // Build gameboard with CP nodes based on slot configuration
    const nodes = new Map<string, NodeState>();
    let inputCount = 0;
    let outputCount = 0;
    // Track cpIndex per slot for meter config
    const slotCpIndices: (number | undefined)[] = new Array(puzzle.slots.length).fill(undefined);

    for (let i = 0; i < puzzle.slots.length; i++) {
      const slot = puzzle.slots[i];
      if (slot.direction === 'off') continue;

      const isLeftSide = i < 3;
      const physicalSide: 'left' | 'right' = isLeftSide ? 'left' : 'right';
      const meterIndex = isLeftSide ? i : i - 3;
      const cpType = slot.direction === 'input' ? 'input' : 'output';
      const cpIndex = slot.direction === 'input' ? inputCount++ : outputCount++;
      slotCpIndices[i] = cpIndex;

      const node = createConnectionPointNode(cpType, cpIndex, { physicalSide, meterIndex });
      nodes.set(node.id, node);
    }

    // Place starting nodes (locked, horizontally centered in playable area)
    const PLAYABLE_COLS = 46; // PLAYABLE_END - PLAYABLE_START
    if (puzzle.initialNodes.length > 0) {
      // Compute total width needed for all starting nodes
      let totalWidth = 0;
      const nodeWidths: number[] = [];
      for (const sn of puzzle.initialNodes) {
        const def = getNodeDefinition(sn.type);
        const w = def ? def.size.width : 3;
        nodeWidths.push(w);
        totalWidth += w;
      }
      // Add 1-col gaps between nodes
      totalWidth += Math.max(0, puzzle.initialNodes.length - 1);

      let currentCol = PLAYABLE_START + Math.floor((PLAYABLE_COLS - totalWidth) / 2);
      const startRow = 10;

      for (let i = 0; i < puzzle.initialNodes.length; i++) {
        const sn = puzzle.initialNodes[i];
        const startingNode: NodeState = {
          id: sn.id,
          type: sn.type,
          position: { col: currentCol, row: startRow },
          params: sn.params as Record<string, number | string | boolean>,
          inputCount: sn.inputCount,
          outputCount: sn.outputCount,
          rotation: sn.rotation,
          locked: true,
        };
        nodes.set(startingNode.id, startingNode);
        currentCol += nodeWidths[i] + 1;
      }
    }

    // Create gameboard
    const board: GameboardState = {
      id: `custom-puzzle-${puzzle.id}`,
      nodes,
      wires: [],
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

    // Build meter config from slot layout — 1:1 positional mapping (no packing)
    // Slots 0-2 map to left meters 0-2, slots 3-5 map to right meters 0-2
    const leftMeters = puzzle.slots.slice(0, 3).map((slot, i) => ({
      active: slot.direction !== 'off',
      direction: (slot.direction === 'off' ? 'input' : slot.direction) as 'input' | 'output',
      cpIndex: slotCpIndices[i],
    }));
    const rightMeters = puzzle.slots.slice(3, 6).map((slot, i) => ({
      active: slot.direction !== 'off',
      direction: (slot.direction === 'off' ? 'output' : slot.direction) as 'input' | 'output',
      cpIndex: slotCpIndices[i + 3],
    }));

    const cpConfig: ConnectionPointConfig = { left: leftMeters, right: rightMeters };

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
      connectionPoints: cpConfig,
    };

    // Load into store
    store.setActiveBoard(board);
    store.loadPuzzle(puzzleDef);
    store.initializeMeters(cpConfig, 'dimmed');
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
      });
    }
    return puzzles;
  },

  hydrateCustomPuzzles: (serialized) => {
    const puzzles = new Map<string, CustomPuzzle>();
    for (const s of serialized) {
      puzzles.set(s.id, {
        id: s.id,
        title: s.title,
        description: s.description,
        createdAt: s.createdAt,
        slots: s.slots,
        targetSamples: new Map(s.targetSamples),
        initialNodes: s.initialNodes,
        initialWires: s.initialWires,
        allowedNodes: s.allowedNodes ?? null,
      });
    }
    set({ customPuzzles: puzzles });
  },
});
