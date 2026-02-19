import { NODE_STYLE } from '../../shared/constants/index.ts';
import { CONNECTION_POINT_CONFIG } from '../../shared/constants/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { RenderConnectionPointsState } from './render-types.ts';
import { getConnectionPointPosition } from './port-positions.ts';
import { buildSlotConfig, buildSlotConfigFromDirections } from '../../puzzle/types.ts';
import type { SlotConfig } from '../../puzzle/types.ts';
import { TOTAL_SLOTS, slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
import { deriveDirectionsFromMeterSlots } from '../../gameboard/meters/meter-types.ts';
import { drawPort } from './render-nodes.ts';
import type { PortShape } from './render-nodes.ts';

/** Draw the gameboard's input and output connection points. */
export function renderConnectionPoints(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderConnectionPointsState,
  cellSize: number,
): void {
  const portRadius = NODE_STYLE.PORT_RADIUS_RATIO * cellSize;

  // Derive SlotConfig: puzzle definition takes priority, otherwise derive from meter slots
  const config: SlotConfig = state.activePuzzle?.slotConfig
    ?? (state.activePuzzle
      ? buildSlotConfig(state.activePuzzle.activeInputs, state.activePuzzle.activeOutputs)
      : state.meterSlots
        ? buildSlotConfigFromDirections(deriveDirectionsFromMeterSlots(state.meterSlots))
        : buildSlotConfig(CONNECTION_POINT_CONFIG.INPUT_COUNT, CONNECTION_POINT_CONFIG.OUTPUT_COUNT));

  // Single loop over all 6 slots (0-2 left, 3-5 right)
  // Signal keys uniformly use slot index: `${direction}:${slotIndex}`
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = config[i];
    if (!slot.active) continue;

    const side = slotSide(i);
    const perSideIdx = slotPerSideIndex(i);
    const pos = getConnectionPointPosition(side, perSideIdx, cellSize);
    const signalKey = `${slot.direction}:${i}`;
    const signalValue = state.cpSignals.get(signalKey) ?? 0;

    // Socket opening faces inward (left CPs face right, right CPs face left)
    const openingDirection = side === 'left' ? 'right' : 'left';

    let shape: PortShape;
    if (slot.direction === 'input') {
      // Input CPs emit signal into the gameboard (source end of wires)
      const isConnected = state.connectedInputCPs.has(signalKey);
      shape = isConnected
        ? { type: 'socket', openingDirection, connected: true }  // plug "left" along wire
        : { type: 'plug' };                                      // plug sitting, ready to connect
    } else {
      // Output CPs receive signal from the gameboard (destination end of wires)
      const isConnected = state.connectedOutputCPs.has(signalKey);
      shape = isConnected
        ? { type: 'seated', openingDirection }   // plug "arrived" from wire
        : { type: 'socket', openingDirection };  // empty socket, awaiting connection
    }

    drawPort(ctx, tokens, pos.x, pos.y, portRadius, signalValue, shape);
  }
}
