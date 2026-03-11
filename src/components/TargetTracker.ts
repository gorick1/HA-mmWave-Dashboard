import type { TargetData, CardConfig, Point } from '../types/index.js';
import { pointInPolygon } from '../utils/geometry.js';

const INACTIVE_TIMEOUT_MS = 2000;
const TRAIL_CHANGE_THRESHOLD_MM = 20;

/**
 * TargetTracker manages live target state including trail buffers and
 * inactive detection.
 */
export class TargetTracker {
  private targets: Map<number, TargetData> = new Map();
  private config: CardConfig;

  constructor(config: CardConfig) {
    this.config = config;
    this._initTargets();
  }

  updateConfig(config: CardConfig): void {
    this.config = config;
    // Add any new target IDs
    for (const tc of config.targets) {
      if (!this.targets.has(tc.id)) {
        this.targets.set(tc.id, this._createTarget(tc.id, tc.color, tc.label));
      } else {
        const t = this.targets.get(tc.id)!;
        t.color = tc.color;
        t.label = tc.label;
      }
    }
  }

  private _initTargets(): void {
    for (const tc of this.config.targets) {
      this.targets.set(tc.id, this._createTarget(tc.id, tc.color, tc.label));
    }
  }

  private _createTarget(id: number, color: string, label: string): TargetData {
    return {
      id,
      x: 0,
      y: 0,
      speed: 0,
      active: false,
      lastSeen: 0,
      trail: [],
      color,
      label,
    };
  }

  /**
   * Update a target's axis value from a HA entity state change.
   * Returns true if the update caused a meaningful position change.
   */
  updateAxis(targetId: number, axis: 'x' | 'y' | 'speed', value: number | null): boolean {
    const target = this.targets.get(targetId);
    if (!target) return false;

    if (axis === 'x') target.x = value ?? 0;
    else if (axis === 'y') target.y = value ?? 0;
    else if (axis === 'speed') target.speed = value ?? 0;

    // A target is inactive only when both X and Y are exactly 0 (LD2450 convention).
    const isActive =
      !(target.x === 0 && target.y === 0) &&
      target.y >= 0;

    if (isActive) {
      const prevPos = target.trail.length > 0 ? target.trail[target.trail.length - 1] : null;
      const dist = prevPos
        ? Math.sqrt((target.x - prevPos.x) ** 2 + (target.y - prevPos.y) ** 2)
        : Infinity;

      target.active = true;
      target.lastSeen = Date.now();

      // Add to trail only if moved enough
      if (dist >= TRAIL_CHANGE_THRESHOLD_MM) {
        target.trail.push({ x: target.x, y: target.y });
        if (target.trail.length > this.config.trail_length) {
          target.trail.shift();
        }
      }
    }

    return true;
  }

  /**
   * Mark targets inactive if not seen for INACTIVE_TIMEOUT_MS.
   */
  tick(): void {
    const now = Date.now();
    for (const target of this.targets.values()) {
      if (target.active && now - target.lastSeen > INACTIVE_TIMEOUT_MS) {
        target.active = false;
        target.trail = [];
      }
    }
  }

  getTargets(): TargetData[] {
    return Array.from(this.targets.values());
  }

  /**
   * Check which zones are occupied by any active target.
   * Returns a Set of zone IDs that are occupied.
   */
  getOccupiedZones(
    zones: Array<{ id: string; vertices: Point[] }>
  ): Set<string> {
    const occupied = new Set<string>();
    const activeTargets = Array.from(this.targets.values()).filter(t => t.active);

    for (const zone of zones) {
      if (zone.vertices.length < 3) continue;
      for (const target of activeTargets) {
        if (pointInPolygon({ x: target.x, y: target.y }, zone.vertices)) {
          occupied.add(zone.id);
          break;
        }
      }
    }
    return occupied;
  }
}
