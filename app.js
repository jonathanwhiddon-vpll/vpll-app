/* ---------------------------------------------------
   Villa Park Little League - app.js
   - Teams / Schedule / Standings / Messages / Admin
   - Coach login + Admin login
   - Google Sheet schedule (CSV)
   - Scores sync via Apps Script Web App
   - Standings auto-calculated from scores
--------------------------------------------------- */

// === GLOBAL STATE ===
let games = JSON.parse(localStorage.getItem("games") || "[]");
let selectedDivision = "Majors";

const DIVISIONS = [
  "Majors",
  "AAA",
  "AA",
  "Single A",
  "Coach Pitch",
  "T-Ball",
];

// Give every game a stable index for DOM IDs
function recomputeGameIndices() {
  games.forEach((g, i) => {
    g._idx = i;
  });
}
recomputeGameIndices();

// === GOOGLE SHEET CSV LINKS ===
// One tab per division (all same spreadsheet ID, different gid)
const CSV_LINKS = {
  Majors:
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=0",
  AAA: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1857914653",
  AA: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1006784456",
  "Single A":
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1852143804",
  "Coach Pitch":
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=359750423",
  "T-Ball":
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=860483387",
};

// === GOOGLE APPS SCRIPT WEB APP (Scores API) ===
const APP_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby4sGBxN0sMlGT398mM3CGjQXKCIjL2C2eRxAQJohc7Gz1kah8zCnlv_dTkxYvtyddR/exec";

// ======================================================
// ========== LOAD SCHEDULE FROM GOOGLE SHEETS ==========
// ======================================================

async function loadDivisionCSV(division) {
  try {
    const url = CSV_LINKS[division];
    if (!url) {
      console.error("No CSV link for division", division);
      return [];
    }

    const response = await fetch(url);
    const text = await response.text();

    const rows = text.trim().split("\n").map((r) => r.split(","));
    const header = rows[0].map((h) => h.trim());

    let newGames = [];

    rows.slice(1).forEach((row) => {
      const obj = {};

      row.forEach((v, i) => {
        const key = header[i].toLowerCase();
        const val = v.trim();

        if (key === "date") obj.date = val;
        else if (key === "time") obj.time = val;
        else if (key === "field") obj.field = val;
        else if (key === "home") obj.home = val;
        else if (key === "away") obj.away = val;
        else if (key === "home score") obj.homeScore = val || "";
        else if (key === "away score") obj.awayScore = val || "";
      });

      obj.division = division;
      newGames.push(obj);
    });

    return newGames;
  } catch (err) {
    console.error("CSV Load Error:", err);
    return [];
  }
}

async function reloadAllDivisions() {
  let all = [];
  for (const div of DIVISIONS) {
    const g = await loadDivisionCSV(div);
    all = all.concat(g);
  }

  games = all;
  recomputeGameIndices();
  localStorage.setItem("games", JSON.stringify(games));
  alert("Schedules updated from Google Sheets!");
  renderSchedule();
}

// ======================================================
// ============== AUTO CALCULATE STANDINGS ==============
// ======================================================

function calculateStandings(division) {
  const divisionGames = games.filter((g) => g.division === division);

  const rec = {};

  divisionGames.forEach((g) => {
    if (!g.home || !g.away) return;

    if (!rec[g.home]) rec[g.home] = { team: g.home, w: 0, l: 0 };
    if (!rec[g.away]) rec[g.away] = { team: g.away, w: 0, l: 0 };

    if (
      g.homeScore !== undefined &&
      g.awayScore !== undefined &&
      g.homeScore !== "" &&
      g.awayScore !== ""
    ) {
      const h = Number(g.homeScore);
      const a = Number(g.awayScore);

      if (h > a) {
        rec[g.home].w++;
        rec[g.away].l++;
      } else if (a > h) {
        rec[g.away].w++;
        rec[g.home].l++;
      }
    }
  });

  return Object.values(rec).sort((a, b) => b.w - a.w);
}

// ======================================================
// ===================== RENDER UI =======================
// ======================================================

const pageRoot = document.getElementById("page-root");
const navButtons = document.querySelectorAll(".nav-btn");

function clearActiveNav() {
  navButtons.forEach((btn) => btn.classList.remove("active"));
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    clearActiveNav();
    btn.classList.add("active");

    const page = btn.dataset.page;

    if (page === "schedule") renderSchedule();
    else if (page === "teams") renderTeams();
    else if (page === "standings") renderStandings();
    else if (page === "messages") renderMessages();
    else if (page === "admin") renderAdmin();
    else renderHome();
  });
});

