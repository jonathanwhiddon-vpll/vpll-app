/* --------------------------------------------------
   Villa Park Little League - app-v2.js (CSV Version)
   - Loads schedule from Google Sheets CSV
   - Coach & Admin login
   - Score entry for Majors / AAA / AA
   - Standings from Google Form
   - Announcements
   - In-app PDF viewer for Resources
   - Pull-down refresh on Home
-------------------------------------------------- */

// ========================
// CONFIG
// ========================
function showSpinner() {
  const el = document.getElementById("loadingSpinner");
  if (el) el.style.display = "flex";
}

function hideSpinner() {
  const el = document.getElementById("loadingSpinner");
  if (el) el.style.display = "none";
}

// (Kept for future use, not used with CSV)
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
let isFirstRender = true;

let loggedInCoach = null;
let isAdmin = false;
const ADMIN_PIN = "0709";

let standingsData = {};
let tickerData = [];

const coachPins = {
  Majors: "1111",
  AAA: "2222",
  AA: "3333"
};

let scoreOverrides = JSON.parse(
  localStorage.getItem("vpll_score_overrides") || "{}"
);

// PDF viewer state
let pdfDoc = null;
let pdfPageNum = 1;
let pdfTotalPages = 0;

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ========================
// HELPERS
// ========================
function getPageRoot() {
  return document.getElementById("page-root");
}

