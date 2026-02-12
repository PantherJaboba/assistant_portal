// ============================================================
// [SECTION 00] Assistant Portal - Minimal Home UX (Option 3)
// ============================================================
//
// Two terminals:
//  1) Live Feed   (all logs, auto-updating)
//  2) Error Vault (auto-captures ERROR logs)
//
// Polls GET /api/logs
// No WebSockets required.
// ============================================================



// ============================================================
// [SECTION 01] DOM REFERENCES (Stable IDs)
// ============================================================
//
// If a button/element "does nothing", 90% of the time:
//  - the ID doesn't match index.html
//  - or the data-action isn't routed in the Button Router
//
// Make sure these IDs exist in index.html:
//   out, liveTerm, errorTerm, liveTail, liveIntervalMs, errorMax
// ============================================================

const outEl = document.getElementById("out");

const liveTermEl = document.getElementById("liveTerm");
const errorTermEl = document.getElementById("errorTerm");

const liveTailEl = document.getElementById("liveTail");
const liveIntervalEl = document.getElementById("liveIntervalMs");
const errorMaxEl = document.getElementById("errorMax");



// ============================================================
// [SECTION 02] STATE
// ============================================================
//
// liveTimer  : setInterval handle for polling
// seenKeys   : prevents duplicating the same log line forever
// liveItems  : structured log objects (for rendering/copying)
// errorItems : structured log objects (for vault/copying)
// ============================================================

let liveTimer = null;

let seenKeys = new Set();
let liveItems = [];
let errorItems = [];



// ============================================================
// [SECTION 03] OUTPUT CONSOLE HELPERS
// ============================================================
//
// out() prints JSON or text into the Output Console (#out).
// Use it for:
//  - API results
//  - status messages
//  - copy success/failure
// ============================================================

