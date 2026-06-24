# Arivu

Arivu is a platform for recording, structuring, and validating tribal/elder
ecological knowledge. It is made of two parts that work side by side:

```
.
├── arivu-mobile-app/   # Expo (React Native) field app — TEACH / ASK / VALIDATE / REVIEW
└── arivu-web-hub/      # Web dashboard + Node "Hub" server the app syncs to
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
