/* =============================
   Track & XC Records App
   FINAL CLEAN VERSION
   Features:
   - Blank rows hidden
   - Correct sorting
   - Medals for top 3
   - Sticky header row (CSS)
   - Toggle: All-time (combined) | Single Year | All-time by Year
   - Mobile: tap row to expand relay details (competition)
============================= */

const CONFIG = window.CONFIG;

const elContent = document.getElementById("content");
const elLastUpdated = document.getElementById("lastUpdated");
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

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
  if (["boys", "boy", "m"].includes(s)) return "Boys";
  if (["girls", "girl", "f"].includes(s)) return "Girls";
  return "";
}

function parseMarkValue(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  const n = Number(s);
  if (Number.isFinite(n)) return n;

  const p = s.split(":").map(x => Number(String(x).trim()));
  if (p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) return p[0] * 60 + p[1];
  if (p.length === 3 && p.every(Number.isFinite)) return p[0] * 3600 + p[1] * 60 + p[2];
  return null;
}

function medal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

function yearKey(y) {
  const s = String(y || "").trim();
  if (!s) return "";
  return s;
}

function yearSortDesc(a, b) {
  // Try numeric compare first, fall back to string
  const na = Number(a), nb = Number(b);
  const fa = Number.isFinite(na), fb = Number.isFinite(nb);
  if (fa && fb) return nb - na;
  return String(b).localeCompare(String(a));
}

/* -----------------------------
   CSV parsing (handles quotes)
------------------------------ */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.length > 1 || (row[0] || "").trim() !== "") rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.length > 1 || (row[0] || "").trim() !== "") rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map(h => (h || "").trim());
  return rows
    .slice(1)
    .filter(r => r.some(c => (c || "").trim() !== ""))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

async function fetchCSV(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`);
  return await r.text();
}

/* -----------------------------
   Modal (relay expand)
------------------------------ */
function ensureModal() {
  let modal = document.getElementById("rowModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "rowModal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop"></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div id="modalTitle" class="modal-title"></div>
        <button id="modalClose" class="modal-close">Close</button>
      </div>
      <div id="modalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.classList.add("hidden");
  modal.querySelector("#modalClose").addEventListener("click", close);
  modal.querySelector("#modalBackdrop").addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
  });

  return modal;
}

function openModal(title, bodyHtml) {
  const modal = ensureModal();
  modal.querySelector("#modalTitle").textContent = title;
  modal.querySelector("#modalBody").innerHTML = bodyHtml;
  modal.classList.remove("hidden");
}

/* -----------------------------
   State
------------------------------ */
const state = {
  view: "competition",
  gender: "Girls",
  event: "",
  topN: 25,
  search: "",
  mode: "all",   // all | year | byyear
  year: "",      // used when mode === "year"
  data: { competition: [], training: [], xc: [] }
};

async function ensureLoaded(view) {
  if (state.data[view].length) return;
  const txt = await fetchCSV(CONFIG.CSV_URLS[view]);
  state.data[view] = rowsToObjects(parseCSV(txt));
}

function uniqueEvents(rows, cols) {
  const set = new Set();
  rows.forEach(r => {
    const e = String(r[cols.event] || "").trim();
    if (e) set.add(e);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function availableYears(rows, cols) {
  const set = new Set();
  rows.forEach(r => {
    const y = yearKey(r[cols.year]);
    if (y) set.add(y);
  });
  return Array.from(set).sort(yearSortDesc);
}

/* -----------------------------
   Render shell
------------------------------ */
function renderShell() {
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

        <div>
          <div class="label">View</div>
          <select id="modeSelect">
            <option value="all">All-time (All Years)</option>
            <option value="byyear">All-time by Year</option>
            <option value="year">Single Year</option>
          </select>
        </div>

        <div id="yearWrap" style="display:none;">
          <div class="label">Year</div>
          <select id="yearSelect"></select>
        </div>

        <div class="searchWrap">
          <div class="label">Search</div>
          <input id="searchInput" placeholder="Type a name…" />
        </div>
      </div>

      ${isMobile() ? `<div class="tip">Tip: tap a relay row to see all 4 runners.</div>` : ``}
    </div>

    <div class="card" id="resultsCard"></div>
  `;
}

