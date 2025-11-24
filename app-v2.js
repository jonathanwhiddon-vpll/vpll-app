/* --------------------------------------------------
   Villa Park Little League - app-v2.js (CSV Version)
   - Loads schedule from Google Sheets CSV
   - Coach & Admin login
   - Score entry for Majors / AAA / AA
   - Standings computed from scores
   - Messages + Admin pages
   - No push notifications, no alert bar
-------------------------------------------------- */

// ========================
// CONFIG
// ========================

// This no longer matters since we're using CSV
const API_BASE_URL = "/schedule.json";

const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];
const SCORING_DIVISIONS = ["Majors", "AAA", "AA"];

// ========================
// GLOBAL STATE
// ========================
let games = [];
let currentPage = "home";
let selectedScheduleDivision = "Majors";
let selectedStandingsDivision = "Majors";

let loggedInCoach = null;
let isAdmin = false;
const ADMIN_PIN = "0709";

// INITIAL standings layout
const INITIAL_STANDINGS = {
  "Majors": ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6"],
  "AAA": ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6", "Team 7", "Team 8"],
  "AA": ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6", "Team 7", "Team 8"]
};

// Coach pins
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

let messages = JSON.parse(localStorage.getItem("vpll_messages") || "[]");
let scoreOverrides = JSON.parse(localStorage.getItem("vpll_score_overrides") || "{}");

const pageRoot = document.getElementById("page-root");

