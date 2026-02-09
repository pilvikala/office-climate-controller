async function fetchJson(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

async function loadTargetTemperature() {
  try {
    const data = await fetchJson("/api/temperature/target");
    const input = document.getElementById("target-input");
    input.value = data.targetTemperature.toFixed(1);
    const effective = document.getElementById("effective-status");
    if (effective) {
      if (data.source === "schema" && data.schemaId != null) {
        const modeLabel = data.mode === "in-office" ? "in-office" : "out-of-office";
        effective.textContent = `Using active schema (ID ${data.schemaId}), ${modeLabel} target ${data.targetTemperature.toFixed(
          1,
        )} °C.`;
      } else {
        effective.textContent = `Using default target temperature (${data.targetTemperature.toFixed(1)} °C).`;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadTemperatureStatus() {
  try {
    const data = await fetchJson("/api/temperature/status");

    const currentDisplay = document.getElementById("current-temp-display");
    const currentTimestamp = document.getElementById("current-temp-timestamp");
    const desiredDisplay = document.getElementById("desired-temp-display");
    const desiredSource = document.getElementById("desired-temp-source");

    if (data.currentTemperature != null) {
      currentDisplay.textContent = data.currentTemperature.toFixed(1);

      if (data.currentTemperatureTimestamp && currentTimestamp) {
        const ts = data.currentTemperatureTimestamp;
        const hasZone = ts.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(ts);
        const utcString = hasZone ? ts : ts.replace(" ", "T") + "Z";
        const time = new Date(utcString);
        currentTimestamp.textContent = `Last reading: ${time.toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })}`;
      }
    } else {
      currentDisplay.textContent = "--";
      if (currentTimestamp) {
        currentTimestamp.textContent = "No recent temperature readings yet.";
      }
    }

    if (desiredDisplay && desiredSource) {
      desiredDisplay.textContent = data.targetTemperature.toFixed(1);

      if (data.targetSource === "schema" && data.targetSchemaId != null) {
        const modeLabel = data.targetMode === "in-office" ? "in-office" : "out-of-office";
        desiredSource.textContent = `From active schema (ID ${data.targetSchemaId}), ${modeLabel} target.`;
      } else {
        desiredSource.textContent = "From default target temperature setting.";
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function saveTargetTemperature() {
  const input = document.getElementById("target-input");
  const status = document.getElementById("status-message");
  const value = Number(input.value);

  status.textContent = "";

  if (!Number.isFinite(value)) {
    status.textContent = "Please enter a valid number.";
    status.classList.add("status-error");
    return;
  }

  try {
    await fetchJson("/api/temperature/target", {
      method: "POST",
      body: JSON.stringify({ targetTemperature: value }),
    });
    status.textContent = "Target temperature saved.";
    status.classList.remove("status-error");
    status.classList.add("status-ok");
    await loadTemperatureStatus();
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to save target temperature.";
    status.classList.add("status-error");
  }
}

async function sendCurrentTemperature() {
  const input = document.getElementById("current-input");
  const value = Number(input.value);

  if (!Number.isFinite(value)) {
    alert("Please enter a valid current temperature.");
    return;
  }

  try {
    await fetchJson("/api/temperature/current", {
      method: "POST",
      body: JSON.stringify({ temperature: value }),
    });
    input.value = "";
    await loadHistoryChart();
    await loadTemperatureStatus();
  } catch (err) {
    console.error(err);
    alert("Failed to log current temperature.");
  }
}

let historyChartInstance = null;

async function loadHistoryChart() {
  try {
    const data = await fetchJson("/api/temperature/history?limit=500");
    const container = document.getElementById("history-chart");
    if (!container) return;

    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;

    const points = data.history
      .map((row) => {
        const hasZone = row.timestamp.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(row.timestamp);
        const utcString = hasZone ? row.timestamp : row.timestamp.replace(" ", "T") + "Z";
        const t = new Date(utcString).getTime();
        return { t, temperature: row.temperature };
      })
      .filter((p) => p.t >= cutoff)
      .sort((a, b) => a.t - b.t);

    container.innerHTML = "";

    if (points.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No readings in the last 24 hours yet.";
      container.appendChild(empty);
      return;
    }

    const labels = points.map((p) =>
      new Date(p.t).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    const temps = points.map((p) => p.temperature);

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof Chart === "undefined") return;

    if (historyChartInstance) {
      historyChartInstance.destroy();
    }

    historyChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperature (°C)",
            data: temps,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.18)",
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: {
              color: "rgba(148, 163, 184, 0.15)",
            },
            ticks: {
              color: "#9ca3af",
              maxTicksLimit: 8,
            },
          },
          y: {
            grid: {
              color: "rgba(30, 64, 175, 0.4)",
            },
            ticks: {
              color: "#9ca3af",
              callback: (value) => value + "°",
            },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: "#e5e7eb",
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toFixed(1)} °C`,
            },
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
  }
}

// ----- Schema UI -----

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let currentSchemaId = null;
let activeSchemaId = null;

function buildSchemaDayRows() {
  const container = document.getElementById("schema-days");
  container.innerHTML = "";
  DAY_LABELS.forEach((label, dayIndex) => {
    const row = document.createElement("div");
    row.className = "schema-day-row";
    row.innerHTML = `
      <span class="schema-day-label">${label}</span>
      <input id="day-${dayIndex}-start" type="time" />
      <input id="day-${dayIndex}-end" type="time" />
    `;
    container.appendChild(row);
  });
}

function clearSchemaForm() {
  currentSchemaId = null;
  document.getElementById("schema-name").value = "";
  document.getElementById("schema-description").value = "";
  document.getElementById("schema-in-temp").value = "";
  document.getElementById("schema-out-temp").value = "";
  document.getElementById("schema-status").textContent = "";
  for (let i = 0; i < DAY_LABELS.length; i++) {
    document.getElementById(`day-${i}-start`).value = "";
    document.getElementById(`day-${i}-end`).value = "";
  }
}

function fillSchemaForm(schema) {
  clearSchemaForm();
  currentSchemaId = schema.id;
  document.getElementById("schema-name").value = schema.name || "";
  document.getElementById("schema-description").value = schema.description || "";
  document.getElementById("schema-in-temp").value = schema.inOfficeTemperature.toFixed(1);
  document.getElementById("schema-out-temp").value = schema.outOfOfficeTemperature.toFixed(1);
  document.getElementById("schema-status").textContent = "";

  const byDay = {};
  (schema.intervals || []).forEach((p) => {
    const existing = byDay[p.dayOfWeek];
    if (!existing || p.startTimeMinutes > existing.startTimeMinutes) {
      byDay[p.dayOfWeek] = p;
    }
  });

  for (let day = 0; day < DAY_LABELS.length; day++) {
    const p = byDay[day];
    if (!p) continue;
    const startH = String(Math.floor(p.startTimeMinutes / 60)).padStart(2, "0");
    const startM = String(p.startTimeMinutes % 60).padStart(2, "0");
    const endH = String(Math.floor(p.endTimeMinutes / 60)).padStart(2, "0");
    const endM = String(p.endTimeMinutes % 60).padStart(2, "0");
    document.getElementById(`day-${day}-start`).value = `${startH}:${startM}`;
    document.getElementById(`day-${day}-end`).value = `${endH}:${endM}`;
  }
}

async function loadSchemasDropdown() {
  try {
    const [listRes, activeRes] = await Promise.all([
      fetchJson("/api/schemas"),
      fetchJson("/api/schemas-active"),
    ]);
    const select = document.getElementById("schema-select");
    select.innerHTML = "";

    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "None (default only)";
    select.appendChild(noneOption);

    listRes.schemas.forEach((s) => {
      const option = document.createElement("option");
      option.value = String(s.id);
      option.textContent = s.name + (s.isActive ? " (active)" : "");
      select.appendChild(option);
    });

    activeSchemaId = activeRes.schema ? activeRes.schema.id : null;

    if (activeSchemaId != null) {
      select.value = String(activeSchemaId);
      try {
        const data = await fetchJson(`/api/schemas/${activeSchemaId}`);
        fillSchemaForm(data.schema);
      } catch (err) {
        console.error(err);
      }
    } else {
      select.value = "";
      clearSchemaForm();
    }
  } catch (err) {
    console.error(err);
  }
}

async function onSchemaSelectChange() {
  const select = document.getElementById("schema-select");
  const value = select.value;
  if (!value) {
    clearSchemaForm();
    return;
  }
  const id = Number(value);
  if (!Number.isFinite(id)) return;
  try {
    const data = await fetchJson(`/api/schemas/${id}`);
    fillSchemaForm(data.schema);
  } catch (err) {
    console.error(err);
  }
}

function collectSchemaFromForm() {
  const name = document.getElementById("schema-name").value.trim();
  const description = document.getElementById("schema-description").value.trim() || null;
  const inTempValue = Number(document.getElementById("schema-in-temp").value);
  const outTempValue = Number(document.getElementById("schema-out-temp").value);
  const intervals = [];

  for (let day = 0; day < DAY_LABELS.length; day++) {
    const start = document.getElementById(`day-${day}-start`).value;
    const end = document.getElementById(`day-${day}-end`).value;
    if (!start && !end) continue;

    intervals.push({ dayOfWeek: day, start, end });
  }

  return { name, description, inOfficeTemperature: inTempValue, outOfOfficeTemperature: outTempValue, intervals };
}

async function saveSchema() {
  const status = document.getElementById("schema-status");
  status.textContent = "";

  const { name, description, inOfficeTemperature, outOfOfficeTemperature, intervals } = collectSchemaFromForm();

  if (!name) {
    status.textContent = "Please enter a schema name.";
    status.classList.add("status-error");
    return;
  }

  if (!Number.isFinite(inOfficeTemperature) || !Number.isFinite(outOfOfficeTemperature)) {
    status.textContent = "Please enter both in-office and out-of-office temperatures.";
    status.classList.add("status-error");
    return;
  }

  try {
    let result;
    if (currentSchemaId == null) {
      result = await fetchJson("/api/schemas", {
        method: "POST",
        body: JSON.stringify({ name, description, inOfficeTemperature, outOfOfficeTemperature, intervals }),
      });
    } else {
      result = await fetchJson(`/api/schemas/${currentSchemaId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, inOfficeTemperature, outOfOfficeTemperature, intervals }),
      });
    }

    fillSchemaForm(result.schema);
    await loadSchemasDropdown();
    await loadTargetTemperature();
    await loadTemperatureStatus();

    status.textContent = "Schema saved.";
    status.classList.remove("status-error");
    status.classList.add("status-ok");
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to save schema. Check fields and try again.";
    status.classList.add("status-error");
  }
}

async function setActiveFromForm() {
  const status = document.getElementById("schema-status");
  status.textContent = "";

  if (currentSchemaId == null) {
    status.textContent = "Select or create a schema first.";
    status.classList.add("status-error");
    return;
  }

  try {
    await fetchJson("/api/schemas-active", {
      method: "POST",
      body: JSON.stringify({ schemaId: currentSchemaId }),
    });
    await loadSchemasDropdown();
    await loadTargetTemperature();
    await loadTemperatureStatus();
    status.textContent = "Schema set as active.";
    status.classList.remove("status-error");
    status.classList.add("status-ok");
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to set active schema.";
    status.classList.add("status-error");
  }
}

async function clearActiveSchema() {
  const status = document.getElementById("schema-status");
  status.textContent = "";

  try {
    await fetchJson("/api/schemas-active", {
      method: "POST",
      body: JSON.stringify({ schemaId: null }),
    });
    await loadSchemasDropdown();
    await loadTargetTemperature();
    await loadTemperatureStatus();
    status.textContent = "Active schema cleared. Using default target temperature.";
    status.classList.remove("status-error");
    status.classList.add("status-ok");
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to clear active schema.";
    status.classList.add("status-error");
  }
}

async function deleteCurrentSchema() {
  const status = document.getElementById("schema-status");
  status.textContent = "";

  if (currentSchemaId == null) {
    status.textContent = "No schema selected to delete.";
    status.classList.add("status-error");
    return;
  }

  if (!window.confirm("Delete this schema permanently?")) {
    return;
  }

  try {
    await fetch("/api/schemas/" + currentSchemaId, {
      method: "DELETE",
    });
    clearSchemaForm();
    await loadSchemasDropdown();
    await loadTargetTemperature();
    await loadTemperatureStatus();
    status.textContent = "Schema deleted.";
    status.classList.remove("status-error");
    status.classList.add("status-ok");
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to delete schema.";
    status.classList.add("status-error");
  }
}

function copyMondayToAllDays() {
  // Use Sunday (index 0) as the source since it's the first day shown.
  const sundayIndex = 0;
  const start = document.getElementById(`day-${sundayIndex}-start`).value;
  const end = document.getElementById(`day-${sundayIndex}-end`).value;
  if (!start && !end) {
    alert("Fill Sunday first before copying.");
    return;
  }

  for (let day = 0; day < DAY_LABELS.length; day++) {
    if (day === sundayIndex) continue;
    document.getElementById(`day-${day}-start`).value = start;
    document.getElementById(`day-${day}-end`).value = end;
  }
}

function toggleDetails() {
  const body = document.getElementById("details-content");
  const btn = document.getElementById("details-toggle-btn");
  if (!body || !btn) return;
  const collapsed = body.classList.toggle("collapsed");
  btn.textContent = collapsed ? "Show details" : "Hide details";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("save-target-btn").addEventListener("click", saveTargetTemperature);
  document.getElementById("send-current-btn").addEventListener("click", sendCurrentTemperature);

  buildSchemaDayRows();
  document.getElementById("schema-select").addEventListener("change", onSchemaSelectChange);
  document.getElementById("new-schema-btn").addEventListener("click", () => {
    clearSchemaForm();
    document.getElementById("schema-select").value = "";
  });
  document.getElementById("save-schema-btn").addEventListener("click", saveSchema);
  document.getElementById("set-active-btn").addEventListener("click", setActiveFromForm);
  document.getElementById("clear-active-btn").addEventListener("click", clearActiveSchema);
  document.getElementById("delete-schema-btn").addEventListener("click", deleteCurrentSchema);
  document.getElementById("copy-monday-btn").addEventListener("click", copyMondayToAllDays);
  document.getElementById("details-toggle-btn").addEventListener("click", toggleDetails);

  loadTargetTemperature();
  loadTemperatureStatus();
  loadHistoryChart();
  loadSchemasDropdown();

  // Refresh history/chart periodically
  setInterval(loadHistoryChart, 30_000);
  setInterval(loadTemperatureStatus, 30_000);
});

