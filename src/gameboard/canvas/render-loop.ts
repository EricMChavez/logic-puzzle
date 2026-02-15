import { useGameStore } from '../../store/index.ts';
import { getThemeTokens, isReducedMotion } from '../../shared/tokens/theme-manager.ts';
import { getPerSampleMatch } from '../../simulation/cycle-runner.ts';
import { generateWaveformValue } from '../../puzzle/waveform-generators.ts';
import { GRID_COLS, GRID_ROWS, METER_LEFT_START, METER_RIGHT_START, gridRectToPixels, pixelToGrid } from '../../shared/grid/index.ts';
import { drawMeter } from '../meters/render-meter.ts';
import type { RenderMeterState } from '../meters/render-meter.ts';
import { METER_GRID_ROWS, METER_GRID_COLS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS, meterKey, modeToDirection } from '../meters/meter-types.ts';
import type { MeterKey } from '../meters/meter-types.ts';
import { TOTAL_SLOTS, slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
import { buildSlotConfig, directionIndexToSlot, slotToDirectionIndex } from '../../puzzle/types.ts';
import type { SlotConfig } from '../../puzzle/types.ts';
import { drawNodes, drawSingleNode } from './render-nodes.ts';
import { drawWires } from './render-wires.ts';
import { computeWireAnimationCache } from './wire-animation.ts';
import type { WireAnimationCache } from './wire-animation.ts';
import { drawWireBlips } from './render-wire-blips.ts';
import { renderConnectionPoints } from './render-connection-points.ts';
import { renderWirePreview } from './render-wire-preview.ts';
import { drawGrid } from './render-grid.ts';
import { drawHighlightStreak } from './render-highlight-streak.ts';
import { HIGHLIGHT_STREAK } from '../../shared/constants/index.ts';
import { getDevOverrides } from '../../dev/index.ts';
import { renderPlacementGhost } from './render-placement-ghost.ts';
import { drawZoomTransition, computeProgress, gridRectToViewport, drawRevealOverlay, easeInOutCubic, ZOOM_IN_PRESET, ZOOM_OUT_PRESET, ZOOM_ONLY_PRESET } from '../animation/index.ts';
import { registerCropCapture, unregisterCropCapture } from './snapshot.ts';
import { drawKeyboardFocus } from './render-focus.ts';
import { getFocusTarget, isFocusVisible } from '../interaction/keyboard-focus.ts';
import { getRejectedKnobNodeId } from './rejected-knob.ts';
import { drawPlaybackBar, getHoveredPlaybackButton } from './render-playback-bar.ts';
import { playSound } from '../../shared/audio/index.ts';
import { getPortGridAnchor, getPortWireDirection, findPath, DIR_E } from '../../shared/routing/index.ts';
import type { GridPoint, GridRect } from '../../shared/grid/types.ts';
import type { KnobInfo } from './render-types.ts';
import type { NodeState, Wire } from '../../shared/types/index.ts';
import type { CycleResults } from '../../engine/evaluation/index.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';
import { isConnectionInputNode, isConnectionOutputNode, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex, isBidirectionalCpNode, getBidirectionalCpIndex, isUtilitySlotNode, getUtilitySlotIndex, cpInputId, cpOutputId, creativeSlotId, cpBidirectionalId, utilitySlotId } from '../../puzzle/connection-point-nodes.ts';
import { findNearestSnapTarget, WIRE_SNAP_RADIUS_CELLS } from './hit-testing.ts';

const PLAYPOINT_RATE_NORMAL = 16; // cycles per second

/**
 * Extract the flat slot index (0-5) from any CP node type for connected-CP set building.
 * Returns -1 if the node is not a CP node or doesn't match the expected direction.
 * For standard puzzle CPs, uses sideToSlot for proper slot derivation.
 */
function getCpSlotIdx(
  chipId: string,
  expectedDir: 'input' | 'output',
  nodes?: ReadonlyMap<string, NodeState> | null,
): number {
  if (isCreativeSlotNode(chipId)) {
    const node = nodes?.get(chipId);
    const isMatch = expectedDir === 'input'
      ? node?.type === 'connection-input'
      : node?.type === 'connection-output';
    return isMatch ? getCreativeSlotIndex(chipId) : -1;
  }
  if (isUtilitySlotNode(chipId)) {
    const node = nodes?.get(chipId);
    const isMatch = expectedDir === 'input'
      ? node?.type === 'connection-input'
      : node?.type === 'connection-output';
    return isMatch ? getUtilitySlotIndex(chipId) : -1;
  }
  if (isBidirectionalCpNode(chipId)) {
    return getBidirectionalCpIndex(chipId);
  }
  if (expectedDir === 'output' && isConnectionOutputNode(chipId)) {
    // Standard puzzle output CP: per-direction index → right-side slot
    const cpIndex = getConnectionPointIndex(chipId);
    const node = nodes?.get(chipId);
    if (node?.params.physicalSide) {
      const pSide = node.params.physicalSide as 'left' | 'right';
      const idx = node.params.meterIndex as number;
      return pSide === 'left' ? idx : idx + 3;
    }
    return cpIndex + 3; // default: outputs on right
  }
  if (expectedDir === 'input' && isConnectionInputNode(chipId)) {
    // Standard puzzle input CP: per-direction index → left-side slot
    const cpIndex = getConnectionPointIndex(chipId);
    const node = nodes?.get(chipId);
    if (node?.params.physicalSide) {
      const pSide = node.params.physicalSide as 'left' | 'right';
      const idx = node.params.meterIndex as number;
      return pSide === 'left' ? idx : idx + 3;
    }
    return cpIndex; // default: inputs on left
  }
  return -1;
}

/** Build a map of signal value per CP at current playpoint, from meter signal arrays. */
function computeCpSignals(
  meterSignalArrays: ReadonlyMap<string, number[]>,
  playpoint: number,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const [key, samples] of meterSignalArrays) {
    result.set(key, samples[playpoint] ?? 0);
  }
  return result;
}

