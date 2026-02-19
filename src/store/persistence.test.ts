import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  serializeState,
  deserializeState,
  serializeGameboard,
  deserializeGameboard,
  saveToStorage,
  loadFromStorage,
  persistenceFieldsChanged,
  initPersistence,
} from './persistence.ts';
import type { HydratableState } from './persistence.ts';
import type { CraftedPuzzleEntry, CraftedUtilityEntry } from './slices/palette-slice.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import type { GameboardState } from '../shared/types/index.ts';
import { createPath } from '../shared/types/index.ts';

const fakeMeta: BakeMetadata = {
  topoOrder: ['n1'],
  chipConfigs: [{ id: 'n1', type: 'invert', params: {}, socketCount: 1, plugCount: 1 }],
  edges: [],
  socketCount: 1,
  plugCount: 1,
};

function makePuzzleEntry(id: string): CraftedPuzzleEntry {
  return {
    puzzleId: id,
    title: `Puzzle ${id}`,
    description: `Desc ${id}`,
    socketCount: 1,
    plugCount: 1,
    bakeMetadata: fakeMeta,
    versionHash: `hash-${id}`,
  };
}

function makeBoard(id: string): GameboardState {
  const path = createPath('w1',
    { chipId: 'cp-in-0', portIndex: 0, side: 'plug' },
    { chipId: 'node-1', portIndex: 0, side: 'socket' },
  );
  return {
    id,
    chips: new Map([
      ['node-1', { id: 'node-1', type: 'invert', position: { col: 10, row: 20 }, params: {}, socketCount: 1, plugCount: 1 }],
    ]),
    paths: [path],
  };
}

function makeUtilityEntry(id: string): CraftedUtilityEntry {
  return {
    utilityId: id,
    title: `Utility ${id}`,
    socketCount: 1,
    plugCount: 1,
    bakeMetadata: fakeMeta,
    board: makeBoard(`board-${id}`),
    versionHash: `uhash-${id}`,
  };
}

function makeState(): HydratableState {
  return {
    completedLevels: new Set(['level-01', 'level-02']),
    currentLevelIndex: 2,
    craftedPuzzles: new Map([
      ['level-01', makePuzzleEntry('level-01')],
      ['level-02', makePuzzleEntry('level-02')],
    ]),
    craftedUtilities: new Map([
      ['util-1', makeUtilityEntry('util-1')],
    ]),
  };
}

// --- localStorage mock ---
let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gameboard serialization', () => {
  it('roundtrip preserves board id, chips, and paths', () => {
    const board = makeBoard('test-board');
    const serialized = serializeGameboard(board);
    const deserialized = deserializeGameboard(serialized);

    expect(deserialized.id).toBe('test-board');
    expect(deserialized.chips).toBeInstanceOf(Map);
    expect(deserialized.chips.size).toBe(1);
    expect(deserialized.chips.get('node-1')!.type).toBe('invert');
    expect(deserialized.chips.get('node-1')!.position).toEqual({ col: 10, row: 20 });
  });

  it('preserves path structure', () => {
    const board = makeBoard('test-board');
    const serialized = serializeGameboard(board);
    const deserialized = deserializeGameboard(serialized);

    expect(deserialized.paths.length).toBe(1);
    expect(deserialized.paths[0].source.chipId).toBe('cp-in-0');
    expect(deserialized.paths[0].target.chipId).toBe('node-1');
  });
});

