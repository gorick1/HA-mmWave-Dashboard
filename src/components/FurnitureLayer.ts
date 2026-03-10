import type { FurnitureConfig, FurnitureState, Point, CardConfig } from '../types/index.js';
import { canvasToMm, mmToCanvas, getSensorLayout, degToRad, snapToGrid, distance } from '../utils/geometry.js';
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
  private resizeAnchorMm: Point = { x: 0, y: 0 };
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

  private get _sensorPosition() {
    return this.config.sensor_position ?? 'bottom';
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
    let mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
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
    const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN, this.config.max_range);
    const scale = layout.scale;

    // Check if clicking a handle of the selected item
    if (this.selectedId) {
      const item = this.items.find(i => i.id === this.selectedId);
      if (item) {
        const handles = this._getHandles(item, canvasWidth, canvasHeight, scale);
        for (let i = 0; i < handles.length; i++) {
          if (distance({ x: canvasX, y: canvasY }, handles[i]) < HANDLE_SIZE + 2) {
            if (i === 4) {
              // Rotation handle - use index 4 as rotation sentinel
              this.resizing = false;
              this.resizeHandleIndex = 4;
            } else {
              this.resizing = true;
              this.resizeHandleIndex = i;
              // Anchor is the opposite corner in mm world space
              const rot = degToRad(item.rotation);
              const anchorIdx = (i + 2) % 4;
              const halfW = item.width / 2;
              const halfH = item.height / 2;
              // Corners in local mm space (y-up): TL=(-hw,+hh), TR=(+hw,+hh), BR=(+hw,-hh), BL=(-hw,-hh)
              const localCorners: Point[] = [
                { x: -halfW, y: halfH },
                { x: halfW, y: halfH },
                { x: halfW, y: -halfH },
                { x: -halfW, y: -halfH },
              ];
              const lc = localCorners[anchorIdx];
              this.resizeAnchorMm = {
                x: item.x + lc.x * Math.cos(rot) - lc.y * Math.sin(rot),
                y: item.y + lc.x * Math.sin(rot) + lc.y * Math.cos(rot),
              };
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
        const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
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
      let mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
      if (this.snapToGridEnabled) {
        mm = {
          x: snapToGrid(mm.x - this.dragOffset.x, SNAP_GRID_MM) + this.dragOffset.x,
          y: snapToGrid(mm.y - this.dragOffset.y, SNAP_GRID_MM) + this.dragOffset.y,
        };
      }
      item.x = mm.x - this.dragOffset.x;
      item.y = mm.y - this.dragOffset.y;
    } else if (this.resizing && this.resizeHandleIndex >= 0 && this.resizeHandleIndex < 4) {
      const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
      // Resize from anchor corner: the anchor corner stays fixed, the dragged corner follows the mouse.
      // Transform the mouse-to-anchor vector into the item's local (unrotated) frame.
      const rot = degToRad(item.rotation);
      const dx = mm.x - this.resizeAnchorMm.x;
      const dy = mm.y - this.resizeAnchorMm.y;
      const localDx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const localDy = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      item.width = Math.max(100, Math.abs(localDx));
      item.height = Math.max(100, Math.abs(localDy));
      // Reposition center to midpoint of anchor and current mouse in world space
      item.x = (this.resizeAnchorMm.x + mm.x) / 2;
      item.y = (this.resizeAnchorMm.y + mm.y) / 2;
    } else if (this.resizeHandleIndex === 4) {
      // Rotation
      const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN, this.config.max_range);
      const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
      const cx = itemCanvas.x;
      const cy = itemCanvas.y;
      const angle = Math.atan2(canvasY - cy, canvasX - cx);
      // Adjust rotation to account for sensor facing direction
      // The visual rotation needs to be offset by the facing angle
      item.rotation = (angle * 180) / Math.PI + 90 - (layout.facingAngle * 180) / Math.PI - 90;
    }
  }

  onMouseUp(): void {
    this.dragging = false;
    this.resizing = false;
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
    const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN, this.config.max_range);
    const scale = layout.scale;
    const handles = this._getHandles(item, canvasWidth, canvasHeight, scale);

    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.8)';
    ctx.fillStyle = 'rgba(56,189,248,0.3)';
    ctx.lineWidth = 1.5;

    // Bounding box
    const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
    const cx = itemCanvas.x;
    const cy = itemCanvas.y;
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

  private _getHandles(
    item: FurnitureState,
    canvasWidth: number,
    canvasHeight: number,
    scale: number
  ): Point[] {
    const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
    const cx = itemCanvas.x;
    const cy = itemCanvas.y;
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
    const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
    const cx = itemCanvas.x;
    const cy = itemCanvas.y;
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
    const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN, this.config.max_range);
    const scale = layout.scale;

    ctx.save();
    for (const item of this.items) {
      const def = getFurnitureType(item.type);
      if (!def) continue;
      const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
      const cx = itemCanvas.x;
      const cy = itemCanvas.y;
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
