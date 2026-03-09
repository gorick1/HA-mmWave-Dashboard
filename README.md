# LD2450 Radar Card

> **Note:** Replace this placeholder with an actual screenshot of the card in action.
> ![Hero Screenshot](docs/screenshot.png)

A premium, real-time radar visualization card for Home Assistant Lovelace, designed for the **HLK-LD2450 mmWave presence sensor** connected to an ESP32 running ESPHome. Features a dark, glassmorphism-inspired design with live target tracking, zone editing, and furniture placement.

---

## Features

- 🎯 **Real-time target tracking** — Up to 3 simultaneous targets with live X/Y/speed display
- 🌀 **Animated radar sweep** — Rotating conic sweep at ~1 RPM with decaying luminance trail
- 📐 **Zone editor** — Draw custom polygon zones directly on the canvas; zones light up when occupied
- 🛋️ **Furniture layer** — Place, move, resize, and rotate room furniture items on the radar map
- 🔦 **Motion trails** — Fading position history trails per target
- 📡 **WebSocket real-time updates** — Uses HA's native WebSocket API, no polling
- 📋 **YAML export** — Generates HA `template binary_sensor` YAML for each zone
- 🎨 **Dark glassmorphism design** — Modern, premium-looking card with smooth animations
- 📱 **Responsive layout** — Works on mobile dashboards
- ♿ **Accessible** — ARIA labels on all interactive controls

---

## Requirements

| Component | Minimum Version |
|---|---|
| Home Assistant | 2023.9.0 |
| ESPHome | 2023.9.0 |
| LD2450 Firmware | V2.02.23090617 |
| Browser | Any modern browser supporting Canvas 2D |

> ⚠️ Ensure LD2450 firmware is **V2.02.23090617** or later. Update via HLKRadarTool mobile app over Bluetooth.

---

## Installation

### HACS Method (Recommended)

1. Open HACS in your Home Assistant instance
2. Go to **Frontend** → click the **+** button
3. Search for **LD2450 Radar Card**
4. Click **Download** and follow the prompts
5. Restart Home Assistant
6. Add the card to your dashboard via the card picker

### Manual Method