// ========================
// HELPERS
// ========================
function normalizeScore(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function normalizeField(value) {
  return value == null ? "" : value.toString();
}

function makeGameKey(game) {
  return [
    game.division, game.date, game.time, game.home, game.away
  ].map(s => s.toString().trim()).join("|");
}

function saveMessages() {
  localStorage.setItem("vpll_messages", JSON.stringify(messages));
}

function saveScoreOverrides() {
  localStorage.setItem("vpll_score_overrides", JSON.stringify(scoreOverrides));
}

function applyScoreOverrides() {
  games.forEach(g => {
    const ov = scoreOverrides[g.key];
    if (ov) {
      g.homeScore = normalizeScore(ov.homeScore);
      g.awayScore = normalizeScore(ov.awayScore);
    }
  });
}

function applyPageTransition() {
  pageRoot.classList.remove("page-transition");
  void pageRoot.offsetWidth;
  pageRoot.classList.add("page-transition");
}

// ========================
// LOAD SCHEDULE FROM CSV
// ========================
async function loadScheduleFromApi() {
  try {
    const SCHEDULE_CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?output=csv";

    const response = await fetch(SCHEDULE_CSV_URL, { cache: "no-cache" });
    const csvText = await response.text();

    const rows = Papa.parse(csvText, { header: true }).data;

    const allGames = rows.map(item => {
      const division = item.division || item.Division || "";
      const date = item.date || item.Date || "";
      const time = item.time || item.Time || "";
      const field = item.field || item.Field || "";
      const home = item.home || item.Home || "";
      const away = item.away || item.Away || "";

      const homeScore = normalizeScore(
        item.homeScore || item.HomeScore || item["Home Score"]
      );
      const awayScore = normalizeScore(
        item.awayScore || item.AwayScore || item["Away Score"]
      );

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

    games = allGames;
    applyScoreOverrides();

    if (currentPage === "schedule") renderSchedule();
    if (currentPage === "standings") renderStandings();
    if (currentPage === "home") renderHome();
  } catch (err) {
    console.error("Error loading schedule CSV:", err);
  }
}

// ========================
// SCORE ENTRY
// ========================
function editScore(gameKey) {
  if (!loggedInCoach && !isAdmin) return alert("Log in first.");

  const game = games.find(g => g.key === gameKey);
  if (!game) return;

  if (!SCORING_DIVISIONS.includes(game.division))
    return alert("Scores only for Majors/AAA/AA.");

  const homeInput = prompt(`Score for ${game.home}`, game.homeScore ?? "");
  if (homeInput === null) return;

  const awayInput = prompt(`Score for ${game.away}`, game.awayScore ?? "");
  if (awayInput === null) return;

  game.homeScore = normalizeScore(homeInput);
  game.awayScore = normalizeScore(awayInput);

  scoreOverrides[game.key] = {
    homeScore: game.homeScore,
    awayScore: game.awayScore
  };
  saveScoreOverrides();

  if (currentPage === "schedule") renderSchedule();
  if (currentPage === "standings") renderStandings();
  if (currentPage === "home") renderHome();
}

// ========================
// HOME PAGE
// ========================
function renderHome() {
  const upcoming = games.slice(0, 3);

  let html = "";

  if (!upcoming.length) {
    html = "<p>No upcoming games.</p>";
  } else {
    html =
      `<ul class="schedule-list">` +
      upcoming
        .map(
          g => `
        <li>
          <span><strong>${g.date}</strong> — ${g.division}</span>
          <span>${g.time}</span>
          <span>${g.home} vs ${g.away}</span>
          <span><em>Field: ${g.field}</em></span>
        </li>`
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
          <li>Coaches Meeting — Dec 20</li>
          <li>Tryouts — Jan 10</li>
          <li>Opening Day — Feb 28</li>
          <li>Angels Day — Apr 18</li>
        </ul>
      </div>

      <div class="announcements">
        <h3>📅 Upcoming Games</h3>
        ${html}
      </div>
    </section>
  `;

  applyPageTransition();
}

// ========================
// TEAMS
// ========================
function renderTeams() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Teams</div></div>
      <ul class="roster-list">
        ${DIVISIONS.map(
          d => `
          <li onclick="renderTeamsByDivision('${d}')">
            <span>${d}</span>
            <span style="font-weight:700; color:#d32f2f;">View</span>
          </li>`
        ).join("")}
      </ul>
    </section>
  `;

  applyPageTransition();
}

function renderTeamsByDivision(div) {
  const teamSet = new Set();
  games.forEach(g => {
    if (g.division === div) {
      if (g.home) teamSet.add(g.home);
      if (g.away) teamSet.add(g.away);
    }
  });

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">${div}</div></div>
      <ul class="roster-list">
        ${[...teamSet]
          .map(
            t => `
            <li onclick="renderTeamSchedule('${div}','${t}')">
              <span>${t}</span>
              <span style="font-weight:700; color:#d32f2f;">Schedule</span>
            </li>
          `
          )
          .join("")}
      </ul>
    </section>
  `;
  applyPageTransition();
}

function renderTeamSchedule(div, team) {
  const entries = games.filter(
    g => g.division === div && (g.home === team || g.away === team)
  );

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">${team}</div>
        <div class="card-subtitle">${div}</div>
      </div>

      <ul class="schedule-list">
        ${entries
          .map(g => {
            const score =
              g.homeScore == null && g.awayScore == null
                ? "No score yet"
                : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`;

            return `
          <li>
            <span><strong>${g.date}</strong></span>
            <span>${g.time}</span>
            <span><em>Field: ${g.field}</em></span>
            <span>${g.home} vs ${g.away}</span>
            <span>${score}</span>
          </li>`;
          })
          .join("")}
      </ul>
    </section>
  `;
  applyPageTransition();
}

// ========================
// SCHEDULE PAGE
// ========================
function renderSchedule() {
  const list = games.filter(g => g.division === selectedScheduleDivision);

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Schedule</div></div>

      <div style="padding:16px;">
        <label><strong>Division:</strong>
          <select onchange="selectedScheduleDivision=this.value; renderSchedule()">
            ${DIVISIONS.map(
              d =>
                `<option value="${d}" ${
                  d === selectedScheduleDivision ? "selected" : ""
                }>${d}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <ul class="schedule-list">
        ${
          !list.length
            ? `<li><span>No games loaded.</span></li>`
            : list
                .map(g => {
                  const canEdit =
                    SCORING_DIVISIONS.includes(g.division) &&
                    (loggedInCoach || isAdmin);

                  const score =
                    g.homeScore == null && g.awayScore == null
                      ? "No score yet"
                      : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`;

                  return `
              <li>
                <span><strong>${g.date}</strong> — ${g.division}</span>
                <span>${g.time}</span>
                <span><em>Field: ${g.field}</em></span>
                <span>${g.home} vs ${g.away}</span>
                <span>${score}</span>
                ${
                  canEdit
                    ? `<button onclick="editScore('${g.key}')">Edit Score</button>`
                    : ""
                }
              </li>`;
                })
                .join("")
        }
      </ul>
    </section>
  `;
  applyPageTransition();
}

// ========================
// STANDINGS
// ========================
function computeStandings(div) {
  const table = {};

  if (INITIAL_STANDINGS[div]) {
    INITIAL_STANDINGS[div].forEach(t => {
      table[t] = { team: t, wins: 0, losses: 0 };
    });
  }

  games
    .filter(g => g.division === div)
    .forEach(g => {
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
  const standings = computeStandings(selectedStandingsDivision);

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Standings</div></div>

      <div style="padding:16px;">
        <label><strong>Division:</strong>
          <select onchange="selectedStandingsDivision=this.value; renderStandings()">
            ${SCORING_DIVISIONS.map(
              d =>
                `<option value="${d}" ${
                  d === selectedStandingsDivision ? "selected" : ""
                }>${d}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <ul class="standings-list">
        ${
          !standings.length
            ? `<li>No standings yet.</li>`
            : standings
                .map(
                  s => `
            <li>
              <span>${s.team}</span>
              <span class="record">${s.wins} - ${s.losses}</span>
            </li>`
                )
                .join("")
        }
      </ul>
    </section>
  `;
  applyPageTransition();
}

// ========================
// MESSAGES
// ========================
function renderMessages() {
  const isLoggedIn = !!loggedInCoach;

  const messageHtml =
    messages.length === 0
      ? "<p>No messages yet.</p>"
      : messages
          .map(m => `<p><strong>${m.coach}:</strong> ${m.text}</p>`)
          .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Messages</div></div>
      <div style="padding:16px;">${messageHtml}</div>

      <div style="padding:16px; border-top:1px solid #eee;">
        ${
          isLoggedIn
            ? `
            <p>Logged in as <strong>${loggedInCoach}</strong> ${
                isAdmin ? "(Admin)" : ""
              }</p>
            <button onclick="logoutCoach()">Logout</button>
          `
            : `
            <label><strong>Coach Login:</strong></label><br>
            <input id="coach-name" placeholder="Coach Name"><br>
            <input id="coach-pin" placeholder="PIN" type="password"><br>
            <button onclick="loginCoach()">Login</button>
          `
        }

        ${
          isLoggedIn
            ? `
            <textarea id="msg-input" placeholder="Enter a message" style="width:100%; min-height:60px;"></textarea>
            <button onclick="postMessage()">Post Message</button>
          `
            : ""
        }
      </div>
    </section>
  `;
  applyPageTransition();
}

function loginCoach() {
  const name = document.getElementById("coach-name").value.trim();
  const pin = document.getElementById("coach-pin").value.trim();

  if (name === "Admin" && pin === ADMIN_PIN) {
    loggedInCoach = "Admin";
    isAdmin = true;
    return renderMessages();
  }

  if (!coachPins[name]) return alert("Unknown coach.");
  if (coachPins[name] !== pin) return alert("Incorrect PIN.");

  loggedInCoach = name;
  isAdmin = false;
  renderMessages();
}

function logoutCoach() {
  loggedInCoach = null;
  isAdmin = false;
  renderMessages();
}

function postMessage() {
  if (!loggedInCoach) return alert("Log in first.");

  const textarea = document.getElementById("msg-input");
  const text = textarea.value.trim();
  if (!text) return;

  messages.push({ coach: loggedInCoach, text });
  saveMessages();
  textarea.value = "";

  renderMessages();
}

// ========================
// RESOURCES
// ========================
function renderResources() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Resources</div></div>

      <ul class="roster-list">
        <li><a href="https://docs.google.com/document/d/1QVtREnvJb_VN_ZkGh5guW5PJI_5uck6K7VjVaKEBSaY/edit?tab=t.0" target="_blank">⚙️ Local League Rules</a></li>
        <li><a href="https://docs.google.com/document/d/11CShzXZavE77uNQQou8dqn4bUINXCe4vOtgeT8RBq6E/edit?tab=t.0" target="_blank">💥 Home Run Club</a></li>
        <li><a href="https://docs.google.com/document/d/1xh7XvoNy2jounkVr0zCBJ3OnsJv-nUvwGG_cBv9PYkc/edit?tab=t.0" target="_blank">🙋‍♂️ Volunteer List</a></li>
        <li><a href="https://www.littleleague.org/playing-rules/rulebook/" target="_blank">🧾 Rulebook</a></li>
        <li><a href="https://docs.google.com/document/d/1rq50ps-dPw4Bz2QV6DgVM1bSuSJu1tuf/edit" target="_blank">🧢 AA Special Rules</a></li>
      </ul>
    </section>
  `;
  applyPageTransition();
}

// ========================
// ADMIN
// ========================
function renderAdmin() {
  if (!isAdmin) {
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header"><div class="card-title">Admin</div></div>
        <p style="padding:16px;">Admin only. Log in as Admin on Messages tab.</p>
      </section>
    `;
    return applyPageTransition();
  }

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Admin Tools</div></div>
      <p style="padding:16px;">
        • Edit scores from the Schedule tab.<br>
        • Send announcements from the Messages tab.
      </p>
      <p style="padding:16px; font-size:0.9rem; color:#555;">
        Scores are stored locally on this device (not synced yet).
      </p>
    </section>
  `;
  applyPageTransition();
}

// ========================
// MORE
// ========================
function renderMore() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">More</div></div>

      <ul class="roster-list">
        <li><button onclick="renderTeams()">Teams</button></li>
        <li><button onclick="renderMessages()">Messages</button></li>
        <li><button onclick="renderResources()">Resources</button></li>
        ${isAdmin ? `<li><button onclick="renderAdmin()">Admin</button></li>` : ""}
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
  buttons.forEach(btn => {
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
  buttons.forEach(btn => {
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

initApp();

/* --------------------------------------------------
   END OF FILE
-------------------------------------------------- */
