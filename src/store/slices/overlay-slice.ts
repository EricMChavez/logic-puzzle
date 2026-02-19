import type { StateCreator } from 'zustand';
import type { ChipId, Vec2 } from '../../shared/types/index.ts';

/** What entity a context menu targets */
export type ContextTarget =
  | { type: 'chip'; chipId: ChipId; locked?: boolean }
  | { type: 'path'; pathId: string }
  | { type: 'empty' };

/** Discriminated union of all overlay types */
export type ActiveOverlay =
  | { type: 'none' }
  | { type: 'palette-modal' }
  | { type: 'parameter-popover'; chipId: ChipId }
  | { type: 'context-menu'; position: Vec2; target: ContextTarget }
  | { type: 'inspect-modal'; chipId: ChipId }
  | { type: 'save-dialog' }
  | { type: 'unsaved-changes' }
  | { type: 'waveform-selector'; slotIndex: number }
  | { type: 'save-puzzle-dialog' }
  | { type: 'node-creation-form' };

/** Overlay types that cannot be dismissed by Escape */
const ESCAPE_IMMUNE = new Set<ActiveOverlay['type']>(['save-dialog', 'unsaved-changes', 'save-puzzle-dialog']);

export interface OverlaySlice {
  activeOverlay: ActiveOverlay;
  openOverlay: (overlay: ActiveOverlay) => void;
  closeOverlay: () => void;
  isOverlayEscapeDismissible: () => boolean;
  hasActiveOverlay: () => boolean;
}

export const createOverlaySlice: StateCreator<OverlaySlice> = (set, get) => ({
  activeOverlay: { type: 'none' },

  openOverlay: (overlay) => set({ activeOverlay: overlay }),

  closeOverlay: () => set({ activeOverlay: { type: 'none' } }),

  isOverlayEscapeDismissible: () => {
    const { activeOverlay } = get();
    if (activeOverlay.type === 'none') return false;
    return !ESCAPE_IMMUNE.has(activeOverlay.type);
  },

  hasActiveOverlay: () => get().activeOverlay.type !== 'none',
});
