/* ============================================================================
ARIVU — KAAVU SENTINEL  (ESP32 core 3.x · Edge Impulse sound classification)
Team Arivu · ZSI Hackathon
----------------------------------------------------------------------------
Now event-driven: the INMP441 mic feeds the on-device Edge Impulse model
(champ-project-1_inferencing) continuously. The box only RECORDS to SD and
raises a LoRa SOUND alert WHEN the model detects a real event (anything but
"background") above a confidence threshold — no more 24/7 recording.

Classes: background, birds, chainsaw, elephant, frog, gunshot, human_voice,
leopard, vehicle_engine.

Other sensors unchanged: MQ gas -> FIRE, SW-420 -> TAMPER, DHT22 -> CLIMATE,
heartbeat ALIVE. SD runs on its own HSPI bus so it never blocks LoRa.

LoRa messages  A|<timestamp>|<type>|<detail> :
  SOUND (model) · FIRE · TAMPER · CLIMATE · ALIVE

SERIAL @ 115200 — status line every second, e.g.:
  [LISTEN] 12s | gas 312 | vib 0/s | 28.4C 71%RH | snd:background 0.96 | SD:ok LoRa:ok
  >>> SOUND chainsaw conf=0.84 (LoRa sent)

BUILD:  arduino-cli compile --fqbn esp32:esp32:esp32 \
          --library "<path>/champ-project-1_inferencing" hardware/kaavu_sentinel
LIBS: champ-project-1_inferencing (Edge Impulse) · LoRa · DHT · Adafruit Unified Sensor
============================================================================ */
#include <champ-project-1_inferencing.h>
#include <ESP_I2S.h>
#include <SPI.h>
#include <SD.h>
#include <LoRa.h>
#include <DHT.h>

/* ---------------- PINS ---------------------------------------------------- */
#define I2S_SCK_PIN   14
#define I2S_WS_PIN    15
#define I2S_SD_PIN    32
// SD on its OWN SPI bus (HSPI) so it can't hog LoRa's MISO line.
#define SD_CS_PIN      5
#define SD_SCK_PIN    17
#define SD_MISO_PIN   36
#define SD_MOSI_PIN   16
#define LORA_CS_PIN    4      // LoRa keeps the default SPI bus: SCK 18 / MISO 19 / MOSI 23
#define LORA_RST_PIN  27
#define LORA_DIO0_PIN 26
#define LORA_FREQ    433E6
#define MQ_AO_PIN     34
#define VIB_PIN       35
#define DHT_PIN       13
#define DHT_TYPE      DHT22
#define SWITCH_PIN    33
#define LED_GREEN_PIN 25
#define LED_RED_PIN    2

/* ---------------- TUNABLES ----------------------------------------------- */
#define MIC_GAIN             1
#define SOUND_THRESHOLD      0.50f      // min confidence for the best USEFUL class
#define MIN_EVENT_AMP        8000       // only loud windows can trigger (ambient ~2-5k, voice ~20k)
#define CONSEC_HITS          1          // amp gate already filters; 1 loud confident window can fire
#define STRONG_CONF          0.85f      // very-confident single window
#define RECORD_HOLD_MS       4000UL     // keep recording this long after last detection
#define SOUND_COOLDOWN_MS    4000UL     // min gap between LoRa SOUND alerts (per label)
#define GAS_FIRE_THRESHOLD   2000
#define SWITCH_ACTIVE_LOW    true
#define VIB_RATE_THRESHOLD   6
#define FIRE_COOLDOWN_MS     5000UL
#define VIB_COOLDOWN_MS      5000UL
#define DHT_REFRESH_MS       3000UL
#define CLIMATE_INTERVAL_MS  300000UL
#define HEARTBEAT_MS         600000UL
#define STATUS_INTERVAL_MS   1000UL

enum CompId { C_MIC, C_SD, C_LORA, C_DHT, C_GAS, C_VIB, C_SWITCH, C_COUNT };
struct Comp { const char* name; bool critical; bool ok; char detail[48]; };
Comp comps[C_COUNT] = {
  { "INMP441 mic", false, false, "" }, { "SD card",   false, false, "" },
  { "LoRa Ra-02",  false, false, "" }, { "DHT22",     false, false, "" },
  { "MQ gas",      false, false, "" }, { "Vibration", false, false, "" },
  { "Switch",      false, false, "" },
};

