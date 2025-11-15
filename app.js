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
const DIVISIONS = ["Majors", "AAA", "AA"];

// Give every game a stable index for DOM ids
function recomputeGameIndices() {
  games.forEach((g, i) => {
    g._idx = i;
  });
}
recomputeGameIndices();

// === GOOGLE SHEET CONFIG ===

// CSV links for schedule (already working before)
const CSV_LINKS = {
  AAA: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1857914653&single=true&output=csv",
  Majors:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1006784456&single=true&output=csv",
};

// Apps Script Web App URL (for scores)
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycby4sGBxN0sMlGT398mM3CGjQXKCIjL2C2eRxAQJohc7Gz1kah8zCnlv_dTkxYvtyddR/exec";

// === COACH LOGIN ===
let loggedInCoach = null;
const coachPins = {
  "Coach Johnson": "1111",
  "Coach Lee": "2222",
  "Coach Brown": "3333",
  "Coach Smith": "4444",
  "Coach Davis": "5555",
  "Coach Wilson": "6666",
};

// === ADMIN LOGIN ===
let isAdmin = false;
const ADMIN_PIN = "0709";

// === MESSAGES (stored locally) ===
let messages = JSON.parse(localStorage.getItem("messages") || "[]");
function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

// === UTIL: SAVE GAMES LOCALLY ===
function saveGames() {
  localStorage.setItem("games", JSON.stringify(games));
}

