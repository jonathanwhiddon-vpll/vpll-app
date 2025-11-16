/* --------------------------------------------------
   Villa Park Little League - app.js
   - Teams / Schedule / Standings / Messages / Admin
   - Coach login + Admin login (PIN 0709)
   - Schedule from Google Sheets (per-division tabs)
   - Standings auto-calculated from scores
   - Coaches/Admin can report scores for Majors/AAA/AA
-------------------------------------------------- */
// === PUSH NOTIFICATION CONFIG ===
const VAPID_PUBLIC_KEY =
  "BF0dpO0TLhz4vAoOOJvTLmnZ5s93F5KI1bmam8jytsnDW1wnLVVS53gHOS47fL6VcNBuynPx53zEkJVwWTIlHcw";

// Ask browser permission & subscribe user
async function enableNotifications() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Notifications blocked. Enable them in your browser settings.");
      return;
    }

    // Register service worker (already exists for PWA)
    const reg = await navigator.serviceWorker.ready;

    // Subscribe user
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    console.log("Push subscription:", sub);

    // TODO: Send subscription to Google Apps Script backend
    alert("Notifications enabled!");
  } catch (err) {
    console.error("Push subscribe error:", err);
  }
}

// Helper to convert key
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

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

// Coach PINs (you can change these later if you want)
const coachPins = {
  "Coach Ben": "1101",
  "Coach Brian": "1102",
  "Coach Todd": "1103",
  "Coach Kevin": "1104",
  "Coach Five": "1105",
  "Coach Six": "1106",

  "Coach Jon": "2101",
  "Coach Matt C": "2102",
  "Coach Matt P": "2103",
  "Coach Devin": "2104",
  "Coach Matt B": "2105",
  "Coach JJ": "2106",
  "Coach George": "2107",
  "Coach Eric": "2108",

  "Coach Scott": "3101",
  "Coach Cory": "3102",
  "Coach Mitch": "3103",
  "Coach Matt": "3104",
  "Coach Dustin": "3105",
  "Coach Brent": "3106",
  "Coach Eight": "3107",
};