I2SClass  I2S;
SPIClass  sdSPI(HSPI);
DHT       dht(DHT_PIN, DHT_TYPE);
File      recFile;

/* ---- audio / inference ---- */
#define EI_WIN   EI_CLASSIFIER_RAW_SAMPLE_COUNT  // full 1s window (e.g. 16000 samples)
#define MIC_SHIFT 14                             // 24-bit INMP441 -> 16-bit (tune via debug 'd')
static int16_t audioWin[EI_WIN];
static int     winAmp = 0;
bool           debugScores = false;

// ---- Only ACT on these "useful" forest classes. Edit freely. ----
// Left out: background (no event).
const char* ALLOWED_LABELS[] = {
  "chainsaw", "gunshot", "vehicle_engine",   // logging / poaching / intrusion
  "human_voice",                             // people in the grove
  "elephant", "leopard",                     // key wildlife
  "birds", "frog",                           // ecological / phenology signals (KAALAM)
};
const int ALLOWED_COUNT = sizeof(ALLOWED_LABELS) / sizeof(ALLOWED_LABELS[0]);
static bool isAllowed(const char* label) {
  for (int i = 0; i < ALLOWED_COUNT; i++) if (strcmp(label, ALLOWED_LABELS[i]) == 0) return true;
  return false;
}
char pendingLabel[24] = ""; int pendingCount = 0;
char confirmedLabel[24] = "";

bool      recording = false, prevArmed = false, classifierReady = false;
uint32_t  recBytes = 0, fileCount = 0;
unsigned long recordUntil = 0;
char      curLabel[24] = "background"; float curConf = 0;
char      lastAlertLabel[24] = ""; unsigned long lastSoundMs = 0;
float     cachedT = NAN, cachedH = NAN;
unsigned long lastDhtRead = 0, lastClimate = 0, lastBeat = 0, lastTick = 0;
unsigned long lastFireMs = 0, lastVibMs = 0;
volatile uint32_t vibEdges = 0;
uint32_t vibAccum = 0;
void IRAM_ATTR vibISR() { vibEdges++; }

/* ---- forward decls ---- */
bool initMic();
int  captureWindow();
int  micQuickAmp();
static int ei_get_data(size_t offset, size_t length, float *out_ptr);
void classifyAndAct(unsigned long now, bool armed);
bool openWavFile(const char* label);
void finalizeWav();
void writeWavHeader(File &f, uint32_t dataBytes);
void refreshClimate();
void serviceTelemetry();
void sendLoRaAlert(const char* type, const char* detail);
void runSelfTest();
void printStatusTable();
void indicateStatus();
void printLiveStatus(bool armed, int gas, uint32_t vibRate);
String timestamp();
String clockStr();

/* ===========================================================================
SETUP
=========================================================================== */
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n\n############################################");
  Serial.println("#   ARIVU Kaavu Sentinel — AI sound build   #");
  Serial.println("############################################");

  pinMode(SWITCH_PIN, INPUT_PULLUP);
  pinMode(VIB_PIN, INPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  analogReadResolution(12);
  attachInterrupt(digitalPinToInterrupt(VIB_PIN), vibISR, CHANGE);

  runSelfTest();
  printStatusTable();
  indicateStatus();

  run_classifier_init();
  classifierReady = comps[C_MIC].ok;
  Serial.printf("\nEdge Impulse model: %d classes, %ds window @ %dHz, threshold %.2f\n",
    EI_CLASSIFIER_LABEL_COUNT, (int)(EI_CLASSIFIER_RAW_SAMPLE_COUNT / EI_CLASSIFIER_FREQUENCY),
    (int)EI_CLASSIFIER_FREQUENCY, SOUND_THRESHOLD);
  Serial.println("(send 'd' over serial to toggle per-class score debug, 't' to re-run self-test)");
  if (!comps[C_MIC].ok)
    Serial.println("[WARN] Mic not available — classification disabled, sensors + LoRa still run.");

  Serial.println("\n>>> READY. Switch ON to start listening (records only on detection).\n");
}

