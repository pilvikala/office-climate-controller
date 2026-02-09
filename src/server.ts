import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import {
  setBaseTargetTemperature,
  logTemperature,
  getRecentTemperatures,
  getEffectiveTargetTemperature,
  listSchemas,
  getSchemaById,
  createSchema,
  updateSchema,
  deleteSchema,
  setActiveSchema,
  getActiveSchema,
  SchemaInterval,
} from "./db";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Serve static UI
const publicDir = path.join(process.cwd(), "public");
app.use(express.static(publicDir));

// Helper to parse "HH:MM" into minutes
function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// REST API
app.get("/api/temperature/target", (_req, res) => {
  const effective = getEffectiveTargetTemperature(new Date());
  res.json({
    targetTemperature: effective.temperature,
    source: effective.source,
    schemaId: effective.schemaId,
    mode: effective.mode,
  });
});

// Target and latest measured temperature in one payload
app.get("/api/temperature/status", (_req, res) => {
  const effective = getEffectiveTargetTemperature(new Date());
  const latest = getRecentTemperatures(1)[0] ?? null;

  res.json({
    targetTemperature: effective.temperature,
    targetSource: effective.source,
    targetSchemaId: effective.schemaId,
    targetMode: effective.mode,
    currentTemperature: latest ? latest.temperature : null,
    currentTemperatureTimestamp: latest ? latest.timestamp : null,
  });
});

// Base/default target temperature (outside schema windows or when no schema is active)
app.post("/api/temperature/target", (req, res) => {
  const { targetTemperature } = req.body as { targetTemperature?: number };

  if (typeof targetTemperature !== "number" || !Number.isFinite(targetTemperature)) {
    return res.status(400).json({ error: "Invalid targetTemperature" });
  }

  setBaseTargetTemperature(targetTemperature);
  res.json({ targetTemperature });
});

app.post("/api/temperature/current", (req, res) => {
  const { temperature } = req.body as { temperature?: number };

  if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
    return res.status(400).json({ error: "Invalid temperature" });
  }

  logTemperature(temperature);
  res.json({ ok: true });
});

// Alternate GET endpoint for sensors that can only perform GET requests.
// Example: /api/temperature/current?temperature=21.3
app.get("/api/temperature/current", (req, res) => {
  const raw = req.query.temperature;
  const temperature =
    typeof raw === "string" ? Number(raw) : Array.isArray(raw) ? Number(raw[0]) : NaN;

  if (!Number.isFinite(temperature)) {
    return res.status(400).json({ error: "Invalid temperature" });
  }

  logTemperature(temperature);
  res.json({ ok: true });
});

app.get("/api/temperature/history", (req, res) => {
  const limitParam = req.query.limit;
  const limit = typeof limitParam === "string" ? Number(limitParam) : 50;

  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 500 ? limit : 50;
  const history = getRecentTemperatures(safeLimit);

  res.json({ history });
});

// ---- Schema APIs ----

// List schemas (without periods)
app.get("/api/schemas", (_req, res) => {
  const schemas = listSchemas();
  res.json({ schemas });
});

// Get single schema with intervals
app.get("/api/schemas/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

  const schema = getSchemaById(id);
  if (!schema) return res.status(404).json({ error: "Schema not found" });

  res.json({ schema });
});

