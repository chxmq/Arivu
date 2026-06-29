# Arivu

Arivu is a platform for recording, structuring, and validating tribal/elder
ecological knowledge. It is made of two parts that work side by side:

```
.
├── arivu-mobile-app/              # Expo field app — TEACH / ASK / VALIDATE
├── arivu-web-hub/                 # Command dashboard + Hub API + ESP32 gateway
├── champ-project-1_inferencing/     # Edge Impulse model (Arduino library)
└── Makefile                       # make — start hub + dashboard + app together
```

## arivu-mobile-app

The on-the-ground field app used to record elders, gate knowledge by consent,
and run validation (Kaalam). Source lives under `src/` (`app/`, `components/`,
`constants/`, `types/`, `utils/`) using the `@/` import alias.

```bash
cd arivu-mobile-app
npm install
npm start
```

The app reads `EXPO_PUBLIC_HUB_URL` from its `.env` to reach the Hub.

## arivu-web-hub

A static web demo (Saakshi / Padhavi / Kaalam / Dashboard) plus a Node Hub
server (`server/*.mjs`) that stores the shared corpus (`data/hub-store.json`).

```bash
cd arivu-web-hub
# serve the static site
npx serve .
# or run the hub server
node server/hub.mjs
```

## How they connect

The mobile app syncs recorded knowledge entries to the Hub server in
`arivu-web-hub/`, and pulls the merged corpus back for ASK/VALIDATE. Point the
app's `EXPO_PUBLIC_HUB_URL` at the running Hub.

## Kaavu Sentinel (ESP32 hardware)

Firmware and wiring docs live in `arivu-web-hub/hardware/`. Flash the sentinel
with `kaavu_sentinel/kaavu_sentinel.ino` and the `champ-project-1_inferencing`
library. Bridge USB serial to the dashboard with:

```bash
cd arivu-web-hub && node gateway.js
```

Run everything at once from the repo root: `make` (hub, dashboard, mobile app, and ESP32 gateway).