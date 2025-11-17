/* --------------------------------------------------
   Villa Park Little League - app.js
   - Teams / Schedule / Standings / Messages / Admin
   - Coach login + Admin login (PIN 0709)
   - Schedule from Google Sheets (per-division tabs)
   - Scores sync via Apps Script Web App
   - Standings auto-calculated from scores
   - Resources tab (Local Rules, LL app, Home Run List)
-------------------------------------------------- */

// === PUSH NOTIFICATION CONFIG (already set up earlier) ===
const VAPID_PUBLIC_KEY =
  "BF0dpO0TLhz4vAoOOJvTLmnZ5s93F5KI1bmam8jytsnDW1wnLVVS53gHOS47fL6VcNBuynPx53zEkJVwWTIlHcw";

// Ask browser permission & subscribe user (for future use)
async function enableNotifications() {
  try {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Notifications blocked. Enable them in your browser settings.");
      return;
    }

    // Service worker from service-worker.js
    const reg = await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    console.log("Push subscription:", sub);
    alert("Notifications enabled on this device!");
  } catch (err) {
    console.error("Push subscribe error:", err);
    alert("Could not enable notifications.");
  }
}

// Helper for VAPID key
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

// Divisions that keep score / have standings
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

// Coach PINs
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
  "Coach Dustin": [{ division: "AA", team: "Team Machado" }],
  "Coach Brent": [{ division: "AA", team: "Team Lavitt" }],
  "Coach Eight": [{ division: "AA", team: "Team Eight" }],
};

// Messages (stored locally)
let messages = JSON.parse(localStorage.getItem("messages") || "[]");
function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

// === GOOGLE SHEET CSV LINKS ===
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

// Apps Script Web App URL
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycby4sGBxN0sMlGT398mM3CGjQXKCIjL2C2eRxAQJohc7Gz1kah8zCnlv_dTkxYvtyddR/exec";

// ---------------------------------------------------------
// === LOAD SCHEDULE FROM GOOGLE SHEET CSV (per division) ===
// ---------------------------------------------------------
async function loadScheduleFromSheet(divisionName) {
  try {
    const baseUrl = CSV_LINKS[divisionName];
    if (!baseUrl) return;

    // Chromebook-safe fetch (no caching)
    const response = await fetch(baseUrl + "&v=" + Date.now(), {
      cache: "no-store",
    });

    const csv = await response.text();

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return;

    const header = lines[0].split(",");
    const dateIdx = header.indexOf("Date");
    const timeIdx = header.indexOf("Time");
    const fieldIdx = header.indexOf("Field");
    const homeIdx = header.indexOf("Home");
    const awayIdx = header.indexOf("Away");
    const homeScoreIdx = header.indexOf("Home Score");
    const awayScoreIdx = header.indexOf("Away Score");

    const newGames = lines.slice(1).map((line) => {
      const cols = line.split(",");
      return {
        division: divisionName,
        date: cols[dateIdx] || "",
        time: cols[timeIdx] || "",
        field: cols[fieldIdx] || "",
        home: cols[homeIdx] || "",
        away: cols[awayIdx] || "",
        homeScore:
          homeScoreIdx >= 0 && cols[homeScoreIdx] !== ""
            ? Number(cols[homeScoreIdx])
            : null,
        awayScore:
          awayScoreIdx >= 0 && cols[awayScoreIdx] !== ""
            ? Number(cols[awayScoreIdx])
            : null,
      };
    });

    // Filter out empty rows and replace games for this division
    const cleaned = newGames.filter((g) => g.home && g.away);
    games = games.filter((g) => g.division !== divisionName).concat(cleaned);

    recomputeGameIndices();
    saveGames();
    console.log(`Loaded schedule for ${divisionName}`, cleaned);
  } catch (err) {
    console.error("Error loading schedule CSV for", divisionName, err);
  }
}
// Load all divisions once (Admin tool)
async function reloadAllSchedules() {
  for (const div of DIVISIONS) {
    await loadScheduleFromSheet(div);
  }
  await loadScoresFromGoogleSheet(); // pull any saved scores from Apps Script
  renderSchedule();
  renderStandings();
}

