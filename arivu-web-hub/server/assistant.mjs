/** Command Board AI assistant — navigates and explains the Arivu dashboard. */

const SECTIONS = [
  {
    id: "overview",
    name: "Overview",
    desc: "Live stats — corpus count, sentinels online, Type C predictions, pending validation. Mini map and recent syncs.",
    tips: ["Start here for a quick health check", "Recent syncs show latest TEACH uploads from Saakshi"],
  },
  {
    id: "system",
    name: "System",
    desc: "Problem statement, Saakshi → Padhavi → Kaalam pipeline, and the three knowledge types (A identification, B use, C prediction).",
    tips: ["Type C predictions are testable against climate data", "Pipeline shows phone → hub → command flow"],
  },
  {
    id: "dataset",
    name: "Dataset",
    desc: "Structured TEK table with tribe, geohash, species. Tribe distribution chart and CSV export.",
    tips: ["Use Export CSV for spreadsheets", "Filter by tribe to see community coverage"],
  },
  {
    id: "corpus",
    name: "Corpus",
    desc: "Knowledge store from the Saakshi app. Search, manage validation status, consent, notes, or delete entries.",
    tips: ["Click Manage on any row to edit validation", "Search by elder, tribe, or village"],
  },
  {
    id: "sentinels",
    name: "Sentinels",
    desc: "Kaavu sentinel boxes — status, battery, incharge officer, maintenance, register new boxes.",
    tips: ["Register box for new field deployments", "Check incharge contact before a site visit"],
  },
  {
    id: "feeds",
    name: "Live feeds",
    desc: "Open-Meteo weather and GBIF species observations per sentinel location.",
    tips: ["Compare elder Type C signals with live weather", "GBIF shows species near each box"],
  },
  {
    id: "map",
    name: "Map",
    desc: "Operations map with corpus pins and sentinel positions. Toggle 2D Leaflet or 3D terrain view.",
    tips: ["3D pillars are coloured by tribe", "Consent colours: green OPEN, gold COMMUNITY, red EMBARGOED"],
  },
  {
    id: "activity",
    name: "Activity",
    desc: "System log of syncs, refreshes, and management actions on the command board.",
    tips: ["Useful for auditing who changed what"],
  },
];

function buildSnapshot(store, clientContext = {}) {
  const corpus = store.corpus || [];
  const sentinels = store.sentinels || [];
  const typeCounts = { A: 0, B: 0, C: 0 };
  const tribes = {};
  corpus.forEach((e) => {
    const t = String(e.knowledge_type || "C").toUpperCase();
    if (t === "A" || t.includes("TYPE_A")) typeCounts.A++;
    else if (t === "B" || t.includes("TYPE_B")) typeCounts.B++;
    else typeCounts.C++;
    const tribe = (e.tribe || "Unspecified").trim();
    tribes[tribe] = (tribes[tribe] || 0) + 1;
  });
  const pending = corpus.filter((e) => !e.validation_status || e.validation_status === "PENDING").length;
  const online = sentinels.filter((s) => s.status === "online").length;

  return {
    corpus_count: corpus.length,
    sentinels_total: sentinels.length,
    sentinels_online: online,
    type_a: typeCounts.A,
    type_b: typeCounts.B,
    type_c: typeCounts.C,
    pending_validation: pending,
    tribes: Object.entries(tribes).map(([name, count]) => ({ name, count })),
    hub_updated: store.updated_at,
    current_view: clientContext.current_view || "overview",
  };
}

function matchSection(query) {
  const q = query.toLowerCase();
  const rules = [
    { view: "overview", words: ["overview", "dashboard", "home", "stats", "summary", "start"] },
    { view: "system", words: ["system", "pipeline", "type a", "type b", "type c", "knowledge type", "padhavi", "kaalam", "saakshi flow"] },
    { view: "dataset", words: ["dataset", "export", "csv", "tribe", "table", "structured", "spreadsheet"] },
    { view: "corpus", words: ["corpus", "entries", "elder", "recordings", "teach", "manage entry", "validation", "consent"] },
    { view: "sentinels", words: ["sentinel", "kaavu", "box", "battery", "incharge", "maintenance", "telemetry"] },
    { view: "feeds", words: ["feed", "weather", "gbif", "open-meteo", "meteo", "species data", "live data"] },
    { view: "map", words: ["map", "3d", "terrain", "location", "pin", "geohash", "where"] },
    { view: "activity", words: ["activity", "log", "history", "audit", "events"] },
  ];
  for (const r of rules) {
    if (r.words.some((w) => q.includes(w))) return r.view;
  }
  return null;
}

