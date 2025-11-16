/* --------------------------------------------------
   Villa Park Little League - app.js
   - Teams / Schedule / Standings / Messages / Admin
   - Coach login + Admin login (PIN 0709)
   - Schedule from Google Sheets (per-division tabs)
   - Standings auto-calculated from scores
-------------------------------------------------- */

// === GLOBAL STATE ===
let games = JSON.parse(localStorage.getItem("games") || "[]");
let selectedDivision = "Majors";

// Divisions that appear in Schedule / Teams
const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];

// Divisions that actually keep score / have standings
const SCORING_DIVISIONS = ["Majors", "AAA", "AA"];

function saveGames() {
  localStorage.setItem("games", JSON.stringify(games));
}

// Give every game a stable index for DOM ids etc.
function recomputeGameIndices() {
  games.forEach((g, i) => {
    g._idx = i;
  });
}
recomputeGameIndices();

// === COACH / ADMIN STATE ===
let loggedInCoach = null;
let isAdmin = false;
const ADMIN_PIN = "0709";

const coachPins = {
  "Coach Johnson": "1111",
  "Coach Lee": "2222",
  "Coach Brown": "3333",
  "Coach Smith": "4444",
  "Coach Davis": "5555",
  "Coach Wilson": "6666",
};

// Messages
let messages = JSON.parse(localStorage.getItem("messages") || "[]");

function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

// === GOOGLE SHEET CSV LINKS ===
// One spreadsheet with tabs per division; same ID, different gid.
const CSV_LINKS = {
  Majors:
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=0",
  AAA:
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1857914653",
  AA:
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1006784456",
  "Single A":
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1852143804",
  "Coach Pitch":
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=359750423",
  "T-Ball":
    "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=860483387",
};

// === CSV HELPER ===
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const headers = lines
    .shift()
    .split(",")
    .map((h) => h.trim().toLowerCase());

  return lines.map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || "").trim();
    });
    return row;
  });
}

// === LOAD SCHEDULE FROM GOOGLE SHEETS ===
async function loadDivisionCSV(division) {
  const url = CSV_LINKS[division];
  if (!url) return;

  try {
    const response = await fetch(url + "&_=" + Date.now());
    if (!response.ok) throw new Error("HTTP " + response.status);
    const text = await response.text();
    const rows = parseCsv(text);

    const newGames = rows.map((r) => ({
      division,
      date: r.date || "",
      time: r.time || "",
      field: r.field || "",
      home: r.home || "",
      away: r.away || "",
      homeScore: r["home score"] ? Number(r["home score"]) : null,
      awayScore: r["away score"] ? Number(r["away score"]) : null,
    }));

    // Replace old games for this division
    games = games.filter((g) => g.division !== division).concat(newGames);
    recomputeGameIndices();
    saveGames();

    console.log("Loaded division from CSV:", division, newGames.length);
  } catch (err) {
    console.error("Error loading CSV for", division, err);
    alert("Problem loading schedule for " + division);
  }
}

async function loadAllDivisions() {
  for (const div of DIVISIONS) {
    await loadDivisionCSV(div);
  }
  renderSchedule();
  renderStandings();
}

// === STANDINGS CALCULATION ===
function calculateStandings(division) {
  const rec = {};

  games.forEach((g) => {
    if (g.division !== division) return;
    if (!g.home || !g.away) return;

    if (!rec[g.home]) rec[g.home] = { team: g.home, w: 0, l: 0 };
    if (!rec[g.away]) rec[g.away] = { team: g.away, w: 0, l: 0 };

    if (g.homeScore != null && g.awayScore != null) {
      if (g.homeScore > g.awayScore) {
        rec[g.home].w++;
        rec[g.away].l++;
      } else if (g.awayScore > g.homeScore) {
        rec[g.away].w++;
        rec[g.home].l++;
      }
    }
  });

  return Object.values(rec).sort(
    (a, b) =>
      b.w - a.w || a.l - b.l || a.team.localeCompare(b.team)
  );
}

// === RENDER FUNCTIONS ===
const pageRoot = document.getElementById("page-root");

function renderHome() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Welcome</div>
      </div>
      <p style="padding:16px;">
        Select a tab at the bottom to see Teams, Schedule, Standings, or Messages.
      </p>
    </section>
  `;
}

// ---- Teams ----
function renderTeams() {
  const byDivision = {};

  games.forEach((g) => {
    if (!g.division) return;
    if (!byDivision[g.division]) byDivision[g.division] = new Set();
    if (g.home) byDivision[g.division].add(g.home);
    if (g.away) byDivision[g.division].add(g.away);
  });

  const sections =
    DIVISIONS.map((div) => {
      const set = byDivision[div];
      if (!set || set.size === 0) return "";
      const items = Array.from(set)
        .sort()
        .map((t) => `<li>${t}</li>`)
        .join("");
      return `
        <div style="padding:16px;">
          <h3 style="margin-bottom:8px;">${div}</h3>
          <ul class="roster-list">${items}</ul>
        </div>`;
    }).join("") || `<p style="padding:16px;">No teams yet.</p>`;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Teams</div>
      </div>
      ${sections}
    </section>
  `;
}

