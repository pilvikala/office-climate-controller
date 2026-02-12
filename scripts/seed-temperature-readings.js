#!/usr/bin/env node
"use strict";

/**
 * Seed climate.db with random temperature readings for the last 24 hours.
 * First wipes existing measurements from the last 24 hours, then inserts new data.
 * Office readings → temperature_log, weather readings → weather_current_log.
 *
 * Usage:
 *   node scripts/seed-temperature-readings.js --office 21 --weather 15 [--db path/to/climate.db]
 *
 * Random values are within ±10% of the given office and weather temperatures.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

function parseArgs() {
  const args = process.argv.slice(2);
  let office = null;
  let weather = null;
  let dbPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--office" && args[i + 1] != null) {
      office = Number(args[++i]);
    } else if (args[i] === "--weather" && args[i + 1] != null) {
      weather = Number(args[++i]);
    } else if (args[i] === "--db" && args[i + 1] != null) {
      dbPath = args[++i];
    }
  }

  if (office == null || !Number.isFinite(office)) {
    console.error("Missing or invalid --office temperature.");
    console.error("Usage: node scripts/seed-temperature-readings.js --office <°C> --weather <°C> [--db path/to/climate.db]");
    process.exit(1);
  }
  if (weather == null || !Number.isFinite(weather)) {
    console.error("Missing or invalid --weather temperature.");
    console.error("Usage: node scripts/seed-temperature-readings.js --office <°C> --weather <°C> [--db path/to/climate.db]");
    process.exit(1);
  }

  if (dbPath == null) {
    dbPath = path.join(process.cwd(), "data", "climate.db");
  }
  dbPath = path.resolve(dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error("Database file not found:", dbPath);
    process.exit(1);
  }

  return { office, weather, dbPath };
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function formatTimestamp(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function wipeLast24Hours(db) {
  const cutoff = "datetime('now', '-24 hours')";
  const deletedOffice = db.prepare(`DELETE FROM temperature_log WHERE timestamp >= ${cutoff}`).run();
  const deletedWeather = db.prepare(`DELETE FROM weather_current_log WHERE timestamp >= ${cutoff}`).run();
  return { office: deletedOffice.changes, weather: deletedWeather.changes };
}

function seed(dbPath, officeTemp, weatherTemp) {
  const db = new Database(dbPath);

  const wiped = wipeLast24Hours(db);

  const officeMin = officeTemp * 0.9;
  const officeMax = officeTemp * 1.1;
  const weatherMin = weatherTemp * 0.9;
  const weatherMax = weatherTemp * 1.1;

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const intervalMs = 10 * 60 * 1000; // 10 minutes

  const insertOffice = db.prepare(
    "INSERT INTO temperature_log (timestamp, temperature) VALUES (?, ?)"
  );
  const insertWeather = db.prepare(
    "INSERT INTO weather_current_log (timestamp, temperature, weather_code) VALUES (?, ?, ?)"
  );

  const insertMany = db.transaction(() => {
    let count = 0;
    for (let t = now - oneDayMs; t <= now; t += intervalMs) {
      const ts = formatTimestamp(new Date(t));
      const officeReading = randomInRange(officeMin, officeMax);
      const weatherReading = randomInRange(weatherMin, weatherMax);
      insertOffice.run(ts, Math.round(officeReading * 10) / 10);
      insertWeather.run(ts, Math.round(weatherReading * 10) / 10, null);
      count++;
    }
    return count;
  });

  const count = insertMany();
  db.close();

  return { count, wiped };
}

function main() {
  const { office, weather, dbPath } = parseArgs();
  const { count, wiped } = seed(dbPath, office, weather);
  console.log(
    `Wiped ${wiped.office} office and ${wiped.weather} weather readings from the last 24 hours.`
  );
  console.log(
    `Inserted ${count} office and ${count} weather temperature readings for the last 24 hours (db: ${dbPath}).`
  );
}

main();
