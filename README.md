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

- **GET** `/api/temperature/target`  
  Returns current target temperature.

```bash
curl http://localhost:3000/api/temperature/target
```

- **POST** `/api/temperature/target`  
  Body: `{ "targetTemperature": number }`  
  Updates the target temperature.

```bash
curl -X POST http://localhost:3000/api/temperature/target \
  -H "Content-Type: application/json" \
  -d '{"targetTemperature": 22.5}'
```

- **POST** `/api/temperature/current`  
  Body: `{ "temperature": number }`  
  Logs a current temperature reading.

```bash
curl -X POST http://localhost:3000/api/temperature/current \
  -H "Content-Type: application/json" \
  -d '{"temperature": 21.3}'
```

- **GET** `/api/temperature/history?limit=20`  
  Returns recent logged temperatures (default 50, max 500).

```bash
curl "http://localhost:3000/api/temperature/history?limit=20"
```