1. Download `dist/ld2450-radar-card.js` from the [latest release](https://github.com/gorick1/HA-mmWave-Dashboard/releases/latest)
2. Copy it to your HA config directory: `config/www/ld2450-radar-card.js`
3. In Home Assistant, go to **Settings → Dashboards → Resources**
4. Add a new resource:
   - URL: `/local/ld2450-radar-card.js`
   - Type: **JavaScript Module**
5. Add the card to your dashboard

---

## ESPHome Setup

Add this to your ESPHome configuration:

```yaml
esphome:
  name: living_room_radar

esp32:
  board: esp32dev

uart:
  tx_pin: GPIO17
  rx_pin: GPIO16
  baud_rate: 256000
  parity: NONE
  stop_bits: 1

ld2450:
  id: ld2450_sensor

sensor:
  - platform: ld2450
    ld2450_id: ld2450_sensor
    target_count:
      name: "Target Count"
    still_target_count:
      name: "Still Target Count"
    moving_target_count:
      name: "Moving Target Count"
    targets:
      - target: 1
        x:
          name: "Target 1 X"
        y:
          name: "Target 1 Y"
        speed:
          name: "Target 1 Speed"
        resolution:
          name: "Target 1 Resolution"
      - target: 2
        x:
          name: "Target 2 X"
        y:
          name: "Target 2 Y"
        speed:
          name: "Target 2 Speed"
        resolution:
          name: "Target 2 Resolution"
      - target: 3
        x:
          name: "Target 3 X"
        y:
          name: "Target 3 Y"
        speed:
          name: "Target 3 Speed"
        resolution:
          name: "Target 3 Resolution"

binary_sensor:
  - platform: ld2450
    ld2450_id: ld2450_sensor
    has_target:
      name: "Has Target"
    has_moving_target:
      name: "Has Moving Target"
    has_still_target:
      name: "Has Still Target"

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
  encryption:
    key: !secret api_encryption_key

ota:
  password: !secret ota_password
```

### Wiring

| ESP32 Pin | LD2450 Pin |
|---|---|
| GPIO17 (TX) | RX |
| GPIO16 (RX) | TX |
| 5V | VCC |
| GND | GND |

> ⚠️ Power the LD2450 from the **5V pin**, not 3.3V. Using 3.3V may cause instability.

---

## Card Configuration

```yaml
type: custom:ld2450-radar-card
title: Living Room Radar        # Optional title string
device_name: living_room_radar  # ESPHome device name prefix
max_range: 6000                 # Detection range in mm (default: 6000)
fov_angle: 120                  # Field of view in degrees (default: 120)
show_grid: true                 # Show polar grid
show_sweep: true                # Show rotating radar sweep
show_trails: true               # Show motion trails
trail_length: 12                # Number of trail positions (default: 12)

targets:
  - id: 1
    color: "#38bdf8"
    label: "Person 1"
  - id: 2
    color: "#f472b6"
    label: "Person 2"
  - id: 3
    color: "#34d399"
    label: "Person 3"

furniture:                       # User-placed furniture items
  - id: "sofa_1"
    type: sofa
    x: -800                      # mm from sensor center (negative = left)
    y: 2500                      # mm from sensor (0 = at sensor, positive = away)
    width: 1800                  # mm
    height: 800                  # mm
    rotation: 0                  # degrees

zones:
  - id: "zone_entry"
    name: "Entry"
    color: "#a78bfa"
    vertices:                    # Polygon vertices in mm
      - { x: -500, y: 500 }
      - { x: 500, y: 500 }
      - { x: 500, y: 1500 }
      - { x: -500, y: 1500 }
```

The card automatically constructs entity IDs using the pattern:
```
sensor.<device_name>_target_<id>_x
sensor.<device_name>_target_<id>_y
sensor.<device_name>_target_<id>_speed
```

---

## Zone Setup Guide

### Drawing a Zone

1. Click **📐 Draw Zone** in the sidebar (or Edit toolbar)
2. The canvas cursor changes to a crosshair
3. **Click** on the canvas to place each vertex of your zone polygon
4. A dashed preview line follows your cursor
5. To close the polygon: **click the first vertex** (it highlights on hover) **or press Enter**
6. A dialog appears — type a name for the zone and click **Add Zone**
7. Your zone is immediately rendered and will light up when occupied

### Editing a Zone

- **Select**: In Edit mode (✏️), click **Select** and click inside a zone
- **Move**: Drag the selected zone body
- **Reshape**: Drag any vertex handle
- **Add vertex**: Double-click on a zone edge to insert a new vertex
- **Delete**: Right-click a zone and select Delete, or select it and press Delete

### Zone Occupancy Events

When a target enters or leaves a zone, the card emits a custom DOM event:

```javascript
document.querySelector('ld2450-radar-card').addEventListener('ld2450-zone-change', (e) => {
  console.log(e.detail); // { zoneId: "zone_entry", occupied: true }
});
```

---

## Template Sensor Setup

Click **📋 Export YAML** to generate Home Assistant template sensor YAML for all your zones. Copy the generated YAML into your `configuration.yaml` (or a `templates.yaml` included file):

```yaml
template:
  - binary_sensor:
      - name: "Radar Zone Entry"
        unique_id: radar_zone_entry
        device_class: occupancy
        state: >
          {% set t1x = states('sensor.living_room_radar_target_1_x') | float(0) %}
          {% set t1y = states('sensor.living_room_radar_target_1_y') | float(0) %}
          {# ... point-in-polygon check ... #}
          {{ ((...)) or ((...)) or ((...)) }}
```

After adding the YAML, restart Home Assistant or reload template entities.

---

## Furniture Reference

| ID | Label | Default Size (mm) |
|---|---|---|
| `sofa` | Sofa | 2000×800 |
| `sofa_l` | L-Shaped Sofa | 2400×2400 |
| `bed_single` | Single Bed | 1000×2000 |
| `bed_double` | Double Bed | 1600×2000 |
| `desk` | Desk | 1400×700 |
| `dining_table` | Dining Table | 1500×900 |
| `coffee_table` | Coffee Table | 1000×600 |
| `chair` | Chair | 600×600 |
| `tv` | TV / Monitor | 1400×100 |
| `door` | Door (arc) | 900×900 |
| `window` | Window | 1000×100 |
| `toilet` | Toilet | 400×600 |
| `bathtub` | Bathtub | 700×1600 |
| `plant` | Plant (circle) | 400×400 |
| `wardrobe` | Wardrobe | 1000×600 |

### Furniture Interactions

- **Place**: In Edit mode, click **Add Furniture**, select a type from the picker, then click on the canvas
- **Select**: In Edit mode, click **Select** and click on a furniture item
- **Move**: Drag the selected item
- **Resize**: Drag the corner handles
- **Rotate**: Drag the purple circle handle above the item
- **Delete**: Select and press Delete/Backspace, or use the right-click context menu
- **Snap to grid**: Furniture snaps to a 100mm grid by default

---

## Coordinate System

The LD2450 reports coordinates in **millimeters** relative to the sensor:

- **X axis**: Horizontal. Negative = left, Positive = right (sensor facing toward the room)
- **Y axis**: Depth. Always positive. 0 = at the sensor, increases away from it
- **Range**: X ±4000mm, Y 0–6000mm (approximately)

The card places the sensor at the **bottom center** of the canvas:

```
Canvas (0,0) = top-left
Sensor position = (canvas.width / 2, canvas.height - 40px)
pixel_x = sensor_x + mm_x * scale
pixel_y = sensor_y - mm_y * scale
```

---

## Troubleshooting

### Targets not showing

1. Check that your ESPHome device is online and entities are updating in HA
2. Verify the `device_name` in your card config matches your ESPHome device name
3. Check that entity IDs follow the pattern `sensor.<device_name>_target_<n>_x`
4. Open browser DevTools console — the card logs subscription errors

### Wrong coordinates / targets in wrong position

1. Confirm the sensor is physically oriented correctly (facing into the room)
2. Check that X=0 means "sensor center" and Y increases away from sensor
3. Negative X values appear on the left side of the card, positive on the right
4. Ensure LD2450 firmware is V2.02.23090617 or later

### Radar sweep not animating

- Check that `show_sweep: true` is set in your card config
- Try toggling it off and on via Settings (⚙️)

### Card not loading

1. Hard-refresh your browser (Ctrl+Shift+R)
2. Check the HA frontend logs for JavaScript errors
3. Ensure the resource URL is correct (`/local/ld2450-radar-card.js` or HACS path)
4. Verify the file is the complete `dist/ld2450-radar-card.js` (not a source file)

### Zones not occupying

1. Ensure the zone has at least 3 vertices
2. Verify target coordinates are in the expected range (non-zero when person present)
3. Dead zone threshold: targets within 50mm of origin are considered inactive

---

## Development

### Building from source

```bash
git clone https://github.com/gorick1/HA-mmWave-Dashboard
cd HA-mmWave-Dashboard
npm install
npm run build        # Build once
npm run dev          # Watch mode
npm run typecheck    # Type checking only
npm run lint         # Lint TypeScript
```

### Project Structure

```
src/
├── ld2450-radar-card.ts          # Main card entry point / web component
├── components/
│   ├── RadarCanvas.ts            # Canvas rendering engine
│   ├── FurnitureLayer.ts         # Furniture placement system
│   ├── ZoneEditor.ts             # Polygon zone drawing tool
│   ├── TargetTracker.ts          # Live target state management
│   └── ConfigEditor.ts           # Settings panel + YAML generator
├── types/
│   └── index.ts                  # TypeScript interfaces
├── utils/
│   ├── geometry.ts               # Point-in-polygon, coordinate transforms
│   ├── ha-websocket.ts           # HA WebSocket subscription helpers
│   └── furniture-shapes.ts       # Furniture draw functions
└── styles/
    └── card.css                  # All styles (bundled into JS)
dist/
└── ld2450-radar-card.js          # Single-file compiled output for HACS
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run `npm run typecheck && npm run build` to verify
5. Submit a pull request

Please keep the single-file output requirement in mind — no runtime external dependencies.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
