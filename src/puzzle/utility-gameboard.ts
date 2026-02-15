import type { GameboardState } from '../shared/types/index.ts';
import { createUtilitySlotNode } from './connection-point-nodes.ts';

/**
 * Create a blank gameboard for editing a utility node.
 * Includes 6 utility slot nodes (indices 0-5).
 * Left side: slots 0-2 (default input), Right side: slots 3-5 (default output).
 *
 * @param utilityId - The utility node's ID
 * @param directions - Optional direction array; defaults to left=input, right=output
 */
export function createUtilityGameboard(
  utilityId: string,
  directions?: readonly ('input' | 'output' | 'off')[],
): GameboardState {
  const nodes = new Map<string, import('../shared/types/index.ts').NodeState>();
  const dirs = directions ?? ['input', 'input', 'input', 'output', 'output', 'output'];

  for (let i = 0; i < 6; i++) {
    const dir = dirs[i];
    if (dir !== 'off') {
      const node = createUtilitySlotNode(i, dir);
      nodes.set(node.id, node);
    }
  }

  return {
    id: `utility-${utilityId}`,
    chips: nodes,
    paths: [],
  };
}
