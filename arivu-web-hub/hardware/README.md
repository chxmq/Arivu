# Arivu hardware → dashboard

How the Kaavu Sentinel hardware reaches the web dashboard.

```
Kaavu Sentinel (ESP32 + sensors + Ra-02)         Receiver ESP32 (+ Ra-02)        Mac
  mic · MQ gas · SW-420 vib · DHT22  ──LoRa──▶  prints packets to USB ──▶  node gateway.js
        │ (also prints rich status on its own USB)                                   │
        └──────────────── USB (direct dev/demo) ─────────────────────────────────────┘
                                                                                      │
                                                          POST /api/sentinel/data  +  /api/alerts
                                                                                      ▼
                                                                   Arivu Hub :8787 → Command dashboard :8765
```

`gateway.js` understands **both** inputs, so you can run the demo either way:
1. **Sentinel straight into the Mac** (USB) — reads its 1-second status line + `>>> FIRE/TAMPER` alerts.
2. **Receiver ESP32 on the Mac** — reads forwarded LoRa packets `A|<ts>|<type>|<detail>`.

## LoRa packet format (sentinel → receiver)

```
A|<timestamp>|SOUND|human_voice,conf=0.98
A|<timestamp>|FIRE|gas=2150
A|<timestamp>|TAMPER|vibration
A|<timestamp>|CLIMATE|temp=28.4,hum=71.0
A|<timestamp>|ALIVE|files=2 rec=1
```
Frequency **433 MHz**, syncword **0x12** — the receiver sketch must match the sentinel.

## Flashing

- **Sentinel**: your existing capture build (mic + sensors + LoRa TX).
- **Receiver**: `kaavu-receiver.ino` in this folder (LoRa RX → USB serial). Board: *ESP32 Dev Module*. Library: *LoRa* (Sandeep Mistry).

### Receiver LoRa wiring (same as the sentinel's Ra-02)
| Ra-02 | ESP32 |
|------|-------|
| VCC  | 3V3 (never 5V) |
| GND  | GND |
| SCK  | GPIO18 |
| MISO | GPIO19 |
| MOSI | GPIO23 |
| NSS  | GPIO4 |
| RST  | GPIO27 |
| DIO0 | GPIO26 |

## Sentinel wiring (reference, verified for ESP32-WROOM)

INMP441 mic (I2S): VDD 3V3 · GND GND · L/R GND · WS GPIO15 · SCK GPIO14 · SD GPIO32
SD card (HSPI): CS GPIO5 · SCK GPIO17 · MISO GPIO36 · MOSI GPIO16
Ra-02 LoRa (default SPI): VCC 3V3 · NSS GPIO4 · RST GPIO27 · DIO0 GPIO26 · SCK 18 · MISO 19 · MOSI 23
MQ gas: VCC 5V · AO GPIO34 (ADC1, input-only)
DHT22: DATA GPIO13 · 3V3/GND
SW-420 vibration: VCC **3V3** (not 5V) · DO GPIO35 (input-only)
Rocker switch: GPIO33 ↔ GND · Green LED GPIO25 (+220Ω) · Red LED GPIO2 (+220Ω)

## Running the gateway

```bash
cd arivu-web-hub
npm install                 # installs serialport (one time)
node gateway.js             # auto-detects the USB port
# or pin the port explicitly:
ARIVU_SERIAL_PORT=/dev/cu.usbserial-XXXX node gateway.js
```

Env overrides: `ARIVU_HUB_URL`, `ARIVU_SERIAL_BAUD` (default 115200),
`ARIVU_SENTINEL_ID` (default `grove_1`), `ARIVU_GAS_FIRE` (default 2000).

### Troubleshooting
- **Port busy / no data**: close the Arduino IDE Serial Monitor — only one program can hold the port.
- **Find the port**: `ls /dev/cu.*` (macOS). Use the `cu.*` device, not `tty.*`.
- **Nothing on dashboard**: make sure the hub is running (`make hub`) and the Command site is open at `http://localhost:8765`. The live panel + alert feed poll every few seconds.
