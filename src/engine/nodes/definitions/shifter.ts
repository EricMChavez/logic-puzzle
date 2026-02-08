import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export type ShifterParams = { shift: number };

export const shifterNode = defineNode<ShifterParams>({
  type: 'shifter',
  category: 'math',

  inputs: [
    { name: 'A' },
    { name: 'X', description: 'Shift amount', side: 'bottom' },
  ],
  outputs: [{ name: 'Out' }],

  params: [
    { key: 'shift', type: 'number', default: 0, label: 'Shift', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, x] = inputs;
    return [clamp(a + x)];
  },

  size: { width: 3, height: 3 },
});
