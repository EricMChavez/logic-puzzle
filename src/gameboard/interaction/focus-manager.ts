/**
 * Focus management singleton for overlay focus trapping and restoration.
 * Module-level state — no React or Zustand dependency.
 */

type FocusContext = 'canvas' | 'overlay';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let focusContext: FocusContext = 'canvas';
let savedFocus: Element | null = null;

/** Get the current focus context */
export function getFocusContext(): FocusContext {
  return focusContext;
}

/**
 * Enter overlay focus mode.
 * Saves the currently focused element, sets context to 'overlay',
 * and focuses the first focusable child in the container.
 */
export function enterOverlayFocus(container: HTMLElement): void {
  savedFocus = document.activeElement;
  focusContext = 'overlay';
  const first = findFirstFocusable(container);
  if (first) {
    first.focus();
  }
}

/**
 * Exit overlay focus mode.
 * Restores focus to the previously saved element and sets context back to 'canvas'.
 */
export function exitOverlayFocus(): void {
  focusContext = 'canvas';
  if (savedFocus && typeof (savedFocus as HTMLElement).focus === 'function') {
    (savedFocus as HTMLElement).focus();
  }
  savedFocus = null;
}

/**
 * Trap Tab/Shift+Tab within a container element.
 * Call this from a keydown handler on the overlay container.
 */
export function trapFocus(e: KeyboardEvent, container: HTMLElement): void {
  if (e.key !== 'Tab') return;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    // Shift+Tab: wrap from first to last
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    // Tab: wrap from last to first
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/** Get all focusable elements within a container */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Find the first focusable element within a container */
function findFirstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}
