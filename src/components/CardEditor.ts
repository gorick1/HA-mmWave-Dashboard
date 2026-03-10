import type { CardConfig, HomeAssistant, SensorPosition } from '../types/index.js';

/**
 * LD2450 Radar Card Editor
 *
 * Implements the Lovelace card editor interface so Home Assistant shows a
 * visual configuration panel (with an entity picker for device selection)
 * instead of the raw YAML editor when the card is added or edited via the UI.
 *
 * HA calls:
 *   • setConfig(config)  — receives current card config
 *   • set hass(hass)     — receives the HA instance (needed for entity lists)
 *
 * The editor fires a `config-changed` CustomEvent (bubbling, composed) whenever
 * the user changes a field. HA reads `event.detail.config` and updates the card.
 */

const SENSOR_POSITIONS: Array<{ value: SensorPosition; label: string; icon: string }> = [
  { value: 'bottom',       label: 'Bottom Wall',     icon: '⬇' },
  { value: 'top',          label: 'Top Wall',        icon: '⬆' },
  { value: 'left',         label: 'Left Wall',       icon: '⬅' },
  { value: 'right',        label: 'Right Wall',      icon: '➡' },
  { value: 'bottom-left',  label: 'Bottom-Left',     icon: '↙' },
  { value: 'bottom-right', label: 'Bottom-Right',    icon: '↘' },
  { value: 'top-left',     label: 'Top-Left',        icon: '↖' },
  { value: 'top-right',    label: 'Top-Right',       icon: '↗' },
];

const EDITOR_STYLES = `
  :host {
    display: block;
  }
  .editor-row {
    display: flex;
    flex-direction: column;
    margin-bottom: 16px;
  }
  .editor-row label {
    font-size: 12px;
    font-weight: 500;
    color: var(--secondary-text-color, #888);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .editor-row input[type="text"],
  .editor-row input[type="number"],
  .editor-row select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 6px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #212121);
    font-size: 14px;
    box-sizing: border-box;
  }
  .editor-row input[type="text"]:focus,
  .editor-row input[type="number"]:focus,
  .editor-row select:focus {
    outline: none;
    border-color: var(--primary-color, #3b82f6);
  }
  .row-inline {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .row-inline label {
    flex: 1;
    font-size: 14px;
    color: var(--primary-text-color, #212121);
    margin-bottom: 0;
    text-transform: none;
    letter-spacing: 0;
  }
  input[type="range"] {
    flex: 1;
    accent-color: var(--primary-color, #3b82f6);
  }
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--primary-color, #3b82f6);
    cursor: pointer;
  }
  .range-value {
    min-width: 40px;
    text-align: right;
    font-size: 13px;
    color: var(--secondary-text-color, #888);
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-color, #3b82f6);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 20px 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }
  .hint {
    font-size: 11px;
    color: var(--secondary-text-color, #888);
    margin-top: 4px;
  }
  .entity-picker-wrapper {
    min-height: 36px;
  }
  ha-entity-picker {
    display: block;
    width: 100%;
  }
  .wall-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 40px);
    gap: 4px;
    max-width: 200px;
    margin: 8px 0;
  }
  .wall-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 6px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #212121);
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .wall-btn:hover {
    background: var(--primary-color, #3b82f6);
    color: #fff;
    border-color: var(--primary-color, #3b82f6);
  }
  .wall-btn.selected {
    background: var(--primary-color, #3b82f6);
    color: #fff;
    border-color: var(--primary-color, #3b82f6);
    font-weight: 600;
  }
  .wall-btn.wall-center {
    background: var(--secondary-background-color, #f0f0f0);
    cursor: default;
    font-size: 10px;
    color: var(--secondary-text-color, #888);
  }
  .wall-btn.wall-center:hover {
    background: var(--secondary-background-color, #f0f0f0);
    color: var(--secondary-text-color, #888);
    border-color: var(--divider-color, #e0e0e0);
  }
`;

