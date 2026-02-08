import type { GameboardState } from '../shared/types/index.ts';
import { createBidirectionalConnectionPointNode } from './connection-point-nodes.ts';

/**
 * Create a blank gameboard for editing a utility node.
 * Includes 6 bidirectional connection point nodes (indices 0-5).
 * Left side: CPs 0-2, Right side: CPs 3-5.
 * Each CP has 1 input + 1 output port; bake determines direction.
 */
export function createUtilityGameboard(utilityId: string): GameboardState {
  const nodes = new Map<string, import('../shared/types/index.ts').NodeState>();

  for (let i = 0; i < 6; i++) {
    const cp = createBidirectionalConnectionPointNode(i);
    nodes.set(cp.id, cp);
  }

  return {
    id: `utility-${utilityId}`,
    nodes,
    wires: [],
  };
}
