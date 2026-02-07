import { create } from 'zustand';
import { createGameboardSlice } from './slices/gameboard-slice.ts';
import type { GameboardSlice } from './slices/gameboard-slice.ts';
import { createInteractionSlice } from './slices/interaction-slice.ts';
import type { InteractionSlice } from './slices/interaction-slice.ts';
import { createSimulationSlice } from './slices/simulation-slice.ts';
import type { SimulationSlice } from './slices/simulation-slice.ts';
import { createPuzzleSlice } from './slices/puzzle-slice.ts';
import type { PuzzleSlice } from './slices/puzzle-slice.ts';
import { createPaletteSlice } from './slices/palette-slice.ts';
import type { PaletteSlice } from './slices/palette-slice.ts';
import { createCeremonySlice } from './slices/ceremony-slice.ts';
import type { CeremonySlice } from './slices/ceremony-slice.ts';
import { createNavigationSlice } from './slices/navigation-slice.ts';
import type { NavigationSlice } from './slices/navigation-slice.ts';
import { createProgressionSlice } from './slices/progression-slice.ts';
import type { ProgressionSlice } from './slices/progression-slice.ts';
import { createHistorySlice, initHistory } from './slices/history-slice.ts';
import type { HistorySlice } from './slices/history-slice.ts';
import { createMeterSlice } from './slices/meter-slice.ts';
import type { MeterSlice } from './slices/meter-slice.ts';
import { createRoutingSlice, initRouting } from './slices/routing-slice.ts';
import type { RoutingSlice } from './slices/routing-slice.ts';
import { createOverlaySlice } from './slices/overlay-slice.ts';
import type { OverlaySlice } from './slices/overlay-slice.ts';
import { createAnimationSlice } from './slices/animation-slice.ts';
import type { AnimationSlice } from './slices/animation-slice.ts';
import { createCreativeSlice } from './slices/creative-slice.ts';
import type { CreativeSlice } from './slices/creative-slice.ts';
import { createCustomPuzzleSlice } from './slices/custom-puzzle-slice.ts';
import type { CustomPuzzleSlice } from './slices/custom-puzzle-slice.ts';
import { createAuthoringSlice } from './slices/authoring-slice.ts';
import type { AuthoringSlice } from './slices/authoring-slice.ts';
import { initPersistence } from './persistence.ts';
import { initCustomPuzzlePersistence } from './custom-puzzle-persistence.ts';

export type GameStore = GameboardSlice & InteractionSlice & SimulationSlice & PuzzleSlice & PaletteSlice & CeremonySlice & NavigationSlice & ProgressionSlice & HistorySlice & MeterSlice & RoutingSlice & OverlaySlice & AnimationSlice & CreativeSlice & CustomPuzzleSlice & AuthoringSlice;

export const useGameStore = create<GameStore>()((...a) => ({
  ...createGameboardSlice(...a),
  ...createInteractionSlice(...a),
  ...createSimulationSlice(...a),
  ...createPuzzleSlice(...a),
  ...createPaletteSlice(...a),
  ...createCeremonySlice(...a),
  ...createNavigationSlice(...a),
  ...createProgressionSlice(...a),
  ...createHistorySlice(...a),
  ...createMeterSlice(...a),
  ...createRoutingSlice(...a),
  ...createOverlaySlice(...a),
  ...createAnimationSlice(...a),
  ...createCreativeSlice(...a),
  ...createCustomPuzzleSlice(...a),
  ...createAuthoringSlice(...a),
}));

// Set up undo/redo auto-capture via graphVersion subscriber
initHistory(useGameStore);

// Set up auto-routing of wires on structural changes
initRouting(useGameStore);

// Hydrate saved state from localStorage and set up auto-save
initPersistence(useGameStore);

// Hydrate custom puzzles from localStorage and set up auto-save
initCustomPuzzlePersistence(useGameStore);
