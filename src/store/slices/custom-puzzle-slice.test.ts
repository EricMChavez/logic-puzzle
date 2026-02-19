import { describe, it, expect } from 'vitest';
import type { CustomPuzzle, SerializedCustomPuzzle } from './custom-puzzle-slice.ts';
import { createCustomPuzzleSlice } from './custom-puzzle-slice.ts';

function makePuzzle(overrides: Partial<CustomPuzzle> = {}): CustomPuzzle {
  return {
    id: 'test-puzzle',
    title: 'Test',
    description: '',
    createdAt: 1000,
    slots: [
      { direction: 'input' },
      { direction: 'off' },
      { direction: 'off' },
      { direction: 'output' },
      { direction: 'off' },
      { direction: 'off' },
    ],
    targetSamples: new Map([[3, [50, 60, 70]]]),
    initialChips: [],
    initialPaths: [],
    allowedChips: null,
    ...overrides,
  };
}

describe('custom-puzzle-slice serialization', () => {
  it('serializes and hydrates allowedChips (Record format)', () => {
    const puzzles = new Map<string, CustomPuzzle>();
    const puzzle = makePuzzle({ allowedChips: { invert: -1, mixer: 3 } });
    puzzles.set(puzzle.id, puzzle);

    // Create a minimal store-like API for getSerializableCustomPuzzles
    let state = { customPuzzles: puzzles };
    const get = () => state;
    const set = (fn: (s: typeof state) => typeof state | Partial<typeof state>) => {
      const result = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...result };
    };
    const slice = createCustomPuzzleSlice(set as any, get as any, {} as any);

    // Manually set the state for getSerializableCustomPuzzles
    state.customPuzzles = puzzles;
    // Access the serializer via the actual slice — it reads from get()
    const serialized = slice.getSerializableCustomPuzzles();

    expect(serialized.length).toBe(1);
    expect(serialized[0].allowedChips).toEqual({ invert: -1, mixer: 3 });

    // Hydrate back
    slice.hydrateCustomPuzzles(serialized);
    const hydrated = state.customPuzzles.get('test-puzzle');
    expect(hydrated).toBeDefined();
    expect(hydrated!.allowedChips).toEqual({ invert: -1, mixer: 3 });
  });

  it('migrates legacy string[] allowedChips to Record format', () => {
    const serialized: SerializedCustomPuzzle[] = [{
      id: 'legacy-puzzle',
      title: 'Legacy',
      description: '',
      createdAt: 1000,
      slots: [
        { direction: 'input' },
        { direction: 'off' },
        { direction: 'off' },
        { direction: 'output' },
        { direction: 'off' },
        { direction: 'off' },
      ],
      targetSamples: [[3, [50]]],
      initialChips: [],
      initialPaths: [],
      allowedChips: ['offset', 'scale'],
    }];

    let state = { customPuzzles: new Map<string, CustomPuzzle>() };
    const get = () => state;
    const set = (fn: any) => {
      const result = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...result };
    };
    const slice = createCustomPuzzleSlice(set as any, get as any, {} as any);

    slice.hydrateCustomPuzzles(serialized);
    const hydrated = state.customPuzzles.get('legacy-puzzle');
    expect(hydrated).toBeDefined();
    // Legacy string[] should be migrated to Record<string, -1>
    expect(hydrated!.allowedChips).toEqual({ offset: -1, scale: -1 });
  });

  it('hydrates allowedChips as null when missing (backward compat)', () => {
    const serialized: SerializedCustomPuzzle[] = [{
      id: 'old-puzzle',
      title: 'Old',
      description: '',
      createdAt: 1000,
      slots: [
        { direction: 'input' },
        { direction: 'off' },
        { direction: 'off' },
        { direction: 'output' },
        { direction: 'off' },
        { direction: 'off' },
      ],
      targetSamples: [[3, [50]]],
      initialChips: [],
      initialPaths: [],
      // No allowedChips field — old format
    }];

    let state = { customPuzzles: new Map<string, CustomPuzzle>() };
    const get = () => state;
    const set = (fn: any) => {
      const result = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...result };
    };
    const slice = createCustomPuzzleSlice(set as any, get as any, {} as any);

    slice.hydrateCustomPuzzles(serialized);
    const hydrated = state.customPuzzles.get('old-puzzle');
    expect(hydrated).toBeDefined();
    expect(hydrated!.allowedChips).toBeNull();
  });

  it('serializes initialChips with socketCount/plugCount/rotation', () => {
    const puzzle = makePuzzle({
      initialChips: [{
        id: 'n1',
        type: 'offset',
        position: { col: 10, row: 5 },
        params: {},
        socketCount: 1,
        plugCount: 1,
        rotation: 90,
      }],
    });
    const puzzles = new Map<string, CustomPuzzle>();
    puzzles.set(puzzle.id, puzzle);

    let state = { customPuzzles: puzzles };
    const get = () => state;
    const set = (fn: any) => {
      const result = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...result };
    };
    const slice = createCustomPuzzleSlice(set as any, get as any, {} as any);

    const serialized = slice.getSerializableCustomPuzzles();
    expect(serialized[0].initialChips[0].socketCount).toBe(1);
    expect(serialized[0].initialChips[0].plugCount).toBe(1);
    expect(serialized[0].initialChips[0].rotation).toBe(90);
  });
});
