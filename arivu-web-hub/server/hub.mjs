#!/usr/bin/env node
/**
 * Arivu Hub — lightweight JSON API for the demo website + mobile app.
 * Serves corpus entries (from Saakshi app) and Kaavu Sentinel telemetry.
 *
 * Run: node server/hub.mjs
 * Default: http://localhost:8787
 */
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askCorpus } from "./ask.mjs";
import { assistCommandBoard } from "./assistant.mjs";
import { applyValidationPipeline, confirmValidation, storeManualAssessment } from "./validate-pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "../data/hub-store.json");
const AUDIO_DIR = path.join(__dirname, "../data/audio");

fs.mkdirSync(AUDIO_DIR, { recursive: true });

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function audioFileCandidates(id) {
  const base = sanitizeId(id);
  return [".m4a", ".mp3", ".caf", ".wav"].map((ext) => path.join(AUDIO_DIR, base + ext));
}

function findAudioFile(id) {
  return audioFileCandidates(id).find((p) => fs.existsSync(p)) || null;
}

function removeAudioFiles(id) {
  audioFileCandidates(id).forEach((p) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

/** Load site/.env into process.env (no extra package). */
function loadEnv() {
  const envPath = path.join(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const PORT = Number(process.env.ARIVU_HUB_PORT || 8787);
const HOST = process.env.ARIVU_HUB_HOST || "0.0.0.0";

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeStore(data) {
  data.updated_at = new Date().toISOString();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function persistWithValidation(store, pipeOptions = {}) {
  writeStore(store);
  const pipe = applyValidationPipeline(store, pipeOptions);
  if (!pipe.skipped) writeStore(store);
  return pipe;
}

function simulateTelemetry(store) {
  store.sentinels = (store.sentinels || []).map((s) => {
    const t = { ...s.telemetry };
    t.temp_c = round(t.temp_c + (Math.random() - 0.5) * 0.6, 1);
    t.humidity_pct = clamp(round(t.humidity_pct + (Math.random() - 0.5) * 4, 0), 40, 99);
    t.rain_mm_24h = round(Math.max(0, t.rain_mm_24h + (Math.random() - 0.4) * 0.8), 1);
    t.bioacoustic_events_24h = Math.max(0, Math.round(t.bioacoustic_events_24h + (Math.random() - 0.3) * 3));
    t.battery_pct = clamp(Math.round(t.battery_pct + (Math.random() - 0.55) * 2), 10, 100);
    t.solar_charging = t.battery_pct < 95 && Math.random() > 0.25;
    if (s.linked_prediction && s.linked_prediction.includes("Cuckoo")) {
      t.cuckoo_call_detected = Math.random() > 0.7;
    }
    return { ...s, telemetry: t, status: s.status === "offline" ? "offline" : "online" };
  });
  return store;
}

function round(n, d) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, code, body) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res, code, html) {
  cors(res);
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function hubHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Arivu Hub</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 20px; color: #2a2a2a; line-height: 1.5; }
    h1 { color: #1B6B47; font-size: 1.5rem; }
    p { color: #6F6657; }
    a { color: #1B6B47; }
    code { background: #f4f0e8; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    ul { padding-left: 1.2rem; }
    .note { background: #f4f0e8; border-left: 4px solid #E0A92E; padding: 12px 16px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>◈ Arivu Hub</h1>
  <p>JSON API for the Saakshi app and website dashboard — not the demo UI itself.</p>
  <div class="note">
    <strong>Command center:</strong><br />
    <a href="http://localhost:8765/">http://localhost:8765/</a>
  </div>
  <p><strong>API routes</strong></p>
  <ul>
    <li><a href="/api/health"><code>GET /api/health</code></a></li>
    <li><a href="/api/dashboard"><code>GET /api/dashboard</code></a> — corpus + sentinels</li>
    <li><a href="/api/sentinels"><code>GET /api/sentinels</code></a> — sentinel telemetry</li>
    <li><a href="/api/corpus"><code>GET /api/corpus</code></a></li>
    <li><code>POST /api/corpus</code> — sync metadata from mobile TEACH</li>
    <li><code>POST /api/corpus/:id/audio</code> — upload elder recording (base64)</li>
    <li><code>GET /api/corpus/:id/audio</code> — play elder recording</li>
    <li><code>DELETE /api/corpus/:id</code> — remove entry</li>
  </ul>
</body>
</html>`;
}

function parseBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      raw += c;
    });
    req.on("end", () => {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function sendAudio(res, filePath, mime) {
  cors(res);
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": mime || "audio/mp4",
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
  });
  fs.createReadStream(filePath).pipe(res);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  try {
    if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return sendHtml(res, 200, hubHomePage());
    }

    if (method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, service: "arivu-hub", time: new Date().toISOString() });
    }

    if (method === "GET" && /^\/api\/corpus\/[^/]+\/audio$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const filePath = findAudioFile(id);
      if (!filePath) return send(res, 404, { error: "audio not found" });
      const store = readStore();
      const entry = (store.corpus || []).find((e) => e.id === id);
      const mime = entry?.audio_mime || (filePath.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4");
      return sendAudio(res, filePath, mime);
    }

    if (method === "GET" && url.pathname === "/api/corpus") {
      const store = readStore();
      return send(res, 200, { corpus: store.corpus || [], updated_at: store.updated_at });
    }

    if (method === "POST" && url.pathname === "/api/corpus") {
      const body = await parseBody(req);
      if (!body || !body.transcript) return send(res, 400, { error: "transcript required" });
      const store = readStore();
      const incoming = {
        id: body.id || "hub_" + Date.now(),
        source: body.source || "saakshi-app",
        received_at: new Date().toISOString(),
        corpus_partition: body.corpus_partition || "field",
        language: body.language || body.dialect || body.tribe || "",
        ...body,
      };
      const idx = store.corpus.findIndex((e) => e.id === incoming.id);
      let entry;
      if (idx >= 0) {
        const prev = store.corpus[idx];
        entry = {
          ...prev,
          ...incoming,
          received_at: prev.received_at || incoming.received_at,
          audio_url: incoming.audio_url ?? prev.audio_url,
          has_audio: incoming.has_audio ?? prev.has_audio ?? Boolean(prev.audio_url),
          audio_duration_seconds: incoming.audio_duration_seconds ?? prev.audio_duration_seconds,
          audio_mime: incoming.audio_mime ?? prev.audio_mime,
        };
        store.corpus[idx] = entry;
      } else {
        entry = incoming;
        store.corpus.push(entry);
      }
      writeStore(store);
      const pipe = applyValidationPipeline(store, {
        force: true,
        reason: "corpus-sync",
        entryIds: [entry.id],
      });
      if (!pipe.skipped) writeStore(store);
      console.log("[hub] corpus +1:", entry.id, entry.transcript?.slice(0, 40), entry.validation_status || "");
      return send(res, 201, { ok: true, entry, validation_pipeline: pipe });
    }

    if (method === "POST" && /^\/api\/corpus\/[^/]+\/audio$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const body = await parseBody(req, 25 * 1024 * 1024);
      if (!body?.audio_base64) return send(res, 400, { error: "audio_base64 required" });
      const store = readStore();
      const idx = store.corpus.findIndex((e) => e.id === id);
      if (idx < 0) return send(res, 404, { error: "corpus entry not found — sync metadata first" });

      const mime = body.mime_type || "audio/mp4";
      const ext = mime.includes("mpeg") || mime.includes("mp3") ? ".mp3" : ".m4a";
      const filePath = path.join(AUDIO_DIR, sanitizeId(id) + ext);
      fs.writeFileSync(filePath, Buffer.from(body.audio_base64, "base64"));

      store.corpus[idx].has_audio = true;
      store.corpus[idx].audio_url = `/api/corpus/${encodeURIComponent(id)}/audio`;
      store.corpus[idx].audio_mime = mime;
      if (body.duration_seconds != null) {
        store.corpus[idx].audio_duration_seconds = Number(body.duration_seconds);
      }
      writeStore(store);
      console.log("[hub] audio saved:", id, Math.round(body.audio_base64.length / 1024) + "kb b64");
      return send(res, 201, {
        ok: true,
        audio_url: store.corpus[idx].audio_url,
        entry: store.corpus[idx],
      });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/corpus/")) {
      const parts = url.pathname.split("/");
      const id = decodeURIComponent(parts[parts.length - 1]);
      const store = readStore();
      const before = store.corpus.length;
      store.corpus = (store.corpus || []).filter((e) => e.id !== id);
      if (store.corpus.length === before) return send(res, 404, { error: "entry not found" });
      removeAudioFiles(id);
      writeStore(store);
      console.log("[hub] corpus -1:", id);
      return send(res, 200, { ok: true, deleted: id });
    }

    if (method === "PATCH" && url.pathname.startsWith("/api/corpus/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const body = await parseBody(req);
      const store = readStore();
      const idx = store.corpus.findIndex((e) => e.id === id);
      if (idx < 0) return send(res, 404, { error: "entry not found" });
      const allowed = [
        "validation_status", "validation_result", "validated_at", "validation_source",
        "sentinel_recommendation", "manual_assessment",
        "validation_confirmed_by", "validation_confirmed_at", "validation_confirmed_source",
        "linked_sentinel_id", "review_notes", "assigned_to", "consent_level",
        "flagged", "elder_name", "village", "district", "tribe",
      ];
      allowed.forEach((k) => { if (body && body[k] !== undefined) store.corpus[idx][k] = body[k]; });
      if (body?.validation_status && !body.validation_confirmed_at) {
        store.corpus[idx].validation_confirmed_at = new Date().toISOString();
        if (body.validation_confirmed_by) {
          store.corpus[idx].validation_confirmed_by = body.validation_confirmed_by;
        } else if (body.assigned_to) {
          store.corpus[idx].validation_confirmed_by = body.assigned_to;
        }
      }
      store.corpus[idx].updated_at = new Date().toISOString();
      writeStore(store);
      return send(res, 200, { ok: true, entry: store.corpus[idx] });
    }

    if (method === "PATCH" && url.pathname.startsWith("/api/sentinels/") && !url.pathname.endsWith("/telemetry")) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const body = await parseBody(req);
      const store = readStore();
      const s = store.sentinels.find((x) => x.id === id);
      if (!s) return send(res, 404, { error: "sentinel not found" });
      const allowed = [
        "name", "location", "status", "maintenance_status", "linked_elder",
        "linked_prediction", "linked_corpus_id", "notes", "installed_date", "incharge",
      ];
      allowed.forEach((k) => {
        if (body && body[k] !== undefined) {
          if (k === "incharge" && typeof body[k] === "object") {
            s.incharge = { ...(s.incharge || {}), ...body[k] };
          } else {
            s[k] = body[k];
          }
        }
      });
      s.updated_at = new Date().toISOString();
      writeStore(store);
      console.log("[hub] sentinel updated:", id);
      return send(res, 200, { ok: true, sentinel: s });
    }

    if (method === "POST" && url.pathname === "/api/sentinels") {
      const body = await parseBody(req);
      if (!body || !body.name) return send(res, 400, { error: "name required" });
      const store = readStore();
      const sentinel = {
        id: body.id || "SNT_" + Date.now(),
        name: body.name,
        location: body.location || "Wayanad",
        geohash: body.geohash || "",
        lat: body.lat,
        lng: body.lng,
        status: body.status || "offline",
        maintenance_status: body.maintenance_status || "operational",
        incharge: body.incharge || { name: "", role: "BMC Field Officer", phone: "", organisation: "" },
        linked_elder: body.linked_elder || "",
        linked_prediction: body.linked_prediction || "",
        notes: body.notes || "",
        installed_date: body.installed_date || new Date().toISOString().slice(0, 10),
        telemetry: body.telemetry || {
          temp_c: null, humidity_pct: null, rain_mm_24h: 0,
          bioacoustic_events_24h: 0, battery_pct: 100, solar_charging: false,
        },
      };
      store.sentinels.push(sentinel);
      writeStore(store);
      return send(res, 201, { ok: true, sentinel });
    }

    if (method === "GET" && url.pathname === "/api/sentinels") {
      const simulate = url.searchParams.get("simulate") !== "false";
      let store = readStore();
      if (simulate) {
        store = simulateTelemetry(store);
        const pipe = applyValidationPipeline(store, { force: false, reason: "sentinel-telemetry" });
        writeStore(store);
      }
      return send(res, 200, {
        sentinels: store.sentinels || [],
        updated_at: store.updated_at,
        last_validation_run: store.last_validation_run || null,
      });
    }

    if (method === "POST" && url.pathname.startsWith("/api/sentinels/") && url.pathname.endsWith("/telemetry")) {
      const id = url.pathname.split("/")[3];
      const body = await parseBody(req);
      const store = readStore();
      const s = store.sentinels.find((x) => x.id === id);
      if (!s) return send(res, 404, { error: "sentinel not found" });
      s.telemetry = { ...s.telemetry, ...body, updated_at: new Date().toISOString() };
      const pipe = persistWithValidation(store, { force: true, reason: "sentinel-telemetry-push" });
      return send(res, 200, { ok: true, sentinel: s, validation_pipeline: pipe });
    }

    if (method === "GET" && url.pathname === "/api/feeds") {
      const lat = url.searchParams.get("lat") || "11.6854";
      const lng = url.searchParams.get("lng") || "76.132";
      const species = url.searchParams.get("species") || "Cuculus micropterus";
      try {
        const weatherUrl =
          "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lng +
          "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code" +
          "&daily=precipitation_sum&timezone=Asia%2FKolkata&forecast_days=3";
        const gbifUrl =
          "https://api.gbif.org/v1/occurrence/search?decimalLatitude=" + lat +
          "&decimalLongitude=" + lng + "&radius=30&scientificName=" + encodeURIComponent(species) + "&limit=0";
        const [weather, gbif] = await Promise.all([
          fetchJson(weatherUrl),
          fetchJson(gbifUrl),
        ]);
        return send(res, 200, {
          weather: {
            source: "Open-Meteo",
            current: weather.current || null,
            daily: weather.daily || null,
            fetched_at: new Date().toISOString(),
          },
          gbif: {
            source: "GBIF",
            species,
            count: gbif.count || 0,
            fetched_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        return send(res, 502, { error: "feed fetch failed", detail: String(err.message || err) });
      }
    }

    if (method === "POST" && url.pathname === "/api/assistant") {
      const body = await parseBody(req);
      const message = body?.message || body?.question || "";
      const store = readStore();
      const result = await assistCommandBoard(store, message, body?.context || {});
      return send(res, 200, { ok: true, ...result, asked_at: new Date().toISOString() });
    }

    if (method === "POST" && url.pathname === "/api/ask") {
      const body = await parseBody(req);
      const question = body?.question || body?.q || "";
      const role = body?.viewer_role || "OUTSIDER";
      const store = readStore();
      const result = await askCorpus(store.corpus || [], question, role);
      return send(res, 200, { ok: true, ...result, asked_at: new Date().toISOString() });
    }

    if (method === "POST" && url.pathname === "/api/validate/manual") {
      const body = await parseBody(req);
      const id = body?.entry_id || body?.id;
      const assessment = body?.manual_assessment || body?.assessment;
      if (!id || !assessment) return send(res, 400, { error: "entry_id and manual_assessment required" });
      const store = readStore();
      const idx = store.corpus.findIndex((e) => e.id === id);
      if (idx < 0) return send(res, 404, { error: "entry not found" });
      storeManualAssessment(store.corpus[idx], {
        ...assessment,
        validated_at: assessment.assessed_at || new Date().toISOString(),
      });
      writeStore(store);
      return send(res, 200, { ok: true, entry: store.corpus[idx] });
    }

    if (method === "POST" && url.pathname === "/api/validate/confirm") {
      const body = await parseBody(req);
      const id = body?.entry_id || body?.id;
      const status = body?.validation_status || body?.status;
      if (!id || !status) return send(res, 400, { error: "entry_id and validation_status required" });
      const store = readStore();
      const idx = store.corpus.findIndex((e) => e.id === id);
      if (idx < 0) return send(res, 404, { error: "entry not found" });
      confirmValidation(store.corpus[idx], {
        status,
        confirmed_by: body?.confirmed_by || body?.reviewer_id || "Human reviewer",
        notes: body?.notes || body?.review_notes,
        source: body?.source || body?.confirmed_source || "custom",
      });
      writeStore(store);
      console.log("[hub] human confirmed:", id, "→", status);
      return send(res, 200, { ok: true, entry: store.corpus[idx] });
    }

    if (method === "POST" && url.pathname === "/api/validate/run") {
      const body = await parseBody(req);
      const store = readStore();
      const entryIds = body?.entry_ids || (body?.entry_id ? [body.entry_id] : null);
      const pipe = applyValidationPipeline(store, {
        force: true,
        reason: body?.reason || "manual-run",
        entryIds,
      });
      if (!pipe.skipped) writeStore(store);
      return send(res, 200, { ok: true, ...pipe });
    }

    if (method === "GET" && url.pathname === "/api/validate/status") {
      const store = readStore();
      const typeC = (store.corpus || []).filter((e) => {
        const t = String(e.knowledge_type || "").toUpperCase();
        return (t === "C" || t.includes("TYPE_C")) && e.prediction;
      });
      return send(res, 200, {
        last_validation_run: store.last_validation_run || null,
        validation_log: store.validation_log || [],
        type_c_count: typeC.length,
        by_status: typeC.reduce((acc, e) => {
          const s = e.validation_status || "PENDING";
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        }, {}),
      });
    }

    if (method === "GET" && url.pathname === "/api/dashboard") {
      let store = readStore();
      store = simulateTelemetry(store);
      const pipe = applyValidationPipeline(store, { force: false, reason: "dashboard-refresh" });
      if (!pipe.skipped) writeStore(store);
      else writeStore(store);
      return send(res, 200, {
        corpus_count: (store.corpus || []).length,
        sentinel_count: (store.sentinels || []).length,
        sentinels_online: store.sentinels.filter((s) => s.status === "online").length,
        corpus: store.corpus,
        sentinels: store.sentinels,
        updated_at: store.updated_at,
        last_validation_run: store.last_validation_run || null,
        validation_log: (store.validation_log || []).slice(0, 15),
        validation_pipeline: pipe.skipped ? { skipped: true } : {
          assessed_count: pipe.assessed_count,
          changed_count: pipe.changed_count,
        },
      });
    }

    send(res, 404, { error: "not found", routes: ["/api/health", "/api/corpus", "/api/sentinels", "/api/dashboard"] });
  } catch (err) {
    console.error("[hub]", err);
    send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Arivu Hub → http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log("  GET  /api/dashboard  — corpus + sentinels (live sim)");
  console.log("  GET  /api/sentinels  — sentinel boxes + telemetry");
  console.log("  POST /api/corpus     — sync metadata from Saakshi TEACH");
  console.log("  POST /api/corpus/:id/audio — upload elder speech recording");
  console.log("  GET  /api/corpus/:id/audio — stream recording for website + ASK");
  console.log("  POST /api/validate/manual  — store manual KAALAM assessment");
  console.log("  POST /api/validate/confirm — human confirms (sentinel / manual / custom)");
  console.log("  POST /api/ask        — corpus-grounded Q&A (set OPENAI_API_KEY for AI)");
});
