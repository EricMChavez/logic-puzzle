export type KnobMode = 'vertical' | 'radial';

const STORAGE_KEY = 'wavelength-knob-mode';

let currentMode: KnobMode = 'radial';

/** Read knob mode from localStorage (call once at startup). */
export function initKnobMode(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'vertical') {
    currentMode = 'vertical';
  } else {
    currentMode = 'radial';
  }
}

export function getKnobMode(): KnobMode {
  return currentMode;
}

export function setKnobMode(mode: KnobMode): void {
  currentMode = mode;
  localStorage.setItem(STORAGE_KEY, mode);
}
