/* --------------------------------------------------
   Villa Park Little League - App.js (Updated Version)
   - Smooth slide-up animation
   - Updated Resources ordering + icons
   - Updated Schedule: no scores for Single A, Coach Pitch, T-Ball
   - "No score yet" for Majors/AAA/AA
   - Clean template strings fixing earlier errors
-------------------------------------------------- */

// === PUSH NOTIFICATIONS (unchanged) ===
const VAPID_PUBLIC_KEY =
  "BF0dpO0TLhz4vAoOOJvTLmnZ5s93F5KI1bmam8jytsnDW1wnLVVS53gHOS47fL6VcNBuynPx53zEkJVwWTIlHcw";
const NOTIFY_URL = "https://script.google.com/macros/s/AKfycbw9uARdTwzWUpCtPgtukhxy_p3I5923L1R4xM8wryD8iREMomfURCYPgbPEc5E3070WKJg/exec";

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
    // === SEND TOKEN + TIMESTAMP TO GOOGLE SCRIPT BACKEND ===
const body = {
  token: btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey("p256dh")))),
  createdAt: new Date().toISOString()
};

fetch(NOTIFY_URL, {
  method: "POST",
  mode: "no-cors",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
}).then(() => {
  console.log("Token sent to Google Script");
}).catch(err => {
  console.error("Error sending token:", err);
});

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
let currentPage = "home";

// === PUSH NOTIFICATION CONFIG ===
const VAPID_PUBLIC_KEY =
  "BF0dp0OTLhz4vA0o0JvTLmnZ5s93F5K1lbmam8jytsnDW1wnLV5S53gHOS47fL6VcNBuynPx53zEkJVwWTlHcw";

const NOTIFY_URL =
  "https://script.google.com/macros/s/AKfycbw9uARdTwzWUptCPgtukhx_p3I5923L1R4xM8wryD8iREMomfURCYPgbPEc5E3070WKJg/exec";

const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];
const SCORING_DIVISIONS = ["Majors", "AAA", "AA"];

