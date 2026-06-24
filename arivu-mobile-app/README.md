# Arivu — Mobile App

Expo (React Native) field app for recording, structuring, and validating
tribal/elder ecological knowledge. It is the on-the-ground companion to the
[`arivu-web-hub`](../arivu-web-hub) dashboard and Hub server.

## Features

- **TEACH** — record an elder, capture consent level, dialect, GPS, and species.
- **ASK** — play back what elders taught (consent-gated retrieval, never invents).
- **VALIDATE** — run Kaalam predictions against datasets (Welch's t-test, etc.).
- **REVIEW** — verify folk-name → species mappings and confirm entries.

## Tech

- Expo Router (`src/app`) with typed routes
- TypeScript with the `@/` path alias mapped to `src/`
- AsyncStorage for local entries, syncing to the Hub

## Project structure

```
src/
  app/          # screens / routes (expo-router)
  components/    # reusable UI
  constants/     # colors, hub, command-board, teach-demos
  types/         # shared TypeScript types
  utils/         # ask, audio, consent, geohash, kaalam, stats, storage, sync
assets/          # fonts + images
```

## Getting started

```bash
npm install
cp .env.example .env   # then set EXPO_PUBLIC_HUB_URL to your Hub's address
npm start
```

Scan the QR with Expo Go, or press `a` / `i` / `w` for Android / iOS / web.

## Environment

| Variable | Description |
| --- | --- |
| `EXPO_PUBLIC_HUB_URL` | Base URL of the running `arivu-web-hub` Hub server |
| `EXPO_PUBLIC_COMMAND_URL` | Base URL of the Command Board endpoint |

`.env` is git-ignored — never commit real values. Use `.env.example` as the template.
