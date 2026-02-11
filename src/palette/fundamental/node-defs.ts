import type { FundamentalNodeType } from '../../shared/types/index.ts';

/** Definition of a fundamental node for the palette. */
export interface FundamentalNodeDef {
  type: FundamentalNodeType;
  label: string;
  inputCount: number;
  outputCount: number;
  defaultParams: Record<string, number | string>;
}

export const FUNDAMENTAL_NODES: FundamentalNodeDef[] = [
  {
    type: 'multiply',
    label: 'Multiply',
    inputCount: 2,
    outputCount: 1,
    defaultParams: {},
  },
  {
    type: 'mix',
    label: 'Mix',
    inputCount: 2,
    outputCount: 1,
    defaultParams: { mode: 'Add' },
  },
  {
    type: 'invert',
    label: 'Invert',
    inputCount: 1,
    outputCount: 1,
    defaultParams: {},
  },
  {
    type: 'threshold',
    label: 'Threshold',
    inputCount: 1,
    outputCount: 1,
    defaultParams: { threshold: 0 },
  },
];
