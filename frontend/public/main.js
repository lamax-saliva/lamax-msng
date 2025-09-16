document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://193.233.86.5:3000/api";
  const SOCKET_URL = "http://193.233.86.5:3000";

  console.log("✅ main.js загружен");

  const socket = io(SOCKET_URL);

  socket.on("connect", () => {
    console.log("🔌 Socket.IO подключен:", socket.id);
  });
  socket.on("connect_error", (err) => {
    console.error("❌ Ошибка подключения:", err);
  });

  /* ==== DOM ==== */
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
  const chatList = document.getElementById("chat-list");
  const chatNameEl = document.getElementById("current-chat-name");
  const chatDescEl = document.getElementById("current-chat-desc");
  const chatAvatarEl = document.getElementById("chat-avatar");
  const meAvatar = document.getElementById("me-avatar");

  // звонки
  const callBtn = document.getElementById("call-button");
  const inCallUI = document.getElementById("in-call-ui");
  const callStatus = document.getElementById("call-status");
  const muteBtn = document.getElementById("mute-btn");
  const hangupBtn = document.getElementById("hangup-btn");
  const incomingModal = document.getElementById("incoming-call-modal");
  const incomingFromEl = document.getElementById("incoming-call-from");
  const acceptCallBtn = document.getElementById("accept-call-btn");
  const rejectCallBtn = document.getElementById("reject-call-btn");
  const remoteAudio = document.getElementById("remote-audio");
  const localAudio = document.getElementById("local-audio");

  // уведомление и рингтон
  const ringtone = document.getElementById("ringtone");
  const callNotification = document.getElementById("call-notification");
  const callNotificationText = document.getElementById("call-notification-text");

  /* ==== state ==== */
  let currentUser = localStorage.getItem("username");
  let currentNick = localStorage.getItem("nickname");
  let currentAvatar = localStorage.getItem("avatar");
  let currentRoomId = "room:public";
  let currentPeerUsername = null;

  if (!currentUser) {
    alert("Сначала войдите!");
    location.href = "login.html";
    return;
  }

  document.getElementById("user-name").textContent = `${currentUser} (${currentNick})`;
  if (currentAvatar) {
    meAvatar.style.backgroundImage = `url(${SOCKET_URL}${currentAvatar})`;
    meAvatar.style.backgroundSize = "cover";
    meAvatar.textContent = "";
  }

  socket.emit("presence:online", { username: currentUser, nickname: currentNick });

  /* ==== helpers ==== */
  const pvRoomId = (a, b) => "pv:" + [a, b].sort().join("|");
  function getCurrentTime() {
    const d = new Date();
    return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
  }
  function renderAttachmentHTML(att) {
    if (!att) return "";
    const url = att.dataUrl || att.url;
    if (att.type === "audio") return `<audio controls src="${url}"></audio>`;
    if (att.type && att.type.startsWith("image/")) return `<div class="media-attachment"><img src="${url}"></div>`;
    return `<a href="${url}" download>${att.name || "Файл"}</a>`;
  }
  function addMessage(user, text, type, attachment=null) {
    const msg = document.createElement("div");
    msg.className = `message ${type}`;
    msg.innerHTML = `
      <div class="message-avatar">${user.charAt(0)}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${user}</span>
          <span class="message-time">${getCurrentTime()}</span>
        </div>
        ${text ? `<div class="message-text">${text}</div>` : ""}
        ${renderAttachmentHTML(attachment)}
        <div class="message-status"><button class="fav-btn">⭐</button></div>
      </div>
    `;
    msg.querySelector(".fav-btn").addEventListener("click", () => {
      favoritesList.innerHTML += `
        <div class="favorite-item">
          <div><b>${user}</b> [${getCurrentTime()}]</div>
          <div>${text || "(вложение)"}</div>
        </div>`;
    });
    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  function addNotification(text){
    notificationsList.innerHTML = `<div class="notification-item">${text}</div>` + notificationsList.innerHTML;
  }
  function markUnread(roomId) {
    const chat = document.querySelector(`.chat-item[data-room="${roomId}"]`);
    if (!chat) return;
    let badge = chat.querySelector(".unread-count");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "unread-count";
      badge.textContent = "1";
      chat.appendChild(badge);
    } else {
      badge.textContent = parseInt(badge.textContent) + 1;
    }
  }

  /* ==== Чаты ==== */
  socket.emit("joinChat", currentRoomId);
  socket.on("chatHistory", ({ roomId, history }) => {
    if (roomId !== currentRoomId) return;
    messagesContainer.innerHTML = "";
    history.forEach(m => addMessage(m.user, m.text, m.user === currentNick ? "outgoing" : "incoming", m.attachment));
  });
  socket.on("message", (m) => {
    if (m.roomId === currentRoomId) {
      addMessage(m.user, m.text, m.user === currentNick ? "outgoing" : "incoming", m.attachment);
    } else {
      markUnread(m.roomId);
      addNotification(`Новое сообщение в ${m.roomId}`);
    }
  });

  chatList.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    if (!item) return;
    document.querySelectorAll(".chat-item").forEach(c => c.classList.remove("active"));
    item.classList.add("active");
    currentRoomId = item.dataset.room;
    chatNameEl.textContent = item.textContent;
    messagesContainer.innerHTML = "";
    socket.emit("joinChat", currentRoomId);
    const badge = item.querySelector(".unread-count");
    if (badge) badge.remove();
  });

  /* ==== Отправка ==== */
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit("message", { roomId: currentRoomId, user: currentNick, text });
    messageInput.value = "";
  }
  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

  /* ==== Эмодзи ==== */
  ["😀","😂","😍","😎","😢","😡","👍","🙏","🔥","🎉"].forEach(e => {
    const span = document.createElement("span");
    span.textContent = e;
    span.style.cursor = "pointer";
    span.addEventListener("click", () => { messageInput.value += e; emojiPanel.style.display = "none"; });
    emojiPanel.appendChild(span);
  });
  emojiButton.addEventListener("click", () => {
    emojiPanel.style.display = emojiPanel.style.display === "flex" ? "none" : "flex";
  });

  /* ==== Файлы ==== */
  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    [...fileInput.files].forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const att = { dataUrl: e.target.result, type: file.type, name: file.name };
        socket.emit("message", { roomId: currentRoomId, user: currentNick, text: "Файл:", attachment: att });
      };
      reader.readAsDataURL(file);
    });
    fileInput.value = "";
  });

  /* ==== Голосовые ==== */
  let mediaRecorder; let audioChunks = [];
  micButton.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.start();
        recordingIndicator.style.display = "block";
        mediaRecorder.addEventListener("dataavailable", e => audioChunks.push(e.data));
        mediaRecorder.addEventListener("stop", () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onload = ev => {
            const att = { dataUrl: ev.target.result, type: "audio" };
            socket.emit("message", { roomId: currentRoomId, user: currentNick, text: "", attachment: att });
          };
          reader.readAsDataURL(blob);
          recordingIndicator.style.display = "none";
        });
      } catch { alert("Нет доступа к микрофону"); }
    } else {
      mediaRecorder.stop();
    }
  });

  /* ==== Темы ==== */
  function changeTheme(theme){ document.body.classList.remove("dark","light"); document.body.classList.add(theme); localStorage.setItem("theme", theme); }
  themeSelect.value = localStorage.getItem("theme") || "dark";
  changeTheme(themeSelect.value);
  themeSelect.addEventListener("change", () => changeTheme(themeSelect.value));

  /* ==== Выход ==== */
  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.clear();
    location.href = "login.html";
  });

  /* ==== Новый чат ==== */
  document.getElementById("create-chat-btn").addEventListener("click", () => {
    const name = prompt("Введите название нового чата:");
    if (!name) return;
    const roomId = "room:" + name.toLowerCase().replace(/\s+/g, "_");
    if (!document.querySelector(`.chat-item[data-room="${roomId}"]`)) {
      const div = document.createElement("div");
      div.className = "chat-item";
      div.dataset.room = roomId;
      div.textContent = `💬 ${name}`;
      chatList.appendChild(div);
    }
    addNotification(`Создан новый чат: ${name}`);
  });

  /* ==== Пользователи ==== */
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
            <button class="user-action-btn">Написать</button>`;
            div.querySelector("button").addEventListener("click", () => openPrivateChat(u.username, u.nickname));
            userList.appendChild(div);
          });
    } catch (e) { console.error(e); }
  }
  renderUsers();
  searchUser.addEventListener("input", () => renderUsers(searchUser.value));

  function openPrivateChat(username, nickname) {
    currentPeerUsername = username;
    currentRoomId = pvRoomId(currentUser, username);
    if (!document.querySelector(`.chat-item[data-room="${currentRoomId}"]`)) {
      const div = document.createElement("div");
      div.className = "chat-item";
      div.dataset.room = currentRoomId;
      div.textContent = `💬 Чат с ${username}`;
      chatList.appendChild(div);
    }
    document.querySelectorAll(".chat-item").forEach(c => c.classList.remove("active"));
    document.querySelector(`.chat-item[data-room="${currentRoomId}"]`).classList.add("active");
    chatNameEl.textContent = `Чат с ${username}`;
    chatDescEl.textContent = nickname;
    messagesContainer.innerHTML = "";
    socket.emit("joinChat", currentRoomId);
  }

  /* ==== Звонки ==== */
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  let pc = null, localStream = null;
  let isMuted = false;

  async function startPeer(isOffer) {
    pc = new RTCPeerConnection(rtcConfig);
    pc.ontrack = e => { remoteAudio.srcObject = e.streams[0]; };
    pc.onicecandidate = e => { if (e.candidate && currentPeerUsername) socket.emit("webrtc:ice", { toUsername: currentPeerUsername, candidate: e.candidate }); };
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    localAudio.srcObject = localStream;
    if (isOffer) {
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { toUsername: currentPeerUsername, sdp: offer });
    }
  }

  callBtn.addEventListener("click", () => {
    if (!currentPeerUsername) return alert("Выберите пользователя для звонка");
    inCallUI.style.display = "block";
    callStatus.textContent = `Звоним ${currentPeerUsername}…`;
    socket.emit("call:invite", { toUsername: currentPeerUsername, fromUsername: currentUser, fromNickname: currentNick });
  });

  socket.on("call:incoming", ({ fromUsername }) => {
    incomingModal.style.display = "block";
    incomingFromEl.textContent = `Звонит ${fromUsername}`;
    currentPeerUsername = fromUsername;

    // уведомление + рингтон
    callNotificationText.textContent = `Звонок от ${fromUsername}`;
    callNotification.classList.add("show");
    ringtone.play().catch(()=>{});
  });

  acceptCallBtn.addEventListener("click", async () => {
    incomingModal.style.display = "none";
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;

    inCallUI.style.display = "block";
    socket.emit("call:accept", { toUsername: currentPeerUsername });
    await startPeer(false);
  });
  rejectCallBtn.addEventListener("click", () => {
    incomingModal.style.display = "none";
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;

    socket.emit("call:reject", { toUsername: currentPeerUsername });
    currentPeerUsername = null;
  });

  socket.on("call:accepted", async () => { await startPeer(true); });
  socket.on("webrtc:offer", async ({ sdp }) => { if (!pc) await startPeer(false); await pc.setRemoteDescription(new RTCSessionDescription(sdp)); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit("webrtc:answer", { toUsername: currentPeerUsername, sdp: answer }); });
  socket.on("webrtc:answer", async ({ sdp }) => { if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp)); });
  socket.on("webrtc:ice", async ({ candidate }) => { if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)); });

  /* ==== Завершение звонка ==== */
  hangupBtn.addEventListener("click", () => {
    socket.emit("call:hangup", { toUsername: currentPeerUsername });
    if (pc) pc.close();
    inCallUI.style.display = "none";
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;
    currentPeerUsername = null;
  });
  socket.on("call:hangup", () => {
    if (pc) pc.close();
    inCallUI.style.display = "none";
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;
    currentPeerUsername = null;
  });

  /* ==== Отклонение ==== */
  socket.on("call:rejected", () => {
    inCallUI.style.display = "none";
    callStatus.textContent = "Звонок отклонён";
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;
    currentPeerUsername = null;
  });

  /* ==== Mute/Unmute ==== */
  muteBtn.addEventListener("click", () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    muteBtn.textContent = isMuted ? "Unmute" : "Mute";
  });

  /* ==== Переключение вкладок ==== */
  document.querySelectorAll(".hex-button").forEach(btn => {
    btn.addEventListener("click", function () {
      const tab = this.getAttribute("data-tab");

      document.querySelectorAll(".hex-button").forEach(b => b.classList.remove("active"));
      this.classList.add("active");

      document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
      const activeTab = document.getElementById(`${tab}-tab`);
      if (activeTab) activeTab.style.display = "block";

      if (tab === "settings") {
        document.getElementById("settings-modal").style.display = "block";
      }
    });
  });

  /* ==== Закрытие модалок ==== */
  document.querySelectorAll(".modal .close").forEach(c => {
    c.addEventListener("click", () => {
      c.closest(".modal").style.display = "none";
    });
  });

});
