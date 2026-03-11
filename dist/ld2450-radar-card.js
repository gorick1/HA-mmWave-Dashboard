/**
 * Ray-casting algorithm for point-in-polygon test.
 * Works for any simple (non-self-intersecting) polygon.
 */
function pointInPolygon(point, polygon) {
    if (polygon.length < 3)
        return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersect = yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
/**
 * Distance between two points.
 */
function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
/**
 * Compute the sensor layout for a given position, canvas dimensions, and range.
 *
 * The sensor's local coordinate system:
 *   Y+ = forward (away from sensor)
 *   X+ = to the right of the sensor
 *
 * Returns pixel position, direction vectors, scale, and facing angle.
 */
function getSensorLayout(position, canvasWidth, canvasHeight, sensorMargin, maxRangeMm) {
    let sx, sy, facingAngle, usable;
    switch (position) {
        case 'top':
            sx = canvasWidth / 2;
            sy = sensorMargin;
            facingAngle = Math.PI / 2; // down
            usable = canvasHeight - sensorMargin;
            break;
        case 'left':
            sx = sensorMargin;
            sy = canvasHeight / 2;
            facingAngle = 0; // right
            usable = canvasWidth - sensorMargin;
            break;
        case 'right':
            sx = canvasWidth - sensorMargin;
            sy = canvasHeight / 2;
            facingAngle = Math.PI; // left
            usable = canvasWidth - sensorMargin;
            break;
        case 'bottom-left':
            sx = sensorMargin;
            sy = canvasHeight - sensorMargin;
            facingAngle = -Math.PI / 4; // up-right 45°
            usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
            break;
        case 'bottom-right':
            sx = canvasWidth - sensorMargin;
            sy = canvasHeight - sensorMargin;
            facingAngle = -3 * Math.PI / 4; // up-left 45°
            usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
            break;
        case 'top-left':
            sx = sensorMargin;
            sy = sensorMargin;
            facingAngle = Math.PI / 4; // down-right 45°
            usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
            break;
        case 'top-right':
            sx = canvasWidth - sensorMargin;
            sy = sensorMargin;
            facingAngle = 3 * Math.PI / 4; // down-left 45°
            usable = Math.min(canvasWidth - sensorMargin, canvasHeight - sensorMargin);
            break;
        case 'bottom':
        default:
            sx = canvasWidth / 2;
            sy = canvasHeight - sensorMargin;
            facingAngle = -Math.PI / 2; // up
            usable = canvasHeight - sensorMargin;
            break;
    }
    const scale = usable / maxRangeMm;
    // Forward direction (where sensor Y+ maps to on canvas)
    const forwardX = Math.cos(facingAngle);
    const forwardY = Math.sin(facingAngle);
    // Right direction (where sensor X+ maps to on canvas) — perpendicular clockwise
    const rightX = -Math.sin(facingAngle);
    const rightY = Math.cos(facingAngle);
    return { sx, sy, forwardX, forwardY, rightX, rightY, scale, facingAngle };
}
/**
 * Convert radar millimeter coordinates to canvas pixel coordinates.
 * The sensor position on the canvas depends on the sensor_position config.
 * X: to the right of the sensor in its local frame
 * Y: away from the sensor (forward) in its local frame
 */
function mmToCanvas(mmX, mmY, canvasWidth, canvasHeight, maxRangeMm, sensorMargin = 40, sensorPosition = 'bottom') {
    const layout = getSensorLayout(sensorPosition, canvasWidth, canvasHeight, sensorMargin, maxRangeMm);
    return {
        x: layout.sx + (mmX * layout.rightX + mmY * layout.forwardX) * layout.scale,
        y: layout.sy + (mmX * layout.rightY + mmY * layout.forwardY) * layout.scale,
    };
}
/**
 * Convert canvas pixel coordinates back to radar mm coordinates.
 */
function canvasToMm(px, py, canvasWidth, canvasHeight, maxRangeMm, sensorMargin = 40, sensorPosition = 'bottom') {
    const layout = getSensorLayout(sensorPosition, canvasWidth, canvasHeight, sensorMargin, maxRangeMm);
    const dx = (px - layout.sx) / layout.scale;
    const dy = (py - layout.sy) / layout.scale;
    // Inverse of the orthogonal rotation matrix (transpose)
    return {
        x: dx * layout.rightX + dy * layout.rightY,
        y: dx * layout.forwardX + dy * layout.forwardY,
    };
}
/**
 * Compute the centroid of a polygon.
 */
function polygonCentroid(vertices) {
    if (vertices.length === 0)
        return { x: 0, y: 0 };
    const sum = vertices.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
    return { x: sum.x / vertices.length, y: sum.y / vertices.length };
}
/**
 * Snap a value to a grid.
 */
function snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
}
/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Translate a polygon's vertices by a delta.
 */
function translatePolygon(vertices, dx, dy) {
    return vertices.map(v => ({ x: v.x + dx, y: v.y + dy }));
}
/**
 * Find the closest point on a line segment to a given point.
 * Returns the t parameter (0-1) along the segment and the closest point.
 */
function closestPointOnSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0)
        return { t: 0, point: a, dist: distance(p, a) };
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    return { t, point, dist: distance(p, point) };
}
/**
 * Convert degrees to radians.
 */
function degToRad(deg) {
    return (deg * Math.PI) / 180;
}

/**
 * Draw a sofa shape on canvas.
 */
function drawSofa(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.1;
    // Main body
    ctx.beginPath();
    ctx.roundRect(x, y + h * 0.3, w, h * 0.7, r);
    ctx.fill();
    ctx.stroke();
    // Back
    ctx.beginPath();
    ctx.roundRect(x, y, w, h * 0.35, r);
    ctx.fill();
    ctx.stroke();
    // Armrests
    ctx.beginPath();
    ctx.roundRect(x, y + h * 0.3, w * 0.1, h * 0.7, r);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x + w * 0.9, y + h * 0.3, w * 0.1, h * 0.7, r);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draw an L-shaped sofa.
 */
function drawSofaL(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.05;
    const seg1W = w * 0.6;
    const seg2H = h * 0.6;
    ctx.beginPath();
    ctx.roundRect(x, y, seg1W, h * 0.35, r);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x, y + h * 0.35, seg1W, h * 0.65, r);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x + seg1W, y + h - seg2H, w - seg1W, seg2H * 0.35, r);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x + seg1W, y + h - seg2H + seg2H * 0.35, w - seg1W, seg2H * 0.65, r);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draw a bed.
 */
