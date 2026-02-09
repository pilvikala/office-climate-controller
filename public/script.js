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

    const width = 600;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 10;
    const paddingTop = 10;
    const paddingBottom = 24;

    const minTemp = Math.min(...points.map((p) => p.temperature));
    const maxTemp = Math.max(...points.map((p) => p.temperature));
    const tempPadding = (maxTemp - minTemp || 1) * 0.15;
    const yMin = minTemp - tempPadding;
    const yMax = maxTemp + tempPadding;

    const tMin = cutoff;
    const tMax = now;

    const xScale = (t) =>
      paddingLeft + ((t - tMin) / (tMax - tMin || 1)) * (width - paddingLeft - paddingRight);
    const yScale = (temp) =>
      height - paddingBottom - ((temp - yMin) / (yMax - yMin || 1)) * (height - paddingTop - paddingBottom);

    const svgns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // background
    const bg = document.createElementNS(svgns, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(width));
    bg.setAttribute("height", String(height));
    bg.setAttribute("class", "chart-bg");
    svg.appendChild(bg);

    // y-axis grid (min, mid, max)
    const levels = [yMin, (yMin + yMax) / 2, yMax];
    levels.forEach((temp) => {
      const y = yScale(temp);
      const grid = document.createElementNS(svgns, "line");
      grid.setAttribute("x1", String(paddingLeft));
      grid.setAttribute("x2", String(width - paddingRight));
      grid.setAttribute("y1", String(y));
      grid.setAttribute("y2", String(y));
      grid.setAttribute("class", "chart-grid");
      svg.appendChild(grid);

      const label = document.createElementNS(svgns, "text");
      label.setAttribute("x", String(paddingLeft - 6));
      label.setAttribute("y", String(y + 3));
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "chart-label");
      label.textContent = temp.toFixed(1) + "°";
      svg.appendChild(label);
    });

    // x-axis (now and -24h)
    const axis = document.createElementNS(svgns, "line");
    const axisY = height - paddingBottom;
    axis.setAttribute("x1", String(paddingLeft));
    axis.setAttribute("x2", String(width - paddingRight));
    axis.setAttribute("y1", String(axisY));
    axis.setAttribute("y2", String(axisY));
    axis.setAttribute("class", "chart-axis");
    svg.appendChild(axis);

    const leftLabel = document.createElementNS(svgns, "text");
    leftLabel.setAttribute("x", String(paddingLeft));
    leftLabel.setAttribute("y", String(height - 6));
    leftLabel.setAttribute("text-anchor", "start");
    leftLabel.setAttribute("class", "chart-label");
    leftLabel.textContent = "24h ago";
    svg.appendChild(leftLabel);

    const rightLabel = document.createElementNS(svgns, "text");
    rightLabel.setAttribute("x", String(width - paddingRight));
    rightLabel.setAttribute("y", String(height - 6));
    rightLabel.setAttribute("text-anchor", "end");
    rightLabel.setAttribute("class", "chart-label");
    rightLabel.textContent = "now";
    svg.appendChild(rightLabel);

    // line path
    const path = document.createElementNS(svgns, "path");
    const d = points
      .map((p, idx) => {
        const x = xScale(p.t);
        const y = yScale(p.temperature);
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    path.setAttribute("d", d);
    path.setAttribute("class", "chart-line");
    svg.appendChild(path);

    container.appendChild(svg);
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
    } else {
      select.value = "";
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

