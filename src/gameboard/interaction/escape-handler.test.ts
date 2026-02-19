import { describe, it, expect, vi } from 'vitest';
import { getEscapeAction, handleEscape } from './escape-handler.ts';
import type { EscapeHandlerState } from './escape-handler.ts';

function makeState(overrides: Partial<EscapeHandlerState> = {}): EscapeHandlerState {
  return {
    activeScreen: null,
    revealScreen: vi.fn(),
    dismissScreen: vi.fn(),
    hasActiveOverlay: vi.fn(() => false),
    isOverlayEscapeDismissible: vi.fn(() => false),
    closeOverlay: vi.fn(),
    interactionMode: { type: 'idle' },
    cancelPathDraw: vi.fn(),
    cancelPlacing: vi.fn(),
    cancelKeyboardWiring: vi.fn(),
    commitKnobAdjust: vi.fn(),
    selectedChipId: null,
    clearSelection: vi.fn(),
    zoomTransitionType: 'idle',
    isTutorialActive: false,
    endTutorial: vi.fn(),
    ...overrides,
  };
}

describe('escape-handler', () => {
  describe('main menu toggle', () => {
    it('opens menu when nothing is active', () => {
      const state = makeState();
      expect(handleEscape(state)).toBe('open-menu');
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });

    it('closes menu when screen is active', () => {
      const state = makeState({
        activeScreen: 'home',
      });
      expect(handleEscape(state)).toBe('close-menu');
      expect(state.dismissScreen).toHaveBeenCalledOnce();
    });
  });

  describe('noop conditions', () => {
    it('returns noop during zoom animation', () => {
      const state = makeState({ zoomTransitionType: 'animating' });
      expect(getEscapeAction(state)).toBe('noop');
    });

    it('returns noop for non-dismissible overlay', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => false),
      });
      expect(getEscapeAction(state)).toBe('noop');
    });
  });

  describe('cancel-and-menu', () => {
    it('closes dismissible overlay then opens menu', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.closeOverlay).toHaveBeenCalledOnce();
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });

    it('cancels wire drawing then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'drawing-path' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.cancelPathDraw).toHaveBeenCalledOnce();
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });

    it('cancels keyboard wiring then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'keyboard-wiring' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.cancelKeyboardWiring).toHaveBeenCalledOnce();
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });

    it('cancels node placement then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'placing-chip' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.cancelPlacing).toHaveBeenCalledOnce();
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });

    it('commits knob adjust then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'adjusting-knob' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.commitKnobAdjust).toHaveBeenCalledOnce();
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });

    it('clears selection then opens menu', () => {
      const state = makeState({
        selectedChipId: 'n1',
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.clearSelection).toHaveBeenCalledOnce();
      expect(state.revealScreen).toHaveBeenCalledOnce();
    });
  });

  describe('end-tutorial', () => {
    it('ends tutorial when active and no overlay', () => {
      const state = makeState({ isTutorialActive: true });
      expect(handleEscape(state)).toBe('end-tutorial');
      expect(state.endTutorial).toHaveBeenCalledOnce();
    });

    it('does not end tutorial when overlay is active', () => {
      const state = makeState({
        isTutorialActive: true,
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
      });
      expect(getEscapeAction(state)).toBe('cancel-and-menu');
    });

    it('screen close takes precedence over tutorial end', () => {
      const state = makeState({
        activeScreen: 'home',
        isTutorialActive: true,
      });
      expect(getEscapeAction(state)).toBe('close-menu');
    });
  });

  describe('precedence ordering', () => {
    it('screen close takes highest precedence', () => {
      const state = makeState({
        activeScreen: 'home',
        interactionMode: { type: 'drawing-path' },
      });
      expect(getEscapeAction(state)).toBe('close-menu');
    });

    it('zoom animation blocks over interactions', () => {
      const state = makeState({
        zoomTransitionType: 'animating',
        interactionMode: { type: 'drawing-path' },
        selectedChipId: 'n1',
      });
      expect(getEscapeAction(state)).toBe('noop');
    });

    it('dismissible overlay cancel-and-menu takes precedence over wire cancel', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
        interactionMode: { type: 'drawing-path' },
      });
      expect(getEscapeAction(state)).toBe('cancel-and-menu');
    });
  });
});