function drawBed(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.05;
    // Frame
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    // Pillow area
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    const pillowW = w * 0.35;
    const pillowH = h * 0.2;
    const pillowY = y + h * 0.05;
    ctx.roundRect(x + w * 0.1, pillowY, pillowW, pillowH, r);
    ctx.fill();
    ctx.stroke();
    if (w >= 120) {
        ctx.beginPath();
        ctx.roundRect(x + w - w * 0.1 - pillowW, pillowY, pillowW, pillowH, r);
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha /= 0.6;
}
/**
 * Draw a rectangular table.
 */
function drawTable(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.05;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draw a chair.
 */
function drawChair(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.1;
    // Seat
    ctx.beginPath();
    ctx.roundRect(x + w * 0.1, y + h * 0.3, w * 0.8, h * 0.7, r);
    ctx.fill();
    ctx.stroke();
    // Back
    ctx.beginPath();
    ctx.roundRect(x + w * 0.1, y, w * 0.8, h * 0.35, r);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draw a TV / monitor (thin rectangle with stand).
 */
function drawTV(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    // Stand
    const standW = w * 0.08;
    const standH = h * 2;
    ctx.beginPath();
    ctx.rect(x + w / 2 - standW / 2, y + h, standW, standH);
    ctx.fill();
    ctx.stroke();
    // Base
    ctx.beginPath();
    ctx.rect(x + w / 2 - standW * 2, y + h + standH, standW * 4, standH * 0.5);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draw a door (arc).
 */
function drawDoor(ctx, x, y, w, _h) {
    const r = w;
    // Door panel line
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + w);
    ctx.stroke();
    // Swing arc
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI / 2);
    ctx.stroke();
}
/**
 * Draw a window (rectangle with center line).
 */
function drawWindow(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
}
/**
 * Draw a toilet.
 */
function drawToilet(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.08;
    // Tank
    ctx.beginPath();
    ctx.roundRect(x + w * 0.1, y, w * 0.8, h * 0.3, r);
    ctx.fill();
    ctx.stroke();
    // Bowl (oval)
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.65, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draw a bathtub.
 */
function drawBathtub(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.12;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    // Inner oval
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.38, h * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
}
/**
 * Draw a plant (circle).
 */
function drawPlant(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cross lines
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.2);
    ctx.lineTo(x + w / 2, y + h * 0.8);
    ctx.moveTo(x + w * 0.2, y + h / 2);
    ctx.lineTo(x + w * 0.8, y + h / 2);
    ctx.stroke();
}
/**
 * Draw a wardrobe.
 */
function drawWardrobe(ctx, x, y, w, h) {
    const r = Math.min(w, h) * 0.04;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    // Middle divider
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
    // Door handles
    const handleSize = Math.min(w, h) * 0.05;
    ctx.beginPath();
    ctx.arc(x + w * 0.38, y + h / 2, handleSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w * 0.62, y + h / 2, handleSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}
const FURNITURE_TYPES = [
    {
        id: 'sofa',
        label: 'Sofa',
        defaultWidth: 2000,
        defaultHeight: 800,
        icon: '🛋️',
        drawFn: drawSofa,
    },
    {
        id: 'sofa_l',
        label: 'L-Shaped Sofa',
        defaultWidth: 2400,
        defaultHeight: 2400,
        icon: '🛋️',
        drawFn: drawSofaL,
    },
    {
        id: 'bed_single',
        label: 'Single Bed',
        defaultWidth: 1000,
        defaultHeight: 2000,
        icon: '🛏️',
        drawFn: drawBed,
    },
    {
        id: 'bed_double',
        label: 'Double Bed',
        defaultWidth: 1600,
        defaultHeight: 2000,
        icon: '🛏️',
        drawFn: drawBed,
    },
    {
        id: 'desk',
        label: 'Desk',
        defaultWidth: 1400,
        defaultHeight: 700,
        icon: '🖥️',
        drawFn: drawTable,
    },
    {
        id: 'dining_table',
        label: 'Dining Table',
        defaultWidth: 1500,
        defaultHeight: 900,
        icon: '🍽️',
        drawFn: drawTable,
    },
    {
        id: 'coffee_table',
        label: 'Coffee Table',
        defaultWidth: 1000,
        defaultHeight: 600,
        icon: '☕',
        drawFn: drawTable,
    },
    {
        id: 'chair',
        label: 'Chair',
        defaultWidth: 600,
        defaultHeight: 600,
        icon: '🪑',
        drawFn: drawChair,
    },
    {
        id: 'tv',
        label: 'TV / Monitor',
        defaultWidth: 1400,
        defaultHeight: 100,
        icon: '📺',
        drawFn: drawTV,
    },
    {
        id: 'door',
        label: 'Door',
        defaultWidth: 900,
        defaultHeight: 900,
        icon: '🚪',
        drawFn: drawDoor,
    },
    {
        id: 'window',
        label: 'Window',
        defaultWidth: 1000,
        defaultHeight: 100,
        icon: '🪟',
        drawFn: drawWindow,
    },
    {
        id: 'toilet',
        label: 'Toilet',
        defaultWidth: 400,
        defaultHeight: 600,
        icon: '🚽',
        drawFn: drawToilet,
    },
    {
        id: 'bathtub',
        label: 'Bathtub',
        defaultWidth: 700,
        defaultHeight: 1600,
        icon: '🛁',
        drawFn: drawBathtub,
    },
    {
        id: 'plant',
        label: 'Plant',
        defaultWidth: 400,
        defaultHeight: 400,
        icon: '🪴',
        drawFn: drawPlant,
    },
    {
        id: 'wardrobe',
        label: 'Wardrobe',
        defaultWidth: 1000,
        defaultHeight: 600,
        icon: '🚪',
        drawFn: drawWardrobe,
    },
];
function getFurnitureType(id) {
    return FURNITURE_TYPES.find(f => f.id === id);
}

const SENSOR_MARGIN$3 = 40;
const TRAIL_OPACITY_MAX = 0.6;
/**
 * RadarCanvas handles all canvas drawing for the radar visualization.
 */
class RadarCanvas {
    constructor(canvas, config) {
        this.sweepAngle = -Math.PI / 2; // start pointing up
        this.sweepAnimId = null;
        this.lastSweepTime = 0;
        this.dirty = true;
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('Could not get 2D context');
        this.ctx = ctx;
        this.config = config;
    }
    updateConfig(config) {
        this.config = config;
        this.dirty = true;
    }
    markDirty() {
        this.dirty = true;
    }
    startAnimation() {
        const animate = (time) => {
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
    stopAnimation() {
        if (this.sweepAnimId !== null) {
            cancelAnimationFrame(this.sweepAnimId);
            this.sweepAnimId = null;
        }
    }
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.dirty = true;
    }
    /**
     * Main render function. Call on rAF.
     */
    render(targets, zones, furniture, drawingState, hoveredPos) {
        if (!this.dirty)
            return;
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
        if (config.show_grid)
            this._drawGrid(w, h, layout);
        this._drawFOV(w, h, layout);
        if (config.show_sweep)
            this._drawSweep(w, h, layout);
        this._drawFurniture(furniture, w, h, layout);
        this._drawZones(zones, targets, w, h);
        if (config.show_trails)
            this._drawTrails(targets, w, h);
        this._drawTargets(targets, w, h);
        this._drawSensor(w, h, layout);
        this._drawDrawingOverlay(drawingState, w, h);
        if (hoveredPos) {
            this._drawTooltip(hoveredPos, w, h);
        }
    }
    _getLayout(w, h) {
        var _a;
        return getSensorLayout((_a = this.config.sensor_position) !== null && _a !== void 0 ? _a : 'bottom', w, h, SENSOR_MARGIN$3, this.config.max_range);
    }
    _toCanvas(mmX, mmY, w, h) {
        var _a;
        return mmToCanvas(mmX, mmY, w, h, this.config.max_range, SENSOR_MARGIN$3, (_a = this.config.sensor_position) !== null && _a !== void 0 ? _a : 'bottom');
    }
    get _isLight() {
        return this.config.color_scheme === 'light';
    }
    _drawGrid(w, h, layout) {
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
            if (Math.abs(degToRad(deg)) > fovHalf + 0.01)
                continue;
            const len = (this.config.max_range + 500) * scale;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(lineAngle) * len, sy + Math.sin(lineAngle) * len);
            ctx.stroke();
        }
        ctx.restore();
    }
    _drawFOV(w, h, layout) {
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
        ctx.lineTo(sx + Math.cos(facingAngle - fovHalf) * maxR, sy + Math.sin(facingAngle - fovHalf) * maxR);
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(facingAngle + fovHalf) * maxR, sy + Math.sin(facingAngle + fovHalf) * maxR);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    _drawSweep(w, h, layout) {
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
    _drawFurniture(furniture, w, h, layout) {
        if (furniture.length === 0)
            return;
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
            }
            else {
                ctx.fillStyle = light ? 'rgba(100,116,139,0.1)' : 'rgba(148,163,184,0.12)';
                ctx.strokeStyle = light ? 'rgba(100,116,139,0.6)' : 'rgba(148,163,184,0.5)';
                ctx.lineWidth = 1;
            }
            if (def) {
                def.drawFn(ctx, -pw / 2, -ph / 2, pw, ph);
            }
            else {
                // Fallback: plain rectangle
                ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
                ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
            }
            ctx.restore();
        }
        ctx.restore();
    }
    _drawZones(zones, _targets, w, h) {
        if (zones.length === 0)
            return;
        const ctx = this.ctx;
        ctx.save();
        for (const zone of zones) {
            if (zone.vertices.length < 2)
                continue;
            const pts = zone.vertices.map(v => this._toCanvas(v.x, v.y, w, h));
            // Fill
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++)
                ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            if (zone.occupied) {
                ctx.fillStyle = 'rgba(167,139,250,0.3)';
                ctx.strokeStyle = 'rgba(167,139,250,0.9)';
            }
            else {
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
    _drawTrails(targets, w, h) {
        const ctx = this.ctx;
        ctx.save();
        for (const target of targets) {
            if (!target.active || target.trail.length < 2)
                continue;
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
    _drawTargets(targets, w, h) {
        const ctx = this.ctx;
        const light = this._isLight;
        ctx.save();
        for (const target of targets) {
            if (!target.active)
                continue;
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
    _drawSensor(w, h, layout) {
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
        ctx.lineTo(sx + Math.cos(facingAngle) * indicatorLen, sy + Math.sin(facingAngle) * indicatorLen);
        ctx.strokeStyle = sensorColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Label — offset away from the facing direction (behind the sensor)
        ctx.font = '10px system-ui';
        ctx.fillStyle = light ? 'rgba(2,132,199,0.7)' : 'rgba(99,179,237,0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelDist = 18;
        ctx.fillText('SENSOR', sx - Math.cos(facingAngle) * labelDist, sy - Math.sin(facingAngle) * labelDist);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }
    _drawDrawingOverlay(state, w, h) {
        if (state.mode !== 'draw-zone')
            return;
        const ctx = this.ctx;
        const pts = state.zoneVertices.map(v => this._toCanvas(v.x, v.y, w, h));
        if (pts.length === 0)
            return;
        ctx.save();
        ctx.strokeStyle = 'rgba(139,92,246,0.8)';
        ctx.fillStyle = 'rgba(139,92,246,0.15)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        // Drawn edges
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++)
            ctx.lineTo(pts[i].x, pts[i].y);
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
            }
            else {
                ctx.fillStyle = 'rgba(139,92,246,0.8)';
                ctx.fill();
            }
            ctx.strokeStyle = 'rgba(139,92,246,0.9)';
            ctx.stroke();
        }
        ctx.restore();
    }
    _drawTooltip(mmPos, _w, _h) {
    }
}
/**
 * Convert a hex color (#rrggbb or #rgb) to rgba string.
 */
function hexToRgba(hex, alpha) {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
        // Already rgb, just apply alpha
        return hex.replace(/[\d.]+\)$/, `${alpha})`);
    }
    let h = hex.replace('#', '');
    if (h.length === 3)
        h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

const INACTIVE_TIMEOUT_MS = 2000;
const TRAIL_CHANGE_THRESHOLD_MM = 20;
/**
 * TargetTracker manages live target state including trail buffers and
 * inactive detection.
 */
class TargetTracker {
    constructor(config) {
        this.targets = new Map();
        this.config = config;
        this._initTargets();
    }
    updateConfig(config) {
        this.config = config;
        // Add any new target IDs
        for (const tc of config.targets) {
            if (!this.targets.has(tc.id)) {
                this.targets.set(tc.id, this._createTarget(tc.id, tc.color, tc.label));
            }
            else {
                const t = this.targets.get(tc.id);
                t.color = tc.color;
                t.label = tc.label;
            }
        }
    }
    _initTargets() {
        for (const tc of this.config.targets) {
            this.targets.set(tc.id, this._createTarget(tc.id, tc.color, tc.label));
        }
    }
    _createTarget(id, color, label) {
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
    updateAxis(targetId, axis, value) {
        const target = this.targets.get(targetId);
        if (!target)
            return false;
        if (axis === 'x')
            target.x = value !== null && value !== void 0 ? value : 0;
        else if (axis === 'y')
            target.y = value !== null && value !== void 0 ? value : 0;
        else if (axis === 'speed')
            target.speed = value !== null && value !== void 0 ? value : 0;
        // A target is inactive when both X and Y are exactly 0 (LD2450 convention
        // for "no target detected").  Negative Y values are behind the sensor and
        // are also treated as inactive since the LD2450 only covers the forward
        // hemisphere.
        const isActive = !(target.x === 0 && target.y === 0) &&
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
        else {
            // Coordinates explicitly report "no target" — deactivate immediately
            // rather than waiting for the inactivity timeout.
            target.active = false;
            target.trail = [];
        }
        return true;
    }
    /**
     * Mark targets inactive if not seen for INACTIVE_TIMEOUT_MS.
     */
    tick() {
        const now = Date.now();
        for (const target of this.targets.values()) {
            if (target.active && now - target.lastSeen > INACTIVE_TIMEOUT_MS) {
                target.active = false;
                target.trail = [];
            }
        }
    }
    getTargets() {
        return Array.from(this.targets.values());
    }
    /**
     * Check which zones are occupied by any active target.
     * Returns a Set of zone IDs that are occupied.
     */
    getOccupiedZones(zones) {
        const occupied = new Set();
        const activeTargets = Array.from(this.targets.values()).filter(t => t.active);
        for (const zone of zones) {
            if (zone.vertices.length < 3)
                continue;
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

const HANDLE_SIZE = 8;
const SENSOR_MARGIN$2 = 40;
const SNAP_GRID_MM = 100;
/**
 * FurnitureLayer manages furniture placement, selection, and interaction.
 */
class FurnitureLayer {
    constructor(config) {
        this.items = [];
        this.selectedId = null;
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.resizing = false;
        this.resizeAnchorMm = { x: 0, y: 0 };
        this.resizeHandleIndex = -1;
        this.snapToGridEnabled = true;
        this.config = config;
        this.items = config.furniture.map(f => ({ ...f, selected: false }));
    }
    updateConfig(config) {
        this.config = config;
        // Merge: keep selected state for existing items
        const existingMap = new Map(this.items.map(i => [i.id, i]));
        this.items = config.furniture.map(f => {
            var _a;
            const existing = existingMap.get(f.id);
            return { ...f, selected: (_a = existing === null || existing === void 0 ? void 0 : existing.selected) !== null && _a !== void 0 ? _a : false };
        });
    }
    getItems() {
        return this.items;
    }
    getFurnitureConfigs() {
        return this.items.map(({ selected: _s, ...rest }) => rest);
    }
    setSnapToGrid(enabled) {
        this.snapToGridEnabled = enabled;
    }
    get _sensorPosition() {
        var _a;
        return (_a = this.config.sensor_position) !== null && _a !== void 0 ? _a : 'bottom';
    }
    /**
     * Place a new furniture item at the given canvas position.
     */
    placeAt(furnitureType, canvasX, canvasY, canvasWidth, canvasHeight) {
        const def = getFurnitureType(furnitureType);
        if (!def)
            return null;
        let mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
        if (this.snapToGridEnabled) {
            mm = {
                x: snapToGrid(mm.x, SNAP_GRID_MM),
                y: snapToGrid(mm.y, SNAP_GRID_MM),
            };
        }
        const id = `${furnitureType}_${Date.now()}`;
        const item = {
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
    onMouseDown(canvasX, canvasY, canvasWidth, canvasHeight) {
        const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN$2, this.config.max_range);
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
                        }
                        else {
                            this.resizing = true;
                            this.resizeHandleIndex = i;
                            // Anchor is the opposite corner in mm world space
                            const rot = degToRad(item.rotation);
                            const anchorIdx = (i + 2) % 4;
                            const halfW = item.width / 2;
                            const halfH = item.height / 2;
                            // Corners in local mm space (y-up): TL=(-hw,+hh), TR=(+hw,+hh), BR=(+hw,-hh), BL=(-hw,-hh)
                            const localCorners = [
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
                for (const i of this.items)
                    i.selected = false;
                item.selected = true;
                this.selectedId = item.id;
                const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
                this.dragOffset = { x: mm.x - item.x, y: mm.y - item.y };
                this.dragging = true;
                return true;
            }
        }
        // Deselect
        for (const i of this.items)
            i.selected = false;
        this.selectedId = null;
        return false;
    }
    onMouseMove(canvasX, canvasY, canvasWidth, canvasHeight) {
        if (!this.selectedId)
            return;
        const item = this.items.find(i => i.id === this.selectedId);
        if (!item)
            return;
        if (this.dragging) {
            let mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
            if (this.snapToGridEnabled) {
                mm = {
                    x: snapToGrid(mm.x - this.dragOffset.x, SNAP_GRID_MM) + this.dragOffset.x,
                    y: snapToGrid(mm.y - this.dragOffset.y, SNAP_GRID_MM) + this.dragOffset.y,
                };
            }
            item.x = mm.x - this.dragOffset.x;
            item.y = mm.y - this.dragOffset.y;
        }
        else if (this.resizing && this.resizeHandleIndex >= 0 && this.resizeHandleIndex < 4) {
            const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
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
        }
        else if (this.resizeHandleIndex === 4) {
            // Rotation
            const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN$2, this.config.max_range);
            const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
            const cx = itemCanvas.x;
            const cy = itemCanvas.y;
            const angle = Math.atan2(canvasY - cy, canvasX - cx);
            // Adjust rotation to account for sensor facing direction
            item.rotation = ((angle - layout.facingAngle) * 180) / Math.PI;
        }
    }
    onMouseUp() {
        this.dragging = false;
        this.resizing = false;
        this.resizeHandleIndex = -1;
    }
    deleteSelected() {
        if (!this.selectedId)
            return null;
        const idx = this.items.findIndex(i => i.id === this.selectedId);
        if (idx < 0)
            return null;
        const removed = this.items.splice(idx, 1)[0];
        this.selectedId = null;
        return removed;
    }
    /**
     * Draw selection handles for the currently selected item.
     */
    drawHandles(ctx, canvasWidth, canvasHeight) {
        if (!this.selectedId)
            return;
        const item = this.items.find(i => i.id === this.selectedId);
        if (!item)
            return;
        const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN$2, this.config.max_range);
        const scale = layout.scale;
        const handles = this._getHandles(item, canvasWidth, canvasHeight, scale);
        ctx.save();
        ctx.strokeStyle = 'rgba(56,189,248,0.8)';
        ctx.fillStyle = 'rgba(56,189,248,0.3)';
        ctx.lineWidth = 1.5;
        // Bounding box
        const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
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
    _getHandles(item, canvasWidth, canvasHeight, scale) {
        const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
        const cx = itemCanvas.x;
        const cy = itemCanvas.y;
        const pw = item.width * scale / 2;
        const ph = item.height * scale / 2;
        const rot = degToRad(item.rotation);
        const corners = [
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
    _hitTest(item, canvasX, canvasY, canvasWidth, canvasHeight, scale) {
        const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
        const cx = itemCanvas.x;
        const cy = itemCanvas.y;
        // Transform click into item's local space
        const rot = degToRad(-item.rotation);
        const dx = canvasX - cx;
        const dy = canvasY - cy;
        const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
        const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
        return (Math.abs(localX) <= item.width * scale / 2 &&
            Math.abs(localY) <= item.height * scale / 2);
    }
    /**
     * Draw all furniture items using their type-specific draw function.
     */
    drawAll(ctx, canvasWidth, canvasHeight) {
        const layout = getSensorLayout(this._sensorPosition, canvasWidth, canvasHeight, SENSOR_MARGIN$2, this.config.max_range);
        const scale = layout.scale;
        ctx.save();
        for (const item of this.items) {
            const def = getFurnitureType(item.type);
            if (!def)
                continue;
            const itemCanvas = mmToCanvas(item.x, item.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$2, this._sensorPosition);
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

const SENSOR_MARGIN$1 = 40;
const VERTEX_RADIUS = 7;
const EDGE_HIT_RADIUS = 8;
/**
 * ZoneEditor manages polygon zone drawing, editing, and occupancy detection.
 */
class ZoneEditor {
    constructor(config) {
        this.zones = [];
        this.drawingVertices = [];
        this.isDrawing = false;
        this.selectedZoneId = null;
        this.draggingZone = false;
        this.draggingVertex = false;
        this.dragVertexIndex = -1;
        this.dragZoneOffset = { x: 0, y: 0 };
        this.onZoneComplete = null;
        this.config = config;
        this.zones = config.zones.map(z => ({ ...z, occupied: false, selectedVertexIndex: null, dragging: false }));
    }
    get _sensorPosition() {
        var _a;
        return (_a = this.config.sensor_position) !== null && _a !== void 0 ? _a : 'bottom';
    }
    updateConfig(config) {
        this.config = config;
        const existingMap = new Map(this.zones.map(z => [z.id, z]));
        this.zones = config.zones.map(z => {
            var _a, _b;
            const existing = existingMap.get(z.id);
            return {
                ...z,
                occupied: (_a = existing === null || existing === void 0 ? void 0 : existing.occupied) !== null && _a !== void 0 ? _a : false,
                selectedVertexIndex: (_b = existing === null || existing === void 0 ? void 0 : existing.selectedVertexIndex) !== null && _b !== void 0 ? _b : null,
                dragging: false,
            };
        });
    }
    setOnZoneComplete(fn) {
        this.onZoneComplete = fn;
    }
    getZones() {
        return this.zones;
    }
    getZoneConfigs() {
        return this.zones.map(({ occupied: _o, selectedVertexIndex: _s, dragging: _d, dragStartOffset: _ds, ...rest }) => rest);
    }
    isInDrawingMode() {
        return this.isDrawing;
    }
    getDrawingVertices() {
        return this.drawingVertices;
    }
    startDrawing() {
        this.isDrawing = true;
        this.drawingVertices = [];
        this.selectedZoneId = null;
    }
    cancelDrawing() {
        this.isDrawing = false;
        this.drawingVertices = [];
    }
    /**
     * Handle a click on the canvas while in drawing mode.
     * Returns true if the polygon was closed.
     */
    handleDrawClick(canvasX, canvasY, canvasWidth, canvasHeight) {
        const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
        if (this.drawingVertices.length >= 3) {
            // Check if clicking near the first vertex to close
            const firstPx = mmToCanvas(this.drawingVertices[0].x, this.drawingVertices[0].y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
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
    finishDrawing() {
        if (this.drawingVertices.length >= 3) {
            this._closePolygon();
            return true;
        }
        return false;
    }
    _closePolygon() {
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
    addZone(zone) {
        this.zones.push({
            ...zone,
            occupied: false,
            selectedVertexIndex: null,
            dragging: false,
        });
    }
    updateZoneName(zoneId, name) {
        const zone = this.zones.find(z => z.id === zoneId);
        if (zone)
            zone.name = name;
    }
    deleteZone(zoneId) {
        const idx = this.zones.findIndex(z => z.id === zoneId);
        if (idx >= 0)
            this.zones.splice(idx, 1);
        if (this.selectedZoneId === zoneId)
            this.selectedZoneId = null;
    }
    /**
     * Handle mouse down in select mode.
     * Returns true if the event was consumed.
     */
    onMouseDown(canvasX, canvasY, canvasWidth, canvasHeight) {
        // Check if clicking a vertex of the selected zone
        if (this.selectedZoneId) {
            const zone = this.zones.find(z => z.id === this.selectedZoneId);
            if (zone) {
                for (let i = 0; i < zone.vertices.length; i++) {
                    const vPx = mmToCanvas(zone.vertices[i].x, zone.vertices[i].y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
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
            if (zone.vertices.length < 3)
                continue;
            const mmPos = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
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
    onMouseMove(canvasX, canvasY, canvasWidth, canvasHeight) {
        if (!this.selectedZoneId)
            return;
        const zone = this.zones.find(z => z.id === this.selectedZoneId);
        if (!zone)
            return;
        const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
        if (this.draggingVertex && this.dragVertexIndex >= 0) {
            zone.vertices[this.dragVertexIndex] = mm;
        }
        else if (this.draggingZone) {
            const centroid = polygonCentroid(zone.vertices);
            const targetCentroid = { x: mm.x - this.dragZoneOffset.x, y: mm.y - this.dragZoneOffset.y };
            const dx = targetCentroid.x - centroid.x;
            const dy = targetCentroid.y - centroid.y;
            zone.vertices = translatePolygon(zone.vertices, dx, dy);
        }
    }
    onMouseUp() {
        this.draggingZone = false;
        this.draggingVertex = false;
        this.dragVertexIndex = -1;
    }
    /**
     * Handle double-click: add vertex to edge near click point.
     */
    onDoubleClick(canvasX, canvasY, canvasWidth, canvasHeight) {
        for (const zone of this.zones) {
            const pts = zone.vertices.map(v => mmToCanvas(v.x, v.y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition));
            for (let i = 0; i < pts.length; i++) {
                const next = (i + 1) % pts.length;
                const { t, dist } = closestPointOnSegment({ x: canvasX, y: canvasY }, pts[i], pts[next]);
                if (dist < EDGE_HIT_RADIUS && t > 0.05 && t < 0.95) {
                    const mm = canvasToMm(canvasX, canvasY, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
                    zone.vertices.splice(next, 0, mm);
                    return;
                }
            }
        }
    }
    /**
     * Update zone occupancy based on current target positions.
     */
    updateOccupancy(occupiedIds) {
        for (const zone of this.zones) {
            zone.occupied = occupiedIds.has(zone.id);
        }
    }
    /**
     * Check if a canvas position is near the first vertex of the current drawing.
     */
    isNearFirstVertex(canvasX, canvasY, canvasWidth, canvasHeight) {
        if (this.drawingVertices.length < 3)
            return false;
        const firstPx = mmToCanvas(this.drawingVertices[0].x, this.drawingVertices[0].y, canvasWidth, canvasHeight, this.config.max_range, SENSOR_MARGIN$1, this._sensorPosition);
        return distance({ x: canvasX, y: canvasY }, firstPx) < VERTEX_RADIUS + 4;
    }
}

const POSITION_LABELS = {
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
function generateZoneYaml(config) {
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
function _buildPIPJinja(zone, xVar, yVar) {
    const poly = zone.vertices;
    const n = poly.length;
    if (n < 3)
        return 'false';
    const checks = [];
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
    if (checks.length === 1)
        return checks[0];
    // Use a counter approach: sum all intersections, odd = inside
    return `(${checks.join(' | int(0) + ')} | int(0)) % 2 == 1`;
}
/**
 * ConfigEditor renders the settings panel HTML.
 */
class ConfigEditor {
    constructor(config, onConfigChange) {
        this.config = config;
        this.onConfigChange = onConfigChange;
    }
    updateConfig(config) {
        this.config = config;
    }
    /**
     * Render the settings panel as an HTML string.
     */
    renderHTML() {
        var _a;
        const c = this.config;
        const isLight = c.color_scheme === 'light';
        const currentPos = (_a = c.sensor_position) !== null && _a !== void 0 ? _a : 'bottom';
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
    attachListeners(container) {
        const get = (id) => container.querySelector(`#${id}`);
        const sensorPos = get('cfg-sensor-pos');
        const rangeMax = get('cfg-max-range');
        const rangeFov = get('cfg-fov');
        const checkGrid = get('cfg-grid');
        const checkSweep = get('cfg-sweep');
        const checkTrails = get('cfg-trails');
        const rangeTrail = get('cfg-trail-len');
        const checkLightMode = get('cfg-light-mode');
        sensorPos === null || sensorPos === void 0 ? void 0 : sensorPos.addEventListener('change', () => {
            this.onConfigChange({ sensor_position: sensorPos.value });
        });
        rangeMax === null || rangeMax === void 0 ? void 0 : rangeMax.addEventListener('input', () => {
            const val = parseInt(rangeMax.value);
            this.onConfigChange({ max_range: val });
            const span = rangeMax.nextElementSibling;
            if (span)
                span.textContent = `${(val / 1000).toFixed(1)}m`;
        });
        rangeFov === null || rangeFov === void 0 ? void 0 : rangeFov.addEventListener('input', () => {
            const val = parseInt(rangeFov.value);
            this.onConfigChange({ fov_angle: val });
            const span = rangeFov.nextElementSibling;
            if (span)
                span.textContent = `${val}°`;
        });
        checkGrid === null || checkGrid === void 0 ? void 0 : checkGrid.addEventListener('change', () => {
            this.onConfigChange({ show_grid: checkGrid.checked });
        });
        checkSweep === null || checkSweep === void 0 ? void 0 : checkSweep.addEventListener('change', () => {
            this.onConfigChange({ show_sweep: checkSweep.checked });
        });
        checkTrails === null || checkTrails === void 0 ? void 0 : checkTrails.addEventListener('change', () => {
            this.onConfigChange({ show_trails: checkTrails.checked });
        });
        rangeTrail === null || rangeTrail === void 0 ? void 0 : rangeTrail.addEventListener('input', () => {
            const val = parseInt(rangeTrail.value);
            this.onConfigChange({ trail_length: val });
            const span = rangeTrail.nextElementSibling;
            if (span)
                span.textContent = `${val}`;
        });
        checkLightMode === null || checkLightMode === void 0 ? void 0 : checkLightMode.addEventListener('change', () => {
            this.onConfigChange({ color_scheme: checkLightMode.checked ? 'light' : 'dark' });
        });
        container.querySelectorAll('input[data-target-id]').forEach(el => {
            const input = el;
            input.addEventListener('input', () => {
                var _a;
                const id = parseInt((_a = input.dataset['targetId']) !== null && _a !== void 0 ? _a : '0');
                const targets = this.config.targets.map(t => t.id === id ? { ...t, color: input.value } : t);
                this.onConfigChange({ targets });
            });
        });
    }
    /**
     * Generate the furniture types picker HTML.
     */
    renderFurniturePicker(selectedType) {
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

/**
 * LD2450 Radar Card Editor
 *
 * Implements the Lovelace card editor interface so Home Assistant shows a
 * visual configuration panel (with a device dropdown for easy selection)
 * instead of the raw YAML editor when the card is added or edited via the UI.
 *
 * HA calls:
 *   • setConfig(config)  — receives current card config
 *   • set hass(hass)     — receives the HA instance (needed for entity lists)
 *
 * The editor fires a `config-changed` CustomEvent (bubbling, composed) whenever
 * the user changes a field. HA reads `event.detail.config` and updates the card.
 */
/** Pattern that matches LD2450 target-axis entity IDs. */
const LD2450_ENTITY_RE = /^sensor\.(.+?)_target_\d+_(?:x|y|speed|resolution)$/;
const SENSOR_POSITIONS = [
    { value: 'bottom', label: 'Bottom Wall', icon: '⬇' },
    { value: 'top', label: 'Top Wall', icon: '⬆' },
    { value: 'left', label: 'Left Wall', icon: '⬅' },
    { value: 'right', label: 'Right Wall', icon: '➡' },
    { value: 'bottom-left', label: 'Bottom-Left', icon: '↙' },
    { value: 'bottom-right', label: 'Bottom-Right', icon: '↘' },
    { value: 'top-left', label: 'Top-Left', icon: '↖' },
    { value: 'top-right', label: 'Top-Right', icon: '↗' },
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
class LD2450RadarCardEditor extends HTMLElement {
    constructor() {
        super();
        this._config = {};
        this._hass = null;
        this._shadow = this.attachShadow({ mode: 'open' });
    }
    setConfig(config) {
        this._config = { ...config };
        this._render();
    }
    set hass(hass) {
        this._hass = hass;
        this._render();
    }
    // ── Private helpers ─────────────────────────────────────────────────────────
    /** Dispatch a config-changed event so HA updates the live card preview. */
    _fireConfigChanged(patch) {
        this._config = { ...this._config, ...patch };
        this.dispatchEvent(new CustomEvent('config-changed', {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
        }));
    }
    /**
     * Scan hass.states for LD2450 devices by finding entities matching the
     * sensor.<device>_target_N_(x|y|speed|resolution) pattern.
     * Returns a deduplicated, sorted list of device name strings.
     */
    _getAvailableDevices() {
        if (!this._hass)
            return [];
        const deviceSet = new Set();
        for (const entityId of Object.keys(this._hass.states)) {
            const match = entityId.match(LD2450_ENTITY_RE);
            if (match)
                deviceSet.add(match[1]);
        }
        return Array.from(deviceSet).sort();
    }
    _render() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const c = this._config;
        const currentPos = (_a = c.sensor_position) !== null && _a !== void 0 ? _a : 'bottom';
        // Auto-discover LD2450 devices
        const devices = this._getAvailableDevices();
        const currentDevice = (_b = c.device_name) !== null && _b !== void 0 ? _b : '';
        // Build device dropdown options
        const deviceOptionsHTML = devices.length > 0
            ? [
                `<option value="" ${!currentDevice ? 'selected' : ''}>— Select a device —</option>`,
                ...devices.map(d => `<option value="${this._escapeAttr(d)}" ${currentDevice === d ? 'selected' : ''}>${this._escapeAttr(d)}</option>`),
            ].join('')
            : `<option value="">No LD2450 devices found</option>`;
        // Wall grid mapping: [row][col] → SensorPosition | null
        const wallGrid = [
            'top-left', 'top', 'top-right',
            'left', null, 'right',
            'bottom-left', 'bottom', 'bottom-right',
        ];
        const wallGridHTML = wallGrid.map((pos) => {
            var _a, _b, _c;
            if (pos === null) {
                return `<div class="wall-btn wall-center">Room</div>`;
            }
            const info = SENSOR_POSITIONS.find(p => p.value === pos);
            return `<button class="wall-btn ${currentPos === pos ? 'selected' : ''}"
        data-wall-pos="${pos}" title="${(_a = info === null || info === void 0 ? void 0 : info.label) !== null && _a !== void 0 ? _a : pos}" aria-label="${(_b = info === null || info === void 0 ? void 0 : info.label) !== null && _b !== void 0 ? _b : pos}">
        ${(_c = info === null || info === void 0 ? void 0 : info.icon) !== null && _c !== void 0 ? _c : ''}
      </button>`;
        }).join('');
        this._shadow.innerHTML = `
      <style>${EDITOR_STYLES}</style>

      <div class="section-title">Device</div>

      <div class="editor-row">
        <label for="device-select">Device</label>
        <select id="device-select" aria-label="Select LD2450 device">
          ${deviceOptionsHTML}
        </select>
        <div class="hint">
          ${devices.length > 0
            ? 'Choose your LD2450 device. The card auto-discovers devices from your Home Assistant entities.'
            : 'No LD2450 devices detected. Make sure your ESPHome device is online and its entities are available in HA.'}
        </div>
      </div>

      <div class="editor-row">
        <label for="device-name">Or enter device name manually</label>
        <input
          type="text"
          id="device-name"
          placeholder="e.g. living_room_radar"
          value="${this._escapeAttr(currentDevice)}"
          aria-label="ESPHome device name prefix"
        >
        <div class="hint">
          Must match your ESPHome <code>name:</code> field exactly.
          Entities are resolved as
          <code>sensor.&lt;device_name&gt;_target_1_x</code>, etc.
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
          value="${this._escapeAttr((_c = c.title) !== null && _c !== void 0 ? _c : '')}"
          aria-label="Card title"
        >
      </div>

      <div class="section-title">Detection</div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="max-range">Max Range</label>
          <input type="range" id="max-range" min="1000" max="8000" step="500"
            value="${(_d = c.max_range) !== null && _d !== void 0 ? _d : 6000}" aria-label="Max range in mm">
          <span class="range-value" id="max-range-val">${(((_e = c.max_range) !== null && _e !== void 0 ? _e : 6000) / 1000).toFixed(1)}m</span>
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="fov-angle">FOV Angle</label>
          <input type="range" id="fov-angle" min="60" max="180" step="10"
            value="${(_f = c.fov_angle) !== null && _f !== void 0 ? _f : 120}" aria-label="Field of view in degrees">
          <span class="range-value" id="fov-angle-val">${(_g = c.fov_angle) !== null && _g !== void 0 ? _g : 120}°</span>
        </div>
      </div>

      <div class="section-title">Display</div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="show-grid">Show Grid</label>
          <input type="checkbox" id="show-grid" ${((_h = c.show_grid) !== null && _h !== void 0 ? _h : true) ? 'checked' : ''}
            aria-label="Show polar grid">
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="show-sweep">Show Sweep</label>
          <input type="checkbox" id="show-sweep" ${((_j = c.show_sweep) !== null && _j !== void 0 ? _j : true) ? 'checked' : ''}
            aria-label="Show radar sweep animation">
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="show-trails">Show Trails</label>
          <input type="checkbox" id="show-trails" ${((_k = c.show_trails) !== null && _k !== void 0 ? _k : true) ? 'checked' : ''}
            aria-label="Show motion trails">
        </div>
      </div>

      <div class="editor-row">
        <div class="row-inline">
          <label for="trail-length">Trail Length</label>
          <input type="range" id="trail-length" min="2" max="30" step="1"
            value="${(_l = c.trail_length) !== null && _l !== void 0 ? _l : 12}" aria-label="Trail length">
          <span class="range-value" id="trail-length-val">${(_m = c.trail_length) !== null && _m !== void 0 ? _m : 12}</span>
        </div>
      </div>
    `;
        this._attachListeners();
    }
    _attachListeners() {
        const shadow = this._shadow;
        // Device dropdown
        const deviceSelect = shadow.getElementById('device-select');
        deviceSelect === null || deviceSelect === void 0 ? void 0 : deviceSelect.addEventListener('change', () => {
            const selected = deviceSelect.value;
            if (selected) {
                this._fireConfigChanged({ device_name: selected });
                // Sync the text input to show the selected value
                const input = shadow.getElementById('device-name');
                if (input)
                    input.value = selected;
            }
        });
        // Manual device name input (fallback)
        const deviceNameInput = shadow.getElementById('device-name');
        deviceNameInput === null || deviceNameInput === void 0 ? void 0 : deviceNameInput.addEventListener('change', () => {
            this._fireConfigChanged({ device_name: deviceNameInput.value.trim() });
        });
        const titleInput = shadow.getElementById('title');
        titleInput === null || titleInput === void 0 ? void 0 : titleInput.addEventListener('change', () => {
            this._fireConfigChanged({ title: titleInput.value });
        });
        const maxRange = shadow.getElementById('max-range');
        const maxRangeVal = shadow.getElementById('max-range-val');
        maxRange === null || maxRange === void 0 ? void 0 : maxRange.addEventListener('input', () => {
            const val = parseInt(maxRange.value, 10);
            if (maxRangeVal)
                maxRangeVal.textContent = `${(val / 1000).toFixed(1)}m`;
            this._fireConfigChanged({ max_range: val });
        });
        const fovAngle = shadow.getElementById('fov-angle');
        const fovAngleVal = shadow.getElementById('fov-angle-val');
        fovAngle === null || fovAngle === void 0 ? void 0 : fovAngle.addEventListener('input', () => {
            const val = parseInt(fovAngle.value, 10);
            if (fovAngleVal)
                fovAngleVal.textContent = `${val}°`;
            this._fireConfigChanged({ fov_angle: val });
        });
        const showGrid = shadow.getElementById('show-grid');
        showGrid === null || showGrid === void 0 ? void 0 : showGrid.addEventListener('change', () => {
            this._fireConfigChanged({ show_grid: showGrid.checked });
        });
        const showSweep = shadow.getElementById('show-sweep');
        showSweep === null || showSweep === void 0 ? void 0 : showSweep.addEventListener('change', () => {
            this._fireConfigChanged({ show_sweep: showSweep.checked });
        });
        const showTrails = shadow.getElementById('show-trails');
        showTrails === null || showTrails === void 0 ? void 0 : showTrails.addEventListener('change', () => {
            this._fireConfigChanged({ show_trails: showTrails.checked });
        });
        const trailLength = shadow.getElementById('trail-length');
        const trailLengthVal = shadow.getElementById('trail-length-val');
        trailLength === null || trailLength === void 0 ? void 0 : trailLength.addEventListener('input', () => {
            const val = parseInt(trailLength.value, 10);
            if (trailLengthVal)
                trailLengthVal.textContent = `${val}`;
            this._fireConfigChanged({ trail_length: val });
        });
        // Wall position buttons
        shadow.querySelectorAll('[data-wall-pos]').forEach(el => {
            el.addEventListener('click', () => {
                const pos = el.dataset['wallPos'];
                this._fireConfigChanged({ sensor_position: pos });
                this._render(); // re-render to update selected state
            });
        });
    }
    _escapeAttr(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

/**
 * Subscribe to state change events for specific entity IDs via HA WebSocket.
 * Returns an array of unsubscribe functions.
 */
async function subscribeEntities(hass, entityIds, callback) {
    const unsubscribes = await Promise.all(entityIds.map(entityId => hass.connection.subscribeMessage((msg) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const message = msg;
        // subscribe_entities returns compressed messages:
        //   Initial snapshot: { a: { entity_id: { s: state, a: attrs, ... } } }
        //   State changes:    { c: { entity_id: { "+": { s: state, ... } } } }
        // Handle initial state snapshot ("a" = added entities)
        const added = message.a;
        if (added && added[entityId]) {
            const item = added[entityId];
            callback(entityId, {
                state: (_a = item.s) !== null && _a !== void 0 ? _a : 'unknown',
                attributes: (_b = item.a) !== null && _b !== void 0 ? _b : {},
            });
        }
        // Handle state changes ("c" = changed entities)
        const changed = message.c;
        if (changed && changed[entityId]) {
            const delta = changed[entityId];
            // The delta contains "+" (new keys) or keys whose values changed
            const update = (_c = delta['+']) !== null && _c !== void 0 ? _c : delta;
            if (update && typeof update === 'object' && 's' in update) {
                const u = update;
                callback(entityId, {
                    state: (_d = u.s) !== null && _d !== void 0 ? _d : 'unknown',
                    attributes: (_e = u.a) !== null && _e !== void 0 ? _e : {},
                });
            }
        }
        // Also handle legacy state_changed event format for compatibility
        const legacy = message;
        if (legacy.type === 'event') {
            const data = (_f = legacy.event) === null || _f === void 0 ? void 0 : _f.data;
            if (data && data.entity_id === entityId) {
                callback(entityId, (_g = data.new_state) !== null && _g !== void 0 ? _g : null);
            }
        }
    }, { type: 'subscribe_entities', entity_ids: [entityId] })));
    return unsubscribes;
}
/**
 * Build the list of entity IDs for a given device name and target IDs.
 */
function buildEntityIds(deviceName, targetIds) {
    const result = [];
    for (const targetId of targetIds) {
        result.push({
            entityId: `sensor.${deviceName}_target_${targetId}_x`,
            targetId,
            axis: 'x',
        }, {
            entityId: `sensor.${deviceName}_target_${targetId}_y`,
            targetId,
            axis: 'y',
        }, {
            entityId: `sensor.${deviceName}_target_${targetId}_speed`,
            targetId,
            axis: 'speed',
        });
    }
    return result;
}

var cardCss = ":host {\n  display: block;\n  font-family: 'Inter', system-ui, -apple-system, sans-serif;\n  --radar-bg: #0a0e1a;\n  --radar-grid: rgba(99, 179, 237, 0.08);\n  --radar-sweep: rgba(99, 179, 237, 0.15);\n  --radar-fov: rgba(56, 189, 248, 0.06);\n  --radar-fov-border: rgba(56, 189, 248, 0.4);\n  --target-primary: #38bdf8;\n  --target-trail: rgba(56, 189, 248, 0.3);\n  --zone-fill: rgba(139, 92, 246, 0.15);\n  --zone-border: rgba(139, 92, 246, 0.7);\n  --zone-active: rgba(167, 139, 250, 0.3);\n  --furniture-fill: rgba(148, 163, 184, 0.12);\n  --furniture-border: rgba(148, 163, 184, 0.5);\n  --glass-surface: rgba(15, 23, 42, 0.8);\n  --glass-border: rgba(99, 179, 237, 0.12);\n  --text-primary: #e2e8f0;\n  --text-muted: rgba(148, 163, 184, 0.7);\n}\n\n/* Light color scheme */\n:host(.light-scheme) {\n  --radar-bg: #f0f4f8;\n  --radar-grid: rgba(59, 130, 246, 0.1);\n  --radar-sweep: rgba(59, 130, 246, 0.12);\n  --radar-fov: rgba(14, 165, 233, 0.07);\n  --radar-fov-border: rgba(14, 165, 233, 0.5);\n  --target-primary: #0284c7;\n  --target-trail: rgba(2, 132, 199, 0.3);\n  --zone-fill: rgba(109, 40, 217, 0.1);\n  --zone-border: rgba(109, 40, 217, 0.6);\n  --zone-active: rgba(139, 92, 246, 0.25);\n  --furniture-fill: rgba(100, 116, 139, 0.12);\n  --furniture-border: rgba(100, 116, 139, 0.55);\n  --glass-surface: rgba(255, 255, 255, 0.92);\n  --glass-border: rgba(59, 130, 246, 0.18);\n  --text-primary: #1e293b;\n  --text-muted: rgba(71, 85, 105, 0.8);\n}\n\n.card-container {\n  background: var(--glass-surface);\n  border: 1px solid var(--glass-border);\n  border-radius: 16px;\n  backdrop-filter: blur(20px);\n  -webkit-backdrop-filter: blur(20px);\n  overflow: hidden;\n  color: var(--text-primary);\n  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);\n}\n\n.card-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 14px 18px;\n  border-bottom: 1px solid var(--glass-border);\n  background: rgba(15, 23, 42, 0.4);\n}\n\n.card-title {\n  font-size: 15px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  color: var(--text-primary);\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.card-title::before {\n  content: '';\n  display: inline-block;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #38bdf8;\n  box-shadow: 0 0 8px #38bdf8;\n  animation: pulse-dot 2s ease-in-out infinite;\n}\n\n@keyframes pulse-dot {\n  0%, 100% { opacity: 1; transform: scale(1); }\n  50% { opacity: 0.6; transform: scale(0.85); }\n}\n\n.header-actions {\n  display: flex;\n  gap: 8px;\n}\n\n.icon-btn {\n  background: rgba(99, 179, 237, 0.08);\n  border: 1px solid rgba(99, 179, 237, 0.2);\n  border-radius: 8px;\n  color: var(--text-primary);\n  cursor: pointer;\n  padding: 6px 10px;\n  font-size: 12px;\n  font-family: inherit;\n  transition: background 0.15s, border-color 0.15s;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.icon-btn:hover {\n  background: rgba(99, 179, 237, 0.16);\n  border-color: rgba(99, 179, 237, 0.4);\n}\n\n.icon-btn.active {\n  background: rgba(56, 189, 248, 0.2);\n  border-color: rgba(56, 189, 248, 0.6);\n  color: #38bdf8;\n}\n\n.card-body {\n  display: flex;\n  flex-direction: row;\n  min-height: 400px;\n}\n\n.canvas-wrap {\n  flex: 1;\n  position: relative;\n  background: var(--radar-bg);\n  min-width: 0;\n}\n\ncanvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n  cursor: crosshair;\n}\n\ncanvas.cursor-default {\n  cursor: default;\n}\n\ncanvas.cursor-crosshair {\n  cursor: crosshair;\n}\n\ncanvas.cursor-grab {\n  cursor: grab;\n}\n\ncanvas.cursor-grabbing {\n  cursor: grabbing;\n}\n\ncanvas.cursor-move {\n  cursor: move;\n}\n\n.sidebar {\n  width: 200px;\n  min-width: 160px;\n  background: rgba(10, 14, 26, 0.7);\n  border-left: 1px solid var(--glass-border);\n  display: flex;\n  flex-direction: column;\n  overflow-y: auto;\n  overflow-x: hidden;\n}\n\n:host(.light-scheme) .sidebar {\n  background: rgba(241, 245, 249, 0.85);\n}\n\n:host(.light-scheme) .card-header {\n  background: rgba(248, 250, 252, 0.6);\n}\n\n:host(.light-scheme) .edit-toolbar {\n  background: rgba(241, 245, 249, 0.7);\n}\n\n:host(.light-scheme) .settings-overlay {\n  background: rgba(248, 250, 252, 0.98);\n}\n\n:host(.light-scheme) .zone-name-dialog {\n  background: rgba(255, 255, 255, 0.99);\n  border-color: rgba(59, 130, 246, 0.35);\n}\n\n:host(.light-scheme) .yaml-overlay {\n  background: rgba(248, 250, 252, 0.98);\n}\n\n:host(.light-scheme) .yaml-block {\n  background: rgba(241, 245, 249, 0.8);\n  border-color: rgba(59, 130, 246, 0.2);\n}\n\n:host(.light-scheme) .yaml-code {\n  color: #334155;\n}\n\n:host(.light-scheme) .icon-btn {\n  background: rgba(59, 130, 246, 0.08);\n  border-color: rgba(59, 130, 246, 0.2);\n}\n\n:host(.light-scheme) .icon-btn:hover {\n  background: rgba(59, 130, 246, 0.15);\n  border-color: rgba(59, 130, 246, 0.4);\n}\n\n:host(.light-scheme) .action-btn {\n  background: rgba(59, 130, 246, 0.07);\n  border-color: rgba(59, 130, 246, 0.18);\n}\n\n:host(.light-scheme) .action-btn:hover {\n  background: rgba(59, 130, 246, 0.14);\n  border-color: rgba(59, 130, 246, 0.4);\n}\n\n:host(.light-scheme) .furniture-btn {\n  background: rgba(59, 130, 246, 0.05);\n  border-color: rgba(59, 130, 246, 0.14);\n}\n\n:host(.light-scheme) .furniture-btn:hover {\n  background: rgba(59, 130, 246, 0.12);\n  border-color: rgba(59, 130, 246, 0.3);\n}\n\n:host(.light-scheme) .zone-name-input {\n  background: rgba(59, 130, 246, 0.07);\n  border-color: rgba(59, 130, 246, 0.2);\n  color: var(--text-primary);\n}\n\n.sidebar-section {\n  padding: 12px;\n  border-bottom: 1px solid rgba(99, 179, 237, 0.06);\n}\n\n.sidebar-label {\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n  color: var(--text-muted);\n  margin-bottom: 8px;\n}\n\n.zone-item {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 5px 0;\n  font-size: 12px;\n}\n\n.zone-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  flex-shrink: 0;\n  margin-right: 6px;\n}\n\n.zone-name {\n  flex: 1;\n  color: var(--text-primary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.zone-status {\n  font-size: 10px;\n  padding: 2px 6px;\n  border-radius: 4px;\n  font-weight: 600;\n}\n\n.zone-status.active {\n  background: rgba(167, 139, 250, 0.25);\n  color: #a78bfa;\n}\n\n.zone-status.clear {\n  color: var(--text-muted);\n}\n\n.target-item {\n  padding: 5px 0;\n  font-size: 12px;\n}\n\n.target-header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin-bottom: 2px;\n}\n\n.target-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  flex-shrink: 0;\n}\n\n.target-label {\n  font-weight: 600;\n  color: var(--text-primary);\n}\n\n.target-inactive {\n  color: var(--text-muted);\n  font-style: italic;\n}\n\n.target-coords {\n  font-size: 11px;\n  color: var(--text-muted);\n  font-variant-numeric: tabular-nums;\n  padding-left: 14px;\n}\n\n.sidebar-actions {\n  padding: 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin-top: auto;\n}\n\n.action-btn {\n  background: rgba(99, 179, 237, 0.08);\n  border: 1px solid rgba(99, 179, 237, 0.2);\n  border-radius: 8px;\n  color: var(--text-primary);\n  cursor: pointer;\n  padding: 7px 10px;\n  font-size: 12px;\n  font-family: inherit;\n  text-align: left;\n  transition: background 0.15s, border-color 0.15s;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.action-btn:hover {\n  background: rgba(99, 179, 237, 0.16);\n  border-color: rgba(99, 179, 237, 0.4);\n}\n\n.action-btn.active {\n  background: rgba(139, 92, 246, 0.2);\n  border-color: rgba(139, 92, 246, 0.6);\n  color: #a78bfa;\n}\n\n/* Edit toolbar */\n.edit-toolbar {\n  padding: 8px 12px;\n  border-bottom: 1px solid var(--glass-border);\n  background: rgba(10, 14, 26, 0.5);\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n}\n\n.toolbar-group {\n  display: flex;\n  gap: 4px;\n  align-items: center;\n}\n\n.toolbar-separator {\n  width: 1px;\n  height: 20px;\n  background: var(--glass-border);\n  margin: 0 4px;\n}\n\n/* Furniture picker */\n.furniture-picker {\n  padding: 8px;\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 4px;\n}\n\n.furniture-btn {\n  background: rgba(99, 179, 237, 0.05);\n  border: 1px solid rgba(99, 179, 237, 0.15);\n  border-radius: 6px;\n  cursor: pointer;\n  padding: 6px 4px;\n  font-size: 10px;\n  color: var(--text-muted);\n  text-align: center;\n  transition: background 0.15s, border-color 0.15s;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 2px;\n}\n\n.furniture-btn:hover {\n  background: rgba(99, 179, 237, 0.12);\n  border-color: rgba(99, 179, 237, 0.3);\n  color: var(--text-primary);\n}\n\n.furniture-btn.selected {\n  background: rgba(56, 189, 248, 0.15);\n  border-color: rgba(56, 189, 248, 0.5);\n  color: #38bdf8;\n}\n\n.furniture-btn-icon {\n  font-size: 16px;\n  line-height: 1;\n}\n\n.furniture-btn-label {\n  font-size: 9px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 100%;\n}\n\n/* Settings overlay */\n.settings-overlay {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  width: 280px;\n  background: rgba(10, 14, 26, 0.95);\n  border-left: 1px solid var(--glass-border);\n  display: flex;\n  flex-direction: column;\n  z-index: 100;\n  overflow-y: auto;\n  backdrop-filter: blur(20px);\n  transform: translateX(100%);\n  transition: transform 0.2s ease;\n}\n\n.settings-overlay.open {\n  transform: translateX(0);\n}\n\n.settings-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 12px 16px;\n  border-bottom: 1px solid var(--glass-border);\n  font-weight: 600;\n}\n\n.settings-body {\n  padding: 12px 16px;\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n\n.setting-group {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.setting-label {\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: var(--text-muted);\n}\n\n.setting-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n\n.setting-row label {\n  font-size: 13px;\n  color: var(--text-primary);\n  flex: 1;\n}\n\n.setting-row select {\n  flex: 1;\n  background: rgba(99, 179, 237, 0.08);\n  border: 1px solid var(--glass-border);\n  border-radius: 6px;\n  padding: 5px 8px;\n  color: var(--text-primary);\n  font-family: inherit;\n  font-size: 12px;\n  cursor: pointer;\n  outline: none;\n}\n\n.setting-row select:focus {\n  border-color: rgba(56, 189, 248, 0.5);\n}\n\n:host(.light-scheme) .setting-row select {\n  background: rgba(59, 130, 246, 0.07);\n  border-color: rgba(59, 130, 246, 0.18);\n}\n\n.setting-row input[type=\"range\"] {\n  flex: 1;\n  accent-color: #38bdf8;\n}\n\n.setting-row input[type=\"checkbox\"] {\n  accent-color: #38bdf8;\n  width: 16px;\n  height: 16px;\n}\n\n.setting-row input[type=\"color\"] {\n  width: 32px;\n  height: 24px;\n  border: 1px solid var(--glass-border);\n  border-radius: 4px;\n  cursor: pointer;\n  background: none;\n  padding: 0;\n}\n\n.setting-value {\n  font-size: 12px;\n  color: var(--text-muted);\n  font-variant-numeric: tabular-nums;\n  min-width: 36px;\n  text-align: right;\n}\n\n/* Zone name dialog */\n.zone-name-dialog {\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  transform: translate(-50%, -50%);\n  background: rgba(15, 23, 42, 0.98);\n  border: 1px solid rgba(99, 179, 237, 0.3);\n  border-radius: 12px;\n  padding: 20px;\n  z-index: 200;\n  min-width: 240px;\n  backdrop-filter: blur(20px);\n  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);\n}\n\n.zone-name-dialog h3 {\n  font-size: 14px;\n  font-weight: 600;\n  margin: 0 0 12px 0;\n  color: var(--text-primary);\n}\n\n.zone-name-input {\n  width: 100%;\n  background: rgba(99, 179, 237, 0.08);\n  border: 1px solid rgba(99, 179, 237, 0.2);\n  border-radius: 6px;\n  padding: 8px 10px;\n  color: var(--text-primary);\n  font-family: inherit;\n  font-size: 13px;\n  box-sizing: border-box;\n  outline: none;\n}\n\n.zone-name-input:focus {\n  border-color: rgba(99, 179, 237, 0.5);\n  background: rgba(99, 179, 237, 0.12);\n}\n\n.dialog-actions {\n  display: flex;\n  gap: 8px;\n  margin-top: 12px;\n  justify-content: flex-end;\n}\n\n.btn-primary {\n  background: rgba(56, 189, 248, 0.2);\n  border: 1px solid rgba(56, 189, 248, 0.5);\n  border-radius: 6px;\n  color: #38bdf8;\n  cursor: pointer;\n  padding: 6px 14px;\n  font-family: inherit;\n  font-size: 12px;\n  transition: background 0.15s;\n}\n\n.btn-primary:hover {\n  background: rgba(56, 189, 248, 0.3);\n}\n\n.btn-secondary {\n  background: transparent;\n  border: 1px solid rgba(99, 179, 237, 0.2);\n  border-radius: 6px;\n  color: var(--text-muted);\n  cursor: pointer;\n  padding: 6px 14px;\n  font-family: inherit;\n  font-size: 12px;\n  transition: background 0.15s;\n}\n\n.btn-secondary:hover {\n  background: rgba(99, 179, 237, 0.08);\n}\n\n/* YAML export overlay */\n.yaml-overlay {\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: rgba(10, 14, 26, 0.98);\n  z-index: 300;\n  display: flex;\n  flex-direction: column;\n  padding: 16px;\n  overflow-y: auto;\n}\n\n.yaml-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 12px;\n  flex-shrink: 0;\n}\n\n.yaml-header h3 {\n  font-size: 14px;\n  font-weight: 600;\n  margin: 0;\n  color: var(--text-primary);\n}\n\n.yaml-block {\n  background: rgba(0, 0, 0, 0.4);\n  border: 1px solid rgba(99, 179, 237, 0.15);\n  border-radius: 8px;\n  padding: 12px;\n  flex: 1;\n  overflow-y: auto;\n  position: relative;\n}\n\n.yaml-code {\n  font-family: 'Fira Mono', 'Consolas', monospace;\n  font-size: 11px;\n  color: #94a3b8;\n  white-space: pre;\n  line-height: 1.5;\n}\n\n.copy-btn {\n  position: absolute;\n  top: 8px;\n  right: 8px;\n  background: rgba(99, 179, 237, 0.12);\n  border: 1px solid rgba(99, 179, 237, 0.25);\n  border-radius: 6px;\n  color: var(--text-muted);\n  cursor: pointer;\n  padding: 4px 8px;\n  font-size: 11px;\n  font-family: inherit;\n  transition: background 0.15s;\n}\n\n.copy-btn:hover {\n  background: rgba(99, 179, 237, 0.2);\n  color: var(--text-primary);\n}\n\n/* Tooltip */\n.tooltip {\n  position: absolute;\n  background: rgba(15, 23, 42, 0.95);\n  border: 1px solid rgba(99, 179, 237, 0.25);\n  border-radius: 6px;\n  padding: 5px 8px;\n  font-size: 11px;\n  color: var(--text-muted);\n  pointer-events: none;\n  z-index: 50;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n\n/* Responsive */\n@media (max-width: 500px) {\n  .card-body {\n    flex-direction: column;\n  }\n  .sidebar {\n    width: 100%;\n    border-left: none;\n    border-top: 1px solid var(--glass-border);\n    flex-direction: row;\n    flex-wrap: wrap;\n    max-height: 200px;\n    overflow-y: auto;\n  }\n  .sidebar-section {\n    flex: 1;\n    min-width: 140px;\n  }\n  .sidebar-actions {\n    flex-direction: row;\n    flex-wrap: wrap;\n    margin-top: 0;\n    padding: 8px;\n  }\n}\n";

var _a;
const SENSOR_MARGIN = 40;
const DEFAULT_CONFIG = {
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
    constructor() {
        super();
        this._config = DEFAULT_CONFIG;
        this._hass = null;
        this._radarCanvas = null;
        this._tracker = null;
        this._furnitureLayer = null;
        this._zoneEditor = null;
        this._configEditor = null;
        this._unsubscribes = [];
        this._rafId = null;
        this._resizeObserver = null;
        this._editMode = 'none';
        this._showSettings = false;
        this._showYaml = false;
        this._selectedFurnitureType = null;
        this._isEditMode = false;
        this._history = [];
        this._historyIndex = -1;
        this._zoneNamePending = null;
        this._tickInterval = null;
        this._dragPlacingId = null;
        this._dragPlaceStartMm = null;
        // Current canvas-coordinate mouse position while in draw-zone mode (for preview line)
        this._drawMousePos = null;
        // Index of the hovered drawing vertex (0 = first vertex, for close-polygon indicator)
        this._drawHoveredVertex = null;
        this._shadow = this.attachShadow({ mode: 'open' });
    }
    // Called by HA to set the card config
    setConfig(config) {
        this._config = { ...DEFAULT_CONFIG, ...config };
        // Ensure arrays have defaults
        if (!this._config.targets || !this._config.targets.length) {
            this._config.targets = DEFAULT_CONFIG.targets;
        }
        if (!this._config.furniture)
            this._config.furniture = [];
        if (!this._config.zones)
            this._config.zones = [];
        this._applyColorScheme();
        this._init();
    }
    set hass(hass) {
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
    connectedCallback() {
        this._startRenderLoop();
    }
    disconnectedCallback() {
        var _a, _b;
        this._stopRenderLoop();
        this._unsubAll();
        (_a = this._resizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        if (this._tickInterval !== null) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
        (_b = this._radarCanvas) === null || _b === void 0 ? void 0 : _b.stopAnimation();
    }
    _applyColorScheme() {
        if (this._config.color_scheme === 'light') {
            this.classList.add('light-scheme');
        }
        else {
            this.classList.remove('light-scheme');
        }
    }
    _toggleColorScheme() {
        var _a, _b;
        const next = this._config.color_scheme === 'light' ? 'dark' : 'light';
        this._config = { ...this._config, color_scheme: next };
        this._applyColorScheme();
        (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.updateConfig(this._config);
        (_b = this._radarCanvas) === null || _b === void 0 ? void 0 : _b.markDirty();
        this._renderDOM();
        this._setupCanvas();
    }
    _init() {
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
        if (this._tickInterval !== null)
            clearInterval(this._tickInterval);
        this._tickInterval = setInterval(() => {
            var _a;
            (_a = this._tracker) === null || _a === void 0 ? void 0 : _a.tick();
        }, 500);
    }
    _renderDOM() {
        this._shadow.innerHTML = `
      <style>${cardCss}</style>
      <div class="card-container">
        ${this._renderHeader()}
        ${this._isEditMode ? this._renderEditToolbar() : ''}
        <div class="card-body">
          <div class="canvas-wrap" id="canvas-wrap">
            <canvas id="radar-canvas" aria-label="Radar visualization"></canvas>
            <div class="tooltip" id="coord-tooltip" style="display:none"></div>
            ${this._zoneNamePending ? this._renderZoneNameDialog() : ''}
            ${this._showSettings ? this._renderSettingsPanel() : ''}
            ${this._showYaml ? this._renderYamlPanel() : ''}
          </div>
          ${this._renderSidebar()}
        </div>
      </div>
    `;
        this._applyColorScheme();
        this._attachEventListeners();
    }
    _renderHeader() {
        var _a;
        const isLight = this._config.color_scheme === 'light';
        return `
      <div class="card-header">
        <div class="card-title">${(_a = this._config.title) !== null && _a !== void 0 ? _a : 'LD2450 Radar'}</div>
        <div class="header-actions">
          <button class="icon-btn ${isLight ? 'active' : ''}" id="btn-theme" aria-label="Toggle light/dark theme"
            title="${isLight ? 'Switch to dark mode' : 'Switch to light mode'}">
            ${isLight ? '☀️' : '🌙'}
          </button>
          <button class="icon-btn ${this._isEditMode ? 'active' : ''}" id="btn-edit" aria-label="Toggle edit mode">
            ✏️ Edit
          </button>
          <button class="icon-btn ${this._showSettings ? 'active' : ''}" id="btn-settings" aria-label="Open settings">
            ⚙️
          </button>
        </div>
      </div>
    `;
    }
    _renderEditToolbar() {
        var _a, _b;
        const modes = [
            { id: 'select', label: 'Select', icon: '↖️' },
            { id: 'draw-zone', label: 'Draw Zone', icon: '📐' },
            { id: 'add-furniture', label: 'Add Furniture', icon: '🛋️' },
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
          <button class="icon-btn" id="btn-undo" aria-label="Undo" ${this._historyIndex <= 0 ? 'disabled' : ''}>↩</button>
          <button class="icon-btn" id="btn-redo" aria-label="Redo" ${this._historyIndex >= this._history.length - 1 ? 'disabled' : ''}>↪</button>
        </div>
        <div class="toolbar-separator"></div>
        <button class="icon-btn" id="btn-save" aria-label="Save">💾 Save</button>
      </div>
      ${this._editMode === 'add-furniture' ? ((_b = (_a = this._configEditor) === null || _a === void 0 ? void 0 : _a.renderFurniturePicker(this._selectedFurnitureType)) !== null && _b !== void 0 ? _b : '') : ''}
    `;
    }
    _renderSidebar() {
        var _a, _b, _c, _d;
        const zones = (_b = (_a = this._zoneEditor) === null || _a === void 0 ? void 0 : _a.getZones()) !== null && _b !== void 0 ? _b : [];
        const targets = (_d = (_c = this._tracker) === null || _c === void 0 ? void 0 : _c.getTargets()) !== null && _d !== void 0 ? _d : [];
        return `
      <div class="sidebar">
        ${zones.length > 0 ? `
          <div class="sidebar-section">
            <div class="sidebar-label">Zones</div>
            ${zones.map(z => `
              <div class="zone-item">
                <span class="zone-dot" style="background:${z.color}"></span>
                <span class="zone-name">${z.name}</span>
                <span class="zone-status ${z.occupied ? 'active' : 'clear'}">${z.occupied ? 'Active' : 'Clear'}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="sidebar-section">
          <div class="sidebar-label">Targets</div>
          ${targets.map(t => t.active ? `
            <div class="target-item">
              <div class="target-header">
                <span class="target-dot" style="background:${t.color}"></span>
                <span class="target-label">${t.label || `T${t.id}`}</span>
              </div>
              <div class="target-coords">
                x: ${t.x.toFixed(0)}mm &nbsp; y: ${t.y.toFixed(0)}mm
              </div>
            </div>
          ` : `
            <div class="target-item">
              <div class="target-header">
                <span class="target-dot" style="background:${t.color};opacity:0.3"></span>
                <span class="target-inactive">${t.label || `T${t.id}`} (inactive)</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="sidebar-actions">
          <button class="action-btn ${this._editMode === 'draw-zone' ? 'active' : ''}"
            id="btn-draw-zone" aria-label="Draw zone">
            📐 Draw Zone
          </button>
          <button class="action-btn ${this._editMode === 'add-furniture' ? 'active' : ''}"
            id="btn-add-furniture" aria-label="Add furniture">
            🛋️ Add Furniture
          </button>
          <button class="action-btn" id="btn-export-yaml" aria-label="Export zone YAML">
            📋 Export YAML
          </button>
        </div>
      </div>
    `;
    }
    _renderSettingsPanel() {
        var _a, _b;
        return `
      <div class="settings-overlay open" id="settings-panel">
        <div class="settings-header">
          <span>Settings</span>
          <button class="icon-btn" id="btn-close-settings" aria-label="Close settings">✕</button>
        </div>
        <div class="settings-body" id="settings-body">
          ${(_b = (_a = this._configEditor) === null || _a === void 0 ? void 0 : _a.renderHTML()) !== null && _b !== void 0 ? _b : ''}
        </div>
      </div>
    `;
    }
    _renderYamlPanel() {
        const yaml = generateZoneYaml(this._config);
        return `
      <div class="yaml-overlay" id="yaml-panel">
        <div class="yaml-header">
          <h3>Zone Template YAML</h3>
          <button class="icon-btn" id="btn-close-yaml" aria-label="Close YAML export">✕</button>
        </div>
        <div class="yaml-block">
          <button class="copy-btn" id="btn-copy-yaml" aria-label="Copy YAML">Copy</button>
          <pre class="yaml-code" id="yaml-content">${this._escapeHtml(yaml)}</pre>
        </div>
      </div>
    `;
    }
    _renderZoneNameDialog() {
        var _a, _b;
        return `
      <div class="zone-name-dialog" id="zone-name-dialog" role="dialog" aria-modal="true" aria-label="Name this zone">
        <h3>Name this zone</h3>
        <input type="text" class="zone-name-input" id="zone-name-input"
          value="Zone ${((_b = (_a = this._zoneEditor) === null || _a === void 0 ? void 0 : _a.getZones().length) !== null && _b !== void 0 ? _b : 0) + 1}"
          placeholder="Zone name"
          aria-label="Zone name">
        <div class="dialog-actions">
          <button class="btn-secondary" id="btn-cancel-zone" aria-label="Cancel">Cancel</button>
          <button class="btn-primary" id="btn-confirm-zone" aria-label="Confirm zone name">Add Zone</button>
        </div>
      </div>
    `;
    }
    _attachEventListeners() {
        var _a, _b, _c, _d, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const $ = (id) => this._shadow.getElementById(id);
        (_a = $('btn-theme')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
            this._toggleColorScheme();
        });
        (_b = $('btn-edit')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
            this._isEditMode = !this._isEditMode;
            if (!this._isEditMode)
                this._editMode = 'none';
            this._renderDOM();
            this._setupCanvas();
        });
        (_c = $('btn-settings')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', () => {
            var _a;
            this._showSettings = !this._showSettings;
            this._renderDOM();
            this._setupCanvas();
            if (this._showSettings) {
                const settingsBody = this._shadow.getElementById('settings-body');
                if (settingsBody)
                    (_a = this._configEditor) === null || _a === void 0 ? void 0 : _a.attachListeners(settingsBody);
            }
        });
        (_d = $('btn-close-settings')) === null || _d === void 0 ? void 0 : _d.addEventListener('click', () => {
            this._showSettings = false;
            this._renderDOM();
            this._setupCanvas();
        });
        (_f = $('btn-close-yaml')) === null || _f === void 0 ? void 0 : _f.addEventListener('click', () => {
            this._showYaml = false;
            this._renderDOM();
            this._setupCanvas();
        });
        (_g = $('btn-copy-yaml')) === null || _g === void 0 ? void 0 : _g.addEventListener('click', () => {
            var _a;
            const pre = $('yaml-content');
            if (pre)
                void navigator.clipboard.writeText((_a = pre.textContent) !== null && _a !== void 0 ? _a : '');
        });
        (_h = $('btn-export-yaml')) === null || _h === void 0 ? void 0 : _h.addEventListener('click', () => {
            this._showYaml = true;
            this._renderDOM();
            this._setupCanvas();
        });
        (_j = $('btn-draw-zone')) === null || _j === void 0 ? void 0 : _j.addEventListener('click', () => {
            this._startDrawingMode();
        });
        (_k = $('btn-add-furniture')) === null || _k === void 0 ? void 0 : _k.addEventListener('click', () => {
            this._editMode = this._editMode === 'add-furniture' ? 'none' : 'add-furniture';
            this._isEditMode = this._editMode !== 'none';
            this._renderDOM();
            this._setupCanvas();
        });
        (_l = $('btn-undo')) === null || _l === void 0 ? void 0 : _l.addEventListener('click', () => this._undo());
        (_m = $('btn-redo')) === null || _m === void 0 ? void 0 : _m.addEventListener('click', () => this._redo());
        (_o = $('btn-save')) === null || _o === void 0 ? void 0 : _o.addEventListener('click', () => void this._save());
        // Edit mode toolbar buttons
        this._shadow.querySelectorAll('[data-mode]').forEach(el => {
            el.addEventListener('click', () => {
                const mode = el.dataset['mode'];
                if (mode === 'draw-zone') {
                    this._startDrawingMode();
                }
                else {
                    this._editMode = mode;
                    if (mode === 'add-furniture')
                        this._selectedFurnitureType = null;
                    this._renderDOM();
                    this._setupCanvas();
                }
            });
        });
        // Furniture picker buttons
        this._shadow.querySelectorAll('[data-furniture-type]').forEach(el => {
            el.addEventListener('click', () => {
                var _a;
                this._selectedFurnitureType = (_a = el.dataset['furnitureType']) !== null && _a !== void 0 ? _a : null;
                this._renderDOM();
                this._setupCanvas();
            });
        });
        // Zone name dialog
        (_p = $('btn-confirm-zone')) === null || _p === void 0 ? void 0 : _p.addEventListener('click', () => this._confirmZoneName());
        (_q = $('btn-cancel-zone')) === null || _q === void 0 ? void 0 : _q.addEventListener('click', () => {
            this._zoneNamePending = null;
            this._renderDOM();
            this._setupCanvas();
        });
        const zoneInput = $('zone-name-input');
        zoneInput === null || zoneInput === void 0 ? void 0 : zoneInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                this._confirmZoneName();
        });
        zoneInput === null || zoneInput === void 0 ? void 0 : zoneInput.focus();
    }
    _startDrawingMode() {
        var _a;
        this._editMode = 'draw-zone';
        this._isEditMode = true;
        (_a = this._zoneEditor) === null || _a === void 0 ? void 0 : _a.startDrawing();
        this._renderDOM();
        this._setupCanvas();
    }
    _confirmZoneName() {
        var _a, _b, _c, _d;
        const input = this._shadow.getElementById('zone-name-input');
        const name = ((_a = input === null || input === void 0 ? void 0 : input.value) === null || _a === void 0 ? void 0 : _a.trim()) || 'Zone';
        if (this._zoneNamePending) {
            const zone = { ...this._zoneNamePending, name };
            (_b = this._zoneEditor) === null || _b === void 0 ? void 0 : _b.addZone(zone);
            this._zoneNamePending = null;
            this._config.zones = (_d = (_c = this._zoneEditor) === null || _c === void 0 ? void 0 : _c.getZoneConfigs()) !== null && _d !== void 0 ? _d : [];
            this._pushHistory();
            this._dispatchZoneChange(zone.id, false);
        }
        this._editMode = 'select';
        this._renderDOM();
        this._setupCanvas();
    }
    _setupCanvas() {
        const canvas = this._shadow.getElementById('radar-canvas');
        const wrap = this._shadow.getElementById('canvas-wrap');
        if (!canvas || !wrap)
            return;
        // Set canvas size to match wrapper
        const rect = wrap.getBoundingClientRect();
        const size = Math.max(rect.width || 300, 200);
        const height = Math.max(rect.height || 300, 200);
        canvas.width = size;
        canvas.height = height;
        if (!this._radarCanvas) {
            this._radarCanvas = new RadarCanvas(canvas, this._config);
            this._radarCanvas.startAnimation();
        }
        else {
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
                var _a;
                const currentWrap = this._shadow.getElementById('canvas-wrap');
                if (currentWrap) {
                    const r = currentWrap.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.resize(r.width, r.height);
                    }
                }
            });
        }
        this._resizeObserver.disconnect();
        this._resizeObserver.observe(wrap);
    }
    _attachCanvasListeners(canvas) {
        var _a;
        // Remove old listeners by cloning
        const newCanvas = canvas.cloneNode(true);
        (_a = canvas.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(newCanvas, canvas);
        let mouseIsDown = false;
        newCanvas.addEventListener('mousemove', (e) => {
            var _a, _b, _c, _d, _f, _g, _h, _j;
            const pos = this._getCanvasPos(newCanvas, e);
            const tooltip = this._shadow.getElementById('coord-tooltip');
            if (this._editMode === 'draw-zone' && this._zoneEditor) {
                const hovered = this._zoneEditor.isNearFirstVertex(pos.x, pos.y, newCanvas.width, newCanvas.height);
                // Track mouse position and first-vertex hover so the preview line and
                // close-polygon indicator are rendered in the draw overlay.
                this._drawMousePos = pos;
                this._drawHoveredVertex = hovered ? 0 : null;
                (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.markDirty();
            }
            else {
                this._drawMousePos = null;
                this._drawHoveredVertex = null;
            }
            if (mouseIsDown) {
                if (this._editMode === 'add-furniture' && this._dragPlacingId && this._dragPlaceStartMm) {
                    // Update the dragged item's size and center based on current mouse position
                    const mm = canvasToMm(pos.x, pos.y, newCanvas.width, newCanvas.height, this._config.max_range, SENSOR_MARGIN, (_b = this._config.sensor_position) !== null && _b !== void 0 ? _b : 'bottom');
                    const item = (_c = this._furnitureLayer) === null || _c === void 0 ? void 0 : _c.getItems().find(i => i.id === this._dragPlacingId);
                    if (item) {
                        const w = Math.abs(mm.x - this._dragPlaceStartMm.x);
                        const h = Math.abs(mm.y - this._dragPlaceStartMm.y);
                        item.width = Math.max(100, w);
                        item.height = Math.max(100, h);
                        item.x = (mm.x + this._dragPlaceStartMm.x) / 2;
                        item.y = (mm.y + this._dragPlaceStartMm.y) / 2;
                        // Config array is synced on mouseup; just mark dirty for live preview
                        (_d = this._radarCanvas) === null || _d === void 0 ? void 0 : _d.markDirty();
                    }
                }
                else if (this._editMode === 'select') {
                    (_f = this._furnitureLayer) === null || _f === void 0 ? void 0 : _f.onMouseMove(pos.x, pos.y, newCanvas.width, newCanvas.height);
                    (_g = this._zoneEditor) === null || _g === void 0 ? void 0 : _g.onMouseMove(pos.x, pos.y, newCanvas.width, newCanvas.height);
                    (_h = this._radarCanvas) === null || _h === void 0 ? void 0 : _h.markDirty();
                }
            }
            // Coordinate tooltip
            if (tooltip) {
                const mm = canvasToMm(pos.x, pos.y, newCanvas.width, newCanvas.height, this._config.max_range, SENSOR_MARGIN, (_j = this._config.sensor_position) !== null && _j !== void 0 ? _j : 'bottom');
                tooltip.textContent = `x: ${mm.x.toFixed(0)}mm  y: ${mm.y.toFixed(0)}mm`;
                tooltip.style.display = 'block';
                tooltip.style.left = `${pos.x + 12}px`;
                tooltip.style.top = `${pos.y - 20}px`;
            }
        });
        newCanvas.addEventListener('mouseleave', () => {
            var _a;
            const tooltip = this._shadow.getElementById('coord-tooltip');
            if (tooltip)
                tooltip.style.display = 'none';
            // Clear drawing preview when mouse leaves canvas
            this._drawMousePos = null;
            this._drawHoveredVertex = null;
            (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.markDirty();
        });
        newCanvas.addEventListener('mousedown', (e) => {
            var _a, _b, _c, _d, _f, _g, _h, _j;
            mouseIsDown = true;
            const pos = this._getCanvasPos(newCanvas, e);
            if (this._editMode === 'draw-zone' && this._zoneEditor) {
                this._zoneEditor.handleDrawClick(pos.x, pos.y, newCanvas.width, newCanvas.height);
                (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.markDirty();
            }
            else if (this._editMode === 'add-furniture' && this._selectedFurnitureType) {
                this._pushHistory();
                const placed = (_b = this._furnitureLayer) === null || _b === void 0 ? void 0 : _b.placeAt(this._selectedFurnitureType, pos.x, pos.y, newCanvas.width, newCanvas.height);
                if (placed) {
                    // Place at default size immediately; user can resize via handles in select mode
                    this._dragPlacingId = null;
                    this._dragPlaceStartMm = null;
                    // Switch to select mode after placing and auto-select the new item
                    this._editMode = 'select';
                }
                this._config.furniture = (_d = (_c = this._furnitureLayer) === null || _c === void 0 ? void 0 : _c.getFurnitureConfigs()) !== null && _d !== void 0 ? _d : [];
                (_f = this._radarCanvas) === null || _f === void 0 ? void 0 : _f.markDirty();
                // Re-render toolbar to reflect mode change
                this._renderDOM();
                this._setupCanvas();
            }
            else if (this._editMode === 'select') {
                const consumed = (_g = this._furnitureLayer) === null || _g === void 0 ? void 0 : _g.onMouseDown(pos.x, pos.y, newCanvas.width, newCanvas.height);
                if (!consumed) {
                    (_h = this._zoneEditor) === null || _h === void 0 ? void 0 : _h.onMouseDown(pos.x, pos.y, newCanvas.width, newCanvas.height);
                }
                (_j = this._radarCanvas) === null || _j === void 0 ? void 0 : _j.markDirty();
            }
        });
        newCanvas.addEventListener('mouseup', () => {
            var _a, _b, _c, _d, _f, _g;
            mouseIsDown = false;
            this._dragPlacingId = null;
            this._dragPlaceStartMm = null;
            (_a = this._furnitureLayer) === null || _a === void 0 ? void 0 : _a.onMouseUp();
            (_b = this._zoneEditor) === null || _b === void 0 ? void 0 : _b.onMouseUp();
            this._config.furniture = (_d = (_c = this._furnitureLayer) === null || _c === void 0 ? void 0 : _c.getFurnitureConfigs()) !== null && _d !== void 0 ? _d : [];
            this._config.zones = (_g = (_f = this._zoneEditor) === null || _f === void 0 ? void 0 : _f.getZoneConfigs()) !== null && _g !== void 0 ? _g : [];
        });
        newCanvas.addEventListener('dblclick', (e) => {
            var _a;
            const pos = this._getCanvasPos(newCanvas, e);
            if (this._editMode === 'select' && this._zoneEditor) {
                this._zoneEditor.onDoubleClick(pos.x, pos.y, newCanvas.width, newCanvas.height);
                (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.markDirty();
            }
        });
        newCanvas.addEventListener('keydown', (e) => {
            var _a, _b, _c, _d, _f, _g;
            if (e.key === 'Enter' && this._editMode === 'draw-zone') {
                const closed = (_a = this._zoneEditor) === null || _a === void 0 ? void 0 : _a.finishDrawing();
                if (closed)
                    (_b = this._radarCanvas) === null || _b === void 0 ? void 0 : _b.markDirty();
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && this._editMode === 'select') {
                this._pushHistory();
                (_c = this._furnitureLayer) === null || _c === void 0 ? void 0 : _c.deleteSelected();
                this._config.furniture = (_f = (_d = this._furnitureLayer) === null || _d === void 0 ? void 0 : _d.getFurnitureConfigs()) !== null && _f !== void 0 ? _f : [];
                (_g = this._radarCanvas) === null || _g === void 0 ? void 0 : _g.markDirty();
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
    _getCanvasPos(canvas, e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }
    _startRenderLoop() {
        const loop = () => {
            var _a, _b, _c, _d, _f, _g, _h, _j, _k, _l, _m;
            const canvas = this._shadow.querySelector('#radar-canvas');
            if (!canvas || !this._radarCanvas) {
                this._rafId = requestAnimationFrame(loop);
                return;
            }
            const targets = (_b = (_a = this._tracker) === null || _a === void 0 ? void 0 : _a.getTargets()) !== null && _b !== void 0 ? _b : [];
            const zones = (_d = (_c = this._zoneEditor) === null || _c === void 0 ? void 0 : _c.getZones()) !== null && _d !== void 0 ? _d : [];
            const furniture = (_g = (_f = this._furnitureLayer) === null || _f === void 0 ? void 0 : _f.getItems()) !== null && _g !== void 0 ? _g : [];
            // Update zone occupancy
            const occupiedZones = (_j = (_h = this._tracker) === null || _h === void 0 ? void 0 : _h.getOccupiedZones(zones)) !== null && _j !== void 0 ? _j : new Set();
            (_k = this._zoneEditor) === null || _k === void 0 ? void 0 : _k.updateOccupancy(occupiedZones);
            // Dispatch zone change events
            for (const zone of zones) {
                const wasOccupied = zone.occupied;
                const isNowOccupied = occupiedZones.has(zone.id);
                if (wasOccupied !== isNowOccupied) {
                    this._dispatchZoneChange(zone.id, isNowOccupied);
                }
            }
            const drawingState = {
                mode: this._editMode,
                zoneVertices: (_m = (_l = this._zoneEditor) === null || _l === void 0 ? void 0 : _l.getDrawingVertices()) !== null && _m !== void 0 ? _m : [],
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
    _updateSidebarInPlace() {
        var _a, _b, _c, _d;
        // Update target coords and zone status without full re-render
        const targets = (_b = (_a = this._tracker) === null || _a === void 0 ? void 0 : _a.getTargets()) !== null && _b !== void 0 ? _b : [];
        const zones = (_d = (_c = this._zoneEditor) === null || _c === void 0 ? void 0 : _c.getZones()) !== null && _d !== void 0 ? _d : [];
        for (const t of targets) {
            const coordEl = this._shadow.querySelector(`.target-item:nth-child(${t.id}) .target-coords`);
            if (coordEl && t.active) {
                coordEl.textContent = `x: ${t.x.toFixed(0)}mm   y: ${t.y.toFixed(0)}mm`;
            }
        }
        for (const zone of zones) {
            // Find by zone name (simple approach)
            this._shadow.querySelectorAll('.zone-item').forEach(el => {
                const nameEl = el.querySelector('.zone-name');
                if ((nameEl === null || nameEl === void 0 ? void 0 : nameEl.textContent) === zone.name) {
                    const statusEl = el.querySelector('.zone-status');
                    if (statusEl) {
                        statusEl.textContent = zone.occupied ? 'Active' : 'Clear';
                        statusEl.className = `zone-status ${zone.occupied ? 'active' : 'clear'}`;
                    }
                }
            });
        }
    }
    _stopRenderLoop() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }
    async _subscribeEntities() {
        if (!this._hass)
            return;
        const entityMappings = buildEntityIds(this._config.device_name, this._config.targets.map(t => t.id));
        const entityIds = entityMappings.map(m => m.entityId);
        try {
            this._unsubscribes = await subscribeEntities(this._hass, entityIds, (entityId, newState) => {
                var _a, _b;
                const mapping = entityMappings.find(m => m.entityId === entityId);
                if (!mapping)
                    return;
                const value = newState ? parseFloat(newState.state) : null;
                (_a = this._tracker) === null || _a === void 0 ? void 0 : _a.updateAxis(mapping.targetId, mapping.axis, isNaN(value !== null && value !== void 0 ? value : NaN) ? null : value);
                (_b = this._radarCanvas) === null || _b === void 0 ? void 0 : _b.markDirty();
            });
        }
        catch (err) {
            console.warn('[LD2450RadarCard] Could not subscribe to entities:', err);
        }
    }
    _updateFromHassStates(hass) {
        var _a, _b, _c;
        const mappings = buildEntityIds(this._config.device_name, this._config.targets.map(t => t.id));
        let changed = false;
        for (const m of mappings) {
            const entity = hass.states[m.entityId];
            if (!entity)
                continue;
            const raw = entity.state;
            if (raw === 'unavailable' || raw === 'unknown')
                continue;
            const val = parseFloat(raw);
            if (isNaN(val))
                continue;
            // Only update and flag dirty when the value actually changed
            const target = (_a = this._tracker) === null || _a === void 0 ? void 0 : _a.getTargets().find(t => t.id === m.targetId);
            if (target) {
                const current = m.axis === 'x' ? target.x : m.axis === 'y' ? target.y : target.speed;
                if (current !== val) {
                    (_b = this._tracker) === null || _b === void 0 ? void 0 : _b.updateAxis(m.targetId, m.axis, val);
                    changed = true;
                }
            }
        }
        if (changed) {
            (_c = this._radarCanvas) === null || _c === void 0 ? void 0 : _c.markDirty();
        }
    }
    _unsubAll() {
        for (const unsub of this._unsubscribes) {
            try {
                unsub();
            }
            catch (_e) { /* ignore */ }
        }
        this._unsubscribes = [];
    }
    _onConfigPatch(patch) {
        var _a, _b, _c, _d, _f, _g;
        this._config = { ...this._config, ...patch };
        this._applyColorScheme();
        (_a = this._radarCanvas) === null || _a === void 0 ? void 0 : _a.updateConfig(this._config);
        (_b = this._tracker) === null || _b === void 0 ? void 0 : _b.updateConfig(this._config);
        (_c = this._zoneEditor) === null || _c === void 0 ? void 0 : _c.updateConfig(this._config);
        (_d = this._furnitureLayer) === null || _d === void 0 ? void 0 : _d.updateConfig(this._config);
        (_f = this._configEditor) === null || _f === void 0 ? void 0 : _f.updateConfig(this._config);
        (_g = this._radarCanvas) === null || _g === void 0 ? void 0 : _g.markDirty();
    }
    _pushHistory() {
        // Trim forward history
        this._history = this._history.slice(0, this._historyIndex + 1);
        this._history.push({
            furniture: JSON.parse(JSON.stringify(this._config.furniture)),
            zones: JSON.parse(JSON.stringify(this._config.zones)),
        });
        this._historyIndex = this._history.length - 1;
    }
    _undo() {
        if (this._historyIndex <= 0)
            return;
        this._historyIndex--;
        this._applyHistory(this._history[this._historyIndex]);
    }
    _redo() {
        if (this._historyIndex >= this._history.length - 1)
            return;
        this._historyIndex++;
        this._applyHistory(this._history[this._historyIndex]);
    }
    _applyHistory(entry) {
        var _a, _b;
        this._config.furniture = entry.furniture;
        this._config.zones = entry.zones;
        (_a = this._furnitureLayer) === null || _a === void 0 ? void 0 : _a.updateConfig(this._config);
        (_b = this._zoneEditor) === null || _b === void 0 ? void 0 : _b.updateConfig(this._config);
        this._renderDOM();
        this._setupCanvas();
    }
    async _save() {
        if (!this._hass)
            return;
        // For each zone, create an input_boolean helper (if it doesn't already exist)
        // so automations can trigger on zone occupancy changes.
        for (const zone of this._config.zones) {
            const entityId = this._zoneEntityId(zone.id);
            try {
                await this._hass.connection.sendMessageWithResult({
                    type: 'input_boolean/create',
                    name: `Radar ${this._config.device_name} Zone ${zone.name}`,
                    icon: 'mdi:motion-sensor',
                });
                console.info(`[LD2450RadarCard] Created helper: ${entityId}`);
            }
            catch (_e) {
                // Helper may already exist or the user may lack permission — not fatal
                console.warn(`[LD2450RadarCard] Could not create helper for zone "${zone.name}" (may already exist):`, _e);
            }
        }
        console.info('[LD2450RadarCard] Zones saved — input_boolean helpers are ready for automations');
    }
    /**
     * Derive the input_boolean entity ID for a zone.
     * Includes device_name for uniqueness across multiple radar devices.
     * E.g. device "living_room_radar", zone id "zone_entry"
     *   → input_boolean.radar_living_room_radar_zone_entry
     */
    _zoneEntityId(zoneId) {
        const deviceSlug = this._config.device_name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
        const zoneSlug = zoneId.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
        return `input_boolean.radar_${deviceSlug}_${zoneSlug}`;
    }
    _dispatchZoneChange(zoneId, occupied) {
        // 1. Emit DOM event (for any in-page listeners)
        this.dispatchEvent(new CustomEvent('ld2450-zone-change', {
            bubbles: true,
            composed: true,
            detail: { zoneId, occupied },
        }));
        // 2. Toggle the corresponding input_boolean helper in HA so that
        //    automations can trigger directly on state changes.
        if (this._hass) {
            const entityId = this._zoneEntityId(zoneId);
            if (this._hass.states[entityId]) {
                const service = occupied ? 'turn_on' : 'turn_off';
                this._hass.callService('input_boolean', service, {
                    entity_id: entityId,
                }).catch((err) => {
                    console.warn(`[LD2450RadarCard] Failed to toggle ${entityId}:`, err);
                });
            }
        }
    }
    _escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    // Required by Lovelace
    static getConfigElement() {
        return document.createElement('ld2450-radar-card-editor');
    }
    static getStubConfig() {
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
window.customCards = (_a = window.customCards) !== null && _a !== void 0 ? _a : [];
window.customCards.push({
    type: 'ld2450-radar-card',
    name: 'LD2450 Radar Card',
    description: 'Real-time radar visualization for HLK-LD2450 mmWave presence sensor',
    preview: true,
    documentationURL: 'https://github.com/gorick1/HA-mmWave-Dashboard',
});

export { LD2450RadarCard };
