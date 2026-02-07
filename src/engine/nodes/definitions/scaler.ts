import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export const scalerNode = defineNode({
  type: 'scaler',
  category: 'math',

  inputs: [
    { name: 'A', description: 'Signal to scale' },
    { name: 'B', description: 'Scale percentage: +100 doubles, -100 mutes' },
  ],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => {
    const [a, b] = inputs;
    // B=100 → factor 2.0 (double), B=0 → factor 1.0 (unchanged), B=-100 → factor 0 (muted)
    const scaleFactor = 1 + b / 100;
    return [clamp(a * scaleFactor)];
  },

  size: { width: 3, height: 2 },
});
