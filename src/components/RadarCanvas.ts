import type { CardConfig, TargetData, Point } from '../types/index.js';
import { mmToCanvas, getScale, degToRad } from '../utils/geometry.js';

const SENSOR_MARGIN = 40;
const TRAIL_OPACITY_MAX = 0.6;

/**
 * RadarCanvas handles all canvas drawing for the radar visualization.
 */
export class RadarCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: CardConfig;
  private sweepAngle = -Math.PI / 2; // start pointing up
  private sweepAnimId: number | null = null;
  private lastSweepTime = 0;
  private dirty = true;

  constructor(canvas: HTMLCanvasElement, config: CardConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.config = config;
  }

  updateConfig(config: CardConfig): void {
    this.config = config;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  startAnimation(): void {
    const animate = (time: number) => {
      const dt = this.lastSweepTime ? time - this.lastSweepTime : 16;
      this.lastSweepTime = time;
      // ~1 RPM = 2π / 60s
      if (this.config.show_sweep) {
        this.sweepAngle += (2 * Math.PI * dt) / 60000;
      }
      this.dirty = true;
      this.sweepAnimId = requestAnimationFrame(animate);
    };
    this.sweepAnimId = requestAnimationFrame(animate);
  }

  stopAnimation(): void {
    if (this.sweepAnimId !== null) {
      cancelAnimationFrame(this.sweepAnimId);
      this.sweepAnimId = null;
    }
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.dirty = true;
  }

  /**
   * Main render function. Call on rAF.
   */
  render(
    targets: TargetData[],
    zones: Array<{ vertices: Point[]; name: string; color: string; occupied: boolean }>,
    furniture: Array<{ type: string; x: number; y: number; width: number; height: number; rotation: number }>,
    drawingState: { mode: string; zoneVertices: Point[]; mousePos: Point | null; hoveredVertexIndex: number | null },
    hoveredPos: Point | null
  ): void {
    if (!this.dirty) return;
    this.dirty = false;

    const { ctx, canvas, config } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (config.show_grid) this._drawGrid(w, h);
    this._drawFOV(w, h);
    if (config.show_sweep) this._drawSweep(w, h);
    this._drawFurniture(furniture, w, h);
    this._drawZones(zones, targets, w, h);
    if (config.show_trails) this._drawTrails(targets, w, h);
    this._drawTargets(targets, w, h);
    this._drawSensor(w, h);
    this._drawDrawingOverlay(drawingState, w, h);

    if (hoveredPos) {
      this._drawTooltip(hoveredPos, w, h);
    }
  }

  private _sensorPos(w: number, h: number): Point {
    return { x: w / 2, y: h - SENSOR_MARGIN };
  }

  private _toCanvas(mmX: number, mmY: number, w: number, h: number): Point {
    return mmToCanvas(mmX, mmY, w, h, this.config.max_range, SENSOR_MARGIN);
  }

  private _drawGrid(w: number, h: number): void {
    const ctx = this.ctx;
    const { x: sx, y: sy } = this._sensorPos(w, h);
    const scale = getScale(h, this.config.max_range, SENSOR_MARGIN);
    const fovHalf = degToRad(this.config.fov_angle / 2);
    const maxRings = Math.ceil(this.config.max_range / 1000);

    ctx.save();
    ctx.strokeStyle = 'rgba(99,179,237,0.08)';
    ctx.lineWidth = 1;

    // Polar rings every 1000mm
    for (let r = 1; r <= maxRings; r++) {
      const pxR = r * 1000 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, pxR, -Math.PI, 0);
      ctx.stroke();

      // Range label
      ctx.fillStyle = 'rgba(99,179,237,0.3)';
      ctx.font = '10px system-ui';
      ctx.fillText(`${r}m`, sx + 4, sy - pxR + 3);
    }

    // Radial lines every 30°
    ctx.strokeStyle = 'rgba(99,179,237,0.06)';
    for (let deg = -90; deg <= 90; deg += 30) {
      const rad = degToRad(deg) - Math.PI / 2;
      // Only within FOV cone
      if (Math.abs(rad + Math.PI / 2) > fovHalf + 0.01) continue;
      const len = (this.config.max_range + 500) * scale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(rad) * len, sy + Math.sin(rad) * len);
      ctx.stroke();
    }

    ctx.restore();
  }

  private _drawFOV(w: number, h: number): void {
    const ctx = this.ctx;
    const { x: sx, y: sy } = this._sensorPos(w, h);
    const scale = getScale(h, this.config.max_range, SENSOR_MARGIN);
    const fovHalf = degToRad(this.config.fov_angle / 2);
    const maxR = this.config.max_range * scale;

    ctx.save();
    // Fill the FOV cone
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, maxR, -Math.PI / 2 - fovHalf, -Math.PI / 2 + fovHalf);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.06)';
    ctx.fill();

    // FOV border lines
    ctx.strokeStyle = 'rgba(56,189,248,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(-Math.PI / 2 - fovHalf) * maxR,
      sy + Math.sin(-Math.PI / 2 - fovHalf) * maxR
    );
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(-Math.PI / 2 + fovHalf) * maxR,
      sy + Math.sin(-Math.PI / 2 + fovHalf) * maxR
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawSweep(w: number, h: number): void {
    const ctx = this.ctx;
    const { x: sx, y: sy } = this._sensorPos(w, h);
    const scale = getScale(h, this.config.max_range, SENSOR_MARGIN);
    const maxR = this.config.max_range * scale;
    const sweepAngle = this.sweepAngle;

    ctx.save();
    // Create a conic gradient-like sweep by drawing a filled arc sector
    const trailArc = Math.PI / 3; // 60° trail

    // Fallback: draw multiple overlapping arcs with decreasing opacity
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const alpha = ((steps - i) / steps) * 0.25;
      const startAngle = sweepAngle - trailArc * (i / steps);
      const endAngle = sweepAngle - trailArc * ((i + 1) / steps);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, maxR, startAngle, endAngle, true);
      ctx.closePath();
      ctx.fillStyle = `rgba(99,179,237,${alpha})`;
      ctx.fill();
    }

    // Leading edge line
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(sweepAngle) * maxR, sy + Math.sin(sweepAngle) * maxR);
    ctx.strokeStyle = 'rgba(99,179,237,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  private _drawFurniture(
    furniture: Array<{ type: string; x: number; y: number; width: number; height: number; rotation: number }>,
    w: number,
    h: number
  ): void {
    if (furniture.length === 0) return;
    const ctx = this.ctx;
    const scale = getScale(h, this.config.max_range, SENSOR_MARGIN);
    const { x: sx, y: sy } = this._sensorPos(w, h);

    ctx.save();
    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 1;

    for (const f of furniture) {
      const cx = sx + f.x * scale;
      const cy = sy - f.y * scale;
      const pw = f.width * scale;
      const ph = f.height * scale;
      const rot = degToRad(f.rotation);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }

    ctx.restore();
  }

  private _drawZones(
    zones: Array<{ vertices: Point[]; name: string; color: string; occupied: boolean }>,
    _targets: TargetData[],
    w: number,
    h: number
  ): void {
    if (zones.length === 0) return;
    const ctx = this.ctx;

    ctx.save();
    for (const zone of zones) {
      if (zone.vertices.length < 2) continue;
      const pts = zone.vertices.map(v => this._toCanvas(v.x, v.y, w, h));

      // Fill
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();

      if (zone.occupied) {
        ctx.fillStyle = 'rgba(167,139,250,0.3)';
        ctx.strokeStyle = 'rgba(167,139,250,0.9)';
      } else {
        ctx.fillStyle = 'rgba(139,92,246,0.15)';
        ctx.strokeStyle = zone.color || 'rgba(139,92,246,0.7)';
      }
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Zone name label
      if (pts.length >= 3) {
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        ctx.font = '11px system-ui';
        ctx.fillStyle = zone.occupied ? 'rgba(167,139,250,0.9)' : 'rgba(139,92,246,0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zone.name, cx, cy);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  private _drawTrails(targets: TargetData[], w: number, h: number): void {
    const ctx = this.ctx;
    ctx.save();
    for (const target of targets) {
      if (!target.active || target.trail.length < 2) continue;
      for (let i = 0; i < target.trail.length; i++) {
        const pos = this._toCanvas(target.trail[i].x, target.trail[i].y, w, h);
        const alpha = (i / target.trail.length) * TRAIL_OPACITY_MAX;
        const radius = 3 + (i / target.trail.length) * 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = target.color.replace(')', `, ${alpha})`).replace('rgb(', 'rgba(');
        // Handle hex colors
        ctx.fillStyle = hexToRgba(target.color, alpha);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private _drawTargets(targets: TargetData[], w: number, h: number): void {
    const ctx = this.ctx;
    ctx.save();
    for (const target of targets) {
      if (!target.active) continue;
      const pos = this._toCanvas(target.x, target.y, w, h);

      // Glow
      ctx.shadowBlur = 16;
      ctx.shadowColor = target.color;

      // Outer ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(target.color, 0.4);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Main dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = target.color;
      ctx.fill();

      ctx.shadowBlur = 0;

      // Label
      ctx.font = '10px system-ui';
      ctx.fillStyle = 'rgba(226,232,240,0.8)';
      ctx.fillText(target.label || `T${target.id}`, pos.x + 8, pos.y - 8);
    }
    ctx.restore();
  }

  private _drawSensor(w: number, h: number): void {
    const ctx = this.ctx;
    const { x: sx, y: sy } = this._sensorPos(w, h);
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = '10px system-ui';
    ctx.fillStyle = 'rgba(99,179,237,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('SENSOR', sx, sy + 18);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  private _drawDrawingOverlay(
    state: { mode: string; zoneVertices: Point[]; mousePos: Point | null; hoveredVertexIndex: number | null },
    w: number,
    h: number
  ): void {
    if (state.mode !== 'draw-zone') return;
    const ctx = this.ctx;
    const pts = state.zoneVertices.map(v => this._toCanvas(v.x, v.y, w, h));
    if (pts.length === 0) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(139,92,246,0.8)';
    ctx.fillStyle = 'rgba(139,92,246,0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);

    // Drawn edges
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

    // Preview line to mouse
    if (state.mousePos) {
      ctx.lineTo(state.mousePos.x, state.mousePos.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Vertex dots
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, i === 0 ? 7 : 4, 0, Math.PI * 2);
      if (i === 0 && state.hoveredVertexIndex === 0) {
        ctx.strokeStyle = 'rgba(167,139,250,1)';
        ctx.fillStyle = 'rgba(167,139,250,0.5)';
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(139,92,246,0.8)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(139,92,246,0.9)';
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawTooltip(mmPos: Point, _w: number, _h: number): void {
    // Tooltip is rendered as HTML overlay, not on canvas
    void mmPos;
  }
}

/**
 * Convert a hex color (#rrggbb or #rgb) to rgba string.
 */
function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    // Already rgb, just apply alpha
    return hex.replace(/[\d.]+\)$/, `${alpha})`);
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