/** Build a map of signal value per node port at current playpoint, from cycle results. */
function computePortSignals(
  cycleResults: CycleResults | null,
  playpoint: number,
  wires: ReadonlyArray<Wire>,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  if (!cycleResults) return result;

  // For each wire, the source output port value = the wire's value at this cycle
  for (const wire of wires) {
    const wireVal = cycleResults.wireValues.get(wire.id)?.[playpoint] ?? 0;
    result.set(`${wire.source.chipId}:output:${wire.source.portIndex}`, wireVal);
    result.set(`${wire.target.chipId}:input:${wire.target.portIndex}`, wireVal);
  }

  return result;
}

/** Build a map of wire signal values at the current playpoint. */
function computeWireValues(
  cycleResults: CycleResults | null,
  playpoint: number,
  wires: ReadonlyArray<Wire>,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  if (!cycleResults) return result;

  for (const wire of wires) {
    result.set(wire.id, cycleResults.wireValues.get(wire.id)?.[playpoint] ?? 0);
  }

  return result;
}

// Module-scope cache for wire preview A* path (avoid recomputing every frame)
let lastPreviewGridCol = -1;
let lastPreviewGridRow = -1;
let cachedPreviewPath: GridPoint[] | null = null;

/**
 * Resolve a connection-point hit to the virtual node's PortRef for routing.
 * Returns null if the virtual node isn't on the board.
 */
function resolveSnapPortRef(
  hit: ReturnType<typeof findNearestSnapTarget>,
  nodes: ReadonlyMap<string, NodeState>,
  fromPort: { chipId: string; side: 'input' | 'output' },
  slotConfig?: SlotConfig,
): { chipId: string; side: 'input' | 'output'; portIndex: number } | null {
  if (!hit) return null;

  if (hit.type === 'port') {
    // Basic validation: must connect output↔input, no self-loops
    if (hit.portRef.side === fromPort.side) return null;
    if (hit.portRef.chipId === fromPort.chipId) return null;
    return hit.portRef;
  }

  if (hit.type === 'connection-point') {
    const { slotIndex, direction } = hit;

    // Try regular puzzle CP nodes (slot → direction index → node ID)
    const dirIndex = slotConfig
      ? slotToDirectionIndex(slotConfig, slotIndex)
      : slotPerSideIndex(slotIndex);
    if (dirIndex >= 0) {
      const chipId = direction === 'input' ? cpInputId(dirIndex) : cpOutputId(dirIndex);
      if (nodes.has(chipId)) {
        const side = direction === 'input' ? 'output' : 'input';
        if (side === fromPort.side) return null; // same side → invalid
        return { chipId, portIndex: 0, side };
      }
    }

    // Try utility slot nodes
    const utilId = utilitySlotId(slotIndex);
    if (nodes.has(utilId)) {
      const node = nodes.get(utilId)!;
      const side = node.type === 'connection-input' ? 'output' : 'input';
      if (side === fromPort.side) return null;
      return { chipId: utilId, portIndex: 0, side };
    }

    // Try bidirectional CP nodes
    const bidirId = cpBidirectionalId(slotIndex);
    if (nodes.has(bidirId)) {
      const side: 'input' | 'output' = 'input'; // wire ending at CP → input
      if (side === fromPort.side) return null;
      return { chipId: bidirId, portIndex: 0, side };
    }

    // Try creative mode slot nodes
    const creativeId = creativeSlotId(slotIndex);
    if (nodes.has(creativeId)) {
      const node = nodes.get(creativeId)!;
      const side = node.type === 'connection-input' ? 'output' : 'input';
      if (side === fromPort.side) return null;
      return { chipId: creativeId, portIndex: 0, side };
    }
  }

  return null;
}

// Playpoint animation state
let lastPlaypointTimestamp = 0;
let playAccumulator = 0;

// Pause blip animation state
let pauseAnimAccumulator = 0;
let lastPauseTimestamp = 0;
const PAUSE_ANIM_CYCLE_MS = 1250;
let cachedWireAnim: WireAnimationCache | null = null;
let cachedWireAnimResults: CycleResults | null = null;
let cachedWireAnimPlaypoint = -1;
let revealCloseSoundFired = false;

// Play/pause color fade transition state
let colorFade = 1; // 0 = neutral only, 1 = full polarity color
let fadeDirection: 'up' | 'down' | null = null;
let lastPlayMode: 'playing' | 'paused' = 'playing';
const FADE_DURATION_MS = 500;
let fadeStartTimestamp = 0;

// --- Performance caches ---

// Cache: meter signal arrays (rebuild only when data changes)
let _meterSignalCache: ReadonlyMap<string, number[]> = new Map();
let _meterSignalCycleResults: CycleResults | null = null;
let _meterSignalPuzzleId: string | null = null;
let _meterSignalTestIndex = -1;
let _meterSignalCreativeSlots: unknown = null;
let _meterSignalIsCreative = false;

// Cache: meter target arrays (rebuild only when puzzle/test case changes)
let _meterTargetCache: ReadonlyMap<string, number[]> = new Map();
let _meterTargetPuzzleId: string | null = null;
let _meterTargetTestIndex = -1;

// Cache: CP signals map (rebuild only when meter arrays or playpoint change)
let _cpSignalsCache: ReadonlyMap<string, number> = new Map();
let _cpSignalsMeterArrays: ReadonlyMap<string, number[]> | null = null;
let _cpSignalsPlaypoint = -1;

// Cache: port signals map (rebuild only when cycleResults, playpoint, or wires change)
let _portSignalsCache: ReadonlyMap<string, number> = new Map();
let _portSignalsCycleResults: CycleResults | null = null;
let _portSignalsPlaypoint = -1;
let _portSignalsWires: ReadonlyArray<Wire> | null = null;

