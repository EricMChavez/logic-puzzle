import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export interface ConstantParams {
  value: number;
  [key: string]: number | string | boolean;
}

export const constantNode = defineNode<ConstantParams>({
  type: 'constant',
  category: 'source',

  inputs: [],
  outputs: [{ name: 'Out' }],

  params: [
    {
      key: 'value',
      type: 'number',
      default: 0,
      label: 'Value',
      min: -10,
      max: 10,
      step: 1,
    },
  ],

  evaluate: ({ params }) => [clamp(params.value * 10)],

  size: { width: 2, height: 2 },
});
