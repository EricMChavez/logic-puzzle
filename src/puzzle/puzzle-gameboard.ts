import type { GameboardState, NodeState, Wire } from '../shared/types/index.ts';
import { createWire } from '../shared/types/index.ts';
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

  // Add initial nodes from puzzle definition
  if (puzzle.initialNodes) {
    for (const nodeDef of puzzle.initialNodes) {
      const node: NodeState = {
        id: nodeDef.id,
        type: nodeDef.type,
        position: { col: nodeDef.position.col, row: nodeDef.position.row },
        params: { ...nodeDef.params },
        inputCount: nodeDef.inputCount,
        outputCount: nodeDef.outputCount,
        rotation: nodeDef.rotation ?? 0,
        locked: nodeDef.locked ?? true,
      };
      nodes.set(node.id, node);
    }
  }

  // Add initial wires from puzzle definition
  const paths: Wire[] = [];
  if (puzzle.initialWires) {
    for (const wireDef of puzzle.initialWires) {
      const wireId = `wire-${wireDef.source.chipId}-${wireDef.source.portIndex}-${wireDef.target.chipId}-${wireDef.target.portIndex}`;
      const wire = createWire(
        wireId,
        { chipId: wireDef.source.chipId, portIndex: wireDef.source.portIndex, side: 'output' },
        { chipId: wireDef.target.chipId, portIndex: wireDef.target.portIndex, side: 'input' },
      );
      paths.push(wire);
    }
  }

  return { id: `puzzle-${puzzle.id}`, chips: nodes, paths };
}