// Cache: wire values map (rebuild only when cycleResults, playpoint, or wires change)
let _wireValuesCache: ReadonlyMap<string, number> = new Map();
let _wireValuesCycleResults: CycleResults | null = null;
let _wireValuesPlaypoint = -1;
let _wireValuesWires: ReadonlyArray<Wire> | null = null;

// Cache: connected input ports set (rebuild only when wires change)
let _connectedInputPortsCache: ReadonlySet<string> = new Set();
let _connectedInputPortsWires: ReadonlyArray<Wire> | null = null;

// Cache: connected output CPs set (rebuild only when wires change)
let _connectedOutputCPsCache: ReadonlySet<string> = new Set();
let _connectedOutputCPsWires: ReadonlyArray<Wire> | null = null;

// Cache: connected input CPs set (rebuild only when wires change)
let _connectedInputCPsCache: ReadonlySet<string> = new Set();
let _connectedInputCPsWires: ReadonlyArray<Wire> | null = null;

// Cache: knob wire lookup map (rebuild only when wires change)
let _knobWireLookup: Map<string, Wire> = new Map();
let _knobWireLookupWires: ReadonlyArray<Wire> | null = null;

// Cache: knob values map (rebuild only when inputs change)
let _knobValuesCache: ReadonlyMap<string, KnobInfo> = new Map();
let _knobValuesNodes: ReadonlyMap<string, NodeState> | null = null;
let _knobValuesWires: ReadonlyArray<Wire> | null = null;
let _knobValuesCycleResults: CycleResults | null = null;
let _knobValuesPlaypoint = -1;

// Cache: liveness sets (rebuild only when cycleResults changes)
let _liveNodeIdsCache: ReadonlySet<string> = new Set();
let _liveWireIdsCache: ReadonlySet<string> = new Set();
let _livenessCycleResults: CycleResults | null = null;
let _livenessWires: ReadonlyArray<Wire> | null = null;

/**
 * Start the requestAnimationFrame render loop.
 * Reads Zustand via getState() each frame — NOT React hooks.
 * Returns a cleanup function to stop the loop.
 *
 * @param canvas - The canvas element to render to.
 * @param getCellSize - Callback that returns the current grid cell size in CSS pixels.
 *   Viewport-derived; updated on resize via the GameboardCanvas component.
 */