// Which team(s) each coach is responsible for
// (used to allow score entry only for their own games)
const coachTeams = {
  "Coach Ben": [{ division: "Majors", team: "Team Hanna" }],
  "Coach Brian": [{ division: "Majors", team: "Team Cole" }],
  "Coach Todd": [{ division: "Majors", team: "Team Thergeson" }],
  "Coach Kevin": [{ division: "Majors", team: "Team Merrett" }],
  "Coach Five": [{ division: "Majors", team: "Team Five" }],
  "Coach Six": [{ division: "Majors", team: "Team Six" }],

  "Coach Jon": [
    { division: "AAA", team: "Team Whiddon" },
    { division: "AA", team: "Team Breazeal" },
  ],
  "Coach Matt C": [{ division: "AAA", team: "Team Cairney" }],
  "Coach Matt P": [{ division: "AAA", team: "Team Paul" }],
  "Coach Devin": [{ division: "AAA", team: "Team Dragg" }],
  "Coach Matt B": [{ division: "AAA", team: "Team Baker" }],
  "Coach JJ": [{ division: "AAA", team: "Team Norman" }],
  "Coach George": [{ division: "AAA", team: "Team Gonzalez" }],
  "Coach Eric": [{ division: "AAA", team: "Team Rasanen" }],

  "Coach Scott": [{ division: "AA", team: "Team Belcher" }],
  "Coach Cory": [{ division: "AA", team: "Team Anderson" }],
  "Coach Mitch": [{ division: "AA", team: "Team Garcia" }],
  "Coach Matt": [{ division: "AA", team: "Team Kruckeberg" }],
  // Coach Jon's AA team already above
  "Coach Dustin": [{ division: "AA", team: "Team Machado" }],
  "Coach Brent": [{ division: "AA", team: "Team Lavitt" }],
  "Coach Eight": [{ division: "AA", team: "Team Eight" }],
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

// === GOOGLE APPS SCRIPT WEB APP (Scores API) ===
const APP_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby4sGBxN0sMlGT398mM3CGjQXKCIjL2C2eRxAQJohc7Gz1kah8zCnlv_dTkxYvtyddR/exec";

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

// === PERMISSIONS: Can this coach/admin edit this game? ===
function coachCanEditGame(game) {
  // Admin can edit all scoring-division games
  if (isAdmin && SCORING_DIVISIONS.includes(game.division)) return true;
  if (!loggedInCoach) return false;
  if (!SCORING_DIVISIONS.includes(game.division)) return false;

  const assignments = coachTeams[loggedInCoach];
  if (!assignments || !assignments.length) return false;

  return assignments.some(
    (a) =>
      a.division === game.division &&
      (a.team === game.home || a.team === game.away)
  );
}

// === SCORE ENTRY ===
function openScorePrompt(idx) {
  const game = games.find((g) => g._idx === idx);
  if (!game) return;

  if (!SCORING_DIVISIONS.includes(game.division)) {
    alert("This division does not keep score.");
    return;
  }

  if (!coachCanEditGame(game)) {
    alert("You are not allowed to report a score for this game.");
    return;
  }

  const hsDefault = game.homeScore != null ? game.homeScore : "";
  const asDefault = game.awayScore != null ? game.awayScore : "";

  const hs = prompt(`Enter score for ${game.home}`, hsDefault);
  if (hs === null) return;

  const as = prompt(`Enter score for ${game.away}`, asDefault);
  if (as === null) return;

  const hNum = Number(hs);
  const aNum = Number(as);

  if (Number.isNaN(hNum) || Number.isNaN(aNum)) {
    alert("Please enter numeric scores only.");
    return;
  }

  game.homeScore = hNum;
  game.awayScore = aNum;
  saveGames();

  // Try to sync to Google Apps Script (no need to wait for it)
  try {
    fetch(APP_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        division: game.division,
        date: game.date,
        time: game.time,
        field: game.field,
        home: game.home,
        away: game.away,
        homeScore: hNum,
        awayScore: aNum,
      }),
    });
  } catch (e) {
    console.warn("Score sync failed", e);
  }

  // Re-render schedule (and standings will reflect next time you open it)
  renderSchedule();
}

// make available for inline onclick
window.openScorePrompt = openScorePrompt;

// === RENDER FUNCTIONS ===
const pageRoot = document.getElementById("page-root");
const navButtons = document.querySelectorAll(".nav-btn");

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
    .map((g) => {
      const canEdit = coachCanEditGame(g);
      const scoreLine =
        g.homeScore != null && g.awayScore != null
          ? `${g.homeScore} - ${g.awayScore}`
          : "No score yet";

      const scoreBtn =
        canEdit && SCORING_DIVISIONS.includes(div)
          ? `<button
               style="margin-top:6px;padding:4px 10px;border:none;border-radius:6px;background:#c00;color:#fff;font-size:0.8rem;"
               onclick="openScorePrompt(${g._idx})">
               Report Score
             </button>`
          : "";

      return `
      <li>
        <div style="font-weight:600;">${g.home || "TBD"} vs ${
        g.away || "TBD"
      }</div>
        <div style="font-size:0.85rem;color:#555;">
          ${g.date || ""} • ${g.time || ""} • ${g.field || ""}
        </div>
        <div style="font-size:0.85rem;color:#555;margin-top:4px;">
          ${scoreLine}
        </div>
        ${scoreBtn}
      </li>`;
    })
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
        <input id="coachName" placeholder='Coach Name (e.g. "Coach Ben")'
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <input id="coachPin" type="password" placeholder="Coach PIN"
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
        Use the Schedule tab to report scores (as Admin) for Majors / AAA / AA.
      </p>
    </section>
  `;
}

// === NAVIGATION ===
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
