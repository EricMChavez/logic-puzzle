import type { Vec2 } from '../../shared/types/index.ts';
import { CONNECTION_POINT_CONFIG, COLORS } from '../../shared/constants/index.ts';
import { getConnectionPointPosition } from './port-positions.ts';
import { getWaveformBuffers } from '../../simulation/simulation-controller.ts';
import { useGameStore } from '../../store/index.ts';

/** Waveform display dimensions */
const WAVEFORM_WIDTH = 80;
const WAVEFORM_HEIGHT = 40;
const WAVEFORM_GAP = 16; // Gap between connection point and waveform

/**
 * Render waveform displays next to each connection point.
 * Each waveform shows a rolling signal history with centerline at 0.
 */
export function renderWaveforms(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const buffers = getWaveformBuffers();
  if (buffers.size === 0) return;

  // Input waveforms (left side, waveform to the right of the CP)
  for (let i = 0; i < CONNECTION_POINT_CONFIG.INPUT_COUNT; i++) {
    const cpPos = getConnectionPointPosition('input', i, canvasWidth, canvasHeight);
    const buf = buffers.get(`input:${i}`);
    if (!buf) continue;

    const origin: Vec2 = {
      x: cpPos.x + CONNECTION_POINT_CONFIG.RADIUS + WAVEFORM_GAP,
      y: cpPos.y - WAVEFORM_HEIGHT / 2,
    };
    drawWaveform(ctx, origin, buf.toArray());
  }

  // Output waveforms (right side, waveform to the left of the CP)
  const { activePuzzle } = useGameStore.getState();
  for (let i = 0; i < CONNECTION_POINT_CONFIG.OUTPUT_COUNT; i++) {
    const cpPos = getConnectionPointPosition('output', i, canvasWidth, canvasHeight);
    const buf = buffers.get(`output:${i}`);
    if (!buf) continue;

    const origin: Vec2 = {
      x: cpPos.x - CONNECTION_POINT_CONFIG.RADIUS - WAVEFORM_GAP - WAVEFORM_WIDTH,
      y: cpPos.y - WAVEFORM_HEIGHT / 2,
    };
    drawWaveform(ctx, origin, buf.toArray());

    // Draw target waveform overlay in puzzle mode
    if (activePuzzle) {
      const targetBuf = buffers.get(`target:${i}`);
      if (targetBuf) {
        drawTargetWaveform(ctx, origin, targetBuf.toArray());
      }
    }
  }
}

/**
 * Draw a single waveform at the given origin (top-left corner).
 * Values range from -100 to +100. Centerline at y = 0.
 */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  origin: Vec2,
  values: number[],
): void {
  const { x, y } = origin;
  const centerY = y + WAVEFORM_HEIGHT / 2;

  // Background
  ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
  ctx.fillRect(x, y, WAVEFORM_WIDTH, WAVEFORM_HEIGHT);

  // Border
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, WAVEFORM_WIDTH, WAVEFORM_HEIGHT);

  // Centerline (value = 0)
  ctx.strokeStyle = '#3a3a5a';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, centerY);
  ctx.lineTo(x + WAVEFORM_WIDTH, centerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw waveform path
  if (values.length < 2) return;

  const stepX = WAVEFORM_WIDTH / (values.length - 1);

  ctx.strokeStyle = COLORS.CONNECTION_POINT_FILL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let i = 0; i < values.length; i++) {
    const px = x + i * stepX;
    // Map value (-100 to +100) to y coordinate (bottom to top within WAVEFORM_HEIGHT)
    const normalized = values[i] / 100; // -1 to +1
    const py = centerY - normalized * (WAVEFORM_HEIGHT / 2 - 2); // 2px padding

    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

/**
 * Draw a target waveform as a dashed green overlay on top of an existing waveform box.
 * Uses the same coordinate mapping as drawWaveform.
 */
function drawTargetWaveform(
  ctx: CanvasRenderingContext2D,
  origin: Vec2,
  values: number[],
): void {
  if (values.length < 2) return;

  const { x, y } = origin;
  const centerY = y + WAVEFORM_HEIGHT / 2;
  const stepX = WAVEFORM_WIDTH / (values.length - 1);

  ctx.strokeStyle = COLORS.TARGET_WAVEFORM;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();

  for (let i = 0; i < values.length; i++) {
    const px = x + i * stepX;
    const normalized = values[i] / 100;
    const py = centerY - normalized * (WAVEFORM_HEIGHT / 2 - 2);

    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
