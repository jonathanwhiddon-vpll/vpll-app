/* ----------------------------------------
   Villa Park Little League - app.js
   - Teams / Schedule / Standings / Messages
   - Coach login
   - Admin login (PIN 0709) + Admin tab
   - Simple local notification test (browser)
----------------------------------------- */

// === GLOBAL STATE ===
let games = [];
let selectedDivision = "Majors";

// === Divisions / Teams (rosters) ===
const divisions = [
  {
    name: "Majors",
    teams: [
      { name: "VIBE", coaches: ["Coach Johnson"], players: ["Logan","Sofia","Jack","Grace"] },
      { name: "Dodgers", coaches: ["Coach Lee"], players: ["Noah","Emma","James","Lily"] },
      { name: "Angels", coaches: ["Coach Brown"], players: ["Ethan","Olivia","Mason","Ava"] },
      { name: "Tigers", coaches: ["Coach Smith"], players: ["Aiden","Mia","Lucas","Harper"] },
      { name: "Cubs", coaches: ["Coach Davis"], players: ["Elijah","Zoe","Henry","Ella"] },
      { name: "Giants", coaches: ["Coach Wilson"], players: ["Oliver","Grace","Liam","Chloe"] },
    ],
  },
  {
    name: "AAA",
    teams: [
      { name: "Yankees", coaches: ["Coach Garcia"], players: ["Eli","Nora","Mateo","Isla"] },
      { name: "Pirates", coaches: ["Coach Kim"], players: ["Levi","Grace","Noah","Chloe"] },
      { name: "Mets", coaches: ["Coach Wilson"], players: ["Oliver","Luna","Henry","Ava"] },
      { name: "Braves", coaches: ["Coach Torres"], players: ["Ethan","Zoey","Luke","Mila"] },
      { name: "Athletics", coaches: ["Coach Carter"], players: ["Sofia","Liam","Jack","Hannah"] },
      { name: "Whiddon", coaches: ["Coach Jon"], players: ["Bennett","Oliver","Jackson","Sawyer"] },
      { name: "Padres", coaches: ["Coach Rivera"], players: ["Noah","Maya","Jacob","Amelia"] },
      { name: "Rangers", coaches: ["Coach Nelson"], players: ["Mason","Emily","Eli","Avery"] },
    ],
  },
  {
    name: "AA",
    teams: [
      { name: "Astros", coaches: ["Coach Adams"], players: ["Owen","Layla","Nathan","Violet"] },
      { name: "Orioles", coaches: ["Coach Foster"], players: ["James","Aria","Logan","Eleanor"] },
      { name: "Phillies", coaches: ["Coach Baker"], players: ["Lucas","Grace","Benjamin","Claire"] },
      { name: "Red Sox", coaches: ["Coach Moore"], players: ["Daniel","Ella","Leah","Jack"] },
      { name: "Cardinals", coaches: ["Coach Bennett"], players: ["Wyatt","Emma","Landon","Sophie"] },
      { name: "Blue Jays", coaches: ["Coach Long"], players: ["Connor","Aubrey","Jaxon","Lila"] },
      { name: "Mariners", coaches: ["Coach Patel"], players: ["Julian","Madelyn","Grayson","Addison"] },
      { name: "Giants", coaches: ["Coach Lee"], players: ["Evan","Nora","Theo","Hazel"] },
    ],
  },
];

// === Coach login ===
let loggedInCoach = null;
const coachPins = {
  "Coach Johnson": "1111",
  "Coach Lee": "2222",
  "Coach Brown": "3333",
  "Coach Smith": "4444",
  "Coach Davis": "5555",
  "Coach Wilson": "6666",
};

// === Admin login ===
let isAdmin = false;
const ADMIN_PIN = "0709";

// === Messages (in memory only; NOT persisted) ===
let messages = [];

function saveMessages() {
  // intentionally empty – no localStorage (per your choice)
}

// === GOOGLE SHEET CSV LINKS ===
const CSV_LINKS = {
  Majors:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=0&single=true&output=csv",
  AAA:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1857914653&single=true&output=csv",
  AA:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5YELgRFF-Ui9-t68hK0FcXcjf4_oWO3aJh8Hh3VylDU4OsbGS5Nn5Lad5FZQDK3exbBu5C3UjLAuO/pub?gid=1006784456&single=true&output=csv",
};

