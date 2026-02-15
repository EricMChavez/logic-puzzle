import { useControls, button, folder, Leva } from 'leva';
import { useEffect } from 'react';
import { useGameStore } from '../store/index.ts';
import { getVolume, setVolume, playSound } from '../shared/audio/index.ts';
import {
  DEFAULT_DEV_OVERRIDES,
  getDevOverrides,
  setDevOverrides,
  setNodeStyleOverrides,
  setWireStyleOverrides,
  setGridStyleOverrides,
  setMeterStyleOverrides,
  setHighlightStyleOverrides,
  setDepthStyleOverrides,
  setColorOverrides,
  resetDevOverrides,
} from './dev-overrides.ts';

/**
 * Leva-based developer tools for experimenting with visual parameters.
 * Only rendered in development mode.
 *
 * Every control here maps to a field actually consumed by a render function.
 */
export function DevTools() {
  // Master enable toggle
  const { enabled } = useControls('Dev Overrides', {
    enabled: { value: false, label: 'Enable Overrides' },
  });

  useEffect(() => {
    setDevOverrides({ enabled });
    window.dispatchEvent(new Event('dev-overrides-changed'));
  }, [enabled]);

  // ── Page background (GameboardCanvas.tsx) & gameboard background (render-grid.ts) ──
  const pageColorValues = useControls(
    'Page Colors',
    {
      pageBackground: { value: DEFAULT_DEV_OVERRIDES.colors.pageBackground, label: 'Page BG' },
      gameboardBackground: { value: DEFAULT_DEV_OVERRIDES.colors.gameboardBackground, label: 'Board BG' },
    },
    { collapsed: true }
  );

  // ── Grid colors (render-grid.ts) ──────────────────────────────────────────
  const gridColorValues = useControls(
    'Grid Colors',
    {
      gridLine: { value: DEFAULT_DEV_OVERRIDES.colors.gridLine, label: 'Grid Dots' },
      boardBorder: { value: DEFAULT_DEV_OVERRIDES.colors.boardBorder, label: 'Board Border' },
    },
    { collapsed: true }
  );

  // ── Node colors (render-nodes.ts) ─────────────────────────────────────────
  const nodeColorValues = useControls(
    'Node Colors',
    {
      surfaceNode: { value: DEFAULT_DEV_OVERRIDES.colors.surfaceNode, label: 'Node Top' },
      surfaceNodeBottom: { value: DEFAULT_DEV_OVERRIDES.colors.surfaceNodeBottom, label: 'Node Bottom' },
    },
    { collapsed: true }
  );

  // ── Signal colors (render-wires.ts, render-level-bar.ts, render-waveform-channel.ts) ──
  const signalColorValues = useControls(
    'Signal Colors',
    {
      signalPositive: { value: DEFAULT_DEV_OVERRIDES.colors.signalPositive, label: 'Positive' },
      signalNegative: { value: DEFAULT_DEV_OVERRIDES.colors.signalNegative, label: 'Negative' },
      signalZero: { value: DEFAULT_DEV_OVERRIDES.colors.signalZero, label: 'Zero' },
      colorNeutral: { value: DEFAULT_DEV_OVERRIDES.colors.colorNeutral, label: 'Neutral' },
    },
    { collapsed: true }
  );

  // ── Meter colors (render-meter.ts, render-needle.ts) ──────────────────────
  const meterColorValues = useControls(
    'Meter Colors',
    {
      meterInterior: { value: DEFAULT_DEV_OVERRIDES.colors.meterInterior, label: 'Interior' },
      meterBorder: { value: DEFAULT_DEV_OVERRIDES.colors.meterBorder, label: 'Border' },
      meterNeedle: { value: DEFAULT_DEV_OVERRIDES.colors.meterNeedle, label: 'Needle' },
      meterZero: { value: DEFAULT_DEV_OVERRIDES.colors.meterZero, label: 'Zero' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) {
      setColorOverrides({
        ...pageColorValues,
        ...gridColorValues,
        ...nodeColorValues,
        ...signalColorValues,
        ...meterColorValues,
      });
      window.dispatchEvent(new Event('dev-overrides-changed'));
    }
  }, [enabled, pageColorValues, gridColorValues, nodeColorValues, signalColorValues, meterColorValues]);

  // ── Node style (render-nodes.ts) ──────────────────────────────────────────
  const nodeValues = useControls(
    'Node Style',
    {
      shadowBlur: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.shadowBlur, min: 0, max: 0.5, step: 0.01, label: 'Shadow Blur' },
      shadowOffsetY: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.shadowOffsetY, min: 0, max: 0.2, step: 0.01, label: 'Shadow Offset Y' },
      borderRadius: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.borderRadius, min: 0, max: 0.5, step: 0.01, label: 'Border Radius' },
      gradientIntensity: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.gradientIntensity, min: 0, max: 2, step: 0.1, label: 'Gradient Intensity' },
      hoverBrightness: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.hoverBrightness, min: 0, max: 0.5, step: 0.01, label: 'Hover Brightness' },
      borderWidth: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.borderWidth, min: 0, max: 5, step: 0.1, label: 'Border Width' },
      portRadius: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.portRadius, min: 0.05, max: 0.25, step: 0.01, label: 'Port Radius' },
      lightEdgeOpacity: { value: DEFAULT_DEV_OVERRIDES.nodeStyle.lightEdgeOpacity, min: 0, max: 0.3, step: 0.01, label: 'Light Edge' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setNodeStyleOverrides(nodeValues);
  }, [enabled, nodeValues]);

  // ── Wire style (render-wires.ts) ──────────────────────────────────────────
  const wireValues = useControls(
    'Wire Style',
    {
      baseWidth: { value: DEFAULT_DEV_OVERRIDES.wireStyle.baseWidth, min: 1, max: 6, step: 0.5, label: 'Base Width' },
      baseOpacity: { value: DEFAULT_DEV_OVERRIDES.wireStyle.baseOpacity, min: 0.1, max: 1, step: 0.05, label: 'Base Opacity' },
      glowThreshold: { value: DEFAULT_DEV_OVERRIDES.wireStyle.glowThreshold, min: 0, max: 100, step: 5, label: 'Glow Threshold' },
      glowMaxRadius: { value: DEFAULT_DEV_OVERRIDES.wireStyle.glowMaxRadius, min: 0, max: 30, step: 1, label: 'Glow Max Radius' },
      colorRampEnd: { value: DEFAULT_DEV_OVERRIDES.wireStyle.colorRampEnd, min: 25, max: 100, step: 5, label: 'Color Ramp End' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setWireStyleOverrides(wireValues);
  }, [enabled, wireValues]);

  // ── Grid style (render-grid.ts) ───────────────────────────────────────────
  const gridValues = useControls(
    'Grid Style',
    {
      lineOpacity: { value: DEFAULT_DEV_OVERRIDES.gridStyle.lineOpacity, min: 0, max: 1, step: 0.05, label: 'Dot Opacity' },
      showGridLabels: { value: DEFAULT_DEV_OVERRIDES.gridStyle.showGridLabels, label: 'Grid Labels' },
      noiseOpacity: { value: DEFAULT_DEV_OVERRIDES.gridStyle.noiseOpacity, min: 0, max: 0.1, step: 0.005, label: 'Noise Opacity' },
      noiseTileSize: { value: DEFAULT_DEV_OVERRIDES.gridStyle.noiseTileSize, min: 1, max: 4, step: 1, label: 'Noise Tile Size' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setGridStyleOverrides(gridValues);
  }, [enabled, gridValues]);

  // ── Meter style (render-meter.ts, render-needle.ts, render-knob.ts) ───────
  const meterValues = useControls(
    'Meter Style',
    {
      needleGlow: { value: DEFAULT_DEV_OVERRIDES.meterStyle.needleGlow, min: 0, max: 20, step: 1, label: 'Needle Glow' },
      shadowBlurRatio: { value: DEFAULT_DEV_OVERRIDES.meterStyle.shadowBlurRatio, min: 0, max: 0.1, step: 0.005, label: 'Shadow Blur' },
      shadowOffsetRatio: { value: DEFAULT_DEV_OVERRIDES.meterStyle.shadowOffsetRatio, min: 0, max: 0.05, step: 0.005, label: 'Shadow Offset' },
      lightEdgeOpacity: { value: DEFAULT_DEV_OVERRIDES.meterStyle.lightEdgeOpacity, min: 0, max: 0.3, step: 0.01, label: 'Light Edge' },
      knobShadowBlur: { value: DEFAULT_DEV_OVERRIDES.meterStyle.knobShadowBlur, min: 0, max: 0.5, step: 0.01, label: 'Knob Shadow' },
      knobHighlightOpacity: { value: DEFAULT_DEV_OVERRIDES.meterStyle.knobHighlightOpacity, min: 0, max: 0.3, step: 0.01, label: 'Knob Highlight' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setMeterStyleOverrides(meterValues);
  }, [enabled, meterValues]);

  // ── Highlight streak (render-highlight-streak.ts, render-grid.ts, render-nodes.ts, render-meter.ts) ──
  const highlightValues = useControls(
    'Highlight Streak',
    {
      angle: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.angle, min: 0, max: 360, step: 1, label: 'Angle' },
      hardBandWidth: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.hardBandWidth, min: 0.01, max: 0.3, step: 0.01, label: 'Hard Width' },
      softBandWidth: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.softBandWidth, min: 0.05, max: 1.6, step: 0.05, label: 'Soft Width' },
      useBlendModes: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.useBlendModes, label: 'Blend Modes' },
      warmTint: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.warmTint, label: 'Warm Tint' },
      pageHard: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.pageHard, min: 0, max: 0.2, step: 0.005, label: 'Page Hard' },
      pageSoft: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.pageSoft, min: 0, max: 0.2, step: 0.005, label: 'Page Soft' },
      gameboardHard: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.gameboardHard, min: 0, max: 0.2, step: 0.005, label: 'Board Hard' },
      gameboardSoft: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.gameboardSoft, min: 0, max: 0.2, step: 0.005, label: 'Board Soft' },
      nodeHard: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.nodeHard, min: 0, max: 0.2, step: 0.005, label: 'Node Hard' },
      nodeSoft: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.nodeSoft, min: 0, max: 0.2, step: 0.005, label: 'Node Soft' },
      meterHard: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.meterHard, min: 0, max: 0.2, step: 0.005, label: 'Meter Hard' },
      meterSoft: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.meterSoft, min: 0, max: 0.2, step: 0.005, label: 'Meter Soft' },
      verticalFadeRatio: { value: DEFAULT_DEV_OVERRIDES.highlightStyle.verticalFadeRatio, min: 0, max: 0.5, step: 0.01, label: 'Vertical Fade' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setHighlightStyleOverrides(highlightValues);
  }, [enabled, highlightValues]);

  // ── Depth (render-grid.ts inset shadow) ───────────────────────────────────
  const depthValues = useControls(
    'Depth',
    {
      gameboardInsetEnabled: { value: DEFAULT_DEV_OVERRIDES.depthStyle.gameboardInsetEnabled, label: 'Inset Shadow' },
      darkBlur: { value: DEFAULT_DEV_OVERRIDES.depthStyle.darkBlur, min: 0, max: 30, step: 1, label: 'Dark Blur' },
      darkOffset: { value: DEFAULT_DEV_OVERRIDES.depthStyle.darkOffset, min: 0, max: 15, step: 1, label: 'Dark Offset' },
      darkColor: { value: DEFAULT_DEV_OVERRIDES.depthStyle.darkColor, label: 'Dark Color' },
      lightBlur: { value: DEFAULT_DEV_OVERRIDES.depthStyle.lightBlur, min: 0, max: 20, step: 1, label: 'Light Blur' },
      lightOffset: { value: DEFAULT_DEV_OVERRIDES.depthStyle.lightOffset, min: 0, max: 10, step: 1, label: 'Light Offset' },
      lightOpacity: { value: DEFAULT_DEV_OVERRIDES.depthStyle.lightOpacity, min: 0, max: 0.1, step: 0.005, label: 'Light Opacity' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setDepthStyleOverrides(depthValues);
  }, [enabled, depthValues]);

  // ── Audio Volumes ─────────────────────────────────────────────────────────
  useControls('Audio', {
    'Playback': folder({
      play: { value: getVolume('play'), min: 0, max: 1, step: 0.05, label: 'Play', onChange: (v: number) => setVolume('play', v) },
      pause: { value: getVolume('pause'), min: 0, max: 1, step: 0.05, label: 'Pause', onChange: (v: number) => setVolume('pause', v) },
      'Preview play': button(() => playSound('play')),
      'Preview pause': button(() => playSound('pause')),
    }, { collapsed: true }),
    'Chip Drops': folder({
      'node-drop-1': { value: getVolume('node-drop-1'), min: 0, max: 1, step: 0.05, label: 'Drop 1', onChange: (v: number) => setVolume('node-drop-1', v) },
      'node-drop-2': { value: getVolume('node-drop-2'), min: 0, max: 1, step: 0.05, label: 'Drop 2', onChange: (v: number) => setVolume('node-drop-2', v) },
      'node-drop-3': { value: getVolume('node-drop-3'), min: 0, max: 1, step: 0.05, label: 'Drop 3', onChange: (v: number) => setVolume('node-drop-3', v) },
      'Preview drop 1': button(() => playSound('node-drop-1')),
      'Preview drop 2': button(() => playSound('node-drop-2')),
      'Preview drop 3': button(() => playSound('node-drop-3')),
    }, { collapsed: true }),
    'Path Drops': folder({
      'wire-drop-1': { value: getVolume('wire-drop-1'), min: 0, max: 1, step: 0.05, label: 'Drop 1', onChange: (v: number) => setVolume('wire-drop-1', v) },
      'wire-drop-2': { value: getVolume('wire-drop-2'), min: 0, max: 1, step: 0.05, label: 'Drop 2', onChange: (v: number) => setVolume('wire-drop-2', v) },
      'wire-drop-3': { value: getVolume('wire-drop-3'), min: 0, max: 1, step: 0.05, label: 'Drop 3', onChange: (v: number) => setVolume('wire-drop-3', v) },
      'Preview drop 1': button(() => playSound('wire-drop-1')),
      'Preview drop 2': button(() => playSound('wire-drop-2')),
      'Preview drop 3': button(() => playSound('wire-drop-3')),
    }, { collapsed: true }),
    'Knob Tics': folder({
      'knob-tic-1': { value: getVolume('knob-tic-1'), min: 0, max: 1, step: 0.05, label: 'Tic 1', onChange: (v: number) => setVolume('knob-tic-1', v) },
      'knob-tic-2': { value: getVolume('knob-tic-2'), min: 0, max: 1, step: 0.05, label: 'Tic 2', onChange: (v: number) => setVolume('knob-tic-2', v) },
      'knob-tic-3': { value: getVolume('knob-tic-3'), min: 0, max: 1, step: 0.05, label: 'Tic 3', onChange: (v: number) => setVolume('knob-tic-3', v) },
      'Preview tic 1': button(() => playSound('knob-tic-1')),
      'Preview tic 2': button(() => playSound('knob-tic-2')),
      'Preview tic 3': button(() => playSound('knob-tic-3')),
    }, { collapsed: true }),
    'Validation': folder({
      'meter-valid': { value: getVolume('meter-valid'), min: 0, max: 1, step: 0.05, label: 'Meter Valid', onChange: (v: number) => setVolume('meter-valid', v) },
      win: { value: getVolume('win'), min: 0, max: 1, step: 0.05, label: 'Win', onChange: (v: number) => setVolume('win', v) },
      'Preview valid': button(() => playSound('meter-valid')),
      'Preview win': button(() => playSound('win')),
    }, { collapsed: true }),
    'Playpoint': folder({
      'next-cycle': { value: getVolume('next-cycle'), min: 0, max: 1, step: 0.05, label: 'Next Cycle', onChange: (v: number) => setVolume('next-cycle', v) },
      'prev-cycle': { value: getVolume('prev-cycle'), min: 0, max: 1, step: 0.05, label: 'Prev Cycle', onChange: (v: number) => setVolume('prev-cycle', v) },
      'Preview next': button(() => playSound('next-cycle')),
      'Preview prev': button(() => playSound('prev-cycle')),
    }, { collapsed: true }),
    'Zoom': folder({
      'reveal-open-start': { value: getVolume('reveal-open-start'), min: 0, max: 1, step: 0.05, label: 'Reveal Open', onChange: (v: number) => setVolume('reveal-open-start', v) },
      'reveal-close-end': { value: getVolume('reveal-close-end'), min: 0, max: 1, step: 0.05, label: 'Reveal Close', onChange: (v: number) => setVolume('reveal-close-end', v) },
      'Preview open': button(() => playSound('reveal-open-start')),
      'Preview close': button(() => playSound('reveal-close-end')),
    }, { collapsed: true }),
  });

  // ── Actions ───────────────────────────────────────────────────────────────
  useControls('Actions', {
    'New Node Definition': button(() => {
      useGameStore.getState().openOverlay({ type: 'node-creation-form' });
    }),
    'Reset to Defaults': button(() => {
      resetDevOverrides();
      window.location.reload();
    }),
    'Export Settings': button(() => {
      const current = getDevOverrides();
      const settings = {
        colors: current.colors,
        nodeStyle: current.nodeStyle,
        wireStyle: current.wireStyle,
        gridStyle: current.gridStyle,
        meterStyle: current.meterStyle,
        highlightStyle: current.highlightStyle,
        depthStyle: current.depthStyle,
      };
      navigator.clipboard.writeText(JSON.stringify(settings, null, 2))
        .then(() => console.log('[DevTools] Settings exported to clipboard'))
        .catch((err: unknown) => console.error('[DevTools] Export failed:', err));
    }),
    'Clear Local Storage': button(() => {
      if (confirm('Clear all local storage? This will reset all game progress and settings.')) {
        localStorage.clear();
        window.location.reload();
      }
    }),
  });

  return <Leva />;
}
