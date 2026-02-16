import type { StateCreator } from 'zustand';

export type ScreenPage = 'main-menu' | 'about' | 'settings';

/** Ordering for slide direction: navigating to a higher index slides left, lower slides right */
const PAGE_ORDER: ScreenPage[] = ['settings', 'main-menu', 'about'];

export type ScreenTransition =
  | { type: 'idle' }
  | { type: 'sliding-page'; from: ScreenPage; to: ScreenPage; direction: 'left' | 'right' }
  | { type: 'sliding-down'; page: ScreenPage }
  | { type: 'sliding-up'; page: ScreenPage };

export interface ScreenSlice {
  activeScreen: ScreenPage | null;
  screenTransition: ScreenTransition;
  showScreen: (page: ScreenPage) => void;
  navigateToPage: (to: ScreenPage) => void;
  dismissScreen: () => void;
  revealScreen: (page: ScreenPage) => void;
  completeScreenTransition: () => void;
}

export const createScreenSlice: StateCreator<ScreenSlice> = (set, get) => ({
  activeScreen: null,
  screenTransition: { type: 'idle' },

  showScreen: (page) => set({ activeScreen: page, screenTransition: { type: 'idle' } }),

  navigateToPage: (to) => {
    const { activeScreen } = get();
    if (!activeScreen || activeScreen === to) return;
    const fromIndex = PAGE_ORDER.indexOf(activeScreen);
    const toIndex = PAGE_ORDER.indexOf(to);
    const direction = toIndex > fromIndex ? 'left' : 'right';
    set({
      screenTransition: { type: 'sliding-page', from: activeScreen, to, direction },
    });
  },

  dismissScreen: () => {
    const { activeScreen } = get();
    if (!activeScreen) return;
    set({
      screenTransition: { type: 'sliding-down', page: activeScreen },
    });
  },

  revealScreen: (page) => {
    const { activeScreen } = get();
    if (activeScreen) return;
    set({
      activeScreen: page,
      screenTransition: { type: 'sliding-up', page },
    });
  },

  completeScreenTransition: () => {
    const { screenTransition } = get();
    if (screenTransition.type === 'sliding-page') {
      set({ activeScreen: screenTransition.to, screenTransition: { type: 'idle' } });
    } else if (screenTransition.type === 'sliding-down') {
      set({ activeScreen: null, screenTransition: { type: 'idle' } });
    } else if (screenTransition.type === 'sliding-up') {
      set({ screenTransition: { type: 'idle' } });
    }
  },
});
