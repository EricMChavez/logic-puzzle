import type { PuzzleNodeEntry, UtilityNodeEntry } from './slices/palette-slice.ts';
import type { GameboardState, NodeId, NodeState, Wire } from '../shared/types/index.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';

const STORAGE_KEY = 'logic-puzzle-save';
const SCHEMA_VERSION = 1;

// --- Serialized types ---

interface SerializedGameboard {
  id: string;
  nodes: [NodeId, NodeState][];
  wires: Wire[];
}

interface SerializedUtilityEntry {
  utilityId: string;
  title: string;
  inputCount: number;
  outputCount: number;
  bakeMetadata: BakeMetadata;
  board: SerializedGameboard;
  versionHash: string;
}

export interface PersistedState {
  version: number;
  completedLevels: string[];
  currentLevelIndex: number;
  puzzleNodes: [string, PuzzleNodeEntry][];
  utilityNodes: [string, SerializedUtilityEntry][];
}

/** Fields that get persisted and hydrated */
export interface HydratableState {
  completedLevels: Set<string>;
  currentLevelIndex: number;
  puzzleNodes: Map<string, PuzzleNodeEntry>;
  utilityNodes: Map<string, UtilityNodeEntry>;
}

// --- Gameboard serialization ---

export function serializeGameboard(board: GameboardState): SerializedGameboard {
  return {
    id: board.id,
    nodes: Array.from(board.nodes.entries()),
    wires: board.wires.map((w) => ({ ...w, signalBuffer: Array(16).fill(0), writeHead: 0 })),
  };
}

export function deserializeGameboard(data: SerializedGameboard): GameboardState {
  return {
    id: data.id,
    nodes: new Map(data.nodes),
    wires: data.wires,
  };
}

// --- State serialization ---

export function serializeState(state: HydratableState): PersistedState {
  return {
    version: SCHEMA_VERSION,
    completedLevels: Array.from(state.completedLevels),
    currentLevelIndex: state.currentLevelIndex,
    puzzleNodes: Array.from(state.puzzleNodes.entries()),
    utilityNodes: Array.from(state.utilityNodes.entries()).map(([key, entry]) => [
      key,
      {
        utilityId: entry.utilityId,
        title: entry.title,
        inputCount: entry.inputCount,
        outputCount: entry.outputCount,
        bakeMetadata: entry.bakeMetadata,
        board: serializeGameboard(entry.board),
        versionHash: entry.versionHash,
      },
    ]),
  };
}

export function deserializeState(json: string): HydratableState | null {
  try {
    const data: PersistedState = JSON.parse(json);
    if (!data || typeof data.version !== 'number') return null;
    if (data.version !== SCHEMA_VERSION) return null;

    // Validate field types (guard against corrupted/tampered data)
    const completedLevels = Array.isArray(data.completedLevels) ? data.completedLevels : [];
    const currentLevelIndex = typeof data.currentLevelIndex === 'number' ? data.currentLevelIndex : 0;
    const puzzleNodes = Array.isArray(data.puzzleNodes) ? data.puzzleNodes : [];
    const utilityNodes = Array.isArray(data.utilityNodes) ? data.utilityNodes : [];

    return {
      completedLevels: new Set(completedLevels),
      currentLevelIndex,
      puzzleNodes: new Map(puzzleNodes),
      utilityNodes: new Map(
        utilityNodes.map(([key, entry]) => [
          key,
          {
            ...entry,
            board: deserializeGameboard(entry.board),
          },
        ]),
      ),
    };
  } catch {
    return null;
  }
}

// --- localStorage adapter ---

export function saveToStorage(state: HydratableState): boolean {
  try {
    const serialized = serializeState(state);
    const json = JSON.stringify(serialized);
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(): HydratableState | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return deserializeState(json);
  } catch {
    return null;
  }
}

// --- Auto-save with debounce ---

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(state: HydratableState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveToStorage(state);
    saveTimer = null;
  }, 100);
}

/** Returns true if state changed in persistence-relevant fields */
export function persistenceFieldsChanged(
  state: HydratableState,
  prev: HydratableState,
): boolean {
  return (
    state.completedLevels !== prev.completedLevels ||
    state.currentLevelIndex !== prev.currentLevelIndex ||
    state.puzzleNodes !== prev.puzzleNodes ||
    state.utilityNodes !== prev.utilityNodes
  );
}

/** Set up auto-save subscription and hydrate from localStorage */
export function initPersistence(store: {
  getState(): HydratableState;
  setState(partial: Partial<HydratableState>): void;
  subscribe(listener: (state: HydratableState, prev: HydratableState) => void): () => void;
}): void {
  // Hydrate from saved state
  const saved = loadFromStorage();
  if (saved) {
    store.setState(saved);
  }

  // Auto-save on persistence-relevant changes
  store.subscribe((state, prev) => {
    if (persistenceFieldsChanged(state, prev)) {
      debouncedSave(state);
    }
  });
}
