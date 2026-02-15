import type { PuzzleNodeEntry, UtilityNodeEntry } from './slices/palette-slice.ts';
import type { GameboardState, NodeId, NodeState, Wire } from '../shared/types/index.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';

const STORAGE_KEY = 'wavelength-save';
const SCHEMA_VERSION = 2;

// --- Serialized types ---

interface SerializedGameboard {
  id: string;
  chips: [NodeId, NodeState][];
  paths: Wire[];
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
    chips: Array.from(board.chips.entries()),
    paths: board.paths,
  };
}

export function deserializeGameboard(data: SerializedGameboard): GameboardState {
  return {
    id: data.id,
    chips: new Map(data.chips),
    paths: data.paths,
  };
}

// --- V1 → V2 migration ---

interface V1PortRef {
  nodeId: string;
  portIndex: number;
  side: 'input' | 'output';
}

interface V1Wire {
  id: string;
  source: V1PortRef;
  target: V1PortRef;
  path?: unknown[];
}

interface V1SerializedGameboard {
  id: string;
  nodes?: [string, NodeState][];
  chips?: [string, NodeState][];
  wires?: V1Wire[];
  paths?: Wire[];
}

function migratePortRef(ref: V1PortRef | Wire['source']): Wire['source'] {
  if ('nodeId' in ref) {
    return { chipId: ref.nodeId, portIndex: ref.portIndex, side: ref.side };
  }
  return ref as Wire['source'];
}

function migrateWire(w: V1Wire | Wire): Wire {
  const migrated: Wire = {
    id: w.id,
    source: migratePortRef(w.source),
    target: migratePortRef(w.target),
    route: [],
  };
  // Migrate path → route if present
  if ('route' in w && Array.isArray(w.route)) {
    migrated.route = w.route;
  } else if ('path' in w && Array.isArray((w as V1Wire).path)) {
    migrated.route = (w as V1Wire).path as Wire['route'];
  }
  return migrated;
}

function migrateGameboard(data: V1SerializedGameboard): SerializedGameboard {
  return {
    id: data.id,
    chips: data.chips ?? data.nodes ?? [],
    paths: (data.paths ?? data.wires ?? []).map(migrateWire),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV1toV2(data: any): PersistedState {
  return {
    version: 2,
    completedLevels: data.completedLevels ?? [],
    currentLevelIndex: data.currentLevelIndex ?? 0,
    puzzleNodes: data.puzzleNodes ?? [],
    utilityNodes: (data.utilityNodes ?? []).map(([key, entry]: [string, any]) => [
      key,
      {
        ...entry,
        board: migrateGameboard(entry.board),
      },
    ]),
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
    const data = JSON.parse(json);
    if (!data || typeof data.version !== 'number') return null;

    // Migrate v1 → v2
    let persisted: PersistedState;
    if (data.version === 1) {
      persisted = migrateV1toV2(data);
    } else if (data.version === SCHEMA_VERSION) {
      persisted = data as PersistedState;
    } else {
      return null; // Unknown version
    }

    // Validate field types (guard against corrupted/tampered data)
    const completedLevels = Array.isArray(persisted.completedLevels) ? persisted.completedLevels : [];
    const currentLevelIndex = typeof persisted.currentLevelIndex === 'number' ? persisted.currentLevelIndex : 0;
    const puzzleNodes = Array.isArray(persisted.puzzleNodes) ? persisted.puzzleNodes : [];
    const utilityNodes = Array.isArray(persisted.utilityNodes) ? persisted.utilityNodes : [];

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
