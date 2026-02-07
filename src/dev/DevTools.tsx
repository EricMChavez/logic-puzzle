import { useControls, button, Leva } from 'leva';
import { useEffect } from 'react';
import {
  DEFAULT_DEV_OVERRIDES,
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
      pageBackground: { value: DEFAULT_DEV_OVERRIDES.colors.pageBackground, label: 'Page Background' },
      signalPositive: { value: DEFAULT_DEV_OVERRIDES.colors.signalPositive, label: 'Signal +' },
      signalNegative: { value: DEFAULT_DEV_OVERRIDES.colors.signalNegative, label: 'Signal -' },
      colorNeutral: { value: DEFAULT_DEV_OVERRIDES.colors.colorNeutral, label: 'Neutral' },
      gridArea: { value: DEFAULT_DEV_OVERRIDES.colors.gridArea, label: 'Grid Area' },
      meterHousing: { value: DEFAULT_DEV_OVERRIDES.colors.meterHousing, label: 'Meter Housing' },
      meterInterior: { value: DEFAULT_DEV_OVERRIDES.colors.meterInterior, label: 'Meter Interior' },
      surfaceNode: { value: DEFAULT_DEV_OVERRIDES.colors.surfaceNode, label: 'Node Top' },
      surfaceNodeBottom: { value: DEFAULT_DEV_OVERRIDES.colors.surfaceNodeBottom, label: 'Node Bottom' },
      portFill: { value: DEFAULT_DEV_OVERRIDES.colors.portFill, label: 'Port Fill' },
      portStroke: { value: DEFAULT_DEV_OVERRIDES.colors.portStroke, label: 'Port Stroke' },
      gridLine: { value: DEFAULT_DEV_OVERRIDES.colors.gridLine, label: 'Grid Lines' },
      meterNeedle: { value: DEFAULT_DEV_OVERRIDES.colors.meterNeedle, label: 'Needle' },
      textPrimary: { value: DEFAULT_DEV_OVERRIDES.colors.textPrimary, label: 'Text' },
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
      waveformRatio: { value: DEFAULT_DEV_OVERRIDES.meterStyle.waveformRatio, min: 0.3, max: 0.8, step: 0.01, label: 'Waveform Width' },
      levelBarRatio: { value: DEFAULT_DEV_OVERRIDES.meterStyle.levelBarRatio, min: 0.1, max: 0.5, step: 0.01, label: 'Level Bar Width' },
      needleRatio: { value: DEFAULT_DEV_OVERRIDES.meterStyle.needleRatio, min: 0.05, max: 0.3, step: 0.01, label: 'Needle Width' },
      verticalHeightRatio: { value: DEFAULT_DEV_OVERRIDES.meterStyle.verticalHeightRatio, min: 0.2, max: 0.6, step: 0.01, label: 'Vertical Height' },
      needleGlow: { value: DEFAULT_DEV_OVERRIDES.meterStyle.needleGlow, min: 0, max: 20, step: 1, label: 'Needle Glow' },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (enabled) setMeterStyleOverrides(meterValues);
  }, [enabled, meterValues]);

  // Presets
  useControls('Presets', {
    'DAW Classic': button(() => applyPreset('daw-classic')),
    'Ableton Style': button(() => applyPreset('ableton')),
    'FL Studio': button(() => applyPreset('fl-studio')),
    'Pro Tools': button(() => applyPreset('pro-tools')),
    'High Contrast': button(() => applyPreset('high-contrast')),
    'Neon Glow': button(() => applyPreset('neon-glow')),
    'Reset All': button(() => {
      resetDevOverrides();
      window.location.reload();
    }),
  });

  return <Leva collapsed={false} titleBar={{ title: 'Visual Dev Tools' }} />;
}

type PresetName = 'daw-classic' | 'high-contrast' | 'muted-studio' | 'neon-glow' | 'ableton' | 'fl-studio' | 'pro-tools';

