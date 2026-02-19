import { describe, it, expect } from 'vitest';
import { createScreenSlice } from './screen-slice.ts';
import type { ScreenSlice } from './screen-slice.ts';

function createTestStore() {
  const container = { state: {} as ScreenSlice };
  const set = (partial: Partial<ScreenSlice>) => {
    Object.assign(container.state, partial);
  };
  const get = () => container.state;
  container.state = createScreenSlice(set as never, get as never, {} as never);
  return container;
}

describe('screen-slice', () => {
  describe('initial state', () => {
    it('starts with null activeScreen, idle transition, and generation 0', () => {
      const { state } = createTestStore();
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
      expect(state.tabSwitchGeneration).toBe(0);
    });
  });

  describe('showScreen', () => {
    it('sets activeScreen to home with idle transition', () => {
      const { state } = createTestStore();
      state.showScreen();
      expect(state.activeScreen).toBe('home');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('switchTab', () => {
    it('switches to a different tab and bumps generation', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.switchTab('settings');
      expect(state.activeScreen).toBe('settings');
      expect(state.tabSwitchGeneration).toBe(1);
    });

    it('does nothing when switching to the same tab', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.switchTab('home');
      expect(state.activeScreen).toBe('home');
      expect(state.tabSwitchGeneration).toBe(0);
    });

    it('increments generation on each switch', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.switchTab('settings');
      state.switchTab('about');
      state.switchTab('home');
      expect(state.tabSwitchGeneration).toBe(3);
    });
  });

  describe('dismissScreen', () => {
    it('starts powering-off transition', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.dismissScreen();
      expect(state.screenTransition).toEqual({ type: 'powering-off' });
    });

    it('does nothing when no active screen', () => {
      const { state } = createTestStore();
      state.dismissScreen();
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('is no-op when already powering-off', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.dismissScreen();
      expect(state.screenTransition).toEqual({ type: 'powering-off' });
      state.dismissScreen(); // no-op
      expect(state.screenTransition).toEqual({ type: 'powering-off' });
    });

    it('is no-op during sliding-up', () => {
      const { state } = createTestStore();
      state.revealScreen();
      expect(state.screenTransition).toEqual({ type: 'sliding-up' });
      state.dismissScreen(); // no-op — not idle
      expect(state.screenTransition).toEqual({ type: 'sliding-up' });
    });
  });

  describe('revealScreen', () => {
    it('starts sliding-up transition and sets activeScreen to home', () => {
      const { state } = createTestStore();
      state.revealScreen();
      expect(state.activeScreen).toBe('home');
      expect(state.screenTransition).toEqual({ type: 'sliding-up' });
    });

    it('does nothing when a screen is already active', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.switchTab('settings');
      state.revealScreen();
      expect(state.activeScreen).toBe('settings');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('completeScreenTransition', () => {
    it('powering-off → sliding-down (activeScreen stays)', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.dismissScreen();
      expect(state.screenTransition).toEqual({ type: 'powering-off' });
      state.completeScreenTransition();
      expect(state.activeScreen).toBe('home');
      expect(state.screenTransition).toEqual({ type: 'sliding-down' });
    });

    it('sliding-down → clears activeScreen', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.dismissScreen();
      state.completeScreenTransition(); // powering-off → sliding-down
      state.completeScreenTransition(); // sliding-down → clear
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('sliding-up → idle (activeScreen stays)', () => {
      const { state } = createTestStore();
      state.revealScreen();
      expect(state.screenTransition).toEqual({ type: 'sliding-up' });
      state.completeScreenTransition();
      expect(state.activeScreen).toBe('home');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('does nothing on idle', () => {
      const { state } = createTestStore();
      state.completeScreenTransition();
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('full dismiss chain: powering-off → sliding-down → clear', () => {
      const { state } = createTestStore();
      state.showScreen();
      state.dismissScreen();
      state.completeScreenTransition(); // powering-off → sliding-down
      expect(state.activeScreen).toBe('home');
      expect(state.screenTransition).toEqual({ type: 'sliding-down' });
      state.completeScreenTransition(); // sliding-down → clear
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('full reveal chain: sliding-up → idle', () => {
      const { state } = createTestStore();
      state.revealScreen();
      state.completeScreenTransition(); // sliding-up → idle
      expect(state.activeScreen).toBe('home');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });
});