function out(obj) {
  if (!outEl) return;
  outEl.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

// ============================================================
// [SECTION 16] CLIENT-SIDE LOGGING (UI + JS Errors)
// ============================================================
//
// GOAL:
//   Capture "frontend events" so when buttons fail / UI errors happen,
//   you can see them in the LIVE FEED terminal (and later forward to backend).
//
// WHAT THIS CAPTURES (into Live Feed):
//   - Every button click (data-action)
//   - Any JS runtime error (window.onerror)
//   - Any promise rejection (unhandledrejection)
//
// IMPORTANT:
//   These are CLIENT logs. They will NOT appear in server /api/logs unless
//   you add a backend route (POST /api/client-logs) and enable sending.
// ============================================================

const SEND_CLIENT_LOGS_TO_SERVER = false; // set true after backend route exists

async function clientLog(level, event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level: String(level || "INFO").toUpperCase(),
    category: "client",
    event,
    ...data,
  };

  // ------------------------------------------------------------
  // [SECTION 16A] SHOW CLIENT LOGS IN LIVE FEED (LOCAL)
  // ------------------------------------------------------------
  // We "ingest" into the same pipeline as server logs so it appears
  // in the Live Feed terminal immediately.
  ingest(payload);
  renderLive();
  renderErrors();

  // ------------------------------------------------------------
  // [SECTION 16B] OPTIONAL: SEND TO SERVER (FUTURE)
  // ------------------------------------------------------------
  if (SEND_CLIENT_LOGS_TO_SERVER) {
    try {
      await fetch("/api/client-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      // Never break UI because logging failed
    }
  }
}

// JS runtime errors
window.addEventListener("error", (e) => {
  clientLog("ERROR", "js.error", {
    message: e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    stack: e.error?.stack || "",
  });
});

// Promise rejection errors
window.addEventListener("unhandledrejection", (e) => {
  clientLog("ERROR", "js.unhandledrejection", {
    message: String(e.reason?.message || e.reason || "unknown"),
    stack: e.reason?.stack || "",
  });
});

// ============================================================
// [SECTION 16C] ACTION-AWARE CLIENT LOGGING (click -> ok/fail)
// ============================================================
//
// This wraps action handlers so we can log:
//   - ui.click (who/what)
//   - ui.ok / ui.fail (did it succeed?)
//   - duration_ms (how long it took)
// ============================================================

function safeString(x) {
  try { return String(x); } catch (_) { return "[unstringifiable]"; }
}

async function runAction(action, fn, meta = {}) {
  const t0 = performance.now();

  // log click intent
  await clientLog("INFO", "ui.click", { action, ...meta });

  try {
    const result = await fn();

    const dt = performance.now() - t0;
    await clientLog("INFO", "ui.ok", {
      action,
      duration_ms: Number(dt.toFixed(2)),
      ...meta
    });

    return result;
  } catch (err) {
    const dt = performance.now() - t0;
    await clientLog("ERROR", "ui.fail", {
      action,
      duration_ms: Number(dt.toFixed(2)),
      message: safeString(err?.message || err),
      stack: err?.stack || "",
      ...meta
    });
    throw err;
  }
}

// ============================================================
// [SECTION 04] CLIPBOARD HELPERS
// ============================================================
//
// copyText() tries the modern clipboard API, then falls back to textarea.
// ============================================================

async function copyText(text) {
  const value = text || "";

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {}

  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}



// ============================================================
// [SECTION 05] CORE API CALLS (Quick Actions)
// ============================================================
//
// These power your "Quick Actions" buttons on Home.
// ============================================================

async function callHealth() {
  const r = await fetch("/health");
  return { status: r.status, body: await r.json(), requestId: r.headers.get("x-request-id") };
}

async function listTasks() {
  const r = await fetch("/api/tasks");
  return { status: r.status, body: await r.json(), requestId: r.headers.get("x-request-id") };
}



function renderPrettyLine(x) {
  const ts = x.ts || "";
  const lvl = (x.level || "").toUpperCase();
  const cat = x.category || "";
  const evt = x.event || x.msg || "";

  const rid = x.request_id ? ` rid=${x.request_id}` : "";
  const path = x.path ? ` path=${x.path}` : "";
  const status = x.status_code ? ` status=${x.status_code}` : "";
  const ms =
    typeof x.duration_ms !== "undefined"
      ? ` ms=${x.duration_ms}`
      : (typeof x.ms !== "undefined" ? ` ms=${x.ms}` : "");

  const exc = x.exc ? `\n${x.exc}` : "";

  // ---- Client log extras (so you see WHICH button / outcome) ----
  // These keys are produced by runAction()/clientLog()
  const action = x.action ? ` action=${x.action}` : "";
  const reason = x.reason ? ` reason=${x.reason}` : "";
  const message = x.message ? ` msg=${x.message}` : "";

  return `${ts} | ${lvl} | ${cat} | ${evt}${action}${reason}${message}${rid}${path}${status}${ms}${exc}`;
}

// ============================================================
// [SECTION 06] LOG FORMATTING + DEDUPE KEYS
// ============================================================
//
// renderPrettyLine(item):
//   makes one readable "terminal line" with ts | level | category | event ...
//
// logKey(item):
//   builds a stable signature so we don't re-ingest the same log over and over.
// ============================================================

function renderPrettyLine(x) {
  const ts = x.ts || "";
  const lvl = (x.level || "").toUpperCase();
  const cat = x.category || "";
  const evt = x.event || x.msg || "";

  const rid = x.request_id ? ` rid=${x.request_id}` : "";
  const path = x.path ? ` path=${x.path}` : "";
  const status = x.status_code ? ` status=${x.status_code}` : "";

  // support BOTH backend logs (duration_ms) and client logs (ms)
  const ms =
    typeof x.duration_ms !== "undefined"
      ? ` ms=${x.duration_ms}`
      : (typeof x.ms !== "undefined" ? ` ms=${x.ms}` : "");

  const exc = x.exc ? `\n${x.exc}` : "";

  // ---- Client log extras (so you see WHICH button / outcome) ----
  const action = x.action ? ` action=${x.action}` : "";
  const reason = x.reason ? ` reason=${x.reason}` : "";
  const message = x.message ? ` msg=${x.message}` : "";

  return `${ts} | ${lvl} | ${cat} | ${evt}${action}${reason}${message}${rid}${path}${status}${ms}${exc}`;
}

function logKey(x) {
  return [
    x.ts || "",
    (x.level || "").toUpperCase(),
    x.category || "",
    x.event || x.msg || "",
    x.action || "",
    x.reason || "",
    x.message || "",
    x.request_id || "",
    x.path || "",
    x.status_code || "",
    x.duration_ms ?? "",
    x.ms ?? "",
    x.exc || "",
    x.stack || ""
  ].join("|");
}

// ============================================================
// [SECTION 07] TERMINAL RENDERING (Color-coded lines)
// ============================================================
//
// IMPORTANT:
// Your CSS coloring expects this DOM structure:
//
//   <pre id="liveTerm" class="term">
//     <div class="line lvl-INFO cat-http">....</div>
//     <div class="line lvl-ERROR cat-tasks">....</div>
//   </pre>
//
// So we DO NOT use textContent for terminals anymore.
// We build per-line <div> nodes with classes.
// ============================================================

function sanitizeCategory(cat) {
  // "http" -> "cat-http"
  // "task.create" -> "cat-task-create" (safe)
  return String(cat || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function levelClass(level) {
  const lvl = String(level || "").toUpperCase();
  if (lvl === "ERROR") return "lvl-ERROR";
  if (lvl === "WARN" || lvl === "WARNING") return "lvl-WARN";
  if (lvl === "DEBUG") return "lvl-DEBUG";
  return "lvl-INFO";
}

function appendTermLine(termEl, item) {
  if (!termEl) return;

  const lvl = levelClass(item.level);
  const cat = sanitizeCategory(item.category);

  const lineEl = document.createElement("div");
  lineEl.className = `line ${lvl} ${cat ? `cat-${cat}` : ""}`;

  // Put the full pretty line inside this one block
  lineEl.textContent = renderPrettyLine(item);

  termEl.appendChild(lineEl);
}

function clearTerminal(termEl, placeholder) {
  if (!termEl) return;
  termEl.innerHTML = "";
  if (placeholder) {
    const ph = document.createElement("div");
    ph.className = "line lvl-INFO";
    ph.textContent = placeholder;
    termEl.appendChild(ph);
  }
}



// ============================================================
// [SECTION 08] SMART AUTO-SCROLL (Terminal Feel)
// ============================================================
//
// If you are near the bottom -> keep you pinned.
// If you scroll up to read -> we stop forcing you to bottom.
// ============================================================

function isNearBottom(el, thresholdPx = 30) {
  const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
  return distanceFromBottom <= thresholdPx;
}

function stickToBottom(el) {
  el.scrollTop = el.scrollHeight;
}



// ============================================================
// [SECTION 09] LOG POLLING API
// ============================================================
//
// fetchLogs(tail):
//   calls GET /api/logs?tail=...
//
// If /api/logs returns errors, we print them to Output Console.
// ============================================================

async function fetchLogs(tail) {
  const r = await fetch(`/api/logs?tail=${tail}`);
  const body = await r.json();

  if (!r.ok) {
    out({ status: r.status, body });
    return [];
  }

  return body.items || [];
}



// ============================================================
// [SECTION 10] LIVE FEED SETTINGS
// ============================================================
//
// tail: number of lines we request from server per poll
// interval: how often we poll (ms)
// ============================================================

function getSettings() {
  const tail = Math.max(10, parseInt(liveTailEl?.value || "200", 10));
  const interval = Math.max(300, parseInt(liveIntervalEl?.value || "1200", 10));
  const maxErrors = Math.max(5, parseInt(errorMaxEl?.value || "50", 10));
  return { tail, interval, maxErrors };
}



// ============================================================
// [SECTION 11] INGEST PIPELINE
// ============================================================
//
// ingest(item):
//  - dedupe
//  - store structured objects
//  - if ERROR, also store in errorItems
//
// We keep objects (not just strings) so later we can:
//  - re-render differently
//  - add filters
//  - export JSON
// ============================================================

function ingest(item) {
  const key = logKey(item);
  if (seenKeys.has(key)) return;
  seenKeys.add(key);

  liveItems.push(item);
  if (liveItems.length > 2000) liveItems = liveItems.slice(-2000);

  if (String(item.level || "").toUpperCase() === "ERROR") {
    errorItems.push(item);
    const { maxErrors } = getSettings();
    if (errorItems.length > maxErrors) errorItems = errorItems.slice(-maxErrors);
  }
}



// ============================================================
// [SECTION 12] RENDER PIPELINE (Live + Errors)
// ============================================================
//
// renderLive():
//  - appends only NEW items is faster, but simplest is full re-render.
//  - for now: full re-render (safe, stable, easy)
//
// renderErrors():
//  - full re-render the vault
// ============================================================

function renderLive() {
  if (!liveTermEl) return;

  const shouldAutoScroll = isNearBottom(liveTermEl);

  // Full re-render
  liveTermEl.innerHTML = "";
  if (liveItems.length === 0) {
    appendTermLine(liveTermEl, { level: "INFO", category: "system", msg: "(no logs yet)" });
  } else {
    for (const item of liveItems) appendTermLine(liveTermEl, item);
  }

  if (shouldAutoScroll) stickToBottom(liveTermEl);
}

function renderErrors() {
  if (!errorTermEl) return;

  errorTermEl.innerHTML = "";
  if (errorItems.length === 0) {
    appendTermLine(errorTermEl, { level: "INFO", category: "system", msg: "(no errors captured)" });
  } else {
    for (const item of errorItems) appendTermLine(errorTermEl, item);
  }

  // Error vault always stays pinned to bottom
  stickToBottom(errorTermEl);
}



// ============================================================
// [SECTION 13] LIVE LOOP (pollOnce / start / stop)
// ============================================================

async function pollOnce() {
  const { tail } = getSettings();
  const items = await fetchLogs(tail);

  for (const item of items) ingest(item);

  renderLive();
  renderErrors();
}

function startLive() {
  if (liveTimer) {
    out("Live already running.");
    return;
  }

  const { interval } = getSettings();
  out(`Live started (${interval}ms polling)`);

  pollOnce();
  liveTimer = setInterval(pollOnce, interval);
}

function stopLive() {
  if (!liveTimer) {
    out("Live not running.");
    return;
  }

  clearInterval(liveTimer);
  liveTimer = null;
  out("Live stopped.");
}



// ============================================================
// [SECTION 14] CLEAR + COPY ACTIONS
// ============================================================

function clearLive() {
  liveItems = [];
  seenKeys = new Set();
  clearTerminal(liveTermEl, "(live feed cleared)");
}

function clearErrors() {
  errorItems = [];
  clearTerminal(errorTermEl, "(error vault cleared)");
}

async function copyLive() {
  const text = liveItems.map(renderPrettyLine).join("\n");
  const ok = await copyText(text);
  out(ok ? "Live feed copied." : "Copy failed.");
}

async function copyErrors() {
  const text = errorItems.map(renderPrettyLine).join("\n\n");
  const ok = await copyText(text);
  out(ok ? "Error vault copied." : "Copy failed.");
}

async function copyOutput() {
  const ok = await copyText(outEl?.textContent || "");
  out(ok ? "Output copied." : "Copy failed.");
}

function clearOutput() {
  out("(nothing yet)");
}



// ============================================================
// [SECTION 15] BUTTON ROUTER (ALL data-action buttons)
// ============================================================
//
// Upgraded:
//   - logs ui.click/ui.ok/ui.fail per action
//   - logs whether action actually did something (ex: startLive already running)
// ============================================================

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");

  try {
    // ---------------------------
    // QUICK ACTIONS
    // ---------------------------
    if (action === "health") {
      await runAction(action, async () => out(await callHealth()));
    }

    if (action === "listTasks") {
      await runAction(action, async () => out(await listTasks()));
    }

    if (action === "docs") {
      await runAction(action, async () => {
        window.location.href = "/docs";
      });
    }

    // ---------------------------
    // OUTPUT CONSOLE
    // ---------------------------
    if (action === "copyOutput") {
      await runAction(action, async () => copyOutput());
    }

    if (action === "clearOutput") {
      await runAction(action, async () => clearOutput());
    }

    // ---------------------------
    // LIVE TERMINALS
    // ---------------------------
    if (action === "startLive") {
      await runAction(action, async () => {
        if (liveTimer) {
          // Specific outcome: it did NOT start because already running
          await clientLog("WARN", "ui.noop", { action, reason: "already_running" });
          out("Live already running.");
          return;
        }

        const { interval, tail } = getSettings();
        startLive();

        // Specific outcome: started + settings
        await clientLog("INFO", "live.started", { interval, tail });
      });
    }

    if (action === "stopLive") {
      await runAction(action, async () => {
        if (!liveTimer) {
          await clientLog("WARN", "ui.noop", { action, reason: "not_running" });
          out("Live not running.");
          return;
        }

        stopLive();
        await clientLog("INFO", "live.stopped", {});
      });
    }

    if (action === "clearLive") {
      await runAction(action, async () => {
        clearLive();
        await clientLog("INFO", "live.cleared", {});
      });
    }

    if (action === "copyLive") {
      await runAction(action, async () => copyLive());
    }

    if (action === "clearErrors") {
      await runAction(action, async () => {
        clearErrors();
        await clientLog("INFO", "errors.cleared", {});
      });
    }

    if (action === "copyErrors") {
      await runAction(action, async () => copyErrors());
    }

  } catch (err) {
    // runAction already logged ui.fail, still show it in output too
    out(String(err));
  }
});

window.addEventListener("beforeunload", () => {
  if (liveTimer) clearInterval(liveTimer);
});