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

/* ---------- uploads (аватары) ---------- */
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
app.use(bodyParser.json({ limit: "25mb" })); // запас для dataURL
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public")); // фронтенд

/* ---------- helpers JSON ---------- */
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) return { users: [] };
  return JSON.parse(fs.readFileSync(USER_FILE));
}
function saveUsers(data) {
  fs.writeFileSync(USER_FILE, JSON.stringify(data, null, 2));
}
function loadMessages() {
  if (!fs.existsSync(MSG_FILE)) return { chats: {} };
  return JSON.parse(fs.readFileSync(MSG_FILE));
}
function saveMessages(data) {
  fs.writeFileSync(MSG_FILE, JSON.stringify(data, null, 2));
}

// детерминированный id приватной комнаты
function pvRoomId(a, b) {
  return "pv:" + [a, b].sort((x, y) => x.localeCompare(y)).join("|");
}

/* ---------- REST API ---------- */
// регистрация
app.post("/api/register", (req, res) => {
  const { username, nickname, password } = req.body;
  if (!username || !nickname || !password) {
    return res.status(400).json({ error: "Заполните все поля" });
  }
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

// логин
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  let db = loadUsers();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Неверный логин или пароль" });
  res.json({ username: user.username, nickname: user.nickname, avatar: user.avatar });
});

// список пользователей
app.get("/api/users", (req, res) => {
  let db = loadUsers();
  res.json(db.users.map(u => ({ username: u.username, nickname: u.nickname, avatar: u.avatar })));
});

// обновление профиля
app.put("/api/profile", (req, res) => {
  const { username, newName, newNick, oldPassword, newPassword, avatar } = req.body;
  let db = loadUsers();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  if (newPassword || oldPassword) {
    if (!oldPassword) return res.status(400).json({ error: "Укажите старый пароль" });
    if (oldPassword !== user.password) return res.status(400).json({ error: "Старый пароль неверный" });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Новый пароль слишком короткий" });
    user.password = newPassword;
  }
  if (newName) {
    if (db.users.some(u => u !== user && u.username === newName)) {
      return res.status(400).json({ error: "Логин уже занят" });
    }
    user.username = newName;
  }
  if (newNick) {
    if (!newNick.startsWith("@")) return res.status(400).json({ error: "Ник должен начинаться с @" });
    if (db.users.some(u => u !== user && u.nickname === newNick)) {
      return res.status(400).json({ error: "Ник уже занят" });
    }
    user.nickname = newNick;
  }
  if (avatar) user.avatar = avatar;

  saveUsers(db);
  res.json({ message: "Профиль обновлен", user });
});

// загрузка аватара
app.post("/api/upload", upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// presence
const socketsByUser = new Map(); // username -> socketId
const usersBySocket = new Map(); // socketId -> { username, nickname }

io.on("connection", (socket) => {
  // пользователь онлайн: запомним сокет и подключим в его комнаты
  socket.on("presence:online", ({ username, nickname }) => {
    if (!username) return;
    socketsByUser.set(username, socket.id);
    usersBySocket.set(socket.id, { username, nickname });

    // всегда в общий чат
    socket.join("room:public");

    // подключим все приватные комнаты, где он участник
    const db = loadMessages();
    Object.keys(db.chats).forEach(roomId => {
      if (roomId.startsWith("pv:")) {
        const [a, b] = roomId.slice(3).split("|");
        if (a === username || b === username) socket.join(roomId);
      }
    });

    io.emit("presence:list", Array.from(socketsByUser.keys()));
  });

  socket.on("disconnect", () => {
    const u = usersBySocket.get(socket.id);
    if (u) {
      socketsByUser.delete(u.username);
      usersBySocket.delete(socket.id);
      io.emit("presence:list", Array.from(socketsByUser.keys()));
    }
  });

  /* ----- чаты ----- */
  // клиент явно открывает чат -> присоединим и отдадим историю
  socket.on("joinChat", (roomId) => {
    socket.join(roomId);
    const db = loadMessages();
    const history = db.chats[roomId] || [];
    socket.emit("chatHistory", { roomId, history });
  });

  // новое сообщение (текст + опционально вложение dataURL)
  socket.on("message", ({ roomId, user, text, attachment }) => {
    const db = loadMessages();
    if (!db.chats[roomId]) db.chats[roomId] = [];
    const msg = { user, text: text || "", attachment: attachment || null, time: new Date().toISOString() };
    db.chats[roomId].push(msg);
    saveMessages(db);

    io.to(roomId).emit("message", { roomId, ...msg });
  });

  /* ----- звонки (сигналинг WebRTC) ----- */
  socket.on("call:invite", ({ toUsername, fromUsername, fromNickname }) => {
    const toId = socketsByUser.get(toUsername);
    if (!toId) return socket.emit("call:error", { reason: "Пользователь офлайн" });
    io.to(toId).emit("call:incoming", { fromUsername, fromNickname });
  });

  socket.on("call:reject", ({ toUsername }) => {
    const toId = socketsByUser.get(toUsername);
    if (toId) io.to(toId).emit("call:rejected");
  });

  socket.on("call:accept", ({ toUsername }) => {
    const toId = socketsByUser.get(toUsername);
    if (toId) io.to(toId).emit("call:accepted");
  });

  socket.on("call:hangup", ({ toUsername }) => {
    const toId = socketsByUser.get(toUsername);
    if (toId) io.to(toId).emit("call:hungup");
  });

  // пересылка SDP/ICE
  socket.on("webrtc:offer", ({ toUsername, sdp }) => {
    const toId = socketsByUser.get(toUsername);
    if (toId) io.to(toId).emit("webrtc:offer", { sdp });
  });
  socket.on("webrtc:answer", ({ toUsername, sdp }) => {
    const toId = socketsByUser.get(toUsername);
    if (toId) io.to(toId).emit("webrtc:answer", { sdp });
  });
  socket.on("webrtc:ice", ({ toUsername, candidate }) => {
    const toId = socketsByUser.get(toUsername);
    if (toId) io.to(toId).emit("webrtc:ice", { candidate });
  });
});

server.listen(PORT, () => console.log(`✅ Сервер запущен: http://localhost:${PORT}`));
