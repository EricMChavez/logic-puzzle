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
import type { PuzzleNodeEntry, UtilityNodeEntry } from './slices/palette-slice.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import type { GameboardState } from '../shared/types/index.ts';
import { createWire } from '../shared/types/index.ts';

const fakeMeta: BakeMetadata = {
  topoOrder: ['n1'],
  nodeConfigs: [{ id: 'n1', type: 'invert', params: {}, inputCount: 1, outputCount: 1 }],
  edges: [],
  inputDelays: [0],
  inputCount: 1,
  outputCount: 1,
};

function makePuzzleEntry(id: string): PuzzleNodeEntry {
  return {
    puzzleId: id,
    title: `Puzzle ${id}`,
    description: `Desc ${id}`,
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: fakeMeta,
    versionHash: `hash-${id}`,
  };
}

function makeBoard(id: string): GameboardState {
  const wire = createWire('w1',
    { nodeId: 'cp-in-0', portIndex: 0, side: 'output' },
    { nodeId: 'node-1', portIndex: 0, side: 'input' },
  );
  // Set a non-zero value for testing serialization
  wire.signalBuffer[0] = 50;
  return {
    id,
    nodes: new Map([
      ['node-1', { id: 'node-1', type: 'invert', position: { col: 10, row: 20 }, params: {}, inputCount: 1, outputCount: 1 }],
    ]),
    wires: [wire],
  };
}

function makeUtilityEntry(id: string): UtilityNodeEntry {
  return {
    utilityId: id,
    title: `Utility ${id}`,
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: fakeMeta,
    board: makeBoard(`board-${id}`),
    versionHash: `uhash-${id}`,
  };
}