function applyPreset(preset: PresetName) {
  setDevOverrides({ enabled: true });

  switch (preset) {
    case 'daw-classic':
      setColorOverrides({
        pageBackground: '#0d0d1a',
        signalPositive: '#ff9500',
        signalNegative: '#00bcd4',
        colorNeutral: '#4a4a5a',
        gridArea: '#1a1a2a',
        meterHousing: '#0d0d1a',
        meterInterior: '#0d0d1a',
        surfaceNode: '#3a3a50',
        surfaceNodeBottom: '#2a2a40',
        portFill: '#4a8be0',
        portStroke: '#6aabff',
        gridLine: '#2a2a4a',
      });
      setNodeStyleOverrides({
        shadowBlur: 0.25,
        shadowOffsetY: 0.08,
        borderRadius: 0.15,
        borderWidth: 2,
      });
      setWireStyleOverrides({
        baseWidth: 2.5,
        glowMaxRadius: 15,
      });
      setGridStyleOverrides({
        shadowDepth: 0.5,
        insetDepthTop: 0.5,
      });
      break;

    case 'high-contrast':
      setColorOverrides({
        pageBackground: '#050510',
        signalPositive: '#ffcc00',
        signalNegative: '#00ffcc',
        colorNeutral: '#555566',
        gridArea: '#0a0a15',
        meterHousing: '#050510',
        meterInterior: '#050510',
        surfaceNode: '#404060',
        surfaceNodeBottom: '#303050',
        portFill: '#5090e0',
        portStroke: '#70b0ff',
        gridLine: '#303050',
        textPrimary: '#ffffff',
      });
      setNodeStyleOverrides({
        borderWidth: 2.5,
        gradientIntensity: 1.5,
      });
      setWireStyleOverrides({
        baseWidth: 3,
        baseOpacity: 0.5,
        glowMaxRadius: 18,
      });
      break;

    case 'muted-studio':
      setColorOverrides({
        pageBackground: '#101018',
        signalPositive: '#c9a030',
        signalNegative: '#308880',
        colorNeutral: '#353540',
        gridArea: '#181820',
        meterHousing: '#101018',
        meterInterior: '#101018',
        surfaceNode: '#28283a',
        surfaceNodeBottom: '#1e1e2e',
        portFill: '#355a90',
        portStroke: '#4a7ab0',
        gridLine: '#1a1a28',
      });
      setNodeStyleOverrides({
        shadowBlur: 0.15,
        borderWidth: 1,
      });
      setWireStyleOverrides({
        baseWidth: 2,
        baseOpacity: 0.3,
        glowMaxRadius: 8,
      });
      setGridStyleOverrides({
        lineOpacity: 0.7,
        shadowDepth: 0.3,
      });
      break;

    case 'neon-glow':
      setColorOverrides({
        pageBackground: '#080812',
        signalPositive: '#ff6b00',
        signalNegative: '#00ff88',
        colorNeutral: '#404050',
        gridArea: '#0f0f1a',
        meterHousing: '#080812',
        meterInterior: '#080812',
        surfaceNode: '#252540',
        surfaceNodeBottom: '#1a1a35',
        portFill: '#4080ff',
        portStroke: '#60a0ff',
        gridLine: '#202035',
        meterNeedle: '#ff3030',
      });
      setNodeStyleOverrides({
        shadowBlur: 0.3,
        borderRadius: 0.18,
      });
      setWireStyleOverrides({
        baseWidth: 2.5,
        glowThreshold: 50,
        glowMaxRadius: 20,
      });
      setMeterStyleOverrides({
        needleGlow: 15,
      });
      break;

    case 'ableton':
      // Inspired by Ableton Live's clean, minimal aesthetic
      setColorOverrides({
        pageBackground: '#121212',
        signalPositive: '#ff764d',  // Ableton orange
        signalNegative: '#5ee5c0',  // Mint green
        colorNeutral: '#4a4a52',
        gridArea: '#1e1e1e',        // Near-black
        meterHousing: '#121212',
        meterInterior: '#121212',
        surfaceNode: '#3d3d3d',     // Dark gray modules
        surfaceNodeBottom: '#2d2d2d',
        portFill: '#ff764d',
        portStroke: '#ff9d7a',
        gridLine: '#2a2a2a',
        textPrimary: '#b4b4b4',
      });
      setNodeStyleOverrides({
        shadowBlur: 0.1,
        shadowOffsetY: 0.02,
        borderRadius: 0.06,         // More squared off
        borderWidth: 1,
        gradientIntensity: 0.5,     // Flatter look
      });
      setWireStyleOverrides({
        baseWidth: 2,
        baseOpacity: 0.5,
        glowMaxRadius: 8,
      });
      setGridStyleOverrides({
        lineOpacity: 0.5,
        shadowDepth: 0.2,
        insetDepthTop: 0.2,
        insetDepthSide: 0.15,
      });
      break;

    case 'fl-studio':
      // Inspired by FL Studio's darker, high-contrast look
      setColorOverrides({
        pageBackground: '#0c0c10',
        signalPositive: '#ff8c00',  // Bright orange
        signalNegative: '#00e5ff',  // Cyan
        colorNeutral: '#3a3a4a',
        gridArea: '#202028',
        meterHousing: '#0c0c10',
        meterInterior: '#0c0c10',
        surfaceNode: '#36364a',
        surfaceNodeBottom: '#2a2a3a',
        portFill: '#5080d0',
        portStroke: '#70a0f0',
        gridLine: '#28283a',
        meterNeedle: '#ff4444',
        textPrimary: '#ffffff',
      });
      setNodeStyleOverrides({
        shadowBlur: 0.25,
        shadowOffsetY: 0.05,
        borderRadius: 0.1,
        borderWidth: 1.5,
        gradientIntensity: 1.2,
      });
      setWireStyleOverrides({
        baseWidth: 2.5,
        baseOpacity: 0.45,
        glowThreshold: 60,
        glowMaxRadius: 14,
      });
      setGridStyleOverrides({
        lineOpacity: 0.8,
        shadowDepth: 0.5,
        borderHighlight: 0.08,
        borderShadow: 0.5,
      });
      break;

    case 'pro-tools':
      // Inspired by Pro Tools' professional, muted aesthetic
      setColorOverrides({
        pageBackground: '#1a1a20',
        signalPositive: '#c8a850',  // Muted gold
        signalNegative: '#50a0a0',  // Muted teal
        colorNeutral: '#484850',
        gridArea: '#282830',
        meterHousing: '#1a1a20',
        meterInterior: '#1a1a20',
        surfaceNode: '#3a3a44',
        surfaceNodeBottom: '#2e2e38',
        portFill: '#4a6a90',
        portStroke: '#6a8ab0',
        gridLine: '#323240',
        meterNeedle: '#cc4444',
        textPrimary: '#d0d0d8',
      });
      setNodeStyleOverrides({
        shadowBlur: 0.15,
        shadowOffsetY: 0.04,
        borderRadius: 0.08,
        borderWidth: 1.5,
        gradientIntensity: 0.8,
      });
      setWireStyleOverrides({
        baseWidth: 2,
        baseOpacity: 0.35,
        glowThreshold: 80,
        glowMaxRadius: 10,
      });
      setGridStyleOverrides({
        lineOpacity: 0.6,
        shadowDepth: 0.35,
        insetDepthTop: 0.35,
        insetDepthSide: 0.25,
        borderHighlight: 0.05,
        borderShadow: 0.35,
      });
      setMeterStyleOverrides({
        needleGlow: 6,
      });
      break;
  }

  // Force re-render
  window.dispatchEvent(new Event('dev-overrides-changed'));
}
