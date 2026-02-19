/**
 * Module-level transient state for rejected knob clicks.
 * When a player clicks a wired (disabled) knob, we flash an error overlay briefly.
 * Not in Zustand because it's purely visual feedback with an auto-clear timeout.
 */

let rejectedChipId: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const FLASH_DURATION_MS = 400;

/** Mark a knob as rejected (wired knob was clicked). Auto-clears after FLASH_DURATION_MS. */
export function rejectKnob(chipId: string): void {
  rejectedChipId = chipId;
  if (clearTimer !== null) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    rejectedChipId = null;
    clearTimer = null;
  }, FLASH_DURATION_MS);
}

/** Get the currently rejected knob chip ID (null if none). */
export function getRejectedKnobChipId(): string | null {
  return rejectedChipId;
}
