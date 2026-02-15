import type { NodeState } from '../shared/types/index.ts';

/** ID prefix for input connection point virtual nodes */
const CP_INPUT_PREFIX = '__cp_input_';
/** ID prefix for output connection point virtual nodes */
const CP_OUTPUT_PREFIX = '__cp_output_';
/** ID prefix for creative mode slot virtual nodes */
const CP_CREATIVE_PREFIX = '__cp_creative_';
/** ID prefix for bidirectional connection point virtual nodes (utility editing) - LEGACY */
const CP_BIDIR_PREFIX = '__cp_bidir_';
/** ID prefix for utility slot virtual nodes (new utility editing) */
const CP_UTILITY_PREFIX = '__cp_utility_';
/** ID suffix */
const CP_SUFFIX = '__';

/** Build the virtual node ID for an input connection point */
export function cpInputId(index: number): string {
  return `${CP_INPUT_PREFIX}${index}${CP_SUFFIX}`;
}

/** Build the virtual node ID for an output connection point */
export function cpOutputId(index: number): string {
  return `${CP_OUTPUT_PREFIX}${index}${CP_SUFFIX}`;
}

/** Build the virtual node ID for a creative mode slot */
export function creativeSlotId(slotIndex: number): string {
  return `${CP_CREATIVE_PREFIX}${slotIndex}${CP_SUFFIX}`;
}

/** Build the virtual node ID for a bidirectional connection point */
export function cpBidirectionalId(index: number): string {
  return `${CP_BIDIR_PREFIX}${index}${CP_SUFFIX}`;
}

/** Check if a node ID is a bidirectional connection point virtual node */
export function isBidirectionalCpNode(chipId: string): boolean {
  return chipId.startsWith(CP_BIDIR_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the bidirectional CP index from a virtual node ID. Returns -1 if not a bidir CP node. */
export function getBidirectionalCpIndex(chipId: string): number {
  if (!isBidirectionalCpNode(chipId)) return -1;
  const num = chipId.slice(CP_BIDIR_PREFIX.length, -CP_SUFFIX.length);
  return parseInt(num, 10);
}

/** Build the virtual node ID for a utility slot */
export function utilitySlotId(slotIndex: number): string {
  return `${CP_UTILITY_PREFIX}${slotIndex}${CP_SUFFIX}`;
}

/** Check if a node ID is a utility slot virtual node */
export function isUtilitySlotNode(chipId: string): boolean {
  return chipId.startsWith(CP_UTILITY_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the slot index from a utility slot node ID. Returns -1 if not a utility slot node. */
export function getUtilitySlotIndex(chipId: string): number {
  if (!isUtilitySlotNode(chipId)) return -1;
  const num = chipId.slice(CP_UTILITY_PREFIX.length, -CP_SUFFIX.length);
  return parseInt(num, 10);
}

/**
 * Create a virtual NodeState for a utility slot.
 * Slots 0-2 are on the left side, slots 3-5 are on the right side.
 * Input slots emit signals (0 inputs, 1 output).
 * Output slots receive signals (1 input, 0 outputs).
 */
export function createUtilitySlotNode(
  slotIndex: number,
  direction: 'input' | 'output',
): NodeState {
  const id = utilitySlotId(slotIndex);
  const type = direction === 'input' ? 'connection-input' : 'connection-output';

  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: { slotIndex },
    inputCount: direction === 'input' ? 0 : 1,
    outputCount: direction === 'input' ? 1 : 0,
  };
}

/** Check if a node ID belongs to any connection point virtual node */
export function isConnectionPointNode(chipId: string): boolean {
  return isConnectionInputNode(chipId) || isConnectionOutputNode(chipId) || isCreativeSlotNode(chipId) || isBidirectionalCpNode(chipId) || isUtilitySlotNode(chipId);
}

/** Check if a node ID is a creative mode slot virtual node */
export function isCreativeSlotNode(chipId: string): boolean {
  return chipId.startsWith(CP_CREATIVE_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the slot index from a creative slot node ID. Returns -1 if not a creative slot node. */
export function getCreativeSlotIndex(chipId: string): number {
  if (!isCreativeSlotNode(chipId)) return -1;
  const num = chipId.slice(CP_CREATIVE_PREFIX.length, -CP_SUFFIX.length);
  return parseInt(num, 10);
}

/** Check if a node ID is a connection-input virtual node */
export function isConnectionInputNode(chipId: string): boolean {
  return chipId.startsWith(CP_INPUT_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Check if a node ID is a connection-output virtual node */
export function isConnectionOutputNode(chipId: string): boolean {
  return chipId.startsWith(CP_OUTPUT_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the connection point index from a virtual node ID. Returns -1 if not a CP node. */
export function getConnectionPointIndex(chipId: string): number {
  if (isConnectionInputNode(chipId)) {
    const num = chipId.slice(CP_INPUT_PREFIX.length, -CP_SUFFIX.length);
    return parseInt(num, 10);
  }
  if (isConnectionOutputNode(chipId)) {
    const num = chipId.slice(CP_OUTPUT_PREFIX.length, -CP_SUFFIX.length);
    return parseInt(num, 10);
  }
  return -1;
}

/**
 * Create a virtual NodeState for a connection point.
 * Input CPs emit signals (0 inputs, 1 output).
 * Output CPs receive signals (1 input, 0 outputs).
 *
 * Optional extraParams stores physical side and meter index for custom puzzles
 * where input/output direction doesn't always match left/right placement.
 */
export function createConnectionPointNode(
  side: 'input' | 'output',
  index: number,
  extraParams?: { physicalSide: 'left' | 'right'; meterIndex: number },
): NodeState {
  const id = side === 'input' ? cpInputId(index) : cpOutputId(index);
  const type = side === 'input' ? 'connection-input' : 'connection-output';

  return {
    id,
    type,
    // Position is irrelevant — virtual nodes aren't rendered as boxes.
    // Wire rendering resolves their positions via getConnectionPointPosition.
    position: { col: 0, row: 0 },
    params: extraParams ? { physicalSide: extraParams.physicalSide, meterIndex: extraParams.meterIndex } : {},
    inputCount: side === 'input' ? 0 : 1,
    outputCount: side === 'input' ? 1 : 0,
  };
}

/**
 * Create a virtual NodeState for a bidirectional connection point.
 * Has both an input port (receives signal from internal graph) and an output port
 * (emits signal into internal graph). Used inside utility node gameboards.
 * Indices 0-2 map to left side, 3-5 map to right side.
 */
export function createBidirectionalConnectionPointNode(index: number): NodeState {
  return {
    id: cpBidirectionalId(index),
    type: 'connection-point',
    position: { col: 0, row: 0 },
    params: { cpIndex: index },
    inputCount: 1,  // receives signal (acts as utility node output)
    outputCount: 1, // emits signal (acts as utility node input)
  };
}

/**
 * Create a virtual NodeState for a creative mode slot.
 * Slots 0-2 are on the left side, slots 3-5 are on the right side.
 * Input slots emit signals (0 inputs, 1 output).
 * Output slots receive signals (1 input, 0 outputs).
 */
export function createCreativeSlotNode(
  slotIndex: number,
  direction: 'input' | 'output',
): NodeState {
  const id = creativeSlotId(slotIndex);
  const type = direction === 'input' ? 'connection-input' : 'connection-output';

  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: { slotIndex }, // Store slot index for reference
    inputCount: direction === 'input' ? 0 : 1,
    outputCount: direction === 'input' ? 1 : 0,
  };
}
