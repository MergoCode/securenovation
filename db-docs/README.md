## SecureNovation DB & API Environment

### 1. Overview

- **Purpose**: Local environment for the lock backend with Postgres and Node.js API.
- **Goals**: Security, idempotent operations, and reproducible setup via Docker Compose.
- **Stack**:
  - Postgres `16.3` (Docker).
  - Node.js (Express) API with migrations (`node-pg-migrate`).
  - Single-command startup via `docker compose up --build`.

---

### 2. One-Command Startup

Run in the project root (where `docker-compose.yml` is located):

```bash
docker compose up --build
```

This will:

- Start **Postgres 16.3** (`service: db`).
- Build and start **Node.js API** (`service: api`), which:
  - Reads environment variables (including `DATABASE_URL`).
  - Runs migrations (`npm run migrate`).
  - Starts the server (`npm start`).

**API URL:** `http://localhost:3000`

---

### 3. Services

#### 3.1. Postgres Service (`db`)

- **Image**: `postgres:16.3`
- **Database config**:
  - `POSTGRES_DB=securenovation`
  - `POSTGRES_USER=securenovation`
  - `POSTGRES_PASSWORD=securenovation_password`
- **Ports**:
  - External: `5432`
  - Internal: `5432`
- **Data persistence**:
  - Uses a Docker volume `securenovation_pgdata` for `/var/lib/postgresql/data`.

Local connection parameters (from host):

- host: `localhost`
- port: `5432`
- db: `securenovation`
- user: `securenovation`
- password: `securenovation_password`

#### 3.2. API Service (`api`)

- Built from `./securenovation/Dockerfile`.
- On container start:
  - `npm run migrate`
  - `npm start`
- **Ports**:
  - External: `3000`
  - Internal: `3000`
- **Key environment variables**:
  - `DATABASE_URL` — Postgres connection string.
  - `PORT` — HTTP port (default `3000`).
  - `NODE_ENV` — `production` / `development`.
  - `ADMIN_USERNAME`, `ADMIN_PASSWORD` — admin credentials for `/api/login-user`.

---

### 4. Environment Configuration

#### 4.1. Recommended: Docker + `.env`

Create a `.env` file in the project root (see `db-docs/.env.example`):

```env
PORT=3000
NODE_ENV=production

DATABASE_URL=postgres://securenovation:securenovation_password@db:5432/securenovation

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin_password
```

In `docker-compose.yml`, configure the API service to load this file:

```yaml
services:
  api:
    env_file:
      - ./.env
```

After updating `.env`, restart:

```bash
docker compose down
docker compose up --build
```

#### 4.2. Local API + Docker DB (optional dev flow)

1. Start only Postgres:

```bash
docker compose up -d db
```

2. In `./securenovation`, create `.env`:

```env
DATABASE_URL=postgres://securenovation:securenovation_password@localhost:5432/securenovation
PORT=3000
NODE_ENV=development

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin_password
```

3. Run:

```bash
cd securenovation
npm install          # once
npm run migrate
npm run dev          # or npm start
```

---

### 5. Database Schema & Migrations

Migrations live in `securenovation/migrations` and are applied with:

```bash
cd securenovation
npm run migrate
```

**Rule:** any schema change must come via a new migration file. Do not edit existing migration files.

Current base migration (`1700000000001_init.js`) creates:

- **`users`**
  - `id` (serial, PK)
  - `uid` (text, not null, unique) — NFC card ID
  - `username` (text, not null)
  - `is_admin` (boolean, not null, default `false`)
  - `created_at` (timestamptz, default `now()`)

- **`logs`**
  - `id` (serial, PK)
  - `event` (text, not null)
  - `timestamp` (timestamptz, not null)
  - `nfc_id` (text, nullable)
  - `message` (text, nullable)

- **`lock_status`**
  - `id` (serial, PK)
  - `status` (boolean, not null) — `true` = unlocked, `false` = locked
  - `message` (text, nullable)
  - `updated_at` (timestamptz, default `now()`)

The migration also inserts an initial lock state: `status = false` (locked).

---

### 6. API Contracts (Do Not Break Without Coordination)

Core endpoints implemented in `securenovation/server.js`:

1. **POST `/api/register-uid`**

   **Request:**

   ```json
   {
     "uid": "string",
     "username": "string"
   }
   ```

   - Inserts or updates user by `uid` (idempotent).

   **Response (success):**

   ```json
   {
     "success": true,
     "user": {
       "id": 1,
       "uid": "string",
       "username": "string",
       "is_admin": false
     }
   }
   ```

2. **GET `/api/logs`**

   **Response:**

   ```json
   [
     {
       "event": "string",
       "timestamp": "2024-01-01T12:00:00.000Z",
       "nfc_id": "string or null",
       "message": "string or null"
     }
   ]
   ```

3. **GET `/api/lock-status`**

   **Response:**

   ```json
   {
     "status": true,
     "message": "string or null"
   }
   ```

   Returns the latest record from `lock_status` (ordered by `updated_at`).

4. **POST `/api/lock-status`**

   **Request:**

   ```json
   {
     "status": true,
     "message": "string (optional)"
   }
   ```

   **Response:**

   ```json
   {
     "success": true,
     "message": "Lock status updated"
   }
   ```

5. **POST `/api/lock-event`**

   **Request:**

   ```json
   {
     "event": "string",
     "timestamp": "ISO datetime string",
     "nfc_id": "string (optional)",
     "message": "string (optional)"
   }
   ```

   - Appends a new record into `logs`.

6. **POST `/api/login-user`**

   **Request:**

   ```json
   {
     "username": "string",
     "password": "string"
   }
   ```

   **Response:**

   ```json
   {
     "success": true,
     "message": "Login successful"
   }
   ```

   or

   ```json
   {
     "success": false,
     "message": "Invalid credentials"
   }
   ```

   - Compares credentials with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from env.

---

### 7. Safe vs Risky Changes

**Safe:**

- Adding new endpoints.
- Adding new optional fields to responses.
- Adding new columns via new migrations (without changing or removing existing ones).
- Adding indices and constraints that do not change existing contracts.

**Risky (coordinate before changing):**

- Changing request/response formats for existing endpoints.
- Renaming/removing columns or tables used by the API.
- Changing primary keys or unique constraints that affect existing data or behavior.

---

### 8. Typical Dev Flow

1. **First-time startup:**

   ```bash
   docker compose up --build
   ```

2. **Verify API:**

   - `GET http://localhost:3000/`
   - `GET http://localhost:3000/api/lock-status`
   - Test `POST /api/register-uid`, `POST /api/lock-event` via Postman/Insomnia.

3. **Schema change:**

   - Add a new migration in `securenovation/migrations`.
   - Apply via:

     ```bash
     # in container scenario:
     docker compose up --build

     # or locally:
     cd securenovation
     npm run migrate
     ```

4. **DB inspection:**

   - Connect to Postgres at `localhost:5432` using any DB client.
   - Inspect `users`, `logs`, `lock_status`.

