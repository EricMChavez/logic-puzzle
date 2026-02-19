import type { GameboardState, ChipState, Path } from '../shared/types/index.ts';
import { createPath } from '../shared/types/index.ts';
import type { PuzzleDefinition } from './types.ts';
import { createConnectionPointNode } from './connection-point-nodes.ts';
import { slotSide, slotPerSideIndex } from '../shared/grid/slot-helpers.ts';

/** Create a gameboard pre-populated with virtual CP chips for the given puzzle */
export function createPuzzleGameboard(puzzle: PuzzleDefinition): GameboardState {
  const chips = new Map<string, ChipState>();

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
        const chip = createConnectionPointNode(slot.direction, cpIndex, {
          physicalSide: side,
          meterIndex: i,
        });
        chips.set(chip.id, chip);
      }
    }
  } else if (puzzle.slotConfig) {
    // Use flat slot config — derives physical side and meter index from slot index
    let inputCount = 0;
    let outputCount = 0;
    for (let i = 0; i < puzzle.slotConfig.length; i++) {
      const slot = puzzle.slotConfig[i];
      if (!slot.active) continue;
      const perDirectionIndex = slot.direction === 'input' ? inputCount++ : outputCount++;
      const chip = createConnectionPointNode(slot.direction, perDirectionIndex, {
        physicalSide: slotSide(i),
        meterIndex: slotPerSideIndex(i),
      });
      chips.set(chip.id, chip);
    }
  } else {
    // Fallback: pack inputs on left, outputs on right
    for (let i = 0; i < puzzle.activeInputs; i++) {
      const chip = createConnectionPointNode('input', i);
      chips.set(chip.id, chip);
    }
    for (let i = 0; i < puzzle.activeOutputs; i++) {
      const chip = createConnectionPointNode('output', i);
      chips.set(chip.id, chip);
    }
  }

  // Add initial chips from puzzle definition
  if (puzzle.initialChips) {
    for (const chipDef of puzzle.initialChips) {
      const chip: ChipState = {
        id: chipDef.id,
        type: chipDef.type,
        position: { col: chipDef.position.col, row: chipDef.position.row },
        params: { ...chipDef.params } as Record<string, number | string | boolean>,
        socketCount: chipDef.socketCount,
        plugCount: chipDef.plugCount,
        rotation: chipDef.rotation ?? 0,
        locked: chipDef.locked ?? true,
      };
      chips.set(chip.id, chip);
    }
  }

  // Add initial paths from puzzle definition
  const paths: Path[] = [];
  if (puzzle.initialPaths) {
    for (const pathDef of puzzle.initialPaths) {
      const pathId = `wire-${pathDef.source.chipId}-${pathDef.source.portIndex}-${pathDef.target.chipId}-${pathDef.target.portIndex}`;
      const path = createPath(
        pathId,
        { chipId: pathDef.source.chipId, portIndex: pathDef.source.portIndex, side: 'plug' },
        { chipId: pathDef.target.chipId, portIndex: pathDef.target.portIndex, side: 'socket' },
      );
      paths.push(path);
    }
  }

  return { id: `puzzle-${puzzle.id}`, chips, paths };
}