export function startRenderLoop(
  canvas: HTMLCanvasElement,
  getCellSize: () => number,
  getOffset: () => { x: number; y: number },
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  // Register crop capture for high-res zoom portal curtain
  registerCropCapture((chipId: string, targetRect: GridRect) => {
    const st = useGameStore.getState();
    const tok = getThemeTokens();
    const cs = getCellSize();
    const off = getOffset();
    const d = window.devicePixelRatio || 1;
    const w = canvas.width / d;
    const h = canvas.height / d;

    const node = st.activeBoard?.chips.get(chipId);
    if (!node) return null;

    // Target pixel rect → final scale
    const tpr = gridRectToViewport(targetRect, cs, off);
    const finalScale = Math.min(w / tpr.width, h / tpr.height);
    const zCS = cs * finalScale;

    // Create viewport-sized canvas
    const crop = new OffscreenCanvas(Math.ceil(w * d), Math.ceil(h * d));
    const cropCtx = crop.getContext('2d');
    if (!cropCtx) return null;
    cropCtx.scale(d, d);

    // Fill background
    cropCtx.fillStyle = '#0d0f14';
    cropCtx.fillRect(0, 0, w, h);

    // Center node in canvas
    const gcx = targetRect.col + targetRect.cols / 2;
    const gcy = targetRect.row - 0.5 + targetRect.rows / 2;
    cropCtx.translate(w / 2 - gcx * zCS, h / 2 - gcy * zCS);

    // Render node at zoomed cellSize using module-level caches
    drawSingleNode(cropCtx as unknown as CanvasRenderingContext2D, tok, node, {
      chips: st.activeBoard!.chips,
      puzzleNodes: st.puzzleNodes,
      utilityNodes: st.utilityNodes,
      selectedNodeId: null,
      hoveredNodeId: null,
      knobValues: _knobValuesCache,
      portSignals: _portSignalsCache,
      rejectedKnobNodeId: null,
      connectedInputPorts: _connectedInputPortsCache,
      liveNodeIds: _liveNodeIdsCache,
    }, zCS);

    return crop;
  });

  let animationId = 0;
  let running = true;
  function render(timestamp: number) {
    if (!running) return;

    // Single getState() + getThemeTokens() per frame
    const state = useGameStore.getState();
    const tokens = getThemeTokens();

    // Detect play/pause mode change → start color fade transition
    if (state.playMode !== lastPlayMode) {
      lastPlayMode = state.playMode;
      if (isReducedMotion()) {
        // Instant transition — no fade animation
        colorFade = state.playMode === 'playing' ? 1 : 0;
        fadeDirection = null;
      } else {
        fadeDirection = state.playMode === 'playing' ? 'up' : 'down';
        // Adjust start time for smooth reversal from current colorFade position
        const alreadyDone = fadeDirection === 'up' ? colorFade : (1 - colorFade);
        fadeStartTimestamp = timestamp - alreadyDone * FADE_DURATION_MS;
        state.setPlayPauseTransitioning(true);
      }
    }

    // Advance color fade
    if (fadeDirection !== null) {
      const elapsed = timestamp - fadeStartTimestamp;
      const t = Math.min(elapsed / FADE_DURATION_MS, 1);
      colorFade = fadeDirection === 'up' ? t : 1 - t;
      if (t >= 1) {
        fadeDirection = null;
        state.setPlayPauseTransitioning(false);
      }
    }

    // Advance playpoint — speed modulated by colorFade (ramps to/from zero).
    // Uses currentRate > 0 (not playMode) so playpoint decelerates during fade-down.
    const currentRate = PLAYPOINT_RATE_NORMAL * colorFade;
    if (currentRate > 0 && lastPlaypointTimestamp > 0) {
      const elapsed = timestamp - lastPlaypointTimestamp;
      playAccumulator += elapsed;
      const cyclesPerMs = currentRate / 1000;
      const cyclesToAdvance = Math.floor(playAccumulator * cyclesPerMs);
      if (cyclesToAdvance > 0) {
        playAccumulator -= cyclesToAdvance / cyclesPerMs;
        // Use setPlaypoint (not stepPlaypoint) to bypass the transition guard —
        // the guard blocks manual arrow-key stepping, not the render loop's advance.
        const next = ((state.playpoint + cyclesToAdvance) % 256 + 256) % 256;
        state.setPlaypoint(next);
      }
    }
    lastPlaypointTimestamp = timestamp;

    // Advance pause blip animation when paused
    let pauseProgress = 0;
    if (state.playMode === 'paused') {
      // Reset animation cycle when playpoint changes (arrow key stepping)
      if (state.playpoint !== cachedWireAnimPlaypoint && cachedWireAnimPlaypoint >= 0) {
        pauseAnimAccumulator = 0;
        lastPauseTimestamp = 0;
      }
      if (lastPauseTimestamp > 0) {
        pauseAnimAccumulator += timestamp - lastPauseTimestamp;
      }
      pauseProgress = (pauseAnimAccumulator % PAUSE_ANIM_CYCLE_MS) / PAUSE_ANIM_CYCLE_MS;
      lastPauseTimestamp = timestamp;
    } else {
      pauseAnimAccumulator = 0;
      lastPauseTimestamp = 0;
      cachedWireAnim = null;
    }

    // Derive logical dimensions from grid cell size
    const cellSize = getCellSize();
    const offset = getOffset();
    const logicalWidth = GRID_COLS * cellSize;
    const logicalHeight = GRID_ROWS * cellSize;

    // Viewport dimensions (canvas is viewport-sized)
    const dpr = window.devicePixelRatio || 1;
    const vpWidth = canvas.width / dpr;
    const vpHeight = canvas.height / dpr;

    // Clear full viewport canvas
    ctx!.clearRect(0, 0, vpWidth, vpHeight);

    // --- Zoom transition: capturing / animating ---
    const zoomState = state.zoomTransitionState;
    let zoomAnimating = zoomState.type === 'animating';
    let zoomProgress = 0;

    if (zoomAnimating && zoomState.type === 'animating') {
      const preset = zoomState.phase === 'zoom-only'
        ? ZOOM_ONLY_PRESET
        : (zoomState.direction === 'in' ? ZOOM_IN_PRESET : ZOOM_OUT_PRESET);
      zoomProgress = computeProgress(zoomState.startTime, timestamp, preset.durationMs);

      if (zoomProgress >= 1) {
        state.endZoomTransition();
        zoomAnimating = false;
        // Fall through to normal rendering — no blank frame
      }
    }

    // --- Ceremony state ---
    const ceremony = state.ceremonyState;

    // === Viewport-level rendering (before grid translate) ===
    const devOverrides = getDevOverrides();
    const bgColor = devOverrides.enabled ? devOverrides.colors.pageBackground : '#0d0f14';

    // Fill page background across entire viewport
    ctx!.fillStyle = bgColor;
    ctx!.fillRect(0, 0, vpWidth, vpHeight);

    // Page background highlight streak (covers entire viewport, behind everything)
    const pageHard = devOverrides.enabled ? devOverrides.highlightStyle.pageHard : 0.035;
    const pageSoft = devOverrides.enabled ? devOverrides.highlightStyle.pageSoft : 0.2;
    const pageFade = devOverrides.enabled ? devOverrides.highlightStyle.verticalFadeRatio : HIGHLIGHT_STREAK.VERTICAL_FADE_RATIO;
    drawHighlightStreak(ctx!, { x: 0, y: 0, width: vpWidth, height: vpHeight }, pageHard, pageSoft, pageFade);

    // === Grid-level rendering (translated to grid origin) ===
    ctx!.translate(offset.x, offset.y);

    // Grid zones and lines (lowest z-order)
    // Show authoring draft during configuring-start/saving, otherwise show puzzle's message
    const isAuthoring = state.authoringPhase !== 'idle';
    const tutorialTitle = (isAuthoring && state.tutorialTitleDraft)
      ? state.tutorialTitleDraft
      : state.activePuzzle?.tutorialTitle;
    const tutorialMessage = (isAuthoring && state.tutorialMessageDraft)
      ? state.tutorialMessageDraft
      : state.activePuzzle?.tutorialMessage;
    drawGrid(ctx!, tokens, { tutorialTitle, tutorialMessage }, cellSize);

    // Read cycle results and playpoint for rendering
    const cycleResults = state.cycleResults;
    const playpoint = state.playpoint;

    // Draw meters in side zones
    const perSampleMatch = getPerSampleMatch();
    // Build flat arrays for meter rendering from cycleResults + puzzle (cached)
    const puzzleId = state.activePuzzle?.id ?? null;
    const testIndex = state.activeTestCaseIndex;
    const isCreative = state.isCreativeMode;
    const creativeSlots = isCreative ? state.creativeSlots : null;

    if (
      cycleResults !== _meterSignalCycleResults ||
      puzzleId !== _meterSignalPuzzleId ||
      testIndex !== _meterSignalTestIndex ||
      isCreative !== _meterSignalIsCreative ||
      creativeSlots !== _meterSignalCreativeSlots
    ) {
      _meterSignalCache = buildMeterSignalArrays(cycleResults, state);
      _meterSignalCycleResults = cycleResults;
      _meterSignalPuzzleId = puzzleId;
      _meterSignalTestIndex = testIndex;
      _meterSignalIsCreative = isCreative;
      _meterSignalCreativeSlots = creativeSlots;
    }
    const meterSignalArrays = _meterSignalCache;

    if (puzzleId !== _meterTargetPuzzleId || testIndex !== _meterTargetTestIndex) {
      _meterTargetCache = buildMeterTargetArrays(state);
      _meterTargetPuzzleId = puzzleId;
      _meterTargetTestIndex = testIndex;
    }
    const meterTargetArrays = _meterTargetCache;

    // Read wires early so we can compute CP connection status for meters
    const boardWires = state.activeBoard?.paths ?? null;

    // Build connected output CP set (cached on wires reference)
    // Output CPs receive signal from the graph — wires target them
    // Keys: `output:${slotIndex}` uniformly
    if (boardWires !== _connectedOutputCPsWires) {
      const set = new Set<string>();
      if (boardWires) {
        for (const wire of boardWires) {
          const targetId = wire.target.chipId;
          const slotIdx = getCpSlotIdx(targetId, 'output', state.activeBoard?.chips);
          if (slotIdx >= 0) set.add(`output:${slotIdx}`);
        }
      }
      _connectedOutputCPsCache = set;
      _connectedOutputCPsWires = boardWires;
    }
    const connectedOutputCPs = _connectedOutputCPsCache;

    // Build connected input CP set (cached on wires reference)
    // Input CPs emit signal into the graph — wires source from them
    // Keys: `input:${slotIndex}` uniformly
    if (boardWires !== _connectedInputCPsWires) {
      const set = new Set<string>();
      if (boardWires) {
        for (const wire of boardWires) {
          const sourceId = wire.source.chipId;
          const slotIdx = getCpSlotIdx(sourceId, 'input', state.activeBoard?.chips);
          if (slotIdx >= 0) set.add(`input:${slotIdx}`);
        }
      }
      _connectedInputCPsCache = set;
      _connectedInputCPsWires = boardWires;
    }
    const connectedInputCPs = _connectedInputCPsCache;

    // Calculate meter starting offset (meters fill the full height)
    const meterTopMargin = 0; // in grid rows
    const meterStride = METER_GRID_ROWS + METER_GAP_ROWS; // rows per meter + gap

    const isUtilityEditing = !!state.editingUtilityId;

    // Single loop over all 6 meter slots (0-2 left, 3-5 right)
    // Signal keys uniformly use slot index: `${direction}:${slotIndex}`
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const key: MeterKey = meterKey(i);
      const slot = state.meterSlots.get(key);
      if (!slot) continue;

      const side = slotSide(i);
      const perSideIdx = slotPerSideIndex(i);
      const meterRow = meterTopMargin + perSideIdx * meterStride + METER_VERTICAL_OFFSETS[perSideIdx];
      const meterCol = side === 'left' ? METER_LEFT_START : METER_RIGHT_START;
      const meterRect = gridRectToPixels({
        col: meterCol,
        row: meterRow,
        cols: METER_GRID_COLS,
        rows: METER_GRID_ROWS,
      }, cellSize);

      const dir = modeToDirection(slot.mode);
      // Uniform signal key: `${direction}:${slotIndex}`
      const isConnected = dir === 'input'
        ? connectedInputCPs.has(`input:${i}`)
        : connectedOutputCPs.has(`output:${i}`);
      const renderState: RenderMeterState = {
        slot,
        side,
        signalValues: meterSignalArrays.get(`${dir}:${i}`) ?? null,
        targetValues: dir === 'output' ? (meterTargetArrays.get(`target:${i}`) ?? null) : null,
        matchStatus: dir === 'output' ? (perSampleMatch.get(`output:${i}`) ?? null) : undefined,
        playpoint,
        isConnected,
        isPortMatched: dir === 'output' && (state.perPortMatch[i] === true),
        isUtilityEditing,
      };
      drawMeter(ctx!, tokens, renderState, meterRect);
    }

    // Compute signal values for port/CP coloring from meter signal arrays (cached)
    if (meterSignalArrays !== _cpSignalsMeterArrays || playpoint !== _cpSignalsPlaypoint) {
      _cpSignalsCache = computeCpSignals(meterSignalArrays, playpoint);
      _cpSignalsMeterArrays = meterSignalArrays;
      _cpSignalsPlaypoint = playpoint;
    }
    const cpSignals = _cpSignalsCache;

    if (
      cycleResults !== _portSignalsCycleResults ||
      playpoint !== _portSignalsPlaypoint ||
      boardWires !== _portSignalsWires
    ) {
      _portSignalsCache = boardWires
        ? computePortSignals(cycleResults, playpoint, boardWires)
        : new Map<string, number>();
      _portSignalsCycleResults = cycleResults;
      _portSignalsPlaypoint = playpoint;
      _portSignalsWires = boardWires;
    }
    const portSignals = _portSignalsCache;

    // Build connected input port set (cached on wires reference)
    if (boardWires !== _connectedInputPortsWires) {
      const set = new Set<string>();
      if (boardWires) {
        for (const wire of boardWires) {
          if (wire.target.side === 'input') {
            set.add(`${wire.target.chipId}:${wire.target.portIndex}`);
          }
        }
      }
      _connectedInputPortsCache = set;
      _connectedInputPortsWires = boardWires;
    }
    const connectedInputPorts = _connectedInputPortsCache;

    // Rebuild liveness caches when cycleResults or wires change
    if (cycleResults !== _livenessCycleResults || boardWires !== _livenessWires) {
      if (cycleResults && boardWires) {
        _liveNodeIdsCache = cycleResults.liveNodeIds;
        const liveWires = new Set<string>();
        for (const wire of boardWires) {
          if (cycleResults.liveNodeIds.has(wire.source.chipId)) {
            liveWires.add(wire.id);
          }
        }
        _liveWireIdsCache = liveWires;
      } else {
        _liveNodeIdsCache = new Set();
        _liveWireIdsCache = new Set();
      }
      _livenessCycleResults = cycleResults;
      _livenessWires = boardWires;
    }
    const liveNodeIds = _liveNodeIdsCache;
    const liveWireIds = _liveWireIdsCache;

    if (state.activeBoard) {
      // Wire rendering: fully paused (fade complete) shows neutral + blips;
      // everything else (playing, fading, reduced-motion paused) uses colorFade
      const fullyPaused = state.playMode === 'paused' && fadeDirection === null;
      if (fullyPaused && cycleResults && cycleResults.processingOrder.length > 0 && !isReducedMotion()) {
        // Recompute animation cache if cycleResults or playpoint changed
        if (cachedWireAnimResults !== cycleResults || cachedWireAnimPlaypoint !== playpoint) {
          cachedWireAnim = computeWireAnimationCache(
            state.activeBoard.paths, state.activeBoard.chips, cycleResults, playpoint,
          );
          cachedWireAnimResults = cycleResults;
          cachedWireAnimPlaypoint = playpoint;
        }
        drawWires(ctx!, tokens, state.activeBoard.paths, cellSize, state.activeBoard.chips, undefined, true, liveWireIds);
        if (cachedWireAnim) {
          drawWireBlips(ctx!, tokens, state.activeBoard.paths, state.activeBoard.chips, cellSize, cachedWireAnim, pauseProgress, liveWireIds);
        }
      } else {
        if (
          cycleResults !== _wireValuesCycleResults ||
          playpoint !== _wireValuesPlaypoint ||
          state.activeBoard.paths !== _wireValuesWires
        ) {
          _wireValuesCache = computeWireValues(cycleResults, playpoint, state.activeBoard.paths);
          _wireValuesCycleResults = cycleResults;
          _wireValuesPlaypoint = playpoint;
          _wireValuesWires = state.activeBoard.paths;
        }
        drawWires(ctx!, tokens, state.activeBoard.paths, cellSize, state.activeBoard.chips, _wireValuesCache, false, liveWireIds, undefined, colorFade);
      }

      // Compute knob values from cycle results (cached)
      if (
        state.activeBoard.chips !== _knobValuesNodes ||
        state.activeBoard.paths !== _knobValuesWires ||
        cycleResults !== _knobValuesCycleResults ||
        playpoint !== _knobValuesPlaypoint
      ) {
        _knobValuesCache = computeKnobValues(state.activeBoard.chips, state.activeBoard.paths, cycleResults, playpoint);
        _knobValuesNodes = state.activeBoard.chips;
        _knobValuesWires = state.activeBoard.paths;
        _knobValuesCycleResults = cycleResults;
        _knobValuesPlaypoint = playpoint;
      }
      const knobValues = _knobValuesCache;

      drawNodes(ctx!, tokens, {
        puzzleNodes: state.puzzleNodes,
        utilityNodes: state.utilityNodes,
        chips: state.activeBoard.chips,
        selectedNodeId: state.selectedNodeId,
        hoveredNodeId: state.hoveredNodeId,
        knobValues,
        portSignals,
        rejectedKnobNodeId: getRejectedKnobNodeId(),
        connectedInputPorts,
        liveNodeIds,
      }, cellSize);

      // Keyboard focus ring (after nodes, before wire preview)
      drawKeyboardFocus(
        ctx!, tokens, getFocusTarget(), isFocusVisible(),
        state.activeBoard.chips, state.activeBoard.paths,
        logicalWidth, logicalHeight, cellSize,
        state.interactionMode.type === 'keyboard-wiring' ? state.interactionMode : null,
        state.activePuzzle?.slotConfig,
      );
    }

    // Wire preview during drawing-wire mode (drawn before CPs so it appears behind them)
    const overlayActive = state.activeOverlay.type !== 'none';
    if (!overlayActive && state.interactionMode.type === 'drawing-wire' && state.mousePosition && state.activeBoard) {
      const cursorGrid = pixelToGrid(state.mousePosition.x, state.mousePosition.y, cellSize);

      // Recompute A* path only when cursor moves to a different grid cell
      if (cursorGrid.col !== lastPreviewGridCol || cursorGrid.row !== lastPreviewGridRow) {
        lastPreviewGridCol = cursorGrid.col;
        lastPreviewGridRow = cursorGrid.row;

        const fromPort = state.interactionMode.fromPort;
        const sourceNode = state.activeBoard.chips.get(fromPort.chipId);
        if (sourceNode) {
          const sourceAnchor = getPortGridAnchor(sourceNode, fromPort.side, fromPort.portIndex);
          const startDir = getPortWireDirection(sourceNode, fromPort.side, fromPort.portIndex);

          // Check for snap target within the wire snap radius
          const maxRadiusPx = WIRE_SNAP_RADIUS_CELLS * cellSize;
          const wires = state.activeBoard.paths;
          const snapHit = findNearestSnapTarget(
            state.mousePosition.x, state.mousePosition.y, maxRadiusPx,
            state.activeBoard.chips, cellSize,
            state.activePuzzle?.slotConfig,
            state.activePuzzle?.activeInputs,
            state.activePuzzle?.activeOutputs,
            state.meterSlots,
            (hit) => {
              if (hit.type !== 'port') return true; // CPs validated in resolveSnapPortRef
              const p = hit.portRef;
              // Must connect output↔input, no self-loops
              if (p.side === fromPort.side || p.chipId === fromPort.chipId) return false;
              // Port must not already have a wire
              return !wires.some((w) =>
                (w.source.chipId === p.chipId && w.source.portIndex === p.portIndex && p.side === 'output') ||
                (w.target.chipId === p.chipId && w.target.portIndex === p.portIndex && p.side === 'input'),
              );
            },
          );

          const snapPort = resolveSnapPortRef(snapHit, state.activeBoard.chips, fromPort, state.activePuzzle?.slotConfig);

          if (snapPort) {
            // Route to the snapped target's actual grid anchor with correct direction
            const targetNode = state.activeBoard.chips.get(snapPort.chipId);
            if (targetNode) {
              const targetAnchor = getPortGridAnchor(targetNode, snapPort.side, snapPort.portIndex);
              const endDir = getPortWireDirection(targetNode, snapPort.side, snapPort.portIndex);
              cachedPreviewPath = findPath(sourceAnchor, targetAnchor, state.occupancy, startDir, endDir);
            } else {
              cachedPreviewPath = findPath(sourceAnchor, cursorGrid, state.occupancy, startDir, DIR_E);
            }
          } else {
            // No snap target — route to cursor position
            cachedPreviewPath = findPath(sourceAnchor, cursorGrid, state.occupancy, startDir, DIR_E);
          }
        } else {
          cachedPreviewPath = null;
        }
      }

      renderWirePreview(ctx!, tokens, state.interactionMode.fromPosition, state.mousePosition, cachedPreviewPath, cellSize);
    } else {
      // Reset cache when not in drawing-wire mode
      lastPreviewGridCol = -1;
      lastPreviewGridRow = -1;
      cachedPreviewPath = null;
    }

    // Draw connection points on top of wires and wire preview (always visible)
    renderConnectionPoints(ctx!, tokens, {
      activePuzzle: state.activePuzzle,
      perPortMatch: state.perPortMatch,
      editingUtilityId: state.editingUtilityId,
      meterSlots: state.meterSlots,
      cpSignals,
      connectedOutputCPs,
    }, cellSize);

    // Placement ghost (suppressed when overlay is active)
    if (!overlayActive) {
      renderPlacementGhost(ctx!, tokens, {
        interactionMode: state.interactionMode,
        mousePosition: state.mousePosition,
        occupancy: state.occupancy,
        puzzleNodes: state.puzzleNodes,
        utilityNodes: state.utilityNodes,
        keyboardGhostPosition: state.keyboardGhostPosition,
      }, cellSize);
    }

    // --- Ceremony active check (used for overlay dimming) ---
    const ceremonyActive = ceremony.type !== 'inactive';

    // Playback bar (persistent UI chrome — skip on home board)
    const isHomeBoard = state.activeBoardId === 'motherboard';
    if (!isHomeBoard) {
      drawPlaybackBar(ctx!, tokens, {
        playMode: state.playMode,
        hoveredButton: getHoveredPlaybackButton(),
      }, cellSize);
    }

    // Zoom transition: capture second snapshot when in 'capturing' state
    if (zoomState.type === 'capturing') {
      const secondSnapshot = new OffscreenCanvas(canvas.width, canvas.height);
      const snapCtx = secondSnapshot.getContext('2d');
      if (snapCtx) {
        snapCtx.drawImage(canvas, 0, 0);
      }

      // Keep crop visible during capture frame to prevent one-frame flash
      if (zoomState.zoomedCrop && zoomState.phase === 'zoom-only') {
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx!.drawImage(zoomState.zoomedCrop, 0, 0, zoomState.zoomedCrop.width, zoomState.zoomedCrop.height,
                      0, 0, vpWidth, vpHeight);
      }

      state.finalizeZoomCapture(secondSnapshot);
      // The state has transitioned to 'animating' — continue to next frame
      animationId = requestAnimationFrame(render);
      return;
    }

    // Zoom transition overlay (drawn on top of the live board)
    // Double-check zoomState.type for TS narrowing (zoomAnimating is a let)
    if (zoomAnimating && zoomState.type === 'animating') {
      const preset = zoomState.phase === 'zoom-only'
        ? ZOOM_ONLY_PRESET
        : (zoomState.direction === 'in' ? ZOOM_IN_PRESET : ZOOM_OUT_PRESET);
      const targetPixelRect = gridRectToViewport(zoomState.targetRect, cellSize, offset);
      // Reset to viewport coords (remove grid translate) for the transition overlay
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawZoomTransition(
        ctx!, zoomState.outerSnapshot, zoomState.innerSnapshot,
        targetPixelRect, zoomState.direction, zoomProgress, preset, vpWidth, vpHeight,
        zoomState.zoomedCrop,
      );
    }

    // Reveal overlay: curtain slides down during two-part zoom-out
    if (zoomState.type === 'revealing') {
      const elapsed = timestamp - zoomState.startTime;
      const rawProgress = Math.min(elapsed / 600, 1);
      const revealT = 1 - easeInOutCubic(rawProgress);

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRevealOverlay(ctx!, zoomState.zoomedCrop, revealT, vpWidth, vpHeight);

      // Play close sound 300ms into the 600ms reveal animation
      if (elapsed >= 300 && !revealCloseSoundFired) {
        revealCloseSoundFired = true;
        playSound('reveal-close-end');
      }

      if (rawProgress >= 1) {
        state.completeReveal();
      }
    } else {
      revealCloseSoundFired = false;
    }

    // Reveal-paused: crop fully covers viewport while dialog is shown
    if (zoomState.type === 'reveal-paused') {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRevealOverlay(ctx!, zoomState.zoomedCrop, 0, vpWidth, vpHeight);
    }

    // Dim canvas when an overlay is active (but not during ceremony or zoom transition)
    if (overlayActive && !zoomAnimating && !ceremonyActive) {
      ctx!.fillStyle = 'rgba(0,0,0,0.15)';
      ctx!.fillRect(-offset.x, -offset.y, vpWidth, vpHeight);
    }

    // Reset transform (remove grid translate, keep DPR scale)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    animationId = requestAnimationFrame(render);
  }

  animationId = requestAnimationFrame(render);

  return () => {
    running = false;
    cancelAnimationFrame(animationId);
    unregisterCropCapture();
  };
}