// Save device token to Firestore
async function saveDeviceTokenToFirestore(token) {
  try {
    const db = firebase.firestore();
    await db.collection("fcmTokens").add({
      token: token,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("Token saved to Firestore");
  } catch (err) {
    console.error("Error saving token:", err);
  }
}
async function sendPushNotification() {
  const message = document.getElementById("msg-input").value.trim();

  if (!message) {
    alert("Please enter a message before sending a push notification.");
    return;
  }

  try {
    const response = await fetch(
      "https://us-central1-vpll-notices.cloudfunctions.net/sendLeaguePush",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      }
    );

    const result = await response.json();
    console.log("Push notification result:", result);
    alert("Push notification sent!");
  } catch (err) {
    console.error("Error sending push notification:", err);
    alert("Error sending push notification.");
  }
}

// Call immediately on app load
registerForPushNotifications();

// Save games
function saveGames() {
  localStorage.setItem("games", JSON.stringify(games));
}

// Re-index games
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

// Messages
let messages = JSON.parse(localStorage.getItem("messages") || "[]");
function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

// === GOOGLE SHEET API ===
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbw9uARdTwzWUpCtPgtukhx_p3I5923L1R4xM8wryD8IREMomfURCYPgBPcE5307OWKJg/exec";


// Format date
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

// Format time
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

// Load games from Google Sheet
async function loadScoresFromGoogleSheet() {
  try {
    const response = await fetch(SHEET_API_URL + "?v=" + Date.now(), {
      cache: "no-store",
    });

    const data = await response.json();
    if (!data || !Array.isArray(data.games)) return;

    games = data.games.map((g) => {
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

// Reload standings + schedule
async function reloadAllSchedules() {
  await loadScoresFromGoogleSheet();
  renderSchedule();
  renderStandings();
}

// Root element
const pageRoot = document.getElementById("page-root");

// ⭐ Slide-Up Page Transition Helper
function applyPageTransition() {
  pageRoot.classList.remove("page-transition");
  void pageRoot.offsetWidth; // re-trigger animation
  pageRoot.classList.add("page-transition");
}
// === League-wide Alert Bar ===
let currentAlertTimeout = null;

function showLeagueAlert(message) {
  const bar = document.getElementById("league-alert");
  const textEl = document.getElementById("league-alert-text");
  if (!bar || !textEl) return;

  textEl.textContent = message;
  bar.classList.add("show");

  // Auto-hide after 6 seconds
  if (currentAlertTimeout) clearTimeout(currentAlertTimeout);
  currentAlertTimeout = setTimeout(() => {
    bar.classList.remove("show");
  }, 6000);
}

// Close button for alert bar
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "league-alert-close") {
    const bar = document.getElementById("league-alert");
    if (bar) bar.classList.remove("show");
  }
});

// === NAV BUTTONS ===
const navButtons = document.querySelectorAll(".nav-btn");

// --- HOME PAGE ---
function renderHome() {

  // Today's date formatted like your sheet (MM/DD/YYYY)
  const todayStr = new Date().toLocaleDateString();

  // 1) Today's scheduled games (no score yet)
  const todaysGames = games.filter(g => g.date === todayStr);

  // 2) Most recent 5 games with scores
  const recentFinals = games
    .filter(g => g.homeScore != null && g.awayScore != null)
    .slice(-5);

  // 3) Build ticker messages
  let tickerMessages = [];

  // Add today's games
  todaysGames.forEach(g => {
    tickerMessages.push(
      `📅 Today: ${g.division} — ${g.home} vs ${g.away} at ${g.time} (Field ${g.field})`
    );
  });

  // Add recent finals
  recentFinals.forEach(g => {
    tickerMessages.push(
      `🏁 Final: ${g.division} — ${g.home} ${g.homeScore} - ${g.awayScore} ${g.away}`
    );
  });

  // No updates?
  if (tickerMessages.length === 0) {
    tickerMessages = ["⚾ No game updates yet — check back soon!"];
  }

  let tickerText = tickerMessages[0];

  // Start rotating every 4 seconds
  let tickerIndex = 0;
  setInterval(() => {
    tickerIndex = (tickerIndex + 1) % tickerMessages.length;
    const el = document.querySelector(".live-ticker-content");
    if (el) el.textContent = tickerMessages[tickerIndex];
  }, 4000);

  // ---- BUILD HOME PAGE HTML ----
  pageRoot.innerHTML = `
    <section class="card home-card">

      <!-- Banner -->
      <div class="home-banner">
        <img src="home_banner.jpg" alt="League Banner">
      </div>

      <!-- Live Ticker -->
      <div class="live-ticker">
        <div class="live-ticker-content">${tickerText}</div>
      </div>

      <!-- Announcements -->
      <div class="announcements">
        <h3>📣 Announcements</h3>
        <ul>
          <li>• Coaches Meeting for AA, AAA and Majors — December 20, 9:00am</li>
          <li>• Tryouts — January 10</li>
          <li>• Opening Day — February 28</li>
          <li>• Angels Day — April 11</li>
        </ul>
      </div>

    </section>
  `;

  applyPageTransition();
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

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
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
    html += `
      <li>
        <span><strong>${g.date}</strong></span>
        <span>${g.time}</span>
        <span><em>Field: ${g.field || "-"}</em></span>
        <span>${g.home} vs ${g.away}</span>
        <span>
          ${
            ["Single A", "Coach Pitch", "T-Ball"].includes(g.division)
              ? ""
              : (
                  (g.homeScore === null || g.homeScore === "") &&
                  (g.awayScore === null || g.awayScore === "")
                    ? "No score yet"
                    : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`
                )
          }
        </span>
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
            ${
              DIVISIONS.map(
                (d) =>
                  `<option value="${d}" ${
                    d === selectedDivision ? "selected" : ""
                  }>${d}</option>`
              ).join("")
            }
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
          <span><strong>${g.date}</strong></span>
          <span>${g.time}</span>
          <span><em>Field: ${g.field || "-"}</em></span>
          <span>${g.home} vs ${g.away}</span>
          <span>
            ${
              // Divisions that do NOT show scores at all
              ["Single A", "Coach Pitch", "T-Ball"].includes(g.division)
                ? ""
                : (
                    (g.homeScore === null || g.homeScore === "") &&
                    (g.awayScore === null || g.awayScore === "")
                      ? "No score yet"
                      : `${g.homeScore ?? "-"} - ${g.awayScore ?? "-"}`
                  )
            }
          </span>
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
            ${
              SCORING_DIVISIONS.map(
                (d) =>
                  `<option value="${d}" ${
                    d === selectedDivision ? "selected" : ""
                  }>${d}</option>`
              ).join("")
            }
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

  html += `
      </ul>
    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
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
        <label><strong>Coach Login:</strong></label><br>
        <input id="coach-name" placeholder="Coach Name">
        <input id="coach-pin" placeholder="PIN" type="password">
        <button onclick="loginCoach()">Login</button>
      </div>
<div style="padding:16px;">
  <textarea id="msg-input" placeholder="Enter a message"></textarea>

  <button onclick="postMessage()">Post Message</button>

  <button style="margin-left:8px;" onclick="postLeagueAlert()">
    Post as League Alert
  </button>

  <!-- NEW PUSH NOTIFICATION BUTTON -->
  <button style="margin-left:8px; background:#2196F3; color:white;"
          onclick="sendPushNotification()">
    Send Push Notification
  </button>
</div>

    </section>
  `;

  pageRoot.innerHTML = html;
  applyPageTransition();
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
    alert("Unknown coach name");
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
function postLeagueAlert() {
  if (!loggedInCoach) {
    alert("You must log in first.");
    return;
  }

  const textEl = document.getElementById("msg-input");
  const text = textEl.value;
  if (!text.trim()) return;

  // Save it like a normal message, but mark as alert (for future if needed)
  messages.push({ coach: loggedInCoach, text, isAlert: true });
  saveMessages();

  // Show the alert bar to everyone currently in the app
  showLeagueAlert(text);

  // Re-render messages list
  renderMessages();

  // Optional: clear input
  textEl.value = "";
}


// --- RESOURCES PAGE (updated order + icons) ---
function renderResources() {
  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Resources</div>
      </div>

      <ul class="roster-list">

        <!-- Local League Rules -->
        <li>
          <a href="https://docs.google.com/document/d/1QVtREnvJb_VN_ZkGh5guW5PJI_5uck6K7VjVaKEBSaY/edit?tab=t.0" target="_blank">
            <span>⚙️ Local League Rules</span>
          </a>
        </li>

        <!-- Home Run Club -->
        <li>
          <a href="https://docs.google.com/document/d/11CShzXZavE77uNQQou8dqn4bUINXCe4vOtgeT8RBq6E/edit?tab=t.0" target="_blank">
            <span>💥⚾️ Home Run Club</span>
          </a>
        </li>

        <!-- Volunteer List -->
        <li>
          <a href="https://docs.google.com/document/d/1xh7XvoNy2jounkVr0zCBJ3OnsJv-nUvwGG_cBv9PYkc/edit?tab=t.0" target="_blank">
            <span>🙋‍♂️ Volunteer List</span>
          </a>
        </li>

        <!-- Little League Rule Book -->
        <li>
          <a href="https://www.littleleague.org/playing-rules/rulebook/" target="_blank">
            <span>🧾 Little League Rulebook</span>
          </a>
        </li>

        <!-- AA Special Rules -->
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

// --- ADMIN PAGE ---
function renderAdmin() {
  if (!isAdmin) {
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Admin</div>
        </div>
        <p style="padding:16px;">
          Admin access only. Log in on the Messages tab using the admin PIN.
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
      <p style="padding:16px;">
        Use the Schedule tab to record scores for Majors / AAA / AA.
        <br><br>
        You may also use the Messages tab to broadcast updates.
      </p>
    </section>
  `;

  applyPageTransition();
}

// --- MORE PAGE ---
function renderMore() {
  const isCoach = loggedInCoach && loggedInCoach !== "Admin";

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">More</div>
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

  applyPageTransition();
}

// --- NAVIGATION LOGIC ---
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentPage = btn.dataset.page;

    if (currentPage === "home") renderHome();
    if (currentPage === "schedule") renderSchedule();
    if (currentPage === "standings") renderStandings();
    if (currentPage === "more") renderMore();
    if (currentPage === "admin") renderAdmin();
  });
});

// --- Pull to Refresh ---
let startY = 0;
let isRefreshing = false;

document.addEventListener("touchstart", (e) => {
  if (window.scrollY === 0) {
    startY = e.touches[0].clientY;
  }
});

document.addEventListener("touchmove", async (e) => {
  const currentY = e.touches[0].clientY;

  if (currentY - startY > 60 && window.scrollY === 0 && !isRefreshing) {
    isRefreshing = true;
    document.getElementById("ptr").style.display = "block";

    // Refresh schedules, ticker, standings, etc
   await loadScoresFromGoogleSheet();

if (currentPage === "home") renderHome();
if (currentPage === "schedule") renderSchedule();
if (currentPage === "standings") renderStandings();
if (currentPage === "more") renderMore();
if (currentPage === "admin") renderAdmin();


    setTimeout(() => {
      document.getElementById("ptr").style.display = "none";
      isRefreshing = false;
    }, 600);
  }
});
// ===============================
// ENABLE NOTIFICATIONS BUTTON HOOK
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("enableNotifsBtn");

    if (!btn) {
        console.warn("Enable Notifications button not found.");
        return;
    }

    btn.addEventListener("click", async () => {
        try {
            // Ask permission
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                alert("Permission denied — cannot enable notifications.");
                return;
            }

            // Get service worker
            const reg = await navigator.serviceWorker.ready;

            // Subscribe using your VAPID key
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            console.log("Push subscription:", sub);

            // Send subscription to Google Script backend
            await fetch(NOTIFY_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: btoa(JSON.stringify(sub)),
                    createdAt: new Date().toISOString()
                })
            });

            alert("Notifications enabled!");
        } catch (err) {
            console.error("Notification setup failed:", err);
            alert("Could not enable notifications.");
        }
    });
});

// === INITIAL LOAD ===
renderHome();
loadScoresFromGoogleSheet();
/* --------------------------------------------------
   END OF FILE
   - All render functions updated
   - Slide-up animation applied globally
   - Resources updated with icons + correct order
   - Schedule scoring logic corrected
   - Everything initialized cleanly
-------------------------------------------------- */
