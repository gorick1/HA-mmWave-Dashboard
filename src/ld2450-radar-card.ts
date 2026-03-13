import type {
  CardConfig,
  HomeAssistant,
  EditMode,
  ZoneConfig,
  FurnitureConfig,
  HistoryEntry,
  Point,
} from './types/index.js';
import { RadarCanvas } from './components/RadarCanvas.js';
import { TargetTracker } from './components/TargetTracker.js';
import { FurnitureLayer } from './components/FurnitureLayer.js';
import { ZoneEditor } from './components/ZoneEditor.js';
import { ConfigEditor } from './components/ConfigEditor.js';
import { LD2450RadarCardEditor } from './components/CardEditor.js';
import { buildEntityIds, subscribeEntities } from './utils/ha-websocket.js';
import { canvasToMm } from './utils/geometry.js';
// @ts-expect-error CSS import via rollup-plugin-string
import cardCss from './styles/card.css';

const SENSOR_MARGIN = 40;

const DEFAULT_CONFIG: CardConfig = {
  type: 'custom:ld2450-radar-card',
  title: 'LD2450 Radar',
  device_name: 'radar',
  max_range: 6000,
  fov_angle: 120,
  show_grid: true,
  show_sweep: true,
  show_trails: true,
  trail_length: 12,
  sensor_position: 'bottom',
  targets: [
    { id: 1, color: '#38bdf8', label: 'T1' },
    { id: 2, color: '#f472b6', label: 'T2' },
    { id: 3, color: '#34d399', label: 'T3' },
  ],
  furniture: [],
  zones: [],
};

/**
 * LD2450 Radar Card — Custom Lovelace Card for Home Assistant.
 */
class LD2450RadarCard extends HTMLElement {
  private _config: CardConfig = DEFAULT_CONFIG;
  private _hass: HomeAssistant | null = null;
  private _shadow: ShadowRoot;
  private _radarCanvas: RadarCanvas | null = null;
  private _tracker: TargetTracker | null = null;
  private _furnitureLayer: FurnitureLayer | null = null;
  private _zoneEditor: ZoneEditor | null = null;
  private _configEditor: ConfigEditor | null = null;
  private _unsubscribes: Array<() => void> = [];
  private _rafId: number | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _editMode: EditMode = 'none';
  private _showSettings = false;
  private _selectedFurnitureType: string | null = null;
  private _isEditMode = false;
  private _history: HistoryEntry[] = [];
  private _historyIndex = -1;
  private _zoneNamePending: ZoneConfig | null = null;
  private _tickInterval: ReturnType<typeof setInterval> | null = null;
  private _dragPlacingId: string | null = null;
  private _dragPlaceStartMm: Point | null = null;
  // Current canvas-coordinate mouse position while in draw-zone mode (for preview line)
  private _drawMousePos: Point | null = null;
  // Index of the hovered drawing vertex (0 = first vertex, for close-polygon indicator)
  private _drawHoveredVertex: number | null = null;
  // Debounce timer for localStorage writes
  private _persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  // Called by HA to set the card config
  setConfig(config: Partial<CardConfig>): void {
    this._config = { ...DEFAULT_CONFIG, ...config };
    // Ensure arrays have defaults
    if (!this._config.targets || !this._config.targets.length) {
      this._config.targets = DEFAULT_CONFIG.targets;
    }
    if (!this._config.furniture) this._config.furniture = [];
    if (!this._config.zones) this._config.zones = [];

    // Restore persisted state (zones, furniture, settings) from localStorage
    const stored = this._loadPersistedConfig();
    if (stored) {
      if (stored.zones && stored.zones.length) this._config.zones = stored.zones;
      if (stored.furniture && stored.furniture.length) this._config.furniture = stored.furniture;
      if (stored.color_scheme !== undefined) this._config.color_scheme = stored.color_scheme;
      if (stored.sensor_position !== undefined) this._config.sensor_position = stored.sensor_position;
      if (stored.max_range !== undefined) this._config.max_range = stored.max_range;
      if (stored.fov_angle !== undefined) this._config.fov_angle = stored.fov_angle;
      if (stored.show_grid !== undefined) this._config.show_grid = stored.show_grid;
      if (stored.show_sweep !== undefined) this._config.show_sweep = stored.show_sweep;
      if (stored.show_trails !== undefined) this._config.show_trails = stored.show_trails;
      if (stored.trail_length !== undefined) this._config.trail_length = stored.trail_length;
    }

    this._applyColorScheme();
    this._init();
  }