// === LOAD SCHEDULE FROM GOOGLE SHEET CSV ===
async function loadScheduleFromSheet(divisionName) {
  const url = CSV_LINKS[divisionName];
  games = [];

  if (!url) {
    console.warn("No CSV URL for division", divisionName);
    return;
  }

  try {
    const res = await fetch(url);
    const text = await res.text();

    const rows = text.trim().split("\n").map(r => r.split(","));
    const data = rows.slice(1); // skip header

    games = data.map((r, i) => ({
      id: i + 1,
      date: r[0] || "",
      time: r[1] || "",
      field: r[2] || "",
      home: r[3] || "",
      away: r[4] || "",
      homeScore: r[5] ? Number(r[5]) : null,
      awayScore: r[6] ? Number(r[6]) : null,
      division: divisionName,
    }));

    console.log("Loaded CSV schedule for", divisionName, games);
  } catch (err) {
    console.error("Schedule CSV load failed:", err);
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header"><div class="card-title">Error</div></div>
        <p style="padding:16px;color:red;">
          Error loading schedule: ${err.message}
        </p>
      </section>`;
  }
}

// === STANDINGS CALCULATION ===
function calculateStandings() {
  const rec = {};
  games.forEach(g => {
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

// === PUSH NOTIFICATION HELPERS (local browser only) ===
async function enableBrowserNotifications() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      alert("Notifications enabled on this device.");
    } else if (permission === "denied") {
      alert("Notifications have been blocked in this browser.");
    } else {
      alert("Notification permission is still undecided.");
    }
  } catch (err) {
    console.error(err);
    alert("Could not ask for notification permission.");
  }
}

function sendLocalTestNotification({ scope, division, team }) {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }
  if (Notification.permission !== "granted") {
    alert("Please enable notifications first.");
    return;
  }

  let scopeText = "League-wide";
  if (scope === "division") scopeText = `Division: ${division}`;
  if (scope === "team") scopeText = `Team: ${team || "Unknown Team"}`;

  new Notification("Villa Park Little League", {
    body: `Test notification\nScope: ${scopeText}`,
    tag: "vpll-test",
  });
}

// === RENDER TEAMS PAGE ===
function renderTeams() {
  const divs = ["Majors", "AAA", "AA"];
  const div = divisions.find(d => d.name === selectedDivision) || divisions[0];

  let html = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${div.name} Teams</div>
        <select id="divisionSelect">
          ${divs
            .map(d => `<option ${d === selectedDivision ? "selected" : ""}>${d}</option>`)
            .join("")}
        </select>
      </div>`;

  div.teams.forEach(t => {
    html += `
      <div style="margin-top:6px;">
        <div class="card-subtitle" style="font-size:13px;font-weight:600;">${t.name}</div>
        <div class="card-subtitle">Coach: ${t.coaches.join(", ")}</div>
        <ul class="roster-list">
          ${t.players
            .map(
              (p, i) =>
                `<li><span>${i + 1}. ${p}</span><span class="roster-role">Player</span></li>`
            )
            .join("")}
        </ul>
      </div>`;
  });

  html += `</section>`;
  pageRoot.innerHTML = html;

  document.getElementById("divisionSelect").addEventListener("change", e => {
    selectedDivision = e.target.value;
    renderTeams();
  });
}

// === RENDER SCHEDULE PAGE ===
async function renderSchedule() {
  const divs = ["Majors", "AAA", "AA"];
  await loadScheduleFromSheet(selectedDivision);

  const items = games
    .map(
      g => `
      <li>
        <span>${g.home} vs ${g.away}</span>
        <span class="record">
          ${
            g.homeScore != null && g.awayScore != null
              ? `${g.homeScore} - ${g.awayScore}`
              : "No score yet"
          }
        </span>
        <div style="font-size:0.85rem;color:#555;">${g.date} • ${g.time} • ${g.field}</div>
      </li>`
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div class="card-title">${selectedDivision} Schedule</div>
        <select id="divisionSelect">
          ${divs
            .map(d => `<option ${d === selectedDivision ? "selected" : ""}>${d}</option>`)
            .join("")}
        </select>
      </div>
      <ul class="schedule-list">
        ${items || "<li>No scheduled games.</li>"}
      </ul>
    </section>`;

  document.getElementById("divisionSelect").addEventListener("change", e => {
    selectedDivision = e.target.value;
    renderSchedule();
  });
}

// === RENDER STANDINGS PAGE ===
async function renderStandings() {
  const divs = ["Majors", "AAA", "AA"];
  await loadScheduleFromSheet(selectedDivision);
  const rows = calculateStandings();

  const items = rows
    .map(
      (r, i) => `
      <li>
        <span>${i + 1}. ${r.team}</span>
        <span class="record">${r.w}-${r.l}</span>
      </li>`
    )
    .join("");

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header" style="justify-content:space-between;">
        <div>
          <div class="card-title">${selectedDivision} Standings</div>
          <div class="card-subtitle">Auto-calculated from scores</div>
        </div>
        <select id="divisionSelect">
          ${divs
            .map(d => `<option ${d === selectedDivision ? "selected" : ""}>${d}</option>`)
            .join("")}
        </select>
      </div>
      <ul class="standings-list">
        ${items || "<li>No standings yet.</li>"}
      </ul>
    </section>`;

  document.getElementById("divisionSelect").addEventListener("change", e => {
    selectedDivision = e.target.value;
    renderStandings();
  });
}

// === RENDER MESSAGES PAGE (COACH + ADMIN) ===
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

  // Admin section
  const adminTools = isAdmin
    ? `
      <div style="margin-top:16px;padding:12px;border:2px solid red;border-radius:8px;">
        <div style="font-weight:700;color:red;margin-bottom:4px;">Admin</div>
        <button id="adminOpenToolsBtn"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;background:#cc0000;color:#fff;border:none;">
          Open Admin Tools
        </button>
        <button id="adminLogoutBtn"
          style="width:100%;padding:8px;border-radius:8px;background:#555;color:#fff;border:none;">
          Log Out Admin
        </button>
      </div>`
    : `
      <div style="margin-top:16px;padding:12px;border:2px solid red;border-radius:8px;">
        <div style="font-weight:700;color:red;margin-bottom:4px;">Admin Login</div>
        <input id="adminPin" type="password" placeholder="Admin PIN"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <button id="adminLoginBtn"
          style="width:100%;padding:8px;border-radius:8px;background:#cc0000;color:#fff;border:none;">
          Log In as Admin
        </button>
      </div>`;

  // Coach / poster tools
  const coachTools = loggedInCoach
    ? `
      <div style="margin-top:16px;">
        <textarea id="messageInput" rows="3"
          placeholder="Type announcement..."
          style="width:100%;padding:8px;border-radius:8px;"></textarea>
        <button id="sendMessageBtn"
          style="margin-top:8px;width:100%;">
          Post as ${loggedInCoach}
        </button>
        <button id="coachLogoutBtn"
          style="margin-top:8px;width:100%;background-color:#555;color:#fff;">
          Log Out (${loggedInCoach})
        </button>

        <hr style="margin:16px 0;opacity:0.3;">

        <div style="font-weight:600;margin-bottom:4px;">Notifications (test)</div>
        <button id="enableNotifBtn"
          style="margin-bottom:8px;width:100%;background:#0a74ff;color:white;">
          Enable Notifications on this device
        </button>

        <div style="font-size:0.85rem;margin-bottom:4px;">
          Send test notification to:
        </div>
        <select id="notifScope"
          style="width:100%;padding:6px;border-radius:6px;margin-bottom:6px;">
          <option value="all">Entire League</option>
          <option value="division">A Division</option>
          <option value="team">A Team</option>
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
          style="width:100%;background:#198754;color:white;">
          Send Test Notification
        </button>
      </div>`
    : `
      <div style="margin-top:16px;">
        <input id="coachName" placeholder="Coach Name"
          style="width:100%;padding:8px;border-radius:8px;margin-bottom:8px;" />
        <input id="coachPin" type="password" placeholder="PIN"
          style="width:100%;padding:8px;border-radius:8px;" />
        <button id="coachLoginBtn"
          style="margin-top:8px;width:100%;">
          Coach Log In
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
      ${coachTools}
    </section>
  `;

  // --- ADMIN events ---
  if (!isAdmin) {
    const adminLoginBtn = document.getElementById("adminLoginBtn");
    if (adminLoginBtn) {
      adminLoginBtn.addEventListener("click", () => {
        const pin = (document.getElementById("adminPin").value || "").trim();
        if (pin === ADMIN_PIN) {
          isAdmin = true;
          loggedInCoach = "Admin";
          updateNavForAdmin();
          alert("Admin access granted!");
          renderMessages();
        } else {
          alert("Wrong admin PIN.");
        }
      });
    }
  } else {
    const adminLogoutBtn = document.getElementById("adminLogoutBtn");
    const adminOpenToolsBtn = document.getElementById("adminOpenToolsBtn");

    if (adminLogoutBtn) {
      adminLogoutBtn.addEventListener("click", () => {
        isAdmin = false;
        if (loggedInCoach === "Admin") loggedInCoach = null;
        updateNavForAdmin();
        renderMessages();
      });
    }

    if (adminOpenToolsBtn) {
      adminOpenToolsBtn.addEventListener("click", () => {
        const adminBtn = [...navButtons].find(b => b.dataset.page === "admin");
        if (adminBtn) {
          clearActiveNav();
          adminBtn.classList.add("active");
        }
        renderAdminTools();
      });
    }
  }

  // --- COACH events ---
  if (!loggedInCoach) {
    const coachLoginBtn = document.getElementById("coachLoginBtn");
    if (coachLoginBtn) {
      coachLoginBtn.addEventListener("click", () => {
        const name = (document.getElementById("coachName").value || "").trim();
        const pin = (document.getElementById("coachPin").value || "").trim();

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
    const coachLogoutBtn = document.getElementById("coachLogoutBtn");
    const sendMessageBtn = document.getElementById("sendMessageBtn");
    const enableBtn = document.getElementById("enableNotifBtn");
    const testBtn = document.getElementById("testNotifBtn");

    if (coachLogoutBtn) {
      coachLogoutBtn.addEventListener("click", () => {
        loggedInCoach = null;
        renderMessages();
      });
    }

    if (sendMessageBtn) {
      sendMessageBtn.addEventListener("click", () => {
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
}

// === ADMIN TOOLS PAGE ===
function renderAdminTools() {
  if (!isAdmin) {
    pageRoot.innerHTML = `
      <section class="card">
        <div class="card-header"><div class="card-title">Admin</div></div>
        <p style="padding:16px;">
          Admin tools are restricted. Use the Admin Login section on the Messages tab.
        </p>
      </section>`;
    return;
  }

  pageRoot.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div class="card-title">Admin Tools</div>
        <div class="card-subtitle">League maintenance</div>
      </div>
      <div style="padding:16px;">
        <button id="adminReloadSchedules"
          style="width:100%;padding:10px;margin-bottom:10px;border-radius:8px;background:#0a74ff;color:#fff;border:none;">
          Reload schedules from Google Sheets
        </button>
        <button id="adminClearMessages"
          style="width:100%;padding:10px;margin-bottom:10px;border-radius:8px;background:#cc0000;color:#fff;border:none;">
          Clear ALL announcements
        </button>
        <button id="adminBackToMessages"
          style="width:100%;padding:10px;border-radius:8px;background:#555;color:#fff;border:none;">
          Back to Messages
        </button>
      </div>
    </section>
  `;

  document
    .getElementById("adminReloadSchedules")
    .addEventListener("click", async () => {
      try {
        await loadScheduleFromSheet("Majors");
        await loadScheduleFromSheet("AAA");
        await loadScheduleFromSheet("AA");
        alert("Schedules reloaded from Google Sheets.");
      } catch (e) {
        alert("Error reloading schedules.");
      }
    });

  document
    .getElementById("adminClearMessages")
    .addEventListener("click", () => {
      if (!confirm("Delete ALL announcements?")) return;
      messages = [];
      saveMessages();
      alert("All announcements cleared.");
    });

  document
    .getElementById("adminBackToMessages")
    .addEventListener("click", () => {
      const msgBtn = [...navButtons].find(b => b.dataset.page === "messages");
      if (msgBtn) {
        clearActiveNav();
        msgBtn.classList.add("active");
      }
      renderMessages();
    });
}

// === NAVIGATION ===
const pageRoot = document.getElementById("page-root");
const navButtons = document.querySelectorAll(".nav-btn");

function clearActiveNav() {
  navButtons.forEach(btn => btn.classList.remove("active"));
}

function updateNavForAdmin() {
  const adminTab = document.getElementById("adminTab");
  if (!adminTab) return;
  adminTab.style.display = isAdmin ? "inline-flex" : "none";
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    clearActiveNav();
    btn.classList.add("active");
    const page = btn.dataset.page;

    if (page === "schedule") renderSchedule();
    else if (page === "standings") renderStandings();
    else if (page === "teams") renderTeams();
    else if (page === "messages") renderMessages();
    else if (page === "admin") renderAdminTools();
    else {
      // Home
      pageRoot.innerHTML = `
        <section class="card">
          <div class="card-header"><div class="card-title">Welcome</div></div>
          <p style="padding:16px;">Select a tab to get started!</p>
        </section>`;
    }
  });
});

// === INITIAL PAGE LOAD ===
updateNavForAdmin(); // hide Admin tab initially
pageRoot.innerHTML = `
  <section class="card">
    <div class="card-header"><div class="card-title">Welcome</div></div>
    <p style="padding:16px;">Select a tab to get started!</p>
  </section>`;

// === OPTIONAL: Service Worker (if you already have service-worker.js) ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then(() => console.log("Service Worker registered"))
    .catch(err => console.error("Service Worker failed", err));
}
