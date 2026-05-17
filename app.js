const CSV_URL = "data/steps.csv?t=" + new Date().getTime();

let allRows = [];
let dateCols = [];
let dailyChart, cumChart;

let replayTimer = null;
let replayIndex = 0;
let replaySeries = [];
let replayLabels = [];

function isDateLike(col) {
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
  return row["Name"] ?? row["NAME"] ?? row["Participant"] ?? "";
}

function buildDateCols(rows) {
  const cols = Object.keys(rows[0] || {});
  return cols.filter(isDateLike).sort();
}
function getLatestDate(dateCols) {
  if (!dateCols.length) return null;
  return new Date(dateCols[dateCols.length - 1]);
}

function getMonthDateCols(dateCols, offset = 0) {
  const latestDate = getLatestDate(dateCols);
  if (!latestDate) return [];

  const target = new Date(latestDate.getFullYear(), latestDate.getMonth() + offset, 1);
  const targetYear = target.getFullYear();
  const targetMonth = target.getMonth();

  return dateCols.filter(d => {
    const dt = new Date(d);
    return dt.getFullYear() === targetYear && dt.getMonth() === targetMonth;
  });
}

function formatMonthYear(dateObj) {
  return dateObj.toLocaleString("en-GB", {
    month: "long",
    year: "numeric"
  });
}

function getSeriesForPerson(row) {
  const steps = dateCols.map(d => toNumber(row[d]));
  const cum = cumulative(steps);
  return { steps, cum };
}

function getTimeframeDateCols(cols, timeframe) {
  const sorted = [...cols].sort();
  if (timeframe === "currentMonth") {
    return getMonthDateCols(sorted);
  }

  if (timeframe === "previousMonth") {
    return getMonthDateCols(sorted, -1);
  }

  if (timeframe === "previous3Months") {
    const latestDate = getLatestDate(sorted);
    if (!latestDate) return sorted;
    const targetYear = latestDate.getFullYear();
    const targetMonth = latestDate.getMonth();
    return sorted.filter(d => {
      const dt = new Date(d);
      const mDiff = (dt.getFullYear() - targetYear) * 12 + (dt.getMonth() - targetMonth);
      return mDiff >= -2 && mDiff <= 0;
    });
  }

  const n = timeframe === "last7" ? 7
          : timeframe === "last14" ? 14
          : timeframe === "last30" ? 30
          : timeframe === "last90" ? 90
          : null;

  if (n !== null) {
    return sorted.slice(-n);
  }

  return sorted;
}

function getSelectedTimeframeLabels() {
  const select = document.getElementById("timeframeSelect");
  if (!select) return dateCols;
  const timeframe = select.value;
  const cols = getTimeframeDateCols(dateCols, timeframe);
  return cols.length ? cols : dateCols;
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat().format(n);
}

