import type { ZoneConfig, ZoneState, Point, CardConfig } from '../types/index.js';
import {
  canvasToMm,
  mmToCanvas,
  pointInPolygon,
  polygonCentroid,
  distance,
  translatePolygon,
  closestPointOnSegment,
} from '../utils/geometry.js';

const SENSOR_MARGIN = 40;
const VERTEX_RADIUS = 7;
const EDGE_HIT_RADIUS = 8;

/**
 * ZoneEditor manages polygon zone drawing, editing, and occupancy detection.
 */
export class ZoneEditor {
  private zones: ZoneState[] = [];
  private config: CardConfig;
  private drawingVertices: Point[] = [];
  private isDrawing = false;
  private selectedZoneId: string | null = null;
  private draggingZone = false;
  private draggingVertex = false;
  private dragVertexIndex = -1;
  private dragZoneOffset: Point = { x: 0, y: 0 };
  private onZoneComplete: ((zone: ZoneConfig) => void) | null = null;

  constructor(config: CardConfig) {
    this.config = config;
    this.zones = config.zones.map(z => ({ ...z, occupied: false, selectedVertexIndex: null, dragging: false }));
  }

  private get _sensorPosition() {
    return this.config.sensor_position ?? 'bottom';
  }

  updateConfig(config: CardConfig): void {
    this.config = config;
    const existingMap = new Map(this.zones.map(z => [z.id, z]));
    this.zones = config.zones.map(z => {
      const existing = existingMap.get(z.id);
      return {
        ...z,
        occupied: existing?.occupied ?? false,
        selectedVertexIndex: existing?.selectedVertexIndex ?? null,
        dragging: false,
      };
    });
  }

  setOnZoneComplete(fn: (zone: ZoneConfig) => void): void {
    this.onZoneComplete = fn;
  }

  getZones(): ZoneState[] {
    return this.zones;
  }

  getZoneConfigs(): ZoneConfig[] {
    return this.zones.map(({ occupied: _o, selectedVertexIndex: _s, dragging: _d, dragStartOffset: _ds, ...rest }) => rest);
  }

  isInDrawingMode(): boolean {
    return this.isDrawing;
  }

  getDrawingVertices(): Point[] {
    return this.drawingVertices;
  }

  startDrawing(): void {
    this.isDrawing = true;
    this.drawingVertices = [];
    this.selectedZoneId = null;
  }

  cancelDrawing(): void {
    this.isDrawing = false;
    this.drawingVertices = [];
  }

  /**
   * Handle a click on the canvas while in drawing mode.
   * Returns true if the polygon was closed.
   */
  handleDrawClick(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);

    if (this.drawingVertices.length >= 3) {
      // Check if clicking near the first vertex to close
      const firstPx = mmToCanvas(
        this.drawingVertices[0].x,
        this.drawingVertices[0].y,
        canvasWidth,
        canvasHeight,
        this.config.max_range,
        SENSOR_MARGIN,
        this._sensorPosition
      );
      if (distance({ x: canvasX, y: canvasY }, firstPx) < VERTEX_RADIUS + 4) {
        this._closePolygon();
        return true;
      }
    }

