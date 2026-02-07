import type { MeterCircularBuffer } from '../gameboard/meters/circular-buffer.ts';

/** Check if a single actual value matches a target within tolerance. */
export function validatePort(actual: number, target: number, tolerance: number): boolean {
  return Math.abs(actual - target) <= tolerance;
}

/** Validate all output ports against their targets. */
export function validateAllPorts(
  actuals: number[],
  targets: number[],
  tolerance: number,
): { allMatch: boolean; perPort: boolean[] } {
  const len = Math.min(actuals.length, targets.length);
  const perPort: boolean[] = [];
  let allMatch = len > 0;

  for (let i = 0; i < len; i++) {
    const match = validatePort(actuals[i], targets[i], tolerance);
    perPort.push(match);
    if (!match) allMatch = false;
  }

  if (len === 0) allMatch = false;

  return { allMatch, perPort };
}

/** Result of full-buffer validation comparing output vs target. */
export interface BufferValidationResult {
  allMatch: boolean;
  perSample: boolean[];
  matchCount: number;
}

/**
 * Compare two circular buffers sample-by-sample within tolerance.
 * Returns per-sample match booleans and overall match status.
 * allMatch is true only when both buffers are full (256 samples) AND all positions match.
 */
export function validateBuffers(
  outputBuffer: MeterCircularBuffer,
  targetBuffer: MeterCircularBuffer,
  tolerance: number,
): BufferValidationResult {
  const len = Math.min(outputBuffer.count, targetBuffer.count);
  const perSample: boolean[] = new Array(len);
  let matchCount = 0;

  for (let i = 0; i < len; i++) {
    const match = Math.abs(outputBuffer.at(i) - targetBuffer.at(i)) <= tolerance;
    perSample[i] = match;
    if (match) matchCount++;
  }

  const allMatch = len > 0 &&
    len === outputBuffer.capacity &&
    len === targetBuffer.capacity &&
    matchCount === len;

  return { allMatch, perSample, matchCount };
}
