import { create } from 'zustand';
import { createGameboardSlice } from './slices/gameboard-slice.ts';
import type { GameboardSlice } from './slices/gameboard-slice.ts';
import { createInteractionSlice } from './slices/interaction-slice.ts';
import type { InteractionSlice } from './slices/interaction-slice.ts';
import { createSimulationSlice } from './slices/simulation-slice.ts';
import type { SimulationSlice } from './slices/simulation-slice.ts';
import { createPuzzleSlice } from './slices/puzzle-slice.ts';
import type { PuzzleSlice } from './slices/puzzle-slice.ts';

export type GameStore = GameboardSlice & InteractionSlice & SimulationSlice & PuzzleSlice;

export const useGameStore = create<GameStore>()((...a) => ({
  ...createGameboardSlice(...a),
  ...createInteractionSlice(...a),
  ...createSimulationSlice(...a),
  ...createPuzzleSlice(...a),
}));
