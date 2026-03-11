import type { CardConfig, TargetData, Point, SensorLayout } from '../types/index.js';
import { mmToCanvas, getSensorLayout, degToRad } from '../utils/geometry.js';
import { getFurnitureType } from '../utils/furniture-shapes.js';

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
    furniture: Array<{ type: string; x: number; y: number; width: number; height: number; rotation: number; selected?: boolean }>,
    drawingState: { mode: string; zoneVertices: Point[]; mousePos: Point | null; hoveredVertexIndex: number | null },
    hoveredPos: Point | null
  ): void {
    if (!this.dirty) return;
    this.dirty = false;

    const { ctx, canvas, config } = this;
    const w = canvas.width;
    const h = canvas.height;
    const light = this._isLight;

    // Fill background explicitly so light/dark theme is visible on the canvas
    // itself (ctx.clearRect alone leaves the canvas transparent and relies
    // solely on the CSS wrapper background, which can be unreliable when the
    // shadow-DOM host class is applied asynchronously).
    ctx.fillStyle = light ? '#f0f4f8' : '#0a0e1a';
    ctx.fillRect(0, 0, w, h);

    const layout = this._getLayout(w, h);

    if (config.show_grid) this._drawGrid(w, h, layout);
    this._drawFOV(w, h, layout);
    if (config.show_sweep) this._drawSweep(w, h, layout);
    this._drawFurniture(furniture, w, h, layout);
    this._drawZones(zones, targets, w, h);
    if (config.show_trails) this._drawTrails(targets, w, h);
    this._drawTargets(targets, w, h);
    this._drawSensor(w, h, layout);
    this._drawDrawingOverlay(drawingState, w, h);

    if (hoveredPos) {
      this._drawTooltip(hoveredPos, w, h);
    }
  }

  private _getLayout(w: number, h: number): SensorLayout {
    return getSensorLayout(
      this.config.sensor_position ?? 'bottom',
      w, h, SENSOR_MARGIN, this.config.max_range
    );
  }

  private _toCanvas(mmX: number, mmY: number, w: number, h: number): Point {
    return mmToCanvas(mmX, mmY, w, h, this.config.max_range, SENSOR_MARGIN, this.config.sensor_position ?? 'bottom');
  }

  private get _isLight(): boolean {
    return this.config.color_scheme === 'light';
  }

  private _drawGrid(w: number, h: number, layout: SensorLayout): void {
    const ctx = this.ctx;
    const { sx, sy, facingAngle, scale } = layout;
    const fovHalf = degToRad(this.config.fov_angle / 2);
    const light = this._isLight;
    const maxRings = Math.ceil(this.config.max_range / 1000);

    ctx.save();
    ctx.strokeStyle = light ? 'rgba(59,130,246,0.12)' : 'rgba(99,179,237,0.08)';
    ctx.lineWidth = 1;

    // Polar rings every 1000mm — drawn as semicircle centered on facingAngle
    for (let r = 1; r <= maxRings; r++) {
      const pxR = r * 1000 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, pxR, facingAngle - Math.PI / 2, facingAngle + Math.PI / 2);
      ctx.stroke();

      // Range label — place along the facing direction
      ctx.fillStyle = light ? 'rgba(59,130,246,0.5)' : 'rgba(99,179,237,0.3)';
      ctx.font = '10px system-ui';
      const labelX = sx + Math.cos(facingAngle + 0.1) * pxR;
      const labelY = sy + Math.sin(facingAngle + 0.1) * pxR;
      ctx.fillText(`${r}m`, labelX + 4, labelY + 3);
    }

    // Radial lines every 30° within the forward semicircle
    ctx.strokeStyle = light ? 'rgba(59,130,246,0.08)' : 'rgba(99,179,237,0.06)';
    for (let deg = -90; deg <= 90; deg += 30) {
      const lineAngle = facingAngle + degToRad(deg);
      // Only within FOV cone
      if (Math.abs(degToRad(deg)) > fovHalf + 0.01) continue;
      const len = (this.config.max_range + 500) * scale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(lineAngle) * len, sy + Math.sin(lineAngle) * len);
      ctx.stroke();
    }

    ctx.restore();
  }

  private _drawFOV(w: number, h: number, layout: SensorLayout): void {
    const ctx = this.ctx;
    const { sx, sy, facingAngle, scale } = layout;
    const fovHalf = degToRad(this.config.fov_angle / 2);
    const maxR = this.config.max_range * scale;
    const light = this._isLight;

    ctx.save();
    // Fill the FOV cone
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, maxR, facingAngle - fovHalf, facingAngle + fovHalf);
    ctx.closePath();
    ctx.fillStyle = light ? 'rgba(14,165,233,0.07)' : 'rgba(56,189,248,0.06)';
    ctx.fill();

    // FOV border lines
    ctx.strokeStyle = light ? 'rgba(14,165,233,0.5)' : 'rgba(56,189,248,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(facingAngle - fovHalf) * maxR,
      sy + Math.sin(facingAngle - fovHalf) * maxR
    );
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(facingAngle + fovHalf) * maxR,
      sy + Math.sin(facingAngle + fovHalf) * maxR
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawSweep(w: number, h: number, layout: SensorLayout): void {
    const ctx = this.ctx;
    const { sx, sy, scale } = layout;
    const maxR = this.config.max_range * scale;
    const sweepAngle = this.sweepAngle;
    const light = this._isLight;
    const sweepRgb = light ? '59,130,246' : '99,179,237';

    ctx.save();
    const trailArc = Math.PI / 3; // 60° trail

    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const alpha = ((steps - i) / steps) * 0.25;
      const startAngle = sweepAngle - trailArc * (i / steps);
      const endAngle = sweepAngle - trailArc * ((i + 1) / steps);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, maxR, startAngle, endAngle, true);
      ctx.closePath();
      ctx.fillStyle = `rgba(${sweepRgb},${alpha})`;
      ctx.fill();
    }

    // Leading edge line
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(sweepAngle) * maxR, sy + Math.sin(sweepAngle) * maxR);
    ctx.strokeStyle = `rgba(${sweepRgb},0.7)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  private _drawFurniture(
    furniture: Array<{ type: string; x: number; y: number; width: number; height: number; rotation: number; selected?: boolean }>,
    w: number,
    h: number,
    layout: SensorLayout
  ): void {
    if (furniture.length === 0) return;
    const ctx = this.ctx;
    const { scale } = layout;
    const light = this._isLight;

    ctx.save();

    for (const f of furniture) {
      const def = getFurnitureType(f.type);
      const canvasPos = this._toCanvas(f.x, f.y, w, h);
      const cx = canvasPos.x;
      const cy = canvasPos.y;
      const pw = f.width * scale;
      const ph = f.height * scale;
      const rot = degToRad(f.rotation);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      if (f.selected) {
        ctx.fillStyle = light ? 'rgba(100,116,139,0.2)' : 'rgba(148,163,184,0.22)';
        ctx.strokeStyle = light ? 'rgba(2,132,199,0.85)' : 'rgba(56,189,248,0.8)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.fillStyle = light ? 'rgba(100,116,139,0.1)' : 'rgba(148,163,184,0.12)';
        ctx.strokeStyle = light ? 'rgba(100,116,139,0.6)' : 'rgba(148,163,184,0.5)';
        ctx.lineWidth = 1;
      }

      if (def) {
        def.drawFn(ctx, -pw / 2, -ph / 2, pw, ph);
      } else {
        // Fallback: plain rectangle
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      }

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
        ctx.fillStyle = hexToRgba(target.color, alpha);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private _drawTargets(targets: TargetData[], w: number, h: number): void {
    const ctx = this.ctx;
    const light = this._isLight;
    ctx.save();
    for (const target of targets) {
      if (!target.active) continue;
      const pos = this._toCanvas(target.x, target.y, w, h);

      // Glow
      ctx.shadowBlur = light ? 8 : 16;
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
      ctx.fillStyle = light ? 'rgba(30,41,59,0.85)' : 'rgba(226,232,240,0.8)';
      ctx.fillText(target.label || `T${target.id}`, pos.x + 8, pos.y - 8);
    }
    ctx.restore();
  }

  private _drawSensor(w: number, h: number, layout: SensorLayout): void {
    const ctx = this.ctx;
    const { sx, sy, facingAngle } = layout;
    const light = this._isLight;
    const sensorColor = light ? '#0284c7' : '#38bdf8';
    ctx.save();
    ctx.shadowBlur = light ? 8 : 12;
    ctx.shadowColor = sensorColor;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = sensorColor;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw a small direction indicator
    const indicatorLen = 12;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(facingAngle) * indicatorLen,
      sy + Math.sin(facingAngle) * indicatorLen
    );
    ctx.strokeStyle = sensorColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label — offset away from the facing direction (behind the sensor)
    ctx.font = '10px system-ui';
    ctx.fillStyle = light ? 'rgba(2,132,199,0.7)' : 'rgba(99,179,237,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelDist = 18;
    ctx.fillText(
      'SENSOR',
      sx - Math.cos(facingAngle) * labelDist,
      sy - Math.sin(facingAngle) * labelDist
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
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
