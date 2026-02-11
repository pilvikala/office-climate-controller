import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_FOLDER = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_FOLDER, "climate.db");

if (!fs.existsSync(DB_FOLDER)) {
  fs.mkdirSync(DB_FOLDER, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    target_temperature REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS temperature_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    temperature REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    in_office_temp REAL NOT NULL,
    out_of_office_temp REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS schema_intervals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_id INTEGER NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    start_time_minutes INTEGER NOT NULL CHECK(start_time_minutes BETWEEN 0 AND 1439),
    end_time_minutes INTEGER NOT NULL CHECK(end_time_minutes BETWEEN 1 AND 1440)
  );

  CREATE TABLE IF NOT EXISTS weather_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weather_forecast_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weather_current_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    temperature REAL NOT NULL,
    weather_code INTEGER
  );

  INSERT OR IGNORE INTO settings (id, target_temperature)
  VALUES (1, 22.0);

  INSERT OR IGNORE INTO weather_settings (id, lat, lon, label)
  VALUES (1, 52.2297, 21.0122, 'Office');
`);

export type TemperatureLogRow = { timestamp: string; temperature: number };

export type SchemaSummary = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  inOfficeTemperature: number;
  outOfOfficeTemperature: number;
};

export type SchemaInterval = {
  id: number;
  dayOfWeek: number; // 0-6, JS Date.getDay() (0 = Sunday)
  startTimeMinutes: number; // 0-1439
  endTimeMinutes: number; // 1-1440
};

export type SchemaWithIntervals = SchemaSummary & {
  intervals: SchemaInterval[];
};

export function getBaseTargetTemperature(): number {
  const row = db.prepare("SELECT target_temperature FROM settings WHERE id = 1").get() as { target_temperature: number };
  return row.target_temperature;
}

export function setBaseTargetTemperature(value: number): void {
  db.prepare("UPDATE settings SET target_temperature = ? WHERE id = 1").run(value);
}

export function logTemperature(value: number): void {
  db.prepare("INSERT INTO temperature_log (temperature) VALUES (?)").run(value);
}

export function getRecentTemperatures(limit = 50): TemperatureLogRow[] {
  const rows = db
    .prepare("SELECT timestamp, temperature FROM temperature_log ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as TemperatureLogRow[];
  return rows;
}

export function listSchemas(): SchemaSummary[] {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        name,
        description,
        in_office_temp AS inOfficeTemperature,
        out_of_office_temp AS outOfOfficeTemperature,
        is_active AS isActive
      FROM schemas
      ORDER BY name COLLATE NOCASE;
    `,
    )
    .all() as {
    id: number;
    name: string;
    description: string | null;
    inOfficeTemperature: number;
    outOfOfficeTemperature: number;
    isActive: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    inOfficeTemperature: row.inOfficeTemperature,
    outOfOfficeTemperature: row.outOfOfficeTemperature,
    isActive: !!row.isActive,
  }));
}

export function getSchemaById(id: number): SchemaWithIntervals | null {
  const schemaRow = db
    .prepare(
      `
      SELECT
        id,
        name,
        description,
        in_office_temp AS inOfficeTemperature,
        out_of_office_temp AS outOfOfficeTemperature,
        is_active AS isActive
      FROM schemas
      WHERE id = ?;
    `,
    )
    .get(id) as
    | {
        id: number;
        name: string;
        description: string | null;
        inOfficeTemperature: number;
        outOfOfficeTemperature: number;
        isActive: number;
      }
    | undefined;

  if (!schemaRow) return null;

  const intervals = db
    .prepare(
      `
      SELECT
        id,
        day_of_week AS dayOfWeek,
        start_time_minutes AS startTimeMinutes,
        end_time_minutes AS endTimeMinutes
      FROM schema_intervals
      WHERE schema_id = ?
      ORDER BY day_of_week, start_time_minutes;
    `,
    )
    .all(id) as SchemaInterval[];

  return {
    id: schemaRow.id,
    name: schemaRow.name,
    description: schemaRow.description,
    inOfficeTemperature: schemaRow.inOfficeTemperature,
    outOfOfficeTemperature: schemaRow.outOfOfficeTemperature,
    isActive: !!schemaRow.isActive,
    intervals,
  };
}

export function createSchema(
  name: string,
  description: string | null,
  inOfficeTemperature: number,
  outOfOfficeTemperature: number,
  intervals: Omit<SchemaInterval, "id">[],
): SchemaWithIntervals {
  const insertSchema = db.prepare(
    "INSERT INTO schemas (name, description, in_office_temp, out_of_office_temp) VALUES (?, ?, ?, ?)",
  );
  const insertInterval = db.prepare(
    `
    INSERT INTO schema_intervals (schema_id, day_of_week, start_time_minutes, end_time_minutes)
    VALUES (?, ?, ?, ?);
  `,
  );

  const tx = db.transaction(() => {
    const result = insertSchema.run(name, description, inOfficeTemperature, outOfOfficeTemperature);
    const schemaId = Number(result.lastInsertRowid);

    for (const interval of intervals) {
      insertInterval.run(schemaId, interval.dayOfWeek, interval.startTimeMinutes, interval.endTimeMinutes);
    }

    return getSchemaById(schemaId)!;
  });

  return tx();
}