    this.drawingVertices.push(mm);
    return false;
  }

  /**
   * Finish drawing (called on Enter key or first-vertex click).
   */
  finishDrawing(): boolean {
    if (this.drawingVertices.length >= 3) {
      this._closePolygon();
      return true;
    }
    return false;
  }

  private _closePolygon(): void {
    this.isDrawing = false;
    // Caller will show naming dialog
    if (this.onZoneComplete) {
      this.onZoneComplete({
        id: `zone_${Date.now()}`,
        name: 'Zone',
        color: '#a78bfa',
        vertices: [...this.drawingVertices],
      });
    }
    this.drawingVertices = [];
  }

  /**
   * Add a completed zone to the collection.
   */
  addZone(zone: ZoneConfig): void {
    this.zones.push({
      ...zone,
      occupied: false,
      selectedVertexIndex: null,
      dragging: false,
    });
  }

  updateZoneName(zoneId: string, name: string): void {
    const zone = this.zones.find(z => z.id === zoneId);
    if (zone) zone.name = name;
  }

  deleteZone(zoneId: string): void {
    const idx = this.zones.findIndex(z => z.id === zoneId);
    if (idx >= 0) this.zones.splice(idx, 1);
    if (this.selectedZoneId === zoneId) this.selectedZoneId = null;
  }

  getSelectedZoneId(): string | null {
    return this.selectedZoneId;
  }

  /**
   * Handle mouse down in select mode.
   * Returns true if the event was consumed.
   */
  onMouseDown(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    // Check if clicking a vertex of the selected zone
    if (this.selectedZoneId) {
      const zone = this.zones.find(z => z.id === this.selectedZoneId);
      if (zone) {
        for (let i = 0; i < zone.vertices.length; i++) {
          const vPx = mmToCanvas(
            zone.vertices[i].x,
            zone.vertices[i].y,
            canvasWidth,
            canvasHeight,
            this.config.max_range,
            SENSOR_MARGIN,
            this._sensorPosition
          );
          if (distance({ x: canvasX, y: canvasY }, vPx) < VERTEX_RADIUS + 4) {
            this.draggingVertex = true;
            this.dragVertexIndex = i;
            return true;
          }
        }
      }
    }

    // Check if clicking inside any zone
    for (let idx = this.zones.length - 1; idx >= 0; idx--) {
      const zone = this.zones[idx];
      if (zone.vertices.length < 3) continue;
      const mmPos = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
      if (pointInPolygon(mmPos, zone.vertices)) {
        this.selectedZoneId = zone.id;
        const centroid = polygonCentroid(zone.vertices);
        this.dragZoneOffset = {
          x: mmPos.x - centroid.x,
          y: mmPos.y - centroid.y,
        };
        this.draggingZone = true;
        return true;
      }
    }

    this.selectedZoneId = null;
    return false;
  }

  onMouseMove(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this.selectedZoneId) return;
    const zone = this.zones.find(z => z.id === this.selectedZoneId);
    if (!zone) return;
    const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);

    if (this.draggingVertex && this.dragVertexIndex >= 0) {
      zone.vertices[this.dragVertexIndex] = mm;
    } else if (this.draggingZone) {
      const centroid = polygonCentroid(zone.vertices);
      const targetCentroid = { x: mm.x - this.dragZoneOffset.x, y: mm.y - this.dragZoneOffset.y };
      const dx = targetCentroid.x - centroid.x;
      const dy = targetCentroid.y - centroid.y;
      zone.vertices = translatePolygon(zone.vertices, dx, dy);
    }
  }

  onMouseUp(): void {
    this.draggingZone = false;
    this.draggingVertex = false;
    this.dragVertexIndex = -1;
  }

  /**
   * Handle double-click: add vertex to edge near click point.
   */
  onDoubleClick(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    for (const zone of this.zones) {
      const pts = zone.vertices.map(v =>
        mmToCanvas(v.x, v.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition)
      );
      for (let i = 0; i < pts.length; i++) {
        const next = (i + 1) % pts.length;
        const { t, dist } = closestPointOnSegment({ x: canvasX, y: canvasY }, pts[i], pts[next]);
        if (dist < EDGE_HIT_RADIUS && t > 0.05 && t < 0.95) {
          const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN, this._sensorPosition);
          zone.vertices.splice(next, 0, mm);
          return;
        }
      }
    }
  }

  /**
   * Update zone occupancy based on current target positions.
   */
  updateOccupancy(occupiedIds: Set<string>): void {
    for (const zone of this.zones) {
      zone.occupied = occupiedIds.has(zone.id);
    }
  }

  /**
   * Check if a canvas position is near the first vertex of the current drawing.
   */
  isNearFirstVertex(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    if (this.drawingVertices.length < 3) return false;
    const firstPx = mmToCanvas(
      this.drawingVertices[0].x,
      this.drawingVertices[0].y,
      canvasWidth,
      canvasHeight,
      this.config.max_range,
      SENSOR_MARGIN,
      this._sensorPosition
    );
    return distance({ x: canvasX, y: canvasY }, firstPx) < VERTEX_RADIUS + 4;
  }
}
