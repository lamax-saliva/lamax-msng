document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://193.233.86.5:3000/api";
  const SOCKET_URL = "http://193.233.86.5:3000";

  const socket = io(SOCKET_URL);

  const messagesContainer = document.getElementById("messages-container");
  const messageInput = document.getElementById("message-input");
  const sendButton = document.getElementById("send-button");
  const emojiButton = document.getElementById("emoji-button");
  const attachButton = document.getElementById("attach-button");
  const micButton = document.getElementById("mic-button");
  const fileInput = document.getElementById("file-input");
  const emojiPanel = document.getElementById("emoji-panel");
  const recordingIndicator = document.getElementById("recording-indicator");
  const favoritesList = document.getElementById("favorites-list");
  const notificationsList = document.getElementById("notifications-list");
  const themeSelect = document.getElementById("theme-select");
  const userList = document.getElementById("user-list");
  const searchUser = document.getElementById("search-user");
  const chatNameEl = document.getElementById("current-chat-name");
  const chatDescEl = document.getElementById("current-chat-desc");
  const chatAvatarEl = document.getElementById("chat-avatar");

  let mediaRecorder;
  let audioChunks = [];
  let currentChat = "Общий чат";

  // Загружаем текущего пользователя
  let currentUser = localStorage.getItem("username");
  let currentNick = localStorage.getItem("nickname");
  if (!currentUser) {
    alert("Сначала войдите!");
    window.location.href = "login.html";
  }
  document.getElementById("user-name").textContent = `${currentUser} (${currentNick})`;

  // Время
  function getCurrentTime() {
    const now = new Date();
    return now.getHours().toString().padStart(2, "0") + ":" +
           now.getMinutes().toString().padStart(2, "0");
  }

  // Сообщения
  function addMessage(user, text, type, attachment=null) {
    const msg = document.createElement("div");
    msg.className = `message ${type} new`;
    let attachHtml = "";
    if (attachment) {
      if (attachment.type === "audio") {
        attachHtml = `<audio controls src="${attachment.url}"></audio>`;
      } else if (attachment.type.startsWith("image/")) {
        attachHtml = `<div class="media-attachment"><img src="${attachment.url}"></div>`;
      } else {
        attachHtml = `<div class="media-attachment"><a href="${attachment.url}" download>${attachment.name}</a></div>`;
      }
    }
    msg.innerHTML = `
      <div class="message-avatar">${user.charAt(0)}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${user}</span>
          <span class="message-time">${getCurrentTime()}</span>
        </div>
        ${text ? `<div class="message-text">${text}</div>` : ""}
        ${attachHtml}
        <div class="message-status">
          <button onclick="addToFavorites('${text}')">⭐</button>
        </div>
      </div>
    `;
    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // === WebSocket ===
  socket.emit("joinChat", currentChat);

  socket.on("chatHistory", (history) => {
    messagesContainer.innerHTML = "";
    history.forEach(msg => {
      addMessage(msg.user, msg.text, msg.user === currentNick ? "outgoing" : "incoming");
    });
  });

  socket.on("message", (msg) => {
    if (msg.chatName === currentChat) {
      addMessage(msg.user, msg.text, msg.user === currentNick ? "outgoing" : "incoming");
    }
  });

  // Отправка текста
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit("message", { chatName: currentChat, user: currentNick, text });
    messageInput.value = "";
  }
  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

  // Избранное
  window.addToFavorites = function(text) {
    if (!text) return;
    favoritesList.innerHTML += `<div class="favorite-item">${text}</div>`;
  };

  // Уведомления
  function addNotification(text) {
    notificationsList.innerHTML = `<div class="notification-item">${text}</div>` + notificationsList.innerHTML;
  }

  // Смайлы
  const emojis = ["😀","😂","😍","😎","😢","😡","👍","🙏","🔥","🎉"];
  emojis.forEach(e => {
    const span = document.createElement("span");
    span.textContent = e;
    span.addEventListener("click", () => {
      messageInput.value += e;
      emojiPanel.style.display = "none";
    });
    emojiPanel.appendChild(span);
  });
  emojiButton.addEventListener("click", () => {
    emojiPanel.style.display = emojiPanel.style.display === "flex" ? "none" : "flex";
  });

  // Прикрепление файлов
  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    for (const file of fileInput.files) {
      const reader = new FileReader();
      reader.onload = e => {
        addMessage(currentNick, "Файл:", "outgoing", {
          url: e.target.result,
          type: file.type,
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = "";
  });

  // Голосовые сообщения
  micButton.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.start();
        micButton.style.background = "red";
        recordingIndicator.style.display = "block";
        mediaRecorder.addEventListener("dataavailable", e => {
          audioChunks.push(e.data);
        });
        mediaRecorder.addEventListener("stop", () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          const url = URL.createObjectURL(blob);
          addMessage(currentNick, "", "outgoing", { url, type: "audio" });
          micButton.style.background = "var(--primary)";
          recordingIndicator.style.display = "none";
        });
      } catch (err) {
        alert("Ошибка доступа к микрофону");
        console.error(err);
      }
    } else {
      mediaRecorder.stop();
    }
  });

  // Темы
  function changeTheme(theme) {
    document.body.classList.remove("dark","light");
    document.body.classList.add(theme);
    localStorage.setItem("theme", theme);
  }
  themeSelect.value = localStorage.getItem("theme") || "dark";
  changeTheme(themeSelect.value);
  themeSelect.addEventListener("change", () => changeTheme(themeSelect.value));

  // Переключение вкладок
  document.querySelectorAll(".hex-button").forEach(btn => {
    btn.addEventListener("click", function() {
      const tab = this.getAttribute("data-tab");
      if (tab === "settings") {
        document.getElementById("settings-modal").style.display = "block";
      } else {
        document.querySelectorAll(".hex-button").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
        document.getElementById(`${tab}-tab`).style.display = "block";
      }
    });
  });

  // Закрытие модалок
  document.querySelectorAll(".close").forEach(c => {
    c.addEventListener("click", () => {
      c.closest(".modal").style.display = "none";
    });
  });

  // Выход
  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("username");
    localStorage.removeItem("nickname");
    window.location.href = "login.html";
  });

  // Создание чата вручную
  document.getElementById("create-chat-btn").addEventListener("click", () => {
    const name = prompt("Введите название чата:");
    if (name) {
      document.querySelector(".chat-list").innerHTML += `<div class="chat-item" data-chat="${name}">💬 ${name}</div>`;
      addNotification(`Создан чат: ${name}`);
    }
  });

  // Смена пароля
  document.getElementById("change-password-btn").addEventListener("click", () => {
    document.getElementById("password-modal").style.display = "block";
  });
  document.getElementById("save-password").addEventListener("click", async () => {
    const oldPass = document.getElementById("old-password").value.trim();
    const newPass = document.getElementById("new-password").value.trim();
    const confirmPass = document.getElementById("confirm-password").value.trim();

    if (newPass.length < 6) {
      alert("Пароль должен быть не меньше 6 символов");
      return;
    }
    if (newPass !== confirmPass) {
      alert("Пароли не совпадают");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, oldPassword: oldPass, newPassword: newPass })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Пароль успешно изменён");
        document.getElementById("password-modal").style.display = "none";
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Ошибка сервера");
    }
  });

  // Поиск пользователей
  async function renderUsers(filter="") {
    try {
      const res = await fetch(`${API_URL}/users`);
      const users = await res.json();
      userList.innerHTML = "";
      users
        .filter(u => u.nickname.toLowerCase().includes(filter.toLowerCase()))
        .forEach(u => {
          const div = document.createElement("div");
          div.className = "user-list-item";
          div.innerHTML = `
            <div class="user-avatar-small">${u.username.charAt(0)}</div>
            <div class="user-info">
              <div class="user-name">${u.username}</div>
              <div class="user-title">${u.nickname}</div>
            </div>
            <button class="user-action-btn">Написать</button>
          `;
          div.querySelector("button").addEventListener("click", () => {
            createPrivateChat(u.username, u.nickname);
          });
          userList.appendChild(div);
        });
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
    }
  }
  renderUsers();
  searchUser.addEventListener("input", () => {
    renderUsers(searchUser.value);
  });

  // Приватные чаты
  function createPrivateChat(username, nickname) {
    currentChat = `Чат с ${username}`;
    const chatList = document.querySelector(".chat-list");

    if (![...chatList.children].some(c => c.dataset.chat === currentChat)) {
      chatList.innerHTML += `<div class="chat-item" data-chat="${currentChat}">💬 ${currentChat}</div>`;
      addNotification(`Создан чат с ${username}`);
    }

    chatNameEl.textContent = currentChat;
    chatDescEl.textContent = nickname;
    chatAvatarEl.textContent = nickname.charAt(1) || "@";
    chatAvatarEl.style.background = "var(--primary)";

    socket.emit("joinChat", currentChat);
    messagesContainer.innerHTML = "";
  }
});
