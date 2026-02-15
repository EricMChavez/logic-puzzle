import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../index.ts';
import { CREATIVE_SLOT_COUNT } from './creative-slice.ts';

describe('creative-slice', () => {
  beforeEach(() => {
    // Fully reset creative mode state before each test
    useGameStore.getState().exitCreativeMode();
    useGameStore.getState().clearSavedCreativeState();
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

    it('saves creative slots state on exit (for persistence)', () => {
      useGameStore.getState().enterCreativeMode();
      useGameStore.getState().setActiveBoard({ id: 'creative-mode', chips: new Map(), paths: [] });
      useGameStore.getState().setCreativeSlotDirection(0, 'output');
      useGameStore.getState().setCreativeSlotWaveformShape(0, 'square-quarter');

      useGameStore.getState().exitCreativeMode();

      // Slots are saved, not reset
      const saved = useGameStore.getState().savedCreativeState;
      expect(saved).not.toBeNull();
      expect(saved!.slots[0].direction).toBe('output');
      expect(saved!.slots[0].waveform.shape).toBe('square-quarter');
    });
  });

  describe('creativeSlots defaults', () => {
    it('has 6 slots (3 left + 3 right)', () => {
      const slots = useGameStore.getState().creativeSlots;
      expect(slots.length).toBe(CREATIVE_SLOT_COUNT);
    });

    it('all slots default to off (fresh creative mode starts empty)', () => {
      const slots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < slots.length; i++) {
        expect(slots[i].direction).toBe('off');
      }
    });

    it('all slots have default sine-quarter waveform', () => {
      const slots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < slots.length; i++) {
        expect(slots[i].waveform.shape).toBe('sine-quarter');
        expect(slots[i].waveform.amplitude).toBe(100);
        expect(slots[i].waveform.period).toBe(64);
      }
    });
  });

  describe('setCreativeSlotDirection', () => {
    it('changes slot direction from off to output', () => {
      // Slot 0 defaults to off
      expect(useGameStore.getState().creativeSlots[0].direction).toBe('off');

      const changed = useGameStore.getState().setCreativeSlotDirection(0, 'output');

      expect(changed).toBe(true);
      expect(useGameStore.getState().creativeSlots[0].direction).toBe('output');
    });

    it('returns false when direction unchanged', () => {
      // Slot 0 defaults to off
      expect(useGameStore.getState().creativeSlots[0].direction).toBe('off');

      const changed = useGameStore.getState().setCreativeSlotDirection(0, 'off');

      expect(changed).toBe(false);
    });

    it('resets waveform to default when switching to input', () => {
      // Start from output direction
      useGameStore.getState().setCreativeSlotDirection(3, 'output');
      useGameStore.getState().setCreativeSlotWaveformShape(3, 'square-quarter');
      expect(useGameStore.getState().creativeSlots[3].waveform.shape).toBe('square-quarter');

      useGameStore.getState().setCreativeSlotDirection(3, 'off');
      useGameStore.getState().setCreativeSlotDirection(3, 'input');

      expect(useGameStore.getState().creativeSlots[3].waveform.shape).toBe('sine-quarter');
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
      useGameStore.getState().setCreativeSlotWaveformShape(0, 'sawtooth-quarter');

      const slots = useGameStore.getState().creativeSlots;
      expect(slots[0].waveform.shape).toBe('sawtooth-quarter');
      // Other slots unchanged
      expect(slots[1].waveform.shape).toBe('sine-quarter');
    });

    it('preserves amplitude and updates period based on shape', () => {
      const originalAmplitude = useGameStore.getState().creativeSlots[0].waveform.amplitude;

      useGameStore.getState().setCreativeSlotWaveformShape(0, 'sine-full');

      const slot = useGameStore.getState().creativeSlots[0];
      expect(slot.waveform.shape).toBe('sine-full');
      expect(slot.waveform.amplitude).toBe(originalAmplitude);
      expect(slot.waveform.period).toBe(256); // full = 256 cycles
    });

    it('ignores invalid indices', () => {
      const originalSlots = [...useGameStore.getState().creativeSlots];

      useGameStore.getState().setCreativeSlotWaveformShape(-1, 'sawtooth-quarter');
      useGameStore.getState().setCreativeSlotWaveformShape(6, 'sawtooth-quarter');

      const newSlots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < newSlots.length; i++) {
        expect(newSlots[i].waveform.shape).toBe(originalSlots[i].waveform.shape);
      }
    });
  });

  describe('setCreativeSlotWaveform', () => {
    it('replaces the entire waveform definition', () => {
      const newWaveform = {
        shape: 'triangle-half' as const,
        amplitude: 75,
        period: 128,
        phase: 4,
        offset: 10,
      };

      useGameStore.getState().setCreativeSlotWaveform(1, newWaveform);

      const slot = useGameStore.getState().creativeSlots[1];
      expect(slot.waveform).toEqual(newWaveform);
      // Other slots unchanged
      expect(useGameStore.getState().creativeSlots[0].waveform.shape).toBe('sine-quarter');
    });

    it('ignores invalid indices', () => {
      const originalSlots = [...useGameStore.getState().creativeSlots];

      useGameStore.getState().setCreativeSlotWaveform(-1, { shape: 'sawtooth-quarter', amplitude: 100, period: 64, phase: 0, offset: 0 });
      useGameStore.getState().setCreativeSlotWaveform(6, { shape: 'sawtooth-quarter', amplitude: 100, period: 64, phase: 0, offset: 0 });

      const newSlots = useGameStore.getState().creativeSlots;
      for (let i = 0; i < newSlots.length; i++) {
        expect(newSlots[i].waveform).toEqual(originalSlots[i].waveform);
      }
    });
  });

  describe('persistence', () => {
    it('exitCreativeMode saves current state', () => {
      const store = useGameStore.getState();
      store.enterCreativeMode();
      store.setActiveBoard({ id: 'creative-mode', chips: new Map(), paths: [] });
      store.setCreativeSlotWaveformShape(0, 'square-quarter');

      store.exitCreativeMode();

      const saved = useGameStore.getState().savedCreativeState;
      expect(saved).not.toBeNull();
      expect(saved!.slots[0].waveform.shape).toBe('square-quarter');
      expect(saved!.board.id).toBe('creative-mode');
    });

    it('enterCreativeMode restores saved slots', () => {
      const store = useGameStore.getState();
      store.enterCreativeMode();
      store.setActiveBoard({ id: 'creative-mode', chips: new Map(), paths: [] });
      store.setCreativeSlotWaveformShape(1, 'triangle-half');
      store.exitCreativeMode();

      // Re-enter
      store.enterCreativeMode();
      const slots = useGameStore.getState().creativeSlots;
      expect(slots[1].waveform.shape).toBe('triangle-half');
    });

    it('clearSavedCreativeState resets to defaults', () => {
      const store = useGameStore.getState();
      store.enterCreativeMode();
      store.setActiveBoard({ id: 'creative-mode', chips: new Map(), paths: [] });
      store.setCreativeSlotWaveformShape(0, 'square-quarter');
      store.exitCreativeMode();
      expect(useGameStore.getState().savedCreativeState).not.toBeNull();

      store.clearSavedCreativeState();
      expect(useGameStore.getState().savedCreativeState).toBeNull();
      expect(useGameStore.getState().creativeSlots[0].waveform.shape).toBe('sine-quarter');
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
