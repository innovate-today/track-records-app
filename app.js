/* =============================
   Track & XC Records App
   Clean full version (A done)
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
      g1: "grade_1",  g2: "grade_2",  g3: "grade_3",  g4: "grade_4",
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
  if (s === "boys" || s === "boy" || s === "m") return "Boys";
  if (s === "girls" || s === "girl" || s === "f") return "Girls";
  return "";
}

function parseMarkValue(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  const n = Number(s);
  if (Number.isFinite(n)) return n;

  const parts = s.split(":").map(x => x.trim());
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return null;
}

/* -----------------------------
   CSV parsing
------------------------------ */
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
      row.push(cur); cur = "";
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

async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return await res.text();
}

/* -----------------------------
   Modal (tap-to-expand)
------------------------------ */
function ensureModal() {
  let modal = document.getElementById("rowModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "rowModal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card">
      <div class="modal-header">
        <div id="modalTitle" class="modal-title"></div>
        <button id="modalClose" class="modal-close">Close</button>
      </div>
      <div id="modalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.classList.add("hidden");
  modal.querySelector(".modal-backdrop").onclick = close;
  modal.querySelector("#modalClose").onclick = close;

  return modal;
}

function openModal(title, bodyHtml) {
  const m = ensureModal();
  m.querySelector("#modalTitle").textContent = title;
  m.querySelector("#modalBody").innerHTML = bodyHtml;
  m.classList.remove("hidden");
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
  data: { competition: [], training: [], xc: [] }
};

async function ensureLoaded(view) {
  if (state.data[view].length) return;
  const url = CONFIG.CSV_URLS[view];
  const text = await fetchCSV(url);
  state.data[view] = rowsToObjects(parseCSV(text));
}

function uniqueEvents(rows, cols) {
  return [...new Set(rows.map(r => r[cols.event]).filter(Boolean))].sort();
}

/* -----------------------------
   Render
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
          <div class="label">Event</div>
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
    </div>

    <div class="card" id="resultsCard"></div>
  `;

  document.querySelectorAll("nav button").forEach(b => {
    b.onclick = () => { state.view = b.dataset.view; state.event = ""; render(); };
  });
}

function render() {
  const view = state.view;
  const rows = state.data[view];
  const cols = colsFor(view);

  renderShell();

  const events = uniqueEvents(rows, cols);
  if (!state.event) state.event = events[0] || "";

  document.getElementById("eventSelect").innerHTML =
    events.map(e => `<option>${escapeHtml(e)}</option>`).join("");

  document.getElementById("eventSelect").value = state.event;
  document.getElementById("topSelect").value = state.topN;
  document.getElementById("searchInput").value = state.search;

  document.getElementById("boysBtn").className = state.gender === "Boys" ? "active" : "";
  document.getElementById("girlsBtn").className = state.gender === "Girls" ? "active" : "";

  document.getElementById("eventSelect").onchange = e => { state.event = e.target.value; renderResults(); };
  document.getElementById("topSelect").onchange = e => { state.topN = Number(e.target.value); renderResults(); };
  document.getElementById("searchInput").oninput = e => { state.search = e.target.value; renderResults(); };
  document.getElementById("boysBtn").onclick = () => { state.gender = "Boys"; render(); };
  document.getElementById("girlsBtn").onclick = () => { state.gender = "Girls"; render(); };

  elLastUpdated.textContent = `Loaded: ${new Date().toLocaleString()}`;
  renderResults();
}

function renderResults() {
  const view = state.view;
  const rows = state.data[view];
  const cols = colsFor(view);
  const mobile = isMobile();
  const search = state.search.toLowerCase();

  const filtered = rows
    .filter(r => r[cols.event] === state.event)
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
      const disp = r[cols.markDisplay];
      const val = parseMarkValue(r[cols.markValue] || disp);
      return { r, disp, val };
    })
    .sort((a, b) => (a.val ?? 999999) - (b.val ?? 999999))
    .slice(0, state.topN);

  const res = document.getElementById("resultsCard");

  const headers = mobile
    ? ["#", "Year", "Name", "Gr", "Mark"]
    : view === "competition"
      ? ["#", "Year", "A1", "G", "A2", "G", "A3", "G", "A4", "G", "Mark"]
      : ["#", "Year", "Name", "Grade", "Mark"];

  const rowsHtml = filtered.map((x, i) => {
    const r = x.r;
    const rank = i + 1;

    if (mobile && view === "competition") {
      const body = `
        <div><b>${escapeHtml(x.disp)}</b></div>
        <div>${escapeHtml(r[cols.a1])} (${r[cols.g1]})</div>
        <div>${escapeHtml(r[cols.a2])} (${r[cols.g2]})</div>
        <div>${escapeHtml(r[cols.a3])} (${r[cols.g3]})</div>
        <div>${escapeHtml(r[cols.a4])} (${r[cols.g4]})</div>
      `;
      return `
        <tr class="taprow" data-body="${escapeHtml(body)}" data-title="${state.event}">
          <td>${rank}</td>
          <td>${r[cols.year]}</td>
          <td>${r[cols.a1]}</td>
          <td>${r[cols.g1]}</td>
          <td><b>${x.disp}</b></td>
        </tr>
      `;
    }

    if (mobile) {
      return `
        <tr>
          <td>${rank}</td>
          <td>${r[cols.year]}</td>
          <td>${r[cols.name]}</td>
          <td>${r[cols.grade]}</td>
          <td><b>${x.disp}</b></td>
        </tr>
      `;
    }

    if (view === "competition") {
      return `
        <tr>
          <td>${rank}</td>
          <td>${r[cols.year]}</td>
          <td>${r[cols.a1]}</td><td>${r[cols.g1]}</td>
          <td>${r[cols.a2]}</td><td>${r[cols.g2]}</td>
          <td>${r[cols.a3]}</td><td>${r[cols.g3]}</td>
          <td>${r[cols.a4]}</td><td>${r[cols.g4]}</td>
          <td><b>${x.disp}</b></td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${rank}</td>
        <td>${r[cols.year]}</td>
        <td>${r[cols.name]}</td>
        <td>${r[cols.grade]}</td>
        <td><b>${x.disp}</b></td>
      </tr>
    `;
  }).join("");

  res.innerHTML = `
    <div class="summaryRow">
      <b>${state.gender} • ${state.event}</b>
      <span class="muted">Showing ${filtered.length}</span>
    </div>
    <table class="tbl">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  if (mobile) {
    document.querySelectorAll("tr.taprow").forEach(tr => {
      tr.onclick = () => {
        const title = tr.dataset.title;
        const body = tr.dataset.body;
        const t = document.createElement("textarea");
        t.innerHTML = body;
        openModal(title, t.value);
      };
    });
  }
}

/* -----------------------------
   Boot
------------------------------ */
async function boot() {
  await Promise.all([ensureLoaded("competition"), ensureLoaded("training"), ensureLoaded("xc")]);
  render();
}

/* -----------------------------
   PWA registration (B)
------------------------------ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

boot();