function makeState(): HydratableState {
  return {
    completedLevels: new Set(['level-01', 'level-02']),
    currentLevelIndex: 2,
    puzzleNodes: new Map([
      ['level-01', makePuzzleEntry('level-01')],
      ['level-02', makePuzzleEntry('level-02')],
    ]),
    utilityNodes: new Map([
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
  it('roundtrip preserves board id, nodes, and wires', () => {
    const board = makeBoard('test-board');
    const serialized = serializeGameboard(board);
    const deserialized = deserializeGameboard(serialized);

    expect(deserialized.id).toBe('test-board');
    expect(deserialized.nodes).toBeInstanceOf(Map);
    expect(deserialized.nodes.size).toBe(1);
    expect(deserialized.nodes.get('node-1')!.type).toBe('invert');
    expect(deserialized.nodes.get('node-1')!.position).toEqual({ col: 10, row: 20 });
  });

  it('resets signalBuffer on serialize', () => {
    const board = makeBoard('test-board');
    expect(board.wires[0].signalBuffer[0]).toBe(50);

    const serialized = serializeGameboard(board);
    expect(serialized.wires[0].signalBuffer.every((v: number) => v === 0)).toBe(true);
  });

  it('preserves wire structure', () => {
    const board = makeBoard('test-board');
    const serialized = serializeGameboard(board);
    const deserialized = deserializeGameboard(serialized);

    expect(deserialized.wires.length).toBe(1);
    expect(deserialized.wires[0].source.nodeId).toBe('cp-in-0');
    expect(deserialized.wires[0].target.nodeId).toBe('node-1');
  });
});

describe('state serialization', () => {
  it('converts Set to array and Map to entries', () => {
    const state = makeState();
    const serialized = serializeState(state);

    expect(serialized.version).toBe(1);
    expect(Array.isArray(serialized.completedLevels)).toBe(true);
    expect(serialized.completedLevels).toContain('level-01');
    expect(serialized.completedLevels).toContain('level-02');
    expect(serialized.currentLevelIndex).toBe(2);
    expect(Array.isArray(serialized.puzzleNodes)).toBe(true);
    expect(serialized.puzzleNodes.length).toBe(2);
    expect(Array.isArray(serialized.utilityNodes)).toBe(true);
    expect(serialized.utilityNodes.length).toBe(1);
  });

  it('serialized utility node board has array nodes, not Map', () => {
    const state = makeState();
    const serialized = serializeState(state);
    const utilEntry = serialized.utilityNodes[0][1];

    expect(Array.isArray(utilEntry.board.nodes)).toBe(true);
    expect(utilEntry.board.nodes.length).toBe(1);
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

    expect(deserialized!.puzzleNodes).toBeInstanceOf(Map);
    expect(deserialized!.puzzleNodes.size).toBe(2);
    expect(deserialized!.puzzleNodes.get('level-01')!.title).toBe('Puzzle level-01');

    expect(deserialized!.utilityNodes).toBeInstanceOf(Map);
    expect(deserialized!.utilityNodes.size).toBe(1);
    const util = deserialized!.utilityNodes.get('util-1')!;
    expect(util.board.nodes).toBeInstanceOf(Map);
    expect(util.board.nodes.size).toBe(1);
  });

  it('roundtrip preserves BakeMetadata', () => {
    const state = makeState();
    const json = JSON.stringify(serializeState(state));
    const deserialized = deserializeState(json)!;

    const puzzleNode = deserialized.puzzleNodes.get('level-01')!;
    expect(puzzleNode.bakeMetadata.topoOrder).toEqual(['n1']);
    expect(puzzleNode.bakeMetadata.inputCount).toBe(1);

    const utilNode = deserialized.utilityNodes.get('util-1')!;
    expect(utilNode.bakeMetadata.topoOrder).toEqual(['n1']);
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
      version: 1,
      completedLevels: 'not-an-array',
      currentLevelIndex: 'five',
      puzzleNodes: 42,
      utilityNodes: true,
    });
    const result = deserializeState(data);
    expect(result).not.toBeNull();
    expect(result!.completedLevels.size).toBe(0);
    expect(result!.currentLevelIndex).toBe(0);
    expect(result!.puzzleNodes.size).toBe(0);
    expect(result!.utilityNodes.size).toBe(0);
  });

  it('handles missing fields gracefully', () => {
    const partial = JSON.stringify({ version: 1 });
    const result = deserializeState(partial);
    expect(result).not.toBeNull();
    expect(result!.completedLevels.size).toBe(0);
    expect(result!.currentLevelIndex).toBe(0);
    expect(result!.puzzleNodes.size).toBe(0);
    expect(result!.utilityNodes.size).toBe(0);
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
    expect(loaded!.puzzleNodes.size).toBe(2);
    expect(loaded!.utilityNodes.size).toBe(1);
  });

  it('loadFromStorage returns null when nothing saved', () => {
    expect(loadFromStorage()).toBeNull();
  });

  it('loadFromStorage returns null on corrupt data', () => {
    storage['logic-puzzle-save'] = 'corrupt{{{';
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

  it('returns true when puzzleNodes changes', () => {
    const prev = makeState();
    const next = { ...prev, puzzleNodes: new Map(prev.puzzleNodes) };
    expect(persistenceFieldsChanged(next, prev)).toBe(true);
  });

  it('returns true when utilityNodes changes', () => {
    const prev = makeState();
    const next = { ...prev, utilityNodes: new Map(prev.utilityNodes) };
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
      puzzleNodes: new Map(),
      utilityNodes: new Map(),
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
    expect(storeState.puzzleNodes.size).toBe(2);
    expect(storeState.utilityNodes.size).toBe(1);
  });

  it('does not modify store when no saved state exists', () => {
    let storeState: HydratableState = {
      completedLevels: new Set(),
      currentLevelIndex: 0,
      puzzleNodes: new Map(),
      utilityNodes: new Map(),
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
  it('serialized state with 15 levels and 5 utility nodes is under 1MB', () => {
    const state: HydratableState = {
      completedLevels: new Set(
        Array.from({ length: 15 }, (_, i) => `level-${String(i + 1).padStart(2, '0')}`),
      ),
      currentLevelIndex: 14,
      puzzleNodes: new Map(
        Array.from({ length: 15 }, (_, i) => {
          const id = `level-${String(i + 1).padStart(2, '0')}`;
          return [id, makePuzzleEntry(id)] as [string, PuzzleNodeEntry];
        }),
      ),
      utilityNodes: new Map(
        Array.from({ length: 5 }, (_, i) => {
          const id = `util-${i}`;
          return [id, makeUtilityEntry(id)] as [string, UtilityNodeEntry];
        }),
      ),
    };

    const json = JSON.stringify(serializeState(state));
    const sizeBytes = new Blob([json]).size;
    expect(sizeBytes).toBeLessThan(1_000_000); // 1MB
  });
});
