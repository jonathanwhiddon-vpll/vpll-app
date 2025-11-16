/* -----------------------------------------
   Villa Park Little League - app.js
   - Schedule / Standings / Teams / Messages / Admin
   - Loads schedule from Google Sheets (CSV)
   - Scores & standings for: Majors, AAA, AA
   - Admin-only "Report Score" for now (PIN 0709)
------------------------------------------ */

// === GLOBAL STATE ===
let games = JSON.parse(localStorage.getItem("games") || "[]");
let selectedDivision = "Majors";

// Divisions in your league
const DIVISIONS = ["Majors", "AAA", "AA", "Single A", "Coach Pitch", "T-Ball"];

// Divisions that keep score
const SCORE_DIVISIONS = ["Majors", "AAA", "AA"];

// === GOOGLE SHEET CSV LINKS ===
// One tab per division (all same spreadsheet ID with different gid)
const CSV_LINKS = {
  Majors: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=0",
  AAA: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1857914653",
  AA: "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1006784456",
  "Single A": "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=1852143804",
  "Coach Pitch": "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=359750423",
  "T-Ball": "https://docs.google.com/spreadsheets/d/1Fh4_dKYj8dWQZaqCoF3qkkec2fQKQxrusGCeZScuqh8/export?format=csv&gid=860483387"
};


// === ADMIN & MESSAGES ===
let isAdmin = false;
const ADMIN_PIN = "0709";

let messages = JSON.parse(localStorage.getItem("messages") || "[]");

// === HELPERS ===
function saveGames() {
  localStorage.setItem("games", JSON.stringify(games));
}

function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

// give every game a stable index so we can hook Report Score
function recomputeGameIndices() {
  games.forEach((g, i) => {
    g._idx = i;
  });
}
recomputeGameIndices();

// === LOAD SCHEDULE FOR ONE DIVISION FROM CSV ===
async function loadScheduleFromSheet(divisionName) {
  const url = CSV_LINKS[divisionName];
  if (!url) return;

  try {
    const res = await fetch(url);
    const text = await res.text();

    const lines = text.trim().split(/\r?\n/);
    if (lines.length <= 1) return;

    const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());

    const dateIdx = headers.indexOf("Date");
    const timeIdx = headers.indexOf("Time");
    const fieldIdx = headers.indexOf("Field");
    const homeIdx = headers.indexOf("Home");
    const awayIdx = headers.indexOf("Away");
    const homeScoreIdx = headers.indexOf("Home Score");
    const awayScoreIdx = headers.indexOf("Away Score");

    const newGames = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
      if (!cols[homeIdx] || !cols[awayIdx]) continue;

      const g = {
        division: divisionName,
        date: dateIdx >= 0 ? cols[dateIdx] : "",
        time: timeIdx >= 0 ? cols[timeIdx] : "",
        field: fieldIdx >= 0 ? cols[fieldIdx] : "",
        home: cols[homeIdx] || "",
        away: cols[awayIdx] || "",
        homeScore: null,
        awayScore: null
      };

      if (homeScoreIdx >= 0 && cols[homeScoreIdx] !== "") {
        g.homeScore = Number(cols[homeScoreIdx]);
      }
      if (awayScoreIdx >= 0 && cols[awayScoreIdx] !== "") {
        g.awayScore = Number(cols[awayScoreIdx]);
      }

      newGames.push(g);
    }

    // Remove old games from this division, add new
    games = games.filter(g => g.division !== divisionName).concat(newGames);
    recomputeGameIndices();
    saveGames();
  } catch (err) {
    console.error("Error loading schedule for", divisionName, err);
    alert(`Error loading schedule for ${divisionName}`);
  }
}

