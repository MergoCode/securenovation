import express from "express";
import ngrok from "ngrok";
import fs from "fs/promises";
const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, SecureNovation!");
});

async function readDatabase() {
  try {
    const rawData = await fs.readFile("./UID_Decipher.json", "utf8");

    const parsedData = JSON.parse(rawData);

    return parsedData;
  } catch (error) {
    console.error("Помилка читання файлу:", error.message);
    return null;
  }
}

app.post("/api/lock-status", (req, res) => {
  const { status, message } = req.body;

  console.log(`[${new Date().toLocaleTimeString()}] Оновлення статусу:`);
  console.log(`Статус: ${status} | Повідомлення: ${message}`);

  res.status(200).json({
    success: true,
    message: "Сервер успішно прийняв дані",
  });
});

app.post("/api/lock-event", async (req, res) => {
  const NFC_decipher_obj = await readDatabase();
  const { event, timestamp } = req.body;
  console.log(`[${new Date().toLocaleTimeString()}] Подія замка:`);
  if (event.includes("password")) {
    if (event === "success_password") {
      console.log(`Lock unlocked by password, time: ${timestamp}`);
    } else if (event === "failed_password") {
      console.log(`Failed password attempt, time: ${timestamp}`);
    }
  }

  else if (event.includes("nfc")) {
    const nfcId = req.body.nfc_id;
    if (event === "success_nfc") {
      const userName = NFC_decipher_obj.find(el => el.UID.replaceAll(":", "") === nfcId)?.username || "Unknown NFC ID";
      console.log(
        `Lock unlocked by NFC; \nTime: ${timestamp}; \nNFC ID: ${nfcId}; NFC_USER: ${userName}`,
      );
    } else if (event === "failed_nfc") {
      console.log(
        `Failed NFC attempt; \nTime: ${timestamp}; \nNFC ID: ${nfcId}`,
      );
    }
  }

  else {
    if (event === "alarm") {
      console.log("ALARM: BREAK IN!");
    } else if (event === "lock") {
      console.log(`Lock engaged, time: ${timestamp}`);
    } else {
      console.log(`Unknown event: ${event}, time: ${timestamp}`);
    }
  }
  console.log(`Подія: ${event} | Час: ${timestamp}`);
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
