import type { CraftedPuzzleEntry, CraftedUtilityEntry } from './slices/palette-slice.ts';
import type { GameboardState, ChipId, ChipState, Path } from '../shared/types/index.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';

const STORAGE_KEY = 'wavelength-save';
const SCHEMA_VERSION = 3;

// --- Serialized types ---

interface SerializedGameboard {
  id: string;
  chips: [ChipId, ChipState][];
  paths: Path[];
}

interface SerializedUtilityEntry {
  utilityId: string;
  title: string;
  socketCount: number;
  plugCount: number;
  bakeMetadata: BakeMetadata;
  board: SerializedGameboard;
  versionHash: string;
}

export interface PersistedState {
  version: number;
  completedLevels: string[];
  currentLevelIndex: number;
  craftedPuzzles: [string, CraftedPuzzleEntry][];
  craftedUtilities: [string, SerializedUtilityEntry][];
}

/** Fields that get persisted and hydrated */
export interface HydratableState {
  completedLevels: Set<string>;
  currentLevelIndex: number;
  craftedPuzzles: Map<string, CraftedPuzzleEntry>;
  craftedUtilities: Map<string, CraftedUtilityEntry>;
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
  nodes?: [string, ChipState][];
  chips?: [string, ChipState][];
  wires?: V1Wire[];
  paths?: Path[];
}

function migrateV1PortRef(ref: V1PortRef | Path['source']): Path['source'] {
  if ('nodeId' in ref) {
    return { chipId: ref.nodeId, portIndex: ref.portIndex, side: ref.side as 'socket' | 'plug' };
  }
  return ref as Path['source'];
}

function migrateV1Wire(w: V1Wire | Path): Path {
  const migrated: Path = {
    id: w.id,
    source: migrateV1PortRef(w.source),
    target: migrateV1PortRef(w.target),
    route: [],
  };
  // Migrate path → route if present
  if ('route' in w && Array.isArray(w.route)) {
    migrated.route = w.route;
  } else if ('path' in w && Array.isArray((w as V1Wire).path)) {
    migrated.route = (w as V1Wire).path as Path['route'];
  }
  return migrated;
}

