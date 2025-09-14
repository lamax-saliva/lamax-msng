const express = require("express");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;
const USER_FILE = "User.json";
const MSG_FILE = "Messages.json";

// === Загрузка файлов (аватары) ===
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public")); // фронтенд

// === Работа с User.json ===
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) return { users: [] };
  return JSON.parse(fs.readFileSync(USER_FILE));
}
function saveUsers(data) {
  fs.writeFileSync(USER_FILE, JSON.stringify(data, null, 2));
}

// === Работа с Messages.json ===
function loadMessages() {
  if (!fs.existsSync(MSG_FILE)) return { chats: {} };
  return JSON.parse(fs.readFileSync(MSG_FILE));
}
function saveMessages(data) {
  fs.writeFileSync(MSG_FILE, JSON.stringify(data, null, 2));
}

// === API ===

// Регистрация
app.post("/api/register", (req, res) => {
  const { username, nickname, password } = req.body;
  let db = loadUsers();

  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Логин уже существует" });
  }
  if (db.users.find(u => u.nickname === nickname)) {
    return res.status(400).json({ error: "Ник уже занят" });
  }

  db.users.push({ username, nickname, password, avatar: null });
  saveUsers(db);
  res.json({ message: "Регистрация успешна" });
});

// Вход
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  let db = loadUsers();

  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Неверный логин или пароль" });

  res.json({ username: user.username, nickname: user.nickname, avatar: user.avatar });
});

// Список пользователей
app.get("/api/users", (req, res) => {
  let db = loadUsers();
  res.json(db.users.map(u => ({ username: u.username, nickname: u.nickname, avatar: u.avatar })));
});

// Обновление профиля
app.put("/api/profile", (req, res) => {
  const { username, newName, newNick, oldPassword, newPassword, avatar } = req.body;
  let db = loadUsers();

  let user = db.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  if (oldPassword && user.password !== oldPassword) {
    return res.status(400).json({ error: "Старый пароль неверный" });
  }

  if (newName) user.username = newName;
  if (newNick) user.nickname = newNick;
  if (newPassword) user.password = newPassword;
  if (avatar) user.avatar = avatar;

  saveUsers(db);
  res.json({ message: "Профиль обновлен", user });
});

// Загрузка аватара
app.post("/api/upload", upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// === WebSocket ===
io.on("connection", (socket) => {
  console.log("✅ Новый клиент подключился");

  socket.on("joinChat", (chatName) => {
    const db = loadMessages();
    const history = db.chats[chatName] || [];
    socket.emit("chatHistory", history);
  });

  socket.on("message", ({ chatName, user, text }) => {
    const db = loadMessages();
    if (!db.chats[chatName]) db.chats[chatName] = [];
    const msg = { user, text, time: new Date().toISOString() };
    db.chats[chatName].push(msg);
    saveMessages(db);

    io.emit("message", { chatName, ...msg });
  });
});

server.listen(PORT, () => console.log(`✅ Сервер запущен: http://localhost:${PORT}`));
