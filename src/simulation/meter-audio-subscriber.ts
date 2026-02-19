import { startMeterAudio, stopMeterAudio, updateSlotAudio, setMeterAudioMuted, setMeterTransitionGain } from '../shared/audio/meter-audio.ts';
import { isMuted } from '../shared/audio/audio-manager.ts';
import { generateWaveformValue } from '../puzzle/waveform-generators.ts';
import { buildSlotConfig, directionIndexToSlot, slotToDirectionIndex } from '../puzzle/types.ts';
import type { SlotConfig } from '../puzzle/types.ts';
import type { MeterKey } from '../gameboard/meters/meter-types.ts';
import { TOTAL_SLOTS } from '../shared/grid/slot-helpers.ts';
import { isConnectionOutputNode, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex, isUtilitySlotNode, getUtilitySlotIndex, isBidirectionalCpNode, getBidirectionalCpIndex } from '../puzzle/connection-point-nodes.ts';

/** Minimal store shape we subscribe to. */
interface MeterAudioState {
  playMode: 'playing' | 'paused';
  playpoint: number;
  cycleResults: {
    outputValues: number[][];
  } | null;
  meterSlots: ReadonlyMap<MeterKey, { mode: string }>;
  activePuzzle: {
    activeInputs: number;
    activeOutputs: number;
    slotConfig?: SlotConfig;
    testCases: { inputs: import('../puzzle/types.ts').WaveformDef[]; expectedOutputs: import('../puzzle/types.ts').WaveformDef[] }[];
  } | null;
  activeTestCaseIndex: number;
  isCreativeMode: boolean;
  creativeSlots: { direction: string; waveform: import('../puzzle/types.ts').WaveformDef }[];
  editingUtilityId: string | null;
  perPortMatch: boolean[];
  activeBoard: { paths: ReadonlyArray<{ target: { chipId: string } }> } | null;
  zoomTransitionState: { type: string; phase?: string };
}

/**
 * Compute the signal value for a given slot at the current playpoint.
 * Returns 0 for inactive/hidden/off slots or when data is unavailable.
 */
function getSlotValue(state: MeterAudioState, slotIndex: number, slotConfig: SlotConfig): number {
  const key = `slot:${slotIndex}` as MeterKey;
  const meterSlot = state.meterSlots.get(key);
  const mode = meterSlot?.mode;

  if (!mode || mode === 'hidden' || mode === 'off') return 0;

  const { playpoint, cycleResults } = state;
  const hasPuzzle = !!state.activePuzzle;

  if (mode === 'output') {
    // Puzzle mode: evaluator output index is per-direction, needs mapping
    // Creative/utility: evaluator output index IS the slot index directly
    const outputIdx = hasPuzzle
      ? slotToDirectionIndex(slotConfig, slotIndex)
      : slotIndex;
    if (outputIdx < 0) return 0;
    return cycleResults?.outputValues[playpoint]?.[outputIdx] ?? 0;
  }

  // Input slot
  if (state.editingUtilityId) {
    // Utility editing: inputs are constant (no waveforms), return 0
    return 0;
  }

  if (state.isCreativeMode) {
    const slot = state.creativeSlots[slotIndex];
    if (slot?.direction === 'input') {
      return generateWaveformValue(playpoint, slot.waveform);
    }
    return 0;
  }

  if (hasPuzzle) {
    const dirIndex = slotToDirectionIndex(slotConfig, slotIndex);
    if (dirIndex < 0) return 0;
    const testCase = state.activePuzzle!.testCases[state.activeTestCaseIndex];
    if (testCase?.inputs[dirIndex]) {
      return generateWaveformValue(playpoint, testCase.inputs[dirIndex]);
    }
  }

  return 0;
}

/** Derive the direction ('input'|'output') for a meter slot mode. */
function modeToDirection(mode: string): 'input' | 'output' {
  return mode === 'output' ? 'output' : 'input';
}

/** Build a SlotConfig from current state. */
function getSlotConfig(state: MeterAudioState): SlotConfig {
  if (state.activePuzzle?.slotConfig) return state.activePuzzle.slotConfig;
  if (state.activePuzzle) return buildSlotConfig(state.activePuzzle.activeInputs, state.activePuzzle.activeOutputs);
  // Creative / utility / no puzzle: derive from meterSlots
  const slots = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const key = `slot:${i}` as MeterKey;
    const meterSlot = state.meterSlots.get(key);
    const mode = meterSlot?.mode ?? 'off';
    slots.push({
      active: mode === 'input' || mode === 'output',
      direction: (mode === 'output' ? 'output' : 'input') as 'input' | 'output',
    });
  }
  return slots as unknown as SlotConfig;
}

/**
 * Build a set of output slot indices that have wires connected to them.
 * An output CP is "connected" if any wire targets it.
 */