  set hass(hass: HomeAssistant) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet && this._unsubscribes.length === 0) {
      void this._subscribeEntities();
    }
    // Always read entity states from hass.states so the card stays in sync.
    // HA calls set hass() whenever any entity changes; we check whether
    // our radar entities actually changed before marking dirty.
    if (this._tracker) {
      this._updateFromHassStates(hass);
    }
  }

  connectedCallback(): void {
    this._startRenderLoop();
  }

  disconnectedCallback(): void {
    this._stopRenderLoop();
    this._unsubAll();
    this._resizeObserver?.disconnect();
    if (this._tickInterval !== null) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this._radarCanvas?.stopAnimation();
  }

  private _applyColorScheme(): void {
    if (this._config.color_scheme === 'light') {
      this.classList.add('light-scheme');
    } else {
      this.classList.remove('light-scheme');
    }
  }

  private _toggleColorScheme(): void {
    const next: 'dark' | 'light' = this._config.color_scheme === 'light' ? 'dark' : 'light';
    this._config = { ...this._config, color_scheme: next };
    this._applyColorScheme();
    this._radarCanvas?.updateConfig(this._config);
    this._radarCanvas?.markDirty();
    this._persistConfig();
    this._renderDOM();
    this._setupCanvas();
  }

  private _init(): void {
    this._tracker = new TargetTracker(this._config);
    this._furnitureLayer = new FurnitureLayer(this._config);
    this._zoneEditor = new ZoneEditor(this._config);
    this._configEditor = new ConfigEditor(this._config, this._onConfigPatch.bind(this));

    this._zoneEditor.setOnZoneComplete((zone) => {
      this._zoneNamePending = zone;
      this._renderDOM();
      this._setupCanvas();
    });

    this._renderDOM();
    this._setupCanvas();

    // Tick for inactive target detection
    if (this._tickInterval !== null) clearInterval(this._tickInterval);
    this._tickInterval = setInterval(() => {
      this._tracker?.tick();
    }, 500);
  }

  private _renderDOM(): void {
    this._shadow.innerHTML = `
      <style>${cardCss}</style>
      <div class="card-container">
        ${this._renderHeader()}
        <div class="card-body">
          <div class="canvas-wrap" id="canvas-wrap">
            <canvas id="radar-canvas" aria-label="Radar visualization"></canvas>
            <div class="tooltip" id="coord-tooltip" style="display:none"></div>
            ${this._zoneNamePending ? this._renderZoneNameDialog() : ''}
            ${this._showSettings ? this._renderSettingsPanel() : ''}
          </div>
          ${this._renderStatusBar()}
        </div>
        ${this._isEditMode ? this._renderEditToolbar() : ''}
      </div>
    `;
    this._applyColorScheme();
    this._attachEventListeners();
  }

  private _renderHeader(): string {
    return `
      <div class="card-header">
        <div class="card-title">${this._config.title ?? 'LD2450 Radar'}</div>
        <div class="header-actions">
          <button class="icon-btn ${this._isEditMode ? 'active' : ''}" id="btn-edit" aria-label="Toggle edit mode"
            title="Edit layout">
            ✏️
          </button>
          <button class="icon-btn ${this._showSettings ? 'active' : ''}" id="btn-settings" aria-label="Open settings"
            title="Settings">
            ⚙️
          </button>
        </div>
      </div>
    `;
  }

  private _renderEditToolbar(): string {
    const modes: Array<{ id: EditMode; label: string; icon: string }> = [
      { id: 'select', label: 'Select', icon: '↖️' },
      { id: 'draw-zone', label: 'Zone', icon: '📐' },
      { id: 'add-furniture', label: 'Furniture', icon: '🛋️' },
    ];
    return `
      <div class="edit-toolbar">
        <div class="toolbar-group">
          ${modes.map(m => `
            <button class="icon-btn ${this._editMode === m.id ? 'active' : ''}"
              data-mode="${m.id}" aria-label="${m.label}">
              ${m.icon} ${m.label}
            </button>
          `).join('')}
        </div>
        <div class="toolbar-separator"></div>
        <div class="toolbar-group">
          <button class="icon-btn" id="btn-delete" aria-label="Delete selected" title="Delete selected zone or furniture">🗑️ Delete</button>
        </div>
        <div class="toolbar-separator"></div>
        <div class="toolbar-group">
          <button class="icon-btn" id="btn-undo" aria-label="Undo" ${this._historyIndex <= 0 ? 'disabled' : ''}>↩</button>
          <button class="icon-btn" id="btn-redo" aria-label="Redo" ${this._historyIndex >= this._history.length - 1 ? 'disabled' : ''}>↪</button>
        </div>
        <div class="toolbar-separator"></div>
        <div class="toolbar-group">
          <button class="icon-btn" id="btn-save" aria-label="Save">💾 Save</button>
        </div>
      </div>
      ${this._editMode === 'add-furniture' ? (this._configEditor?.renderFurniturePicker(this._selectedFurnitureType) ?? '') : ''}
    `;
  }

  private _renderStatusBar(): string {
    const zones = this._zoneEditor?.getZones() ?? [];
    const targets = this._tracker?.getTargets() ?? [];
    const activeTargets = targets.filter(t => t.active);

    return `
      <div class="status-bar" id="status-bar">
        ${activeTargets.map(t => `
          <div class="status-chip active" data-target-id="${t.id}">
            <span class="chip-dot" style="background:${t.color}"></span>
            <span class="chip-label">${t.label || `T${t.id}`}</span>
            <span class="chip-badge">${t.x.toFixed(0)}, ${t.y.toFixed(0)}</span>
          </div>
        `).join('')}
        ${zones.map(z => `
          <div class="status-chip ${z.occupied ? 'active' : ''}" data-zone-id="${z.id}">
            <span class="chip-dot" style="background:${z.color}"></span>
            <span class="chip-label">${z.name}</span>
            <span class="chip-badge">${z.targetCount > 0 ? `${z.targetCount} ${z.targetCount === 1 ? 'person' : 'people'}` : 'Clear'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private _renderSettingsPanel(): string {
    return `
      <div class="settings-overlay open" id="settings-panel">
        <div class="settings-header">
          <span>Settings</span>
          <button class="icon-btn" id="btn-close-settings" aria-label="Close settings">✕</button>
        </div>
        <div class="settings-body" id="settings-body">
          ${this._configEditor?.renderHTML() ?? ''}
        </div>
      </div>
    `;
  }

  private _renderZoneNameDialog(): string {
    return `
      <div class="zone-name-dialog" id="zone-name-dialog" role="dialog" aria-modal="true" aria-label="Name this zone">
        <h3>Name this zone</h3>
        <input type="text" class="zone-name-input" id="zone-name-input"
          value="Zone ${(this._zoneEditor?.getZones().length ?? 0) + 1}"
          placeholder="Zone name"
          aria-label="Zone name">
        <div class="dialog-actions">
          <button class="btn-secondary" id="btn-cancel-zone" aria-label="Cancel">Cancel</button>
          <button class="btn-primary" id="btn-confirm-zone" aria-label="Confirm zone name">Add Zone</button>
        </div>
      </div>
    `;
  }

  private _attachEventListeners(): void {
    const $ = (id: string) => this._shadow.getElementById(id);

    $('btn-edit')?.addEventListener('click', () => {
      this._isEditMode = !this._isEditMode;
      if (!this._isEditMode) this._editMode = 'none';
      this._renderDOM();
      this._setupCanvas();
    });

    $('btn-settings')?.addEventListener('click', () => {
      this._showSettings = !this._showSettings;
      this._renderDOM();
      this._setupCanvas();
      if (this._showSettings) {
        const settingsBody = this._shadow.getElementById('settings-body');
        if (settingsBody) this._configEditor?.attachListeners(settingsBody);
      }
    });

    $('btn-close-settings')?.addEventListener('click', () => {
      this._showSettings = false;
      this._renderDOM();
      this._setupCanvas();
    });

    $('btn-undo')?.addEventListener('click', () => this._undo());
    $('btn-redo')?.addEventListener('click', () => this._redo());
    $('btn-save')?.addEventListener('click', () => void this._save());

    $('btn-delete')?.addEventListener('click', () => {
      this._deleteSelected();
    });

    // Edit mode toolbar buttons
    this._shadow.querySelectorAll('[data-mode]').forEach(el => {
      el.addEventListener('click', () => {
        const mode = (el as HTMLElement).dataset['mode'] as EditMode;
        if (mode === 'draw-zone') {
          this._startDrawingMode();
        } else {
          this._editMode = mode;
          if (mode === 'add-furniture') this._selectedFurnitureType = null;
          this._renderDOM();
          this._setupCanvas();
        }
      });
    });

    // Furniture picker buttons
    this._shadow.querySelectorAll('[data-furniture-type]').forEach(el => {
      el.addEventListener('click', () => {
        this._selectedFurnitureType = (el as HTMLElement).dataset['furnitureType'] ?? null;
        this._renderDOM();
        this._setupCanvas();
      });
    });

    // Zone name dialog
    $('btn-confirm-zone')?.addEventListener('click', () => this._confirmZoneName());
    $('btn-cancel-zone')?.addEventListener('click', () => {
      this._zoneNamePending = null;
      this._renderDOM();
      this._setupCanvas();
    });
    const zoneInput = $('zone-name-input') as HTMLInputElement | null;
    zoneInput?.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') this._confirmZoneName();
    });
    zoneInput?.focus();
  }

  private _startDrawingMode(): void {
    this._editMode = 'draw-zone';
    this._isEditMode = true;
    this._zoneEditor?.startDrawing();
    this._renderDOM();
    this._setupCanvas();
  }

  private _confirmZoneName(): void {
    const input = this._shadow.getElementById('zone-name-input') as HTMLInputElement | null;
    const name = input?.value?.trim() || 'Zone';
    if (this._zoneNamePending) {
      const zone = { ...this._zoneNamePending, name };
      this._zoneEditor?.addZone(zone);
      this._zoneNamePending = null;
      this._config.zones = this._zoneEditor?.getZoneConfigs() ?? [];
      this._pushHistory();

      // Create the input_number helper immediately so it is available
      // for automations without requiring a separate Save click.
      // persistConfig is called inside the callback to include ha_entity.
      void this._ensureZoneHelper(zone).then(() => {
        // Sync the ha_entity back into the config zones array
        const cfgZone = this._config.zones.find(z => z.id === zone.id);
        if (cfgZone && zone.ha_entity) {
          cfgZone.ha_entity = zone.ha_entity;
        }
        this._persistConfig();
      });

      this._dispatchZoneChange(zone.id, false, 0);
    }
    this._editMode = 'select';
    this._renderDOM();
    this._setupCanvas();
  }

  private _setupCanvas(): void {
    const canvas = this._shadow.getElementById('radar-canvas') as HTMLCanvasElement | null;
    const wrap = this._shadow.getElementById('canvas-wrap') as HTMLElement | null;
    if (!canvas || !wrap) return;

    // Set canvas size to match wrapper
    const rect = wrap.getBoundingClientRect();
    const size = Math.max(rect.width || 300, 200);
    const height = Math.max(rect.height || 300, 200);
    canvas.width = size;
    canvas.height = height;

    if (!this._radarCanvas) {
      this._radarCanvas = new RadarCanvas(canvas, this._config);
      this._radarCanvas.startAnimation();
    } else {
      this._radarCanvas.resize(size, height);
      this._radarCanvas.updateConfig(this._config);
    }
    this._radarCanvas.markDirty();

    this._attachCanvasListeners(canvas);

    // Always reconnect the resize observer to the current wrapper element.
    // After _renderDOM() the old wrapper is replaced, so we must re-observe
    // the new one to keep canvas dimensions in sync with the displayed size.
    // The callback dynamically looks up the current wrap so the same observer
    // instance can be reused across DOM rebuilds.
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        const currentWrap = this._shadow.getElementById('canvas-wrap');
        if (currentWrap) {
          const r = currentWrap.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            this._radarCanvas?.resize(r.width, r.height);
          }
        }
      });
    }
    this._resizeObserver.disconnect();
    this._resizeObserver.observe(wrap);
  }

  private _attachCanvasListeners(canvas: HTMLCanvasElement): void {
    // Remove old listeners by cloning
    const newCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
    canvas.parentNode?.replaceChild(newCanvas, canvas);

    let mouseIsDown = false;

    newCanvas.addEventListener('mousemove', (e: MouseEvent) => {
      const pos = this._getCanvasPos(newCanvas, e);
      const tooltip = this._shadow.getElementById('coord-tooltip');

      if (this._editMode === 'draw-zone' && this._zoneEditor) {
        const hovered = this._zoneEditor.isNearFirstVertex(pos.x, pos.y, newCanvas.width, newCanvas.height);
        // Track mouse position and first-vertex hover so the preview line and
        // close-polygon indicator are rendered in the draw overlay.
        this._drawMousePos = pos;
        this._drawHoveredVertex = hovered ? 0 : null;
        this._radarCanvas?.markDirty();
      } else {
        this._drawMousePos = null;
        this._drawHoveredVertex = null;
      }

      if (mouseIsDown) {
        if (this._editMode === 'add-furniture' && this._dragPlacingId && this._dragPlaceStartMm) {
          // Update the dragged item's size and center based on current mouse position
          const mm = canvasToMm(pos.x, pos.y, newCanvas.width, newCanvas.height, this._config.max_range, SENSOR_MARGIN, this._config.sensor_position ?? 'bottom');
          const item = this._furnitureLayer?.getItems().find(i => i.id === this._dragPlacingId);
          if (item) {
            const w = Math.abs(mm.x - this._dragPlaceStartMm.x);
            const h = Math.abs(mm.y - this._dragPlaceStartMm.y);
            item.width = Math.max(100, w);
            item.height = Math.max(100, h);
            item.x = (mm.x + this._dragPlaceStartMm.x) / 2;
            item.y = (mm.y + this._dragPlaceStartMm.y) / 2;
            // Config array is synced on mouseup; just mark dirty for live preview
            this._radarCanvas?.markDirty();
          }
        } else if (this._editMode === 'select') {
          this._furnitureLayer?.onMouseMove(pos.x, pos.y, newCanvas.width, newCanvas.height);
          this._zoneEditor?.onMouseMove(pos.x, pos.y, newCanvas.width, newCanvas.height);
          this._radarCanvas?.markDirty();
        }
      }

      // Coordinate tooltip
      if (tooltip) {
        const mm = canvasToMm(pos.x, pos.y, newCanvas.width, newCanvas.height, this._config.max_range, SENSOR_MARGIN, this._config.sensor_position ?? 'bottom');
        tooltip.textContent = `x: ${mm.x.toFixed(0)}mm  y: ${mm.y.toFixed(0)}mm`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${pos.x + 12}px`;
        tooltip.style.top = `${pos.y - 20}px`;
      }
    });

    newCanvas.addEventListener('mouseleave', () => {
      const tooltip = this._shadow.getElementById('coord-tooltip');
      if (tooltip) tooltip.style.display = 'none';
      // Clear drawing preview when mouse leaves canvas
      this._drawMousePos = null;
      this._drawHoveredVertex = null;
      this._radarCanvas?.markDirty();
    });

    newCanvas.addEventListener('mousedown', (e: MouseEvent) => {
      mouseIsDown = true;
      const pos = this._getCanvasPos(newCanvas, e);

      if (this._editMode === 'draw-zone' && this._zoneEditor) {
        const closed = this._zoneEditor.handleDrawClick(pos.x, pos.y, newCanvas.width, newCanvas.height);
        if (closed) {
          // Zone name dialog will appear
        }
        this._radarCanvas?.markDirty();
      } else if (this._editMode === 'add-furniture' && this._selectedFurnitureType) {
        this._pushHistory();
        const placed = this._furnitureLayer?.placeAt(this._selectedFurnitureType, pos.x, pos.y, newCanvas.width, newCanvas.height);
        if (placed) {
          // Place at default size immediately; user can resize via handles in select mode
          this._dragPlacingId = null;
          this._dragPlaceStartMm = null;
          // Switch to select mode after placing and auto-select the new item
          this._editMode = 'select';
        }
        this._config.furniture = this._furnitureLayer?.getFurnitureConfigs() ?? [];
        this._persistConfig();
        this._radarCanvas?.markDirty();
        // Re-render toolbar to reflect mode change
        this._renderDOM();
        this._setupCanvas();
      } else if (this._editMode === 'select') {
        const consumed = this._furnitureLayer?.onMouseDown(pos.x, pos.y, newCanvas.width, newCanvas.height);
        if (!consumed) {
          this._zoneEditor?.onMouseDown(pos.x, pos.y, newCanvas.width, newCanvas.height);
        }
        this._radarCanvas?.markDirty();
      }
    });

    newCanvas.addEventListener('mouseup', () => {
      mouseIsDown = false;
      this._dragPlacingId = null;
      this._dragPlaceStartMm = null;
      this._furnitureLayer?.onMouseUp();
      this._zoneEditor?.onMouseUp();
      this._config.furniture = this._furnitureLayer?.getFurnitureConfigs() ?? [];
      this._config.zones = this._zoneEditor?.getZoneConfigs() ?? [];
      this._persistConfig();
    });

    newCanvas.addEventListener('dblclick', (e: MouseEvent) => {
      const pos = this._getCanvasPos(newCanvas, e);
      if (this._editMode === 'select' && this._zoneEditor) {
        this._zoneEditor.onDoubleClick(pos.x, pos.y, newCanvas.width, newCanvas.height);
        this._radarCanvas?.markDirty();
      }
    });

    newCanvas.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this._editMode === 'draw-zone') {
        const closed = this._zoneEditor?.finishDrawing();
        if (closed) this._radarCanvas?.markDirty();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this._editMode === 'select') {
        this._deleteSelected();
      }
    });
    newCanvas.setAttribute('tabindex', '0');

    // Swap radar canvas reference
    const ctx = newCanvas.getContext('2d');
    if (ctx && this._radarCanvas) {
      // reinit with new canvas element
      this._radarCanvas.stopAnimation();
      this._radarCanvas = new RadarCanvas(newCanvas, this._config);
      this._radarCanvas.startAnimation();
    }
  }

  private _getCanvasPos(canvas: HTMLCanvasElement, e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private _startRenderLoop(): void {
    const loop = () => {
      const canvas = this._shadow.querySelector('#radar-canvas') as HTMLCanvasElement | null;
      if (!canvas || !this._radarCanvas) {
        this._rafId = requestAnimationFrame(loop);
        return;
      }

      const targets = this._tracker?.getTargets() ?? [];
      const zones = this._zoneEditor?.getZones() ?? [];
      const furniture = this._furnitureLayer?.getItems() ?? [];

      // Update zone occupancy and target counts
      const zoneCounts = this._tracker?.getZoneTargetCounts(zones) ?? new Map<string, number>();
      this._zoneEditor?.updateOccupancy(zoneCounts);

      // Dispatch zone change events when occupancy or target count changes
      for (const zone of zones) {
        const newCount = zoneCounts.get(zone.id) ?? 0;
        const isNowOccupied = newCount > 0;
        const wasOccupied = zone.occupied;
        const prevCount = zone.targetCount ?? 0;
        if (wasOccupied !== isNowOccupied || prevCount !== newCount) {
          this._dispatchZoneChange(zone.id, isNowOccupied, newCount);
        }
      }

      const drawingState = {
        mode: this._editMode,
        zoneVertices: this._zoneEditor?.getDrawingVertices() ?? [],
        mousePos: this._drawMousePos,
        hoveredVertexIndex: this._drawHoveredVertex,
      };

      this._radarCanvas.render(targets, zones, furniture, drawingState, null);

      // Draw furniture layer with handles
      const ctx = canvas.getContext('2d');
      if (ctx && this._furnitureLayer) {
        this._furnitureLayer.drawHandles(ctx, canvas.width, canvas.height);
      }

      // Update sidebar periodically
      this._updateSidebarInPlace();

      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  private _updateSidebarInPlace(): void {
    // Update status bar chips without full re-render
    const targets = this._tracker?.getTargets() ?? [];
    const zones = this._zoneEditor?.getZones() ?? [];
    const statusBar = this._shadow.getElementById('status-bar');
    if (!statusBar) return;

    // Update active targets — if the set of active targets changed, we need
    // a full status bar rebuild; otherwise just patch badge text.
    const activeTargets = targets.filter(t => t.active);
    const chipTargetEls = statusBar.querySelectorAll('[data-target-id]');
    const needsRebuild = chipTargetEls.length !== activeTargets.length;

    if (needsRebuild) {
      // Rebuild status bar HTML in-place instead of full _renderDOM
      statusBar.innerHTML = `
        ${activeTargets.map(t => `
          <div class="status-chip active" data-target-id="${t.id}">
            <span class="chip-dot" style="background:${t.color}"></span>
            <span class="chip-label">${t.label || `T${t.id}`}</span>
            <span class="chip-badge">${t.x.toFixed(0)}, ${t.y.toFixed(0)}</span>
          </div>
        `).join('')}
        ${zones.map(z => `
          <div class="status-chip ${z.occupied ? 'active' : ''}" data-zone-id="${z.id}">
            <span class="chip-dot" style="background:${z.color}"></span>
            <span class="chip-label">${z.name}</span>
            <span class="chip-badge">${z.targetCount > 0 ? `${z.targetCount} ${z.targetCount === 1 ? 'person' : 'people'}` : 'Clear'}</span>
          </div>
        `).join('')}
      `;
      return;
    }

    // Patch existing target chips
    for (const t of activeTargets) {
      const chip = statusBar.querySelector(`[data-target-id="${t.id}"] .chip-badge`);
      if (chip) chip.textContent = `${t.x.toFixed(0)}, ${t.y.toFixed(0)}`;
    }

    // Patch existing zone chips
    for (const z of zones) {
      const chip = statusBar.querySelector(`[data-zone-id="${z.id}"]`);
      if (chip) {
        const badge = chip.querySelector('.chip-badge');
        if (badge) badge.textContent = z.targetCount > 0 ? `${z.targetCount} ${z.targetCount === 1 ? 'person' : 'people'}` : 'Clear';
        chip.className = `status-chip ${z.occupied ? 'active' : ''}`;
      }
    }
  }

  private _stopRenderLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private async _subscribeEntities(): Promise<void> {
    if (!this._hass) return;
    const entityMappings = buildEntityIds(
      this._config.device_name,
      this._config.targets.map(t => t.id)
    );
    const entityIds = entityMappings.map(m => m.entityId);

    try {
      this._unsubscribes = await subscribeEntities(
        this._hass,
        entityIds,
        (entityId, newState) => {
          const mapping = entityMappings.find(m => m.entityId === entityId);
          if (!mapping) return;
          const value = newState ? parseFloat(newState.state) : null;
          this._tracker?.updateAxis(mapping.targetId, mapping.axis, isNaN(value ?? NaN) ? null : value);
          this._radarCanvas?.markDirty();
        }
      );
    } catch (err) {
      console.warn('[LD2450RadarCard] Could not subscribe to entities:', err);
    }
  }

  private _updateFromHassStates(hass: HomeAssistant): void {
    const mappings = buildEntityIds(
      this._config.device_name,
      this._config.targets.map(t => t.id)
    );
    let changed = false;
    for (const m of mappings) {
      const entity = hass.states[m.entityId];
      if (!entity) continue;
      const raw = entity.state;
      if (raw === 'unavailable' || raw === 'unknown') continue;
      const val = parseFloat(raw);
      if (isNaN(val)) continue;
      // Only update and flag dirty when the value actually changed
      const target = this._tracker?.getTargets().find(t => t.id === m.targetId);
      if (target) {
        const current = m.axis === 'x' ? target.x : m.axis === 'y' ? target.y : target.speed;
        if (current !== val) {
          this._tracker?.updateAxis(m.targetId, m.axis, val);
          changed = true;
        }
      }
    }
    if (changed) {
      this._radarCanvas?.markDirty();
    }
  }

  private _unsubAll(): void {
    for (const unsub of this._unsubscribes) {
      try { unsub(); } catch (_e) { /* ignore */ }
    }
    this._unsubscribes = [];
  }

  private _onConfigPatch(patch: Partial<CardConfig>): void {
    this._config = { ...this._config, ...patch };
    this._applyColorScheme();
    this._radarCanvas?.updateConfig(this._config);
    this._tracker?.updateConfig(this._config);
    this._zoneEditor?.updateConfig(this._config);
    this._furnitureLayer?.updateConfig(this._config);
    this._configEditor?.updateConfig(this._config);
    this._radarCanvas?.markDirty();
    this._persistConfig();
  }

  private _pushHistory(): void {
    // Trim forward history
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push({
      furniture: JSON.parse(JSON.stringify(this._config.furniture)),
      zones: JSON.parse(JSON.stringify(this._config.zones)),
    });
    this._historyIndex = this._history.length - 1;
  }

  private _undo(): void {
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    this._applyHistory(this._history[this._historyIndex]);
  }

  private _redo(): void {
    if (this._historyIndex >= this._history.length - 1) return;
    this._historyIndex++;
    this._applyHistory(this._history[this._historyIndex]);
  }

  private _applyHistory(entry: HistoryEntry): void {
    this._config.furniture = entry.furniture;
    this._config.zones = entry.zones;
    this._furnitureLayer?.updateConfig(this._config);
    this._zoneEditor?.updateConfig(this._config);
    this._persistConfig();
    this._renderDOM();
    this._setupCanvas();
  }

  private async _save(): Promise<void> {
    if (!this._hass) return;

    // Create helpers for all zones, then persist config with stored entity IDs
    for (const zone of this._config.zones) {
      await this._ensureZoneHelper(zone);
    }

    // Persist config to localStorage (includes ha_entity references)
    this._persistConfig();

    console.info('[LD2450RadarCard] Configuration saved — zones persisted and input_number helpers are ready for automations');
  }

  /**
   * Slugify a string to match Home Assistant's slug generation.
   * Lowercases, replaces sequences of non-alphanumeric characters with a
   * single underscore, and strips leading/trailing underscores.  This mirrors
   * the Python ``slugify()`` used by HA so computed entity IDs match the ones
   * HA auto-generates when creating helpers.
   */
  private _slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Derive the input_number entity ID for a zone based on its name.
   * Uses the same name format passed to input_number/create so that
   * the computed entity ID matches the one HA auto-generates.
   *
   * E.g. device "living_room_radar", zone name "Kitchen"
   *   → name "Radar living_room_radar Zone Kitchen"
   *   → slug "radar_living_room_radar_zone_kitchen"
   *   → input_number.radar_living_room_radar_zone_kitchen
   */
  private _zoneEntityId(zoneName: string): string {
    const helperName = `Radar ${this._config.device_name} Zone ${zoneName}`;
    return `input_number.${this._slugify(helperName)}`;
  }

  /**
   * Build the helper display name for a zone.
   */
  private _zoneHelperName(zoneName: string): string {
    return `Radar ${this._config.device_name} Zone ${zoneName}`;
  }

  /**
   * Create an input_number helper for a zone if one does not already exist.
   * The helper tracks how many targets (0–3) are inside the zone.
   * Stores the resulting entity ID on zone.ha_entity so it can be used for
   * state updates and survives page reloads via localStorage.
   */
  private async _ensureZoneHelper(zone: ZoneConfig): Promise<void> {
    if (!this._hass) return;

    const entityId = this._zoneEntityId(zone.name);

    // If we already recorded the entity and it exists in HA, nothing to do
    if (zone.ha_entity && this._hass.states[zone.ha_entity]) return;

    // If the entity already exists under the expected ID, just record it
    if (this._hass.states[entityId]) {
      zone.ha_entity = entityId;
      return;
    }

    try {
      const msg: { type: string; [key: string]: unknown } = {
        type: 'input_number/create',
        name: this._zoneHelperName(zone.name),
        icon: 'mdi:motion-sensor',
        min: 0,
        max: 3,
        step: 1,
        mode: 'box',
        initial: 0,
        unit_of_measurement: 'people',
      };

      if (typeof this._hass.callWS === 'function') {
        await this._hass.callWS(msg);
      } else {
        await this._hass.connection.sendMessagePromise(msg);
      }

      // Store the entity ID optimistically — HA may take a moment to
      // register the entity in its state machine, but we know what the
      // ID will be based on the helper name we just submitted.
      zone.ha_entity = entityId;
      console.info(`[LD2450RadarCard] Created helper: ${entityId}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Store the entity ID optimistically — the most common failure is that
      // the helper already exists (duplicate name).  In that case, we still
      // want to update its value.  If it truly doesn't exist (permission
      // error, etc.), the subsequent set_value call will fail gracefully with
      // its own catch handler.
      if (this._hass && this._hass.states[entityId]) {
        zone.ha_entity = entityId;
      } else {
        // Optimistic: store it anyway so we attempt updates on next cycle;
        // the entity may appear once HA finishes propagating.
        zone.ha_entity = entityId;
      }
      console.warn(
        `[LD2450RadarCard] Could not create helper for zone "${zone.name}" ` +
        `(entity: ${entityId}): ${errMsg}`,
      );
    }
  }

  private _dispatchZoneChange(zoneId: string, occupied: boolean, targetCount: number): void {
    // 1. Emit DOM event (for any in-page listeners)
    this.dispatchEvent(new CustomEvent('ld2450-zone-change', {
      bubbles: true,
      composed: true,
      detail: { zoneId, occupied, targetCount },
    }));

    // 2. Update the corresponding input_number helper in HA so that
    //    automations can trigger directly on state changes.
    if (this._hass) {
      const zone = this._config.zones.find(z => z.id === zoneId);
      if (!zone) return;

      // Prefer the stored ha_entity; fall back to computed entity ID
      const entityId = zone.ha_entity || this._zoneEntityId(zone.name);

      this._hass.callService('input_number', 'set_value', {
        entity_id: entityId,
        value: targetCount,
      }).catch((err) => {
        console.warn(`[LD2450RadarCard] Failed to update ${entityId}:`, err);
      });
    }
  }

  /**
   * Delete the currently selected zone or furniture item.
   * Zone deletion takes priority — furniture is only deleted
   * when no zone is currently selected.
   */
  private _deleteSelected(): void {
    this._pushHistory();
    const selectedZone = this._zoneEditor?.getSelectedZoneId();
    if (selectedZone) {
      this._zoneEditor?.deleteZone(selectedZone);
      this._config.zones = this._zoneEditor?.getZoneConfigs() ?? [];
    } else {
      this._furnitureLayer?.deleteSelected();
      this._config.furniture = this._furnitureLayer?.getFurnitureConfigs() ?? [];
    }
    this._persistConfig();
    this._radarCanvas?.markDirty();
    this._renderDOM();
    this._setupCanvas();
  }

  /**
   * localStorage key for persisting card config, scoped by device name.
   */
  private _storageKey(): string {
    return `ld2450_card_${this._config.device_name}`;
  }

  /**
   * Persist the current card configuration to localStorage so that
   * zones, furniture, and settings survive page refreshes.
   * Debounced to avoid excessive writes during rapid changes (e.g. slider input).
   */
  private _persistConfig(): void {
    if (this._persistTimer !== null) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      try {
        const toStore: Partial<CardConfig> = {
          zones: this._config.zones,
          furniture: this._config.furniture,
          color_scheme: this._config.color_scheme,
          sensor_position: this._config.sensor_position,
          max_range: this._config.max_range,
          fov_angle: this._config.fov_angle,
          show_grid: this._config.show_grid,
          show_sweep: this._config.show_sweep,
          show_trails: this._config.show_trails,
          trail_length: this._config.trail_length,
        };
        localStorage.setItem(this._storageKey(), JSON.stringify(toStore));
      } catch (_e) {
        // localStorage may be full or unavailable — not fatal
      }
    }, 300);
  }

  /**
   * Load previously persisted card config from localStorage.
   * Validates the parsed data before returning it.
   */
  private _loadPersistedConfig(): Partial<CardConfig> | null {
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Basic validation: must be a non-null object
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      // Validate zones array if present
      if (parsed.zones !== undefined && !Array.isArray(parsed.zones)) return null;
      // Validate furniture array if present
      if (parsed.furniture !== undefined && !Array.isArray(parsed.furniture)) return null;
      return parsed as Partial<CardConfig>;
    } catch (_e) {
      // ignore parse errors or corrupted data
    }
    return null;
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Required by Lovelace
  static getConfigElement(): HTMLElement {
    return document.createElement('ld2450-radar-card-editor');
  }

  static getStubConfig(): Partial<CardConfig> {
    return {
      type: 'custom:ld2450-radar-card',
      title: 'Living Room Radar',
      device_name: 'living_room_radar',
      max_range: 6000,
      fov_angle: 120,
      show_grid: true,
      show_sweep: true,
      show_trails: true,
      trail_length: 12,
      sensor_position: 'bottom',
      targets: [
        { id: 1, color: '#38bdf8', label: 'Person 1' },
        { id: 2, color: '#f472b6', label: 'Person 2' },
        { id: 3, color: '#34d399', label: 'Person 3' },
      ],
      furniture: [],
      zones: [],
    };
  }
}

// Register the custom element
customElements.define('ld2450-radar-card', LD2450RadarCard);

// Register the card editor element (used by Lovelace's visual card picker)
customElements.define('ld2450-radar-card-editor', LD2450RadarCardEditor);

// Register with Lovelace card picker
interface WindowWithCards extends Window {
  customCards?: Array<{
    type: string;
    name: string;
    description: string;
    preview: boolean;
    documentationURL?: string;
  }>;
}
(window as WindowWithCards).customCards = (window as WindowWithCards).customCards ?? [];
(window as WindowWithCards).customCards!.push({
  type: 'ld2450-radar-card',
  name: 'LD2450 Radar Card',
  description: 'Real-time radar visualization for HLK-LD2450 mmWave presence sensor',
  preview: true,
  documentationURL: 'https://github.com/gorick1/HA-mmWave-Dashboard',
});

export { LD2450RadarCard };
