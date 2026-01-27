/* =============================
   Track & XC Records App
   CLEAN VERSION + ACCESS GATE
   Fix: Relay rows expand on mobile (tap row)
============================= */

const CONFIG = window.CONFIG;

const elGate = document.getElementById("accessGate");
const elApp = document.getElementById("app");
const elAccessInput = document.getElementById("accessInput");
const elAccessBtn = document.getElementById("accessBtn");
const elAccessError = document.getElementById("accessError");

const elContent = document.getElementById("content");
const elLastUpdated = document.getElementById("lastUpdated");
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

// ---- Storage keys
const ACCESS_OK_KEY = "access_ok";
const ACCESS_VER_KEY = "access_ver";

/* -----------------------------
   Access Gate (unlimited tries)
------------------------------ */
function isAccessGranted() {
  const ok = localStorage.getItem(ACCESS_OK_KEY) === "true";
  const ver = Number(localStorage.getItem(ACCESS_VER_KEY) || "0");
  return ok && ver === Number(CONFIG.ACCESS_VERSION || 1);
}

function grantAccess() {
  localStorage.setItem(ACCESS_OK_KEY, "true");
  localStorage.setItem(ACCESS_VER_KEY, String(CONFIG.ACCESS_VERSION || 1));
}

function lockAccess() {
  localStorage.removeItem(ACCESS_OK_KEY);
  localStorage.removeItem(ACCESS_VER_KEY);
}

function showGate(msg = "") {
  elGate?.classList.remove("hidden");
  elApp?.classList.add("hidden");
  if (elAccessError) elAccessError.textContent = msg || "";
  if (elAccessInput) elAccessInput.value = "";
}

function showApp() {
  elGate?.classList.add("hidden");
  elApp?.classList.remove("hidden");
}

function wireGate() {
  if (!elAccessBtn || !elAccessInput) return;

  const tryUnlock = () => {
    const entered = String(elAccessInput.value || "").trim();
    const expected = String(CONFIG.ACCESS_CODE || "").trim();

    if (!expected) {
      showGate("Access code is not configured.");
      return;
    }

    if (entered === expected) {
      grantAccess();
      showApp();
      bootApp();
    } else {
      if (elAccessError) elAccessError.textContent = "Incorrect code. Try again.";
      elAccessInput.focus();
      elAccessInput.select();
    }
  };

  elAccessBtn.addEventListener("click", tryUnlock);
  elAccessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });
}

/* -----------------------------
   Event type rules (sorting)
------------------------------ */
const FIELD_KEYWORDS = [
  "shot put", "shot",
  "discus", "discus throw",
  "long jump",
  "triple jump",
  "high jump",
  "pole vault"
];

const FIELD_ABBREVIATIONS = new Set(["sp", "dt", "lj", "tj", "hj", "pv"]);

function normalizeEventName(eventName) {
  return String(eventName || "")
    .toLowerCase()
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("/", " ")
    .replaceAll(".", " ")
    .replaceAll(",", " ")
    .replaceAll("(", " ")
    .replaceAll(")", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isFieldEvent(eventName) {
  const s = normalizeEventName(eventName);
  if (!s) return false;
  const tokens = s.split(" ").filter(Boolean);
  for (const t of tokens) {
    if (FIELD_ABBREVIATIONS.has(t)) return true;
  }
  return FIELD_KEYWORDS.some(k => s === k || s.includes(k));
}

function isRelayEvent(eventName) {
  const s = normalizeEventName(eventName);
  return s.includes("4x") || s.includes("relay");
}

/* -----------------------------
   Column mapping
------------------------------ */
function colsFor(view) {
  if (view === "competition") {
    return {
      event: "Event",
      gender: "gender",
      year: "year",
      a1: "athlete_1", a2: "athlete_2", a3: "athlete_3", a4: "athlete_4",
      g1: "grade_1", g2: "grade_2", g3: "grade_3", g4: "grade_4",
      markDisplay: "mark_display",
      markValue: "mark_value",
      meet: "meet",
      date: "date",
      notes: "notes"
    };
  }
  if (view === "training") {
    return {
      event: "metric",
      gender: "gender",
      year: "year",
      name: "athlete",
      grade: "grade",
      markDisplay: "mark_display",
      markValue: "mark_value",
      date: "date",
      notes: "notes"
    };
  }
  if (view === "xc") {
    return {
      event: "distance",
      gender: "gender",
      year: "year",
      name: "athlete",
      grade: "grade",
      markDisplay: "mark_display",
      markValue: "mark_value",
      meet: "meet",
      course: "course",
      date: "date",
      notes: "notes"
    };
  }
  return {};
}

/* -----------------------------
   Helpers
------------------------------ */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeGender(g) {
  const s = String(g || "").toLowerCase().trim();
  if (["boys","boy","m"].includes(s)) return "Boys";
  if (["girls","girl","f"].includes(s)) return "Girls";
  return "";
}

function parseMarkValue(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  if (!isNaN(Number(s))) return Number(s);

  const p = s.split(":").map(x => Number(String(x).trim()));
  if (p.length === 2 && p.every(n => Number.isFinite(n))) return p[0] * 60 + p[1];
  if (p.length === 3 && p.every(n => Number.isFinite(n))) return p[0] * 3600 + p[1] * 60 + p[2];
  return null;
}

async function fetchCSV(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("CSV fetch failed");
  return await r.text();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { row.push(cur); cur = ""; continue; }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map(h => (h || "").trim());
  return rows.slice(1)
    .filter(r => r.some(c => (c || "").trim() !== ""))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = (r[i] ?? "").trim());
      return o;
    });
}

