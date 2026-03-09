import type { FurnitureTypeDefinition } from '../types/index.js';

/**
 * Draw a sofa shape on canvas.
 */
function drawSofa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawSofaL(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawBed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const r = Math.min(w, h) * 0.05;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw a chair.
 */
function drawChair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawTV(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawDoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  _h: number
): void {
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
function drawWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawToilet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawBathtub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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
function drawWardrobe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
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

export const FURNITURE_TYPES: FurnitureTypeDefinition[] = [
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

export function getFurnitureType(id: string): FurnitureTypeDefinition | undefined {
  return FURNITURE_TYPES.find(f => f.id === id);
}