// ---- Schedule ----
function renderSchedule() {
  const div = selectedDivision;

  const filtered = games.filter((g) => g.division === div);

  const items = filtered
    .map(
      (g) => `
      <li>
        <div style="font-weight:600;">${g.home || "TBD"} vs ${
        g.away || "TBD"
      }</div>
        <div style="font-size:0.85rem;color:#555;">
          ${g.date || ""} • ${g.time || ""} • ${g.field || ""}
        </div>
        <div style="font-size:0.85rem;color:#555;margin-top:4px;">
          ${
            g.homeScore != null && g.awayScore != null
              ? `${g.homeScore} - ${g.awayScore}`
              : "No score yet"
          }
        </div>
      </li>`
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${div} Schedule</div>
        <button id="reloadScheduleBtn" class="btn btn-danger">Reload</button>
      </div>
      <div style="padding:0 16px 8px 16px;">
        <label for="divisionSelect" style="margin-right:8px;">Division:</label>
        <select id="divisionSelect">
          ${DIVISIONS.map(
            (d) =>
              `<option value="${d}" ${
                d === div ? "selected" : ""
              }>${d}</option>`
          ).join("")}
        </select>
      </div>
      <ul class="schedule-list">
        ${
          items ||
          `<li>No scheduled games.</li>`
        }
      </ul>
    </section>
  `;

  const select = document.getElementById("divisionSelect");
  select.addEventListener("change", (e) => {
    selectedDivision = e.target.value;
    renderSchedule();
  });

  const reloadBtn = document.getElementById("reloadScheduleBtn");
  reloadBtn.addEventListener("click", () => {
    loadAllDivisions();
  });
}

// ---- Standings ----
function renderStandings() {
  let div = selectedDivision;
  if (!SCORING_DIVISIONS.includes(div)) {
    div = SCORING_DIVISIONS[0];
    selectedDivision = div;
  }

  const standings = calculateStandings(div);

  const rows = standings
    .map(
      (t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${t.team}</td>
        <td>${t.w}</td>
        <td>${t.l}</td>
      </tr>`
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${div} Standings</div>
      </div>
      <div style="padding:0 16px 8px 16px;">
        <label for="standingsDivisionSelect" style="margin-right:8px;">Division:</label>
        <select id="standingsDivisionSelect">
          ${SCORING_DIVISIONS.map(
            (d) =>
              `<option value="${d}" ${
                d === div ? "selected" : ""
              }>${d}</option>`
          ).join("")}
        </select>
      </div>
      <div style="padding:0 16px 16px 16px;">
        ${
          standings.length === 0
            ? "<p>No results yet.</p>"
            : `
          <table class="standings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>`
        }
      </div>
    </section>
  `;

  const select = document.getElementById("standingsDivisionSelect");
  select.addEventListener("change", (e) => {
    selectedDivision = e.target.value;
    renderStandings();
  });
}

// ---- Messages + Coach/Admin login ----
function renderMessages() {
  const htmlMsgs = messages
    .map(
      (m) => `
      <li style="margin-bottom:10px;">
        <div style="font-weight:600;">${m.author}</div>
        <div style="font-size:0.9rem;color:#333;">${m.text}</div>
        <div style="font-size:0.75rem;color:#888;">${m.time}</div>
      </li>`
    )
    .join("");

  const adminTools = isAdmin
    ? `
      <div style="margin-top:16px;padding:12px;border:2px solid red;border-radius:8px;">
        <div style="font-weight:700;color:red;margin-bottom:4px;">Admin Panel</div>
        <button id="adminClearMessages"
          style="width:100%;padding:8px;margin-bottom:8px;background:#c00;color:#fff;border:none;border-radius:6px;">
          Clear ALL announcements
        </button>
        <button id="adminLogout"
          style="width:100%;padding:8px;background:#555;color:#fff;border:none;border-radius:6px;">
          Log Out (Admin)
        </button>
      </div>`
    : `
      <div style="margin-top:16px;">
        <input id="adminPin" type="password" placeholder="Admin PIN"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <button id="adminLoginBtn"
          style="width:100%;padding:8px;background:#c00;color:#fff;border:none;border-radius:8px;">
          Log In as Admin
        </button>
      </div>`;

  const coachTools =
    loggedInCoach && loggedInCoach !== "Admin"
      ? `
      <div style="margin-top:16px;">
        <textarea id="messageInput" rows="3" placeholder="Type announcement..."
          style="width:100%;padding:8px;border-radius:8px;"></textarea>
        <button id="sendMessageBtn"
          style="margin-top:8px;width:100%;background:#c00;color:#fff;border:none;border-radius:6px;padding:8px;">
          Post as ${loggedInCoach}
        </button>
        <button id="coachLogoutBtn"
          style="margin-top:8px;width:100%;background:#555;color:#fff;border:none;border-radius:6px;padding:8px;">
          Log Out (Coach)
        </button>
      </div>`
      : `
      <div style="margin-top:16px;">
        <input id="coachName" placeholder="Coach Name"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <input id="coachPin" type="password" placeholder="PIN"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <button id="loginBtn"
          style="margin-top:8px;width:100%;background:#c00;color:#fff;border:none;border-radius:6px;padding:8px;">
          Coach Log In
        </button>
      </div>`;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">League Messages</div>
      </div>
      <ul class="roster-list">
        ${htmlMsgs || "<li>No messages yet.</li>"}
      </ul>
      ${adminTools}
      ${coachTools}
    </section>
  `;

  // Admin listeners
  if (isAdmin) {
    const clearBtn = document.getElementById("adminClearMessages");
    clearBtn.addEventListener("click", () => {
      if (confirm("Delete ALL announcements?")) {
        messages = [];
        saveMessages();
        renderMessages();
      }
    });

    const logoutBtn = document.getElementById("adminLogout");
    logoutBtn.addEventListener("click", () => {
      isAdmin = false;
      if (loggedInCoach === "Admin") loggedInCoach = null;
      updateNavForAdmin();
      renderMessages();
    });
  } else {
    const adminLoginBtn = document.getElementById("adminLoginBtn");
    adminLoginBtn.addEventListener("click", () => {
      const pin = document.getElementById("adminPin").value.trim();
      if (pin === ADMIN_PIN) {
        isAdmin = true;
        loggedInCoach = "Admin";
        alert("Admin access granted!");
        updateNavForAdmin();
        renderMessages();
      } else {
        alert("Wrong admin PIN.");
      }
    });
  }

  // Coach listeners
  if (loggedInCoach && loggedInCoach !== "Admin") {
    const sendBtn = document.getElementById("sendMessageBtn");
    const logoutBtn = document.getElementById("coachLogoutBtn");

    sendBtn.addEventListener("click", () => {
      const input = document.getElementById("messageInput");
      const text = input.value.trim();
      if (!text) return;
      messages.unshift({
        author: loggedInCoach,
        text,
        time: new Date().toLocaleString(),
      });
      saveMessages();
      renderMessages();
    });

    logoutBtn.addEventListener("click", () => {
      loggedInCoach = null;
      renderMessages();
    });
  } else if (!isAdmin) {
    const loginBtn = document.getElementById("loginBtn");
    loginBtn.addEventListener("click", () => {
      const name = document.getElementById("coachName").value.trim();
      const pin = document.getElementById("coachPin").value.trim();
      if (coachPins[name] && coachPins[name] === pin) {
        loggedInCoach = name;
        alert(`Welcome, ${name}!`);
        renderMessages();
      } else {
        alert("Invalid coach name or PIN.");
      }
    });
  }
}

// ---- Admin page ----
function renderAdmin() {
  if (!isAdmin) {
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Admin</div>
        </div>
        <p style="padding:16px;">
          Admin access only. Log in on the Messages tab with the admin PIN.
        </p>
      </section>
    `;
    return;
  }

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Admin Tools</div>
      </div>
      <p style="padding:16px;">
        (Future spot for score entry tools, exports, etc.)
      </p>
    </section>
  `;
}

// === NAVIGATION ===
const navButtons = document.querySelectorAll(".nav-btn");

function clearActiveNav() {
  navButtons.forEach((btn) => btn.classList.remove("active"));
}

function updateNavForAdmin() {
  const adminTab = document.getElementById("adminTab");
  if (!adminTab) return;
  adminTab.style.display = isAdmin ? "inline-block" : "none";
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    clearActiveNav();
    btn.classList.add("active");
    const page = btn.dataset.page;

    if (page === "teams") renderTeams();
    else if (page === "schedule") renderSchedule();
    else if (page === "standings") renderStandings();
    else if (page === "messages") renderMessages();
    else if (page === "admin") renderAdmin();
    else renderHome();
  });
});

// === INITIAL LOAD ===
updateNavForAdmin();
renderHome();
loadAllDivisions().catch((e) =>
  console.error("Initial loadAllDivisions error:", e)
);
