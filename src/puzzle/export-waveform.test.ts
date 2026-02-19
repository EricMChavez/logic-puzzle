import { describe, it, expect } from 'vitest';
import { extractOutputSamples, formatCustomWaveformEntry } from './export-waveform';
import type { CycleResults } from '../engine/evaluation/index';

function makeCycleResults(outputValues: number[][]): CycleResults {
  return {
    outputValues,
    pathValues: new Map(),
    chipOutputs: new Map(),
    crossCycleState: new Map(),
    processingOrder: [],
    chipDepths: new Map(),
    maxDepth: 0,
    liveChipIds: new Set(),
  };
}

describe('extractOutputSamples', () => {
  it('correctly maps 256 cycles for a given port index', () => {
    const outputValues: number[][] = [];
    for (let i = 0; i < 256; i++) {
      outputValues.push([i - 128, (i - 128) * 0.5]);
    }
    const results = makeCycleResults(outputValues);

    const samples = extractOutputSamples(results, 0);
    expect(samples).toHaveLength(256);
    expect(samples[0]).toBe(-128);
    expect(samples[128]).toBe(0);
    expect(samples[255]).toBe(127);

    const samples1 = extractOutputSamples(results, 1);
    expect(samples1[0]).toBe(-64);
    expect(samples1[128]).toBe(0);
  });

  it('returns 0 for out-of-range port index', () => {
    const outputValues: number[][] = [];
    for (let i = 0; i < 256; i++) {
      outputValues.push([42]);
    }
    const results = makeCycleResults(outputValues);

    const samples = extractOutputSamples(results, 5);
    expect(samples).toHaveLength(256);
    expect(samples.every((v) => v === 0)).toBe(true);
  });

  it('returns 0 for negative port index', () => {
    const outputValues: number[][] = [];
    for (let i = 0; i < 256; i++) {
      outputValues.push([42]);
    }
    const results = makeCycleResults(outputValues);

    const samples = extractOutputSamples(results, -1);
    expect(samples).toHaveLength(256);
    expect(samples.every((v) => v === 0)).toBe(true);
  });

  it('handles fewer than 256 cycles by filling with 0', () => {
    const results = makeCycleResults([[10], [20]]);
    const samples = extractOutputSamples(results, 0);
    expect(samples).toHaveLength(256);
    expect(samples[0]).toBe(10);
    expect(samples[1]).toBe(20);
    expect(samples[2]).toBe(0);
  });
});

describe('formatCustomWaveformEntry', () => {
  it('produces valid entry with kebab-case id', () => {
    const samples = Array.from({ length: 256 }, (_, i) => i - 128);
    const result = formatCustomWaveformEntry('My Waveform', samples);
    expect(result).toContain("id: 'my-waveform'");
    expect(result).toContain("name: 'My Waveform'");
    expect(result).toContain('samples: [');
    expect(result).toContain('-128');
    expect(result).toContain('127');
  });

  it('handles name with special characters', () => {
    const samples = [0, 50, 100, -100];
    const result = formatCustomWaveformEntry("Output #3 (Bob's)", samples);
    expect(result).toContain("id: 'output-3-bob-s'");
    expect(result).toContain("name: 'Output #3 (Bob\\'s)'");
    expect(result).toContain('samples: [0, 50, 100, -100]');
  });

  it('formats floating point numbers rounded to 2 decimals', () => {
    const samples = [1.126, 99.999, -50.123456];
    const result = formatCustomWaveformEntry('Test', samples);
    expect(result).toContain('samples: [1.13, 100, -50.12]');
  });
});
