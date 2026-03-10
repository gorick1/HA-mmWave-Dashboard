// All TypeScript interfaces and types for the LD2450 Radar Card

export interface Point {
  x: number;
  y: number;
}

export interface TargetData {
  id: number;
  x: number;
  y: number;
  speed: number;
  active: boolean;
  lastSeen: number;
  trail: Point[];
  color: string;
  label: string;
}

export interface ZoneConfig {
  id: string;
  name: string;
  color: string;
  vertices: Point[];
  ha_entity?: string;
}

export interface ZoneState extends ZoneConfig {
  occupied: boolean;
  selectedVertexIndex: number | null;
  dragging: boolean;
  dragStartOffset?: Point;
}

export interface FurnitureConfig {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface FurnitureState extends FurnitureConfig {
  selected: boolean;
}

export interface TargetConfig {
  id: number;
  color: string;
  label: string;
}

export interface CardConfig {
  type: string;
  title?: string;
  device_name: string;
  max_range: number;
  fov_angle: number;
  show_grid: boolean;
  show_sweep: boolean;
  show_trails: boolean;
  trail_length: number;
  color_scheme?: 'dark' | 'light';
  targets: TargetConfig[];
  furniture: FurnitureConfig[];
  zones: ZoneConfig[];
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  connection: HassConnection;
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<void>;
  user: { name: string };
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HassConnection {
  subscribeMessage: (
    callback: (msg: unknown) => void,
    subscribeMessage: { type: string; entity_ids?: string[] }
  ) => Promise<() => void>;
}

export interface EntityStateChangedMessage {
  type: string;
  event?: {
    event_type: string;
    data: {
      entity_id: string;
      new_state: HassEntity | null;
      old_state: HassEntity | null;
    };
  };
  [key: string]: unknown;
}

export interface FurnitureTypeDefinition {
  id: string;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  icon: string;
  drawFn: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
}

export type EditMode = 'none' | 'select' | 'draw-zone' | 'add-furniture';

export interface DrawingState {
  mode: EditMode;
  zoneVertices: Point[];
  mousePos: Point | null;
  selectedFurnitureType: string | null;
  hoveredZoneVertex: { zoneId: string; vertexIndex: number } | null;
}

export interface HistoryEntry {
  furniture: FurnitureConfig[];
  zones: ZoneConfig[];
}
