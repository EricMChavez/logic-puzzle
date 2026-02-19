import type { GameboardState } from '../shared/types/index.ts';
import { createUtilitySlotNode } from './connection-point-nodes.ts';

/**
 * Create a blank gameboard for editing a utility chip.
 * Includes 6 utility slot chips (indices 0-5).
 * Left side: slots 0-2 (default input), Right side: slots 3-5 (default output).
 *
 * @param utilityId - The utility chip's ID
 * @param directions - Optional direction array; defaults to left=input, right=output
 */
export function createUtilityGameboard(
  utilityId: string,
  directions?: readonly ('input' | 'output' | 'off')[],
): GameboardState {
  const chips = new Map<string, import('../shared/types/index.ts').ChipState>();
  const dirs = directions ?? ['off', 'off', 'off', 'off', 'off', 'off'];

  for (let i = 0; i < 6; i++) {
    const dir = dirs[i];
    if (dir !== 'off') {
      const chip = createUtilitySlotNode(i, dir);
      chips.set(chip.id, chip);
    }
  }

  return {
    id: `utility-${utilityId}`,
    chips,
    paths: [],
  };
}
