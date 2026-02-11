## Office Climate Controller

Node + TypeScript app to control and observe office temperature, with a REST API and a small web UI backed by a SQLite database.

### Running locally

- **Install dependencies**:

```bash
npm install
```

- **Development mode** (auto-restart on changes):

```bash
npm run dev
```

This starts the server on `http://localhost:3000` and serves the UI from `public/`.

- **Production build**:

```bash
npm run build
npm start
```

### API overview

All endpoints are served from `http://localhost:3000` by default.

#### Temperature endpoints

- **GET** `/api/temperature/target`  
  Returns the current *effective* target temperature, taking the active schema (if any) into account.

  **Response example:**

  ```json
  {
    "targetTemperature": 22.5,
    "source": "schema",          // "schema" or "default"
    "schemaId": 1,               // null if no schema
    "mode": "in-office"          // "in-office" | "out-of-office" | null
  }
  ```

  ```bash
  curl http://localhost:3000/api/temperature/target
  ```

- **GET** `/api/temperature/status`  
  Returns the effective target temperature **and** the latest logged measurement (if any).

  **Response example:**

  ```json
  {
    "targetTemperature": 22.5,
    "targetSource": "schema",              // "schema" or "default"
    "targetSchemaId": 1,                   // null if no schema
    "targetMode": "in-office",             // "in-office" | "out-of-office" | null
    "currentTemperature": 21.3,            // null if no data logged yet
    "currentTemperatureTimestamp": "2025-02-09 11:23:45" // UTC
  }
  ```

  ```bash
  curl http://localhost:3000/api/temperature/status
  ```

- **POST** `/api/temperature/target`  
  Sets the **base/default** target temperature (used when no schema is active or outside schema hours).

  **Request body:**

  ```json
  { "targetTemperature": 22.5 }
  ```

  **Response example:**

  ```json
  { "targetTemperature": 22.5 }
  ```

  ```bash
  curl -X POST http://localhost:3000/api/temperature/target \
    -H "Content-Type: application/json" \
    -d '{"targetTemperature": 22.5}'
  ```

- **POST** `/api/temperature/current`  
  Logs a current temperature reading.

  **Request body:**

  ```json
  { "temperature": 21.3 }
  ```

  **Response example:**

  ```json
  { "ok": true }
  ```

  ```bash
  curl -X POST http://localhost:3000/api/temperature/current \
    -H "Content-Type: application/json" \
    -d '{"temperature": 21.3}'
  ```

- **GET** `/api/temperature/current?temperature=21.3`  
  Alternate way to log a current temperature reading for sensors that can only perform GET requests.

  **Response example:**

  ```json
  { "ok": true }
  ```

  ```bash
  curl "http://localhost:3000/api/temperature/current?temperature=21.3"
  ```

- **GET** `/api/temperature/history?limit=20`  
  Returns recent logged temperature readings (default 50, max 500).

  **Response example:**

  ```json
  {
    "history": [
      { "timestamp": "2025-02-09 11:23:45", "temperature": 21.3 },
      { "timestamp": "2025-02-09 10:55:10", "temperature": 21.0 }
    ]
  }
  ```

  ```bash
  curl "http://localhost:3000/api/temperature/history?limit=20"
  ```

#### Power socket

- **GET** `/api/power-socket/recommendation`  
  Returns whether a power socket (e.g. for heating) should be on or off, based on the last temperature reading vs the effective target temperature. Intended for devices that poll this endpoint to control a relay.

  - **200** – Recommendation available:
    - `state: 1` → **on** (last reading below target; heating should run).
    - `state: 0` → **off** (last reading at or above target).
  - **503** – No recent temperature reading; recommendation cannot be computed.

  **Response example (200):**

  ```json
  { "state": 1 }
  ```

  **Response example (503):**

  ```json
  { "error": "no_temperature_reading" }
  ```

  ```bash
  curl http://localhost:3000/api/power-socket/recommendation
  ```

#### Schema endpoints

