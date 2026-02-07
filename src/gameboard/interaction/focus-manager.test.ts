import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFocusContext, enterOverlayFocus, exitOverlayFocus, trapFocus } from './focus-manager.ts';

/**
 * Minimal DOM stubs for focus-manager testing.
 * Uses vi.stubGlobal to avoid jsdom dependency.
 */

function makeElement(tag: string, focusable = true): HTMLElement {
  const el = {
    tagName: tag.toUpperCase(),
    focus: vi.fn(),
    matches: () => focusable,
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
  } as unknown as HTMLElement;
  return el;
}

function makeContainer(children: HTMLElement[]): HTMLElement {
  const container = {
    tagName: 'DIV',
    focus: vi.fn(),
    querySelectorAll: vi.fn(() => children),
    querySelector: vi.fn(() => children[0] ?? null),
  } as unknown as HTMLElement;
  return container;
}

describe('focus-manager', () => {
  beforeEach(() => {
    // Stub document before resetting module state
    vi.stubGlobal('document', {
      activeElement: null,
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    });
    // Reset module state by exiting overlay focus
    exitOverlayFocus();
  });

  describe('getFocusContext', () => {
    it('defaults to canvas', () => {
      expect(getFocusContext()).toBe('canvas');
    });

    it('returns overlay after enterOverlayFocus', () => {
      const container = makeContainer([]);
      enterOverlayFocus(container);
      expect(getFocusContext()).toBe('overlay');
    });

    it('returns canvas after exitOverlayFocus', () => {
      const container = makeContainer([]);
      enterOverlayFocus(container);
      exitOverlayFocus();
      expect(getFocusContext()).toBe('canvas');
    });
  });

  describe('enterOverlayFocus', () => {
    it('focuses the first focusable child', () => {
      const btn1 = makeElement('button');
      const btn2 = makeElement('button');
      const container = makeContainer([btn1, btn2]);
      enterOverlayFocus(container);
      expect(container.querySelector).toHaveBeenCalled();
    });

    it('handles container with no focusable children', () => {
      const container = makeContainer([]);
      // Should not throw
      enterOverlayFocus(container);
      expect(getFocusContext()).toBe('overlay');
    });
  });

  describe('exitOverlayFocus', () => {
    it('restores focus to previously active element', () => {
      const prevElement = makeElement('canvas');
      vi.stubGlobal('document', {
        activeElement: prevElement,
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
      });

      const container = makeContainer([makeElement('button')]);
      enterOverlayFocus(container);
      exitOverlayFocus();

      expect(prevElement.focus).toHaveBeenCalled();
    });

    it('sets context back to canvas', () => {
      const container = makeContainer([]);
      enterOverlayFocus(container);
      expect(getFocusContext()).toBe('overlay');
      exitOverlayFocus();
      expect(getFocusContext()).toBe('canvas');
    });
  });

  describe('trapFocus', () => {
    it('wraps Tab from last element to first', () => {
      const btn1 = makeElement('button');
      const btn2 = makeElement('button');
      const container = makeContainer([btn1, btn2]);

      vi.stubGlobal('document', { activeElement: btn2 });

      const event = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      trapFocus(event, container);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(btn1.focus).toHaveBeenCalled();
    });

    it('wraps Shift+Tab from first element to last', () => {
      const btn1 = makeElement('button');
      const btn2 = makeElement('button');
      const container = makeContainer([btn1, btn2]);

      vi.stubGlobal('document', { activeElement: btn1 });

      const event = {
        key: 'Tab',
        shiftKey: true,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      trapFocus(event, container);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(btn2.focus).toHaveBeenCalled();
    });

    it('prevents Tab when container has no focusable elements', () => {
      const container = makeContainer([]);

      const event = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      trapFocus(event, container);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('ignores non-Tab keys', () => {
      const container = makeContainer([makeElement('button')]);

      const event = {
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      trapFocus(event, container);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
