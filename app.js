/* --------------------------------------------------
   Villa Park Little League - App.js (Clean Reset)
   - Home / Schedule / Standings / Teams / Messages
   - Coach login + Admin login (PIN 0709)
   - Resources Page
   - More tab
   - Fixed date/time formatting from Google Sheets
-------------------------------------------------- */

// Clear any old/bad cached games so we always start fresh
localStorage.removeItem("games");

// === PUSH NOTIFICATION CONFIG (optional, safe to leave) ===
const VAPID_PUBLIC_KEY =
  "BF0dpO0TLhz4vAoOOJvTLmnZ5s93F5KI1bmam8jytsnDW1wnLVVS53gHOS47fL6VcNBuynPx53zEkJVwWTIlHcw";

async function enableNotifications() {
  try {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Notifications blocked.");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    console.log("Push subscription:", sub);
    alert("Notifications enabled!");
  } catch (err) {
    console.error("Push subscribe error:", err);
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// === GLOBAL STATE ===
let games = JSON.parse(localStorage.getItem("games") || "[]");
let selectedDivision = "Majors";

const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];
const SCORING_DIVISIONS = ["Majors", "AAA", "AA"];

function saveGames() {
  localStorage.setItem("games", JSON.stringify(games));
}

function recomputeGameIndices() {
  games.forEach((g, i) => (g._idx = i));
}
recomputeGameIndices();

// === COACH / ADMIN ===
let loggedInCoach = null;
let isAdmin = false;
const ADMIN_PIN = "0709";

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

let messages = JSON.parse(localStorage.getItem("messages") || "[]");
function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

// === GOOGLE SHEET API ===
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycby4sGBxN0sMlGT398mM3CGjQXKCIjL2C2eRxAQJohc7Gz1kah8zCnlv_dTkxYvtyddR/exec";

// Helper to turn ISO-like strings into readable date/time
function formatDateFromSheet(value) {
  if (!value) return "";
  if (typeof value === "string" && value.includes("T")) {
    const d = new Date(value);
    if (!isNaN(d)) {
      return d.toLocaleDateString();
    }
  }
  return value;
}

function formatTimeFromSheet(value) {
  if (!value) return "";
  if (typeof value === "string" && value.includes("T")) {
    const d = new Date(value);
    if (!isNaN(d)) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  }
  return value;
}

async function loadScoresFromGoogleSheet() {
  try {
    const response = await fetch(SHEET_API_URL + "?v=" + Date.now(), {
      cache: "no-store",
    });

    const data = await response.json();
    if (!data || !Array.isArray(data.games)) return;

    games = data.games.map((g) => {
      // normalize keys to lowercase
      const n = {};
      Object.keys(g).forEach((k) => (n[k.toLowerCase()] = g[k]));

      return {
        division: n["division"] || "",
        date: formatDateFromSheet(n["date"]),
        time: formatTimeFromSheet(n["time"]),
        field: n["field"] || "",
        home: n["home"] || "",
        away: n["away"] || "",
        homeScore:
          n["home score"] === "" || n["home score"] == null
            ? null
            : Number(n["home score"]),
        awayScore:
          n["away score"] === "" || n["away score"] == null
            ? null
            : Number(n["away score"]),
      };
    });

    recomputeGameIndices();
    saveGames();
    console.log("Games loaded from Google Sheet:", games.length);
  } catch (err) {
    console.error("Google Sheets load error:", err);
  }
}

async function reloadAllSchedules() {
  await loadScoresFromGoogleSheet();
  renderSchedule();
  renderStandings();
}

// === PAGE RENDERING ROOT & NAV ===
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

// --- TEAMS PAGE ---
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

  html += `</ul></section>`;
  pageRoot.innerHTML = html;
}

