import type { StoreApi } from 'zustand';
import type { GameStore } from './index.ts';
import type { SerializedCustomPuzzle } from './slices/custom-puzzle-slice.ts';

/** LocalStorage key for custom puzzles */
const CUSTOM_PUZZLES_KEY = 'logic-puzzle-custom-puzzles';

/** Save custom puzzles to localStorage */
export function saveCustomPuzzles(puzzles: SerializedCustomPuzzle[]): void {
  try {
    const json = JSON.stringify(puzzles);
    localStorage.setItem(CUSTOM_PUZZLES_KEY, json);
  } catch (e) {
    console.error('Failed to save custom puzzles:', e);
  }
}

/** Load custom puzzles from localStorage */
export function loadCustomPuzzles(): SerializedCustomPuzzle[] {
  try {
    const json = localStorage.getItem(CUSTOM_PUZZLES_KEY);
    if (!json) return [];
    return JSON.parse(json) as SerializedCustomPuzzle[];
  } catch (e) {
    console.error('Failed to load custom puzzles:', e);
    return [];
  }
}

/** Initialize custom puzzle persistence */
export function initCustomPuzzlePersistence(store: StoreApi<GameStore>): void {
  // Hydrate from localStorage on init
  const saved = loadCustomPuzzles();
  if (saved.length > 0) {
    store.getState().hydrateCustomPuzzles(saved);
  }

  // Subscribe to changes and auto-save
  store.subscribe((state, prevState) => {
    if (state.customPuzzles !== prevState.customPuzzles) {
      const serialized = state.getSerializableCustomPuzzles();
      saveCustomPuzzles(serialized);
    }
  });
}
