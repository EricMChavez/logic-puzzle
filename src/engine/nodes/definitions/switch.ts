import { defineNode } from '../framework';

export const switchNode = defineNode({
  type: 'switch',
  category: 'routing',

  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'Ctrl', description: 'Control: ≥0 = straight (A→1, B→2), <0 = crossed (B→1, A→2)' },
  ],
  outputs: [
    { name: 'Out1' },
    { name: 'Out2' },
  ],

  evaluate: ({ inputs }) => {
    const [a, b, ctrl] = inputs;
    // No clamping needed - just routing existing signals
    return ctrl >= 0 ? [a, b] : [b, a];
  },

  size: { width: 3, height: 3 },
});