export function updateSchema(
  id: number,
  name: string,
  description: string | null,
  inOfficeTemperature: number,
  outOfOfficeTemperature: number,
  intervals: Omit<SchemaInterval, "id">[],
): SchemaWithIntervals | null {
  const existing = getSchemaById(id);
  if (!existing) return null;

  const updateSchemaStmt = db.prepare(
    "UPDATE schemas SET name = ?, description = ?, in_office_temp = ?, out_of_office_temp = ? WHERE id = ?",
  );
  const deleteIntervals = db.prepare("DELETE FROM schema_intervals WHERE schema_id = ?");
  const insertInterval = db.prepare(
    `
    INSERT INTO schema_intervals (schema_id, day_of_week, start_time_minutes, end_time_minutes)
    VALUES (?, ?, ?, ?);
  `,
  );

  const tx = db.transaction(() => {
    updateSchemaStmt.run(name, description, inOfficeTemperature, outOfOfficeTemperature, id);
    deleteIntervals.run(id);
    for (const interval of intervals) {
      insertInterval.run(id, interval.dayOfWeek, interval.startTimeMinutes, interval.endTimeMinutes);
    }
    return getSchemaById(id)!;
  });

  return tx();
}

export function deleteSchema(id: number): boolean {
  const stmt = db.prepare("DELETE FROM schemas WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function setActiveSchema(id: number | null): void {
  const tx = db.transaction(() => {
    // Clear all
    db.prepare("UPDATE schemas SET is_active = 0 WHERE is_active != 0").run();
    if (id !== null) {
      const result = db.prepare("UPDATE schemas SET is_active = 1 WHERE id = ?").run(id);
      if (result.changes === 0) {
        throw new Error("Schema not found");
      }
    }
  });
  tx();
}

export function getActiveSchema(): SchemaWithIntervals | null {
  const activeRow = db
    .prepare(
      `
      SELECT id
      FROM schemas
      WHERE is_active = 1
      LIMIT 1;
    `,
    )
    .get() as { id: number } | undefined;

  if (!activeRow) return null;
  return getSchemaById(activeRow.id);
}

export type EffectiveTargetTemperature = {
  temperature: number;
  source: "schema" | "default";
  schemaId: number | null;
  mode: "in-office" | "out-of-office" | null;
};

// Schedules are stored and evaluated in UTC. The frontend converts between
// the user's local timezone and UTC when sending/displaying schedule data.
export function getEffectiveTargetTemperature(now: Date = new Date()): EffectiveTargetTemperature {
  const base = getBaseTargetTemperature();
  const active = getActiveSchema();

  if (!active) {
    return { temperature: base, source: "default", schemaId: null, mode: null };
  }

  const day = now.getUTCDay(); // 0 (Sunday) - 6 (Saturday)
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const matching = active.intervals.filter(
    (interval) => interval.dayOfWeek === day && interval.startTimeMinutes <= minutes && minutes < interval.endTimeMinutes,
  );

  if (matching.length === 0) {
    // Out of office according to this schema
    return {
      temperature: active.outOfOfficeTemperature,
      source: "schema",
      schemaId: active.id,
      mode: "out-of-office",
    };
  }

  // In office whenever within any configured interval
  return {
    temperature: active.inOfficeTemperature,
    source: "schema",
    schemaId: active.id,
    mode: "in-office",
  };
}

// ----- Weather -----

export type WeatherSettings = { lat: number; lon: number; label: string };

export function getWeatherSettings(): WeatherSettings {
  const row = db
    .prepare("SELECT lat, lon, label FROM weather_settings WHERE id = 1")
    .get() as { lat: number; lon: number; label: string };
  return row;
}

export function setWeatherSettings(lat: number, lon: number, label: string): void {
  db.prepare("UPDATE weather_settings SET lat = ?, lon = ?, label = ? WHERE id = 1").run(lat, lon, label);
}

export type WeatherForecastCacheRow = { updatedAt: string; payload: string };

export function getWeatherForecastCache(): WeatherForecastCacheRow | null {
  const row = db
    .prepare("SELECT updated_at AS updatedAt, payload FROM weather_forecast_cache WHERE id = 1")
    .get() as { updatedAt: string; payload: string } | undefined;
  return row ?? null;
}

export function setWeatherForecastCache(payload: string): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO weather_forecast_cache (id, updated_at, payload) VALUES (1, ?, ?)").run(
    now,
    payload,
  );
}

export function logWeatherCurrent(temperature: number, weatherCode?: number): void {
  db.prepare("INSERT INTO weather_current_log (temperature, weather_code) VALUES (?, ?)").run(
    temperature,
    weatherCode ?? null,
  );
}

export type WeatherCurrentLogRow = { timestamp: string; temperature: number; weatherCode: number | null };

export function getRecentWeatherCurrentLog(limit = 500): WeatherCurrentLogRow[] {
  const rows = db
    .prepare(
      "SELECT timestamp, temperature, weather_code AS weatherCode FROM weather_current_log ORDER BY timestamp DESC LIMIT ?",
    )
    .all(limit) as WeatherCurrentLogRow[];
  return rows;
}