function renderTeamsByDivision(div) {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">${div}</div>
      </div>
      <ul class="roster-list">
  `;

  const teamSet = new Set();
  games.forEach((g) => {
    if (g.division === div) {
      if (g.home) teamSet.add(g.home);
      if (g.away) teamSet.add(g.away);
    }
  });

  [...teamSet].forEach((t) => {
    html += `
      <li onclick="renderTeamSchedule('${div}','${t}')">
        <span>${t}</span>
        <span style="font-weight:700; color:#d32f2f;">Schedule</span>
      </li>
    `;
  });

  html += `</ul></section>`;
  pageRoot.innerHTML = html;
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
    html += `
      <li>
        <span>${g.date}</span>
        <span>${g.time}</span>
        <span>${g.home} vs ${g.away}</span>
        <span>${
          g.homeScore === null ? "-" : g.homeScore
        } - ${g.awayScore === null ? "-" : g.awayScore}</span>
      </li>
    `;
  });

  html += `</ul></section>`;
  pageRoot.innerHTML = html;
}

// --- SCHEDULE PAGE ---
function renderSchedule() {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Schedule</div>
      </div>

      <div style="padding:16px;">
        <label>
          <strong>Division:</strong>
          <select onchange="selectedDivision=this.value;renderSchedule()">
            ${DIVISIONS.map(
              (d) =>
                `<option value="${d}" ${
                  d === selectedDivision ? "selected" : ""
                }>${d}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <ul class="schedule-list">
  `;

  games
    .filter((g) => g.division === selectedDivision)
    .forEach((g) => {
      html += `
        <li>
          <span>${g.date}</span>
          <span>${g.time}</span>
          <span>${g.home} vs ${g.away}</span>
          <span>${
            g.homeScore === null ? "-" : g.homeScore
          } - ${g.awayScore === null ? "-" : g.awayScore}</span>
        </li>
      `;
    });

  html += `</ul></section>`;
  pageRoot.innerHTML = html;
}

// --- STANDINGS PAGE ---
function renderStandings() {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Standings</div>
      </div>

      <div style="padding:16px;">
        <label>
          <strong>Division:</strong>
          <select onchange="selectedDivision=this.value;renderStandings()">
            ${SCORING_DIVISIONS.map(
              (d) =>
                `<option value="${d}" ${
                  d === selectedDivision ? "selected" : ""
                }>${d}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <ul class="standings-list">
  `;

  const standings = computeStandings(selectedDivision);

  standings.forEach((s) => {
    html += `
      <li>
        <span>${s.team}</span>
        <span class="record">${s.wins} - ${s.losses}</span>
      </li>
    `;
  });

  html += `</ul></section>`;
  pageRoot.innerHTML = html;
}

function computeStandings(div) {
  const table = {};

  games
    .filter((g) => g.division === div)
    .forEach((g) => {
      if (!table[g.home]) table[g.home] = { wins: 0, losses: 0 };
      if (!table[g.away]) table[g.away] = { wins: 0, losses: 0 };

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

  return Object.keys(table)
    .map((team) => ({ team, ...table[team] }))
    .sort((a, b) => b.wins - a.wins);
}

// --- MESSAGES PAGE ---
function renderMessages() {
  let html = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Messages</div>
      </div>

      <div style="padding:16px;">
        ${messages
          .map(
            (m) => `
          <p><strong>${m.coach}:</strong> ${m.text}</p>
        `
          )
          .join("")}
      </div>

      <div style="padding:16px;">
        <label><strong>Coach Login:</strong></label>
        <input id="coach-name" placeholder="Coach Name">
        <input id="coach-pin" placeholder="PIN" type="password">
        <button onclick="loginCoach()">Login</button>
      </div>

      <div style="padding:16px;">
        <textarea id="msg-input" placeholder="Enter a message"></textarea>
        <button onclick="postMessage()">Post Message</button>
      </div>
    </section>
  `;

  pageRoot.innerHTML = html;
}

function loginCoach() {
  const name = document.getElementById("coach-name").value;
  const pin = document.getElementById("coach-pin").value;

  if (name === "Admin" && pin === ADMIN_PIN) {
    loggedInCoach = "Admin";
    isAdmin = true;
    alert("Admin logged in");
    renderMessages();
    return;
  }

  if (!coachPins[name]) {
    alert("Unknown coach");
    return;
  }

  if (coachPins[name] !== pin) {
    alert("Incorrect PIN");
    return;
  }

  loggedInCoach = name;
  isAdmin = false;
  alert("Coach logged in");
  renderMessages();
}

function postMessage() {
  if (!loggedInCoach) {
    alert("You must log in first.");
    return;
  }

  const text = document.getElementById("msg-input").value;
  if (!text.trim()) return;

  messages.push({ coach: loggedInCoach, text });
  saveMessages();
  renderMessages();
}

// --- RESOURCES PAGE ---
function renderResources() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Resources</div>
      </div>
      <ul class="roster-list">
        <li>
          <a href="https://www.littleleague.org/" target="_blank">
            <span>Little League Website</span>
          </a>
        </li>
      </ul>
    </section>
  `;
}

// --- ADMIN PAGE ---
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

// --- MORE PAGE ---
function renderMore() {
  const isCoach = loggedInCoach && loggedInCoach !== "Admin";

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">More Options</div>
      </div>

      <ul class="roster-list">
        <li><button class="more-btn" onclick="renderTeams()">Teams</button></li>
        <li><button class="more-btn" onclick="renderMessages()">Messages</button></li>
        <li><button class="more-btn" onclick="renderResources()">Resources</button></li>
        ${
          isAdmin
            ? `<li><button class="more-btn" onclick="renderAdmin()">Admin</button></li>`
            : ""
        }
      </ul>
    </section>
  `;
}

// --- NAVIGATION HANDLERS ---
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;

    if (page === "home") renderHome();
    if (page === "schedule") renderSchedule();
    if (page === "standings") renderStandings();
    if (page === "more") renderMore();
    if (page === "admin") renderAdmin();
  });
});

// === INITIAL LOAD ===
renderHome();
loadScoresFromGoogleSheet();
