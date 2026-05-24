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
const DIVISION_STANDINGS_TEAMS = {
  Majors: [
    "Nationals",
    "Braves",
    "Cardinals",
    "Dodgers",
    "Blue Jays",
    "Mariners"
  ],
  AAA: [
  "Cubs",
  "Pirates",
  "A's",
  "Royals",
  "Angels",
  "Marlins",
  "Tigers",
  "Diamondbacks",
  "Orioles",
  "Padres"
],

AA: [
  "A's",
  "Angels",
  "Pirates",
  "Rockies",
  "Cubs",
  "Nationals",
  "Braves",
   "Orioles"
]
   
};

const HITS_HOPS_TICKET_URL = "https://www.vplittleleague.net/Default.aspx?tabid=2752970";
const SNACK_BAR_MENU_URL = "resources/snack-bar-menu.jpg";
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
let lastFormGames = [];
let lastScoresFetchMs = 0;
let lastTickerHTML = "";
const TICKER_LOOKBACK_DAYS = 10;  // show last 10 days
const TICKER_MAX_ITEMS = 30;     // cap ticker length

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
function norm(s) {
  return (s || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}
function restartTickerAnimation() {
  const ticker = document.getElementById("tickerContent");
  if (!ticker) return;

  ticker.style.animation = "none";
  void ticker.offsetWidth; // force reflow
  ticker.style.animation = ""; // return to CSS animation
}
function ensureTickerRunning() {
  const ticker = document.getElementById("tickerContent");
  if (!ticker) return;

  const anims = ticker.getAnimations ? ticker.getAnimations() : [];
  if (anims.length) {
    anims.forEach(a => {
      try { a.play(); } catch (e) {}
    });
    return;
  }

  const state = getComputedStyle(ticker).animationPlayState;
  if (state === "paused") {
    ticker.style.animationPlayState = "running";
  }
}
function normDate(s) {
  const t = (s || "").toString().trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return norm(t);
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return `${mm}/${dd}/${m[3]}`;
}

function normTime(s) {
  let t = (s || "").toString().trim().toLowerCase();
  t = t.replace(/\s+/g, "");
  t = t.replace(/\./g, "");
  t = t.replace(/^(\d{1,2}):00(am|pm)$/, "$1$2");
  return t;
}

function makeKey({ division, date, time, home, away }) {
  return [
    norm(division),
    normDate(date),
    normTime(time),
    norm(home),
    norm(away)
  ].join("|");
}

function applyFormScoresToGames(formGames) {
  if (!Array.isArray(formGames) || !Array.isArray(games)) return;

  const map = new Map();

  formGames.forEach(fg => {
    if (fg.homeScore == null || fg.awayScore == null) return;

    const key = makeKey({
      division: fg.division,
      date: fg.date,
      time: fg.time,
      home: fg.homeTeam,
      away: fg.awayTeam
    });

    map.set(key, fg);
  });

  games.forEach(g => {
    if (!SCORING_DIVISIONS.includes(g.division)) return;

    const key = makeKey({
      division: g.division,
      date: g.date,
      time: g.time,
      home: g.home,
      away: g.away
    });

    const fg = map.get(key);
    if (!fg) return;

    g.homeScore = fg.homeScore;
    g.awayScore = fg.awayScore;
  });
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
const TOURNAMENT_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1000083841&single=true&output=csv";
let tournamentGames = [];
const TOC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=2037385450&single=true&output=csv";

let tocGames = [];
const ALL_STARS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1970088002&single=true&output=csv";

const ALL_STARS_DIVISIONS = [
  "Juniors",
  "Intermediate",
  "12U",
  "11U BC",
  "11U TT",
  "10U DD",
  "10U GG",
  "9U JW",
  "9U ZS"
];

let selectedAllStarsDivision = "Juniors";
let allStarsGames = [];
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
async function loadTournamentGames() {
  try {
    const response = await fetch(TOURNAMENT_CSV_URL, { cache: "no-cache" });
    const csvText = await response.text();

    const rows = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    }).data;

    tournamentGames = rows.map(item => ({
      date: item.date || item.Date || "",
      time: item.time || item.Time || "",
      field: item.field || item.Field || "",
      home: item.home || item.Home || "",
      away: item.away || item.Away || "",
      homeScore: normalizeScore(item["home score"] || item["Home Score"]),
      awayScore: normalizeScore(item["away score"] || item["Away Score"]),
      status: (item["Status"] || item["status"] || "").toString().trim().toUpperCase(),
      inning: (item["Inning"] || item["inning"] || "").toString().trim(),
      pool: item["Pool"] || item["pool"] || ""
    }));

    if (currentPage === "tournaments") renderTournaments();

    if (lastFormGames && lastFormGames.length) {
  tickerData = buildTicker(lastFormGames, tournamentGames, tocGames);
  renderTicker();
}
  } catch (err) {
    console.error("Error loading tournament CSV:", err);
    tournamentGames = [];
  }
}
async function loadTOCGames() {
  try {
    const response = await fetch(TOC_CSV_URL, { cache: "no-cache" });
    const csvText = await response.text();

    const rows = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    }).data;

    tocGames = rows.map(item => ({
      date: item.date || item.Date || "",
      time: item.time || item.Time || "",
      field: item.field || item.Field || "",
      home: item.home || item.Home || "",
      away: item.away || item.Away || "",
      homeScore: normalizeScore(item["home score"] || item["Home Score"]),
      awayScore: normalizeScore(item["away score"] || item["Away Score"]),
      status: (item["Status"] || item["status"] || "").toString().trim().toUpperCase(),
      inning: (item["Inning"] || item["inning"] || "").toString().trim(),
      pool: item["Pool"] || item["pool"] || ""
    }));

    if (currentPage === "toc") renderTOC();