function normalizeScore(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function makeGameKey(game) {
  return [game.division, game.date, game.time, game.home, game.away]
    .map(s => s.toString().trim())
    .join("|");
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
let firstPaintDone = false;

function applyPageTransition() {
  const root = document.getElementById("page-root");
  if (!root) return;

  // ✅ First render: DO NOTHING
  if (!firstPaintDone) {
    root.style.opacity = "1";
    root.style.transition = "none";
    firstPaintDone = true;
    return;
  }

  // ✅ Normal transitions after first paint
  root.style.transition = "opacity 0.35s ease";
  root.style.opacity = "0";

  requestAnimationFrame(() => {
    setTimeout(() => {
      root.style.opacity = "1";
    }, 30);
  });
}

// ========================
// LOAD SCHEDULE FROM CSV
// ========================
const CSV_URLS = {
  Majors:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=0&single=true&output=csv",
  AAA:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1857914653&single=true&output=csv",
  AA:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1006784456&single=true&output=csv",
  "Single A":
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1852143804&single=true&output=csv",
  "Coach Pitch":
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=359750423&single=true&output=csv",
  "T-Ball":
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=860483387&single=true&output=csv"
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

        const homeScore = normalizeScore(
          item["home score"] || item["Home Score"]
        );
        const awayScore = normalizeScore(
          item["away score"] || item["Away Score"]
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

      combined = combined.concat(parsed);
    }

    games = combined;
    applyScoreOverrides();

    if (currentPage === "schedule") renderSchedule();
    if (currentPage === "standings") renderStandings();
    if (currentPage === "home") renderHome();
  } catch (err) {
    console.error("Error loading schedule CSV:", err);
  } finally {
    hideSpinner();
  }
}

// ================================
// FETCH SCORES + STANDINGS (FORM)
// ================================
async function fetchScoresAndStandings() {
  const url =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1463341365&single=true&output=csv";

  try {
    const response = await fetch(url);
    const csvText = await response.text();
    const rows = csvText.split("\n").slice(1); // Skip header row

    const formGames = [];

    rows.forEach(row => {
      const cols = row.split(",");
      if (cols.length < 10) return;

      const homeScoreRaw = cols[8] ? cols[8].trim() : "";
      const awayScoreRaw = cols[9] ? cols[9].trim() : "";

      const game = {
        timestamp: cols[0],
        division: cols[1],
        date: cols[3],
        time: cols[4],
        field: cols[5],
        homeTeam: cols[6],
        awayTeam: cols[7],
        homeScore: homeScoreRaw === "" ? null : parseInt(homeScoreRaw, 10),
        awayScore: awayScoreRaw === "" ? null : parseInt(awayScoreRaw, 10),
        submittedBy: cols[10]
      };

      formGames.push(game);
    });

    return formGames;
  } catch (err) {
    console.error("Error fetching scores/standings:", err);
    return [];
  }
}

function buildStandings(formGames) {
  let table = {};

  formGames.forEach(g => {
    // Skip games that don't have BOTH scores
    if (g.homeScore == null || g.awayScore == null) return;

    if (!table[g.division]) table[g.division] = {};

    if (!table[g.division][g.homeTeam]) {
      table[g.division][g.homeTeam] = {
        wins: 0,
        losses: 0,
        ties: 0,
        runsFor: 0,
        runsAgainst: 0
      };
    }

    if (!table[g.division][g.awayTeam]) {
      table[g.division][g.awayTeam] = {
        wins: 0,
        losses: 0,
        ties: 0,
        runsFor: 0,
        runsAgainst: 0
      };
    }

    table[g.division][g.homeTeam].runsFor += g.homeScore;
    table[g.division][g.homeTeam].runsAgainst += g.awayScore;
    table[g.division][g.awayTeam].runsFor += g.awayScore;
    table[g.division][g.awayTeam].runsAgainst += g.homeScore;

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
  // Only keep games that actually have scores
  const completed = formGames.filter(
    g =>
      g.homeScore != null &&
      g.awayScore != null &&
      !Number.isNaN(g.homeScore) &&
      !Number.isNaN(g.awayScore)
  );

  completed.sort((a, b) => {
    return new Date(b.date + " " + b.time) - new Date(a.date + " " + a.time);
  });

  return completed.map(
    g =>
      `${g.division}: ${g.homeTeam} ${g.homeScore} - ${g.awayScore} ${g.awayTeam}`
  );
}

async function loadScoresAndStandings() {
  const formGames = await fetchScoresAndStandings();
  standingsData = buildStandings(formGames);
  tickerData = buildTicker(formGames);

  if (currentPage === "standings") renderStandings();
  if (currentPage === "home") {
  renderHome();
  renderTicker(true); // ONLY update ticker when data changes
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
    const url =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1400490192&single=true&output=csv";

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Announcement CSV fetch failed");

    const csv = await resp.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return [];

    const header = lines[0].split(",");
    const annIndex = header.findIndex(h =>
      h.toLowerCase().includes("announcement")
    );
    if (annIndex < 0) return [];

    const announcements = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      if (!row) continue;

      let msg = row[annIndex] || "";
      msg = msg.trim();

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
          ${announcements.map(a => "<li>" + a + "</li>").join("")}
       </ul>
      </div>
    `;
  }

  const pageRoot = getPageRoot();
  if (!pageRoot) return;

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
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

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

  const pageRoot = getPageRoot();
  if (!pageRoot) return;

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

    const pageRoot = getPageRoot();
    if (!pageRoot) {
      hideSpinner();
      return;
    }

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
                    const score = SCORING_DIVISIONS.includes(g.division)
                      ? g.homeScore == null && g.awayScore == null
                        ? "No score yet"
                        : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`
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

    const gamesByDate = {};
    list.forEach(g => {
      if (!gamesByDate[g.date]) gamesByDate[g.date] = [];
      gamesByDate[g.date].push(g);
    });

    const pageRoot = getPageRoot();
    if (!pageRoot) {
      hideSpinner();
      return;
    }

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
                              const score = SCORING_DIVISIONS.includes(
                                g.division
                              )
                                ? g.homeScore == null && g.awayScore == null
                                  ? "No score yet"
                                  : `${g.homeScore ?? "-"} - ${
                                      g.awayScore ?? "-"
                                    }`
                                : "";

                              return `
                                <li class="schedule-item">
                                  <div class="schedule-time-field">
                                    <span class="schedule-time">${g.time}</span>
                                    <span class="schedule-field">Field: ${
                                      g.field || ""
                                    }</span>
                                  </div>
                                  <div class="schedule-teams">${g.home} vs ${
                                g.away
                              }</div>
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
    el.innerHTML = `
      <div class="ticker-item">
        ⚾ <span class="no-scores">No score submissions yet.</span>
      </div>
    `;
    return;
  }

  el.innerHTML = tickerData.map(entry => {
    const [division, rest] = entry.split(":");
    return `
      <div class="ticker-item">
        <span class="badge badge-${division.replace(/\s+/g, "").toLowerCase()}">${division}</span>
        <span class="ticker-text-score">⚾ ${rest.trim()}</span>
      </div>
    `;
  }).join("");
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

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ========================
// STANDINGS
// ========================
function renderStandings() {
  showSpinner();

  if (!standingsData || Object.keys(standingsData).length === 0) {
    hideSpinner();
    const pageRoot = getPageRoot();
    if (!pageRoot) return;

    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header"><div class="card-title">Standings</div></div>
        <p style="padding:16px;">No standings available yet.</p>
      </section>
    `;
    applyPageTransition();
    return;
  }

  const division = selectedStandingsDivision;
  const divStandings = standingsData[division] || {};

  const standingsArray = Object.keys(divStandings).map(team => {
    const s = divStandings[team];
    const runDiff = s.runsFor - s.runsAgainst;
    const totalGames = s.wins + s.losses + s.ties || 1;
    const winPct = (s.wins + 0.5 * s.ties) / totalGames;

    return {
      team,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      runsFor: s.runsFor,
      runsAgainst: s.runsAgainst,
      runDiff,
      winPct
    };
  });

  standingsArray.sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.runDiff !== a.runDiff) return b.runDiff - a.runDiff;
    if (b.runsFor !== a.runsFor) return b.runsFor - a.runsFor;
    return a.team.localeCompare(b.team);
  });

  const pageRoot = getPageRoot();
  if (!pageRoot) {
    hideSpinner();
    return;
  }

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

// ========================
// LOGIN
// ========================
function loginCoach() {
  const nameInput = document.getElementById("coach-name");
  const pinInput = document.getElementById("coach-pin");
  const name = (nameInput?.value || "").trim();
  const pin = (pinInput?.value || "").trim();

  if (name === "Admin" && pin === ADMIN_PIN) {
    loggedInCoach = "Admin";
    isAdmin = true;
    renderCoachScoreForm();
    return;
  }

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
  renderCoachScoreForm();
}

// ========================
// PDF VIEWER PAGE (in-app)
// ========================
async function renderPdfPage(pdfUrl, title) {
  pdfDoc = null;
  pdfPageNum = 1;
  pdfTotalPages = 0;

  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <button onclick="renderResources()" style="margin-right:8px;">← Back</button>
        <div class="card-title">${title}</div>
      </div>

      <div style="text-align:center; padding:8px;">
        <button onclick="prevPdfPage()">◀ Prev</button>
        <span id="pdfPageInfo" style="margin:0 12px;">Page 1</span>
        <button onclick="nextPdfPage()">Next ▶</button>
      </div>

      <canvas id="pdfCanvas" style="width:100%; margin:12px 0;"></canvas>
    </section>
  `;

  applyPageTransition();

  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  pdfDoc = await loadingTask.promise;
  pdfTotalPages = pdfDoc.numPages;

  renderPdfCanvas();
}

async function renderPdfCanvas() {
  if (!pdfDoc) return;

  const canvas = document.getElementById("pdfCanvas");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const page = await pdfDoc.getPage(pdfPageNum);

  const viewport = page.getViewport({ scale: 1 });
  const containerWidth =
    canvas.parentElement?.clientWidth ||
    document.getElementById("page-root")?.clientWidth ||
    document.body.clientWidth;

  const scale = (containerWidth / viewport.width) * 1.6;
  const scaledViewport = page.getViewport({ scale });

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  await page.render({
    canvasContext: context,
    viewport: scaledViewport
  }).promise;

  const infoEl = document.getElementById("pdfPageInfo");
  if (infoEl) {
    infoEl.textContent = `Page ${pdfPageNum} of ${pdfTotalPages}`;
  }
}

function prevPdfPage() {
  if (pdfPageNum <= 1) return;
  pdfPageNum--;
  renderPdfCanvas();
}

function nextPdfPage() {
  if (pdfPageNum >= pdfTotalPages) return;
  pdfPageNum++;
  renderPdfCanvas();
}

// ========================
// RESOURCES PAGE
// ========================
function renderResources() {
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header"><div class="card-title">Resources</div></div>

      <ul class="roster-list">
        <li>
          <a href="#" onclick="renderPdfPage('resources/local_rules.pdf','Local League Rules'); return false;">
            ⚙️ Local League Rules (PDF)
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/home_run_club.pdf','Home Run Club'); return false;">
            💥 Home Run Club (PDF)
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/volunteer_list.pdf','Volunteer List'); return false;">
            🙋 Volunteer List (PDF)
          </a>
        </li>
        <li>
          <a href="https://www.littleleague.org/playing-rules/rulebook/" target="_blank">
            📘 Rulebook
          </a>
        </li>
                <li>
          <a href="https://gc.com" target="_blank" rel="noopener">
            ⚾ GameChanger (website only, not actual APP)
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/aa_rules.pdf','AA Special Rules'); return false;">
            💡 AA Special Rules (PDF)
          </a>
        </li>
      </ul>
    </section>
  `;

  applyPageTransition();
}

// ========================
// COACH SCORE FORM
// ========================
function renderCoachScoreForm() {
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Enter Final Score</div>
      </div>

      <div style="padding:16px;">
        <p>You are logged in as <strong>${loggedInCoach}</strong>.</p>

        <p>Tap below to open the score submission form:</p>

        <a class="form-button"
           href="https://docs.google.com/forms/d/e/1FAIpQLSdCWC1qhvh3YHTqbHZTFbl6Wkfpwr3_1WWk5-3skq8Oh6UxhA/viewform?usp=header"
           target="_blank">
          Open Score Submission Form
        </a>
      </div>
    </section>
  `;

  applyPageTransition();
}

// ========================
// ADMIN
// ========================
function renderAdmin() {
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  if (!isAdmin) {
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header"><div class="card-title">Admin</div></div>
        <p style="padding:16px;">Admin only. Log in as Admin on Messages tab.</p>
      </section>
    `;
    applyPageTransition();
    return;
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
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <div class="more-grid">

      <div class="more-card" data-target="teams">
        <div class="more-icon">⚾</div>
        <div class="more-label">Teams</div>
      </div>

      <div class="more-card" data-target="resources">
        <div class="more-icon">📘</div>
        <div class="more-label">Resources</div>
      </div>

      <div class="more-card more-card-wide" data-target="enter-score">
        <div class="more-icon">📋✅</div>
        <div class="more-label">Enter Final Score</div>
      </div>

    </div>
  `;

  document.querySelectorAll(".more-card").forEach(card => {
    card.addEventListener("click", () => {
      const target = card.getAttribute("data-target");

      if (target === "teams") renderTeams();
      if (target === "resources") renderResources();
      if (target === "enter-score") renderLogin();

      applyPageTransition();
    });
  });

  applyPageTransition();
}

// ========================
// LOGIN PAGE (FROM MORE)
// ========================
function renderLogin() {
  const isLoggedIn = !!loggedInCoach;

  const pageRoot = getPageRoot();
  if (!pageRoot) return;

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

function logoutCoach() {
  loggedInCoach = null;
  isAdmin = false;
  renderLogin();
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
  window.open(
    "https://docs.google.com/forms/d/e/1FAIpQLSdCWC1qhvh3YHTqbHZTFbl6Wkfpwr3_1WWk5-3skq8Oh6UxhA/viewform?usp=header",
    "_blank"
  );
}
function renderPage(page) {
  currentPage = page;

  if (page === "home") {
    renderHome();              // draw page immediately
    loadScoresAndStandings();  // fetch latest scores + ticker in background
  } else if (page === "schedule") {
    renderSchedule();
    loadScheduleFromApi();     // refresh schedule CSV
  } else if (page === "standings") {
    renderStandings();
    loadScoresAndStandings();  // refresh standings data
  } else if (page === "more") {
    renderMore();
  }

  setActiveNav(page);
}

function setupNav() {
  const buttons = document.querySelectorAll("#bottomNav .nav-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
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

const PULL_THRESHOLD = 60;

document.addEventListener("touchstart", e => {
  if (currentPage !== "home") return;
  if (window.scrollY > 0) return;

  touchStartY = e.touches[0].clientY;
  isPulling = true;
});

document.addEventListener("touchmove", e => {
  if (!isPulling) return;
  if (currentPage !== "home") return;

  touchCurrentY = e.touches[0].clientY;

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
  await Promise.all([loadScheduleFromApi(), loadScoresAndStandings()]);
  renderHome();
}

  isPulling = false;
});

// Ensure DOM is ready (fixes blank first load on PWA)
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

/* --------------------------------------------------
   END OF FILE
-------------------------------------------------- */



