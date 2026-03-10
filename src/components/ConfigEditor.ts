import type { CardConfig, ZoneConfig, SensorPosition } from '../types/index.js';
import { FURNITURE_TYPES } from '../utils/furniture-shapes.js';

const POSITION_LABELS: Record<SensorPosition, string> = {
  'bottom': 'Bottom Wall',
  'top': 'Top Wall',
  'left': 'Left Wall',
  'right': 'Right Wall',
  'bottom-left': 'Bottom-Left Corner',
  'bottom-right': 'Bottom-Right Corner',
  'top-left': 'Top-Left Corner',
  'top-right': 'Top-Right Corner',
};

/**
 * Generate HA template sensor YAML for all zones.
 */
export function generateZoneYaml(config: CardConfig): string {
  if (config.zones.length === 0) {
    return '# No zones defined yet.';
  }
  const deviceName = config.device_name;
  const targetIds = config.targets.map(t => t.id);

  let yaml = 'template:\n  - binary_sensor:\n';

  for (const zone of config.zones) {
    const uniqueId = zone.id.replace(/[^a-z0-9_]/gi, '_');
    const zoneName = zone.name;
    yaml += `      - name: "Radar Zone ${zoneName}"\n`;
    yaml += `        unique_id: ${uniqueId}\n`;
    yaml += `        device_class: occupancy\n`;
    yaml += `        state: >\n`;

    // Emit set statements for each target X/Y
    for (const tid of targetIds) {
      yaml += `          {% set t${tid}x = states('sensor.${deviceName}_target_${tid}_x') | float(0) %}\n`;
      yaml += `          {% set t${tid}y = states('sensor.${deviceName}_target_${tid}_y') | float(0) %}\n`;
    }

    // Build PIP expression for each target
    const targetExprs = targetIds.map(tid => {
      return `(${_buildPIPJinja(zone, `t${tid}x`, `t${tid}y`)})`;
    });
    yaml += `          {{ ${targetExprs.join(' or ')} }}\n`;
    yaml += '\n';
  }

  return yaml.trimEnd();
}

/**
 * Build a Jinja2 point-in-polygon expression for a zone polygon.
 * Uses the ray-casting algorithm unrolled into explicit math.
 */
function _buildPIPJinja(zone: ZoneConfig, xVar: string, yVar: string): string {
  const poly = zone.vertices;
  const n = poly.length;
  if (n < 3) return 'false';

  const checks: string[] = [];
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    // Condition: (yi > py) != (yj > py) and px < (xj-xi)*(py-yi)/(yj-yi)+xi
    const cond1 = `((${yi} > ${yVar}) != (${yj} > ${yVar}))`;
    const cond2 = `(${xVar} < ((${xj} - ${xi}) * (${yVar} - ${yi}) / (${yj} - ${yi}) + ${xi}))`;
    checks.push(`(${cond1} and ${cond2})`);
  }

  // XOR chain — fold with exclusive-or semantics
  // Jinja2 doesn't have xor, so we compute the modulo 2 sum
  if (checks.length === 1) return checks[0];

  // Use a counter approach: sum all intersections, odd = inside
  return `(${checks.join(' | int(0) + ')} | int(0)) % 2 == 1`;
}

/**
 * ConfigEditor renders the settings panel HTML.
 */
export class ConfigEditor {
  private config: CardConfig;
  private onConfigChange: (patch: Partial<CardConfig>) => void;

  constructor(config: CardConfig, onConfigChange: (patch: Partial<CardConfig>) => void) {
    this.config = config;
    this.onConfigChange = onConfigChange;
  }

  updateConfig(config: CardConfig): void {
    this.config = config;
  }