// === STANDINGS (only use score-keeping divisions) ===
function calculateStandingsForDivision(division) {
  const rec = {};
  games
    .filter(g => g.division === division)
    .forEach(g => {
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

// === SCORE ENTRY (Admin-only "Report Score") ===
function reportScore(gameIdx) {
  if (!isAdmin) {
    alert("Only Admin can report scores right now.");
    return;
  }

  const game = games.find(g => g._idx === gameIdx);
  if (!game) return;

  const hs = prompt(`Enter Home score for ${game.home}:`, game.homeScore != null ? game.homeScore : "");
  if (hs === null) return;

  const as = prompt(`Enter Away score for ${game.away}:`, game.awayScore != null ? game.awayScore : "");
  if (as === null) return;

  const hsNum = parseInt(hs, 10);
  const asNum = parseInt(as, 10);

  if (Number.isNaN(hsNum) || Number.isNaN(asNum)) {
    alert("Please enter valid numbers for scores.");
    return;
  }

  game.homeScore = hsNum;
  game.awayScore = asNum;
  saveGames();

  // Refresh schedule & standings views
  renderSchedule();
  renderStandings();
}

// Expose for inline onclick
window.reportScore = reportScore;

// === PAGE ROOT & NAV ===
const pageRoot = document.getElementById("page-root");
const navButtons = document.querySelectorAll(".nav-btn");

function clearActiveNav() {
  navButtons.forEach(btn => btn.classList.remove("active"));
}

function updateNavForAdmin() {
  const adminTab = document.getElementById("adminTab");
  if (!adminTab) return;
  adminTab.style.display = isAdmin ? "flex" : "none";
}

// === RENDER FUNCTIONS ===

// HOME
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

// TEAMS (derived from schedule data)
function renderTeams() {
  const sections = DIVISIONS.map(div => {
    const teams = Array.from(
      new Set(
        games
          .filter(g => g.division === div)
          .flatMap(g => [g.home, g.away])
          .filter(Boolean)
      )
    ).sort();

    const li =
      teams.length === 0
        ? "<li>No teams yet.</li>"
        : teams.map(t => `<li>${t}</li>`).join("");

    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">${div} Teams</div>
        </div>
        <ul class="roster-list">
          ${li}
        </ul>
      </section>
    `;
  }).join("");

  pageRoot.innerHTML = sections;
}

// SCHEDULE
async function renderSchedule() {
  // If this division has no games yet, load from Sheet
  if (!games.some(g => g.division === selectedDivision)) {
    await loadScheduleFromSheet(selectedDivision);
  }

  const filteredGames = games.filter(g => g.division === selectedDivision);

  const items =
    filteredGames
      .map(g => {
        const scoreLine =
          g.homeScore != null && g.awayScore != null
            ? `${g.homeScore} - ${g.awayScore}`
            : "No score yet";

        const canScore =
          isAdmin && SCORE_DIVISIONS.includes(selectedDivision);

        const scoreButton = canScore
          ? `<button 
                style="margin-top:4px;padding:4px 8px;border:none;border-radius:6px;background:#c00;color:#fff;font-size:0.8rem;"
                onclick="reportScore(${g._idx})">
                Report Score
             </button>`
          : "";

        return `
          <li class="schedule-item">
            <div style="font-weight:600;">${g.home} vs ${g.away}</div>
            <div style="font-size:0.85rem;color:#555;">
              ${g.date} • ${g.time} • ${g.field}
            </div>
            <div style="margin-top:4px;">${scoreLine}</div>
            ${scoreButton}
          </li>
        `;
      })
      .join("") || "<li>No scheduled games.</li>";

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Schedule</div>
        <button id="refreshScheduleBtn" style="font-size:0.8rem;">Reload</button>
      </div>
      <div style="padding:0 16px 8px;">
        <label for="divisionSelect" style="font-size:0.85rem;margin-right:8px;">Division:</label>
        <select id="divisionSelect">
          ${DIVISIONS.map(
            d =>
              `<option value="${d}" ${
                d === selectedDivision ? "selected" : ""
              }>${d}</option>`
          ).join("")}
        </select>
      </div>
      <ul class="schedule-list">
        ${items}
      </ul>
    </section>
  `;

  document.getElementById("divisionSelect").addEventListener("change", e => {
    selectedDivision = e.target.value;
    renderSchedule();
  });

  document
    .getElementById("refreshScheduleBtn")
    .addEventListener("click", async () => {
      await loadScheduleFromSheet(selectedDivision);
      renderSchedule();
    });
}

// STANDINGS (only Majors / AAA / AA)
function renderStandings() {
  const sections = SCORE_DIVISIONS.map(div => {
    const rows = calculateStandingsForDivision(div);

    const body =
      rows.length === 0
        ? `<tr><td colspan="3">No results yet.</td></tr>`
        : rows
            .map(
              r => `
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
          <div class="card-title">${div} Standings</div>
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

// MESSAGES (Admin + basic league messages)
function renderMessages() {
  const htmlMsgs = messages
    .map(
      m => `
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

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">League Messages</div>
      </div>
      <ul class="roster-list">
        ${htmlMsgs || "<li>No messages yet.</li>"}
      </ul>
      ${adminTools}
      <div style="margin-top:16px;">
        <textarea id="messageInput" rows="3"
          placeholder="Type announcement..."
          style="width:100%;padding:8px;border-radius:8px;"></textarea>
        <button id="sendMessageBtn"
          style="margin-top:8px;width:100%;">Post Announcement</button>
      </div>
    </section>
  `;

  // Admin login / tools
  if (!isAdmin) {
    const adminLoginBtn = document.getElementById("adminLogin");
    adminLoginBtn.addEventListener("click", () => {
      const pin = document.getElementById("adminPin").value.trim();
      if (pin === ADMIN_PIN) {
        isAdmin = true;
        alert("Admin access granted!");
        updateNavForAdmin();
        renderMessages();
      } else {
        alert("Wrong admin PIN.");
      }
    });
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
      updateNavForAdmin();
      renderMessages();
    });
  }

  // Post messages (anyone can, or you can restrict later)
  document
    .getElementById("sendMessageBtn")
    .addEventListener("click", () => {
      const input = document.getElementById("messageInput");
      const text = input.value.trim();
      if (!text) return;
      const now = new Date().toLocaleString();
      messages.unshift({ author: isAdmin ? "Admin" : "League", text, time: now });
      saveMessages();
      input.value = "";
      renderMessages();
    });
}

// ADMIN TAB (for future expansion)
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
        <p>Admin tools live mostly on the Messages and Schedule tabs for now.</p>
        <p>Use "Report Score" on Schedule and the Admin Panel on Messages.</p>
      </div>
    </section>
  `;
}

// === NAVIGATION SETUP ===
navButtons.forEach(btn => {
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

// === INITIAL LOAD ===
updateNavForAdmin();
renderHome();

// Optionally: preload Majors & AAA & AA once on first load
(async () => {
  try {
    await loadScheduleFromSheet("Majors");
    await loadScheduleFromSheet("AAA");
    await loadScheduleFromSheet("AA");
  } catch (e) {
    console.warn("Initial preload error:", e);
  }
})();