function migrateV1Gameboard(data: V1SerializedGameboard): SerializedGameboard {
  return {
    id: data.id,
    chips: data.chips ?? data.nodes ?? [],
    paths: (data.paths ?? data.wires ?? []).map(migrateV1Wire),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV1toV2(data: any): any {
  return {
    version: 2,
    completedLevels: data.completedLevels ?? [],
    currentLevelIndex: data.currentLevelIndex ?? 0,
    puzzleNodes: data.puzzleNodes ?? [],
    utilityNodes: (data.utilityNodes ?? []).map(([key, entry]: [string, any]) => [
      key,
      {
        ...entry,
        board: migrateV1Gameboard(entry.board),
      },
    ]),
  };
}

// --- V2 → V3 migration ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migratePortRefV2toV3(ref: any): any {
  return {
    ...ref,
    side: ref.side === 'input' ? 'socket' : ref.side === 'output' ? 'plug' : ref.side,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migratePathV2toV3(path: any): any {
  return {
    ...path,
    source: migratePortRefV2toV3(path.source),
    target: migratePortRefV2toV3(path.target),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateChipV2toV3(chip: any): any {
  const migrated = { ...chip };
  if ('inputCount' in migrated) {
    migrated.socketCount = migrated.inputCount;
    delete migrated.inputCount;
  }
  if ('outputCount' in migrated) {
    migrated.plugCount = migrated.outputCount;
    delete migrated.outputCount;
  }
  return migrated;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateGameboardV2toV3(board: any): any {
  return {
    ...board,
    chips: (board.chips ?? []).map(([id, chip]: [string, any]) => [id, migrateChipV2toV3(chip)]),
    paths: (board.paths ?? []).map(migratePathV2toV3),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateBakeMetadataV2toV3(meta: any): any {
  if (!meta) return meta;
  const migrated = { ...meta };

  // nodeConfigs → chipConfigs
  if ('nodeConfigs' in migrated && !('chipConfigs' in migrated)) {
    migrated.chipConfigs = migrated.nodeConfigs;
    delete migrated.nodeConfigs;
  }

  // Migrate chipConfigs entries
  if (migrated.chipConfigs) {
    migrated.chipConfigs = migrated.chipConfigs.map((cfg: any) => {
      const m = { ...cfg };
      if ('inputCount' in m) {
        m.socketCount = m.inputCount;
        delete m.inputCount;
      }
      if ('outputCount' in m) {
        m.plugCount = m.outputCount;
        delete m.outputCount;
      }
      return m;
    });
  }

  // Migrate edges: fromNodeId → fromChipId, toNodeId → toChipId
  if (migrated.edges) {
    migrated.edges = migrated.edges.map((edge: any) => {
      const e = { ...edge };
      if ('fromNodeId' in e && !('fromChipId' in e)) {
        e.fromChipId = e.fromNodeId;
        delete e.fromNodeId;
      }
      if ('toNodeId' in e && !('toChipId' in e)) {
        e.toChipId = e.toNodeId;
        delete e.toNodeId;
      }
      return e;
    });
  }

  // inputCount → socketCount, outputCount → plugCount on metadata itself
  if ('inputCount' in migrated) {
    migrated.socketCount = migrated.inputCount;
    delete migrated.inputCount;
  }
  if ('outputCount' in migrated) {
    migrated.plugCount = migrated.outputCount;
    delete migrated.outputCount;
  }

  return migrated;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV2toV3(data: any): PersistedState {
  // Migrate puzzleNodes → craftedPuzzles
  const rawPuzzles = Array.isArray(data.puzzleNodes) ? data.puzzleNodes : [];
  const craftedPuzzles = rawPuzzles.map(([key, entry]: [string, any]) => {
    const migrated = { ...entry };
    if ('inputCount' in migrated) {
      migrated.socketCount = migrated.inputCount;
      delete migrated.inputCount;
    }
    if ('outputCount' in migrated) {
      migrated.plugCount = migrated.outputCount;
      delete migrated.outputCount;
    }
    migrated.bakeMetadata = migrateBakeMetadataV2toV3(migrated.bakeMetadata);
    if (migrated.savedBoard) {
      migrated.savedBoard = migrateGameboardV2toV3(migrated.savedBoard);
    }
    return [key, migrated];
  });

  // Migrate utilityNodes → craftedUtilities
  const rawUtilities = Array.isArray(data.utilityNodes) ? data.utilityNodes : [];
  const craftedUtilities = rawUtilities.map(([key, entry]: [string, any]) => {
    const migrated = { ...entry };
    if ('inputCount' in migrated) {
      migrated.socketCount = migrated.inputCount;
      delete migrated.inputCount;
    }
    if ('outputCount' in migrated) {
      migrated.plugCount = migrated.outputCount;
      delete migrated.outputCount;
    }
    migrated.bakeMetadata = migrateBakeMetadataV2toV3(migrated.bakeMetadata);
    migrated.board = migrateGameboardV2toV3(migrated.board);
    return [key, migrated];
  });

  return {
    version: 3,
    completedLevels: data.completedLevels ?? [],
    currentLevelIndex: data.currentLevelIndex ?? 0,
    craftedPuzzles,
    craftedUtilities,
  };
}

// --- State serialization ---

export function serializeState(state: HydratableState): PersistedState {
  return {
    version: SCHEMA_VERSION,
    completedLevels: Array.from(state.completedLevels),
    currentLevelIndex: state.currentLevelIndex,
    craftedPuzzles: Array.from(state.craftedPuzzles.entries()).map(([key, entry]) => [
      key,
      entry.savedBoard
        ? { ...entry, savedBoard: serializeGameboard(entry.savedBoard) }
        : entry,
    ] as [string, CraftedPuzzleEntry]),
    craftedUtilities: Array.from(state.craftedUtilities.entries()).map(([key, entry]) => [
      key,
      {
        utilityId: entry.utilityId,
        title: entry.title,
        socketCount: entry.socketCount,
        plugCount: entry.plugCount,
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

    // Migrate v1 → v2 → v3
    let persisted: PersistedState;
    if (data.version === 1) {
      const v2 = migrateV1toV2(data);
      persisted = migrateV2toV3(v2);
    } else if (data.version === 2) {
      persisted = migrateV2toV3(data);
    } else if (data.version === SCHEMA_VERSION) {
      persisted = data as PersistedState;
    } else {
      return null; // Unknown version
    }

    // Validate field types (guard against corrupted/tampered data)
    const completedLevels = Array.isArray(persisted.completedLevels) ? persisted.completedLevels : [];
    const currentLevelIndex = typeof persisted.currentLevelIndex === 'number' ? persisted.currentLevelIndex : 0;
    const craftedPuzzles = Array.isArray(persisted.craftedPuzzles) ? persisted.craftedPuzzles : [];
    const craftedUtilities = Array.isArray(persisted.craftedUtilities) ? persisted.craftedUtilities : [];

    return {
      completedLevels: new Set(completedLevels),
      currentLevelIndex,
      craftedPuzzles: new Map(
        craftedPuzzles.map(([key, entry]: [string, any]) => [
          key,
          entry.savedBoard
            ? { ...entry, savedBoard: deserializeGameboard(entry.savedBoard) }
            : entry,
        ]),
      ),
      craftedUtilities: new Map(
        craftedUtilities.map(([key, entry]) => [
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
    state.craftedPuzzles !== prev.craftedPuzzles ||
    state.craftedUtilities !== prev.craftedUtilities
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