if (lastFormGames && lastFormGames.length) {
  tickerData = buildTicker(lastFormGames, tournamentGames, tocGames);
  renderTicker();
}
  } catch (err) {
    console.error("Error loading TOC CSV:", err);
    tocGames = [];
  }
}
async function loadAllStarsGames() {
  try {
    const response = await fetch(ALL_STARS_CSV_URL, { cache: "no-cache" });
    const csvText = await response.text();

    const rows = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    }).data;

    allStarsGames = rows.map(item => ({
      division: item.Division || item.division || "",
      date: item.Date || item.date || "",
      time: item.Time || item.time || "",
      field: item.Field || item.field || "",
      home: item.Home || item.home || "",
      away: item.Away || item.away || "",
      homeScore: normalizeScore(item["Home Score"] || item["home score"]),
      awayScore: normalizeScore(item["Away Score"] || item["away score"]),
      status: (item.Status || item.status || "").toString().trim().toUpperCase(),
      inning: (item.Inning || item.inning || "").toString().trim()
    }));

    if (currentPage === "allstars") renderAllStars();

  } catch (err) {
    console.error("Error loading All Stars CSV:", err);
    allStarsGames = [];
  }
}
// ================================
// FETCH SCORES + STANDINGS (FORM)
// ================================
async function fetchScoresAndStandings() {
  const url =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1463341365&single=true&output=csv";

  try {
    const response = await fetch(url, { cache: "no-store" });
    const csvText = await response.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    const formGames = parsed.data.map(row => {
      const homeScoreRaw = (row["Home Score"] || "").toString().trim();
      const awayScoreRaw = (row["Away Score"] || "").toString().trim();

      return {
        timestamp: row["Timestamp"] || "",
        division: row["Division"] || "",
        date: row["Game Date"] || row["Date"] || "",
        time: row["Game Time"] || row["Time"] || "",
        field: row["Field"] || "",
        homeTeam: row["Home Team"] || row["Home"] || "",
        awayTeam: row["Away Team"] || row["Away"] || "",
        homeScore: homeScoreRaw === "" ? null : parseInt(homeScoreRaw, 10),
        awayScore: awayScoreRaw === "" ? null : parseInt(awayScoreRaw, 10),
        submittedBy: row["Submitted By"] || row["Email Address"] || "",
        status: (row["Status"] || "").toString().trim().toUpperCase(),
        inning: (row["Inning"] || "").toString().trim()
      };
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
  // Skip LIVE games so they do not affect standings
  if (g.status === "LIVE") return;

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

function parseMMDDYYYY(dateStr) {
  const raw = (dateStr || "").toString().trim();

  // Accept M/D/YYYY, MM/DD/YYYY, M-D-YYYY, MM-DD-YYYY
  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!m) return null;

  const mm = parseInt(m[1], 10) - 1;
  const dd = parseInt(m[2], 10);
  const yy = parseInt(m[3], 10);

  const d = new Date(yy, mm, dd);
  d.setHours(0, 0, 0, 0);

  return isNaN(d.getTime()) ? null : d;
}

function parseGameDateTime(dateStr, timeStr) {
  const d = parseMMDDYYYY(dateStr);
  if (!d) return null;

  const rawTime = (timeStr || "").toString().trim().toLowerCase();
  const m = rawTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);

  let hours = 0;
  let minutes = 0;

  if (m) {
    hours = parseInt(m[1], 10);
    minutes = parseInt(m[2] || "0", 10);
    const ampm = m[3];

    if (ampm === "pm" && hours !== 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  }

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    hours,
    minutes,
    0,
    0
  );
}

function buildTicker(formGames, tournamentList = [], tocList = []) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - TICKER_LOOKBACK_DAYS);

  const leagueEntries = (formGames || [])
    .filter(g => {
      const gameDate = parseMMDDYYYY(g.date);
      if (!gameDate) return false;
      if (gameDate < cutoff || gameDate > today) return false;

      const isLive = g.status === "LIVE";
      const isFinal = g.homeScore != null && g.awayScore != null;

      return isLive || isFinal;
    })
    .map(g => ({
      source: "league",
      division: g.division,
      date: g.date,
      time: g.time,
      awayTeam: g.awayTeam,
      homeTeam: g.homeTeam,
      awayScore: g.awayScore != null ? g.awayScore : "-",
      homeScore: g.homeScore != null ? g.homeScore : "-",
      status: g.status,
      inning: g.inning || "",
      sortDate: parseGameDateTime(g.date, g.time)
    }));

  const tournamentEntries = (tournamentList || [])
    .filter(g => {
      const gameDate = parseMMDDYYYY(g.date);
      if (!gameDate) return false;
      if (gameDate < cutoff || gameDate > today) return false;

      const isLive = g.status === "LIVE";
      const isFinal = g.homeScore != null && g.awayScore != null;

      return isLive || isFinal;
    })
    .map(g => ({
      source: "tournament",
      division: "Tournament",
      date: g.date,
      time: g.time,
      awayTeam: g.away,
      homeTeam: g.home,
      awayScore: g.awayScore != null ? g.awayScore : "-",
      homeScore: g.homeScore != null ? g.homeScore : "-",
      status: g.status,
      inning: g.inning || "",
      pool: g.pool || "",
      sortDate: parseGameDateTime(g.date, g.time)
    }));
const tocEntries = (tocList || [])
  .filter(g => {
    const gameDate = parseMMDDYYYY(g.date);
    if (!gameDate) return false;
    if (gameDate < cutoff || gameDate > today) return false;

    const isLive = g.status === "LIVE";
    const isFinal = g.homeScore != null && g.awayScore != null;

    return isLive || isFinal;
  })
  .map(g => ({
    source: "toc",
    division: "TOC",
    date: g.date,
    time: g.time,
    awayTeam: g.away,
    homeTeam: g.home,
    awayScore: g.awayScore != null ? g.awayScore : "-",
    homeScore: g.homeScore != null ? g.homeScore : "-",
    status: g.status,
    inning: g.inning || "",
    sortDate: parseGameDateTime(g.date, g.time)
  }));
  return [...leagueEntries, ...tournamentEntries, ...tocEntries]
    .sort((a, b) => {
      const aLive = a.status === "LIVE" ? 1 : 0;
      const bLive = b.status === "LIVE" ? 1 : 0;

      if (bLive !== aLive) return bLive - aLive;

      if (!a.sortDate && !b.sortDate) return 0;
      if (!a.sortDate) return 1;
      if (!b.sortDate) return -1;

      return b.sortDate - a.sortDate;
    })
    .slice(0, TICKER_MAX_ITEMS)
    .map(g => {
      const prefix = g.source === "tournament" ? "Playoffs" : g.division;

      if (g.status === "LIVE") {
        const inningText = g.inning ? ` • LIVE ${g.inning}` : " • LIVE";
        return `${prefix}: ${g.date}${inningText} • ${g.awayTeam} ${g.awayScore} - ${g.homeScore} ${g.homeTeam}`;
      }

      return `${prefix}: ${g.date} • ${g.awayTeam} ${g.awayScore} - ${g.homeScore} ${g.homeTeam}`;
    });
}

