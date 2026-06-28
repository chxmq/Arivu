#!/usr/bin/env node
/**
 * Arivu serial gateway — bridges a Kaavu Sentinel (or its LoRa receiver) on USB
 * to the Arivu Hub (/api/sentinel/data + /api/alerts), which the dashboard polls.
 *
 * It understands BOTH wire formats:
 *
 *  1) Sentinel plugged in directly (its own USB serial @ 115200):
 *       [REC #2  8.4s] 12:34:57 | gas 312 | vib 0/s | 28.4C 71%RH | SD:ok LoRa:ok
 *       >>> FIRE  gas=2150  (LoRa sent)
 *       >>> TAMPER  vibration=12/s  (LoRa sent)
 *
 *  2) The receiver ESP32 forwarding LoRa packets to USB serial:
 *       A|20260628-013456|FIRE|gas=2150
 *       A|20260628-013456|TAMPER|vibration
 *       A|20260628-013456|CLIMATE|temp=28.4,hum=71.0
 *       A|20260628-013456|ALIVE|files=2 rec=1
 *
 * Setup:  npm install            (installs serialport — see package.json)
 * Run:    node gateway.js                      (auto-detects the port)
 *         ARIVU_SERIAL_PORT=/dev/cu.usbserial-XXXX node gateway.js
 *
 * Requires Node 18+ (global fetch). Close the Arduino Serial Monitor first —
 * only one program can hold the serial port at a time.
 */
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const HUB = process.env.ARIVU_HUB_URL || "http://localhost:8787";
const BAUD = Number(process.env.ARIVU_SERIAL_BAUD || 115200);
const SENTINEL_ID = process.env.ARIVU_SENTINEL_ID || "grove_1";
const SENTINEL_NAME = process.env.ARIVU_SENTINEL_NAME || "Kaavu Sentinel 01";
const FIRE_THRESHOLD = Number(process.env.ARIVU_GAS_FIRE || 2000); // matches firmware

if (typeof fetch !== "function") {
  console.error("This gateway needs Node 18+ (global fetch). Upgrade Node and retry.");
  process.exit(1);
}

