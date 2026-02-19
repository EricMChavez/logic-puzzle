import type { StateCreator } from 'zustand';

export type GizmoTab = 'home' | 'settings' | 'about' | 'thankyou';

export type ScreenTransition =
  | { type: 'idle' }
  | { type: 'powering-off' }
  | { type: 'sliding-down' }
  | { type: 'sliding-up' };

export interface ScreenSlice {
  activeScreen: GizmoTab | null;
  screenTransition: ScreenTransition;
  tabSwitchGeneration: number;

  switchTab: (tab: GizmoTab) => void;
  dismissScreen: () => void;
  revealScreen: () => void;
  showScreen: () => void;
  completeScreenTransition: () => void;
}

export const createScreenSlice: StateCreator<ScreenSlice> = (set, get) => ({
  activeScreen: null,
  screenTransition: { type: 'idle' },
  tabSwitchGeneration: 0,

  switchTab: (tab) => {
    const { activeScreen } = get();
    if (activeScreen === tab) return;
    set({
      activeScreen: tab,
      tabSwitchGeneration: get().tabSwitchGeneration + 1,
    });
  },

  showScreen: () => set({
    activeScreen: 'home',
    screenTransition: { type: 'idle' },
  }),

  dismissScreen: () => {
    const { activeScreen, screenTransition } = get();
    if (!activeScreen) return;
    if (screenTransition.type !== 'idle') return;
    set({ screenTransition: { type: 'powering-off' } });
  },

  revealScreen: () => {
    const { activeScreen } = get();
    if (activeScreen) return;
    set({
      activeScreen: 'home',
      screenTransition: { type: 'sliding-up' },
    });
  },

  completeScreenTransition: () => {
    const { screenTransition } = get();
    switch (screenTransition.type) {
      case 'powering-off':
        set({ screenTransition: { type: 'sliding-down' } });
        break;
      case 'sliding-down':
        set({ activeScreen: null, screenTransition: { type: 'idle' } });
        break;
      case 'sliding-up':
        set({ screenTransition: { type: 'idle' } });
        break;
    }
  },
});
