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
function showSpinner() {
  document.getElementById("loadingSpinner").style.display = "flex";
}

function hideSpinner() {
  document.getElementById("loadingSpinner").style.display = "none";
}

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
  "Majors": ["Team Hanna", "Team Cole", "Team 3", "Team 4", "Team 5", "Team 6"],
  "AAA": ["Team Cairney", "Team 2", "Team 3", "Team Whiddon", "Team 5", "Team 6", "Team 7", "Team 8"],
  "AA": ["Team Scott", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6", "Team 7", "Team 8"]
};

// Division-level login (simple)
const coachPins = {
    "Majors": "1111",
    "AAA": "2222",
    "AA": "3333"
};

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
// CSV links for each division
// ===========================
// LOAD SCHEDULE FROM MULTIPLE DIVISION CSVs
// ===========================
const CSV_URLS = {
    "Majors": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=0&single=true&output=csv",
    "AAA": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1857914653&single=true&output=csv",
    "AA": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1006784456&single=true&output=csv",
    "Single A": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1852143804&single=true&output=csv",
    "Coach Pitch": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=359750423&single=true&output=csv",
    "T-Ball": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=860483387&single=true&output=csv"
};

async function loadScheduleFromApi() {
    showSpinner();
    try {
        let combined = [];


        for (const div in CSV_URLS) {
            const url = CSV_URLS[div];

            const response = await fetch(url, { cache: "no-cache" });
            const csvText = await response.text();

            const rows = Papa.parse(csvText, { header: true }).data;

            const parsed = rows.map(item => {
                const division = div;

                const date = item.date || item.Date || "";
                const time = item.time || item.Time || "";
                const field = item.field || item.Field || "";
                const home = item.home || item.Home || "";
                const away = item.away || item.Away || "";

                const homeScore = normalizeScore(item["home score"] || item["Home Score"]);
                const awayScore = normalizeScore(item["away score"] || item["Away Score"]);

                const game = {
                    division,
                    date,
                    time,
                    field,
                    home,
                    away,
                    homeScore,
                    awayScore,
                };

                game.key = makeGameKey(game);
                return game;
            });

            combined = combined.concat(parsed);
        }

        games = combined;
        applyScoreOverrides();
hideSpinner();

        if (currentPage === "schedule") renderSchedule();
        if (currentPage === "standings") renderStandings();
        if (currentPage === "home") renderHome();

    } catch (err) {
        console.error("Error loading schedule CSV:", err);
    }
}
// ================================
// FETCH SCORES + STANDINGS (FORM)
// ================================
async function fetchScoresAndStandings() {
    const url = "https://docs.google.com/spreadsheets/d/13ngf4TN4UwTnYMXAXqgrRuqYm4sBlkx3YnXidNDMaXE/gviz/tq?tqx=out:csv&gid=1691535422";

    try {
        const response = await fetch(url);
        const csvText = await response.text();
        const rows = csvText.split("\n").slice(1); // skip header

        let games = [];

        rows.forEach(row => {
            let cols = row.split(",");

            if (cols.length < 10) return; // skip incomplete rows

            let game = {
                timestamp: cols[0],
                division: cols[1],
                date: cols[2],
                time: cols[3],
                field: cols[4],
                homeTeam: cols[5],
                awayTeam: cols[6],
                homeScore: parseInt(cols[7] || "0"),
                awayScore: parseInt(cols[8] || "0"),
                submittedBy: cols[9]
            };

            games.push(game);
        });

        return games;

    } catch (err) {
        console.error("Error fetching scores/standings:", err);
        return [];
    }
}
function buildStandings(games) {
    let table = {};

    games.forEach(g => {
        if (!table[g.division]) table[g.division] = {};

        // Ensure home team exists
        if (!table[g.division][g.homeTeam]) {
            table[g.division][g.homeTeam] = { wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0 };
        }
        // Ensure away team exists
        if (!table[g.division][g.awayTeam]) {
            table[g.division][g.awayTeam] = { wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0 };
        }

        // Add RF/RA
        table[g.division][g.homeTeam].runsFor += g.homeScore;
        table[g.division][g.homeTeam].runsAgainst += g.awayScore;
        table[g.division][g.awayTeam].runsFor += g.awayScore;
        table[g.division][g.awayTeam].runsAgainst += g.homeScore;

        // Wins / Losses
        if (g.homeScore > g.awayScore) {
            table[g.division][g.homeTeam].wins++;
            table[g.division][g.awayTeam].losses++;
        } else if (g.homeScore < g.awayScore) {
            table[g.division][g.awayTeam].wins++;
            table[g.division][g.homeTeam].losses++;
        } else {
            table[g.division][g.homeTeam].ties++;
            table[g.division][g.awayTeam].ties++;
        }
    });

    return table;
}
function buildTicker(formGames) {
    formGames.sort((a, b) => {
        return new Date(b.date + " " + b.time) - new Date(a.date + " " + a.time);
    });

    return formGames.map(g => {
        return `${g.division}: ${g.homeTeam} ${g.homeScore} - ${g.awayScore} ${g.awayTeam}`;
    });
}
async function loadScoresAndStandings() {
    let formGames = await fetchScoresAndStandings();

    standingsData = buildStandings(formGames);
    tickerData = buildTicker(formGames);

    // These functions already exist in your file
    if (currentPage === "standings") renderStandings();
    if (currentPage === "home") renderHome();
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


// ================================
// LOAD ANNOUNCEMENTS (CSV)
// ================================
async function loadAnnouncement() {
  try {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1400490192&single=true&output=csv";

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Announcement CSV fetch failed");

    const csv = await resp.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return [];

    // Parse header
    const header = lines[0].split(",");
    const annIndex = header.findIndex(h => h.toLowerCase().includes("announcement"));
    if (annIndex < 0) return [];

    const announcements = [];

    // Parse each row
    for (let i = 1; i < lines.length; i++) {
      // Split by comma, but safely (allowing commas inside quotes)
      const row = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      if (!row) continue;

      let msg = row[annIndex] || "";
      msg = msg.trim();

      // Remove wrapping quotes ("message" → message)
      if (msg.startsWith('"') && msg.endsWith('"')) {
        msg = msg.slice(1, -1);
      }

      if (msg.length > 0) {
        announcements.push(msg);
      }
    }

    return announcements;

  } catch (err) {
    console.warn("Error loading announcements:", err);
    return [];
  }
}

// ================================
// HOME PAGE
// ================================
async function renderHome() {

  const announcements = await loadAnnouncement();
  let announcementHTML = "";

  if (announcements.length > 0) {
    announcementHTML = `
      <div class="announcement-card" style="
        background:#fff9d9;
        padding:14px;
        border-radius:10px;
        margin-bottom:16px;
        border:1px solid #f2d57c;
        font-size:16px;
      ">
        <ul>
          ${announcements.map(a => `<li>${a}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  // Build final home page HTML
  pageRoot.innerHTML = `
    <section class="card home-card">
      <div class="home-banner">
        <img src="home_banner.jpg" alt="League Banner">
      </div>

      ${announcementHTML}
    </section>
  `;
renderTicker();

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
  showSpinner();

  setTimeout(() => {
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
          ${
            !entries.length
              ? `<li>No games found.</li>`
              : entries
                  .map(g => {
                    // NEW: Only scoring divisions have a score value
                    const score = SCORING_DIVISIONS.includes(g.division)
                      ? (
                          g.homeScore == null && g.awayScore == null
                            ? "No score yet"
                            : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`
                        )
                      : "";

                    const fieldName = g.field || g.Field || g.FIELD || "";

                    return `
                      <li>
                        <span><strong>${g.date}</strong></span>
                        <span>${g.time}</span>
                        <span><em>Field: ${fieldName}</em></span>
                        <span>${g.home} vs ${g.away}</span>
                        <span>${score}</span>
                      </li>`;
                  })
                  .join("")
          }
        </ul>
      </section>
    `;

    applyPageTransition();
    hideSpinner();
  }, 120);
}
// ========================
// SCHEDULE PAGE
// ========================
function renderSchedule() {
  showSpinner();

  setTimeout(() => {
    const list = games
      .filter(g => g.division === selectedScheduleDivision)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group games by date
    const gamesByDate = {};
    list.forEach(g => {
      if (!gamesByDate[g.date]) gamesByDate[g.date] = [];
      gamesByDate[g.date].push(g);
    });

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

        <div class="schedule-container">
          ${
            list.length === 0
              ? `<p style="padding:16px;">No games loaded.</p>`
              : Object.keys(gamesByDate)
                  .map(date => {
                    return `
                      <div class="schedule-date-block">
                        <h3 class="schedule-date-header">📅 ${date}</h3>
                        <ul class="schedule-list">
                          ${gamesByDate[date]
                            .map(g => {
                              const score = SCORING_DIVISIONS.includes(g.division)
                                ? (
                                    g.homeScore == null && g.awayScore == null
                                      ? "No score yet"
                                      : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`
                                  )
                                : "";

                              return `
                                <li class="schedule-item">
                                  <div class="schedule-time-field">
                                    <span class="schedule-time">${g.time}</span>
                                    <span class="schedule-field">Field: ${g.field || ""}</span>
                                  </div>
                                  <div class="schedule-teams">${g.home} vs ${g.away}</div>
                                  ${
                                    score
                                      ? `<div class="schedule-score">${score}</div>`
                                      : ""
                                  }
                                </li>`;
                            })
                            .join("")}
                        </ul>
                      </div>
                    `;
                  })
                  .join("")
          }
        </div>
      </section>
      <button id="scrollTodayBtn" class="scroll-today-btn" onclick="scrollToToday()">📅 Today</button>

    `;

    applyPageTransition();
    hideSpinner();
  }, 120);
}
function renderTicker() {
    const el = document.getElementById("tickerContent");
    if (!el) return;

    if (!tickerData || tickerData.length === 0) {
        el.textContent = "⚾ No score submissions yet.";
        return;
    }

    el.textContent = tickerData.join(" • ");
}

function scrollToToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateHeaders = document.querySelectorAll(".schedule-date-header");

  for (const header of dateHeaders) {
    const dateText = header.textContent.replace("📅 ", "").trim();
    const parsed = new Date(dateText);

    if (!isNaN(parsed) && parsed >= today) {
      header.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }

  // If no future games found, scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderStandings() {
    showSpinner();

    // standingsData was created in loadScoresAndStandings()
    // Example shape:
    // standingsData = {
    //   "Majors": { "Team 1": {wins, losses, ties, runsFor, runsAgainst}, ... },
    //   "AAA": { ... },
    //   "AA": { ... }
    // }
    const division = selectedStandingsDivision;
    const divStandings = standingsData?.[division] || {};

    // Convert object → array
    const standingsArray = Object.keys(divStandings).map(team => ({
        team: team,
        ...divStandings[team]
    }));

    // Sort by wins DESC, then run differential DESC
    standingsArray.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        const diffA = a.runsFor - a.runsAgainst;
        const diffB = b.runsFor - b.runsAgainst;
        return diffB - diffA;
    });

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
                    standingsArray.length === 0
                        ? `<li>No standings yet.</li>`
                        : standingsArray
                              .map(
                                  s => `
                    <li>
                        <span>${s.team}</span>
                        <span class="record">${s.wins}-${s.losses}</span>
                    </li>`
                              )
                              .join("")
                }
            </ul>
        </section>
    `;

    applyPageTransition();
    hideSpinner();
}

function loginCoach() {
  const name = document.getElementById("coach-name").value.trim();
  const pin = document.getElementById("coach-pin").value.trim();

  // FIRST: Check admin login
  if (name === "Admin" && pin === ADMIN_PIN) {
    loggedInCoach = "Admin";
    isAdmin = true;
    renderMore();
    return;
  }

  // THEN: Check division login
  if (!coachPins[name]) {
    alert("Unknown division.");
    return;
  }

  if (coachPins[name] !== pin) {
    alert("Incorrect PIN.");
    return;
  }

  loggedInCoach = name;
  isAdmin = false;
  renderMore();
}

function logoutCoach() {
  loggedInCoach = null;
  isAdmin = false;
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
            <li><button onclick="renderResources()">Resources</button></li>
            <li><button onclick="openScoreForm()">Enter Final Score</button></li>
            ${isAdmin ? `<li><button onclick="renderAdmin()">Admin</button></li>` : ""}
        </ul>
    </section>
    `;
    applyPageTransition();
}

function renderLogin() {
    const isLoggedIn = !!loggedInCoach;

    pageRoot.innerHTML = `
        <section class="card">
            <div class="card-header">
                <div class="card-title">Division Login</div>
            </div>

            <div style="padding:16px;">

                ${
                    isLoggedIn
                    ? `
                        <p>
                            Logged in as
                            <strong>${loggedInCoach}</strong>
                            ${isAdmin ? "(Admin)" : ""}
                        </p>

                        <button onclick="logoutCoach()">Logout</button>
                    `
                    : `
                        <p>Enter your division name and PIN to enter final scores.</p>

                        <label><strong>Division:</strong></label><br>
                        <input id="coach-name" placeholder="Majors, AAA, or AA"><br><br>

                        <label><strong>PIN:</strong></label><br>
                        <input id="coach-pin" type="password" placeholder="PIN"><br><br>

                        <button onclick="loginCoach()">Login</button>

                        <p style="margin-top:12px; font-size:0.85rem; color:#666;">
                            Admin login: name <strong>Admin</strong>
                        </p>
                    `
                }

            </div>
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
function openScoreForm() {
    window.open("https://docs.google.com/spreadsheets/d/13ngf4TN4UwTnYMXAXqgrRuqYm4sBlkx3YnXidNDMaXE/edit?resourcekey=&gid=1691535422#gid=1691535422", "_blank");
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
  loadScoresAndStandings();

}
// ========================
// PULL DOWN TO REFRESH (Home Only)
// ========================
let touchStartY = 0;
let touchCurrentY = 0;
let isPulling = false;

const PULL_THRESHOLD = 60; // how far to pull before triggering

document.addEventListener("touchstart", (e) => {
  if (currentPage !== "home") return; // Home page only
  if (window.scrollY > 0) return;     // only when scrolled to top

  touchStartY = e.touches[0].clientY;
  isPulling = true;
});

document.addEventListener("touchmove", (e) => {
  if (!isPulling) return;
  if (currentPage !== "home") return;

  touchCurrentY = e.touches[0].clientY;

  // If user scrolls upward (negative), cancel
  if (touchCurrentY < touchStartY) {
    isPulling = false;
    return;
  }
});

document.addEventListener("touchend", async () => {
  if (!isPulling) return;
  if (currentPage !== "home") return;

  const pullDistance = touchCurrentY - touchStartY;

  if (pullDistance > PULL_THRESHOLD) {
    // Trigger refresh
    showSpinner();

    // Reload schedule, home content, etc.
    await loadScheduleFromApi();

    // Re-render home page after data reload
    renderHome();

    hideSpinner();
  }

  isPulling = false;
});

initApp();

/* --------------------------------------------------
   END OF FILE
-------------------------------------------------- */