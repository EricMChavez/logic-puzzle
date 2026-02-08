import type { GameboardState, NodeState } from '../shared/types/index.ts';
import type { PuzzleDefinition } from './types.ts';
import { createConnectionPointNode } from './connection-point-nodes.ts';

/** Create a gameboard pre-populated with virtual CP nodes for the given puzzle */
export function createPuzzleGameboard(puzzle: PuzzleDefinition): GameboardState {
  const nodes = new Map<string, NodeState>();

  if (puzzle.connectionPoints) {
    // Use explicit connection point config — preserves meter positions
    const sides: Array<{ slots: typeof puzzle.connectionPoints.left; side: 'left' | 'right' }> = [
      { slots: puzzle.connectionPoints.left, side: 'left' },
      { slots: puzzle.connectionPoints.right, side: 'right' },
    ];
    for (const { slots, side } of sides) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot.active) continue;
        const cpIndex = slot.cpIndex ?? 0;
        const node = createConnectionPointNode(slot.direction, cpIndex, {
          physicalSide: side,
          meterIndex: i,
        });
        nodes.set(node.id, node);
      }
    }
  } else {
    // Fallback: pack inputs on left, outputs on right
    for (let i = 0; i < puzzle.activeInputs; i++) {
      const node = createConnectionPointNode('input', i);
      nodes.set(node.id, node);
    }
    for (let i = 0; i < puzzle.activeOutputs; i++) {
      const node = createConnectionPointNode('output', i);
      nodes.set(node.id, node);
    }
  }

  return { id: `puzzle-${puzzle.id}`, nodes, wires: [] };
}
