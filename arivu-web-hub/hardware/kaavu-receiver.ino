/* ============================================================================
ARIVU — LoRa RECEIVER (USB → Mac → gateway.js → Arivu Hub)
----------------------------------------------------------------------------
A second ESP32 that listens for the Kaavu Sentinel's LoRa packets and prints
each one to USB serial, verbatim, so `node gateway.js` can forward it to the hub.

Sentinel sends:  A|<timestamp>|<type>|<detail>
  FIRE    -> gas=2150
  TAMPER  -> vibration
  CLIMATE -> temp=28.4,hum=71.0
  ALIVE   -> files=2 rec=1

This sketch prints the payload exactly as received (one per line). The trailing
" rssi=.." that some setups add is optional — gateway.js ignores extra fields.

MUST MATCH THE SENTINEL: frequency 433 MHz and syncWord 0x12.

LoRa Ra-02 wiring (same as the sentinel node):
  VCC  3V3        GND  GND
  SCK  GPIO18     MISO GPIO19     MOSI GPIO23
  NSS  GPIO4      RST  GPIO27     DIO0 GPIO26

LIBRARIES: LoRa (Sandeep Mistry).   BOARD: "ESP32 Dev Module".
============================================================================ */
#include <SPI.h>
#include <LoRa.h>

#define LORA_CS_PIN    4
#define LORA_RST_PIN  27
#define LORA_DIO0_PIN 26
#define LORA_FREQ    433E6
#define LORA_SYNCWORD 0x12   // must equal the sentinel's setSyncWord()

#define LED_PIN        2     // blinks on each received packet

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n# ARIVU LoRa receiver starting...");
  LoRa.setPins(LORA_CS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("# LoRa init FAILED — check 3V3 / RST / DIO0 wiring.");
    while (true) { digitalWrite(LED_PIN, !digitalRead(LED_PIN)); delay(150); }
  }
  LoRa.setSyncWord(LORA_SYNCWORD);
  Serial.println("# LoRa receiver ready @ 433MHz. Listening for Kaavu Sentinel...");
}

void loop() {
  int packetSize = LoRa.parsePacket();
  if (packetSize == 0) return;

  String payload = "";
  while (LoRa.available()) payload += (char)LoRa.read();
  payload.trim();
  if (payload.length() == 0) return;

  // Forward verbatim so gateway.js can parse "A|ts|type|detail".
  // Append RSSI as an extra field (ignored by the gateway, handy for debugging).
  Serial.print(payload);
  Serial.print(" rssi=");
  Serial.println(LoRa.packetRssi());

  digitalWrite(LED_PIN, HIGH); delay(30); digitalWrite(LED_PIN, LOW);
}
