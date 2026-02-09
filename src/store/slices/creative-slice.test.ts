import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../index.ts';
import { CREATIVE_SLOT_COUNT } from './creative-slice.ts';

describe('creative-slice', () => {
  beforeEach(() => {
    // Reset creative mode state before each test
    useGameStore.getState().exitCreativeMode();
  });

  describe('enterCreativeMode', () => {
    it('sets isCreativeMode to true', () => {
      expect(useGameStore.getState().isCreativeMode).toBe(false);

      useGameStore.getState().enterCreativeMode();

      expect(useGameStore.getState().isCreativeMode).toBe(true);
    });
  });

  describe('exitCreativeMode', () => {
    it('sets isCreativeMode to false', () => {
      useGameStore.getState().enterCreativeMode();
      expect(useGameStore.getState().isCreativeMode).toBe(true);

      useGameStore.getState().exitCreativeMode();

      expect(useGameStore.getState().isCreativeMode).toBe(false);
    });

    it('resets creative slots to default (left=input, right=output)', () => {
      useGameStore.getState().enterCreativeMode();
      useGameStore.getState().setCreativeSlotDirection(0, 'output'); // Change from default
      useGameStore.getState().setCreativeSlotWaveformShape(0, 'square');

      useGameStore.getState().exitCreativeMode();

      const slots = useGameStore.getState().creativeSlots;
      expect(slots[0].direction).toBe('input'); // Reset to default
      expect(slots[0].waveform.shape).toBe('sine'); // Default waveform
    });
  });

  describe('creativeSlots defaults', () => {
    it('has 6 slots (3 left + 3 right)', () => {
      const slots = useGameStore.getState().creativeSlots;
      expect(slots.length).toBe(CREATIVE_SLOT_COUNT);
    });

    it('left slots (0-2) default to input, right slots (3-5) default to output', () => {
      const slots = useGameStore.getState().creativeSlots;
      // Left side (0-2) are inputs
      expect(slots[0].direction).toBe('input');
      expect(slots[1].direction).toBe('input');
      expect(slots[2].direction).toBe('input');
      // Right side (3-5) are outputs
      expect(slots[3].direction).toBe('output');
      expect(slots[4].direction).toBe('output');
      expect(slots[5].direction).toBe('output');
    });

    it('all slots have default sine waveform', () => {
      const slots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < slots.length; i++) {
        expect(slots[i].waveform.shape).toBe('sine');
        expect(slots[i].waveform.amplitude).toBe(100);
        expect(slots[i].waveform.period).toBe(64);
      }
    });
  });

  describe('setCreativeSlotDirection', () => {
    it('changes slot direction from input to output (left slot)', () => {
      // Slot 0 defaults to input
      expect(useGameStore.getState().creativeSlots[0].direction).toBe('input');

      const changed = useGameStore.getState().setCreativeSlotDirection(0, 'output');

      expect(changed).toBe(true);
      expect(useGameStore.getState().creativeSlots[0].direction).toBe('output');
    });

    it('returns false when direction unchanged', () => {
      // Slot 0 defaults to input
      expect(useGameStore.getState().creativeSlots[0].direction).toBe('input');

      const changed = useGameStore.getState().setCreativeSlotDirection(0, 'input');

      expect(changed).toBe(false);
    });

    it('resets waveform to default when switching to input', () => {
      // Start from output direction
      useGameStore.getState().setCreativeSlotDirection(3, 'input'); // Slot 3 defaults to output
      useGameStore.getState().setCreativeSlotWaveformShape(3, 'square');
      expect(useGameStore.getState().creativeSlots[3].waveform.shape).toBe('square');

      useGameStore.getState().setCreativeSlotDirection(3, 'output');
      useGameStore.getState().setCreativeSlotDirection(3, 'input');

      expect(useGameStore.getState().creativeSlots[3].waveform.shape).toBe('sine');
    });

    it('ignores invalid indices', () => {
      const changed1 = useGameStore.getState().setCreativeSlotDirection(-1, 'input');
      const changed2 = useGameStore.getState().setCreativeSlotDirection(6, 'input');

      expect(changed1).toBe(false);
      expect(changed2).toBe(false);
    });
  });

  describe('setCreativeSlotWaveformShape', () => {
    it('updates the shape of a specific slot waveform', () => {
      useGameStore.getState().setCreativeSlotWaveformShape(0, 'sawtooth');

      const slots = useGameStore.getState().creativeSlots;
      expect(slots[0].waveform.shape).toBe('sawtooth');
      // Other slots unchanged
      expect(slots[1].waveform.shape).toBe('sine');
    });

    it('preserves other waveform properties when changing shape', () => {
      const originalAmplitude = useGameStore.getState().creativeSlots[0].waveform.amplitude;
      const originalPeriod = useGameStore.getState().creativeSlots[0].waveform.period;

      useGameStore.getState().setCreativeSlotWaveformShape(0, 'overtone');

      const slot = useGameStore.getState().creativeSlots[0];
      expect(slot.waveform.shape).toBe('overtone');
      expect(slot.waveform.amplitude).toBe(originalAmplitude);
      expect(slot.waveform.period).toBe(originalPeriod);
    });

    it('ignores invalid indices', () => {
      const originalSlots = [...useGameStore.getState().creativeSlots];

      useGameStore.getState().setCreativeSlotWaveformShape(-1, 'sawtooth');
      useGameStore.getState().setCreativeSlotWaveformShape(6, 'sawtooth');

      const newSlots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < newSlots.length; i++) {
        expect(newSlots[i].waveform.shape).toBe(originalSlots[i].waveform.shape);
      }
    });
  });

  describe('setCreativeSlotWaveform', () => {
    it('replaces the entire waveform definition', () => {
      const newWaveform = {
        shape: 'clipped-sine' as const,
        amplitude: 75,
        period: 32,
        phase: 4,
        offset: 10,
      };

      useGameStore.getState().setCreativeSlotWaveform(1, newWaveform);

      const slot = useGameStore.getState().creativeSlots[1];
      expect(slot.waveform).toEqual(newWaveform);
      // Other slots unchanged
      expect(useGameStore.getState().creativeSlots[0].waveform.shape).toBe('sine');
    });

    it('ignores invalid indices', () => {
      const originalSlots = [...useGameStore.getState().creativeSlots];

      useGameStore.getState().setCreativeSlotWaveform(-1, { shape: 'sawtooth', amplitude: 100, period: 8, phase: 0, offset: 0 });
      useGameStore.getState().setCreativeSlotWaveform(6, { shape: 'sawtooth', amplitude: 100, period: 8, phase: 0, offset: 0 });

      const newSlots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < newSlots.length; i++) {
        expect(newSlots[i].waveform).toEqual(originalSlots[i].waveform);
      }
    });
  });

  describe('getCreativeSlotIndex', () => {
    it('returns correct index for left side', () => {
      const store = useGameStore.getState();
      expect(store.getCreativeSlotIndex('left', 0)).toBe(0);
      expect(store.getCreativeSlotIndex('left', 1)).toBe(1);
      expect(store.getCreativeSlotIndex('left', 2)).toBe(2);
    });

    it('returns correct index for right side', () => {
      const store = useGameStore.getState();
      expect(store.getCreativeSlotIndex('right', 0)).toBe(3);
      expect(store.getCreativeSlotIndex('right', 1)).toBe(4);
      expect(store.getCreativeSlotIndex('right', 2)).toBe(5);
    });
  });
});