function uniqueSorted(list) {
  return Array.from(new Set(list.filter(Boolean).map(x => String(x).trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

function medalForRank(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

/* -----------------------------
   Modal (relay expand on mobile)
------------------------------ */
function ensureModal() {
  let m = document.getElementById("rowModal");
  if (m) return m;

  m = document.createElement("div");
  m.id = "rowModal";
  m.className = "modal hidden";
  m.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop"></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div id="modalTitle" class="modal-title"></div>
        <button id="modalClose" class="modal-close">Close</button>
      </div>
      <div id="modalBody"></div>
    </div>
  `;
  document.body.appendChild(m);

  const close = () => m.classList.add("hidden");
  m.querySelector("#modalClose").addEventListener("click", close);
  m.querySelector("#modalBackdrop").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !m.classList.contains("hidden")) close();
  });

  return m;
}

function openModal(title, bodyHtml) {
  const m = ensureModal();
  m.querySelector("#modalTitle").textContent = title;
  m.querySelector("#modalBody").innerHTML = bodyHtml;
  m.classList.remove("hidden");
}

/* -----------------------------
   App state + data
------------------------------ */
const state = {
  view: "competition",
  gender: "Girls",
  event: "",
  topN: 25,
  search: "",
  yearMode: "all",
  yearPick: "ALL",
  data: { competition: [], training: [], xc: [] }
};

async function ensureLoaded(view) {
  if (state.data[view].length) return;
  const txt = await fetchCSV(CONFIG.CSV_URLS[view]);
  state.data[view] = rowsToObjects(parseCSV(txt));
}

/* -----------------------------
   UI Shell + Render
------------------------------ */
function renderShell() {
  const mobile = isMobile();
  elContent.innerHTML = `
    <nav>
      <button data-view="competition">Competition</button>
      <button data-view="training">Training</button>
      <button data-view="xc">Cross Country</button>
    </nav>

    <div class="card">
      <div class="filters">
        <div>
          <div class="label" id="eventLabel">Event</div>
          <select id="eventSelect"></select>
        </div>

        <div>
          <div class="label">Gender</div>
          <div class="genderBtns">
            <button id="boysBtn">Boys</button>
            <button id="girlsBtn">Girls</button>
          </div>
        </div>

        <div>
          <div class="label">Top</div>
          <select id="topSelect">
            <option>10</option>
            <option selected>25</option>
            <option>50</option>
            <option>100</option>
          </select>
        </div>

        <div class="searchWrap">
          <div class="label">Search</div>
          <input id="searchInput" placeholder="Type a name…" />
        </div>
      </div>

      ${mobile && state.view === "competition"
        ? `<div class="tip">Tip: tap a relay row to see all 4 runners.</div>`
        : ``}
    </div>

    <div class="card" id="resultsCard"></div>
  `;
}

function render() {
  const rows = state.data[state.view];
  const cols = colsFor(state.view);

  renderShell();

  document.querySelectorAll("nav button[data-view]").forEach(b => {
    b.classList.toggle("active", b.dataset.view === state.view);
    b.onclick = () => {
      state.view = b.dataset.view;
      state.event = "";
      state.search = "";
      render();
    };
  });

  const eventLabel = document.getElementById("eventLabel");
  eventLabel.textContent = state.view === "training" ? "Metric" : (state.view === "xc" ? "Distance" : "Event");

  const events = uniqueSorted(rows.map(r => r[cols.event]));
  if (!state.event) state.event = events[0] || "";

  const eventSelect = document.getElementById("eventSelect");
  eventSelect.innerHTML = events.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  eventSelect.value = state.event;

  const boysBtn = document.getElementById("boysBtn");
  const girlsBtn = document.getElementById("girlsBtn");
  boysBtn.classList.toggle("active", state.gender === "Boys");
  girlsBtn.classList.toggle("active", state.gender === "Girls");

  const topSelect = document.getElementById("topSelect");
  topSelect.value = String(state.topN);

  const searchInput = document.getElementById("searchInput");
  searchInput.value = state.search;

  eventSelect.onchange = (e) => { state.event = e.target.value; renderResults(); };
  topSelect.onchange = (e) => { state.topN = Number(e.target.value); renderResults(); };
  searchInput.oninput = (e) => { state.search = e.target.value; renderResults(); };

  boysBtn.onclick = () => { state.gender = "Boys"; renderResults(); boysBtn.classList.add("active"); girlsBtn.classList.remove("active"); };
  girlsBtn.onclick = () => { state.gender = "Girls"; renderResults(); girlsBtn.classList.add("active"); boysBtn.classList.remove("active"); };

  elLastUpdated.textContent = `Loaded ${new Date().toLocaleString()}`;
  renderResults();
}

function renderResults() {
  const view = state.view;
  const rows = state.data[view];
  const cols = colsFor(view);
  const mobile = isMobile();

  const search = state.search.toLowerCase().trim();
  const fieldSort = isFieldEvent(state.event);
  const relayMode = (view === "competition" && isRelayEvent(state.event));

  const filtered = rows
    .filter(r => String(r[cols.event] || "").trim() === String(state.event || "").trim())
    .filter(r => normalizeGender(r[cols.gender]) === state.gender)
    .filter(r => {
      if (!search) return true;
      if (view === "competition") {
        return [cols.a1, cols.a2, cols.a3, cols.a4].some(k =>
          String(r[k] || "").toLowerCase().includes(search)
        );
      }
      return String(r[cols.name] || "").toLowerCase().includes(search);
    })
    .map(r => {
      const disp = String(r[cols.markDisplay] || "").trim();
      const v = parseMarkValue(r[cols.markValue]) ?? parseMarkValue(disp);
      return { r, v, disp };
    })
    .filter(x => x.v !== null)
    .sort((a, b) => fieldSort ? (b.v - a.v) : (a.v - b.v))
    .slice(0, state.topN);

  const resEl = document.getElementById("resultsCard");

  let headers = [];
  if (view === "competition") {
    headers = mobile
      ? ["#", "Year", "Athlete", "Gr", "Mark"]
      : ["#", "Year", "Athlete 1", "Gr", "Athlete 2", "Gr", "Athlete 3", "Gr", "Athlete 4", "Gr", "Mark"];
  } else {
    headers = ["#", "Year", "Name", "Grade", "Mark"];
  }

  const rowsHtml = filtered.map((x, idx) => {
    const r = x.r;
    const rank = idx + 1;
    const medal = medalForRank(rank);
    const rankCell = medal ? `${medal} ${rank}` : String(rank);

    if (view === "competition" && mobile) {
      const a1 = r[cols.a1] || "", a2 = r[cols.a2] || "", a3 = r[cols.a3] || "", a4 = r[cols.a4] || "";
      const g1 = r[cols.g1] || "", g2 = r[cols.g2] || "", g3 = r[cols.g3] || "", g4 = r[cols.g4] || "";

      const isRelayRow = relayMode && (a2 || a3 || a4); // only if it actually has other legs

      if (isRelayRow) {
        const modalBody = `
          <div class="kv"><div class="k">Event</div><div class="v">${escapeHtml(state.event)}</div></div>
          <div class="kv"><div class="k">Gender</div><div class="v">${escapeHtml(state.gender)}</div></div>
          <div class="kv"><div class="k">Year</div><div class="v">${escapeHtml(r[cols.year])}</div></div>
          <div class="kv"><div class="k">Mark</div><div class="v"><b>${escapeHtml(x.disp)}</b></div></div>
          <hr class="sep" />
          <div class="kv"><div class="k">Leg 1</div><div class="v">${escapeHtml(a1)} ${g1 ? `(${escapeHtml(g1)})` : ""}</div></div>
          <div class="kv"><div class="k">Leg 2</div><div class="v">${escapeHtml(a2)} ${g2 ? `(${escapeHtml(g2)})` : ""}</div></div>
          <div class="kv"><div class="k">Leg 3</div><div class="v">${escapeHtml(a3)} ${g3 ? `(${escapeHtml(g3)})` : ""}</div></div>
          <div class="kv"><div class="k">Leg 4</div><div class="v">${escapeHtml(a4)} ${g4 ? `(${escapeHtml(g4)})` : ""}</div></div>
        `;
        const encoded = escapeHtml(modalBody);

        return `
          <tr class="taprow" data-title="${escapeHtml(state.event)}" data-body="${encoded}">
            <td>${escapeHtml(rankCell)}</td>
            <td>${escapeHtml(r[cols.year])}</td>
            <td>${escapeHtml(a1)} <span style="opacity:.65;">(tap)</span></td>
            <td>${escapeHtml(g1)}</td>
            <td><b>${escapeHtml(x.disp)}</b></td>
          </tr>
        `;
      }

      // non-relay competition row on mobile
      return `
        <tr>
          <td>${escapeHtml(rankCell)}</td>
          <td>${escapeHtml(r[cols.year])}</td>
          <td>${escapeHtml(a1)}</td>
          <td>${escapeHtml(g1)}</td>
          <td><b>${escapeHtml(x.disp)}</b></td>
        </tr>
      `;
    }

    if (view === "competition") {
      return `
        <tr>
          <td>${escapeHtml(rankCell)}</td>
          <td>${escapeHtml(r[cols.year])}</td>
          <td>${escapeHtml(r[cols.a1])}</td><td>${escapeHtml(r[cols.g1])}</td>
          <td>${escapeHtml(r[cols.a2])}</td><td>${escapeHtml(r[cols.g2])}</td>
          <td>${escapeHtml(r[cols.a3])}</td><td>${escapeHtml(r[cols.g3])}</td>
          <td>${escapeHtml(r[cols.a4])}</td><td>${escapeHtml(r[cols.g4])}</td>
          <td><b>${escapeHtml(x.disp)}</b></td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${escapeHtml(rankCell)}</td>
        <td>${escapeHtml(r[cols.year])}</td>
        <td>${escapeHtml(r[cols.name])}</td>
        <td>${escapeHtml(r[cols.grade])}</td>
        <td><b>${escapeHtml(x.disp)}</b></td>
      </tr>
    `;
  }).join("");

  resEl.innerHTML = `
    <div class="summaryRow">
      <div><b>${escapeHtml(state.gender)} • ${escapeHtml(state.event)}</b></div>
      <div class="muted">${fieldSort ? "Field: highest wins" : "Running: fastest wins"} • Showing ${filtered.length}</div>
    </div>

    <div class="tableWrap">
      <table class="tbl">
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="${headers.length}">No matches.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  // Wire relay tap rows (mobile only)
  if (mobile && view === "competition") {
    document.querySelectorAll("tr.taprow").forEach(tr => {
      tr.addEventListener("click", () => {
        const title = tr.getAttribute("data-title") || "";
        const bodyEsc = tr.getAttribute("data-body") || "";

        // decode HTML safely
        const tmp = document.createElement("textarea");
        tmp.innerHTML = bodyEsc;
        const bodyHtml = tmp.value;

        openModal(title, bodyHtml);
      });
    });
  }
}

/* -----------------------------
   Boot + PWA
------------------------------ */
async function bootApp() {
  await Promise.all([
    ensureLoaded("competition"),
    ensureLoaded("training"),
    ensureLoaded("xc")
  ]);

  render();

  window.addEventListener("resize", () => {
    clearTimeout(window.__rr);
    window.__rr = setTimeout(render, 150);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

/* -----------------------------
   Start
------------------------------ */
wireGate();

if (isAccessGranted()) {
  showApp();
  bootApp();
} else {
  lockAccess();
  showGate("");
}
