import { describe, it, expect } from 'vitest';
import { createMeterSlice } from './meter-slice.ts';
import type { MeterSlice } from './meter-slice.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';
import type { SlotConfig } from '../../puzzle/types.ts';

/**
 * Minimal Zustand StateCreator harness.
 * Returns { get, actions } so tests always read fresh state.
 */
function createTestSlice() {
  let state: MeterSlice = {} as MeterSlice;
  const set = (partial: Partial<MeterSlice> | ((s: MeterSlice) => Partial<MeterSlice>)) => {
    const update = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...update };
  };
  const get = () => state;
  state = (createMeterSlice as Function)(set, get, { setState: set, getState: get, subscribe: () => () => {} });
  return {
    get: () => state,
    actions: state, // action closures capture set(), so they mutate state
  };
}

describe('meter-slice', () => {
  it('defaults all 6 meters to off mode', () => {
    const { get } = createTestSlice();
    expect(get().meterSlots.size).toBe(6);
    for (const [, slot] of get().meterSlots) {
      expect(slot.mode).toBe('off');
    }
  });

  it('initializeMeters sets active slots to their direction as mode', () => {
    const { get, actions } = createTestSlice();
    const config: SlotConfig = [
      { active: true, direction: 'input' },
      { active: true, direction: 'input' },
      { active: false, direction: 'input' },
      { active: true, direction: 'output' },
      { active: false, direction: 'output' },
      { active: false, direction: 'output' },
    ];
    actions.initializeMeters(config);
    expect(get().meterSlots.get(meterKey(0))!.mode).toBe('input');
    expect(get().meterSlots.get(meterKey(1))!.mode).toBe('input');
    expect(get().meterSlots.get(meterKey(2))!.mode).toBe('off');
    expect(get().meterSlots.get(meterKey(3))!.mode).toBe('output');
    expect(get().meterSlots.get(meterKey(4))!.mode).toBe('off');
  });

  it('initializeMeters uses custom inactiveMode', () => {
    const { get, actions } = createTestSlice();
    const config: SlotConfig = [
      { active: true, direction: 'input' },
      { active: false, direction: 'input' },
      { active: false, direction: 'input' },
      { active: false, direction: 'output' },
      { active: false, direction: 'output' },
      { active: false, direction: 'output' },
    ];
    actions.initializeMeters(config, 'off');
    expect(get().meterSlots.get(meterKey(0))!.mode).toBe('input');
    expect(get().meterSlots.get(meterKey(1))!.mode).toBe('off');
    expect(get().meterSlots.get(meterKey(3))!.mode).toBe('off');
  });

  it('setMeterMode updates a single slot', () => {
    const { get, actions } = createTestSlice();
    actions.setMeterMode(0, 'input');
    expect(get().meterSlots.get(meterKey(0))!.mode).toBe('input');
    // Other slots remain off
    expect(get().meterSlots.get(meterKey(1))!.mode).toBe('off');
  });

  it('setMeterMode is no-op for unknown key', () => {
    const { get, actions } = createTestSlice();
    const before = new Map(get().meterSlots);
    actions.setMeterMode(9, 'input');
    expect(get().meterSlots.size).toBe(before.size);
  });

  it('resetMeters restores all to off defaults', () => {
    const { get, actions } = createTestSlice();
    actions.setMeterMode(0, 'input');
    actions.setMeterMode(5, 'output');
    actions.resetMeters();
    for (const [, slot] of get().meterSlots) {
      expect(slot.mode).toBe('off');
    }
  });
});
