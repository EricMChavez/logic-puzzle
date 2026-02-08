import { describe, it, expect } from 'vitest';
import { createMeterSlice } from './meter-slice.ts';
import type { MeterSlice } from './meter-slice.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';
import type { ConnectionPointConfig } from '../../puzzle/types.ts';

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
  it('defaults all 6 meters to hidden', () => {
    const { get } = createTestSlice();
    expect(get().meterSlots.size).toBe(6);
    for (const [, slot] of get().meterSlots) {
      expect(slot.visualState).toBe('hidden');
    }
  });

  it('left meters default to input direction', () => {
    const { get } = createTestSlice();
    expect(get().meterSlots.get(meterKey('left', 0))!.direction).toBe('input');
    expect(get().meterSlots.get(meterKey('left', 1))!.direction).toBe('input');
    expect(get().meterSlots.get(meterKey('left', 2))!.direction).toBe('input');
  });

  it('right meters default to output direction', () => {
    const { get } = createTestSlice();
    expect(get().meterSlots.get(meterKey('right', 0))!.direction).toBe('output');
    expect(get().meterSlots.get(meterKey('right', 1))!.direction).toBe('output');
    expect(get().meterSlots.get(meterKey('right', 2))!.direction).toBe('output');
  });

  it('initializeMeters activates configured slots', () => {
    const { get, actions } = createTestSlice();
    const config: ConnectionPointConfig = {
      left: [
        { active: true, direction: 'input' },
        { active: true, direction: 'input' },
        { active: false, direction: 'input' },
      ],
      right: [
        { active: true, direction: 'output' },
        { active: false, direction: 'output' },
        { active: false, direction: 'output' },
      ],
    };
    actions.initializeMeters(config);
    expect(get().meterSlots.get(meterKey('left', 0))!.visualState).toBe('active');
    expect(get().meterSlots.get(meterKey('left', 1))!.visualState).toBe('active');
    expect(get().meterSlots.get(meterKey('left', 2))!.visualState).toBe('hidden');
    expect(get().meterSlots.get(meterKey('right', 0))!.visualState).toBe('active');
    expect(get().meterSlots.get(meterKey('right', 1))!.visualState).toBe('hidden');
  });

  it('setMeterVisualState updates a single slot', () => {
    const { get, actions } = createTestSlice();
    const key = meterKey('left', 0);
    actions.setMeterVisualState(key, 'dimmed');
    expect(get().meterSlots.get(key)!.visualState).toBe('dimmed');
    // Other slots remain hidden
    expect(get().meterSlots.get(meterKey('left', 1))!.visualState).toBe('hidden');
  });

  it('setMeterVisualState is no-op for unknown key', () => {
    const { get, actions } = createTestSlice();
    const before = new Map(get().meterSlots);
    actions.setMeterVisualState('left:9' as any, 'active');
    expect(get().meterSlots.size).toBe(before.size);
  });

  it('initializeMeters passes cpIndex through from config', () => {
    const { get, actions } = createTestSlice();
    const config: ConnectionPointConfig = {
      left: [
        { active: true, direction: 'output', cpIndex: 0 },
        { active: false, direction: 'input' },
        { active: false, direction: 'input' },
      ],
      right: [
        { active: false, direction: 'output' },
        { active: true, direction: 'input', cpIndex: 0 },
        { active: false, direction: 'output' },
      ],
    };
    actions.initializeMeters(config);
    expect(get().meterSlots.get(meterKey('left', 0))!.cpIndex).toBe(0);
    expect(get().meterSlots.get(meterKey('left', 0))!.direction).toBe('output');
    expect(get().meterSlots.get(meterKey('right', 1))!.cpIndex).toBe(0);
    expect(get().meterSlots.get(meterKey('right', 1))!.direction).toBe('input');
  });

  it('resetMeters restores all to hidden defaults', () => {
    const { get, actions } = createTestSlice();
    actions.setMeterVisualState(meterKey('left', 0), 'active');
    actions.setMeterVisualState(meterKey('right', 2), 'confirming');
    actions.resetMeters();
    for (const [, slot] of get().meterSlots) {
      expect(slot.visualState).toBe('hidden');
    }
  });
});