// ---------------------------------------------------------
// === LOAD SCHEDULE FROM GOOGLE SHEET CSV (per division) ===
// ---------------------------------------------------------
async function loadScheduleFromSheet(divisionName) {
  try {
    const url = CSV_LINKS[divisionName];
    if (!url) return;

    const response = await fetch(url);
    const csv = await response.text();

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return;

    const header = lines[0].split(",");
    const dateIdx = header.indexOf("Date");
    const timeIdx = header.indexOf("Time");
    const fieldIdx = header.indexOf("Field");
    const homeIdx = header.indexOf("Home");
    const awayIdx = header.indexOf("Away");

    const newGames = lines.slice(1).map((line) => {
      const cols = line.split(",");
      return {
        division: divisionName,
        date: cols[dateIdx] || "",
        time: cols[timeIdx] || "",
        field: cols[fieldIdx] || "",
        home: cols[homeIdx] || "",
        away: cols[awayIdx] || "",
        homeScore: null,
        awayScore: null,
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

// Load all divisions once (used by Admin button)
async function reloadAllSchedules() {
  for (const div of DIVISIONS) {
    await loadScheduleFromSheet(div);
  }
  await loadScoresFromGoogleSheet(); // pull any saved scores
  renderSchedule();
  renderStandings();
}

// ---------------------------------------------------------
// === LOAD SCORES FROM GOOGLE APPS SCRIPT WEB APP ===
// ---------------------------------------------------------
async function loadScoresFromGoogleSheet() {
  try {
    const response = await fetch(SHEET_API_URL);
    const data = await response.json();

    // Expecting: { games: [ { division, date, time, field, home, away, homeScore, awayScore }, ... ] }
    if (!data || !Array.isArray(data.games)) {
      console.warn("Unexpected data from Sheet API:", data);
      return;
    }

    // Replace our games with what comes from the sheet
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

function clearActiveNav() {
  navButtons.forEach((btn) => btn.classList.remove("active"));
}

// --- HOME ---
function renderHome() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Welcome</div>
      </div>
      <p style="padding:16px;">Select a tab to get started!</p>
    </section>
  `;
}

// --- TEAMS (simple placeholder for now) ---
function renderTeams() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Teams</div>
      </div>
      <p style="padding:16px;">Team information can go here.</p>
    </section>
  `;
}

// --- SCHEDULE + SCORE ENTRY ---
function renderSchedule() {
  const divisions = DIVISIONS;
  const filteredGames = games.filter((g) => g.division === selectedDivision);

  const items =
    filteredGames
      .map(
        (g) => `
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
          loggedInCoach
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
    `
      )
      .join("") || "<li>No scheduled games.</li>";

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Schedule</div>
        <select id="divisionSelect" style="padding:4px 8px;border-radius:6px;">
          ${divisions
            .map(
              (d) =>
                `<option value="${d}" ${
                  d === selectedDivision ? "selected" : ""
                }>${d}</option>`
            )
            .join("")}
        </select>
      </div>
      <ul class="schedule-list">
        ${items}
      </ul>
    </section>
  `;

  const sel = document.getElementById("divisionSelect");
  sel.addEventListener("change", (e) => {
    selectedDivision = e.target.value;
    renderSchedule();
  });
}

// --- STANDINGS ---
function renderStandings() {
  const standings = calculateStandings(selectedDivision);

  const rows =
    standings
      .map(
        (row, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${row.team}</td>
        <td>${row.w}</td>
        <td>${row.l}</td>
      </tr>
    `
      )
      .join("") || `<tr><td colspan="4">No games with scores yet.</td></tr>`;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Standings</div>
        <select id="standingsDivisionSelect" style="padding:4px 8px;border-radius:6px;">
          ${DIVISIONS.map(
            (d) =>
              `<option value="${d}" ${
                d === selectedDivision ? "selected" : ""
              }>${d}</option>`
          ).join("")}
        </select>
      </div>
      <div style="overflow-x:auto;">
        <table class="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document
    .getElementById("standingsDivisionSelect")
    .addEventListener("change", (e) => {
      selectedDivision = e.target.value;
      renderStandings();
    });
}

// --- MESSAGES (coach + admin tools) ---
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

  // Admin panel vs Admin login
  const adminTools = isAdmin
    ? `
      <div style="margin-top:16px;padding:12px;border:2px solid red;border-radius:8px;">
        <div style="font-weight:700;color:red;margin-bottom:4px;">Admin Panel</div>
        <button id="adminClearMessages"
          style="width:100%;padding:8px;margin-bottom:8px;background:#c00;color:#fff;border:none;border-radius:6px;">
          Clear ALL announcements
        </button>
        <button id="adminReloadSchedules"
          style="width:100%;padding:8px;margin-bottom:8px;background:#0a74ff;color:#fff;border:none;border-radius:6px;">
          Reload schedules & scores from Google Sheets
        </button>
        <button id="adminLogout"
          style="width:100%;padding:8px;background:#555;color:#fff;border:none;border-radius:6px;">
          Log Out (Admin)
        </button>
      </div>
    `
    : `
      <div style="margin-top:16px;">
        <input id="adminPin" type="password" placeholder="Admin PIN"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <button id="adminLogin"
          style="width:100%;padding:8px;background:#c00;color:#fff;border:none;border-radius:8px;">
          Log In as Admin
        </button>
      </div>
    `;

  // Coach tools (login vs post)
  const coachTools = loggedInCoach
    ? `
      <div style="margin-top:16px;">
        <textarea id="messageInput" rows="3"
          placeholder="Type announcement..."
          style="width:100%;padding:8px;border-radius:8px;"></textarea>
        <button id="sendMessageBtn"
          style="margin-top:8px;width:100%;padding:8px;border:none;border-radius:8px;background:#c00;color:#fff;">
          Post as ${loggedInCoach}
        </button>
        <button id="logoutBtn"
          style="margin-top:8px;width:100%;padding:8px;border:none;border-radius:8px;background:#555;color:#fff;">
          Log Out (Coach)
        </button>
      </div>
    `
    : `
      <div style="margin-top:16px;">
        <input id="coachName" placeholder="Coach Name"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <input id="coachPin" type="password" placeholder="PIN"
          style="width:100%;padding:8px;border-radius:8px;" />
        <button id="loginBtn"
          style="margin-top:8px;width:100%;padding:8px;border:none;border-radius:8px;background:#c00;color:#fff;">
          Log In
        </button>
      </div>
    `;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">League Messages</div>
      </div>
      <ul class="roster-list">
        ${htmlMsgs || "<li>No messages yet.</li>"}
      </ul>
      ${coachTools}
      <hr style="margin:16px 0;opacity:0.3;">
      ${adminTools}
    </section>
  `;

  // --- Admin actions ---
  if (!isAdmin) {
    const adminLoginBtn = document.getElementById("adminLogin");
    if (adminLoginBtn) {
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
  } else {
    document
      .getElementById("adminClearMessages")
      .addEventListener("click", () => {
        if (confirm("Delete ALL announcements?")) {
          messages = [];
          saveMessages();
          renderMessages();
        }
      });

    document
      .getElementById("adminReloadSchedules")
      .addEventListener("click", async () => {
        await reloadAllSchedules();
        alert("Schedules & scores reloaded.");
      });

    document.getElementById("adminLogout").addEventListener("click", () => {
      isAdmin = false;
      if (loggedInCoach === "Admin") loggedInCoach = null;
      updateNavForAdmin();
      renderMessages();
    });
  }

  // --- Coach actions ---
  if (!loggedInCoach || loggedInCoach === "Admin") {
    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) {
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
  } else {
    document.getElementById("logoutBtn").addEventListener("click", () => {
      loggedInCoach = null;
      renderMessages();
    });

    document
      .getElementById("sendMessageBtn")
      .addEventListener("click", () => {
        const input = document.getElementById("messageInput");
        const text = input.value.trim();
        if (!text) return;

        const now = new Date().toLocaleString();
        messages.unshift({ author: loggedInCoach, text, time: now });
        saveMessages();
        input.value = "";
        renderMessages();
      });
  }
}

// --- ADMIN TAB CONTENT ---
function renderAdminTools() {
  if (!isAdmin) {
    alert("Admin access only.");
    renderHome();
    return;
  }

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Admin Tools</div>
      </div>
      <div style="padding:16px;">
        <button id="adminReloadBtn"
          style="width:100%;padding:8px;margin-bottom:8px;border:none;border-radius:8px;background:#0a74ff;color:#fff;">
          Reload schedules & scores from Google Sheets
        </button>
        <button id="adminBackToMessages"
          style="width:100%;padding:8px;border:none;border-radius:8px;background:#555;color:#fff;">
          Back to Messages
        </button>
      </div>
    </section>
  `;

  document
    .getElementById("adminReloadBtn")
    .addEventListener("click", async () => {
      await reloadAllSchedules();
      alert("Schedules & scores reloaded.");
    });

  document
    .getElementById("adminBackToMessages")
    .addEventListener("click", () => {
      clearActiveNav();
      document
        .querySelector('.nav-btn[data-page="messages"]')
        .classList.add("active");
      renderMessages();
    });
}

// ---------------------------------------------------------
// === NAVIGATION SETUP ===
// ---------------------------------------------------------
function updateNavForAdmin() {
  const adminTab = document.getElementById("adminTab");
  if (!adminTab) return;
  adminTab.style.display = isAdmin ? "flex" : "none";
}

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
    else if (page === "admin") renderAdminTools();
  });
});

// ---------------------------------------------------------
// === INITIAL PAGE LOAD ===
// ---------------------------------------------------------
updateNavForAdmin(); // hide admin tab initially if not admin
renderHome();

// Try to load scores from Sheet on first load (does not block UI)
loadScoresFromGoogleSheet()
  .then(() => {
    // If there were no games, load CSV schedules (first-time setup)
    if (games.length === 0) {
      return reloadAllSchedules();
    } else {
      renderSchedule();
      renderStandings();
    }
  })
  .catch(() => {
    // If Sheet fails but we have games in localStorage, just render
    if (games.length > 0) {
      renderSchedule();
      renderStandings();
    }
  });