async function loadScoresAndStandings() {
  const formGames = await fetchScoresAndStandings();
  lastFormGames = formGames;
  lastScoresFetchMs = Date.now();

  standingsData = buildStandings(formGames);
  tickerData = buildTicker(formGames, tournamentGames, tocGames);
  renderTicker();

  applyFormScoresToGames(formGames);

  if (currentPage === "schedule") renderSchedule();
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
    const url =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1400490192&single=true&output=csv";

    const resp = await fetch(url, { cache: "no-store" });
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
    <div class="home-banner home-slideshow">
      <img src="home_banner.jpg?v=3" class="slide active" alt="League Banner">
      <img src="home_banner2.jpg" class="slide" alt="League Banner">
      <img src="home_banner3.jpg" class="slide" alt="League Banner">
      <img src="home_banner4.jpg" class="slide" alt="League Banner">
      <img src="home_banner5.jpg" class="slide" alt="League Banner">
      <img src="home_banner6.jpg" class="slide" alt="League Banner">
    </div>

    ${announcementHTML}

    
<!-- Snack Bar Menu Button -->
<div style="padding: 0 16px 18px 16px;">
  <button
    onclick="renderSnackBarMenu()"
    style="
      display:block;
      width:100%;
      text-align:center;
      padding:14px 12px;
      border-radius:12px;
      font-weight:800;
      font-size:16px;
      border:1px solid #c8e6c9;
      background:#e8f5e9;
      color:#0b2a52;
    "
  >
    🍿 View Snack Bar Menu
  </button>
</div>
  </section>
`;

    applyPageTransition();
  setTimeout(startHomeSlideshow, 100);
}
function renderSnackBarMenu() {
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <button onclick="renderHome()" style="margin-right:8px;">← Back</button>
        <div class="card-title">Snack Bar Menu</div>
      </div>

      <div style="padding:12px;">
        <img
          src="resources/snack-bar-menu.jpg"
          style="width:100%; border-radius:12px;"
          alt="Snack Bar Menu"
        />
      </div>
    </section>
  `;

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
      <div class="card-header">
  <button onclick="renderMore()" style="margin-right:8px;">← Back</button>
  <div class="card-title">Teams</div>
</div>

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
      <div class="card-header">
  <button onclick="renderTeams()" style="margin-right:8px;">← Back</button>
  <div class="card-title">${div}</div>
</div>
      <ul class="roster-list">
        ${[...teamSet]
          .map(
            t => `
            <li onclick="renderTeamSchedule(&quot;${div}&quot;,&quot;${t}&quot;)">

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
  <button onclick="renderTeamsByDivision('${div}')" style="margin-right:8px;">← Back</button>
  <div>
    <div class="card-title">${team}</div>
    <div class="card-subtitle">${div}</div>
  </div>
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
                        : `${g.awayScore ?? "-"} - ${g.homeScore ?? "-"}`
                      : "";

                    const fieldName = g.field || g.Field || g.FIELD || "";

                    return `
                      <li>
                        <span><strong>${g.date}</strong></span>
                        <span>${g.time}</span>
                        <span><em>Field: ${fieldName}</em></span>
                        <span>${g.away} at ${g.home}</span>
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
      .sort((a, b) => {
  const da = parseMMDDYYYY(a.date);
  const db = parseMMDDYYYY(b.date);
  if (!da || !db) return 0;
  return da - db;
});

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
        <div class="card-header"><div class="card-title">Schedules</div></div>

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
                      <div class="schedule-date-block" data-date="${date}">
  <h3 class="schedule-date-header">📅 ${date}</h3>
  <ul class="schedule-list">
                          ${gamesByDate[date]
                            .map(g => {
                              const score = SCORING_DIVISIONS.includes(
                                g.division
                              )
                                ? g.homeScore == null && g.awayScore == null
                                  ? "No score yet"
                                  : `${g.awayScore ?? "-"} - ${
    g.homeScore ?? "-"
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
                                  <div class="schedule-teams">${g.away} at ${g.home}</div>
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
      <div
  id="scheduleFloatingButtons"
  style="position:fixed; right:16px; bottom:90px; display:flex; flex-direction:column; gap:10px; z-index:1000; align-items:flex-end;"
>
  <button
    id="scrollTopBtn"
    onclick="scrollToTop()"
    style="
      background:#0b2a52;
      color:#fff;
      border:none;
      border-radius:999px;
      padding:12px 18px;
      font-weight:700;
      box-shadow:0 4px 12px rgba(0,0,0,0.25);
      cursor:pointer;
      opacity:0;
      pointer-events:none;
      transition:opacity 0.25s ease;
    "
  >
    ⬆️ Top
  </button>

  <button
    id="scrollTodayBtn"
    onclick="scrollToToday()"
    style="
      background:#0b2a52;
      color:#fff;
      border:none;
      border-radius:999px;
      padding:12px 18px;
      font-weight:700;
      box-shadow:0 4px 12px rgba(0,0,0,0.25);
      cursor:pointer;
    "
  >
    📅 Today
  </button>
</div>
    `;

    applyPageTransition();
hideSpinner();
updateScheduleFloatingButtons();
  }, 120);
}
function renderTournaments() {
  showSpinner();

  setTimeout(() => {
    const list = [...tournamentGames].sort((a, b) => {
      const da = parseMMDDYYYY(a.date);
      const db = parseMMDDYYYY(b.date);
      if (!da || !db) return 0;
      return da - db;
    });

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
        <div class="card-header">
          <div class="card-title">VPLL Playoffs</div>
        </div>

        <div class="schedule-container">
          ${
            list.length === 0
              ? `<p style="padding:16px;">No tournament games loaded.</p>`
              : Object.keys(gamesByDate)
                  .map(date => {
                    return `
                      <div class="schedule-date-block" data-date="${date}">
                        <h3 class="schedule-date-header">🏆 ${date}</h3>
                        <ul class="schedule-list">
                          ${gamesByDate[date]
                            .map(g => {
                              let scoreText = "";

                              if (g.status === "LIVE") {
                                const awayScore = g.awayScore ?? "-";
                                const homeScore = g.homeScore ?? "-";
                                scoreText = `<div class="schedule-score">LIVE${g.inning ? ` ${g.inning}` : ""} • ${awayScore} - ${homeScore}</div>`;
                              } else if (g.homeScore != null || g.awayScore != null) {
                                scoreText = `<div class="schedule-score">${g.awayScore ?? "-"} - ${g.homeScore ?? "-"}</div>`;
                              }

                              return `
                                <li class="schedule-item">
                                  <div class="schedule-time-field">
                                    <span class="schedule-time">${g.time}</span>
                                    <span class="schedule-field">Field: ${g.field || ""}</span>
                                  </div>
                                  <div class="schedule-teams">${g.away} at ${g.home}</div>
                                  ${
                                    g.pool
                                      ? `<div style="font-size:13px; color:#666; margin-top:4px;">${g.pool}</div>`
                                      : ""
                                  }
                                  ${scoreText}
                                </li>
                              `;
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

      <div
        id="tournamentFloatingButtons"
        style="position:fixed; right:16px; bottom:90px; display:flex; flex-direction:column; gap:10px; z-index:1000; align-items:flex-end;"
      >
        <button
          id="scrollTopBtn"
          onclick="scrollToTop()"
          style="
            background:#0b2a52;
            color:#fff;
            border:none;
            border-radius:999px;
            padding:12px 18px;
            font-weight:700;
            box-shadow:0 4px 12px rgba(0,0,0,0.25);
            cursor:pointer;
            opacity:0;
            pointer-events:none;
            transition:opacity 0.25s ease;
          "
        >
          ⬆️ Top
        </button>

        <button
          id="scrollTodayBtn"
          onclick="scrollToToday()"
          style="
            background:#0b2a52;
            color:#fff;
            border:none;
            border-radius:999px;
            padding:12px 18px;
            font-weight:700;
            box-shadow:0 4px 12px rgba(0,0,0,0.25);
            cursor:pointer;
          "
        >
          📅 Today
        </button>
      </div>
    `;

    applyPageTransition();
    hideSpinner();
    updateScheduleFloatingButtons();
  }, 120);
}

function renderTOC() {
  showSpinner();

  setTimeout(() => {
    const list = [...tocGames].sort((a, b) => {
      const da = parseMMDDYYYY(a.date);
      const db = parseMMDDYYYY(b.date);
      if (!da || !db) return 0;
      return da - db;
    });

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
        <div class="card-header">
          <div class="card-title">TOC</div>
        </div>

        <div class="schedule-container">
          ${
            list.length === 0
              ? `<p style="padding:16px;">No TOC games loaded.</p>`
              : Object.keys(gamesByDate)
                  .map(date => {
                    return `
                      <div class="schedule-date-block" data-date="${date}">
                        <h3 class="schedule-date-header">🏅 ${date}</h3>
                        <ul class="schedule-list">
                          ${gamesByDate[date]
                            .map(g => {
                              let scoreText = "";

                              if (g.status === "LIVE") {
                                const awayScore = g.awayScore ?? "-";
                                const homeScore = g.homeScore ?? "-";
                                scoreText = `<div class="schedule-score">LIVE${g.inning ? ` ${g.inning}` : ""} • ${awayScore} - ${homeScore}</div>`;
                              } else if (g.homeScore != null || g.awayScore != null) {
                                scoreText = `<div class="schedule-score">${g.awayScore ?? "-"} - ${g.homeScore ?? "-"}</div>`;
                              }

                              return `
                                <li class="schedule-item">
                                  <div class="schedule-time-field">
                                    <span class="schedule-time">${g.time}</span>
                                    <span class="schedule-field">Field: ${g.field || ""}</span>
                                  </div>
                                  <div class="schedule-teams">${g.away} at ${g.home}</div>
                                  ${scoreText}
                                </li>
                              `;
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
    `;

    applyPageTransition();
    hideSpinner();
  }, 120);
}
function renderAllStars() {
  showSpinner();

  setTimeout(() => {
    const list = allStarsGames
      .filter(g => g.division === selectedAllStarsDivision)
      .sort((a, b) => {
        const da = parseMMDDYYYY(a.date);
        const db = parseMMDDYYYY(b.date);
        if (!da || !db) return 0;
        return da - db;
      });

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

        <div class="card-header">
          <div class="card-title">All Stars</div>
        </div>

        <div style="padding:16px;">
          <label>
            <strong>Division:</strong>

            <select onchange="
              selectedAllStarsDivision=this.value;
              renderAllStars();
            ">
              ${ALL_STARS_DIVISIONS.map(
                d => `
                  <option value="${d}"
                    ${d === selectedAllStarsDivision ? "selected" : ""}
                  >
                    ${d}
                  </option>
                `
              ).join("")}
            </select>
          </label>
        </div>

        <div class="schedule-container">
          ${
            list.length === 0
              ? `<p style="padding:16px;">No All Stars games loaded.</p>`
              : Object.keys(gamesByDate)
                  .map(date => `
                    <div class="schedule-date-block" data-date="${date}">
                      <h3 class="schedule-date-header">⭐ ${date}</h3>

                      <ul class="schedule-list">
                        ${gamesByDate[date]
                          .map(g => {
                            let scoreText = "";

                            if (g.status === "LIVE") {
                              scoreText = `
                                <div class="schedule-score">
                                  LIVE${g.inning ? ` ${g.inning}` : ""}
                                  •
                                  ${g.awayScore ?? "-"} - ${g.homeScore ?? "-"}
                                </div>
                              `;
                            } else if (
                              g.homeScore != null ||
                              g.awayScore != null
                            ) {
                              scoreText = `
                                <div class="schedule-score">
                                  ${g.awayScore ?? "-"} - ${g.homeScore ?? "-"}
                                </div>
                              `;
                            }

                            return `
                              <li class="schedule-item">

                                <div class="schedule-time-field">
                                  <span class="schedule-time">${g.time}</span>

                                  <span class="schedule-field">
                                    Field: ${g.field || ""}
                                  </span>
                                </div>

                                <div class="schedule-teams">
                                  ${g.away} at ${g.home}
                                </div>

                                ${scoreText}

                              </li>
                            `;
                          })
                          .join("")}
                      </ul>
                    </div>
                  `)
                  .join("")
          }
        </div>

      </section>
    `;

    applyPageTransition();
    hideSpinner();
  }, 120);
}
function renderTicker(forceRestart = false) {
  const el = document.getElementById("tickerContent");
  if (!el) return;

  // Build HTML
  let html = "";
  if (!tickerData || tickerData.length === 0) {
    html = `
      <div class="ticker-item">
        ⚾ <span class="no-scores">No score submissions yet.</span>
      </div>
    `;
  } else {
    html = tickerData
      .map(entry => {
        const [division, rest] = entry.split(":");
        return `
          <div class="ticker-item">
            <span class="badge badge-${division.replace(/\s+/g, "").toLowerCase()}">${division}</span>
            <span class="ticker-text-score">⚾ ${rest.trim()}</span>
          </div>
        `;
      })
      .join("");
  }

  const changed = html !== lastTickerHTML;

  // If nothing changed, do NOT reset animation (prevents the “restart” feel)
  if (!changed && !forceRestart) return;

  lastTickerHTML = html;
  el.innerHTML = html + html;
// Restart animation when content changes
requestAnimationFrame(() => {
  const ticker = document.getElementById("tickerContent");
  if (!ticker) return;

  ticker.style.animation = "none";
  void ticker.offsetWidth; // Safari reflow trick
  ticker.style.animation = "";
});
  
}

function scrollToToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const blocks = document.querySelectorAll(".schedule-date-block");
  let exactTodayBlock = null;
  let nextFutureBlock = null;

  for (const block of blocks) {
    const dateText = block.getAttribute("data-date") || "";
    const parsed = parseMMDDYYYY(dateText);
    if (!parsed) continue;

    if (parsed.getTime() === today.getTime()) {
      exactTodayBlock = block;
      break;
    }

    if (!nextFutureBlock && parsed > today) {
      nextFutureBlock = block;
    }
  }

  const targetBlock = exactTodayBlock || nextFutureBlock;

  if (!targetBlock) {
    scrollToTop();
    return;
  }

  // First, get the block near the top the normal way
  targetBlock.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  // Then force the real scroll containers to the exact position
  setTimeout(() => {
    const pageRoot = document.getElementById("page-root");
    const main = getMainScrollEl();
    const blockRect = targetBlock.getBoundingClientRect();

    if (pageRoot) {
      const rootRect = pageRoot.getBoundingClientRect();
      const rootOffset = blockRect.top - rootRect.top + pageRoot.scrollTop - 12;
      pageRoot.scrollTop = Math.max(0, rootOffset);
    }

    if (main && typeof main.scrollTop === "number") {
      const mainRect = main.getBoundingClientRect();
      const mainOffset = blockRect.top - mainRect.top + main.scrollTop - 12;
      main.scrollTop = Math.max(0, mainOffset);
    }

    const absoluteTop =
      window.scrollY + targetBlock.getBoundingClientRect().top - 12;

    window.scrollTo({
      top: Math.max(0, absoluteTop),
      behavior: "smooth"
    });
  }, 250);
}
function scrollToTop() {
  const main = getMainScrollEl();

  if (main) {
    main.scrollTop = 0;
  }

  const pageRoot = document.getElementById("page-root");
  if (pageRoot) {
    pageRoot.scrollTop = 0;
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
}
function updateScheduleFloatingButtons() {
  const topBtn = document.getElementById("scrollTopBtn");
  if (!topBtn) return;

  if (currentPage !== "schedule" && currentPage !== "tournaments") {
    topBtn.style.opacity = "0";
    topBtn.style.pointerEvents = "none";
    return;
  }

  const main = getMainScrollEl();
  const pageRoot = document.getElementById("page-root");

  const scrollTop = Math.max(
    main && typeof main.scrollTop === "number" ? main.scrollTop : 0,
    pageRoot && typeof pageRoot.scrollTop === "number" ? pageRoot.scrollTop : 0,
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0
  );

  if (scrollTop > 220) {
    topBtn.style.opacity = "1";
    topBtn.style.pointerEvents = "auto";
  } else {
    topBtn.style.opacity = "0";
    topBtn.style.pointerEvents = "none";
  }
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

  const allowedTeams = (DIVISION_STANDINGS_TEAMS[division] || []).map(t => t.trim());

const standingsArray = Object.keys(divStandings)
  .map(team => {
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
  })
  .filter(row => allowedTeams.includes((row.team || "").trim()));

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

            <div style="padding:0 16px 16px 16px; overflow-x:auto;">
${
  standingsArray.length === 0
    ? `<p>No standings yet.</p>`
    : `
    <table style="
      width:100%;
      min-width:520px;
      border-collapse:collapse;
      font-size:16px;
      text-align:center;
    ">
      <thead>
        <tr style="background:#0b2a52;color:#fff;">
          <th style="padding:10px;text-align:left;">TEAM</th>
          <th style="padding:10px;">W</th>
          <th style="padding:10px;">L</th>
          <th style="padding:10px;">T</th>
          <th style="padding:10px;">RS</th>
          <th style="padding:10px;">RA</th>
          <th style="padding:10px;">DIFF</th>
          <th style="padding:10px;">PCT</th>
        </tr>
      </thead>
      <tbody>
        ${standingsArray
          .map(
            s => `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="padding:10px;text-align:left;font-weight:700;">${s.team}</td>
              <td style="padding:10px;">${s.wins}</td>
              <td style="padding:10px;">${s.losses}</td>
              <td style="padding:10px;">${s.ties}</td>
              <td style="padding:10px;">${s.runsFor}</td>
              <td style="padding:10px;">${s.runsAgainst}</td>
              <td style="padding:10px;">${s.runDiff > 0 ? "+" : ""}${s.runDiff}</td>
              <td style="padding:10px;">${s.winPct.toFixed(3)}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
    `
}
</div>
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
      <div class="card-header">
  <button onclick="renderMore()" style="margin-right:8px;">← Back</button>
  <div class="card-title">Resources</div>
</div>

      <ul class="roster-list">
        <li>
          <a href="#" onclick="renderPdfPage('resources/local_rules.pdf','Local League Rules'); return false;">
            📜 Local League Rules 
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/home_run_club.pdf','Home Run Club'); return false;">
            💥 Home Run Club 
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/volunteer_list.pdf','Volunteer List'); return false;">
            🙋 Volunteer List 
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/aa_rules.pdf','AA Special Rules'); return false;">
            💡 AA Special Rules 
          </a>
        </li>
         <li>
          <a href="#" onclick="renderPdfPage('resources/VPLL-field_prep.pdf','VPLL Field Prep'); return false;">
            VPLL Field Prep
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/majors_playoffs.pdf','Majors Playoff Schedule'); return false;">
            ⚡🏆 Majors Playoff Schedule 
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/aaa_playoffs.pdf','AAA Playoff Schedule'); return false;">
            ⚡🏆 AAA Playoff Schedule 
          </a>
        </li>
        <li>
          <a href="#" onclick="renderPdfPage('resources/aa_playoffs.pdf','AA Playoff Schedule'); return false;">
            ⚡🏆 AA Playoff Schedule 
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

    <!-- FIELD MAP -->
    <div class="more-card" data-target="field-map">
      <div class="more-icon">📍</div>
      <div class="more-label">Field Map</div>
  
      </div>
    <div class="more-card" data-target="tournaments">
  <div class="more-icon">🏆</div>
  <div class="more-label">VP Playoffs</div>
  </div>

  <div class="more-card" data-target="toc-majors">
  <div class="more-icon">🏅</div>
  <div class="more-label">TOC Majors</div>
</div>

<div class="more-card" data-target="toc-minors">
  <div class="more-icon">🏅</div>
  <div class="more-label">TOC Minors</div>
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
      if (target === "field-map") renderFieldMap();
      if (target === "tournaments") renderPage("tournaments");
      if (target === "toc-majors") {
  renderPdfPage("resources/toc_majors.pdf", "TOC Majors Bracket");
}

if (target === "toc-minors") {
  renderPdfPage("resources/toc_minors.pdf", "TOC Minors Bracket");
}
      if (target === "enter-score") renderLogin();

      applyPageTransition();
    });
  });

  applyPageTransition();
}
function renderFieldMap() {
  const pageRoot = getPageRoot();
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <div class="page">
      <h2>Field Map</h2>

      <img
        src="resources/field-map.png"
        style="width:100%; border-radius:12px;"
      />

      <div style="height:20px;"></div>

      <button onclick="renderMore()">Back</button>
    </div>
  `;

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

          <label><strong>PIN:</strong></label><br>          <input id="coach-pin" type="password" placeholder="PIN"><br><br>

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

  const STALE_MS = 60 * 1000; // 1 minute (adjust if you want)

  if (page === "home") {
    renderHome();
    // ✅ only refresh if stale
    if (!lastScoresFetchMs || Date.now() - lastScoresFetchMs > STALE_MS) {
      loadScoresAndStandings();
    } else {
      renderTicker(false);
    }
      } else if (page === "tournaments") {
    loadTournamentGames();
    renderTournaments();
    } else if (page === "toc") {
  loadTOCGames();
  renderTOC();
  } else if (page === "allstars") {
  loadAllStarsGames();
  renderAllStars();
  } else if (page === "schedule") {
    renderSchedule();
    loadScheduleFromApi();
  } else if (page === "standings") {
    renderStandings();
    // ✅ only refresh if stale OR standings empty
    if (
      !lastScoresFetchMs ||
      Date.now() - lastScoresFetchMs > STALE_MS ||
      !standingsData ||
      Object.keys(standingsData).length === 0
    ) {
      loadScoresAndStandings();
    } else {
      renderTicker(false);
    }
  } else if (page === "more") {
    renderMore();
  }

  setActiveNav(page);
}

// refresh scores if stale (and refresh UI when returning to app)
function refreshIfStale() {
  const STALE_MS = 60 * 1000;

  if (!lastScoresFetchMs || (Date.now() - lastScoresFetchMs > STALE_MS)) {
    loadScoresAndStandings(); // fetch + rebuild data + ticker
  } else {
    // data is fresh — re-render current page so UI updates on iOS PWA
    renderPage(currentPage || "home");
    ensureTickerRunning();
  }
}

function setupNav() {
  const buttons = document.querySelectorAll("#bottomNav .nav-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      renderPage(page);
      ensureTickerRunning();
    });
  });
  setActiveNav("home");
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    ensureTickerRunning();
    refreshIfStale();
  }
});
// Fires when returning to the app (iOS PWA friendly)

window.addEventListener("focus", refreshIfStale);
window.addEventListener("pageshow", refreshIfStale);
window.addEventListener("scroll", updateScheduleFloatingButtons, { passive: true });
document.addEventListener("scroll", updateScheduleFloatingButtons, { passive: true });
// Also fires when the app is foregrounded / resumed (especially iOS)

// ========================
// HOME SLIDESHOW
// ========================
let homeSlideIndex = 0;
let homeSlideInterval = null;

function startHomeSlideshow() {
  const slides = document.querySelectorAll(".home-slideshow .slide");
  if (!slides.length) return;

  clearInterval(homeSlideInterval);

  slides.forEach(s => s.classList.remove("active"));
  slides[0].classList.add("active");
  homeSlideIndex = 0;

  homeSlideInterval = setInterval(() => {
    slides[homeSlideIndex].classList.remove("active");
    homeSlideIndex = (homeSlideIndex + 1) % slides.length;
    slides[homeSlideIndex].classList.add("active");
  }, 4000);
}

// ========================
// INIT
// ========================
function initApp() {
  setupNav();
  renderHome();
  renderTicker();
  loadScheduleFromApi();
  loadTournamentGames();      // load first
  loadTOCGames();
  loadAllStarsGames();
  loadScoresAndStandings();   // then combine
}

// ========================
// ========================
// PULL DOWN TO REFRESH (Home Only) - iOS PWA FRIENDLY
// ========================
let touchStartY = 0;
let touchCurrentY = 0;
let isPulling = false;

const PULL_THRESHOLD = 60;

function getMainScrollEl() {
  return document.querySelector("main") || document.scrollingElement || document.documentElement;
}

function onPullRefresh() {
  return Promise.all([
    loadScheduleFromApi(),
    loadScoresAndStandings(),
    loadTournamentGames(),
    loadTOCGames()
  ])
    .then(() => {
      renderHome();
      renderTicker(false);
      ensureTickerRunning();
    })
    .catch(err => console.error("Pull refresh error:", err));
}

document.addEventListener(
  "touchstart",
  (e) => {
    if (currentPage !== "home") return;

    const main = getMainScrollEl();
    if (!main) return;

    // Only start pull if we're at the very top of the scroll container
    const scrollTop = typeof main.scrollTop === "number" ? main.scrollTop : window.scrollY;
if (scrollTop > 0) return;

    touchStartY = e.touches[0].clientY;
    touchCurrentY = touchStartY;
    isPulling = true;
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!isPulling) return;
    if (currentPage !== "home") return;

    touchCurrentY = e.touches[0].clientY;

    // If user scrolls up instead of pulling down, cancel
    if (touchCurrentY < touchStartY) {
      isPulling = false;
    }
  },
  { passive: true }
);

document.addEventListener("touchend", async () => {
  if (!isPulling) return;
  if (currentPage !== "home") return;

  const pullDistance = touchCurrentY - touchStartY;

  if (pullDistance > PULL_THRESHOLD) {
    await onPullRefresh();
  }

  isPulling = false;
});

document.addEventListener("touchcancel", () => {
  isPulling = false;
});

// Ensure DOM is ready (fixes blank first load on PWA)
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  updateScheduleFloatingButtons();
});

/* --------------------------------------------------
   END OF FILE
-------------------------------------------------- */