/* -----------------------------
   Core filtering
------------------------------ */
function baseFilteredRows(rows, cols) {
  const search = state.search.toLowerCase().trim();

  return rows
    .filter(r => String(r[cols.event] || "").trim() === String(state.event || "").trim())
    .filter(r => normalizeGender(r[cols.gender]) === state.gender)
    .filter(r => {
      if (!search) return true;
      if (state.view === "competition") {
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
    .filter(x => x.v !== null); // HIDE BLANK MARK ROWS
}

function sortBestFirst(list) {
  return list.sort((a, b) => a.v - b.v);
}

/* -----------------------------
   Render
------------------------------ */
function render() {
  const view = state.view;
  const rows = state.data[view] || [];
  const cols = colsFor(view);

  renderShell();

  // Tabs active
  document.querySelectorAll("nav button[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      state.event = "";
      state.search = "";
      render();
    });
  });

  // Event label per view
  const eventLabel = document.getElementById("eventLabel");
  eventLabel.textContent = view === "training" ? "Metric" : (view === "xc" ? "Distance" : "Event");

  // Events
  const events = uniqueEvents(rows, cols);
  if (!state.event) state.event = events[0] || "";

  const eventSelect = document.getElementById("eventSelect");
  eventSelect.innerHTML = events.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  eventSelect.value = state.event;

  // Gender
  const boysBtn = document.getElementById("boysBtn");
  const girlsBtn = document.getElementById("girlsBtn");
  boysBtn.classList.toggle("active", state.gender === "Boys");
  girlsBtn.classList.toggle("active", state.gender === "Girls");

  // Top + search + mode
  const topSelect = document.getElementById("topSelect");
  const searchInput = document.getElementById("searchInput");
  const modeSelect = document.getElementById("modeSelect");
  const yearWrap = document.getElementById("yearWrap");
  const yearSelect = document.getElementById("yearSelect");

  topSelect.value = String(state.topN);
  searchInput.value = state.search;
  modeSelect.value = state.mode;

  // Years list based on current filters (event+gender+search+nonblank marks)
  const baseList = baseFilteredRows(rows, cols);
  const years = availableYears(baseList.map(x => x.r), cols);

  if (state.mode === "year") {
    yearWrap.style.display = "";
    if (!state.year) state.year = years[0] || "";
    yearSelect.innerHTML = years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join("");
    yearSelect.value = state.year;
  } else {
    yearWrap.style.display = "none";
  }

  // Handlers
  eventSelect.addEventListener("change", () => { state.event = eventSelect.value; state.year = ""; renderResults(); });
  topSelect.addEventListener("change", () => { state.topN = Number(topSelect.value); renderResults(); });
  searchInput.addEventListener("input", () => { state.search = searchInput.value; state.year = ""; renderResults(); });

  boysBtn.addEventListener("click", () => { state.gender = "Boys"; state.year = ""; render(); });
  girlsBtn.addEventListener("click", () => { state.gender = "Girls"; state.year = ""; render(); });

  modeSelect.addEventListener("change", () => {
    state.mode = modeSelect.value;
    state.year = "";
    render();
  });

  yearSelect?.addEventListener("change", () => {
    state.year = yearSelect.value;
    renderResults();
  });

  elLastUpdated.textContent = `Loaded: ${new Date().toLocaleString()}`;
  renderResults();
}

