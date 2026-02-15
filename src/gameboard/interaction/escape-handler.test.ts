import { describe, it, expect, vi } from 'vitest';
import { getEscapeAction, handleEscape } from './escape-handler.ts';
import type { EscapeHandlerState } from './escape-handler.ts';

function makeState(overrides: Partial<EscapeHandlerState> = {}): EscapeHandlerState {
  return {
    activeOverlayType: 'none',
    hasActiveOverlay: vi.fn(() => false),
    isOverlayEscapeDismissible: vi.fn(() => false),
    closeOverlay: vi.fn(),
    openOverlay: vi.fn(),
    interactionMode: { type: 'idle' },
    cancelWireDraw: vi.fn(),
    cancelPlacing: vi.fn(),
    cancelKeyboardWiring: vi.fn(),
    commitKnobAdjust: vi.fn(),
    selectedNodeId: null,
    clearSelection: vi.fn(),
    zoomTransitionType: 'idle',
    ceremonyType: 'inactive',
    ...overrides,
  };
}

describe('escape-handler', () => {
  describe('main menu toggle', () => {
    it('opens menu when nothing is active', () => {
      const state = makeState();
      expect(handleEscape(state)).toBe('open-menu');
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });

    it('closes menu when menu is open', () => {
      const state = makeState({
        activeOverlayType: 'main-menu',
        hasActiveOverlay: vi.fn(() => true),
      });
      expect(handleEscape(state)).toBe('close-menu');
      expect(state.closeOverlay).toHaveBeenCalledOnce();
    });
  });

  describe('noop conditions', () => {
    it('returns noop during zoom animation', () => {
      const state = makeState({ zoomTransitionType: 'animating' });
      expect(getEscapeAction(state)).toBe('noop');
    });

    it('returns noop during victory-screen ceremony', () => {
      const state = makeState({ ceremonyType: 'victory-screen' });
      expect(getEscapeAction(state)).toBe('noop');
    });

    it('returns noop during it-works ceremony', () => {
      const state = makeState({ ceremonyType: 'it-works' });
      expect(getEscapeAction(state)).toBe('noop');
    });

    it('returns noop for non-dismissible overlay', () => {
      const state = makeState({
        activeOverlayType: 'save-dialog',
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => false),
      });
      expect(getEscapeAction(state)).toBe('noop');
    });
  });

  describe('cancel-and-menu', () => {
    it('closes dismissible overlay then opens menu', () => {
      const state = makeState({
        activeOverlayType: 'palette-modal',
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.closeOverlay).toHaveBeenCalledOnce();
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });

    it('cancels wire drawing then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'drawing-wire' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.cancelWireDraw).toHaveBeenCalledOnce();
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });

    it('cancels keyboard wiring then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'keyboard-wiring' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.cancelKeyboardWiring).toHaveBeenCalledOnce();
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });

    it('cancels node placement then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'placing-node' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.cancelPlacing).toHaveBeenCalledOnce();
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });

    it('commits knob adjust then opens menu', () => {
      const state = makeState({
        interactionMode: { type: 'adjusting-knob' },
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.commitKnobAdjust).toHaveBeenCalledOnce();
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });

    it('clears selection then opens menu', () => {
      const state = makeState({
        selectedNodeId: 'n1',
      });
      expect(handleEscape(state)).toBe('cancel-and-menu');
      expect(state.clearSelection).toHaveBeenCalledOnce();
      expect(state.openOverlay).toHaveBeenCalledWith({ type: 'main-menu' });
    });
  });

  describe('precedence ordering', () => {
    it('main menu close takes highest precedence', () => {
      const state = makeState({
        activeOverlayType: 'main-menu',
        hasActiveOverlay: vi.fn(() => true),
        interactionMode: { type: 'drawing-wire' },
      });
      expect(getEscapeAction(state)).toBe('close-menu');
    });

    it('zoom animation blocks over interactions', () => {
      const state = makeState({
        zoomTransitionType: 'animating',
        interactionMode: { type: 'drawing-wire' },
        selectedNodeId: 'n1',
      });
      expect(getEscapeAction(state)).toBe('noop');
    });

    it('dismissible overlay cancel-and-menu takes precedence over wire cancel', () => {
      const state = makeState({
        activeOverlayType: 'palette-modal',
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
        interactionMode: { type: 'drawing-wire' },
      });
      expect(getEscapeAction(state)).toBe('cancel-and-menu');
    });
  });
});