describe('state serialization', () => {
  it('converts Set to array and Map to entries', () => {
    const state = makeState();
    const serialized = serializeState(state);

    expect(serialized.version).toBe(3);
    expect(Array.isArray(serialized.completedLevels)).toBe(true);
    expect(serialized.completedLevels).toContain('level-01');
    expect(serialized.completedLevels).toContain('level-02');
    expect(serialized.currentLevelIndex).toBe(2);
    expect(Array.isArray(serialized.craftedPuzzles)).toBe(true);
    expect(serialized.craftedPuzzles.length).toBe(2);
    expect(Array.isArray(serialized.craftedUtilities)).toBe(true);
    expect(serialized.craftedUtilities.length).toBe(1);
  });

  it('serialized utility chip board has array chips, not Map', () => {
    const state = makeState();
    const serialized = serializeState(state);
    const utilEntry = serialized.craftedUtilities[0][1];

    expect(Array.isArray(utilEntry.board.chips)).toBe(true);
    expect(utilEntry.board.chips.length).toBe(1);
  });

  it('roundtrip preserves all fields', () => {
    const state = makeState();
    const serialized = serializeState(state);
    const json = JSON.stringify(serialized);
    const deserialized = deserializeState(json);

    expect(deserialized).not.toBeNull();
    expect(deserialized!.completedLevels).toBeInstanceOf(Set);
    expect(deserialized!.completedLevels.size).toBe(2);
    expect(deserialized!.completedLevels.has('level-01')).toBe(true);
    expect(deserialized!.currentLevelIndex).toBe(2);

    expect(deserialized!.craftedPuzzles).toBeInstanceOf(Map);
    expect(deserialized!.craftedPuzzles.size).toBe(2);
    expect(deserialized!.craftedPuzzles.get('level-01')!.title).toBe('Puzzle level-01');

    expect(deserialized!.craftedUtilities).toBeInstanceOf(Map);
    expect(deserialized!.craftedUtilities.size).toBe(1);
    const util = deserialized!.craftedUtilities.get('util-1')!;
    expect(util.board.chips).toBeInstanceOf(Map);
    expect(util.board.chips.size).toBe(1);
  });

  it('roundtrip preserves BakeMetadata', () => {
    const state = makeState();
    const json = JSON.stringify(serializeState(state));
    const deserialized = deserializeState(json)!;

    const puzzleEntry = deserialized.craftedPuzzles.get('level-01')!;
    expect(puzzleEntry.bakeMetadata.topoOrder).toEqual(['n1']);
    expect(puzzleEntry.bakeMetadata.socketCount).toBe(1);

    const utilEntry = deserialized.craftedUtilities.get('util-1')!;
    expect(utilEntry.bakeMetadata.topoOrder).toEqual(['n1']);
  });
});

describe('deserializeState error handling', () => {
  it('returns null for invalid JSON', () => {
    expect(deserializeState('not json')).toBeNull();
  });

  it('returns null for missing version', () => {
    expect(deserializeState(JSON.stringify({ completedLevels: [] }))).toBeNull();
  });

  it('returns null for wrong schema version', () => {
    expect(deserializeState(JSON.stringify({ version: 999 }))).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(deserializeState('')).toBeNull();
  });

  it('falls back to defaults when field types are wrong', () => {
    const data = JSON.stringify({
      version: 2,
      completedLevels: 'not-an-array',
      currentLevelIndex: 'five',
      puzzleNodes: 42,
      utilityNodes: true,
    });
    const result = deserializeState(data);
    expect(result).not.toBeNull();
    expect(result!.completedLevels.size).toBe(0);
    expect(result!.currentLevelIndex).toBe(0);
    expect(result!.craftedPuzzles.size).toBe(0);
    expect(result!.craftedUtilities.size).toBe(0);
  });

  it('handles missing fields gracefully (v2)', () => {
    const partial = JSON.stringify({ version: 2 });
    const result = deserializeState(partial);
    expect(result).not.toBeNull();
    expect(result!.completedLevels.size).toBe(0);
    expect(result!.currentLevelIndex).toBe(0);
    expect(result!.craftedPuzzles.size).toBe(0);
    expect(result!.craftedUtilities.size).toBe(0);
  });

  it('handles missing fields gracefully (v1 migration)', () => {
    const partial = JSON.stringify({ version: 1 });
    const result = deserializeState(partial);
    expect(result).not.toBeNull();
    expect(result!.completedLevels.size).toBe(0);
    expect(result!.currentLevelIndex).toBe(0);
    expect(result!.craftedPuzzles.size).toBe(0);
    expect(result!.craftedUtilities.size).toBe(0);
  });
});

