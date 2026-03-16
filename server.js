import express from "express";
import ngrok from "ngrok";
import { pool } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, SecureNovation!");
});

// POST /api/register-uid
app.post("/api/register-uid", async (req, res) => {
  const { uid, username } = req.body;

  if (!uid || !username) {
    return res.status(400).json({ success: false, message: "uid and username are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO users (uid, username) VALUES ($1, $2) ON CONFLICT (uid) DO UPDATE SET username = EXCLUDED.username RETURNING id, uid, username, is_admin",
      [uid, username],
    );

    return res.status(201).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error registering UID:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/logs
app.get("/api/logs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT event, timestamp, nfc_id, message FROM logs ORDER BY timestamp DESC",
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching logs:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/lock-status
app.get("/api/lock-status", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT status, message FROM lock_status ORDER BY updated_at DESC LIMIT 1",
    );

    if (result.rowCount === 0) {
      return res.status(200).json({ status: false, message: null });
    }

    const { status, message } = result.rows[0];

    return res.status(200).json({ status, message });
  } catch (error) {
    console.error("Error fetching lock status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/lock-status (update from device)
app.post("/api/lock-status", async (req, res) => {
  const { status, message } = req.body;

  if (typeof status !== "boolean") {
    return res.status(400).json({ success: false, message: "status (boolean) is required" });
  }

  try {
    await pool.query(
      "INSERT INTO lock_status (status, message) VALUES ($1, $2)",
      [status, message || null],
    );

    console.log(`[${new Date().toISOString()}] Lock status updated: ${status}, message: ${message}`);

    return res.status(200).json({
      success: true,
      message: "Lock status updated",
    });
  } catch (error) {
    console.error("Error updating lock status:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/lock-event -> save to logs
app.post("/api/lock-event", async (req, res) => {
  const { event, timestamp, nfc_id, message } = req.body;

  if (!event || !timestamp) {
    return res.status(400).json({ success: false, message: "event and timestamp are required" });
  }

  try {
    await pool.query(
      "INSERT INTO logs (event, timestamp, nfc_id, message) VALUES ($1, $2, $3, $4)",
      [event, timestamp, nfc_id || null, message || null],
    );

    console.log(`[${new Date().toISOString()}] Lock event: ${event}, ts: ${timestamp}`);

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error saving lock event:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/login-user
app.post("/api/login-user", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "username and password are required",
    });
  }

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin_password";

  if (username === adminUsername && password === adminPassword) {
    return res.status(200).json({
      success: true,
      message: "Login successful",
    });
  }

  return res.status(401).json({
    success: false,
    message: "Invalid credentials",
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
});

/* 
Ендпоінти:
1) POST /api/register-uid: Ендпоінт для реєстрації карточки в базі, приймає на вхід JSON: {
  "uid": "string",
  "username": "string"
}
2) GET /api/logs: Ендпоінт для отримання логів, повертає JSON масив з логами у форматі: [
  {
    "event": "string",  
    "timestamp": "datetime",
    "nfc_id": "string (nullable)",
    "message": "string (nullable)"
  },
  ...
]
3) GET /api/lock-status: Ендпоінт для отримання поточного статусу замка, повертає JSON: {
  "status": "boolean", // true - розблоковано, false - заблоковано
  "message": "string (nullable)"
}
4) POST /api/login-user: Ендпоінт для авторизації користувача, приймає на вхід JSON: {
  "username": "string",
  "password": "string"
}
Повертає JSON: {
  "success": boolean,
  "message": "string"
}

DB:
User:
- uid: string
- username: string
- id: int (AUTO_INCREMENT)
- isAdmin: boolean
Logs:
- id: int (AUTO_INCREMENT)
- event: string
- timestamp: datetime
- nfc_id: string (nullable)
- message: string (nullable)

*/