/* ===========================================================================
MAIN LOOP
=========================================================================== */
void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 't') { runSelfTest(); printStatusTable(); indicateStatus(); }
    else if (c == 'd') { debugScores = !debugScores; Serial.printf("[debug scores %s]\n", debugScores ? "ON" : "OFF"); }
  }

  unsigned long now = millis();
  bool armed = (digitalRead(SWITCH_PIN) == LOW) == SWITCH_ACTIVE_LOW;

  noInterrupts(); uint32_t v = vibEdges; vibEdges = 0; interrupts();
  vibAccum += v;
  int gas = comps[C_GAS].ok ? analogRead(MQ_AO_PIN) : -1;

  if (armed != prevArmed) {
    if (armed) { Serial.println("\n=== LISTENING (switch ON) ==="); strcpy(curLabel, "background"); curConf = 0; }
    else       { Serial.println("\n=== STANDBY (switch OFF) ===\n"); if (recording) finalizeWav(); }
    prevArmed = armed;
  }

  if (armed) {
    digitalWrite(LED_RED_PIN, LOW); digitalWrite(LED_GREEN_PIN, HIGH);
    if (classifierReady) classifyAndAct(now, armed);
    else delay(20);
  } else {
    digitalWrite(LED_GREEN_PIN, LOW); digitalWrite(LED_RED_PIN, HIGH);
    delay(20);
  }

  // FIRE (gas) — always armed for safety
  if (comps[C_GAS].ok && gas > GAS_FIRE_THRESHOLD && now - lastFireMs > FIRE_COOLDOWN_MS) {
    char d[24]; snprintf(d, 24, "gas=%d", gas);
    Serial.printf(">>> FIRE  %s  (LoRa %s)\n", d, comps[C_LORA].ok ? "sent" : "down");
    sendLoRaAlert("FIRE", d); lastFireMs = now;
  }

  if (comps[C_DHT].ok && now - lastDhtRead > DHT_REFRESH_MS) { lastDhtRead = now; refreshClimate(); }

  if (now - lastTick >= STATUS_INTERVAL_MS) {
    lastTick = now;
    if (vibAccum >= VIB_RATE_THRESHOLD && now - lastVibMs > VIB_COOLDOWN_MS) {
      Serial.printf(">>> TAMPER  vibration=%lu/s  (LoRa %s)\n", (unsigned long)vibAccum, comps[C_LORA].ok ? "sent" : "down");
      sendLoRaAlert("TAMPER", "vibration"); lastVibMs = now;
    }
    printLiveStatus(armed, gas, vibAccum);
    vibAccum = 0;
  }

  serviceTelemetry();
}

/* ===========================================================================
INFERENCE + EVENT-DRIVEN RECORDING
=========================================================================== */
static int ei_get_data(size_t offset, size_t length, float *out_ptr) {
  numpy::int16_to_float(&audioWin[offset], out_ptr, length);
  return 0;
}

bool initMic() {
  I2S.setPins(I2S_SCK_PIN, I2S_WS_PIN, -1, I2S_SD_PIN, -1);
  return I2S.begin(I2S_MODE_STD, EI_CLASSIFIER_FREQUENCY, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO);
}

// Capture one CONTIGUOUS 1-second window (no gaps — matches how the model was trained).
int captureWindow() {
  static int32_t tmp[512];
  int filled = 0;
  int16_t mn = 32767, mx = -32768;
  while (filled < EI_WIN) {
    int want = (EI_WIN - filled < 512) ? (EI_WIN - filled) : 512;
    size_t br = I2S.readBytes((char*)tmp, want * sizeof(int32_t));
    int got = br / sizeof(int32_t);
    if (got <= 0) break;
    for (int i = 0; i < got && filled < EI_WIN; i++) {
      int32_t s = (tmp[i] >> MIC_SHIFT) * MIC_GAIN;
      if (s > 32767) s = 32767; if (s < -32768) s = -32768;
      audioWin[filled] = (int16_t)s;
      if (audioWin[filled] < mn) mn = audioWin[filled];
      if (audioWin[filled] > mx) mx = audioWin[filled];
      filled++;
    }
  }
  winAmp = (filled > 0) ? (mx - mn) : 0;
  return filled;
}