describe('v1 → v2 migration', () => {
  it('migrates v1 data with old field names (nodes, wires, nodeId, path)', () => {
    const v1Data = JSON.stringify({
      version: 1,
      completedLevels: ['level-01'],
      currentLevelIndex: 1,
      puzzleNodes: [['level-01', makePuzzleEntry('level-01')]],
      utilityNodes: [['util-1', {
        utilityId: 'util-1',
        title: 'Utility util-1',
        inputCount: 1,
        outputCount: 1,
        bakeMetadata: fakeMeta,
        board: {
          id: 'board-util-1',
          nodes: [['n1', { id: 'n1', type: 'offset', position: { col: 10, row: 5 }, params: {}, inputCount: 1, outputCount: 1 }]],
          wires: [{
            id: 'w1',
            source: { nodeId: 'cp-in-0', portIndex: 0, side: 'output' },
            target: { nodeId: 'n1', portIndex: 0, side: 'input' },
            path: [{ col: 5, row: 5 }, { col: 10, row: 5 }],
          }],
        },
        versionHash: 'uhash-util-1',
      }]],
    });

    const result = deserializeState(v1Data);
    expect(result).not.toBeNull();
    expect(result!.completedLevels.has('level-01')).toBe(true);
    expect(result!.currentLevelIndex).toBe(1);

    // Utility board should have migrated field names
    const util = result!.craftedUtilities.get('util-1')!;
    expect(util.board.chips).toBeInstanceOf(Map);
    expect(util.board.chips.size).toBe(1);
    expect(util.board.chips.get('n1')!.type).toBe('offset');

    // Path should have chipId (not nodeId) and route (not path)
    expect(util.board.paths.length).toBe(1);
    expect(util.board.paths[0].source.chipId).toBe('cp-in-0');
    expect(util.board.paths[0].target.chipId).toBe('n1');
    expect(util.board.paths[0].route).toEqual([{ col: 5, row: 5 }, { col: 10, row: 5 }]);
  });

  it('migrates v1 data using chips/paths if already renamed', () => {
    const v1Data = JSON.stringify({
      version: 1,
      completedLevels: [],
      currentLevelIndex: 0,
      puzzleNodes: [],
      utilityNodes: [['u1', {
        utilityId: 'u1',
        title: 'Test',
        inputCount: 1,
        outputCount: 1,
        bakeMetadata: fakeMeta,
        board: {
          id: 'b1',
          chips: [['n1', { id: 'n1', type: 'scale', position: { col: 15, row: 10 }, params: {}, inputCount: 1, outputCount: 1 }]],
          paths: [{
            id: 'w1',
            source: { chipId: 'cp-in-0', portIndex: 0, side: 'output' },
            target: { chipId: 'n1', portIndex: 0, side: 'input' },
            route: [],
          }],
        },
        versionHash: 'h1',
      }]],
    });

    const result = deserializeState(v1Data);
    expect(result).not.toBeNull();
    const util = result!.craftedUtilities.get('u1')!;
    expect(util.board.chips.get('n1')!.type).toBe('scale');
    expect(util.board.paths[0].source.chipId).toBe('cp-in-0');
  });
});

describe('localStorage adapter', () => {
  it('saveToStorage writes and loadFromStorage reads', () => {
    const state = makeState();
    const saved = saveToStorage(state);
    expect(saved).toBe(true);

    const loaded = loadFromStorage();
    expect(loaded).not.toBeNull();
    expect(loaded!.completedLevels.size).toBe(2);
    expect(loaded!.currentLevelIndex).toBe(2);
    expect(loaded!.craftedPuzzles.size).toBe(2);
    expect(loaded!.craftedUtilities.size).toBe(1);
  });

  it('loadFromStorage returns null when nothing saved', () => {
    expect(loadFromStorage()).toBeNull();
  });

  it('loadFromStorage returns null on corrupt data', () => {
    storage['wavelength-save'] = 'corrupt{{{';
    expect(loadFromStorage()).toBeNull();
  });

  it('saveToStorage returns false on localStorage error', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceeded'); },
    });
    expect(saveToStorage(makeState())).toBe(false);
  });
});

describe('persistenceFieldsChanged', () => {
  it('returns false when same references', () => {
    const state = makeState();
    expect(persistenceFieldsChanged(state, state)).toBe(false);
  });

  it('returns true when completedLevels changes', () => {
    const prev = makeState();
    const next = { ...prev, completedLevels: new Set(['level-01', 'level-02', 'level-03']) };
    expect(persistenceFieldsChanged(next, prev)).toBe(true);
  });

  it('returns true when currentLevelIndex changes', () => {
    const prev = makeState();
    const next = { ...prev, currentLevelIndex: 5 };
    expect(persistenceFieldsChanged(next, prev)).toBe(true);
  });

  it('returns true when craftedPuzzles changes', () => {
    const prev = makeState();
    const next = { ...prev, craftedPuzzles: new Map(prev.craftedPuzzles) };
    expect(persistenceFieldsChanged(next, prev)).toBe(true);
  });

  it('returns true when craftedUtilities changes', () => {
    const prev = makeState();
    const next = { ...prev, craftedUtilities: new Map(prev.craftedUtilities) };
    expect(persistenceFieldsChanged(next, prev)).toBe(true);
  });
});

