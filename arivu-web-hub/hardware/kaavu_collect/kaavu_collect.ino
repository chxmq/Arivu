/* ============================================================================
ARIVU — dataset collector (records labeled WAV clips through the INMP441)
----------------------------------------------------------------------------
Use this to build a training set THROUGH THE REAL MIC, then upload the clips to
Edge Impulse and retrain. Audio settings match the sentinel exactly (16 kHz,
16-bit mono, MIC_SHIFT 14) so the training domain == the inference domain.

SERIAL @ 115200 — commands:
  1..9  select class (see list printed at boot)
  r     record ONE clip (CLIP_SECONDS) for the selected class
  a     toggle AUTO mode (records clips back-to-back for fast bulk capture)
  l     list how many clips recorded per class
Files: /collect/<class>_<n>.wav   (mono 16k 16-bit — ready for Edge Impulse)

BOARD: ESP32 Dev Module.  Wiring identical to kaavu_sentinel (SD on HSPI).
============================================================================ */
#include <ESP_I2S.h>
#include <SPI.h>
#include <SD.h>

#define I2S_SCK_PIN 14
#define I2S_WS_PIN  15
#define I2S_SD_PIN  32
#define SD_CS_PIN    5
#define SD_SCK_PIN  17
#define SD_MISO_PIN 36
#define SD_MOSI_PIN 16
#define LED_GREEN_PIN 25
#define LED_RED_PIN    2

#define SAMPLE_RATE   16000
#define MIC_SHIFT     14          // MUST match kaavu_sentinel
#define CLIP_SECONDS  3
#define CHUNK         512

// ---- edit this list to the classes you want to train ----
const char* CLASSES[] = { "background", "chainsaw", "gunshot", "human_voice",
                          "frog", "birds", "elephant", "leopard", "vehicle_engine" };
const int NCLASS = sizeof(CLASSES) / sizeof(CLASSES[0]);
int   selected = 0;
bool  autoMode = false;
long  counts[16] = {0};

I2SClass I2S;
SPIClass sdSPI(HSPI);

bool initMic() {
  I2S.setPins(I2S_SCK_PIN, I2S_WS_PIN, -1, I2S_SD_PIN, -1);
  return I2S.begin(I2S_MODE_STD, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO);
}

void writeWavHeader(File &f, uint32_t dataBytes) {
  const uint32_t sr = SAMPLE_RATE; const uint16_t bits = 16, ch = 1;
  const uint32_t byteRate = sr * ch * bits / 8; const uint16_t blockAlign = ch * bits / 8;
  f.write((const uint8_t*)"RIFF", 4); uint32_t c = 36 + dataBytes; f.write((uint8_t*)&c, 4);
  f.write((const uint8_t*)"WAVE", 4); f.write((const uint8_t*)"fmt ", 4);
  uint32_t s1 = 16; f.write((uint8_t*)&s1, 4); uint16_t fmt = 1; f.write((uint8_t*)&fmt, 2);
  f.write((uint8_t*)&ch, 2); f.write((uint8_t*)&sr, 4); f.write((uint8_t*)&byteRate, 4);
  f.write((uint8_t*)&blockAlign, 2); f.write((uint8_t*)&bits, 2);
  f.write((const uint8_t*)"data", 4); f.write((uint8_t*)&dataBytes, 4);
}

void recordClip() {
  const char* cls = CLASSES[selected];
  String path = "/collect/" + String(cls) + "_" + String(millis()) + ".wav";
  File f = SD.open(path, FILE_WRITE);
  if (!f) { Serial.printf("[SD] open FAILED: %s\n", path.c_str()); return; }
  writeWavHeader(f, 0);

  digitalWrite(LED_GREEN_PIN, HIGH); digitalWrite(LED_RED_PIN, LOW);
  Serial.printf("REC %s ...", cls);

  const uint32_t target = (uint32_t)CLIP_SECONDS * SAMPLE_RATE;  // samples
  uint32_t done = 0; uint32_t bytes = 0;
  static int32_t raw[CHUNK]; static int16_t pcm[CHUNK];
  int16_t mn = 32767, mx = -32768;
  while (done < target) {
    int want = (target - done < CHUNK) ? (target - done) : CHUNK;
    size_t br = I2S.readBytes((char*)raw, want * sizeof(int32_t));
    int got = br / sizeof(int32_t);
    if (got <= 0) break;
    for (int i = 0; i < got; i++) {
      int32_t s = raw[i] >> MIC_SHIFT;
      if (s > 32767) s = 32767; if (s < -32768) s = -32768;
      pcm[i] = (int16_t)s;
      if (pcm[i] < mn) mn = pcm[i]; if (pcm[i] > mx) mx = pcm[i];
    }
    f.write((uint8_t*)pcm, got * 2);
    bytes += got * 2; done += got;
  }
  f.seek(0); writeWavHeader(f, bytes); f.close();
  digitalWrite(LED_GREEN_PIN, LOW); digitalWrite(LED_RED_PIN, HIGH);
  counts[selected]++;
  Serial.printf(" saved %s (%.1fs, amp=%d, #%ld)\n", path.c_str(), done / (float)SAMPLE_RATE, mx - mn, counts[selected]);
}

void wipeCollect() {
  File dir = SD.open("/collect");
  if (!dir) { SD.mkdir("/collect"); return; }
  int n = 0; File e;
  while ((e = dir.openNextFile())) {
    String nm = e.name();
    String p = nm.startsWith("/") ? nm : (String("/collect/") + nm);
    e.close();
    if (SD.remove(p)) n++;
  }
  dir.close();
  for (int i = 0; i < 16; i++) counts[i] = 0;
  Serial.printf("wiped /collect (%d files deleted)\n", n);
}

void printMenu() {
  Serial.println("\n--- ARIVU dataset collector ---");
  for (int i = 0; i < NCLASS; i++)
    Serial.printf("  %d = %-14s (%ld clips)%s\n", i + 1, CLASSES[i], counts[i], i == selected ? "  <- selected" : "");
  Serial.println("  r = record one clip | a = auto on/off | l = list");
  Serial.printf("Selected: %s | clip=%ds | auto=%s\n", CLASSES[selected], CLIP_SECONDS, autoMode ? "ON" : "OFF");
}

void setup() {
  Serial.begin(115200); delay(400);
  pinMode(LED_GREEN_PIN, OUTPUT); pinMode(LED_RED_PIN, OUTPUT);
  Serial.println("\n# ARIVU dataset collector");

  if (!initMic()) Serial.println("[FATAL] mic I2S begin failed");
  sdSPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  if (!SD.begin(SD_CS_PIN, sdSPI)) { Serial.println("[FATAL] SD begin failed — check wiring"); }
  else { if (!SD.exists("/collect")) SD.mkdir("/collect"); Serial.println("SD ready -> /collect"); }

  printMenu();
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c >= '1' && c <= '9') { int n = c - '1'; if (n < NCLASS) { selected = n; Serial.printf("selected: %s\n", CLASSES[selected]); } }
    else if (c == 'r') recordClip();
    else if (c == 'a') { autoMode = !autoMode; Serial.printf("auto=%s\n", autoMode ? "ON" : "OFF"); }
    else if (c == 'x') { wipeCollect(); }
    else if (c == 'l') printMenu();
  }
  if (autoMode) recordClip();
}