const CYCLE_COUNT = 256;

/**
 * Build flat signal arrays for all meter CPs from cycle results.
 * Input CPs get their values from the input waveforms (test case or creative slots).
 * Output CPs get their values from cycle evaluation results.
 * Keys uniformly use slot index: `${direction}:${slotIndex}`.
 */
function buildMeterSignalArrays(
  cycleResults: CycleResults | null,
  state: ReturnType<typeof useGameStore.getState>,
): ReadonlyMap<string, number[]> {
  const result = new Map<string, number[]>();
  const { activePuzzle, activeTestCaseIndex } = state;

  // Derive SlotConfig for per-direction → slot index mapping
  const config: SlotConfig | null = activePuzzle
    ? (activePuzzle.slotConfig ?? buildSlotConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs))
    : null;

  // Input signals from test case waveforms or creative mode slots
  // Skip when editing a utility node (no input waveforms — only direction arrows)
  if (state.editingUtilityId) {
    // No input signal arrays for utility editing — meters show direction only
  } else if (activePuzzle && config) {
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (testCase) {
      for (let i = 0; i < testCase.inputs.length; i++) {
        // Map per-direction input index → flat slot index
        const slotIdx = directionIndexToSlot(config, 'input', i);
        if (slotIdx < 0) continue;
        const samples = new Array(CYCLE_COUNT);
        for (let c = 0; c < CYCLE_COUNT; c++) {
          samples[c] = generateWaveformValue(c, testCase.inputs[i]);
        }
        result.set(`input:${slotIdx}`, samples);
      }
    }
  } else if (state.isCreativeMode) {
    // Creative mode: slot index used directly (0-5)
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const slot = state.creativeSlots[i];
      if (slot?.direction === 'input') {
        const samples = new Array(CYCLE_COUNT);
        for (let c = 0; c < CYCLE_COUNT; c++) {
          samples[c] = generateWaveformValue(c, slot.waveform);
        }
        result.set(`input:${i}`, samples);
      }
    }
  }

  // Output signals from cycle results
  if (cycleResults) {
    const outputCount = cycleResults.outputValues[0]?.length ?? 0;
    for (let i = 0; i < outputCount; i++) {
      // For puzzle mode: evaluator output index is per-direction → map to slot index
      // For creative/utility: evaluator already uses slot indices
      let slotIdx: number;
      if (config) {
        slotIdx = directionIndexToSlot(config, 'output', i);
        if (slotIdx < 0) continue;
      } else {
        slotIdx = i; // Creative/utility: evaluator output index IS the slot index
      }
      const samples = new Array(CYCLE_COUNT);
      for (let c = 0; c < CYCLE_COUNT; c++) {
        samples[c] = cycleResults.outputValues[c]?.[i] ?? 0;
      }
      result.set(`output:${slotIdx}`, samples);
    }
  }

  return result;
}

