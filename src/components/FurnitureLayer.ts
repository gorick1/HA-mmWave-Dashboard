import type { FurnitureConfig, FurnitureState, Point, CardConfig } from '../types/index.js';
import { canvasToMm, mmToCanvas, getScale, degToRad, snapToGrid, distance } from '../utils/geometry.js';
import { getFurnitureType } from '../utils/furniture-shapes.js';

const HANDLE_SIZE = 8;
const SENSOR_MARGIN = 40;
const SNAP_GRID_MM = 100;

/**
 * FurnitureLayer manages furniture placement, selection, and interaction.
 */
export class FurnitureLayer {
  private items: FurnitureState[] = [];
  private config: CardConfig;
  private selectedId: string | null = null;
  private dragging = false;
  private dragOffset: Point = { x: 0, y: 0 };
  private resizing = false;
  private rotating = false;
  private resizeHandleIndex = -1;
  private snapToGridEnabled = true;

  constructor(config: CardConfig) {
    this.config = config;
    this.items = config.furniture.map(f => ({ ...f, selected: false }));
  }

  updateConfig(config: CardConfig): void {
    this.config = config;
    // Merge: keep selected state for existing items
    const existingMap = new Map(this.items.map(i => [i.id, i]));
    this.items = config.furniture.map(f => {
      const existing = existingMap.get(f.id);
      return { ...f, selected: existing?.selected ?? false };
    });
  }

  getItems(): FurnitureState[] {
    return this.items;
  }

  getFurnitureConfigs(): FurnitureConfig[] {
    return this.items.map(({ selected: _s, ...rest }) => rest);
  }

  setSnapToGrid(enabled: boolean): void {
    this.snapToGridEnabled = enabled;
  }