// ---- hub helpers ----------------------------------------------------------
async function post(path, payload) {
  try {
    const res = await fetch(HUB + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn("  POST", path, "->", res.status);
  } catch (e) {
    console.warn("  POST", path, "failed:", e.message);
  }
}

function pushReading(extra) {
  return post("/api/sentinel/data", { sentinel_id: SENTINEL_ID, ...extra });
}

function raiseAlert(type, message, severity) {
  console.log("  ⚠ alert:", type, "-", message);
  return post("/api/alerts", { type, message, severity: severity || "INFO" });
}

// ---- parsing --------------------------------------------------------------
function numAfter(line, re) {
  const m = line.match(re);
  return m ? Number(m[1]) : null;
}

// Pretty + severity for model sound labels.
function labelPretty(s) {
  return String(s || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
const THREAT_LABELS = ["chainsaw", "gunshot", "vehicle_engine", "human_voice", "human_footstep", "fire_crackle"];
function severityFor(label) {
  return THREAT_LABELS.includes(String(label)) ? "HIGH" : "INFO";
}

// Sentinel direct status line.
function handleStatusLine(line) {
  const gas = numAfter(line, /gas\s+(-?\d+)/);
  const vib = numAfter(line, /vib\s+(\d+)\/s/);
  const climate = line.match(/(-?[\d.]+)\s*C\s+(-?[\d.]+)\s*%RH/);
  const temperature = climate ? Number(climate[1]) : null;
  const humidity = climate ? Number(climate[2]) : null;
  const recording = /^\[REC/.test(line);
  const sd_ok = /SD:ok/.test(line);
  const lora_ok = /LoRa:ok/.test(line);
  const smoke = gas != null && gas >= FIRE_THRESHOLD;

  // model sound label, e.g. "snd:chainsaw 0.84"
  const snd = line.match(/snd:(\S+)\s+([\d.]+)/);
  const label = snd ? snd[1] : null;
  const sound_conf = snd ? Number(snd[2]) : null;
  const sound_alert = (label && label !== "background" && label !== "--") ? label : null;

  pushReading({
    temperature,
    humidity,
    gas,
    smoke,
    vibration_rate: vib,
    recording,
    sd_ok,
    lora_ok,
    sound_alert,
    sound_conf,
    link: "usb",
  });
}

// Sentinel direct alert line (>>> FIRE / TAMPER ...).
function handleDirectAlert(line) {
  let m;
  if ((m = line.match(/FIRE\s+gas=(\d+)/i))) {
    const gas = Number(m[1]);
    pushReading({ gas, smoke: true, link: "usb" });
    raiseAlert("smoke", `Fire risk — gas spike (gas=${gas}) · ${SENTINEL_NAME}`, "HIGH");
  } else if ((m = line.match(/TAMPER\s+vibration=?(\d+)?/i))) {
    const rate = m[1] ? Number(m[1]) : null;
    if (rate != null) pushReading({ vibration_rate: rate, link: "usb" });
    raiseAlert("tamper", `Tamper — vibration${rate != null ? ` (${rate}/s)` : ""} · ${SENTINEL_NAME}`, "HIGH");
  } else if ((m = line.match(/SOUND\s+(\w+)\s+conf=([\d.]+)/i))) {
    const label = m[1], conf = m[2];
    pushReading({ sound_alert: label, sound_conf: Number(conf), link: "usb" });
    raiseAlert("sound", `${labelPretty(label)} detected (conf ${conf}) · ${SENTINEL_NAME}`, severityFor(label));
  }
  // ">>> CLIMATE report sent" / ">>> ALIVE heartbeat sent" carry no values here.
}

// LoRa packet forwarded by the receiver:  A|<ts>|<type>|<detail>
function handleLoRaPacket(line) {
  const parts = line.split("|");
  if (parts.length < 3) return;
  const type = (parts[2] || "").trim().toUpperCase();
  const detail = (parts[3] || "").trim();

  if (type === "FIRE") {
    const gas = numAfter(detail, /gas=(\d+)/) ?? null;
    pushReading({ gas, smoke: true, link: "lora" });
    raiseAlert("smoke", `Fire risk — gas spike${gas != null ? ` (gas=${gas})` : ""} · ${SENTINEL_NAME}`, "HIGH");
  } else if (type === "SOUND") {
    const label = (detail.split(",")[0] || "").trim();
    const conf = (detail.match(/conf=([\d.]+)/) || [])[1];
    pushReading({ sound_alert: label, sound_conf: conf ? Number(conf) : null, link: "lora" });
    raiseAlert("sound", `${labelPretty(label)} detected${conf ? ` (conf ${conf})` : ""} · ${SENTINEL_NAME}`, severityFor(label));
  } else if (type === "TAMPER") {
    const rate = numAfter(detail, /(\d+)/);
    if (rate != null) pushReading({ vibration_rate: rate, link: "lora" });
    raiseAlert("tamper", `Tamper — vibration detected · ${SENTINEL_NAME}`, "HIGH");
  } else if (type === "CLIMATE") {
    const temperature = numAfter(detail, /temp=(-?[\d.]+)/);
    const humidity = numAfter(detail, /hum=(-?[\d.]+)/);
    pushReading({ temperature, humidity, link: "lora" });
    console.log(`  climate via LoRa: ${temperature}C ${humidity}%RH`);
  } else if (type === "ALIVE") {
    const recording = /rec=1/.test(detail);
    const files = numAfter(detail, /files=(\d+)/);
    pushReading({ recording, files, heartbeat: true, link: "lora" });
    console.log("  heartbeat via LoRa:", detail);
  }
}

function handleLine(raw) {
  const line = String(raw).trim();
  if (!line) return;
  if (line.startsWith("A|")) return handleLoRaPacket(line);      // LoRa receiver
  if (line.startsWith(">>>")) return handleDirectAlert(line);     // sentinel alert
  if (/^\[(REC|LISTEN|STOP)/.test(line) && /gas/.test(line)) return handleStatusLine(line);
  // everything else (self-test table, banners, file-saved msgs) is ignored
}

// ---- port auto-detection --------------------------------------------------
async function pickPort() {
  if (process.env.ARIVU_SERIAL_PORT) return process.env.ARIVU_SERIAL_PORT;
  const ports = await SerialPort.list();
  const re = /usbserial|usbmodem|wch|slab|cp210|ch340|SLAB_USBtoUART/i;
  let match = ports.find((p) => re.test(`${p.path} ${p.manufacturer || ""}`));
  if (!match) match = ports.find((p) => /\/dev\/(cu|tty)\./.test(p.path || ""));
  let path = (match || ports[0] || {}).path;
  // On macOS prefer the callout device (cu.*) — tty.* blocks waiting for carrier.
  if (path && path.includes("/dev/tty.")) path = path.replace("/dev/tty.", "/dev/cu.");
  return path;
}

(async () => {
  const path = await pickPort();
  if (!path) {
    console.error("No serial port found. Plug in the ESP32, or set ARIVU_SERIAL_PORT.");
    const ports = await SerialPort.list();
    if (ports.length) console.error("Available:", ports.map((p) => p.path).join(", "));
    process.exit(1);
  }

  const port = new SerialPort({ path, baudRate: BAUD });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  port.on("open", () => console.log(`Serial open: ${path} @ ${BAUD}`));
  port.on("error", (e) => console.error("Serial error:", e.message));
  parser.on("data", handleLine);

  console.log(`Arivu gateway → forwarding ${SENTINEL_NAME} to ${HUB}`);
  console.log("(Close the Arduino Serial Monitor if the port is busy.)");
})();