int micQuickAmp() {
  static int32_t tmp[256];
  size_t br = I2S.readBytes((char*)tmp, sizeof(tmp));
  int n = br / sizeof(int32_t);
  if (n <= 0) return -1;
  int16_t mn = 32767, mx = -32768;
  for (int i = 0; i < n; i++) {
    int32_t s = tmp[i] >> MIC_SHIFT;
    if (s > 32767) s = 32767; if (s < -32768) s = -32768;
    if (s < mn) mn = s; if (s > mx) mx = s;
  }
  return mx - mn;
}

void classifyAndAct(unsigned long now, bool armed) {
  int got = captureWindow();
  if (got < EI_WIN) return;

  signal_t signal;
  signal.total_length = EI_WIN;
  signal.get_data = &ei_get_data;
  ei_impulse_result_t result = { 0 };
  if (run_classifier(&signal, &result, false) != EI_IMPULSE_OK) return;

  // global top (for debug) + best USEFUL (allowed) class
  float gBest = 0, bestAllowed = 0; int gi = 0;
  char bestLabel[24] = "background";
  for (int i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    float v = result.classification[i].value;
    const char* lbl = result.classification[i].label;
    if (v > gBest) { gBest = v; gi = i; }
    if (isAllowed(lbl) && v > bestAllowed) { bestAllowed = v; strncpy(bestLabel, lbl, sizeof(bestLabel) - 1); }
  }
  strncpy(curLabel, result.classification[gi].label, sizeof(curLabel) - 1);
  curConf = gBest;

  if (debugScores) {
    Serial.printf("[AI] amp=%d | ", winAmp);
    for (int i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++)
      Serial.printf("%s=%.2f ", result.classification[i].label, result.classification[i].value);
    Serial.println();
  }

  // Only LOUD windows can trigger; then the best USEFUL class must clear the threshold.
  bool loud = winAmp >= MIN_EVENT_AMP;
  bool qualifies = loud && (bestAllowed >= SOUND_THRESHOLD);

  if (qualifies && strcmp(bestLabel, pendingLabel) == 0) pendingCount++;
  else if (qualifies) { strncpy(pendingLabel, bestLabel, sizeof(pendingLabel) - 1); pendingCount = 1; }
  else { pendingCount = 0; pendingLabel[0] = 0; }

  bool confirmed = qualifies && (pendingCount >= CONSEC_HITS || bestAllowed >= STRONG_CONF);

  if (confirmed) {
    strncpy(confirmedLabel, bestLabel, sizeof(confirmedLabel) - 1);
    if (!recording && comps[C_SD].ok) openWavFile(bestLabel);
    recordUntil = now + RECORD_HOLD_MS;
    if (now - lastSoundMs > SOUND_COOLDOWN_MS || strcmp(bestLabel, lastAlertLabel) != 0) {
      char d[40]; snprintf(d, 40, "%s,conf=%.2f", bestLabel, bestAllowed);
      Serial.printf(">>> SOUND %s conf=%.2f amp=%d  (LoRa %s)\n", bestLabel, bestAllowed, winAmp, comps[C_LORA].ok ? "sent" : "down");
      sendLoRaAlert("SOUND", d);
      lastSoundMs = now; strncpy(lastAlertLabel, bestLabel, sizeof(lastAlertLabel) - 1);
    }
  }

  if (recording) {
    recFile.write((uint8_t*)audioWin, got * 2);
    recBytes += got * 2;
    if (now > recordUntil) { finalizeWav(); confirmedLabel[0] = 0; }
  }
}

bool openWavFile(const char* label) {
  String path = "/arivu/" + timestamp() + "_" + String(label) + ".wav";
  recFile = SD.open(path, FILE_WRITE);
  if (!recFile) { Serial.printf("[SD] open FAILED: %s\n", path.c_str()); recording = false; return false; }
  writeWavHeader(recFile, 0);
  recBytes = 0; recording = true; fileCount++;
  Serial.printf("    -> recording: %s\n", path.c_str());
  return true;
}

