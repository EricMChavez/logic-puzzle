import type { StateCreator } from 'zustand';
import type { MeterKey, MeterSlotState, MeterVisualState } from '../../gameboard/meters/meter-types.ts';
import { meterKey, METERS_PER_SIDE } from '../../gameboard/meters/meter-types.ts';
import type { ConnectionPointConfig } from '../../puzzle/types.ts';

export interface MeterSlice {
  /** Map of meter key to slot state */
  meterSlots: Map<MeterKey, MeterSlotState>;

  /** Initialize meters from a connection point configuration.
   *  Optional initialState defaults to 'active'. Inactive slots stay 'hidden'. */
  initializeMeters: (config: ConnectionPointConfig, initialState?: MeterVisualState) => void;
  /** Update the visual state of a specific meter */
  setMeterVisualState: (key: MeterKey, state: MeterVisualState) => void;
  /** Reset all meters to hidden */
  resetMeters: () => void;
}

function createDefaultMeterSlots(): Map<MeterKey, MeterSlotState> {
  const slots = new Map<MeterKey, MeterSlotState>();
  for (let i = 0; i < METERS_PER_SIDE; i++) {
    slots.set(meterKey('left', i), {
      side: 'left',
      index: i,
      visualState: 'hidden',
      direction: 'input',
    });
    slots.set(meterKey('right', i), {
      side: 'right',
      index: i,
      visualState: 'hidden',
      direction: 'output',
    });
  }
  return slots;
}

export const createMeterSlice: StateCreator<MeterSlice> = (set) => ({
  meterSlots: createDefaultMeterSlots(),

  initializeMeters: (config, initialState = 'active') =>
    set(() => {
      const slots = new Map<MeterKey, MeterSlotState>();
      for (let i = 0; i < METERS_PER_SIDE; i++) {
        const leftSlot = config.left[i];
        slots.set(meterKey('left', i), {
          side: 'left',
          index: i,
          visualState: leftSlot?.active ? initialState : 'hidden',
          direction: leftSlot?.direction ?? 'input',
          cpIndex: leftSlot?.cpIndex ?? i,
        });
        const rightSlot = config.right[i];
        slots.set(meterKey('right', i), {
          side: 'right',
          index: i,
          visualState: rightSlot?.active ? initialState : 'hidden',
          direction: rightSlot?.direction ?? 'output',
          cpIndex: rightSlot?.cpIndex ?? i,
        });
      }
      return { meterSlots: slots };
    }),

  setMeterVisualState: (key, state) =>
    set((prev) => {
      const existing = prev.meterSlots.get(key);
      if (!existing) return prev;
      const slots = new Map(prev.meterSlots);
      slots.set(key, { ...existing, visualState: state });
      return { meterSlots: slots };
    }),

  resetMeters: () =>
    set({ meterSlots: createDefaultMeterSlots() }),
});
