import { useControls, button, Leva } from 'leva';
import { useEffect } from 'react';
import { useGameStore } from '../store/index.ts';
import {
  DEFAULT_DEV_OVERRIDES,
  getDevOverrides,
  setDevOverrides,
  setNodeStyleOverrides,
  setWireStyleOverrides,
  setGridStyleOverrides,
  setMeterStyleOverrides,
  setColorOverrides,
  resetDevOverrides,
} from './dev-overrides.ts';

/**
 * Leva-based developer tools for experimenting with visual parameters.
 * Only rendered in development mode.
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

  // Color palette controls
  const colorValues = useControls(
    'Colors',
    {
      pageBackground: { value: DEFAULT_DEV_OVERRIDES.colors.pageBackground, label: 'Page BG Edge' },
      pageBackgroundCenter: { value: DEFAULT_DEV_OVERRIDES.colors.pageBackgroundCenter, label: 'Page BG Center' },
      signalPositive: { value: DEFAULT_DEV_OVERRIDES.colors.signalPositive, label: 'Signal +' },
      signalNegative: { value: DEFAULT_DEV_OVERRIDES.colors.signalNegative, label: 'Signal -' },
      colorNeutral: { value: DEFAULT_DEV_OVERRIDES.colors.colorNeutral, label: 'Neutral' },
      gridArea: { value: DEFAULT_DEV_OVERRIDES.colors.gridArea, label: 'Grid Area' },
      gridAreaEdge: { value: DEFAULT_DEV_OVERRIDES.colors.gridAreaEdge, label: 'Grid Edge' },
      gridAreaCenter: { value: DEFAULT_DEV_OVERRIDES.colors.gridAreaCenter, label: 'Grid Center' },
      meterInterior: { value: DEFAULT_DEV_OVERRIDES.colors.meterInterior, label: 'Meter Interior' },
      surfaceNode: { value: DEFAULT_DEV_OVERRIDES.colors.surfaceNode, label: 'Node Top' },
      surfaceNodeBottom: { value: DEFAULT_DEV_OVERRIDES.colors.surfaceNodeBottom, label: 'Node Bottom' },
      portFill: { value: DEFAULT_DEV_OVERRIDES.colors.portFill, label: 'Port Fill' },
      portStroke: { value: DEFAULT_DEV_OVERRIDES.colors.portStroke, label: 'Port Stroke' },
      gridLine: { value: DEFAULT_DEV_OVERRIDES.colors.gridLine, label: 'Grid Lines' },
      meterNeedle: { value: DEFAULT_DEV_OVERRIDES.colors.meterNeedle, label: 'Needle' },
      textPrimary: { value: DEFAULT_DEV_OVERRIDES.colors.textPrimary, label: 'Text' },
      colorError: { value: DEFAULT_DEV_OVERRIDES.colors.colorError, label: 'Error' },
      meterBorder: { value: DEFAULT_DEV_OVERRIDES.colors.meterBorder, label: 'Meter Border' },
      boardBorder: { value: DEFAULT_DEV_OVERRIDES.colors.boardBorder, label: 'Board Border' },
      colorValidationMatch: { value: DEFAULT_DEV_OVERRIDES.colors.colorValidationMatch, label: 'Validation Match' },
      colorTarget: { value: DEFAULT_DEV_OVERRIDES.colors.colorTarget, label: 'Target' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) {
      setColorOverrides(colorValues);
      window.dispatchEvent(new Event('dev-overrides-changed'));
    }
  }, [enabled, colorValues]);

  // Node styling controls
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
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setNodeStyleOverrides(nodeValues);
  }, [enabled, nodeValues]);

  // Wire styling controls
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

  // Grid styling controls
  const gridValues = useControls(
    'Grid Style',
    {
      lineOpacity: { value: DEFAULT_DEV_OVERRIDES.gridStyle.lineOpacity, min: 0, max: 1, step: 0.05, label: 'Line Opacity' },
      shadowDepth: { value: DEFAULT_DEV_OVERRIDES.gridStyle.shadowDepth, min: 0, max: 1, step: 0.05, label: 'Shadow Depth' },
      borderHighlight: { value: DEFAULT_DEV_OVERRIDES.gridStyle.borderHighlight, min: 0, max: 0.3, step: 0.01, label: 'Border Highlight' },
      borderShadow: { value: DEFAULT_DEV_OVERRIDES.gridStyle.borderShadow, min: 0, max: 1, step: 0.05, label: 'Border Shadow' },
      insetDepthTop: { value: DEFAULT_DEV_OVERRIDES.gridStyle.insetDepthTop, min: 0, max: 1, step: 0.05, label: 'Inset Depth (Top)' },
      insetDepthSide: { value: DEFAULT_DEV_OVERRIDES.gridStyle.insetDepthSide, min: 0, max: 1, step: 0.05, label: 'Inset Depth (Side)' },
      showGridLabels: { value: DEFAULT_DEV_OVERRIDES.gridStyle.showGridLabels, label: 'Grid Labels' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setGridStyleOverrides(gridValues);
  }, [enabled, gridValues]);

  // Meter styling controls
  const meterValues = useControls(
    'Meter Style',
    {
      needleGlow: { value: DEFAULT_DEV_OVERRIDES.meterStyle.needleGlow, min: 0, max: 20, step: 1, label: 'Needle Glow' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setMeterStyleOverrides(meterValues);
  }, [enabled, meterValues]);

  // Actions
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

  return <Leva collapsed={true} titleBar={{ title: 'Visual Dev Tools' }} />;
}

