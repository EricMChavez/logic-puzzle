import type { ChipState } from '../shared/types/index.ts';

/** ID prefix for input connection point virtual chips */
const CP_INPUT_PREFIX = '__cp_input_';
/** ID prefix for output connection point virtual chips */
const CP_OUTPUT_PREFIX = '__cp_output_';
/** ID prefix for creative mode slot virtual chips */
const CP_CREATIVE_PREFIX = '__cp_creative_';
/** ID prefix for bidirectional connection point virtual chips (utility editing) - LEGACY */
const CP_BIDIR_PREFIX = '__cp_bidir_';
/** ID prefix for utility slot virtual chips (new utility editing) */
const CP_UTILITY_PREFIX = '__cp_utility_';
/** ID suffix */
const CP_SUFFIX = '__';

/** Build the virtual chip ID for an input connection point */
export function cpInputId(index: number): string {
  return `${CP_INPUT_PREFIX}${index}${CP_SUFFIX}`;
}

/** Build the virtual chip ID for an output connection point */
export function cpOutputId(index: number): string {
  return `${CP_OUTPUT_PREFIX}${index}${CP_SUFFIX}`;
}

/** Build the virtual chip ID for a creative mode slot */
export function creativeSlotId(slotIndex: number): string {
  return `${CP_CREATIVE_PREFIX}${slotIndex}${CP_SUFFIX}`;
}

/** Build the virtual chip ID for a bidirectional connection point */
export function cpBidirectionalId(index: number): string {
  return `${CP_BIDIR_PREFIX}${index}${CP_SUFFIX}`;
}

/** Check if a chip ID is a bidirectional connection point virtual chip */
export function isBidirectionalCpNode(chipId: string): boolean {
  return chipId.startsWith(CP_BIDIR_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the bidirectional CP index from a virtual chip ID. Returns -1 if not a bidir CP chip. */
export function getBidirectionalCpIndex(chipId: string): number {
  if (!isBidirectionalCpNode(chipId)) return -1;
  const num = chipId.slice(CP_BIDIR_PREFIX.length, -CP_SUFFIX.length);
  return parseInt(num, 10);
}

/** Build the virtual chip ID for a utility slot */
export function utilitySlotId(slotIndex: number): string {
  return `${CP_UTILITY_PREFIX}${slotIndex}${CP_SUFFIX}`;
}

/** Check if a chip ID is a utility slot virtual chip */
export function isUtilitySlotNode(chipId: string): boolean {
  return chipId.startsWith(CP_UTILITY_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the slot index from a utility slot chip ID. Returns -1 if not a utility slot chip. */
export function getUtilitySlotIndex(chipId: string): number {
  if (!isUtilitySlotNode(chipId)) return -1;
  const num = chipId.slice(CP_UTILITY_PREFIX.length, -CP_SUFFIX.length);
  return parseInt(num, 10);
}

/**
 * Create a virtual ChipState for a utility slot.
 * Slots 0-2 are on the left side, slots 3-5 are on the right side.
 * Input slots emit signals (0 sockets, 1 plug).
 * Output slots receive signals (1 socket, 0 plugs).
 */
export function createUtilitySlotNode(
  slotIndex: number,
  direction: 'input' | 'output',
): ChipState {
  const id = utilitySlotId(slotIndex);
  const type = direction === 'input' ? 'connection-input' : 'connection-output';

  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: { slotIndex },
    socketCount: direction === 'input' ? 0 : 1,
    plugCount: direction === 'input' ? 1 : 0,
  };
}

/** Check if a chip ID belongs to any connection point virtual chip */
export function isConnectionPointNode(chipId: string): boolean {
  return isConnectionInputNode(chipId) || isConnectionOutputNode(chipId) || isCreativeSlotNode(chipId) || isBidirectionalCpNode(chipId) || isUtilitySlotNode(chipId);
}

/** Check if a chip ID is a creative mode slot virtual chip */
export function isCreativeSlotNode(chipId: string): boolean {
  return chipId.startsWith(CP_CREATIVE_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the slot index from a creative slot chip ID. Returns -1 if not a creative slot chip. */
export function getCreativeSlotIndex(chipId: string): number {
  if (!isCreativeSlotNode(chipId)) return -1;
  const num = chipId.slice(CP_CREATIVE_PREFIX.length, -CP_SUFFIX.length);
  return parseInt(num, 10);
}

/** Check if a chip ID is a connection-input virtual chip */
export function isConnectionInputNode(chipId: string): boolean {
  return chipId.startsWith(CP_INPUT_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Check if a chip ID is a connection-output virtual chip */
export function isConnectionOutputNode(chipId: string): boolean {
  return chipId.startsWith(CP_OUTPUT_PREFIX) && chipId.endsWith(CP_SUFFIX);
}

/** Extract the connection point index from a virtual chip ID. Returns -1 if not a CP chip. */
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
 * Create a virtual ChipState for a connection point.
 * Input CPs emit signals (0 sockets, 1 plug).
 * Output CPs receive signals (1 socket, 0 plugs).
 *
 * Optional extraParams stores physical side and meter index for custom puzzles
 * where input/output direction doesn't always match left/right placement.
 */
export function createConnectionPointNode(
  side: 'input' | 'output',
  index: number,
  extraParams?: { physicalSide: 'left' | 'right'; meterIndex: number },
): ChipState {
  const id = side === 'input' ? cpInputId(index) : cpOutputId(index);
  const type = side === 'input' ? 'connection-input' : 'connection-output';

  return {
    id,
    type,
    // Position is irrelevant — virtual chips aren't rendered as boxes.
    // Path rendering resolves their positions via getConnectionPointPosition.
    position: { col: 0, row: 0 },
    params: extraParams ? { physicalSide: extraParams.physicalSide, meterIndex: extraParams.meterIndex } : {},
    socketCount: side === 'input' ? 0 : 1,
    plugCount: side === 'input' ? 1 : 0,
  };
}

/**
 * Create a virtual ChipState for a bidirectional connection point.
 * Has both a socket port (receives signal from internal graph) and a plug port
 * (emits signal into internal graph). Used inside utility chip gameboards.
 * Indices 0-2 map to left side, 3-5 map to right side.
 */
export function createBidirectionalConnectionPointNode(index: number): ChipState {
  return {
    id: cpBidirectionalId(index),
    type: 'connection-point',
    position: { col: 0, row: 0 },
    params: { cpIndex: index },
    socketCount: 1,  // receives signal (acts as utility chip output)
    plugCount: 1, // emits signal (acts as utility chip input)
  };
}

/**
 * Create a virtual ChipState for a creative mode slot.
 * Slots 0-2 are on the left side, slots 3-5 are on the right side.
 * Input slots emit signals (0 sockets, 1 plug).
 * Output slots receive signals (1 socket, 0 plugs).
 */
export function createCreativeSlotNode(
  slotIndex: number,
  direction: 'input' | 'output',
): ChipState {
  const id = creativeSlotId(slotIndex);
  const type = direction === 'input' ? 'connection-input' : 'connection-output';

  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: { slotIndex }, // Store slot index for reference
    socketCount: direction === 'input' ? 0 : 1,
    plugCount: direction === 'input' ? 1 : 0,
  };
}
