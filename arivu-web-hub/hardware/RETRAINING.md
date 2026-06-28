# Retraining the Kaavu Sentinel sound model (the real accuracy fix)

The current model misclassifies because it was trained on audio that doesn't
match what the INMP441 on the tree actually hears. Fix = retrain on clips
recorded **through this mic**, with **fewer, distinct classes**.

Target: **4 classes**, ~40 clips each, retrain in Edge Impulse, re-export.

---

## Step 1 — Pick the classes (fewer = far more accurate)
Default in `kaavu_collect/kaavu_collect.ino`:
```
const char* CLASSES[] = { "background", "chainsaw", "vehicle_engine", "human_voice" };
```
`background` is mandatory (it's "nothing happening"). Swap the others for what
matters to your grove, but keep them **acoustically distinct** and **4 total**.
Edit that line if you want different classes.

## Step 2 — Collect data THROUGH the mic
1. Flash the collector:
   ```
   arduino-cli compile --fqbn esp32:esp32:esp32 hardware/kaavu_collect
   arduino-cli upload  -p /dev/cu.usbserial-0001 --fqbn esp32:esp32:esp32 hardware/kaavu_collect
   ```
2. Open the serial monitor (Arduino IDE @115200, or `arduino-cli monitor -p /dev/cu.usbserial-0001 -c baudrate=115200`).
3. For each class: press its **number** to select, then press **`r`** to record a 3s clip
   (or **`a`** for auto back-to-back). Watch the printed **`amp=`** — aim for a few
   thousand up to ~25,000. If it shows ~60,000 it's **clipping** (too loud) — back off.
4. Record **~40 clips per class**, varied:
   - `background`: the real site ambient (wind, leaves, distant noise) — lots of it.
   - threat classes: different distances, volumes, sources.
   Balance the counts (press `l` to check).

## Step 3 — Get the clips off the SD card
Files are in `/collect/<class>_<n>.wav` (16 kHz mono 16-bit). Pull the SD card and
copy the `collect` folder to your computer.

## Step 4 — Upload to Edge Impulse
Web: your project → **Data acquisition → Upload data** → select the WAVs →
"Infer label from filename" (the `<class>_` prefix becomes the label) → upload to
the Training set (let it auto-split test).

Or CLI:
```
npm install -g edge-impulse-cli
edge-impulse-uploader --category split --label chainsaw collect/chainsaw_*.wav
edge-impulse-uploader --category split --label vehicle_engine collect/vehicle_engine_*.wav
edge-impulse-uploader --category split --label human_voice collect/human_voice_*.wav
edge-impulse-uploader --category split --label background collect/background_*.wav
```

## Step 5 — Build the impulse (match the firmware)
- **Create impulse:** Window size **1000 ms**, window increase **500 ms**, frequency **16000 Hz**.
- **Processing block:** **Audio (MFE)** for environmental sounds (or MFCC for voice-heavy). Defaults are fine.
- **Learning block:** **Classification (NN)**.
- Generate features → **Train**. Aim for **>85%** accuracy and a clean confusion
  matrix. If two classes confuse each other, add more varied data for them.

## Step 6 — Export and hand it back to me
- **Deployment → Arduino library → Build → download the .zip.**
- Unzip it. It'll be named like `ei-arivu-arduino-x.x.x` containing a header
  `<projectname>_inferencing.h`. **Keep the Arduino project named `arivu`** so the
  header stays `arivu_inferencing.h`, OR just tell me the new header name.
- Replace the folder at the repo root:
  `champ-project-1_inferencing/`  ← put the new `src/`, `library.properties` here.
- Update the `#include` in `hardware/kaavu_sentinel/kaavu_sentinel.ino` if the
  header name changed, then recompile and flash.

---

## Why this works when threshold tweaks didn't
- Fewer classes → the network separates them cleanly instead of hedging across 12.
- Mic-native clips → the features at inference match the features at training.
- Same audio settings (16 kHz, MIC_SHIFT 14) in `kaavu_collect` and `kaavu_sentinel`,
  so there's no train/deploy mismatch.

Tip: record `background` generously and at the actual deployment spot — most false
alarms come from a weak/under-represented background class.