function renderCompetitionTable(list, cols, { showYearColumn }) {
  const mobile = isMobile();

  const headers = mobile
    ? ["", "#", ...(showYearColumn ? ["Year"] : []), "Athlete", "Gr", "Mark"]
    : ["", "#", ...(showYearColumn ? ["Year"] : []),
      "Athlete 1", "Gr", "Athlete 2", "Gr", "Athlete 3", "Gr", "Athlete 4", "Gr", "Mark"
    ];

  const body = list.map((x, idx) => {
    const r = x.r;
    const rank = idx + 1;
    const m = medal(rank);

    if (mobile) {
      const a1 = r[cols.a1] || "";
      const g1 = r[cols.g1] || "";

      const modalBody = `
        <div class="kv"><div class="k">Event</div><div class="v">${escapeHtml(state.event)}</div></div>
        <div class="kv"><div class="k">Gender</div><div class="v">${escapeHtml(state.gender)}</div></div>
        ${showYearColumn ? `<div class="kv"><div class="k">Year</div><div class="v">${escapeHtml(r[cols.year])}</div></div>` : ``}
        <div class="kv"><div class="k">Mark</div><div class="v"><b>${escapeHtml(x.disp)}</b></div></div>
        <hr class="sep" />
        <div class="kv"><div class="k">Athlete 1</div><div class="v">${escapeHtml(r[cols.a1])} ${r[cols.g1] ? `(${escapeHtml(r[cols.g1])})` : ""}</div></div>
        <div class="kv"><div class="k">Athlete 2</div><div class="v">${escapeHtml(r[cols.a2])} ${r[cols.g2] ? `(${escapeHtml(r[cols.g2])})` : ""}</div></div>
        <div class="kv"><div class="k">Athlete 3</div><div class="v">${escapeHtml(r[cols.a3])} ${r[cols.g3] ? `(${escapeHtml(r[cols.g3])})` : ""}</div></div>
        <div class="kv"><div class="k">Athlete 4</div><div class="v">${escapeHtml(r[cols.a4])} ${r[cols.g4] ? `(${escapeHtml(r[cols.g4])})` : ""}</div></div>
        ${r[cols.meet] ? `<hr class="sep" /><div class="kv"><div class="k">Meet</div><div class="v">${escapeHtml(r[cols.meet])}</div></div>` : ""}
        ${r[cols.date] ? `<div class="kv"><div class="k">Date</div><div class="v">${escapeHtml(r[cols.date])}</div></div>` : ""}
        ${r[cols.notes] ? `<div class="kv"><div class="k">Notes</div><div class="v">${escapeHtml(r[cols.notes])}</div></div>` : ""}
      `;
      const encoded = escapeHtml(modalBody);

      return `
        <tr class="taprow" data-title="${escapeHtml(state.event)}" data-body="${encoded}">
          <td class="medal">${m}</td>
          <td>${rank}</td>
          ${showYearColumn ? `<td>${escapeHtml(r[cols.year])}</td>` : ``}
          <td>${escapeHtml(a1)}</td>
          <td>${escapeHtml(g1)}</td>
          <td><b>${escapeHtml(x.disp)}</b></td>
        </tr>
      `;
    }

    return `
      <tr>
        <td class="medal">${m}</td>
        <td>${rank}</td>
        ${showYearColumn ? `<td>${escapeHtml(r[cols.year])}</td>` : ``}
        <td>${escapeHtml(r[cols.a1])}</td><td>${escapeHtml(r[cols.g1])}</td>
        <td>${escapeHtml(r[cols.a2])}</td><td>${escapeHtml(r[cols.g2])}</td>
        <td>${escapeHtml(r[cols.a3])}</td><td>${escapeHtml(r[cols.g3])}</td>
        <td>${escapeHtml(r[cols.a4])}</td><td>${escapeHtml(r[cols.g4])}</td>
        <td><b>${escapeHtml(x.disp)}</b></td>
      </tr>
    `;
  }).join("");

  return `
    <div class="tableWrap">
      <table class="tbl">
        <thead>
          <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${body || `<tr><td colspan="${headers.length}">No matches.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderSimpleTable(list, cols, { showYearColumn }) {
  const headers = ["", "#", ...(showYearColumn ? ["Year"] : []), "Name", "Grade", "Mark"];

  const body = list.map((x, idx) => {
    const r = x.r;
    const rank = idx + 1;
    const m = medal(rank);

    return `
      <tr>
        <td class="medal">${m}</td>
        <td>${rank}</td>
        ${showYearColumn ? `<td>${escapeHtml(r[cols.year])}</td>` : ``}
        <td>${escapeHtml(r[cols.name])}</td>
        <td>${escapeHtml(r[cols.grade])}</td>
        <td><b>${escapeHtml(x.disp)}</b></td>
      </tr>
    `;
  }).join("");

  return `
    <div class="tableWrap">
      <table class="tbl">
        <thead>
          <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${body || `<tr><td colspan="${headers.length}">No matches.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function attachRelayRowClicks() {
  if (!isMobile() || state.view !== "competition") return;
  document.querySelectorAll("tr.taprow").forEach(tr => {
    tr.addEventListener("click", () => {
      const title = tr.getAttribute("data-title") || "";
      const bodyEsc = tr.getAttribute("data-body") || "";
      const tmp = document.createElement("textarea");
      tmp.innerHTML = bodyEsc;
      openModal(title, tmp.value);
    });
  });
}

function renderResults() {
  const view = state.view;
  const rows = state.data[view] || [];
  const cols = colsFor(view);
  const resEl = document.getElementById("resultsCard");

  const baseList = baseFilteredRows(rows, cols);

  // SINGLE YEAR filter (if needed)
  const singleYear = (list) => {
    const y = String(state.year || "").trim();
    if (!y) return list;
    return list.filter(x => String(x.r[cols.year] || "").trim() === y);
  };

  // Build output per mode
  if (state.mode === "byyear") {
    // All-time by Year: topN within each year section
    const years = availableYears(baseList.map(x => x.r), cols);
    const sections = years.map(y => {
      const listY = sortBestFirst(baseList.filter(x => String(x.r[cols.year] || "").trim() === y)).slice(0, state.topN);
      const table = (view === "competition")
        ? renderCompetitionTable(listY, cols, { showYearColumn: false })
        : renderSimpleTable(listY, cols, { showYearColumn: false });

      return `
        <div class="yearSection">
          <div class="yearHeader"><b>${escapeHtml(y)}</b><span class="muted">Top ${state.topN}</span></div>
          ${table}
        </div>
      `;
    }).join("");

    resEl.innerHTML = `
      <div class="summaryRow">
        <div><b>${escapeHtml(state.gender)} • ${escapeHtml(state.event)}</b></div>
        <div class="muted">All-time by Year</div>
      </div>
      ${sections || `<div class="muted">No matches.</div>`}
    `;
    // relay click handlers in each table
    attachRelayRowClicks();
    return;
  }

  if (state.mode === "year") {
    // Single year: topN for selected year
    const list = sortBestFirst(singleYear(baseList)).slice(0, state.topN);
    const table = (view === "competition")
      ? renderCompetitionTable(list, cols, { showYearColumn: false })
      : renderSimpleTable(list, cols, { showYearColumn: false });

    resEl.innerHTML = `
      <div class="summaryRow">
        <div><b>${escapeHtml(state.gender)} • ${escapeHtml(state.event)}</b></div>
        <div class="muted">${escapeHtml(state.year || "")} • Top ${state.topN}</div>
      </div>
      ${table}
    `;
    attachRelayRowClicks();
    return;
  }

  // All-time (All Years combined)
  const list = sortBestFirst(baseList).slice(0, state.topN);
  const table = (view === "competition")
    ? renderCompetitionTable(list, cols, { showYearColumn: true })
    : renderSimpleTable(list, cols, { showYearColumn: true });

  resEl.innerHTML = `
    <div class="summaryRow">
      <div><b>${escapeHtml(state.gender)} • ${escapeHtml(state.event)}</b></div>
      <div class="muted">All-time • Top ${state.topN}</div>
    </div>
    ${table}
  `;
  attachRelayRowClicks();
}

/* -----------------------------
   Boot
------------------------------ */
async function boot() {
  await Promise.all([ensureLoaded("competition"), ensureLoaded("training"), ensureLoaded("xc")]);
  render();

  window.addEventListener("resize", () => {
    clearTimeout(window.__rr);
    window.__rr = setTimeout(render, 150);
  });
}

/* -----------------------------
   PWA registration
------------------------------ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

boot();