function composeAnswer(query, snapshot, targetView) {
  const q = query.toLowerCase();
  const section = SECTIONS.find((s) => s.id === targetView);
  const lines = [];

  if (q.match(/how many|count|number of/)) {
    if (q.includes("sentinel") || q.includes("box")) {
      lines.push(`There are **${snapshot.sentinels_online}** sentinels online out of **${snapshot.sentinels_total}** deployed.`);
    } else if (q.includes("type c") || q.includes("prediction")) {
      lines.push(`The corpus has **${snapshot.type_c}** Type C (prediction) entries.`);
    } else if (q.includes("pending") || q.includes("validation")) {
      lines.push(`**${snapshot.pending_validation}** entries are still pending validation.`);
    } else if (q.includes("tribe")) {
      const top = snapshot.tribes.slice(0, 3).map((t) => `${t.name} (${t.count})`).join(", ");
      lines.push(`Tribe breakdown includes: ${top || "no tribes yet"}.`);
    } else {
      lines.push(
        `Right now the command board shows **${snapshot.corpus_count}** corpus entries, ` +
          `**${snapshot.sentinels_online}/${snapshot.sentinels_total}** sentinels online, ` +
          `and **${snapshot.pending_validation}** pending validation.`
      );
    }
  }

  if (q.match(/what is|explain|tell me about/) && q.includes("type")) {
    lines.push(
      "**Type A** — species identification (names, dialect terms).\n" +
        "**Type B** — use knowledge (medicine, food, ritual, storage).\n" +
        "**Type C** — predictions (natural signal → outcome, testable vs climate/sentinels)."
    );
  }

  if (q.match(/how do i|how to|where do i|where can i|help me/)) {
    if (q.includes("export") || q.includes("csv")) {
      lines.push("Go to **Dataset** and click **↓ Export CSV** in the tribe distribution panel.");
    } else if (q.includes("register") && q.includes("sentinel")) {
      lines.push("Open **Sentinels** and click **+ Register box** to add a new Kaavu unit.");
    } else if (q.includes("manage") || q.includes("edit") || q.includes("delete")) {
      lines.push("Open **Corpus**, find the row, and click **Manage** to edit validation, consent, or delete.");
    } else if (q.includes("3d") || q.includes("terrain")) {
      lines.push("Open **Map** and toggle **3D terrain** in the toolbar (drag to rotate, scroll to zoom).");
    } else if (q.includes("refresh") || q.includes("sync")) {
      lines.push("Click **↻ Refresh** in the top bar to pull the latest hub data.");
    }
  }

  if (section && !lines.length) {
    lines.push(`**${section.name}** — ${section.desc}`);
    if (section.tips.length) lines.push(`Tip: ${section.tips[0]}`);
  }

  if (!lines.length) {
    lines.push(
      "I'm your Command Board assistant. I can explain any tab, read live stats, or take you there.\n\n" +
        "Try: *\"How many Type C predictions?\"*, *\"Open sentinels\"*, or *\"How do I export CSV?\"*"
    );
  }

  if (targetView && section) {
    lines.push(`\n→ I can open **${section.name}** for you.`);
  }

  return lines.join("\n\n");
}

async function llmAnswer(query, snapshot, targetView) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const sectionList = SECTIONS.map((s) => `- ${s.id}: ${s.name} — ${s.desc}`).join("\n");
  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are the Arivu Command Board assistant. Help operators navigate the dashboard. " +
          "Sections:\n" + sectionList +
          "\n\nLive snapshot: " + JSON.stringify(snapshot) +
          "\nIf user wants to go somewhere, mention the section id in [navigate:section_id] at the end. " +
          "Keep answers under 100 words, practical and friendly.",
      },
      { role: "user", content: query },
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content?.trim() || null;
    if (!text) return null;
    const navMatch = text.match(/\[navigate:(\w+)\]/);
    if (navMatch) {
      text = text.replace(/\[navigate:\w+\]/, "").trim();
      return { text, navigate: navMatch[1] };
    }
    return { text, navigate: targetView };
  } catch {
    return null;
  }
}

export async function assistCommandBoard(store, message, clientContext = {}) {
  const query = (message || "").trim();
  if (!query) {
    return {
      answer: "Ask me anything about the Command Board — stats, tabs, or how to do something.",
      action: null,
      suggestions: [
        "How many corpus entries?",
        "Open sentinels",
        "What is Type C?",
        "How do I export CSV?",
      ],
    };
  }

  const snapshot = buildSnapshot(store, clientContext);
  let targetView = matchSection(query);

  if (query.match(/open|go to|show me|take me|navigate/)) {
    const explicit = matchSection(query.replace(/open|go to|show me|take me|navigate/gi, ""));
    if (explicit) targetView = explicit;
  }

  const llm = await llmAnswer(query, snapshot, targetView);
  let answer;
  let navigate = targetView;

  if (llm) {
    answer = llm.text;
    if (llm.navigate) navigate = llm.navigate;
  } else {
    answer = composeAnswer(query, snapshot, targetView);
  }

  const wantsNav =
    query.match(/open|go to|show|take me|navigate|where/) && navigate;

  return {
    answer,
    snapshot,
    method: llm ? "llm" : "rules",
    action: wantsNav && navigate ? { type: "navigate", view: navigate } : null,
    suggestions: [
      "Show overview stats",
      "Open map in 3D",
      "How many pending validation?",
      "Explain the pipeline",
    ],
  };
}

export { SECTIONS };
