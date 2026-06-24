# Arivu — live demo site

A **fully static** website (no backend, no build step) that demonstrates the
Arivu pipeline live in the browser:

- **Saakshi** — TEACH (mic/type) + ASK (retrieves a real elder recording, never invents)
- **Padhavi** — structures each transcript into Type A / B / C with a consent label + provenance hash
- **Kaalam** — runs a real Welch's t-test on a Type C prediction and renders the chart
- **Dashboard** — Leaflet map of captured entries, colour-coded by consent

All logic runs client-side, so you can host it anywhere that serves static files.

---

## Run it locally

You can simply **double-click `index.html`** — it works from the file system.

For best results (and so the mic permission prompt behaves), serve it over HTTP:

```bash
# from inside the site/ folder, pick any one:
python3 -m http.server 8080
#   then open http://localhost:8080

npx serve .
#   then open the URL it prints
```

> Voice input (TEACH/ASK by speaking) uses the Web Speech API — works in
> **Chrome** and **Edge**. In other browsers, typing and the example-prompt
> buttons work exactly the same; only the live-mic part is unavailable.

---

## Host it (free options)

### GitHub Pages
1. Create a repo and push the **contents of this `site/` folder** to it.
2. Repo → **Settings → Pages** → Source: `Deploy from a branch` → branch `main`, folder `/root`.
3. Your site appears at `https://<user>.github.io/<repo>/` in ~1 minute.

### Netlify (drag-and-drop)
1. Go to https://app.netlify.com/drop
2. Drag the **`site/` folder** onto the page.
3. Done — you get a live URL instantly.

### Vercel
1. `npm i -g vercel` then run `vercel` inside `site/`, or
2. Import the repo at https://vercel.com/new and set the root to `site/`.
   No framework, no build command needed.

> **HTTPS matters:** the microphone only works on `https://` or `localhost`.
> All three hosts above serve HTTPS automatically.

---

## Files

```
site/
  index.html          # the page
  css/style.css       # deck-matched styling
  js/
    padhavi.js         # transcript -> typed knowledge entry
    kaalam.js          # Welch's t-test validation
    data.js            # seed corpus + example prompts
    app.js             # UI wiring (mic, render, chart, map)
  README.md
```

## Editing the demo

- **Add example prompts:** edit `js/data.js` → `EXAMPLES`.
- **Add folk-name → species mappings:** edit `js/padhavi.js` → `SPECIES_LEXICON`.
- **Swap the climate data:** edit the arrays at the top of `js/kaalam.js`
  (`CUCKOO_DOY`, `MONSOON_DOY`). The statistics recompute automatically.

> Note: the climate dataset is **illustrative** and labelled as such in the UI.
> The statistics are computed live. For the real version, replace those arrays
> with eBird first-call dates + IMD monsoon-onset dates for the target pixel.
