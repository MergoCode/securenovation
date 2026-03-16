import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
const PORT = 3000;

app.use(express.json());

// Налаштування підключення до БД (введи свої дані)
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "smart_lock", // назва твоєї БД
  password: "your_password", // твій пароль
  port: 5432,
});

// Глобальна змінна для статусу замка
let isDoorUnlocked = false;

app.get("/", (req, res) => {
  res.send("Hello, SecureNovation API is running!");
});

// --- ЕНДПОІНТИ ДЛЯ МОБІЛЬНОГО ДОДАТКУ ---

// 1. Реєстрація картки/користувача
app.post("/api/register-uid", async (req, res) => {
  const { uid, username, password = "default_password" } = req.body; // пароль потрібен для логіну
  try {
    const result = await pool.query(
      "INSERT INTO users (uid, username, password) VALUES ($1, $2, $3) RETURNING *",
      [uid, username, password]
    );
    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Помилка реєстрації:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Отримання логів
app.get("/api/logs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Статус замка
app.get("/api/lock-status", (req, res) => {
  res.json({
    status: isDoorUnlocked,
    message: isDoorUnlocked ? "Door is unlocked" : "Door is locked",
  });
});

// 4. Логін користувача
app.post("/api/login-user", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: "Login successful", user: { username, isAdmin: result.rows[0].is_admin } });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// --- ЕНДПОІНТ ДЛЯ ESP32 (ХАРДВАРУ) ---

app.post("/api/lock-event", async (req, res) => {
  const { event, timestamp, nfc_id } = req.body;
  let logMessage = "";
  let currentUserName = "Unknown";

  console.log(`\n[${new Date().toLocaleTimeString()}] Подія замка: ${event}`);

  try {
    // Якщо це NFC, шукаємо користувача в базі
    if (nfc_id) {
      const userResult = await pool.query("SELECT username FROM users WHERE uid = $1", [nfc_id]);
      if (userResult.rows.length > 0) {
        currentUserName = userResult.rows[0].username;
      }
    }

    // Обробка логіки івентів
    if (event.includes("password")) {
      if (event === "success_password") {
        isDoorUnlocked = true;
        logMessage = "Lock unlocked by password";
      } else if (event === "failed_password") {
        logMessage = "Failed password attempt";
      }
    } 
    else if (event.includes("nfc")) {
      if (event === "success_nfc") {
        isDoorUnlocked = true;
        logMessage = `Lock unlocked by NFC. User: ${currentUserName}`;
      } else if (event === "failed_nfc") {
        logMessage = `Failed NFC attempt`;
      }
    } 
    else {
      if (event === "alarm") {
        isDoorUnlocked = false;
        logMessage = "ALARM: BREAK IN!";
      } else if (event === "lock") {
        isDoorUnlocked = false;
        logMessage = "Lock manually engaged";
      } else {
        logMessage = `Unknown event: ${event}`;
      }
    }

    // Вивід у консоль
    console.log(`Текст: ${logMessage} | ESP Timestamp: ${timestamp} | NFC ID: ${nfc_id || "N/A"}`);

    // Запис логу в БД (час згенерує сам Postgres)
    await pool.query(
      "INSERT INTO logs (event, nfc_id, message) VALUES ($1, $2, $3)",
      [event, nfc_id || null, logMessage]
    );

    res.status(200).send("Event logged successfully");

  } catch (error) {
    console.error("Помилка обробки івенту:", error);
    res.status(500).send("Server Error");
  }
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