  /**
   * Render the settings panel as an HTML string.
   */
  renderHTML(): string {
    const c = this.config;
    const isLight = c.color_scheme === 'light';
    const currentPos = c.sensor_position ?? 'bottom';
    const posOptions = Object.entries(POSITION_LABELS)
      .map(([value, label]) => `<option value="${value}" ${currentPos === value ? 'selected' : ''}>${label}</option>`)
      .join('');

    return `
      <div class="setting-group">
        <div class="setting-label">Sensor Position</div>
        <div class="setting-row">
          <label for="cfg-sensor-pos">Mounting Wall</label>
          <select id="cfg-sensor-pos" aria-label="Sensor mounting position">
            ${posOptions}
          </select>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">Detection</div>
        <div class="setting-row">
          <label for="cfg-max-range">Max Range</label>
          <input type="range" id="cfg-max-range" min="1000" max="8000" step="500"
            value="${c.max_range}" aria-label="Max range in mm">
          <span class="setting-value">${(c.max_range / 1000).toFixed(1)}m</span>
        </div>
        <div class="setting-row">
          <label for="cfg-fov">FOV Angle</label>
          <input type="range" id="cfg-fov" min="60" max="180" step="10"
            value="${c.fov_angle}" aria-label="Field of view angle in degrees">
          <span class="setting-value">${c.fov_angle}°</span>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">Display</div>
        <div class="setting-row">
          <label for="cfg-grid">Show Grid</label>
          <input type="checkbox" id="cfg-grid" ${c.show_grid ? 'checked' : ''} aria-label="Show grid">
        </div>
        <div class="setting-row">
          <label for="cfg-sweep">Show Sweep</label>
          <input type="checkbox" id="cfg-sweep" ${c.show_sweep ? 'checked' : ''} aria-label="Show radar sweep">
        </div>
        <div class="setting-row">
          <label for="cfg-trails">Show Trails</label>
          <input type="checkbox" id="cfg-trails" ${c.show_trails ? 'checked' : ''} aria-label="Show motion trails">
        </div>
        <div class="setting-row">
          <label for="cfg-trail-len">Trail Length</label>
          <input type="range" id="cfg-trail-len" min="2" max="30" step="1"
            value="${c.trail_length}" aria-label="Trail length">
          <span class="setting-value">${c.trail_length}</span>
        </div>
        <div class="setting-row">
          <label for="cfg-light-mode">Light Mode</label>
          <input type="checkbox" id="cfg-light-mode" ${isLight ? 'checked' : ''} aria-label="Enable light color scheme">
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">Targets</div>
        ${c.targets.map(t => `
          <div class="setting-row">
            <label>${t.label || `Target ${t.id}`}</label>
            <input type="color" data-target-id="${t.id}" value="${t.color}"
              aria-label="Color for ${t.label || `Target ${t.id}`}">
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Attach event listeners to the settings panel DOM.
   */
  attachListeners(container: Element): void {
    const get = (id: string) => container.querySelector(`#${id}`);

    const sensorPos = get('cfg-sensor-pos') as HTMLSelectElement | null;
    const rangeMax = get('cfg-max-range') as HTMLInputElement | null;
    const rangeFov = get('cfg-fov') as HTMLInputElement | null;
    const checkGrid = get('cfg-grid') as HTMLInputElement | null;
    const checkSweep = get('cfg-sweep') as HTMLInputElement | null;
    const checkTrails = get('cfg-trails') as HTMLInputElement | null;
    const rangeTrail = get('cfg-trail-len') as HTMLInputElement | null;
    const checkLightMode = get('cfg-light-mode') as HTMLInputElement | null;

    sensorPos?.addEventListener('change', () => {
      this.onConfigChange({ sensor_position: sensorPos.value as SensorPosition });
    });

    rangeMax?.addEventListener('input', () => {
      const val = parseInt(rangeMax.value);
      this.onConfigChange({ max_range: val });
      const span = rangeMax.nextElementSibling as HTMLElement | null;
      if (span) span.textContent = `${(val / 1000).toFixed(1)}m`;
    });

    rangeFov?.addEventListener('input', () => {
      const val = parseInt(rangeFov.value);
      this.onConfigChange({ fov_angle: val });
      const span = rangeFov.nextElementSibling as HTMLElement | null;
      if (span) span.textContent = `${val}°`;
    });

    checkGrid?.addEventListener('change', () => {
      this.onConfigChange({ show_grid: checkGrid.checked });
    });

    checkSweep?.addEventListener('change', () => {
      this.onConfigChange({ show_sweep: checkSweep.checked });
    });

    checkTrails?.addEventListener('change', () => {
      this.onConfigChange({ show_trails: checkTrails.checked });
    });

    rangeTrail?.addEventListener('input', () => {
      const val = parseInt(rangeTrail.value);
      this.onConfigChange({ trail_length: val });
      const span = rangeTrail.nextElementSibling as HTMLElement | null;
      if (span) span.textContent = `${val}`;
    });

    checkLightMode?.addEventListener('change', () => {
      this.onConfigChange({ color_scheme: checkLightMode.checked ? 'light' : 'dark' });
    });

    container.querySelectorAll('input[data-target-id]').forEach(el => {
      const input = el as HTMLInputElement;
      input.addEventListener('input', () => {
        const id = parseInt(input.dataset['targetId'] ?? '0');
        const targets = this.config.targets.map(t =>
          t.id === id ? { ...t, color: input.value } : t
        );
        this.onConfigChange({ targets });
      });
    });
  }

  /**
   * Generate the furniture types picker HTML.
   */
  renderFurniturePicker(selectedType: string | null): string {
    return `<div class="furniture-picker">
      ${FURNITURE_TYPES.map(f => `
        <button class="furniture-btn ${selectedType === f.id ? 'selected' : ''}"
          data-furniture-type="${f.id}"
          aria-label="${f.label}"
          title="${f.label}">
          <span class="furniture-btn-icon">${f.icon}</span>
          <span class="furniture-btn-label">${f.label}</span>
        </button>
      `).join('')}
    </div>`;
  }
}
