/* --------------------------------------------------
   Villa Park Little League - app-v2.js (Clean B Mode)
   - Uses Google Apps Script ?type=schedule
   - Coach & Admin login
   - Score entry for Majors / AAA / AA
   - Standings computed from scores
   - Messages + Admin pages
   - No push notifications, no alert bar, no pull-to-refresh
-------------------------------------------------- */

// ========================
// CONFIG
// ========================

// TODO: Replace this with YOUR Web App URL
// Example: "https://script.google.com/macros/s/XXXXX/exec"
const API_BASE_URL = "/schedule.json";


const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];
const SCORING_DIVISIONS = ["Majors", "AAA", "AA"];

// ========================
// GLOBAL STATE
// ========================
let games = []; // All games from schedule API
let currentPage = "home";
let selectedScheduleDivision = "Majors";
let selectedStandingsDivision = "Majors";

let loggedInCoach = null;
let isAdmin = false;
const ADMIN_PIN = "0709";

// Same mapping you used before
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
  "Coach Eight": "3107"
};

// Messages stored locally on this device
let messages = JSON.parse(localStorage.getItem("vpll_messages") || "[]");

// Score overrides (local only, not sent to Sheets)
// key → { homeScore, awayScore }
let scoreOverrides = JSON.parse(
  localStorage.getItem("vpll_score_overrides") || "{}"
);

// Root element
const pageRoot = document.getElementById("page-root");

