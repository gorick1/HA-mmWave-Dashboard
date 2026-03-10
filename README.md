# LD2450 Radar Card for Home Assistant

A real-time radar visualization card for **Home Assistant**, designed for the **HLK-LD2450 mmWave presence sensor** running on an ESP32 with ESPHome. Draw zones directly on the radar, hit **Save**, and use them in automations — no YAML required.

---

## Quick Start

1. **Install** via HACS or manually (see [Installation](#installation))
2. **Add the card** — open a dashboard → Edit → Add Card → search **LD2450 Radar Card**
3. **Pick your device** — choose your LD2450 from the **Device** dropdown (auto-discovered)
4. **Draw zones** — click 📐 Draw Zone, click to place vertices, close the polygon, name it
5. **Save** — click 💾 Save to create `input_boolean` helpers automatically
6. **Automate** — use the created helpers (e.g. `input_boolean.radar_zone_entry`) as triggers in your automations

---

## Features

- 🎯 **Real-time target tracking** — up to 3 simultaneous targets with live X / Y / speed
- 📐 **Zone editor** — draw polygon zones directly on the canvas; zones highlight when occupied
- 🔌 **Direct zone integration** — zones are saved as `input_boolean` helpers and auto-toggled on occupancy changes — use them in automations immediately
- 🎛️ **Device dropdown** — auto-discovers LD2450 devices from your HA entities; no manual typing needed
- 🛋️ **Furniture layer** — place, move, resize, and rotate room furniture on the radar map
- 🌀 **Animated radar sweep** — rotating sweep with decaying luminance trail
- 🔦 **Motion trails** — fading position history per target
- 📡 **WebSocket updates** — real-time state via HA's native WebSocket API
- 📋 **YAML export** — optional export of `template binary_sensor` YAML for advanced setups
- 🎨 **Dark & light themes** — glassmorphism design with CSS-variable theming
- 📱 **Responsive** — works on mobile dashboards
- ♿ **Accessible** — ARIA labels on all controls

---

## Requirements

| Component | Minimum Version |
|---|---|
| Home Assistant | 2023.9.0 |
| ESPHome | 2023.9.0 |
| LD2450 Firmware | V2.02.23090617 |
| Browser | Any modern browser with Canvas 2D |

> ⚠️ Ensure LD2450 firmware is **V2.02.23090617** or later. Update via the HLKRadarTool mobile app over Bluetooth.

---

## Installation

### HACS (Recommended)

1. Open **HACS → Frontend**
2. Click **⋮** → **Custom repositories**
3. Add `https://github.com/gorick1/HA-mmWave-Dashboard` with category **Frontend**
4. Click **Download** on the LD2450 Radar Card entry
5. Restart Home Assistant (or hard-refresh the browser)

### Manual

1. Download `dist/ld2450-radar-card.js` from the [latest release](https://github.com/gorick1/HA-mmWave-Dashboard/releases/latest)
2. Copy it to `config/www/ld2450-radar-card.js`
3. Go to **Settings → Dashboards → Resources**, add `/local/ld2450-radar-card.js` as a **JavaScript Module**
4. Hard-refresh (`Ctrl+Shift+R`)

---

## Selecting Your Device

When you add or edit the card, the **visual editor** opens automatically.

1. Under **Device**, a dropdown lists every LD2450 device discovered in your Home Assistant entities.
   Pick the device you want to display — done!
2. If the dropdown is empty (e.g. the device hasn't reported entities yet), type the ESPHome `name:` value into the **manual input** below the dropdown.
3. Choose the **sensor mounting position** on the wall grid.
4. Adjust detection and display settings as needed.
5. Click **Save**.

> 💡 The card discovers devices by scanning for entities matching `sensor.<device>_target_N_x`. Make sure your ESPHome device is online and its entities appear in HA.

---

## Zone Setup — Draw, Save, Automate

### Drawing a Zone

1. Click **📐 Draw Zone** in the sidebar or edit toolbar
2. Click on the canvas to place each polygon vertex
3. Close the polygon by clicking the first vertex or pressing **Enter**
4. Name the zone in the dialog and click **Add Zone**

### Saving Zones to Home Assistant

Click **💾 Save** in the edit toolbar. The card will:

- Create an `input_boolean` helper for each zone, named with the device and zone context
  (e.g. device `living_room_radar` + zone id `zone_entry` → `input_boolean.radar_living_room_radar_zone_entry`)
- Automatically toggle helpers **on/off** as targets enter or leave zones

These helpers work like any other HA entity — use them directly in automations, scripts, or conditions.

### Example Automation

```yaml
automation:
  - alias: "Lights on when someone enters the entry zone"
    trigger:
      - platform: state
        entity_id: input_boolean.radar_living_room_radar_zone_entry
        to: "on"
    action:
      - service: light.turn_on
        target:
          entity_id: light.hallway
```

> 💡 The entity ID follows the pattern `input_boolean.radar_<device_name>_<zone_id>`.
> Zone IDs are assigned when you create each zone (e.g. `zone_1234567890`).
> You can find the exact entity ID in **Settings → Devices & Services → Helpers** after saving.

### Editing Zones

- **Select**: enter Edit mode (✏️), click **Select**, then click inside a zone
- **Move**: drag the zone body
- **Reshape**: drag any vertex handle
- **Add vertex**: double-click a zone edge
- **Delete**: select a zone and press **Delete / Backspace**

### YAML Export (Advanced)

For users who prefer HA template sensors with point-in-polygon math:

1. Click **📋 Export YAML** in the sidebar
2. Copy the generated YAML into `configuration.yaml` (or a `templates.yaml` include)
3. Restart Home Assistant to load the template sensors

---

## ESPHome Setup

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

> ⚠️ Power the LD2450 from the **5V** pin, not 3.3V.

---

## Card Configuration Reference

Most settings are managed through the visual editor. For YAML configuration:

```yaml
type: custom:ld2450-radar-card
title: Living Room Radar
device_name: living_room_radar   # ESPHome device name
max_range: 6000                  # Detection range in mm (default 6000)
fov_angle: 120                   # Field of view in degrees (default 120)
show_grid: true
show_sweep: true
show_trails: true
trail_length: 12
sensor_position: bottom          # bottom | top | left | right | corners

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

zones:
  - id: "zone_entry"
    name: "Entry"
    color: "#a78bfa"
    vertices:
      - { x: -500, y: 500 }
      - { x: 500, y: 500 }
      - { x: 500, y: 1500 }
      - { x: -500, y: 1500 }

furniture:
  - id: "sofa_1"
    type: sofa
    x: -800
    y: 2500
    width: 1800
    height: 800
    rotation: 0
```

Entity IDs are constructed automatically:
```
sensor.<device_name>_target_<id>_x
sensor.<device_name>_target_<id>_y
sensor.<device_name>_target_<id>_speed
```

---

## Furniture Reference

| Type | Label | Default Size (mm) |
|---|---|---|
| `sofa` | Sofa | 2000 × 800 |
| `sofa_l` | L-Shaped Sofa | 2400 × 2400 |
| `bed_single` | Single Bed | 1000 × 2000 |
| `bed_double` | Double Bed | 1600 × 2000 |
| `desk` | Desk | 1400 × 700 |
| `dining_table` | Dining Table | 1500 × 900 |
| `coffee_table` | Coffee Table | 1000 × 600 |
| `chair` | Chair | 600 × 600 |
| `tv` | TV / Monitor | 1400 × 100 |
| `door` | Door (arc) | 900 × 900 |
| `window` | Window | 1000 × 100 |
| `toilet` | Toilet | 400 × 600 |
| `bathtub` | Bathtub | 700 × 1600 |
| `plant` | Plant | 400 × 400 |
| `wardrobe` | Wardrobe | 1000 × 600 |

### Furniture Interactions

- **Place**: Edit mode → Add Furniture → pick a type → click canvas
- **Move**: drag the item
- **Resize**: drag corner handles
- **Rotate**: drag the purple circle handle
- **Delete**: select + **Delete** key

---

## Coordinate System

The LD2450 reports coordinates in **millimeters** relative to the sensor:

| Axis | Range | Direction |
|---|---|---|
| X | ±4 000 mm | Negative = left, Positive = right |
| Y | 0 – 6 000 mm | 0 at sensor, increases away |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **Targets not showing** | Verify ESPHome device is online; check `device_name` matches exactly; open DevTools console for subscription errors |
| **Wrong target positions** | Confirm sensor orientation (facing into the room); check firmware ≥ V2.02.23090617 |
| **Sweep not animating** | Ensure `show_sweep: true`; toggle via ⚙️ Settings |
| **Card not loading** | Hard-refresh (`Ctrl+Shift+R`); verify resource URL; check HA frontend logs |
| **Zones not detecting occupancy** | Zone needs ≥ 3 vertices; targets within 50 mm of origin are ignored (dead zone) |
| **Device not in dropdown** | Device may not be online; fall back to the manual device name field |
| **Zone helpers not created** | Click 💾 Save after drawing zones; check HA logs for permission issues |

---

## Development

```bash
git clone https://github.com/gorick1/HA-mmWave-Dashboard
cd HA-mmWave-Dashboard
npm install
npm run build        # Build once → dist/ld2450-radar-card.js
npm run dev          # Watch mode
npm run typecheck    # Type-check only
npm run lint         # Lint TypeScript
```

### Project Structure

```
src/
├── ld2450-radar-card.ts        # Main web component
├── components/
│   ├── RadarCanvas.ts          # Canvas rendering
│   ├── FurnitureLayer.ts       # Furniture placement
│   ├── ZoneEditor.ts           # Zone drawing & editing
│   ├── TargetTracker.ts        # Target state management
│   ├── ConfigEditor.ts         # Settings panel + YAML generator
│   └── CardEditor.ts           # Visual card editor (device dropdown)
├── types/
│   └── index.ts                # TypeScript interfaces
├── utils/
│   ├── geometry.ts             # Coordinate transforms, point-in-polygon
│   ├── ha-websocket.ts         # HA WebSocket helpers
│   └── furniture-shapes.ts     # Furniture draw functions
└── styles/
    └── card.css                # Styles (bundled into JS)
```

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run `npm run typecheck && npm run build` to verify
4. Submit a pull request

Keep the single-file output requirement — no runtime dependencies.

---

## License

MIT — see [LICENSE](LICENSE) for details.
