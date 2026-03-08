const CSV_URL = "data/steps.csv";

let allRows = [];
let dateCols = [];
let dailyChart, cumChart;

let replayTimer = null;
let replayIndex = 0;
let replaySeries = [];

function isDateLike(col) {
  // Your export has ISO-looking dates like 2026-01-01
  return /^\d{4}-\d{2}-\d{2}$/.test(col.trim());
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "n.a" || s.toLowerCase() === "na") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function sum(arr) {
  return arr.reduce((a, b) => a + (b ?? 0), 0);
}

function cumulative(arr) {
  let c = 0;
  return arr.map(v => (c += (v ?? 0)));
}

function getName(row) {
  // In your file it’s "Name"
  return row["Name"] ?? row["NAME"] ?? row["Participant"] ?? "";
}

function buildDateCols(rows) {
  const cols = Object.keys(rows[0] || {});
  return cols.filter(isDateLike).sort(); // keep chronological
}

function getSeriesForPerson(row) {
  const steps = dateCols.map(d => toNumber(row[d]));
  const cum = cumulative(steps);
  return { steps, cum };
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat().format(n);
}

function buildLeaderboard() {
  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = "";

  // Prefer "Total Steps" column if present; otherwise compute from dates
  const ranked = allRows.map(r => {
    const name = getName(r);
    const total = toNumber(r["Total Steps"]) ?? sum(dateCols.map(d => toNumber(r[d])));
    const avg = toNumber(r["Avg Daily Steps"]) ?? Math.round(total / dateCols.length);
    return { name, total, avg };
  }).sort((a, b) => b.total - a.total);

  ranked.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${r.name}</td><td>${fmt(r.total)}</td><td>${fmt(r.avg)}</td>`;
    tbody.appendChild(tr);
  });
}

function setStats(row) {
  const name = getName(row);
  const goal = toNumber(row["Daily Step Goal"]);
  const total = toNumber(row["Total Steps"]) ?? sum(dateCols.map(d => toNumber(row[d])));
  const avg = toNumber(row["Avg Daily Steps"]) ?? Math.round(total / dateCols.length);

  const { steps } = getSeriesForPerson(row);
  const best = Math.max(...steps.map(v => v ?? 0));
  const activeDays = steps.filter(v => v !== null).length;

  const statsEl = document.getElementById("stats");
  statsEl.innerHTML = `
    <div class="stat">Participant<b>${name}</b></div>
    <div class="stat">Total steps<b>${fmt(total)}</b></div>
    <div class="stat">Avg daily<b>${fmt(avg)}</b></div>
    <div class="stat">Best day<b>${fmt(best)}</b></div>
    <div class="stat">Days logged<b>${fmt(activeDays)}</b></div>
    <div class="stat">Daily goal<b>${goal ? fmt(goal) : "—"}</b></div>
  `;
}

function buildCharts(row) {
  const labels = dateCols;
  const { steps, cum } = getSeriesForPerson(row);

  const dailyCtx = document.getElementById("dailyChart");
  const cumCtx = document.getElementById("cumChart");

  if (dailyChart) dailyChart.destroy();
  if (cumChart) cumChart.destroy();

  dailyChart = new Chart(dailyCtx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Steps", data: steps }]
    },
    options: {
      responsive: true,
      animation: false,
      scales: { y: { beginAtZero: true } }
    }
  });

  cumChart = new Chart(cumCtx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Cumulative", data: cum }]
    },
    options: {
      responsive: true,
      animation: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}

function onPersonChange() {
  const sel = document.getElementById("personSelect");
  const name = sel.value;
  const row = allRows.find(r => getName(r) === name);
  if (!row) return;

  stopReplay();
  setStats(row);
  buildCharts(row);

  // prep replay
  const { steps, cum } = getSeriesForPerson(row);
  replaySeries = dateCols.map((d, i) => ({ date: d, steps: steps[i], cum: cum[i] }));
  replayIndex = 0;
  setReplayText(null);
}

function setReplayText(item) {
  const el = document.getElementById("replayText");
  if (!item) {
    el.textContent = "Press Play to replay day-by-day.";
    return;
  }
  el.textContent = `${item.date}: ${fmt(item.steps)} steps • Total: ${fmt(item.cum)}`;
}

function playReplay() {
  stopReplay();
  const speed = Number(document.getElementById("speedSelect").value) || 500;

  replayTimer = setInterval(() => {
    if (replayIndex >= replaySeries.length) {
      stopReplay();
      return;
    }
    const item = replaySeries[replayIndex];
    setReplayText(item);

    // Update charts progressively (show “wrap-up” effect)
    const partialSteps = replaySeries.slice(0, replayIndex + 1).map(x => x.steps);
    const partialCum = replaySeries.slice(0, replayIndex + 1).map(x => x.cum);

    dailyChart.data.datasets[0].data = partialSteps;
    cumChart.data.datasets[0].data = partialCum;

    // Keep labels aligned
    dailyChart.data.labels = replaySeries.slice(0, replayIndex + 1).map(x => x.date);
    cumChart.data.labels = replaySeries.slice(0, replayIndex + 1).map(x => x.date);

    dailyChart.update();
    cumChart.update();

    replayIndex += 1;
  }, speed);
}

function stopReplay() {
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
}

function wireReplayButtons() {
  document.getElementById("playBtn").addEventListener("click", playReplay);
  document.getElementById("pauseBtn").addEventListener("click", stopReplay);
}

function initDropdown() {
  const sel = document.getElementById("personSelect");
  sel.innerHTML = "";
  const names = allRows.map(getName).filter(Boolean).sort((a, b) => a.localeCompare(b));
  names.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", onPersonChange);
}

function loadCSV() {
  Papa.parse(CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      allRows = res.data;
      if (!allRows.length) {
        alert("No data found in CSV.");
        return;
      }
      dateCols = buildDateCols(allRows);

      buildLeaderboard();
      initDropdown();
      wireReplayButtons();

      // default selection
      document.getElementById("personSelect").selectedIndex = 0;
      onPersonChange();
    },
    error: (err) => {
      console.error(err);
      alert("Failed to load CSV. Check the path: " + CSV_URL);
    }
  });
}

loadCSV();
