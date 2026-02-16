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
    it('starts with null activeScreen and idle transition', () => {
      const { state } = createTestStore();
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('showScreen', () => {
    it('sets activeScreen instantly with idle transition', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      expect(state.activeScreen).toBe('main-menu');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('navigateToPage', () => {
    it('slides left when navigating from main-menu to about', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.navigateToPage('about');
      expect(state.screenTransition).toEqual({
        type: 'sliding-page',
        from: 'main-menu',
        to: 'about',
        direction: 'left',
      });
    });

    it('slides right when navigating from main-menu to settings', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.navigateToPage('settings');
      expect(state.screenTransition).toEqual({
        type: 'sliding-page',
        from: 'main-menu',
        to: 'settings',
        direction: 'right',
      });
    });

    it('slides right when navigating from about to main-menu', () => {
      const { state } = createTestStore();
      state.showScreen('about');
      state.navigateToPage('main-menu');
      expect(state.screenTransition).toEqual({
        type: 'sliding-page',
        from: 'about',
        to: 'main-menu',
        direction: 'right',
      });
    });

    it('does nothing when navigating to the same page', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.navigateToPage('main-menu');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('does nothing when no active screen', () => {
      const { state } = createTestStore();
      state.navigateToPage('about');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('dismissScreen', () => {
    it('starts sliding-down transition', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.dismissScreen();
      expect(state.screenTransition).toEqual({ type: 'sliding-down', page: 'main-menu' });
    });

    it('does nothing when no active screen', () => {
      const { state } = createTestStore();
      state.dismissScreen();
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('revealScreen', () => {
    it('starts sliding-up transition and sets activeScreen', () => {
      const { state } = createTestStore();
      state.revealScreen('main-menu');
      expect(state.activeScreen).toBe('main-menu');
      expect(state.screenTransition).toEqual({ type: 'sliding-up', page: 'main-menu' });
    });

    it('does nothing when a screen is already active', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.revealScreen('about');
      expect(state.activeScreen).toBe('main-menu');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });

  describe('completeScreenTransition', () => {
    it('completes sliding-page: sets activeScreen to target', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.navigateToPage('about');
      state.completeScreenTransition();
      expect(state.activeScreen).toBe('about');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('completes sliding-down: clears activeScreen', () => {
      const { state } = createTestStore();
      state.showScreen('main-menu');
      state.dismissScreen();
      state.completeScreenTransition();
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('completes sliding-up: keeps activeScreen, clears transition', () => {
      const { state } = createTestStore();
      state.revealScreen('main-menu');
      state.completeScreenTransition();
      expect(state.activeScreen).toBe('main-menu');
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });

    it('does nothing on idle', () => {
      const { state } = createTestStore();
      state.completeScreenTransition();
      expect(state.activeScreen).toBe(null);
      expect(state.screenTransition).toEqual({ type: 'idle' });
    });
  });
});