describe('initPersistence', () => {
  it('hydrates store from saved state', () => {
    const state = makeState();
    saveToStorage(state);

    let storeState: HydratableState = {
      completedLevels: new Set(),
      currentLevelIndex: 0,
      craftedPuzzles: new Map(),
      craftedUtilities: new Map(),
    };

    const mockStore = {
      getState: () => storeState,
      setState: (partial: Partial<HydratableState>) => {
        storeState = { ...storeState, ...partial };
      },
      subscribe: () => () => {},
    };

    initPersistence(mockStore);

    expect(storeState.completedLevels.size).toBe(2);
    expect(storeState.currentLevelIndex).toBe(2);
    expect(storeState.craftedPuzzles.size).toBe(2);
    expect(storeState.craftedUtilities.size).toBe(1);
  });

  it('does not modify store when no saved state exists', () => {
    let storeState: HydratableState = {
      completedLevels: new Set(),
      currentLevelIndex: 0,
      craftedPuzzles: new Map(),
      craftedUtilities: new Map(),
    };

    const mockStore = {
      getState: () => storeState,
      setState: (partial: Partial<HydratableState>) => {
        storeState = { ...storeState, ...partial };
      },
      subscribe: () => () => {},
    };

    initPersistence(mockStore);

    expect(storeState.completedLevels.size).toBe(0);
    expect(storeState.currentLevelIndex).toBe(0);
  });

  it('sets up subscribe listener', () => {
    const subscribeFn = vi.fn(() => () => {});
    const mockStore = {
      getState: () => makeState(),
      setState: () => {},
      subscribe: subscribeFn,
    };

    initPersistence(mockStore);
    expect(subscribeFn).toHaveBeenCalledOnce();
  });
});

describe('auto-save via subscribe', () => {
  let setItemSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setItemSpy = vi.fn((key: string, value: string) => { storage[key] = value; });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: setItemSpy,
      removeItem: (key: string) => { delete storage[key]; },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function captureListener() {
    let listener: ((state: HydratableState, prev: HydratableState) => void) | null = null;
    const mockStore = {
      getState: () => makeState(),
      setState: () => {},
      subscribe: (fn: (state: HydratableState, prev: HydratableState) => void) => {
        listener = fn;
        return () => {};
      },
    };
    initPersistence(mockStore);
    return listener!;
  }

  it('triggers save when persistence fields change', () => {
    const listener = captureListener();
    const prev = makeState();
    const next = { ...prev, completedLevels: new Set([...prev.completedLevels, 'level-03']) };

    listener(next, prev);
    vi.advanceTimersByTime(100);

    expect(setItemSpy).toHaveBeenCalledOnce();
    const loaded = loadFromStorage();
    expect(loaded).not.toBeNull();
    expect(loaded!.completedLevels.has('level-03')).toBe(true);
  });

  it('does not save when non-persistence fields change', () => {
    const listener = captureListener();
    const state = makeState();
    // Same references — no persistence field changed
    listener(state, state);
    vi.advanceTimersByTime(100);

    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('debounces multiple rapid changes into one save', () => {
    const listener = captureListener();
    const prev = makeState();

    listener({ ...prev, currentLevelIndex: 3 }, prev);
    listener({ ...prev, currentLevelIndex: 4 }, prev);
    listener({ ...prev, currentLevelIndex: 5 }, prev);

    vi.advanceTimersByTime(100);

    expect(setItemSpy).toHaveBeenCalledOnce();
    const loaded = loadFromStorage();
    expect(loaded!.currentLevelIndex).toBe(5);
  });
});

describe('data footprint', () => {
  it('serialized state with 15 levels and 5 utility chips is under 1MB', () => {
    const state: HydratableState = {
      completedLevels: new Set(
        Array.from({ length: 15 }, (_, i) => `level-${String(i + 1).padStart(2, '0')}`),
      ),
      currentLevelIndex: 14,
      craftedPuzzles: new Map(
        Array.from({ length: 15 }, (_, i) => {
          const id = `level-${String(i + 1).padStart(2, '0')}`;
          return [id, makePuzzleEntry(id)] as [string, CraftedPuzzleEntry];
        }),
      ),
      craftedUtilities: new Map(
        Array.from({ length: 5 }, (_, i) => {
          const id = `util-${i}`;
          return [id, makeUtilityEntry(id)] as [string, CraftedUtilityEntry];
        }),
      ),
    };

    const json = JSON.stringify(serializeState(state));
    const sizeBytes = new Blob([json]).size;
    expect(sizeBytes).toBeLessThan(1_000_000); // 1MB
  });
});