function buildLeaderboard() {
  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = "";

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

function buildMonthlyLeaderboard() {
  const tbody = document.querySelector("#monthlyLeaderboard tbody");
  const title = document.getElementById("monthlyLeaderboardTitle");

  if (!tbody || !title) return;

  tbody.innerHTML = "";

  const monthCols = getMonthDateCols(dateCols);
  const latestDate = getLatestDate(dateCols);

  if (!monthCols.length || !latestDate) {
    title.textContent = "Monthly Leaderboard";
    return;
  }

  const ranked = allRows.map(r => {
    const name = getName(r);
    const total = sum(monthCols.map(d => toNumber(r[d])));
    const activeDays = monthCols.filter(d => toNumber(r[d]) !== null).length;
    const avg = activeDays ? Math.round(total / activeDays) : 0;

    return { name, total, avg };
  }).sort((a, b) => b.total - a.total);

  title.textContent = `${formatMonthYear(latestDate)} Leaderboard`;

  ranked.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${r.name}</td><td>${fmt(r.total)}</td><td>${fmt(r.avg)}</td>`;
    tbody.appendChild(tr);
  });
}
// ...existing code...

function setStats(row, dateList = null) {
  const name = getName(row);
  const goal = toNumber(row["Daily Step Goal"]);
  const allTimeTotal = toNumber(row["Total Steps"]) ?? sum(dateCols.map(d => toNumber(row[d])));
  const cols = dateList || dateCols;
  const periodTotal = sum(cols.map(d => toNumber(row[d])));
  const avg = cols.length ? Math.round(periodTotal / cols.length) : 0;

  const { steps } = getSeriesForPerson(row);
  const filteredSteps = cols.map(d => {
    const idx = dateCols.indexOf(d);
    return idx >= 0 ? steps[idx] : null;
  });
  const best = Math.max(...filteredSteps.map(v => v ?? 0));
  const activeDays = filteredSteps.filter(v => v !== null).length;

  const statsEl = document.getElementById("stats");
  const totalDisplay = dateList ? `${fmt(periodTotal)} (all-time: ${fmt(allTimeTotal)})` : fmt(allTimeTotal);
  statsEl.innerHTML = `
    <div class="stat">Participant<b>${name}</b></div>
    <div class="stat">Total steps<b>${totalDisplay}</b></div>
    <div class="stat">Avg daily<b>${fmt(avg)}</b></div>
    <div class="stat">Best day<b>${fmt(best)}</b></div>
    <div class="stat">Days logged<b>${fmt(activeDays)}</b></div>
    <div class="stat">Daily goal<b>${goal ? fmt(goal) : "—"}</b></div>
  `;
}

// ...existing code..
function buildCharts(rows, labels = dateCols) {
  const dailyCtx = document.getElementById("dailyChart");
  const cumCtx = document.getElementById("cumChart");
  
  if (dailyChart) dailyChart.destroy();
  if (cumChart) cumChart.destroy();
  
  const dailyDatasets = rows.map(row => {
    const { steps } = getSeriesForPerson(row);
    const filtered = labels.map(l => {
      const idx = dateCols.indexOf(l);
      return idx >= 0 ? steps[idx] : null;
    });
    return {
      label: getName(row),
      data: filtered,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6
    };
  });
  
  const cumDatasets = rows.map(row => {
    const { cum } = getSeriesForPerson(row);
    const filtered = labels.map(l => {
      const idx = dateCols.indexOf(l);
      return idx >= 0 ? cum[idx] : null;
    });
    return {
      label: getName(row),
      data: filtered,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6
    };
  });
  
  dailyChart = new Chart(dailyCtx, {
    type: "line",
    data: { labels, datasets: dailyDatasets },
    options: {
      responsive: true,
      animation: { duration: 350 },
      scales: { y: { beginAtZero: true } }
    }
  });
  
  cumChart = new Chart(cumCtx, {
    type: "line",
    data: { labels, datasets: cumDatasets },
    options: {
      responsive: true,
      animation: { duration: 350 },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function onPersonChange() {
  const sel = document.getElementById("personSelect");
  const selectedNames = Array.from(sel.selectedOptions).map(opt => opt.value);
  if (selectedNames.length === 0) return;

  stopReplay();
  
  const selectedRows = selectedNames.map(name => allRows.find(r => getName(r) === name)).filter(Boolean);
  const labels = getSelectedTimeframeLabels();

  // For stats, show for the first selected person (or aggregate if needed)
  if (selectedRows.length === 1) {
    setStats(selectedRows[0], labels);
  } else {
    // Clear or show comparative stats
    document.getElementById("stats").innerHTML = `<div class="stat">Comparing ${selectedNames.length} participants</div>`;
  }
  
  buildCharts(selectedRows, labels);
  
  const playBtn = document.getElementById("playBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  playBtn.disabled = false;
  pauseBtn.disabled = false;

  replayLabels = labels;
  replaySeries = selectedRows.map(row => {
    const { steps } = getSeriesForPerson(row);
    const periodSteps = labels.map(d => {
      const idx = dateCols.indexOf(d);
      return idx >= 0 ? steps[idx] : null;
    });
    const periodTotal = sum(periodSteps);
    const periodCum = cumulative(periodSteps);
    return {
      name: getName(row),
      steps: periodSteps,
      cum: periodCum,
      periodTotal
    };
  });

  replayIndex = 0;
  setReplayText(null);
}

function setReplayText(item) {
  const el = document.getElementById("replayText");
  if (!item) {
    const timeframeSelect = document.getElementById("timeframeSelect");
    const timeframe = timeframeSelect?.value || "all";
    const label = timeframe === "all" ? "All dates" 
               : timeframe === "currentMonth" ? "Current month"
               : timeframe === "previousMonth" ? "Previous month"
               : timeframe === "last7" ? "Last 7 days"
               : timeframe === "last14" ? "Last 14 days"
               : timeframe === "last30" ? "Last 30 days"
               : timeframe === "last90" ? "Last 90 days"
               : timeframe === "previous3Months" ? "Previous 3 months"
               : "All dates";
    const periodText = replaySeries.length === 1 && replaySeries[0].periodTotal 
      ? ` • Period total: ${fmt(replaySeries[0].periodTotal)}`
      : "";
    el.textContent = `Press Play to replay ${label.toLowerCase()}${periodText}`;
    return;
  }
  if (item.count > 1) {
    el.textContent = `${item.date}: replaying ${item.count} participants`;
    return;
  }
  el.textContent = `${item.date}: ${fmt(item.steps)} steps • Total: ${fmt(item.cum)}`;
}

function playReplay() {
  stopReplay();

  const speed = Number(document.getElementById("speedSelect").value) || 500;
  replayIndex = 0;

  dailyChart.data.labels = replayLabels;
  cumChart.data.labels = replayLabels;

  dailyChart.data.datasets.forEach(ds => ds.data = replayLabels.map(() => null));
  cumChart.data.datasets.forEach(ds => ds.data = replayLabels.map(() => null));

  dailyChart.update();
  cumChart.update();

  replayTimer = setInterval(() => {
    if (replayIndex >= replayLabels.length) {
      stopReplay();
      return;
    }

    const date = replayLabels[replayIndex];
    const item = {
      date,
      count: replaySeries.length,
      steps: replaySeries[0]?.steps[replayIndex] ?? null,
      cum: replaySeries[0]?.cum[replayIndex] ?? null
    };
    setReplayText(item);

    dailyChart.data.datasets.forEach((ds, idx) => {
      ds.data = replaySeries[idx].steps.map((value, i) => i <= replayIndex ? value : null);
    });
    cumChart.data.datasets.forEach((ds, idx) => {
      ds.data = replaySeries[idx].cum.map((value, i) => i <= replayIndex ? value : null);
    });

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
  document.getElementById("updateBtn").addEventListener("click", onPersonChange);
  const timeframeSelect = document.getElementById("timeframeSelect");
  if (timeframeSelect) {
    timeframeSelect.addEventListener("change", onPersonChange);
  }
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
  // Remove change listener; use update button instead
}

function updateSelectedCount() {
  const sel = document.getElementById("personSelect");
  const countEl = document.getElementById("selectedCount");
  const c = sel.selectedOptions.length;
  countEl.textContent = c ? `${c} selected` : "";
}

function wireSelectorControls() {
  const search = document.getElementById("personSearch");
  const sel = document.getElementById("personSelect");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const clearBtn = document.getElementById("clearSelectionBtn");

  search.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    Array.from(sel.options).forEach(opt => {
      const match = !q || opt.value.toLowerCase().includes(q);
      opt.style.display = match ? "block" : "none";
    });
  });

  selectAllBtn.addEventListener("click", () => {
    Array.from(sel.options).forEach(opt => { if (opt.style.display !== 'none') opt.selected = true; });
    updateSelectedCount();
    renderSelectedChips();
  });

  clearBtn.addEventListener("click", () => {
    Array.from(sel.options).forEach(opt => opt.selected = false);
    updateSelectedCount();
    renderSelectedChips();
  });

  sel.addEventListener("change", updateSelectedCount);
  // render chips initially
  renderSelectedChips();
}

function renderSelectedChips() {
  const sel = document.getElementById("personSelect");
  const chips = document.getElementById("selectedChips");
  chips.innerHTML = "";
  Array.from(sel.selectedOptions).forEach(opt => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', `Remove ${opt.value}`);
    chip.innerHTML = `<span class="chip-label">${opt.value}</span><button class="chip-remove" aria-label="remove">×</button>`;
    // click to remove
    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      opt.selected = false;
      updateSelectedCount();
      renderSelectedChips();
    });
    // keyboard support
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') {
        opt.selected = false;
        updateSelectedCount();
        renderSelectedChips();
      }
    });
    chips.appendChild(chip);
  });
}
// ...existing code...

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

buildMonthlyLeaderboard();
buildLeaderboard();
initDropdown();
wireReplayButtons();
      wireSelectorControls();
      // Remove or comment out to start with no selection
      // document.getElementById("personSelect").selectedIndex = 0;
      // onPersonChange();  // Call only if you want initial charts
    },
    error: (err) => {
      console.error(err);
      alert("Failed to load CSV. Check the path: " + CSV_URL);
    }
  });
}

// ...existing code...
loadCSV();