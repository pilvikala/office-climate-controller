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


// ----- Weather widget -----

let weatherConfig = {
  lat: 0,
  lon: 0,
  label: "Office",
  source: "default",
};

function describeWeatherCode(code) {
  if (code == null) return "Unknown conditions";

  if (code === 0) return "Clear sky";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";

  if (code === 45 || code === 48) return "Foggy";

  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return "Drizzle";
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return "Rain";

  if (code === 71 || code === 73 || code === 75 || code === 77) return "Snow";

  if (code === 80 || code === 81 || code === 82) return "Rain showers";

  if (code === 95 || code === 96 || code === 99) return "Thunderstorms";

  return "Mixed conditions";
}

function iconForWeatherCode(code) {
  if (code == null) return "❓";

  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";

  if (code === 45 || code === 48) return "🌫️";

  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return "🌦️";
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return "🌧️";

  if (code === 71 || code === 73 || code === 75 || code === 77) return "🌨️";

  if (code === 80 || code === 81 || code === 82) return "🌧️";

  if (code === 95 || code === 96 || code === 99) return "⛈️";

  return "❓";
}

async function loadWeatherConfigFromServer() {
  try {
    const data = await fetchJson("/api/weather/settings");
    if (data && Number.isFinite(data.lat) && Number.isFinite(data.lon)) {
      return {
        lat: data.lat,
        lon: data.lon,
        label: typeof data.label === "string" ? data.label : "Office",
        source: "server",
      };
    }
  } catch {
    // ignore; use defaults
  }
  return null;
}

function applyWeatherConfigToForm() {
  const latInput = document.getElementById("weather-lat-input");
  const lonInput = document.getElementById("weather-lon-input");
  if (!latInput || !lonInput) return;
  latInput.value = weatherConfig.lat != null ? String(weatherConfig.lat.toFixed(4)) : "";
  lonInput.value = weatherConfig.lon != null ? String(weatherConfig.lon.toFixed(4)) : "";
}

function readWeatherConfigFromForm() {
  const latInput = document.getElementById("weather-lat-input");
  const lonInput = document.getElementById("weather-lon-input");
  if (!latInput || !lonInput) {
    return null;
  }
  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return {
    lat,
    lon,
    label: "Custom location",
    source: "custom",
  };
}

function setWeatherStatus(message, isError) {
  const status = document.getElementById("weather-settings-status");
  if (!status) return;
  status.textContent = message || "";
  status.classList.remove("status-ok", "status-error");
  if (!message) return;
  status.classList.add(isError ? "status-error" : "status-ok");
}

async function loadWeather() {
  const currentTempEl = document.getElementById("weather-current-temp");
  const currentSummaryEl = document.getElementById("weather-current-summary");
  const currentIconEl = document.getElementById("weather-current-icon");
  const forecastContainer = document.getElementById("weather-forecast-days");

  if (!currentTempEl || !forecastContainer) {
    return;
  }

  try {
    const data = await fetchJson("/api/weather/forecast");
    const label = data.label && typeof data.label === "string" ? data.label : "";

    if (data.current && typeof data.current.temperature_2m === "number") {
      const code = data.current.weather_code;
      currentTempEl.textContent = data.current.temperature_2m.toFixed(1);
      const summary = describeWeatherCode(code);
      const locationPart = label ? `${label} · ` : "";
      if (currentSummaryEl) {
        currentSummaryEl.textContent = `${locationPart}${summary}`;
      }
      if (currentIconEl) {
        currentIconEl.textContent = iconForWeatherCode(code);
      }
    } else {
      currentTempEl.textContent = "--";
      if (currentSummaryEl) {
        currentSummaryEl.textContent = "Weather data unavailable.";
      }
      if (currentIconEl) {
        currentIconEl.textContent = "❓";
      }
    }

    const daily = data.daily;
    if (!daily || !Array.isArray(daily.time)) {
      return;
    }

    forecastContainer.innerHTML = "";

    for (let i = 1; i <= 3 && i < daily.time.length; i++) {
      const dateStr = daily.time[i];
      const dayLabel =
        i === 1
          ? "Tomorrow"
          : new Date(dateStr).toLocaleDateString(undefined, {
            weekday: "short",
          });

      const max = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[i] : null;
      const min = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[i] : null;
      const code = Array.isArray(daily.weather_code) ? daily.weather_code[i] : null;

      const summary = describeWeatherCode(code);
      const icon = iconForWeatherCode(code);

      const dayEl = document.createElement("div");
      dayEl.className = "weather-forecast-day";
      dayEl.innerHTML = `
        <div class="weather-forecast-day-name">${dayLabel}</div>
        <div class="weather-forecast-temps">
          <span class="weather-icon" aria-hidden="true">${icon}</span>
          <span class="weather-temp-max">${max != null ? max.toFixed(0) : "--"}°</span>
          <span class="weather-temp-min">${min != null ? min.toFixed(0) : "--"}°</span>
        </div>
        <div class="weather-forecast-summary">${summary}</div>
      `;

      forecastContainer.appendChild(dayEl);
    }
  } catch (err) {
    console.error(err);
    if (currentSummaryEl) {
      currentSummaryEl.textContent = "Unable to load weather.";
    }
    if (currentIconEl) {
      currentIconEl.textContent = "❓";
    }
  }
}