// -------------------------------------------------------
// HOME
// -------------------------------------------------------
function renderHome() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Welcome</div></div>
      <p style="padding:16px;">Select a tab to get started!</p>
    </section>
  `;
}

// -------------------------------------------------------
// TEAMS
// -------------------------------------------------------
function renderTeams() {
  const teamList = [...new Set(games.map((g) => g.home).filter(Boolean))];

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Teams</div></div>
      <ul class="team-list">
        ${teamList.map((t) => `<li>${t}</li>`).join("")}
      </ul>
    </section>
  `;
}

// -------------------------------------------------------
// SCHEDULE
// -------------------------------------------------------
function renderSchedule() {
  const divGames = games.filter((g) => g.division === selectedDivision);

  const items = divGames
    .map((g) => {
      return `
        <li class="game-row">
          <div><strong>${g.home}</strong> vs <strong>${g.away}</strong></div>
          <div>${g.date} • ${g.time} • ${g.field}</div>
          <div style="margin-top:6px;">
            Score: ${g.homeScore || "-"} - ${g.awayScore || "-"}
          </div>
        </li>
      `;
    })
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Schedule</div>
        <button class="btn btn-red" id="reloadBtn">Reload</button>
      </div>

      <label style="padding-left:10px;">Division:</label>
      <select id="divisionSelect" style="margin-left:10px;">
        ${DIVISIONS.map(
          (d) => `<option ${d === selectedDivision ? "selected" : ""}>${d}</option>`
        ).join("")}
      </select>

      <ul class="schedule-list">
        ${items || "<li>No scheduled games.</li>"}
      </ul>
    </section>
  `;

  document.getElementById("divisionSelect").addEventListener("change", (e) => {
    selectedDivision = e.target.value;
    renderSchedule();
  });

  document.getElementById("reloadBtn").addEventListener("click", reloadAllDivisions);
}

// -------------------------------------------------------
// STANDINGS
// -------------------------------------------------------
function renderStandings() {
  const table = calculateStandings(selectedDivision);

  const rows = table
    .map(
      (t) => `
      <tr>
        <td>${t.team}</td>
        <td>${t.w}</td>
        <td>${t.l}</td>
      </tr>
    `
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">${selectedDivision} Standings</div>
      </div>

      <label style="padding-left:10px;">Division:</label>
      <select id="divisionSelect">
        ${DIVISIONS.map(
          (d) => `<option ${d === selectedDivision ? "selected" : ""}>${d}</option>`
        ).join("")}
      </select>

      <table class="standings-table">
        <tr><th>Team</th><th>W</th><th>L</th></tr>
        ${rows}
      </table>
    </section>
  `;

  document.getElementById("divisionSelect").addEventListener("change", (e) => {
    selectedDivision = e.target.value;
    renderStandings();
  });
}

// -------------------------------------------------------
// MESSAGES
// -------------------------------------------------------
function renderMessages() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Messages</div></div>
      <p style="padding:16px;">Coming soon…</p>
    </section>
  `;
}

// -------------------------------------------------------
// ADMIN + COACH SCORE ENTRY
// -------------------------------------------------------
function renderAdmin() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Admin Tools</div></div>
      <button class="btn" id="btnEnterScores">Enter Scores</button>
    </section>
  `;

  document.getElementById("btnEnterScores").addEventListener("click", renderScoreEntry);
}

function renderScoreEntry() {
  const scoringDivisions = ["Majors", "AAA", "AA"];

  const divGames = games.filter((g) =>
    scoringDivisions.includes(g.division)
  );

  const rows = divGames
    .map(
      (g) => `
      <li class="game-row">
        <div><strong>${g.home}</strong> vs <strong>${g.away}</strong></div>
        <div>${g.date} • ${g.time} • ${g.field}</div>
        <div style="margin-top:6px;">
          <input type="number" class="score-input" data-idx="${g._idx}" data-team="home" placeholder="Home Score" value="${g.homeScore || ""}">
          <input type="number" class="score-input" data-idx="${g._idx}" data-team="away" placeholder="Away Score" value="${g.awayScore || ""}">
        </div>
      </li>`
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Enter Scores</div></div>

      <ul class="schedule-list">
        ${rows}
      </ul>

      <button class="btn btn-red" id="saveScores">Save Scores</button>
    </section>
  `;

  document.getElementById("saveScores").addEventListener("click", saveScores);
}

function saveScores() {
  const inputs = document.querySelectorAll(".score-input");

  inputs.forEach((inp) => {
    const idx = Number(inp.dataset.idx);
    const team = inp.dataset.team;
    const val = inp.value;

    if (team === "home") games[idx].homeScore = val;
    else games[idx].awayScore = val;
  });

  localStorage.setItem("games", JSON.stringify(games));

  fetch(APP_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ games }),
  });

  alert("Scores saved!");
  renderSchedule();
}

// INITIAL LOAD
renderHome();