export class LD2450RadarCardEditor extends HTMLElement {
  private _config: Partial<CardConfig> = {};
  private _hass: HomeAssistant | null = null;
  private _shadow: ShadowRoot;
  /** Tracks the entity chosen for auto-fill (stored separately so the picker retains its selection) */
  private _pickedEntity = '';

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  setConfig(config: Partial<CardConfig>): void {
    this._config = { ...config };
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._render();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Dispatch a config-changed event so HA updates the live card preview. */
  private _fireConfigChanged(patch: Partial<CardConfig>): void {
    this._config = { ...this._config, ...patch };
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Try to extract the device_name prefix from a selected entity ID.
   * Expected pattern: sensor.<device_name>_target_<n>_<x|y|speed|resolution>
   * Non-greedy (.+?) ensures we stop at the first _target_N_axis suffix,
   * which is the correct device name boundary for well-formed LD2450 entities.
   */
  private _extractDeviceName(entityId: string): string | null {
    const match = entityId.match(/^sensor\.(.+?)_target_\d+_(?:x|y|speed|resolution)$/);
    return match ? match[1] : null;
  }

  private _render(): void {
    const c = this._config;
    const currentPos = c.sensor_position ?? 'bottom';

    // Wall grid mapping: [row][col] → SensorPosition | null
    const wallGrid: Array<SensorPosition | null> = [
      'top-left',    'top',    'top-right',
      'left',        null,     'right',
      'bottom-left', 'bottom', 'bottom-right',
    ];

    const wallGridHTML = wallGrid.map((pos) => {
      if (pos === null) {
        return `<div class="wall-btn wall-center">Room</div>`;
      }
      const info = SENSOR_POSITIONS.find(p => p.value === pos);
      return `<button class="wall-btn ${currentPos === pos ? 'selected' : ''}"
        data-wall-pos="${pos}" title="${info?.label ?? pos}" aria-label="${info?.label ?? pos}">
        ${info?.icon ?? ''}
      </button>`;
    }).join('');

    this._shadow.innerHTML = `
      <style>${EDITOR_STYLES}</style>

      <div class="section-title">Device</div>

      <div class="editor-row">
        <label for="device-name">Device Name</label>
        <input
          type="text"
          id="device-name"
          placeholder="e.g. living_room_radar"
          value="${this._escapeAttr(c.device_name ?? '')}"
          aria-label="ESPHome device name prefix"
        >
        <div class="hint">
          Must match your ESPHome <code>name:</code> field exactly.
          Entities are resolved as
          <code>sensor.&lt;device_name&gt;_target_1_x</code>, etc.
        </div>
      </div>

      <div class="editor-row">
        <label>Auto-detect from entity</label>
        <div class="entity-picker-wrapper" id="entity-picker-mount"></div>
        <div class="hint">
          Select any <em>Target X / Y / Speed</em> sensor from your LD2450
          device to auto-fill the Device Name above.
        </div>
      </div>

      <div class="section-title">Sensor Mounting</div>

      <div class="editor-row">
        <label>Sensor Position</label>
        <div class="hint" style="margin-top:0;margin-bottom:6px">
          Click where the sensor is mounted on the wall. Corner positions are for sensors in room corners.
        </div>
        <div class="wall-grid" id="wall-grid">
          ${wallGridHTML}
        </div>
      </div>

      <div class="section-title">General</div>

      <div class="editor-row">
        <label for="title">Card Title</label>
        <input
          type="text"
          id="title"
          placeholder="LD2450 Radar"
          value="${this._escapeAttr(c.title ?? '')}"
          aria-label="Card title"
        >
      </div>

      <div class="section-title">Detection</div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="max-range">Max Range</label>
          <input type="range" id="max-range" min="1000" max="8000" step="500"
            value="${c.max_range ?? 6000}" aria-label="Max range in mm">
          <span class="range-value" id="max-range-val">${((c.max_range ?? 6000) / 1000).toFixed(1)}m</span>
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="fov-angle">FOV Angle</label>
          <input type="range" id="fov-angle" min="60" max="180" step="10"
            value="${c.fov_angle ?? 120}" aria-label="Field of view in degrees">
          <span class="range-value" id="fov-angle-val">${c.fov_angle ?? 120}°</span>
        </div>
      </div>

      <div class="section-title">Display</div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="show-grid">Show Grid</label>
          <input type="checkbox" id="show-grid" ${(c.show_grid ?? true) ? 'checked' : ''}
            aria-label="Show polar grid">
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="show-sweep">Show Sweep</label>
          <input type="checkbox" id="show-sweep" ${(c.show_sweep ?? true) ? 'checked' : ''}
            aria-label="Show radar sweep animation">
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="show-trails">Show Trails</label>
          <input type="checkbox" id="show-trails" ${(c.show_trails ?? true) ? 'checked' : ''}
            aria-label="Show motion trails">
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="trail-length">Trail Length</label>
          <input type="range" id="trail-length" min="2" max="30" step="1"
            value="${c.trail_length ?? 12}" aria-label="Trail length">
          <span class="range-value" id="trail-length-val">${c.trail_length ?? 12}</span>
        </div>
      </div>
    `;

    this._mountEntityPicker();
    this._attachListeners();
  }

  /**
   * Programmatically create an <ha-entity-picker> and mount it inside the
   * shadow DOM. We must use JS property assignment (not HTML attributes)
   * because `hass` is a JavaScript object property, not a serialisable attribute.
   */
  private _mountEntityPicker(): void {
    const mount = this._shadow.getElementById('entity-picker-mount');
    if (!mount || !this._hass) return;

    // ha-entity-picker is registered by HA frontend at runtime
    const picker = document.createElement('ha-entity-picker') as HTMLElement & {
      hass: HomeAssistant;
      value: string;
      label: string;
      includeDomains: string[];
      allowCustomValue: boolean;
    };

    picker.hass = this._hass;
    picker.value = this._pickedEntity;
    picker.label = 'Pick a target sensor';
    picker.includeDomains = ['sensor'];
    picker.allowCustomValue = false;

    picker.addEventListener('value-changed', (evt: Event) => {
      const entityId: string = (evt as CustomEvent<{ value: string }>).detail.value ?? '';
      this._pickedEntity = entityId;
      const detected = this._extractDeviceName(entityId);
      if (detected) {
        this._fireConfigChanged({ device_name: detected });
        // Sync the text input to show the auto-filled value
        const input = this._shadow.getElementById('device-name') as HTMLInputElement | null;
        if (input) input.value = detected;
      }
    });

    mount.appendChild(picker);
  }

  private _attachListeners(): void {
    const shadow = this._shadow;

    const deviceNameInput = shadow.getElementById('device-name') as HTMLInputElement | null;
    deviceNameInput?.addEventListener('change', () => {
      this._fireConfigChanged({ device_name: deviceNameInput.value.trim() });
    });

    const titleInput = shadow.getElementById('title') as HTMLInputElement | null;
    titleInput?.addEventListener('change', () => {
      this._fireConfigChanged({ title: titleInput.value });
    });

    const maxRange = shadow.getElementById('max-range') as HTMLInputElement | null;
    const maxRangeVal = shadow.getElementById('max-range-val');
    maxRange?.addEventListener('input', () => {
      const val = parseInt(maxRange.value, 10);
      if (maxRangeVal) maxRangeVal.textContent = `${(val / 1000).toFixed(1)}m`;
      this._fireConfigChanged({ max_range: val });
    });

    const fovAngle = shadow.getElementById('fov-angle') as HTMLInputElement | null;
    const fovAngleVal = shadow.getElementById('fov-angle-val');
    fovAngle?.addEventListener('input', () => {
      const val = parseInt(fovAngle.value, 10);
      if (fovAngleVal) fovAngleVal.textContent = `${val}°`;
      this._fireConfigChanged({ fov_angle: val });
    });

    const showGrid = shadow.getElementById('show-grid') as HTMLInputElement | null;
    showGrid?.addEventListener('change', () => {
      this._fireConfigChanged({ show_grid: showGrid.checked });
    });

    const showSweep = shadow.getElementById('show-sweep') as HTMLInputElement | null;
    showSweep?.addEventListener('change', () => {
      this._fireConfigChanged({ show_sweep: showSweep.checked });
    });

    const showTrails = shadow.getElementById('show-trails') as HTMLInputElement | null;
    showTrails?.addEventListener('change', () => {
      this._fireConfigChanged({ show_trails: showTrails.checked });
    });

    const trailLength = shadow.getElementById('trail-length') as HTMLInputElement | null;
    const trailLengthVal = shadow.getElementById('trail-length-val');
    trailLength?.addEventListener('input', () => {
      const val = parseInt(trailLength.value, 10);
      if (trailLengthVal) trailLengthVal.textContent = `${val}`;
      this._fireConfigChanged({ trail_length: val });
    });

    // Wall position buttons
    shadow.querySelectorAll('[data-wall-pos]').forEach(el => {
      el.addEventListener('click', () => {
        const pos = (el as HTMLElement).dataset['wallPos'] as SensorPosition;
        this._fireConfigChanged({ sensor_position: pos });
        this._render(); // re-render to update selected state
      });
    });
  }

  private _escapeAttr(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