  /**
   * Place a new furniture item at the given canvas position.
   */
  placeAt(
    furnitureType: string,
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): FurnitureConfig | null {
    const def = getFurnitureType(furnitureType);
    if (!def) return null;
    let mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN);
    if (this.snapToGridEnabled) {
      mm = {
        x: snapToGrid(mm.x, SNAP_GRID_MM),
        y: snapToGrid(mm.y, SNAP_GRID_MM),
      };
    }
    const id = `${furnitureType}_${Date.now()}`;
    const item: FurnitureState = {
      id,
      type: furnitureType,
      x: mm.x,
      y: mm.y,
      width: def.defaultWidth,
      height: def.defaultHeight,
      rotation: 0,
      selected: false,
    };
    this.items.push(item);
    return item;
  }

  /**
   * Handle mouse down on canvas in select/furniture mode.
   * Returns true if the event was consumed.
   */
  onMouseDown(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    const scale = getScale(canvasHeight, this.config.max_range, SENSOR_MARGIN);

    // Check if clicking a handle of the selected item
    if (this.selectedId) {
      const item = this.items.find(i => i.id === this.selectedId);
      if (item) {
        const handles = this._getHandles(item, canvasWidth, canvasHeight, scale);
        for (let i = 0; i < handles.length; i++) {
          if (distance({ x: canvasX, y: canvasY }, handles[i]) < HANDLE_SIZE + 2) {
            if (i === 4) {
              // Rotation handle
              this.rotating = true;
            } else {
              this.resizing = true;
              this.resizeHandleIndex = i;
            }
            return true;
          }
        }
      }
    }

    // Check if clicking an existing item
    for (let idx = this.items.length - 1; idx >= 0; idx--) {
      const item = this.items[idx];
      if (this._hitTest(item, canvasX, canvasY, canvasWidth, canvasHeight, scale)) {
        // Deselect all
        for (const i of this.items) i.selected = false;
        item.selected = true;
        this.selectedId = item.id;
        const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN);
        this.dragOffset = { x: mm.x - item.x, y: mm.y - item.y };
        this.dragging = true;
        return true;
      }
    }

    // Deselect
    for (const i of this.items) i.selected = false;
    this.selectedId = null;
    return false;
  }

  onMouseMove(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this.selectedId) return;
    const item = this.items.find(i => i.id === this.selectedId);
    if (!item) return;

    if (this.dragging) {
      let mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN);
      if (this.snapToGridEnabled) {
        mm = {
          x: snapToGrid(mm.x - this.dragOffset.x, SNAP_GRID_MM) + this.dragOffset.x,
          y: snapToGrid(mm.y - this.dragOffset.y, SNAP_GRID_MM) + this.dragOffset.y,
        };
      }
      item.x = mm.x - this.dragOffset.x;
      item.y = mm.y - this.dragOffset.y;
    } else if (this.resizing && this.resizeHandleIndex >= 0) {
      const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN);
      const dx = mm.x - item.x;
      const dy = item.y - mm.y;
      switch (this.resizeHandleIndex) {
        case 0: item.width = Math.max(100, Math.abs(dx) * 2); item.height = Math.max(100, Math.abs(dy) * 2); break;
        case 1: item.width = Math.max(100, Math.abs(dx) * 2); item.height = Math.max(100, Math.abs(dy) * 2); break;
        case 2: item.width = Math.max(100, Math.abs(dx) * 2); item.height = Math.max(100, Math.abs(dy) * 2); break;
        case 3: item.width = Math.max(100, Math.abs(dx) * 2); item.height = Math.max(100, Math.abs(dy) * 2); break;
      }
    } else if (this.rotating) {
      const sc = this._sensorPosCanvas(canvasWidth, canvasHeight);
      const scale = getScale(canvasHeight, this.config.max_range, SENSOR_MARGIN);
      const cx = sc.x + item.x * scale;
      const cy = sc.y - item.y * scale;
      const angle = Math.atan2(canvasY - cy, canvasX - cx);
      item.rotation = (angle * 180) / Math.PI + 90;
    }
  }

  onMouseUp(): void {
    this.dragging = false;
    this.resizing = false;
    this.rotating = false;
    this.resizeHandleIndex = -1;
  }

  deleteSelected(): FurnitureConfig | null {
    if (!this.selectedId) return null;
    const idx = this.items.findIndex(i => i.id === this.selectedId);
    if (idx < 0) return null;
    const removed = this.items.splice(idx, 1)[0];
    this.selectedId = null;
    return removed;
  }

  /**
   * Draw selection handles for the currently selected item.
   */
  drawHandles(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.selectedId) return;
    const item = this.items.find(i => i.id === this.selectedId);
    if (!item) return;
    const scale = getScale(canvasHeight, this.config.max_range, SENSOR_MARGIN);
    const handles = this._getHandles(item, canvasWidth, canvasHeight, scale);

    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.8)';
    ctx.fillStyle = 'rgba(56,189,248,0.3)';
    ctx.lineWidth = 1.5;

    // Bounding box
    const sc = this._sensorPosCanvas(canvasWidth, canvasHeight);
    const cx = sc.x + item.x * scale;
    const cy = sc.y - item.y * scale;
    const pw = item.width * scale;
    const ph = item.height * scale;
    const rot = degToRad(item.rotation);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
    ctx.setLineDash([]);
    ctx.restore();

    // Corner handles (0-3) + rotation handle (4)
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(handles[i].x, handles[i].y, HANDLE_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Rotation handle
    ctx.beginPath();
    ctx.arc(handles[4].x, handles[4].y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,139,250,0.8)';
    ctx.fillStyle = 'rgba(167,139,250,0.4)';
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private _sensorPosCanvas(cw: number, ch: number): Point {
    return { x: cw / 2, y: ch - SENSOR_MARGIN };
  }

  private _getHandles(
    item: FurnitureState,
    canvasWidth: number,
    canvasHeight: number,
    scale: number
  ): Point[] {
    const sc = this._sensorPosCanvas(canvasWidth, canvasHeight);
    const cx = sc.x + item.x * scale;
    const cy = sc.y - item.y * scale;
    const pw = item.width * scale / 2;
    const ph = item.height * scale / 2;
    const rot = degToRad(item.rotation);
    const corners: Point[] = [
      { x: -pw, y: -ph },
      { x: pw, y: -ph },
      { x: pw, y: ph },
      { x: -pw, y: ph },
    ];
    const rotated = corners.map(c => ({
      x: cx + c.x * Math.cos(rot) - c.y * Math.sin(rot),
      y: cy + c.x * Math.sin(rot) + c.y * Math.cos(rot),
    }));
    // Rotation handle above center
    const rotHandle = {
      x: cx + Math.cos(rot - Math.PI / 2) * (ph + 20),
      y: cy + Math.sin(rot - Math.PI / 2) * (ph + 20),
    };
    return [...rotated, rotHandle];
  }

  private _hitTest(
    item: FurnitureState,
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number,
    scale: number
  ): boolean {
    const sc = this._sensorPosCanvas(canvasWidth, canvasHeight);
    const cx = sc.x + item.x * scale;
    const cy = sc.y - item.y * scale;
    // Transform click into item's local space
    const rot = degToRad(-item.rotation);
    const dx = canvasX - cx;
    const dy = canvasY - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    return (
      Math.abs(localX) <= item.width * scale / 2 &&
      Math.abs(localY) <= item.height * scale / 2
    );
  }

  /**
   * Draw all furniture items using their type-specific draw function.
   */
  drawAll(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    const scale = getScale(canvasHeight, this.config.max_range, SENSOR_MARGIN);
    const sc = this._sensorPosCanvas(canvasWidth, canvasHeight);

    ctx.save();
    for (const item of this.items) {
      const def = getFurnitureType(item.type);
      if (!def) continue;
      const cx = sc.x + item.x * scale;
      const cy = sc.y - item.y * scale;
      const pw = item.width * scale;
      const ph = item.height * scale;
      const rot = degToRad(item.rotation);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = item.selected
        ? 'rgba(148,163,184,0.22)'
        : 'rgba(148,163,184,0.12)';
      ctx.strokeStyle = item.selected
        ? 'rgba(56,189,248,0.8)'
        : 'rgba(148,163,184,0.5)';
      ctx.lineWidth = item.selected ? 1.5 : 1;
      def.drawFn(ctx, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
    ctx.restore();
  }
}