function useBrowserLocationForWeather() {
  if (!("geolocation" in navigator)) {
    setWeatherStatus("Browser location is not available.", true);
    return;
  }

  setWeatherStatus("Detecting browser location…", false);

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setWeatherStatus("Browser returned invalid coordinates.", true);
        return;
      }
      try {
        await fetchJson("/api/weather/settings", {
          method: "PUT",
          body: JSON.stringify({
            lat: latitude,
            lon: longitude,
            label: "Browser location",
          }),
        });
        weatherConfig = { lat: latitude, lon: longitude, label: "Browser location", source: "geolocation" };
        applyWeatherConfigToForm();
        setWeatherStatus("Location updated from browser.", false);
        await fetchJson("/api/weather/refresh", { method: "POST" });
        loadWeather();
      } catch {
        setWeatherStatus("Failed to save location.", true);
      }
    },
    () => {
      setWeatherStatus("Unable to access browser location.", true);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 3600000,
    },
  );
}

async function initWeatherConfig() {
  const fromServer = await loadWeatherConfigFromServer();
  if (fromServer) {
    weatherConfig = fromServer;
  }
  applyWeatherConfigToForm();
}

function attachWeatherSettingsHandlers() {
  const useBrowserBtn = document.getElementById("weather-use-browser-btn");
  const saveLocationBtn = document.getElementById("weather-save-location-btn");

  if (useBrowserBtn) {
    useBrowserBtn.addEventListener("click", () => {
      useBrowserLocationForWeather();
    });
  }

  if (saveLocationBtn) {
    saveLocationBtn.addEventListener("click", async () => {
      const cfg = readWeatherConfigFromForm();
      if (!cfg) {
        setWeatherStatus("Please enter a valid latitude and longitude.", true);
        return;
      }
      try {
        const data = await fetchJson("/api/weather/settings", {
          method: "PUT",
          body: JSON.stringify({ lat: cfg.lat, lon: cfg.lon, label: cfg.label }),
        });
        weatherConfig = { ...cfg, label: data.label || cfg.label, source: "custom" };
        applyWeatherConfigToForm();
        setWeatherStatus("Weather location saved.", false);
        await fetchJson("/api/weather/refresh", { method: "POST" });
        loadWeather();
      } catch {
        setWeatherStatus("Failed to save location.", true);
      }
    });
  }
}

