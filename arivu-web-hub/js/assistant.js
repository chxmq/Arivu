// Floating Command Board AI assistant (website).
(function () {
  const $ = (id) => document.getElementById(id);

  const PROMPTS = [
    "How many corpus entries?",
    "Open sentinels",
    "What is Type C?",
    "How do I export CSV?",
    "Show the map",
  ];

  let open = false;
  let busy = false;
  let currentView = "overview";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmt(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function appendMsg(role, text) {
    const log = $("assistLog");
    if (!log) return;
    const div = document.createElement("div");
    div.className = "assist-msg " + role;
    div.innerHTML = fmt(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function renderChips(list) {
    const wrap = $("assistChips");
    if (!wrap) return;
    wrap.innerHTML = "";
    (list || PROMPTS).forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "assist-chip";
      btn.textContent = p;
      btn.addEventListener("click", () => send(p));
      wrap.appendChild(btn);
    });
  }

  async function send(text) {
    const input = $("assistInput");
    const msg = (text || input?.value || "").trim();
    if (!msg || busy) return;
    if (input) input.value = "";
    busy = true;
    appendMsg("user", msg);
    appendMsg("bot", "…");

    try {
      const res = await window.ArivuHub.post("/api/assistant", {
        message: msg,
        context: { current_view: currentView },
      });
      const log = $("assistLog");
      if (log?.lastChild) log.removeChild(log.lastChild);

      appendMsg("bot", res.answer || "No response.");
      if (res.action?.type === "navigate" && res.action.view && window.ArivuCommand) {
        window.ArivuCommand.setView(res.action.view);
        appendMsg("bot", "Opened **" + res.action.view + "** tab.");
      }
      if (res.suggestions?.length) renderChips(res.suggestions);
    } catch (e) {
      const log = $("assistLog");
      if (log?.lastChild) log.removeChild(log.lastChild);
      appendMsg("bot", "Hub offline — run `node server/hub.mjs` on port 8787.");
    } finally {
      busy = false;
    }
  }

  function toggle(force) {
    open = force != null ? force : !open;
    const panel = $("assistPanel");
    const fab = $("assistFab");
    if (panel) panel.classList.toggle("open", open);
    if (fab) fab.setAttribute("aria-expanded", String(open));
  }

  function init() {
    const fab = $("assistFab");
    const close = $("assistClose");
    const form = $("assistForm");
    if (!fab) return;

    renderChips(PROMPTS);
    appendMsg(
      "bot",
      "Hi — I'm your **Command Board assistant**. Ask about stats, tabs, or say *open sentinels*."
    );

    fab.addEventListener("click", () => toggle());
    close?.addEventListener("click", () => toggle(false));
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      send();
    });

    window.ArivuAssistant = {
      setCurrentView(view) {
        currentView = view || "overview";
      },
      open() {
        toggle(true);
      },
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