- **GET** `/api/schemas`  
  Lists all schemas without their detailed intervals.

  **Response example:**

  ```json
  {
    "schemas": [
      {
        "id": 1,
        "name": "Work days",
        "description": "Typical office hours",
        "inOfficeTemperature": 22.0,
        "outOfOfficeTemperature": 18.0,
        "isActive": true
      }
    ]
  }
  ```

  ```bash
  curl http://localhost:3000/api/schemas
  ```

- **GET** `/api/schemas/:id`  
  Gets a single schema including its intervals.

  **Response example:**

  ```json
  {
    "schema": {
      "id": 1,
      "name": "Work days",
      "description": "Typical office hours",
      "inOfficeTemperature": 22.0,
      "outOfOfficeTemperature": 18.0,
      "isActive": true,
      "intervals": [
        { "id": 1, "dayOfWeek": 1, "startTimeMinutes": 480, "endTimeMinutes": 1020 }
      ]
    }
  }
  ```

  ```bash
  curl http://localhost:3000/api/schemas/1
  ```

- **POST** `/api/schemas`  
  Creates a new schema.

  **Request body:**

  ```json
  {
    "name": "Work days",
    "description": "Typical office hours",
    "inOfficeTemperature": 22.0,
    "outOfOfficeTemperature": 18.0,
    "intervals": [
      { "dayOfWeek": 1, "start": "08:00", "end": "17:00" } // Monday
    ]
  }
  ```

  **Response example (201 Created):**

  ```json
  {
    "schema": {
      "id": 1,
      "name": "Work days",
      "description": "Typical office hours",
      "inOfficeTemperature": 22.0,
      "outOfOfficeTemperature": 18.0,
      "isActive": false,
      "intervals": [
        { "id": 1, "dayOfWeek": 1, "startTimeMinutes": 480, "endTimeMinutes": 1020 }
      ]
    }
  }
  ```

  ```bash
  curl -X POST http://localhost:3000/api/schemas \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Work days",
      "description": "Typical office hours",
      "inOfficeTemperature": 22.0,
      "outOfOfficeTemperature": 18.0,
      "intervals": [
        { "dayOfWeek": 1, "start": "08:00", "end": "17:00" }
      ]
    }'
  ```

- **PUT** `/api/schemas/:id`  
  Updates an existing schema (body shape is the same as for creation).

  ```bash
  curl -X PUT http://localhost:3000/api/schemas/1 \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Work days (updated)",
      "description": "Updated description",
      "inOfficeTemperature": 22.0,
      "outOfOfficeTemperature": 18.0,
      "intervals": [
        { "dayOfWeek": 1, "start": "09:00", "end": "17:00" }
      ]
    }'
  ```

- **DELETE** `/api/schemas/:id`  
  Deletes a schema.

  - **204** on success (empty response body)
  - **404** with `{ "error": "Schema not found" }` if the schema does not exist.

  ```bash
  curl -X DELETE http://localhost:3000/api/schemas/1 -i
  ```

- **GET** `/api/schemas-active`  
  Returns the currently active schema (if any).

  **Response example:**

  ```json
  {
    "schema": {
      "id": 1,
      "name": "Work days",
      "description": "Typical office hours",
      "inOfficeTemperature": 22.0,
      "outOfOfficeTemperature": 18.0,
      "isActive": true,
      "intervals": [
        { "id": 1, "dayOfWeek": 1, "startTimeMinutes": 480, "endTimeMinutes": 1020 }
      ]
    }
  }
  ```

  ```bash
  curl http://localhost:3000/api/schemas-active
  ```

- **POST** `/api/schemas-active`  
  Sets or clears the active schema.

  - To **set** active:

    ```json
    { "schemaId": 1 }
    ```

  - To **clear** active schema:

    ```json
    { "schemaId": null }
    ```

  **Response example:**

  ```json
  { "schemaId": 1 }
  ```

  ```bash
  # Set schema 1 as active
  curl -X POST http://localhost:3000/api/schemas-active \
    -H "Content-Type: application/json" \
    -d '{ "schemaId": 1 }'

  # Clear active schema
  curl -X POST http://localhost:3000/api/schemas-active \
    -H "Content-Type: application/json" \
    -d '{ "schemaId": null }'
  ```