void finalizeWav() {
  if (!recording) return;
  recFile.seek(0); writeWavHeader(recFile, recBytes); recFile.close();
  recording = false;
  Serial.printf("    -> saved clip (%.1fs, %lu KB)\n", recBytes / (float)(EI_CLASSIFIER_FREQUENCY * 2), (unsigned long)(recBytes / 1024));
}

void writeWavHeader(File &f, uint32_t dataBytes) {
  const uint32_t sr = EI_CLASSIFIER_FREQUENCY; const uint16_t bits = 16, ch = 1;
  const uint32_t byteRate = sr * ch * bits / 8; const uint16_t blockAlign = ch * bits / 8;
  f.write((const uint8_t*)"RIFF", 4); uint32_t c = 36 + dataBytes; f.write((uint8_t*)&c, 4);
  f.write((const uint8_t*)"WAVE", 4); f.write((const uint8_t*)"fmt ", 4);
  uint32_t s1 = 16; f.write((uint8_t*)&s1, 4); uint16_t fmt = 1; f.write((uint8_t*)&fmt, 2);
  f.write((uint8_t*)&ch, 2); f.write((uint8_t*)&sr, 4); f.write((uint8_t*)&byteRate, 4);
  f.write((uint8_t*)&blockAlign, 2); f.write((uint8_t*)&bits, 2);
  f.write((const uint8_t*)"data", 4); f.write((uint8_t*)&dataBytes, 4);
}

void printLiveStatus(bool armed, int gas, uint32_t vibRate) {
  char mode[24];
  if (!armed) snprintf(mode, 24, "STOP        ");
  else if (recording) snprintf(mode, 24, "REC %.7s %3.1fs", curLabel, recBytes / (float)(EI_CLASSIFIER_FREQUENCY * 2));
  else snprintf(mode, 24, "LISTEN");
  Serial.printf("[%s] %s | gas %4d | vib %lu/s | ", mode, clockStr().c_str(), gas, (unsigned long)vibRate);
  if (!isnan(cachedT)) Serial.printf("%.1fC %.0f%%RH | ", cachedT, cachedH);
  else                 Serial.print("--C --%RH | ");
  const char* shown = !armed ? "--" : ((recording && confirmedLabel[0]) ? confirmedLabel : "background");
  Serial.printf("snd:%s %.2f | SD:%s LoRa:%s\n",
    shown, (recording && confirmedLabel[0]) ? curConf : 0.0f,
    comps[C_SD].ok ? "ok" : "--", comps[C_LORA].ok ? "ok" : "--");
}

/* ===========================================================================
CLIMATE + LoRa telemetry
=========================================================================== */
void refreshClimate() {
  float t = dht.readTemperature(), h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) { cachedT = t; cachedH = h; }
}

void serviceTelemetry() {
  unsigned long now = millis();
  if (comps[C_DHT].ok && comps[C_LORA].ok && !isnan(cachedT) && now - lastClimate > CLIMATE_INTERVAL_MS) {
    lastClimate = now; char d[40]; snprintf(d, 40, "temp=%.1f,hum=%.1f", cachedT, cachedH);
    Serial.println(">>> CLIMATE report sent"); sendLoRaAlert("CLIMATE", d);
  }
  if (comps[C_LORA].ok && now - lastBeat > HEARTBEAT_MS) {
    lastBeat = now; char d[40]; snprintf(d, 40, "files=%lu rec=%d", (unsigned long)fileCount, recording ? 1 : 0);
    Serial.println(">>> ALIVE heartbeat sent"); sendLoRaAlert("ALIVE", d);
  }
}

void sendLoRaAlert(const char* type, const char* detail) {
  if (!comps[C_LORA].ok) return;
  String msg = "A|" + timestamp() + "|" + type + "|" + detail;
  LoRa.beginPacket(); LoRa.print(msg); LoRa.endPacket();
}