function buildConnectedOutputSlots(state: MeterAudioState, slotConfig: SlotConfig): ReadonlySet<number> {
  const set = new Set<number>();
  if (!state.activeBoard) return set;
  for (const wire of state.activeBoard.paths) {
    const chipId = wire.target.chipId;
    if (isConnectionOutputNode(chipId)) {
      const dirIndex = getConnectionPointIndex(chipId);
      if (dirIndex >= 0) {
        const slotIdx = directionIndexToSlot(slotConfig, 'output', dirIndex);
        if (slotIdx >= 0) set.add(slotIdx);
      }
    } else if (isCreativeSlotNode(chipId)) {
      const idx = getCreativeSlotIndex(chipId);
      if (idx >= 0) set.add(idx);
    } else if (isUtilitySlotNode(chipId)) {
      const idx = getUtilitySlotIndex(chipId);
      if (idx >= 0) set.add(idx);
    } else if (isBidirectionalCpNode(chipId)) {
      const idx = getBidirectionalCpIndex(chipId);
      if (idx >= 0) set.add(idx);
    }
  }
  return set;
}

/**
 * Build a set of slot indices that have expected output targets.
 * Uses the puzzle's slotConfig to map direction indices to slots.
 */
function buildTargetSlots(state: MeterAudioState): ReadonlySet<number> {
  const set = new Set<number>();
  if (!state.activePuzzle) return set;
  const config: SlotConfig = state.activePuzzle.slotConfig
    ?? buildSlotConfig(state.activePuzzle.activeInputs, state.activePuzzle.activeOutputs);
  const testCase = state.activePuzzle.testCases[state.activeTestCaseIndex];
  if (!testCase) return set;
  for (let i = 0; i < testCase.expectedOutputs.length; i++) {
    const slotIdx = directionIndexToSlot(config, 'output', i);
    if (slotIdx >= 0) set.add(slotIdx);
  }
  return set;
}

/** Update all 6 slot audio channels based on current state. */
function updateAllSlots(state: MeterAudioState): void {
  const slotConfig = getSlotConfig(state);
  const connectedOutputSlots = buildConnectedOutputSlots(state, slotConfig);
  const targetSlots = buildTargetSlots(state);

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const key = `slot:${i}` as MeterKey;
    const meterSlot = state.meterSlots.get(key);
    const mode = meterSlot?.mode ?? 'off';

    if (mode === 'hidden' || mode === 'off') {
      updateSlotAudio(i, 'input', 0); // silence
      continue;
    }

    const direction = modeToDirection(mode);
    const value = getSlotValue(state, i, slotConfig);

    // Compute mismatch: output slot, connected, has target, and doesn't match
    const isMismatched = direction === 'output'
      && connectedOutputSlots.has(i)
      && targetSlots.has(i)
      && state.perPortMatch[i] !== true;

    updateSlotAudio(i, direction, value, isMismatched);
  }
}

/**
 * Initialize the meter audio subscriber. Called once from store/index.ts.
 * Starts/stops meter audio on playMode changes and updates gains on playpoint ticks.
 */
export function initMeterAudioSubscriber(store: {
  getState(): MeterAudioState;
  subscribe(listener: (state: MeterAudioState, prev: MeterAudioState) => void): () => void;
}): void {
  store.subscribe((state, prev) => {
    // Handle zoom transition fades (before playMode checks to avoid early-return skipping)
    const zt = state.zoomTransitionState;
    const prevZt = prev.zoomTransitionState;
    if (zt.type !== prevZt.type) {
      if (zt.type === 'capturing' && prevZt.type === 'idle') {
        // Board is about to switch — silence immediately
        setMeterTransitionGain(0, 0);
      } else if (zt.type === 'revealing') {
        // Utility zoom-out: fade out during reveal curtain
        setMeterTransitionGain(0, 500);
      } else if (zt.type === 'animating' && prevZt.type === 'capturing') {
        // Zoom animation playing — fade in
        const rampMs = zt.phase === 'zoom-only' ? 800 : 500;
        setMeterTransitionGain(1, rampMs);
      } else if (zt.type === 'idle' && prevZt.type === 'animating') {
        // Animation complete — ensure full volume
        setMeterTransitionGain(1, 0);
      } else if (zt.type === 'idle' && prevZt.type === 'reveal-paused') {
        // "Keep Editing" — fade back in
        setMeterTransitionGain(1, 300);
      }
    }

    // Handle mute changes via master gain
    const mutedNow = isMuted();

    // Play mode changed
    if (state.playMode !== prev.playMode) {
      if (state.playMode === 'playing') {
        startMeterAudio();
        // If mid-transition, re-apply silence on the new transitionGain node
        if (zt.type !== 'idle') {
          setMeterTransitionGain(0, 0);
        }
        setMeterAudioMuted(mutedNow);
        updateAllSlots(state);
      } else {
        stopMeterAudio();
      }
      return;
    }

    // Only update while playing
    if (state.playMode !== 'playing') return;

    // Ensure audio is running (handles initial load where playMode is already 'playing')
    startMeterAudio();
    setMeterAudioMuted(mutedNow);

    // Playpoint changed — update gains
    if (state.playpoint !== prev.playpoint) {
      updateAllSlots(state);
      return;
    }

    // Cycle results changed — update gains
    if (state.cycleResults !== prev.cycleResults) {
      updateAllSlots(state);
      return;
    }

    // Meter slots changed — update gains (slot direction may have changed)
    if (state.meterSlots !== prev.meterSlots) {
      updateAllSlots(state);
      return;
    }

    // Creative slots changed — update gains
    if (state.creativeSlots !== prev.creativeSlots) {
      updateAllSlots(state);
      return;
    }

    // Per-port match changed — update detune for mismatch
    if (state.perPortMatch !== prev.perPortMatch) {
      updateAllSlots(state);
    }
  });
}