type IncomingInterval = {
  dayOfWeek: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

function validateAndNormalizeIntervals(
  intervals: IncomingInterval[],
): Omit<SchemaInterval, "id">[] | { error: string } {
  if (!Array.isArray(intervals)) {
    return { error: "intervals must be an array" };
  }

  const normalized: Omit<SchemaInterval, "id">[] = [];

  for (const p of intervals) {
    if (
      typeof p.dayOfWeek !== "number" ||
      !Number.isInteger(p.dayOfWeek) ||
      p.dayOfWeek < 0 ||
      p.dayOfWeek > 6
    ) {
      return { error: "dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday)" };
    }

    if (typeof p.start !== "string" || typeof p.end !== "string") {
      return { error: "start and end must be strings in HH:MM format" };
    }

    const startMinutes = parseTimeToMinutes(p.start);
    const endMinutes = parseTimeToMinutes(p.end);

    if (startMinutes === null || endMinutes === null) {
      return { error: "start and end must be valid times in HH:MM format" };
    }

    if (endMinutes <= startMinutes) {
      return { error: "end time must be after start time" };
    }

    normalized.push({
      dayOfWeek: p.dayOfWeek,
      startTimeMinutes: startMinutes,
      endTimeMinutes: endMinutes,
    });
  }

  return normalized;
}

// Create schema
app.post("/api/schemas", (req, res) => {
  const { name, description, inOfficeTemperature, outOfOfficeTemperature, intervals } = req.body as {
    name?: string;
    description?: string | null;
    inOfficeTemperature?: number;
    outOfOfficeTemperature?: number;
    intervals?: IncomingInterval[];
  };

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }

  if (typeof inOfficeTemperature !== "number" || !Number.isFinite(inOfficeTemperature)) {
    return res.status(400).json({ error: "inOfficeTemperature must be a finite number" });
  }

  if (typeof outOfOfficeTemperature !== "number" || !Number.isFinite(outOfOfficeTemperature)) {
    return res.status(400).json({ error: "outOfOfficeTemperature must be a finite number" });
  }

  const normalized = validateAndNormalizeIntervals(intervals ?? []);
  if ("error" in normalized) {
    return res.status(400).json({ error: normalized.error });
  }

  try {
    const schema = createSchema(name, description ?? null, inOfficeTemperature, outOfOfficeTemperature, normalized);
    res.status(201).json({ schema });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create schema";
    if (message.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Schema with this name already exists" });
    }
    res.status(500).json({ error: message });
  }
});

// Update schema
app.put("/api/schemas/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

  const { name, description, inOfficeTemperature, outOfOfficeTemperature, intervals } = req.body as {
    name?: string;
    description?: string | null;
    inOfficeTemperature?: number;
    outOfOfficeTemperature?: number;
    intervals?: IncomingInterval[];
  };

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }

  if (typeof inOfficeTemperature !== "number" || !Number.isFinite(inOfficeTemperature)) {
    return res.status(400).json({ error: "inOfficeTemperature must be a finite number" });
  }

  if (typeof outOfOfficeTemperature !== "number" || !Number.isFinite(outOfOfficeTemperature)) {
    return res.status(400).json({ error: "outOfOfficeTemperature must be a finite number" });
  }

  const normalized = validateAndNormalizeIntervals(intervals ?? []);
  if ("error" in normalized) {
    return res.status(400).json({ error: normalized.error });
  }

  try {
    const updated = updateSchema(id, name, description ?? null, inOfficeTemperature, outOfOfficeTemperature, normalized);
    if (!updated) return res.status(404).json({ error: "Schema not found" });
    res.json({ schema: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update schema";
    if (message.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Schema with this name already exists" });
    }
    res.status(500).json({ error: message });
  }
});

// Delete schema
app.delete("/api/schemas/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

  const deleted = deleteSchema(id);
  if (!deleted) return res.status(404).json({ error: "Schema not found" });
  res.status(204).send();
});

// Get active schema
app.get("/api/schemas-active", (_req, res) => {
  const active = getActiveSchema();
  res.json({ schema: active });
});

// Set active schema (or clear)
app.post("/api/schemas-active", (req, res) => {
  const { schemaId } = req.body as { schemaId?: number | null };

  try {
    if (schemaId === null || schemaId === undefined) {
      setActiveSchema(null);
      return res.json({ schemaId: null });
    }

    if (!Number.isInteger(schemaId) || schemaId <= 0) {
      return res.status(400).json({ error: "schemaId must be a positive integer or null" });
    }

    setActiveSchema(schemaId);
    res.json({ schemaId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to set active schema";
    if (message === "Schema not found") {
      return res.status(404).json({ error: "Schema not found" });
    }
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Office Climate Controller listening on http://localhost:${PORT}`);
});

