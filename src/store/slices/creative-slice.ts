import type { StateCreator } from 'zustand';
import type { WaveformDef, WaveformShape } from '../../puzzle/types.ts';

/** Number of creative mode slots (3 left + 3 right) */
export const CREATIVE_SLOT_COUNT = 6;

/** Default waveform when a slot becomes an input */
const DEFAULT_INPUT_WAVEFORM: WaveformDef = {
  shape: 'sine',
  amplitude: 100,
  period: 64,
  phase: 0,
  offset: 0,
};

/** State for a single creative mode slot */
export interface CreativeSlotState {
  direction: 'input' | 'output' | 'off';
  /** Waveform definition (only used when direction is 'input') */
  waveform: WaveformDef;
}

/** Create default slot state (left=input, right=output) */
function createDefaultSlots(): CreativeSlotState[] {
  return Array.from({ length: CREATIVE_SLOT_COUNT }, (_, i) => ({
    // Left slots (0-2) are inputs, right slots (3-5) are outputs
    direction: (i < 3 ? 'input' : 'output') as 'input' | 'output',
    waveform: { ...DEFAULT_INPUT_WAVEFORM },
  }));
}

export interface CreativeSlice {
  /** Whether creative mode is active */
  isCreativeMode: boolean;
  /** State for all 6 slots (0-2 = left side, 3-5 = right side) */
  creativeSlots: CreativeSlotState[];

  /** Enter creative mode */
  enterCreativeMode: () => void;
  /** Exit creative mode */
  exitCreativeMode: () => void;
  /** Set slot direction (returns true if direction changed) */
  setCreativeSlotDirection: (slotIndex: number, direction: 'input' | 'output' | 'off') => boolean;
  /** Set a complete waveform definition for a slot */
  setCreativeSlotWaveform: (slotIndex: number, waveform: WaveformDef) => void;
  /** Set just the shape of a slot's waveform (keeps other params) */
  setCreativeSlotWaveformShape: (slotIndex: number, shape: WaveformShape) => void;
  /** Get the slot index for a meter (side + index) */
  getCreativeSlotIndex: (side: 'left' | 'right', index: number) => number;
}

/** Convert meter side + index to slot index */
export function meterToSlotIndex(side: 'left' | 'right', index: number): number {
  return side === 'left' ? index : index + 3;
}

/** Convert slot index to meter side + index */
export function slotToMeterInfo(slotIndex: number): { side: 'left' | 'right'; index: number } {
  if (slotIndex < 3) {
    return { side: 'left', index: slotIndex };
  }
  return { side: 'right', index: slotIndex - 3 };
}

export const createCreativeSlice: StateCreator<CreativeSlice> = (set, get) => ({
  isCreativeMode: false,
  creativeSlots: createDefaultSlots(),

  enterCreativeMode: () => set({ isCreativeMode: true }),

  exitCreativeMode: () => set({
    isCreativeMode: false,
    creativeSlots: createDefaultSlots(),
  }),

  setCreativeSlotDirection: (slotIndex, direction) => {
    const state = get();
    if (slotIndex < 0 || slotIndex >= CREATIVE_SLOT_COUNT) return false;
    const currentDirection = state.creativeSlots[slotIndex].direction;
    if (currentDirection === direction) return false;

    const newSlots = [...state.creativeSlots];
    newSlots[slotIndex] = {
      ...newSlots[slotIndex],
      direction,
      // Reset waveform to default when switching to input
      waveform: direction === 'input' ? { ...DEFAULT_INPUT_WAVEFORM } : newSlots[slotIndex].waveform,
    };
    set({ creativeSlots: newSlots });
    return true;
  },

  setCreativeSlotWaveform: (slotIndex, waveform) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= CREATIVE_SLOT_COUNT) return state;
      const newSlots = [...state.creativeSlots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], waveform };
      return { creativeSlots: newSlots };
    }),

  setCreativeSlotWaveformShape: (slotIndex, shape) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= CREATIVE_SLOT_COUNT) return state;
      const newSlots = [...state.creativeSlots];
      newSlots[slotIndex] = {
        ...newSlots[slotIndex],
        waveform: { ...newSlots[slotIndex].waveform, shape },
      };
      return { creativeSlots: newSlots };
    }),

  getCreativeSlotIndex: (side, index) => meterToSlotIndex(side, index),
});