/**
 * Build flat target arrays for output meters from puzzle test case expected outputs.
 * Keys use slot index: `target:${slotIndex}`.
 */
function buildMeterTargetArrays(
  state: ReturnType<typeof useGameStore.getState>,
): ReadonlyMap<string, number[]> {
  const result = new Map<string, number[]>();
  const { activePuzzle, activeTestCaseIndex } = state;

  if (!activePuzzle) return result;

  const config: SlotConfig = activePuzzle.slotConfig
    ?? buildSlotConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs);

  const testCase = activePuzzle.testCases[activeTestCaseIndex];
  if (!testCase) return result;

  for (let i = 0; i < testCase.expectedOutputs.length; i++) {
    // Map per-direction output index → flat slot index
    const slotIdx = directionIndexToSlot(config, 'output', i);
    if (slotIdx < 0) continue;
    const samples = new Array(CYCLE_COUNT);
    for (let c = 0; c < CYCLE_COUNT; c++) {
      samples[c] = generateWaveformValue(c, testCase.expectedOutputs[i]);
    }
    result.set(`target:${slotIdx}`, samples);
  }

  return result;
}

/**
 * Build a wire lookup map: "chipId:portIndex" → Wire for wire targets.
 * Rebuilt only when the wires array reference changes.
 */