/* ===========================================================================
SELF-TEST
=========================================================================== */
void runSelfTest() {
  Serial.println("\nRunning self-test...");
  digitalWrite(LED_RED_PIN, HIGH); digitalWrite(LED_GREEN_PIN, LOW);

  if (initMic()) {
    int amp = micQuickAmp();
    if (amp >= 0) {
      comps[C_MIC].ok = true;
      if (amp > 5) snprintf(comps[C_MIC].detail, 48, "audio amp %d", amp);
      else         snprintf(comps[C_MIC].detail, 48, "init OK but quiet now");
    } else snprintf(comps[C_MIC].detail, 48, "readBytes returned 0");
  } else snprintf(comps[C_MIC].detail, 48, "I2S begin failed");

  sdSPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  if (SD.begin(SD_CS_PIN, sdSPI)) {
    if (!SD.exists("/arivu")) SD.mkdir("/arivu");
    File t = SD.open("/arivu/.selftest", FILE_WRITE);
    if (t) { t.print("ok"); t.close(); SD.remove("/arivu/.selftest");
      comps[C_SD].ok = true; snprintf(comps[C_SD].detail, 48, "read/write OK"); }
    else snprintf(comps[C_SD].detail, 48, "card present, write FAILED");
  } else snprintf(comps[C_SD].detail, 48, "begin() failed-check CS5/SCK17/MISO36/MOSI16");

  LoRa.setPins(LORA_CS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);
  if (LoRa.begin(LORA_FREQ)) { LoRa.setSyncWord(0x12);
    comps[C_LORA].ok = true; snprintf(comps[C_LORA].detail, 48, "chip @ 433MHz OK"); }
  else snprintf(comps[C_LORA].detail, 48, "no response-check 3V3/MISO19/NSS4/RST/DIO0");

  dht.begin(); delay(1500); refreshClimate();
  if (!isnan(cachedT)) { comps[C_DHT].ok = true; snprintf(comps[C_DHT].detail, 48, "%.1fC %.0f%%RH", cachedT, cachedH); }
  else snprintf(comps[C_DHT].detail, 48, "NaN-check data13/pullup/3V3");

  int g = analogRead(MQ_AO_PIN);
  if (g > 10 && g < 4085) { comps[C_GAS].ok = true; snprintf(comps[C_GAS].detail, 48, "raw=%d", g); }
  else snprintf(comps[C_GAS].detail, 48, "raw=%d (stuck-check AO34/5V)", g);

  vibEdges = 0; delay(150);
  comps[C_VIB].ok = true; snprintf(comps[C_VIB].detail, 48, "armed-tap to test (live vib/s)");
  bool armed = (digitalRead(SWITCH_PIN) == LOW) == SWITCH_ACTIVE_LOW;
  comps[C_SWITCH].ok = true; snprintf(comps[C_SWITCH].detail, 48, "currently %s", armed ? "LISTEN" : "STOP");

  digitalWrite(LED_RED_PIN, LOW);
}

void printStatusTable() {
  int ok = 0, fail = 0;
  Serial.println("\n+----------------------------------------------------------+");
  Serial.println("|  COMPONENT      | STATUS | DETAIL                        |");
  Serial.println("+----------------------------------------------------------+");
  for (int i = 0; i < C_COUNT; i++) {
    Serial.printf("|  %-13s  | %-5s  | %-29s |\n", comps[i].name, comps[i].ok ? " OK " : "FAIL", comps[i].detail);
    comps[i].ok ? ok++ : fail++;
  }
  Serial.println("+----------------------------------------------------------+");
  Serial.printf("   PASSED: %d    FAILED: %d\n", ok, fail);
  if (fail == 0) Serial.println("   All systems go.");
  else { Serial.print("   Not working: ");
    for (int i = 0; i < C_COUNT; i++) if (!comps[i].ok) { Serial.print(comps[i].name); Serial.print("  "); }
    Serial.println(); }
}

void indicateStatus() {
  int ok = 0, fail = 0; for (int i = 0; i < C_COUNT; i++) comps[i].ok ? ok++ : fail++;
  delay(400);
  for (int i = 0; i < ok; i++)   { digitalWrite(LED_GREEN_PIN, HIGH); delay(140); digitalWrite(LED_GREEN_PIN, LOW); delay(140); }
  delay(400);
  for (int i = 0; i < fail; i++) { digitalWrite(LED_RED_PIN, HIGH);   delay(140); digitalWrite(LED_RED_PIN, LOW);   delay(140); }
  delay(300);
}

String timestamp() { return String(millis()); }

String clockStr() { char b[14]; sprintf(b, "%lus", millis() / 1000); return String(b); }
