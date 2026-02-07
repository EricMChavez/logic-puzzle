import { describe, it, expect, vi } from 'vitest';
import { handleEscape } from './escape-handler.ts';
import type { EscapeHandlerState } from './escape-handler.ts';

function makeState(overrides: Partial<EscapeHandlerState> = {}): EscapeHandlerState {
  return {
    hasActiveOverlay: vi.fn(() => false),
    isOverlayEscapeDismissible: vi.fn(() => false),
    closeOverlay: vi.fn(),
    interactionMode: { type: 'idle' },
    cancelWireDraw: vi.fn(),
    cancelPlacing: vi.fn(),
    selectedNodeId: null,
    clearSelection: vi.fn(),
    navigationDepth: 0,
    zoomOut: vi.fn(),
    ...overrides,
  };
}

describe('escape-handler', () => {
  describe('priority 1: escape-dismissible overlay', () => {
    it('closes a dismissible overlay and returns close-overlay', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
      });
      expect(handleEscape(state)).toBe('close-overlay');
      expect(state.closeOverlay).toHaveBeenCalledOnce();
    });

    it('does not proceed to wire cancel when overlay is dismissed', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
        interactionMode: { type: 'drawing-wire' },
      });
      handleEscape(state);
      expect(state.cancelWireDraw).not.toHaveBeenCalled();
    });
  });

  describe('priority 2: non-dismissible overlay blocks cascade', () => {
    it('returns noop for save-dialog (non-dismissible)', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => false),
      });
      expect(handleEscape(state)).toBe('noop');
      expect(state.closeOverlay).not.toHaveBeenCalled();
    });

    it('blocks wire cancellation when non-dismissible overlay is open', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => false),
        interactionMode: { type: 'drawing-wire' },
      });
      expect(handleEscape(state)).toBe('noop');
      expect(state.cancelWireDraw).not.toHaveBeenCalled();
    });
  });

  describe('priority 3: cancel wire drawing', () => {
    it('cancels wire drawing and returns cancel-wiring', () => {
      const state = makeState({
        interactionMode: { type: 'drawing-wire' },
      });
      expect(handleEscape(state)).toBe('cancel-wiring');
      expect(state.cancelWireDraw).toHaveBeenCalledOnce();
    });
  });

  describe('priority 4: cancel placement / deselect', () => {
    it('cancels node placement and returns deselect', () => {
      const state = makeState({
        interactionMode: { type: 'placing-node' },
      });
      expect(handleEscape(state)).toBe('deselect');
      expect(state.cancelPlacing).toHaveBeenCalledOnce();
    });

    it('clears selection when a node is selected', () => {
      const state = makeState({
        selectedNodeId: 'n1',
      });
      expect(handleEscape(state)).toBe('deselect');
      expect(state.clearSelection).toHaveBeenCalledOnce();
    });

    it('placement cancellation takes priority over selection clearing', () => {
      const state = makeState({
        interactionMode: { type: 'placing-node' },
        selectedNodeId: 'n1',
      });
      handleEscape(state);
      expect(state.cancelPlacing).toHaveBeenCalledOnce();
      expect(state.clearSelection).not.toHaveBeenCalled();
    });
  });

  describe('priority 5: zoom out', () => {
    it('zooms out when at depth > 0 and returns zoom-out', () => {
      const state = makeState({
        navigationDepth: 1,
      });
      expect(handleEscape(state)).toBe('zoom-out');
      expect(state.zoomOut).toHaveBeenCalledOnce();
    });

    it('does not zoom out at depth 0', () => {
      const state = makeState({
        navigationDepth: 0,
      });
      expect(handleEscape(state)).toBe('noop');
      expect(state.zoomOut).not.toHaveBeenCalled();
    });
  });

  describe('noop fallback', () => {
    it('returns noop when nothing to do', () => {
      const state = makeState();
      expect(handleEscape(state)).toBe('noop');
    });
  });

  describe('precedence ordering', () => {
    it('overlay takes precedence over wire drawing', () => {
      const state = makeState({
        hasActiveOverlay: vi.fn(() => true),
        isOverlayEscapeDismissible: vi.fn(() => true),
        interactionMode: { type: 'drawing-wire' },
        navigationDepth: 2,
      });
      expect(handleEscape(state)).toBe('close-overlay');
    });

    it('wire drawing takes precedence over zoom out', () => {
      const state = makeState({
        interactionMode: { type: 'drawing-wire' },
        navigationDepth: 2,
      });
      expect(handleEscape(state)).toBe('cancel-wiring');
    });

    it('deselect takes precedence over zoom out', () => {
      const state = makeState({
        selectedNodeId: 'n1',
        navigationDepth: 2,
      });
      expect(handleEscape(state)).toBe('deselect');
    });
  });
});