function getWireTargetLookup(wires: ReadonlyArray<Wire>): Map<string, Wire> {
  if (wires === _knobWireLookupWires) return _knobWireLookup;

  _knobWireLookup = new Map();
  for (const wire of wires) {
    _knobWireLookup.set(`${wire.target.chipId}:${wire.target.portIndex}`, wire);
  }
  _knobWireLookupWires = wires;
  return _knobWireLookup;
}

/**
 * Compute knob display values for all knob-equipped nodes on the active board.
 * Uses cycle results for wired knobs, or node params for unwired knobs.
 * Uses a cached wire lookup map to avoid O(nodes × wires) search per frame.
 */
function computeKnobValues(
  nodes: ReadonlyMap<string, NodeState>,
  wires: ReadonlyArray<Wire>,
  cycleResults: CycleResults | null,
  playpoint: number,
): ReadonlyMap<string, KnobInfo> {
  const result = new Map<string, KnobInfo>();
  const wireLookup = getWireTargetLookup(wires);

  for (const node of nodes.values()) {
    const knobConfig = getKnobConfig(getNodeDefinition(node.type));
    if (!knobConfig) continue;

    const { portIndex, paramKey } = knobConfig;

    // O(1) lookup instead of O(wires) linear search
    const wire = wireLookup.get(`${node.id}:${portIndex}`);

    if (wire) {
      // Read value from cycle results at current playpoint
      const wireVal = cycleResults?.wireValues.get(wire.id)?.[playpoint] ?? 0;
      result.set(node.id, { value: wireVal, isWired: true });
    } else {
      // Use the node's param value
      const value = Number(node.params[paramKey] ?? 0);
      result.set(node.id, { value, isWired: false });
    }
  }

  return result;
}