// ========================
// HELPER FUNCTIONS
// ========================
function normalizeScore(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function normalizeField(value) {
  if (value == null) return "";
  return value.toString();
}

function makeGameKey(game) {
  return [
    game.division || "",
    game.date || "",
    game.time || "",
    game.home || "",
    game.away || ""
  ]
    .map((s) => s.toString().trim())
    .join("|");
}

function saveMessages() {
  localStorage.setItem("vpll_messages", JSON.stringify(messages));
}

function saveScoreOverrides() {
  localStorage.setItem(
    "vpll_score_overrides",
    JSON.stringify(scoreOverrides)
  );
}

function applyScoreOverrides() {
  games.forEach((g) => {
    const key = g.key;
    const ov = scoreOverrides[key];
    if (ov) {
      g.homeScore = normalizeScore(ov.homeScore);
      g.awayScore = normalizeScore(ov.awayScore);
    }
  });
}

// Simple slide-up transition
function applyPageTransition() {
  pageRoot.classList.remove("page-transition");
  // force reflow
  void pageRoot.offsetWidth;
  pageRoot.classList.add("page-transition");
}

// ========================
// API LOAD
// ========================
async function loadScheduleFromApi() {
  try {
    const res = await fetch(`${API_BASE_URL}?type=schedule`, {
      method: "GET",
      mode: "cors"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    games = items.map((item) => {
      const lower = {};
      Object.keys(item || {}).forEach((k) => {
        lower[k.toLowerCase()] = item[k];
      });

      const division =
        item.division || item.Division || lower["division"] || "";
      const date = normalizeField(
        item.date || item.Date || lower["date"]
      );
      const time = normalizeField(
        item.time || item.Time || lower["time"]
      );
      const field =
        item.field || item.Field || lower["field"] || "";
      const home =
        item.home || item.Home || lower["home"] || "";
      const away =
        item.away || item.Away || lower["away"] || "";

      let homeScore =
        item["Home Score"] ||
        item.homeScore ||
        lower["home score"];
      let awayScore =
        item["Away Score"] ||
        item.awayScore ||
        lower["away score"];

      homeScore = normalizeScore(homeScore);
      awayScore = normalizeScore(awayScore);

      const game = {
        division,
        date,
        time,
        field,
        home,
        away,
        homeScore,
        awayScore
      };
      game.key = makeGameKey(game);
      return game;
    });

    applyScoreOverrides();

    // Re-render current pages if they depend on data
    if (currentPage === "schedule") renderSchedule();
    if (currentPage === "standings") renderStandings();
    if (currentPage === "home") renderHome();
  } catch (err) {
    console.error("Error loading schedule from API:", err);
  }
}

// ========================
// SCORE ENTRY
// ========================
function editScore(gameKey) {
  if (!loggedInCoach && !isAdmin) {
    alert("You must log in as a coach or admin to edit scores.");
    return;
  }

  const game = games.find((g) => g.key === gameKey);
  if (!game) return;

  if (!SCORING_DIVISIONS.includes(game.division)) {
    alert("Scores are only tracked for Majors, AAA, and AA.");
    return;
  }

  const homePrompt = prompt(
    `Enter score for ${game.home}`,
    game.homeScore != null ? game.homeScore : ""
  );
  if (homePrompt === null) return;

  const awayPrompt = prompt(
    `Enter score for ${game.away}`,
    game.awayScore != null ? game.awayScore : ""
  );
  if (awayPrompt === null) return;

  const homeScore = normalizeScore(homePrompt);
  const awayScore = normalizeScore(awayPrompt);

  game.homeScore = homeScore;
  game.awayScore = awayScore;

  // Persist locally
  scoreOverrides[game.key] = {
    homeScore: homeScore,
    awayScore: awayScore
  };
  saveScoreOverrides();

  // Update views
  if (currentPage === "schedule") renderSchedule();
  if (currentPage === "standings") renderStandings();
  if (currentPage === "home") renderHome();
}

// ========================
// HOME PAGE
// ========================
function renderHome() {
  // Simple upcoming games list (first 3 future-ish games)
  const today = new Date();
  const upcoming = games
    .slice()
    .filter((g) => {
      // best-effort: treat date as string, we won't parse actual/timezones aggressively
      return g.date; // show anything with a date
    })
    .slice(0, 3);

  let upcomingHtml = "";

  if (!upcoming.length) {
    upcomingHtml = `<p>No upcoming games loaded yet.</p>`;
  } else {
    upcomingHtml =
      `<ul class="schedule-list">` +
      upcoming
        .map(
          (g) => `
        <li>
          <span><strong>${g.date}</strong> — ${g.division}</span>
          <span>${g.time || ""}</span>
          <span>${g.home} vs ${g.away}</span>
          <span><em>Field: ${g.field || "-"}</em></span>
        </li>
      `
        )
        .join("") +
      `</ul>`;
  }

  pageRoot.innerHTML = `
    <section class="card home-card">
      <div class="home-banner">
        <img src="home_banner.jpg" alt="League Banner">
      </div>

      <div class="announcements">
        <h3>📣 Announcements</h3>
        <ul>
          <li>• Coaches Meeting for AA, AAA, Majors — December 20, 9:00am</li>
          <li>• Tryouts — January 10</li>
          <li>• Opening Day — February 28</li>
          <li>• Angels Day — April 18 vs Padres</li>
        </ul>
      </div>

      <div class="announcements">
        <h3>📅 Upcoming Games</h3>
        ${upcomingHtml}
      </div>
    </section>
  `;

  applyPageTransition();
}

// ========================
// TEAMS PAGES
// ========================
function renderTeams() {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Teams</div>
      </div>
      <ul class="roster-list">
  `;

  DIVISIONS.forEach((div) => {
    html += `
      <li onclick="renderTeamsByDivision('${div}')">
        <span>${div}</span>
        <span style="font-weight:700; color:#d32f2f;">View</span>
      </li>
    `;
  });

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
}

function renderTeamsByDivision(div) {
  const teamSet = new Set();
  games.forEach((g) => {
    if (g.division === div) {
      if (g.home) teamSet.add(g.home);
      if (g.away) teamSet.add(g.away);
    }
  });

  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">${div}</div>
      </div>
      <ul class="roster-list">
  `;

  [...teamSet].forEach((t) => {
    html += `
      <li onclick="renderTeamSchedule('${div}','${t}')">
        <span>${t}</span>
        <span style="font-weight:700; color:#d32f2f;">Schedule</span>
      </li>
    `;
  });

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
}

function renderTeamSchedule(div, team) {
  const teamGames = games.filter(
    (g) => g.division === div && (g.home === team || g.away === team)
  );

  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">${team}</div>
        <div class="card-subtitle">${div}</div>
      </div>
      <ul class="schedule-list">
  `;

  teamGames.forEach((g) => {
    const showScores = SCORING_DIVISIONS.includes(g.division);
    let scoreText = "";

    if (showScores) {
      if (g.homeScore == null && g.awayScore == null) {
        scoreText = "No score yet";
      } else {
        scoreText = `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`;
      }
    }

    html += `
      <li>
        <span><strong>${g.date}</strong></span>
        <span>${g.time}</span>
        <span><em>Field: ${g.field || "-"}</em></span>
        <span>${g.home} vs ${g.away}</span>
        <span>${scoreText}</span>
      </li>
    `;
  });

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
}

// ========================
// SCHEDULE PAGE
// ========================
function renderSchedule() {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Schedule</div>
      </div>

      <div style="padding:16px;">
        <label>
          <strong>Division:</strong>
          <select onchange="selectedScheduleDivision=this.value;renderSchedule()">
            ${DIVISIONS.map(
              (d) =>
                `<option value="${d}" ${
                  d === selectedScheduleDivision ? "selected" : ""
                }>${d}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <ul class="schedule-list">
  `;

  const filtered = games.filter(
    (g) => g.division === selectedScheduleDivision
  );

  if (!filtered.length) {
    html += `
      <li>
        <span>No games loaded for this division yet.</span>
      </li>
    `;
  } else {
    filtered.forEach((g) => {
      const showScores = SCORING_DIVISIONS.includes(g.division);
      let scoreText = "";

      if (showScores) {
        if (g.homeScore == null && g.awayScore == null) {
          scoreText = "No score yet";
        } else {
          scoreText = `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`;
        }
      }

      const canEdit = showScores && (loggedInCoach || isAdmin);

      html += `
        <li>
          <span><strong>${g.date}</strong> — ${g.division}</span>
          <span>${g.time}</span>
          <span><em>Field: ${g.field || "-"}</em></span>
          <span>${g.home} vs ${g.away}</span>
          <span>${scoreText}</span>
          ${
            canEdit
              ? `<button style="margin-top:6px;" onclick="editScore('${g.key}')">
                   Edit Score
                 </button>`
              : ""
          }
        </li>
      `;
    });
  }

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
}

// ========================
// STANDINGS PAGE
// ========================
function computeStandings(div) {
  const table = {};

  games
    .filter((g) => g.division === div)
    .forEach((g) => {
      if (!table[g.home]) table[g.home] = { team: g.home, wins: 0, losses: 0 };
      if (!table[g.away]) table[g.away] = { team: g.away, wins: 0, losses: 0 };

      if (g.homeScore != null && g.awayScore != null) {
        if (g.homeScore > g.awayScore) {
          table[g.home].wins++;
          table[g.away].losses++;
        } else if (g.awayScore > g.homeScore) {
          table[g.away].wins++;
          table[g.home].losses++;
        }
      }
    });

  return Object.values(table).sort((a, b) => b.wins - a.wins);
}

function renderStandings() {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Standings</div>
      </div>

      <div style="padding:16px;">
        <label>
          <strong>Division:</strong>
          <select onchange="selectedStandingsDivision=this.value;renderStandings()">
            ${SCORING_DIVISIONS.map(
              (d) =>
                `<option value="${d}" ${
                  d === selectedStandingsDivision ? "selected" : ""
                }>${d}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <ul class="standings-list">
  `;

  const standings = computeStandings(selectedStandingsDivision);

  if (!standings.length) {
    html += `
      <li>
        <span>No standings yet for this division.</span>
      </li>
    `;
  } else {
    standings.forEach((s) => {
      html += `
        <li>
          <span>${s.team}</span>
          <span class="record">${s.wins} - ${s.losses}</span>
        </li>
      `;
    });
  }

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
}

// ========================
// MESSAGES PAGE
// ========================
function renderMessages() {
  const isLoggedIn = !!loggedInCoach;

  let msgHtml =
    messages.length === 0
      ? "<p>No messages yet.</p>"
      : messages
          .map(
            (m) =>
              `<p><strong>${m.coach}:</strong> ${m.text}</p>`
          )
          .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Messages</div>
      </div>

      <div style="padding:16px;">
        ${msgHtml}
      </div>

      <div style="padding:16px; border-top:1px solid #eee;">
        <div style="margin-bottom:8px;">
          ${
            isLoggedIn
              ? `<p>Logged in as <strong>${loggedInCoach}</strong>
                   ${isAdmin ? "(Admin)" : ""}</p>
                 <button onclick="logoutCoach()">Logout</button>`
              : `
                 <label><strong>Coach Login:</strong></label><br>
                 <input id="coach-name" placeholder="Coach Name"><br>
                 <input id="coach-pin" placeholder="PIN" type="password"><br>
                 <button style="margin-top:6px;" onclick="loginCoach()">Login</button>
                `
          }
        </div>

        ${
          isLoggedIn
            ? `
          <div style="margin-top:12px;">
            <textarea id="msg-input" placeholder="Enter a message" style="width:100%; min-height:60px;"></textarea>
            <button style="margin-top:6px;" onclick="postMessage()">
              Post Message
            </button>
          </div>
          `
            : ""
        }
      </div>
    </section>
  `;

  applyPageTransition();
}

function loginCoach() {
  const nameInput = document.getElementById("coach-name");
  const pinInput = document.getElementById("coach-pin");
  if (!nameInput || !pinInput) return;

  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();

  if (name === "Admin" && pin === ADMIN_PIN) {
    loggedInCoach = "Admin";
    isAdmin = true;
    alert("Admin logged in.");
    renderMessages();
    return;
  }

  if (!coachPins[name]) {
    alert("Unknown coach name.");
    return;
  }

  if (coachPins[name] !== pin) {
    alert("Incorrect PIN.");
    return;
  }

  loggedInCoach = name;
  isAdmin = false;
  alert("Coach logged in.");
  renderMessages();
}

function logoutCoach() {
  loggedInCoach = null;
  isAdmin = false;
  renderMessages();
}

function postMessage() {
  if (!loggedInCoach) {
    alert("You must log in first.");
    return;
  }

  const textarea = document.getElementById("msg-input");
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) return;

  messages.push({
    coach: loggedInCoach,
    text
  });
  saveMessages();
  textarea.value = "";
  renderMessages();
}

// ========================
// RESOURCES PAGE
// ========================
function renderResources() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Resources</div>
      </div>

      <ul class="roster-list">
        <li>
          <a href="https://docs.google.com/document/d/1QVtREnvJb_VN_ZkGh5guW5PJI_5uck6K7VjVaKEBSaY/edit?tab=t.0" target="_blank">
            <span>⚙️ Local League Rules</span>
          </a>
        </li>
        <li>
          <a href="https://docs.google.com/document/d/11CShzXZavE77uNQQou8dqn4bUINXCe4vOtgeT8RBq6E/edit?tab=t.0" target="_blank">
            <span>💥⚾️ Home Run Club</span>
          </a>
        </li>
        <li>
          <a href="https://docs.google.com/document/d/1xh7XvoNy2jounkVr0zCBJ3OnsJv-nUvwGG_cBv9PYkc/edit?tab=t.0" target="_blank">
            <span>🙋‍♂️ Volunteer List</span>
          </a>
        </li>
        <li>
          <a href="https://www.littleleague.org/playing-rules/rulebook/" target="_blank">
            <span>🧾 Little League Rulebook</span>
          </a>
        </li>
        <li>
          <a href="https://docs.google.com/document/d/1rq50ps-dPw4Bz2QV6DgVM1bSuSJu1tuf/edit" target="_blank">
            <span>🧢 AA Special Rules</span>
          </a>
        </li>
      </ul>
    </section>
  `;

  applyPageTransition();
}

// ========================
// ADMIN PAGE
// ========================
function renderAdmin() {
  if (!isAdmin) {
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Admin</div>
        </div>
        <p style="padding:16px;">
          Admin access only. Log in as "Admin" on the Messages tab using the admin PIN.
        </p>
      </section>
    `;
    applyPageTransition();
    return;
  }

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Admin Tools</div>
      </div>
      <div style="padding:16px;">
        <p>
          • Use the Schedule tab to edit scores for Majors / AAA / AA.<br>
          • Use the Messages tab to broadcast league updates.
        </p>
        <p style="margin-top:8px; font-size:0.9rem; color:#555;">
          Note: Score changes are currently stored on this device only
          (not yet written back to Google Sheets).
        </p>
      </div>
    </section>
  `;

  applyPageTransition();
}

// ========================
// MORE PAGE
// ========================
function renderMore() {
  const isCoach = !!loggedInCoach && !isAdmin;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">More</div>
      </div>

      <ul class="roster-list">
        <li>
          <button style="width:100%; padding:8px;" onclick="renderTeams()">Teams</button>
        </li>
        <li>
          <button style="width:100%; padding:8px;" onclick="renderMessages()">Messages</button>
        </li>
        <li>
          <button style="width:100%; padding:8px;" onclick="renderResources()">Resources</button>
        </li>
        ${
          isAdmin
            ? `
        <li>
          <button style="width:100%; padding:8px;" onclick="renderAdmin()">Admin</button>
        </li>
        `
            : ""
        }
      </ul>
    </section>
  `;

  applyPageTransition();
}

// ========================
// NAVIGATION
// ========================
function setActiveNav(page) {
  const buttons = document.querySelectorAll("#bottomNav .nav-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
}

function renderPage(page) {
  currentPage = page;
  if (page === "home") renderHome();
  else if (page === "schedule") renderSchedule();
  else if (page === "standings") renderStandings();
  else if (page === "more") renderMore();
}

function setupNav() {
  const buttons = document.querySelectorAll("#bottomNav .nav-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      setActiveNav(page);
      renderPage(page);
    });
  });

  setActiveNav("home");
}

// ========================
// INIT
// ========================
function initApp() {
  setupNav();
  renderHome();
  loadScheduleFromApi();
}

// Because script is loaded with "defer", DOM is ready here
initApp();

/* --------------------------------------------------
   END OF FILE
-------------------------------------------------- */
