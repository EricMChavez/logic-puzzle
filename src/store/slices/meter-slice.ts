import type { StateCreator } from 'zustand';
import type { MeterKey, MeterMode, MeterSlotState } from '../../gameboard/meters/meter-types.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';
import { TOTAL_SLOTS, slotSide } from '../../shared/grid/slot-helpers.ts';
import type { SlotConfig } from '../../puzzle/types.ts';

export interface MeterSlice {
  /** Map of meter key to slot state */
  meterSlots: Map<MeterKey, MeterSlotState>;

  /** Initialize meters from a SlotConfig.
   *  Active slots get 'input' or 'output' mode. Inactive slots get `inactiveMode` (default: 'off'). */
  initializeMeters: (config: SlotConfig, inactiveMode?: MeterMode) => void;
  /** Update the mode of a specific meter by slot index */
  setMeterMode: (slotIndex: number, mode: MeterMode) => void;
  /** Reset all meters to off */
  resetMeters: () => void;
}

export function createDefaultMeterSlots(): Map<MeterKey, MeterSlotState> {
  const slots = new Map<MeterKey, MeterSlotState>();
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    slots.set(meterKey(i), { mode: 'off' });
  }
  return slots;
}

export const createMeterSlice: StateCreator<MeterSlice> = (set) => ({
  meterSlots: createDefaultMeterSlots(),

  initializeMeters: (config, inactiveMode = 'off') =>
    set(() => {
      const slots = new Map<MeterKey, MeterSlotState>();
      for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slotDef = config[i];
        const defaultDir = slotSide(i) === 'left' ? 'input' : 'output';
        const mode = slotDef.active ? slotDef.direction : inactiveMode;
        slots.set(meterKey(i), { mode: mode ?? defaultDir });
      }
      return { meterSlots: slots };
    }),

  setMeterMode: (slotIndex, mode) =>
    set((prev) => {
      const key = meterKey(slotIndex);
      const existing = prev.meterSlots.get(key);
      if (!existing) return prev;
      const slots = new Map(prev.meterSlots);
      slots.set(key, { mode });
      return { meterSlots: slots };
    }),

  resetMeters: () =>
    set({ meterSlots: createDefaultMeterSlots() }),
});