// ---------------------------------------------------------
// === LOAD SCORES FROM GOOGLE APPS SCRIPT WEB APP ===
// ---------------------------------------------------------
async function loadScoresFromGoogleSheet() {
  try {
    // Chromebook-safe — force fresh fetch
    const response = await fetch(SHEET_API_URL + "?v=" + Date.now(), {
      cache: "no-store",
    });

    const data = await response.json();

    // Expecting: { games: [...] }
    if (!data || !Array.isArray(data.games)) {
      console.warn("Unexpected data from Sheet API:", data);
      return;
    }

    games = data.games.map((g) => ({
      division: g.division,
      date: g.date,
      time: g.time,
      field: g.field,
      home: g.home,
      away: g.away,
      homeScore:
        g.homeScore === "" || g.homeScore === undefined
          ? null
          : Number(g.homeScore),
      awayScore:
        g.awayScore === "" || g.awayScore === undefined
          ? null
          : Number(g.awayScore),
    }));

    recomputeGameIndices();
    saveGames();
    console.log("Loaded scores from Google Sheets:", games);
  } catch (err) {
    console.error("Google Sheets load error:", err);
  }
}

// ---------------------------------------------------------
// === STANDINGS CALCULATION ===
// ---------------------------------------------------------
function calculateStandings(forDivision) {
  const rec = {};
  games
    .filter((g) => g.division === forDivision)
    .forEach((g) => {
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

  return Object.values(rec).sort((a, b) => b.w - a.w);
}

// ---------------------------------------------------------
// === SUBMIT SCORE (COACH) -> GOOGLE APPS SCRIPT WEB APP ===
// ---------------------------------------------------------
async function submitScore(gameIdx) {
  if (!loggedInCoach) {
    alert("Please log in as a coach to submit scores.");
    return;
  }

  const homeInput = document.getElementById(`homeScore-${gameIdx}`);
  const awayInput = document.getElementById(`awayScore-${gameIdx}`);
  if (!homeInput || !awayInput) return;

  const homeScore = parseInt(homeInput.value, 10);
  const awayScore = parseInt(awayInput.value, 10);

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
    alert("Please enter both scores.");
    return;
  }

  const game = games[gameIdx];
  if (!game) return;

  const payload = {
    action: "submitScore",
    division: game.division,
    date: game.date,
    time: game.time,
    field: game.field,
    home: game.home,
    away: game.away,
    homeScore,
    awayScore,
  };

  try {
    const response = await fetch(SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("Score submit response:", data);

    // Update local state immediately
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    saveGames();

    // Clear inputs
    homeInput.value = "";
    awayInput.value = "";

    alert("Score submitted!");
    renderSchedule();
    renderStandings();
  } catch (err) {
    console.error("Error submitting score:", err);
    alert("Could not submit score. Please try again.");
  }
}

// ---------------------------------------------------------
// === PAGE RENDERING ===
// ---------------------------------------------------------
const pageRoot = document.getElementById("page-root");
const navButtons = document.querySelectorAll(".nav-btn");

// --- HOME ---
function renderHome() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Welcome</div>
      </div>
      <p style="padding:16px;">
        Select a tab below to view teams, schedules, standings, messages, or resources.
      </p>
    </section>
  `;
}

// --- TEAMS ---
function renderTeams() {
  const divisionTeams = {
    Majors: [
      { name: "Team Hanna", coach: "Coach Ben" },
      { name: "Team Cole", coach: "Coach Brian" },
      { name: "Team Thergeson", coach: "Coach Todd" },
      { name: "Team Merrett", coach: "Coach Kevin" },
      { name: "Team Five", coach: "Coach Five" },
      { name: "Team Six", coach: "Coach Six" },
    ],
    AAA: [
      { name: "Team Whiddon", coach: "Coach Jon" },
      { name: "Team Cairney", coach: "Coach Matt C" },
      { name: "Team Paul", coach: "Coach Matt P" },
      { name: "Team Dragg", coach: "Coach Devin" },
      { name: "Team Baker", coach: "Coach Matt B" },
      { name: "Team Norman", coach: "Coach JJ" },
      { name: "Team Gonzalez", coach: "Coach George" },
      { name: "Team Rasanen", coach: "Coach Eric" },
    ],
    AA: [
      { name: "Team Belcher", coach: "Coach Scott" },
      { name: "Team Anderson", coach: "Coach Cory" },
      { name: "Team Garcia", coach: "Coach Mitch" },
      { name: "Team Kruckeberg", coach: "Coach Matt" },
      { name: "Team Breazeal", coach: "Coach Jon" },
      { name: "Team Machado", coach: "Coach Dustin" },
      { name: "Team Lavitt", coach: "Coach Brent" },
      { name: "Team Eight", coach: "Coach Eight" },
    ],
    "Single A": [],
    "Coach Pitch": [],
    "T-Ball": [],
  };

  const teams = divisionTeams[selectedDivision] || [];

  const options = DIVISIONS.map(
    (d) =>
      `<option value="${d}" ${d === selectedDivision ? "selected" : ""}>${d}</option>`
  ).join("");

  const listHtml =
    teams.length === 0
      ? `<p style="padding:16px;">Teams for ${selectedDivision} coming soon.</p>`
      : `<ul class="roster-list">
          ${teams
            .map(
              (t) => `
            <li>
              <span>${t.name}</span>
              <span class="roster-role">${t.coach}</span>
            </li>`
            )
            .join("")}
        </ul>`;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Teams</div>
        <select id="teamsDivisionSelect">${options}</select>
      </div>
      ${listHtml}
    </section>
  `;

  document
    .getElementById("teamsDivisionSelect")
    .addEventListener("change", (e) => {
      selectedDivision = e.target.value;
      renderTeams();
    });
}

// --- SCHEDULE + SCORE ENTRY ---
function renderSchedule() {
  const divisions = DIVISIONS;
  const filteredGames = games.filter((g) => g.division === selectedDivision);

  const options = divisions
    .map(
      (d) =>
        `<option value="${d}" ${d === selectedDivision ? "selected" : ""}>${d}</option>`
    )
    .join("");

  const items =
    filteredGames.length === 0
      ? "<li>No scheduled games.</li>"
      : filteredGames
          .map((g) => {
            let canEdit = false;

            if (isAdmin) {
              canEdit = true;
            } else if (loggedInCoach && coachTeams[loggedInCoach]) {
              const assignments = coachTeams[loggedInCoach];
              canEdit = assignments.some(
                (a) =>
                  a.division === g.division &&
                  (a.team === g.home || a.team === g.away)
              );
            }

            return `
          <li>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:600;">${g.home} vs ${g.away}</div>
                <div style="font-size:0.85rem;color:#555;">
                  ${g.date} • ${g.time} • ${g.field}
                </div>
              </div>
              <div style="text-align:right;font-weight:600;">
                ${
                  g.homeScore != null && g.awayScore != null
                    ? `${g.homeScore} - ${g.awayScore}`
                    : "No score yet"
                }
              </div>
            </div>

            ${
              canEdit
                ? `
            <div class="score-entry" style="margin-top:8px;display:flex;gap:8px;">
              <input
                type="number"
                placeholder="Home"
                id="homeScore-${g._idx}"
                class="score-input"
                style="flex:1;padding:6px;border-radius:6px;border:1px solid #ccc;"
              >
              <input
                type="number"
                placeholder="Away"
                id="awayScore-${g._idx}"
                class="score-input"
                style="flex:1;padding:6px;border-radius:6px;border:1px solid #ccc;"
              >
              <button
                class="score-btn"
                style="flex:1;padding:6px;border-radius:6px;border:none;background:#198754;color:white;"
                onclick="submitScore(${g._idx})"
              >
                Submit
              </button>
            </div>`
                : ""
            }
          </li>
        `;
          })
          .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div>
          <div class="card-title">${selectedDivision} Schedule</div>
          <div class="card-subtitle">
            Coaches for this division can enter scores for their own games.
          </div>
        </div>
        <select id="scheduleDivisionSelect">${options}</select>
      </div>
      <ul class="schedule-list">
        ${items}
      </ul>
    </section>
  `;

  document
    .getElementById("scheduleDivisionSelect")
    .addEventListener("change", (e) => {
      selectedDivision = e.target.value;
      renderSchedule();
    });
}

// --- STANDINGS ---
function renderStandings() {
  if (!SCORING_DIVISIONS.includes(selectedDivision)) {
    selectedDivision = "Majors";
  }

  const options = SCORING_DIVISIONS.map(
    (d) =>
      `<option value="${d}" ${d === selectedDivision ? "selected" : ""}>${d}</option>`
  ).join("");

  const rows = calculateStandings(selectedDivision);
  const list =
    rows.length === 0
      ? "<li>No standings yet.</li>"
      : rows
          .map(
            (r, i) => `
        <li>
          <span>${i + 1}. ${r.team}</span>
          <span class="record">${r.w}-${r.l}</span>
        </li>`
          )
          .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div>
          <div class="card-title">${selectedDivision} Standings</div>
          <div class="card-subtitle">Auto-calculated from reported scores</div>
        </div>
        <select id="standingsDivisionSelect">${options}</select>
      </div>
      <ul class="standings-list">
        ${list}
      </ul>
    </section>
  `;

  document
    .getElementById("standingsDivisionSelect")
    .addEventListener("change", (e) => {
      selectedDivision = e.target.value;
      renderStandings();
    });
}
// --- RESOURCES (NEW TAB) ---
function renderResources() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">League Resources</div>
      </div>

      <p style="padding:12px 16px;font-size:0.9rem;color:#555;">
        Tap a resource below to open it in a new tab.
      </p>

      <ul class="resource-list" style="padding:0 16px 16px 16px;">
        <li style="margin-bottom:10px;">
          <a href="https://docs.google.com/document/d/1QVtREnvJb_VN_ZkGh5guW5PJI_5uck6K7VjVaKEBSaY/edit?tab=t.0"
             target="_blank">
            📘 Villa Park Local Rules
          </a>
        </li>

        <li style="margin-bottom:10px;">
          <a href="https://docs.google.com/document/d/11CShzXZavE77uNQQou8dqn4bUINXCe4vOtgeT8RBq6E/edit?tab=t.0"
             target="_blank">
            💥 Home Run List
          </a>
        </li>

        <li style="margin-bottom:10px;">
          <a href="https://www.littleleague.org/downloads/"
             target="_blank">
            ⚾ Official Little League Rulebook (LL App)
          </a>
        </li>
      </ul>
    </section>
  `;
}

// --- MESSAGES (Admin + Coaches) ---
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

  // --- Admin Tools ---
  const adminTools = isAdmin
    ? `
      <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;">Admin Tools</div>
        <button id="adminReloadBtn"
          style="width:100%;margin-bottom:6px;padding:8px;border:none;border-radius:6px;background:#0a74ff;color:white;">
          🔄 Reload schedules & scores from Google
        </button>
        <button id="adminClearMessages"
          style="width:100%;margin-bottom:6px;padding:8px;border:none;border-radius:6px;background:#c00;color:white;">
          🗑️ Clear ALL announcements
        </button>
        <button id="adminLogout"
          style="width:100%;padding:8px;border:none;border-radius:6px;background:#555;color:white;">
          Log out as Admin
        </button>
      </div>`
    : `
      <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;">Admin Login</div>
        <input id="adminPin" type="password" placeholder="Admin PIN"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <button id="adminLoginBtn"
          style="margin-top:4px;width:100%;background:#333;color:#fff;border:none;border-radius:6px;padding:8px;">
          Log In as Admin
        </button>
      </div>`;

  // --- Coach Tools ---
  const coachTools =
    loggedInCoach && loggedInCoach !== "Admin"
      ? `
      <div style="margin-top:16px;">
        <div style="font-weight:600;margin-bottom:4px;">Post Announcement as ${loggedInCoach}</div>
        <textarea id="messageInput" rows="3"
          placeholder="Type announcement..."
          style="width:100%;padding:8px;border-radius:8px;"></textarea>
        <button id="sendMessageBtn"
          style="margin-top:8px;width:100%;background:#0a74ff;color:#fff;border:none;border-radius:6px;padding:8px;">
          Post Announcement
        </button>
        <button id="coachLogoutBtn"
          style="margin-top:8px;width:100%;background:#555;color:#fff;border:none;border-radius:6px;padding:8px;">
          Log Out (${loggedInCoach})
        </button>
      </div>`
      : `
      <div style="margin-top:16px;">
        <div style="font-weight:600;margin-bottom:4px;">Coach Login</div>
        <input id="coachName" placeholder="Coach Name"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <input id="coachPin" type="password" placeholder="Coach PIN"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <button id="loginBtn"
          style="margin-top:8px;width:100%;background:#0a74ff;color:#fff;border:none;border-radius:6px;padding:8px;">
          Coach Log In
        </button>
      </div>`;

  // --- Notifications Block ---
  const notificationsBlock = `
      <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;">Notifications</div>
        <p style="font-size:0.85rem;color:#555;margin-bottom:8px;">
          Turn on notifications on this device to get important league alerts.
        </p>
        <button id="enableNotifBtn"
          style="width:100%;background:#198754;color:#fff;border:none;border-radius:6px;padding:8px;">
          Enable Notifications on this device
        </button>
      </div>`;

  // --- Final Render for Messages Page ---
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">League Messages</div>
      </div>
      <ul class="roster-list">
        ${htmlMsgs || "<li>No announcements yet.</li>"}
      </ul>
      ${adminTools}
      ${coachTools}
      ${notificationsBlock}
    </section>
  `;

  // ========== Admin Listeners ==========
  if (isAdmin) {
    const clearBtn = document.getElementById("adminClearMessages");
    const logoutBtn = document.getElementById("adminLogout");
    const reloadBtn = document.getElementById("adminReloadBtn");

    clearBtn.addEventListener("click", () => {
      if (confirm("Delete ALL announcements?")) {
        messages = [];
        saveMessages();
        renderMessages();
      }
    });

    logoutBtn.addEventListener("click", () => {
      isAdmin = false;
      if (loggedInCoach === "Admin") loggedInCoach = null;
      updateNavForAdmin();
      renderMessages();
    });

    reloadBtn.addEventListener("click", async () => {
      await reloadAllSchedules();
      alert("Schedules and scores reloaded from Google.");
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

  // ========== Coach Listeners ==========
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

  // ========== Notifications Listener ==========
  const enableBtn = document.getElementById("enableNotifBtn");
  if (enableBtn) {
    enableBtn.addEventListener("click", enableNotifications);
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
        Use the Schedule tab to report scores for Majors / AAA / AA.<br/><br/>
        You can also use the Messages tab to manage announcements and reload
        schedules/scores from Google.
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
  adminTab.style.display = isAdmin ? "inline-flex" : "none";
}

// Attach click handlers for nav buttons
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    clearActiveNav();
    btn.classList.add("active");
    const page = btn.dataset.page;

    if (page === "home") renderHome();
    else if (page === "teams") renderTeams();
    else if (page === "schedule") renderSchedule();
    else if (page === "standings") renderStandings();
    else if (page === "messages") renderMessages();
    else if (page === "resources") renderResources();
    else if (page === "admin") renderAdmin();
  });
});

// === INITIAL LOAD ===
updateNavForAdmin();
renderHome();

// Initial load from Sheets (non-blocking)
loadScoresFromGoogleSheet().catch(() => {
  console.warn(
    "Initial score load failed; will rely on local data until admin reloads."
  );
});
