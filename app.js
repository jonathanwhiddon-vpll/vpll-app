/* -----------------------------------------
   Villa Park Little League - app.js
   - Teams / Schedule / Standings / Messages / Admin
   - Coach login + Admin login
   - Google Sheet schedule (CSV)
   - Scores sync via Apps Script Web App
   - Standings auto-calculated from scores
------------------------------------------ */

// === GLOBAL STATE ===
let games = JSON.parse(localStorage.getItem("games") || "[]");
let selectedDivision = "Majors";
const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];


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
  Majors: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=0",

  AAA: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1857914653",

  AA: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1006784456",

  "Single A": "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1852143804",

  "Coach Pitch": "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=359750423",

  "T-Ball": "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=860483387"
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

// === SCORE HELPERS ===
function saveGames() {
  localStorage.setItem("games", JSON.stringify(games));
}

function calculateStandings() {
  const rec = {};
  games.forEach((g) => {
    if (!g.home || !g.away) return;

    if (!rec[g.home])
      rec[g.home] = { team: g.home, w: 0, l: 0 };
    if (!rec[g.away])
      rec[g.away] = { team: g.away, w: 0, l: 0 };

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

// === LOAD SCHEDULE FROM GOOGLE SHEET CSV ===
async function loadScheduleFromSheet(divisionName) {
  try {
    const url = CSV_LINKS[divisionName];
    if (!url) {
      alert("No CSV link configured for " + divisionName);
      return;
    }

    const response = await fetch(url);
    const text = await response.text();

    // Very basic CSV parse: date,time,field,home,away
    const lines = text.trim().split("\n");
    const newGames = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      if (row.length < 5) continue;
      const [date, time, field, home, away] = row.map((s) =>
        s.replace(/^"|"$/g, "").trim()
      );

      newGames.push({
        division: divisionName,
        date,
        time,
        field,
        home,
        away,
        homeScore: null,
        awayScore: null,
      });
    }

    // Replace any existing games for this division
    games = games.filter((g) => g.division !== divisionName).concat(newGames);
    recomputeGameIndices();
    saveGames();
  } catch (err) {
    console.error("CSV load error:", err);
    alert("Error loading schedule from Google Sheets.");
  }
}

// === LOAD SCORES FROM GOOGLE SHEETS (Apps Script) ===
async function loadScoresFromGoogleSheet() {
  try {
    const url = SHEET_API_URL;
    const response = await fetch(url);
    const data = await response.json();

    // Expecting { games: [...] } coming from Apps Script
    if (data && Array.isArray(data.games)) {
      // Merge scores by matching date/time/teams
      const incoming = data.games;
      games.forEach((g) => {
        const match = incoming.find(
          (ig) =>
            ig.division === g.division &&
            ig.date === g.date &&
            ig.time === g.time &&
            ig.home === g.home &&
            ig.away === g.away
        );
        if (match) {
          g.homeScore =
            match.homeScore === "" || match.homeScore === null
              ? null
              : Number(match.homeScore);
          g.awayScore =
            match.awayScore === "" || match.awayScore === null
              ? null
              : Number(match.awayScore);
        }
      });
      saveGames();
      console.log("Loaded scores from Google Sheets:", games);
    }
  } catch (err) {
    console.error("Google Sheets load error:", err);
  }
}

// === RENDER HOME PAGE ===
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

// === RENDER TEAMS PAGE ===
function renderTeams() {
  const divs = DIVISIONS;
  const teamsByDiv = {};

  divs.forEach((d) => {
    teamsByDiv[d] = Array.from(
      new Set(
        games
          .filter((g) => g.division === d)
          .flatMap((g) => [g.home, g.away])
          .filter(Boolean)
      )
    ).sort();
  });

  const htmlSections = divs
    .map((d) => {
      const teams = teamsByDiv[d];
      const li =
        teams.length === 0
          ? "<li>No teams yet.</li>"
          : teams.map((t) => `<li>${t}</li>`).join("");
      return `
        <section class="card">
          <div class="card-header">
            <div class="card-title">${d} Teams</div>
          </div>
          <ul class="roster-list">
            ${li}
          </ul>
        </section>
      `;
    })
    .join("");

  pageRoot.innerHTML = htmlSections;
}

// === RENDER SCHEDULE PAGE ===
async function renderSchedule() {
  const divs = DIVISIONS;

  const filteredGames = games.filter(
    (g) => g.division === selectedDivision
  );

  const items = filteredGames
    .map(
      (g) => `
      <li class="schedule-item">
        <div style="font-weight:600;">
          ${g.home || "TBD"} vs ${g.away || "TBD"}
        </div>
        <div style="font-size:0.85rem;color:#555;">
          ${g.date} • ${g.time} • ${g.field}
        </div>
        <div style="margin-top:4px;">
          ${
            g.homeScore != null && g.awayScore != null
              ? `${g.homeScore} - ${g.awayScore}`
              : "No score yet"
          }
        </div>
      </li>
    `
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Schedule</div>
        <button id="refreshScheduleBtn" style="font-size:0.8rem;">Reload from Sheets</button>
      </div>
      <div style="padding:0 16px 8px;">
        <label for="divisionSelect" style="font-size:0.85rem;margin-right:8px;">
          Division:
        </label>
        <select id="divisionSelect">
          ${divs
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
        ${items || "<li>No scheduled games.</li>"}
      </ul>
    </section>
  `;

  document
    .getElementById("divisionSelect")
    .addEventListener("change", (e) => {
      selectedDivision = e.target.value;
      renderSchedule();
    });

  document
    .getElementById("refreshScheduleBtn")
    .addEventListener("click", async () => {
      await loadScheduleFromSheet(selectedDivision);
      await loadScoresFromGoogleSheet();
      renderSchedule();
    });
}

// === RENDER STANDINGS PAGE ===
function renderStandings() {
  const all = calculateStandings();
  const byDiv = {};
  DIVISIONS.forEach((d) => (byDiv[d] = []));
  all.forEach((r) => {
    const teamGames = games.filter(
      (g) => g.home === r.team || g.away === r.team
    );
    const div =
      teamGames[0]?.division || "Majors"; // fallback
    if (!byDiv[div]) byDiv[div] = [];
    byDiv[div].push(r);
  });

  const sections = DIVISIONS.map((d) => {
    const rows = byDiv[d] || [];
    const body =
      rows.length === 0
        ? `<tr><td colspan="3">No results yet.</td></tr>`
        : rows
            .map(
              (r) => `
          <tr>
            <td>${r.team}</td>
            <td>${r.w}</td>
            <td>${r.l}</td>
          </tr>
        `
            )
            .join("");

    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">${d} Standings</div>
        </div>
        <div style="overflow-x:auto;">
          <table class="standings-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
              </tr>
            </thead>
            <tbody>
              ${body}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");

  pageRoot.innerHTML = sections;
}

// === RENDER MESSAGES PAGE (COACH + ADMIN) ===
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

  // Admin panel or login
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
        <button id="adminLogin"
          style="width:100%;padding:8px;background:#c00;color:#fff;border:none;border-radius:8px;">
          Log In as Admin
        </button>
      </div>`;

  // Coach tools (login or post)
  const coachTools = loggedInCoach
    ? `
      <div style="margin-top:16px;">
        <textarea id="messageInput" rows="3"
          placeholder="Type announcement..."
          style="width:100%;padding:8px;border-radius:8px;"></textarea>
        <button id="sendMessageBtn"
          style="margin-top:8px;width:100%;">Post as ${loggedInCoach}</button>
        <button id="logoutBtn"
          style="margin-top:8px;width:100%;background-color:#555;color:#fff;">
          Log Out (Coach)
        </button>

        <hr style="margin:16px 0;opacity:0.3;">

        <div style="font-weight:600;margin-bottom:4px;">Notifications (test)</div>
        <button id="enableNotifBtn"
          style="margin-bottom:8px;width:100%;background:#0a74ff;color:white;border:none;border-radius:6px;">
          Enable notifications on this device
        </button>

        <div style="font-size:0.85rem;margin-bottom:4px;">Send test notification to:</div>
        <select id="notifScope"
          style="width:100%;padding:6px;border-radius:6px;margin-bottom:6px;">
          <option value="all">Entire League</option>
          <option value="division">Division only</option>
          <option value="team">Single Team</option>
        </select>

        <select id="notifDivision"
          style="width:100%;padding:6px;border-radius:6px;margin-bottom:6px;">
          <option value="Majors">Majors</option>
          <option value="AAA">AAA</option>
          <option value="AA">AA</option>
        </select>

        <input id="notifTeam" placeholder="Team name (for Team scope)"
          style="width:100%;padding:6px;border-radius:6px;margin-bottom:6px;" />

        <button id="testNotifBtn"
          style="width:100%;background:#198754;color:white;border:none;border-radius:6px;">
          Send Test Notification
        </button>
      </div>`
    : `
      <div style="margin-top:16px;">
        <input id="coachName" placeholder="Coach Name"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <input id="coachPin" type="password" placeholder="PIN"
          style="width:100%;padding:8px;border-radius:8px;" />
        <button id="loginBtn" style="margin-top:8px;width:100%;">Coach Log In</button>
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

  // === Admin login / tools ===
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

    document.getElementById("adminLogout").addEventListener("click", () => {
      isAdmin = false;
      if (loggedInCoach === "Admin") loggedInCoach = null;
      updateNavForAdmin();
      renderMessages();
    });
  }

  // === Coach login / logout / post ===
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
    document
      .getElementById("logoutBtn")
      .addEventListener("click", () => {
        loggedInCoach = null;
        renderMessages();
      });
  }

  const sendBtn = document.getElementById("sendMessageBtn");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const input = document.getElementById("messageInput");
      const text = input.value.trim();
      if (!text) return;

      const now = new Date().toLocaleString();
      messages.unshift({ author: loggedInCoach || "Admin", text, time: now });
      saveMessages();
      input.value = "";
      renderMessages();
    });
  }

  // Notifications wiring
  const enableBtn = document.getElementById("enableNotifBtn");
  const testBtn = document.getElementById("testNotifBtn");

  if (enableBtn) {
    enableBtn.addEventListener("click", enableBrowserNotifications);
  }
  if (testBtn) {
    testBtn.addEventListener("click", () => {
      const scope = document.getElementById("notifScope").value;
      const division = document.getElementById("notifDivision").value;
      const team = document.getElementById("notifTeam").value.trim();
      sendLocalTestNotification({ scope, division, team });
    });
  }
}

// === SIMPLE LOCAL NOTIFICATIONS (test only) ===
function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      new Notification("VPLL", {
        body: "Notifications enabled for this device.",
      });
    } else {
      alert("Notifications not granted.");
    }
  });
}

function sendLocalTestNotification({ scope, division, team }) {
  if (Notification.permission !== "granted") {
    alert("Notifications not allowed yet. Please enable first.");
    return;
  }
  let body = "Test notification for the entire league.";
  if (scope === "division") body = `Test notification for ${division}`;
  if (scope === "team") body = `Test notification for team: ${team || "?"}`;

  new Notification("VPLL Test", { body });
}

// === NAVIGATION ===
const pageRoot = document.getElementById("page-root");
const navButtons = document.querySelectorAll(".nav-btn");

function clearActiveNav() {
  navButtons.forEach((btn) => btn.classList.remove("active"));
}

function updateNavForAdmin() {
  const adminTab = document.getElementById("adminTab");
  if (!adminTab) return;
  if (isAdmin) {
    adminTab.style.display = "flex";
  } else {
    adminTab.style.display = "none";
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    clearActiveNav();
    btn.classList.add("active");

    const page = btn.dataset.page;

    if (page === "schedule") renderSchedule();
    else if (page === "standings") renderStandings();
    else if (page === "teams") renderTeams();
    else if (page === "messages") renderMessages();
    else if (page === "admin") {
      if (isAdmin) {
        renderMessages(); // admin tools live on Messages page
      } else {
        alert("Admin access only.");
      }
    } else {
      renderHome();
    }
  });
});

// === INITIAL PAGE LOAD ===
updateNavForAdmin(); // hide Admin tab for non-admin
pageRoot.innerHTML = `
  <section class="card">
    <div class="card-header">
      <div class="card-title">Welcome</div>
    </div>
    <p style="padding:16px;">Select a tab to get started!</p>
  </section>
`;

// Optionally: preload schedule + scores on first load
(async () => {
  try {
    await loadScheduleFromSheet("Majors");
    await loadScheduleFromSheet("AAA");
    await loadScoresFromGoogleSheet();
  } catch (e) {
    console.warn("Initial preload error:", e);
  }
})();