async function loadTargetTemperature() {
  try {
    const data = await fetchJson("/api/temperature/target");
    const input = document.getElementById("target-input");
    const value = clampTemperature(Number(data.targetTemperature));
    if (input) {
      const safeValue = value != null ? value : 20;
      updateTargetSliderUI(safeValue);
    }
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

function clampTemperature(value) {
  if (!Number.isFinite(value)) return null;
  const min = 10;
  const max = 25;
  if (value < min) value = min;
  if (value > max) value = max;
  return value;
}

function clampTargetTemperature(value) {
  return clampTemperature(value);
}

function updateTemperatureSlider(inputId, valueLabelId, value) {
  const input = document.getElementById(inputId);
  const valueLabel = valueLabelId ? document.getElementById(valueLabelId) : null;
  if (!input) return;

  const raw = value != null ? value : Number(input.value);
  const clamped = clampTemperature(raw);
  if (clamped == null) return;

  input.value = clamped.toFixed(1);
  if (valueLabel) {
    valueLabel.textContent = `${clamped.toFixed(1)} °C`;
  }

  const min = 10;
  const max = 25;
  const t = Math.min(1, Math.max(0, (clamped - min) / (max - min)));

  const cold = { r: 56, g: 189, b: 248 }; // #38bdf8
  const hot = { r: 239, g: 68, b: 68 };   // #ef4444
  const r = Math.round(cold.r + (hot.r - cold.r) * t);
  const g = Math.round(cold.g + (hot.g - cold.g) * t);
  const b = Math.round(cold.b + (hot.b - cold.b) * t);
  const color = `rgb(${r}, ${g}, ${b})`;

  input.style.setProperty("--slider-thumb-color", color);
}

function updateTargetSliderUI(value) {
  updateTemperatureSlider("target-input", "target-input-value", value);
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

async function loadAppVersion() {
  try {
    const el = document.getElementById("app-version");
    if (!el) return;
    const data = await fetchJson("/version.json");
    if (data && typeof data.version === "string" && data.version.trim() !== "") {
      el.textContent = `Version: ${data.version}`;
    }
  } catch (err) {
    console.error(err);
  }
}

async function saveTargetTemperature() {
  const input = document.getElementById("target-input");
  const status = document.getElementById("status-message");
  const value = clampTargetTemperature(Number(input.value));

  status.textContent = "";

  if (value == null) {
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
    updateTargetSliderUI(value);
    await loadTemperatureStatus();
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to save target temperature.";
    status.classList.add("status-error");
  }
}

async function sendCurrentTemperature() {
  const input = document.getElementById("current-input");
  const value = clampTemperature(Number(input.value));

  if (value == null) {
    alert("Please enter a valid current temperature.");
    return;
  }

  try {
    await fetchJson("/api/temperature/current", {
      method: "POST",
      body: JSON.stringify({ temperature: value }),
    });
    updateTemperatureSlider("current-input", "current-input-value", value);
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

function clearSchemaDay(dayIndex) {
  const startInput = document.getElementById(`day-${dayIndex}-start`);
  const endInput = document.getElementById(`day-${dayIndex}-end`);
  if (startInput) startInput.value = "";
  if (endInput) endInput.value = "";
}

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
      <button type="button" class="schema-day-clear-btn">Clear</button>
    `;
    container.appendChild(row);

    const clearBtn = row.querySelector(".schema-day-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        clearSchemaDay(dayIndex);
      });
    }
  });
}

function clearSchemaForm() {
  currentSchemaId = null;
  document.getElementById("schema-name").value = "";
  document.getElementById("schema-description").value = "";
  document.getElementById("schema-in-temp").value = "";
  document.getElementById("schema-out-temp").value = "";
  const inLabel = document.getElementById("schema-in-temp-value");
  const outLabel = document.getElementById("schema-out-temp-value");
  if (inLabel) inLabel.textContent = "-- °C";
  if (outLabel) outLabel.textContent = "-- °C";
  document.getElementById("schema-status").textContent = "";
  for (let i = 0; i < DAY_LABELS.length; i++) {
    clearSchemaDay(i);
  }
}

function fillSchemaForm(schema) {
  clearSchemaForm();
  currentSchemaId = schema.id;
  document.getElementById("schema-name").value = schema.name || "";
  document.getElementById("schema-description").value = schema.description || "";
  document.getElementById("schema-in-temp").value = schema.inOfficeTemperature.toFixed(1);
  document.getElementById("schema-out-temp").value = schema.outOfOfficeTemperature.toFixed(1);
  updateTemperatureSlider("schema-in-temp", "schema-in-temp-value");
  updateTemperatureSlider("schema-out-temp", "schema-out-temp-value");
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

function attachTemperatureSlider(inputId, valueLabelId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("input", () => {
    updateTemperatureSlider(inputId, valueLabelId);
  });
  // Initialize UI from current value or a sensible default
  if (!input.value) {
    input.value = "20";
  }
  updateTemperatureSlider(inputId, valueLabelId);
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

  // Shared slider behavior for all temperature sliders
  attachTemperatureSlider("target-input", "target-input-value");
  attachTemperatureSlider("current-input", "current-input-value");
  attachTemperatureSlider("schema-in-temp", "schema-in-temp-value");
  attachTemperatureSlider("schema-out-temp", "schema-out-temp-value");

  attachWeatherSettingsHandlers();

  loadTargetTemperature();
  loadTemperatureStatus();
  loadAppVersion();
  loadHistoryChart();
  loadSchemasDropdown();

  // Refresh history/chart periodically
  setInterval(loadHistoryChart, 300_000);
  setInterval(loadTemperatureStatus, 300_000);
  setInterval(loadWeather, 1_800_000);

  (async () => {
    await initWeatherConfig();
    loadWeather();
  })();
});

