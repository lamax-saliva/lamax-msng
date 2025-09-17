document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://193.233.86.5:3000/api";
  const SOCKET_URL = "http://193.233.86.5:3000";

  console.log("✅ main.js загружен");

  const socket = io(SOCKET_URL);

  /* ==== DOM ==== */
  const messagesContainer = document.getElementById("messages-container");
  const typingIndicator = document.getElementById("typing-indicator");
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
  const userList = document.getElementById("user-list");
  const searchUser = document.getElementById("search-user");
  const chatList = document.getElementById("chat-list");
  const chatNameEl = document.getElementById("current-chat-name");
  const chatDescEl = document.getElementById("current-chat-desc");
  const meAvatar = document.getElementById("me-avatar");

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
  function formatTime(iso) {
    const d = new Date(iso);
    return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
  }
  function renderAttachmentHTML(att) {
    if (!att) return "";
    const url = att.dataUrl || att.url;
    if (att.type === "audio") {
      return `
        <div class="voice-message">
          <button class="play-btn"><i class="fas fa-play"></i></button>
          <div class="progress-container"><div class="progress-bar"></div></div>
          <span class="time">0:00</span>
          <audio src="${url}" preload="metadata"></audio>
        </div>
      `;
    }
    if (att.type && att.type.startsWith("image/")) {
      return `<div class="media-attachment"><img src="${url}"></div>`;
    }
    return `<a href="${url}" download>${att.name || "Файл"}</a>`;
  }

  /* ==== Сообщения ==== */
  function addMessage(user, text, type, attachment=null, time=null, roomId=currentRoomId) {
    const msg = document.createElement("div");
    const msgId = Date.now().toString() + Math.random().toString(36).slice(2,8);
    msg.className = `message ${type}`;
    msg.dataset.msgId = msgId;
    msg.dataset.roomId = roomId;

    msg.innerHTML = `
  <div class="message-avatar">${user.charAt(0)}</div>
  <div class="message-content">
    ${text ? `<div class="message-text">${text}</div>` : ""}
    ${renderAttachmentHTML(attachment)}
    <span class="message-time">${time ? formatTime(time) : formatTime(new Date())}</span>
  </div>
  <button class="fav-btn">⭐</button>
`;



    // ⭐ избранное
    msg.querySelector(".fav-btn").addEventListener("click", () => {
      const btn = msg.querySelector(".fav-btn");
      btn.classList.toggle("active");
      if (btn.classList.contains("active")) {
        const fav = document.createElement("div");
        fav.className = "favorite-item";
        fav.dataset.msgId = msgId;
        fav.dataset.roomId = roomId;
        fav.innerHTML = `
          <div><b>${user}</b> [${time ? formatTime(time) : formatTime(new Date())}]</div>
          <div>${text || (attachment?.type === "audio" ? "🎙 Голосовое сообщение" : "(вложение)")}</div>
        `;
        fav.addEventListener("click", () => {
          if (roomId !== currentRoomId) {
            activateChatItem(roomId);
            socket.once("chatHistory", ({ roomId: histRoom }) => {
              if (histRoom === roomId) {
                setTimeout(() => {
                  const original = document.querySelector('.message[data-msg-id="' + msgId + '"]');
                  if (original) {
                    original.scrollIntoView({ behavior: "smooth", block: "center" });
                    original.classList.add("highlight");
                    setTimeout(() => original.classList.remove("highlight"), 2000);
                  }
                }, 300);
              }
            });
          } else {
            const original = document.querySelector('.message[data-msg-id="' + msgId + '"]');
            if (original) {
              original.scrollIntoView({ behavior: "smooth", block: "center" });
              original.classList.add("highlight");
              setTimeout(() => original.classList.remove("highlight"), 2000);
            }
          }
        });
        favoritesList.appendChild(fav);
      }
    });

    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 🎙 плеер голосовых
    msg.querySelectorAll(".voice-message").forEach(vm => {
      const audio = vm.querySelector("audio");
      const playBtn = vm.querySelector(".play-btn");
      const progressBar = vm.querySelector(".progress-bar");
      const timeEl = vm.querySelector(".time");

      playBtn.addEventListener("click", () => {
        if (audio.paused) {
          audio.play();
          playBtn.innerHTML = `<i class="fas fa-pause"></i>`;
        } else {
          audio.pause();
          playBtn.innerHTML = `<i class="fas fa-play"></i>`;
        }
      });

      audio.addEventListener("timeupdate", () => {
        const percent = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = percent + "%";
        const m = Math.floor(audio.currentTime / 60);
        const s = Math.floor(audio.currentTime % 60).toString().padStart(2, "0");
        timeEl.textContent = `${m}:${s}`;
      });

      audio.addEventListener("ended", () => {
        playBtn.innerHTML = `<i class="fas fa-play"></i>`;
        progressBar.style.width = "0%";
        timeEl.textContent = "0:00";
      });
    });
  }

  function addNotification(text){
    notificationsList.innerHTML = `<div class="notification-item">${text}</div>` + notificationsList.innerHTML;
  }

  /* ==== Переключение чатов ==== */
  function activateChatItem(roomId, chatName = "", chatDesc = "") {
    currentRoomId = roomId;
    document.querySelectorAll(".chat-item").forEach(c => c.classList.remove("active"));
    const chatEl = document.querySelector(`.chat-item[data-room="${roomId}"]`);
    if (chatEl) chatEl.classList.add("active");

    chatNameEl.textContent = chatName || chatEl.textContent;
    chatDescEl.textContent = chatDesc || "";
    messagesContainer.innerHTML = "";
    socket.emit("joinChat", roomId);
  }

  chatList.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    if (item) {
      activateChatItem(item.dataset.room, item.textContent, "");
    }
  });

  /* ==== Чаты ==== */
  socket.emit("joinChat", currentRoomId);
  socket.on("chatHistory", ({ roomId, history }) => {
    if (roomId !== currentRoomId) return;
    messagesContainer.innerHTML = "";
    history.forEach(m => addMessage(
        m.user,
        m.text,
        m.user === currentNick ? "outgoing" : "incoming",
        m.attachment,
        m.time,
        roomId
    ));
  });
  socket.on("message", (m) => {
    addMessage(m.user, m.text, m.user === currentNick ? "outgoing" : "incoming", m.attachment, m.time, m.roomId);
  });

  /* ==== Отправка ==== */
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit("message", {
      roomId: currentRoomId,
      user: currentNick,
      text,
      time: new Date().toISOString()
    });
    messageInput.value = "";
  }
  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });

  /* ==== Эмодзи ==== */
  const emojis = ["😀","😂","😍","😎","😭","👍","🔥","❤️","😡","🎉","🐱","🍕","⚡"];
  emojiButton.addEventListener("click", () => {
    emojiPanel.style.display = emojiPanel.style.display === "flex" ? "none" : "flex";
    emojiPanel.innerHTML = "";
    emojis.forEach(e => {
      const span = document.createElement("span");
      span.textContent = e;
      span.style.cursor = "pointer";
      span.style.fontSize = "20px";
      span.addEventListener("click", () => {
        messageInput.value += e;
        emojiPanel.style.display = "none";
      });
      emojiPanel.appendChild(span);
    });
  });

  /* ==== Файлы ==== */
  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    for (const file of fileInput.files) {
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit("message", {
          roomId: currentRoomId,
          user: currentNick,
          text: "",
          attachment: {
            type: file.type,
            dataUrl: reader.result,
            name: file.name
          },
          time: new Date().toISOString()
        });
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = "";
  });

  /* ==== Голосовые ==== */
  let mediaRecorder, audioChunks = [];
  micButton.addEventListener("mousedown", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          socket.emit("message", {
            roomId: currentRoomId,
            user: currentNick,
            text: "",
            attachment: { type: "audio", dataUrl: reader.result, name: "voice-message.webm" },
            time: new Date().toISOString()
          });
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      recordingIndicator.style.display = "inline";
    } catch (e) {
      alert("Нет доступа к микрофону");
    }
  });
  micButton.addEventListener("mouseup", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      recordingIndicator.style.display = "none";
    }
  });

  /* ==== Пользователи ==== */
  let onlineUsers = [];
  socket.on("presence:list", (list) => {
    onlineUsers = list;
    renderUsers(searchUser.value);
  });

  async function renderUsers(filter="") {
    try {
      const res = await fetch(`${API_URL}/users`);
      const users = await res.json();
      userList.innerHTML = "";
      users
          .filter(u => u.nickname.toLowerCase().includes(filter.toLowerCase()))
          .forEach(u => {
            const isOnline = onlineUsers.includes(u.username);
            const div = document.createElement("div");
            div.className = "user-list-item";
            div.innerHTML = `
            <div class="user-avatar-small">${u.username.charAt(0)}</div>
            <div class="user-info">
              <div class="user-name">${u.username}</div>
              <div class="user-title">${u.nickname}</div>
              <div class="user-status" style="color:${isOnline ? 'limegreen' : 'gray'};">
                ${isOnline ? "В сети" : "Не в сети"}
              </div>
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
    activateChatItem(currentRoomId, `Чат с ${username}`, nickname);
  }
});

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
  const typingIndicator = document.getElementById("typing-indicator");
  const messageInput = document.getElementById("message-input");
  const minimizeCallBtn = document.getElementById("minimize-call-btn");
  const expandCallBtn = document.getElementById("expand-call-btn");
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
  const meAvatar = document.getElementById("me-avatar");

  // звонки
  const callBtn = document.getElementById("call-button");
  const videoCallBtn = document.getElementById("video-call-button");
  const inCallUI = document.getElementById("in-call-ui");
  const callStatus = document.getElementById("call-status");
  const muteBtn = document.getElementById("mute-btn");
  const hangupBtn = document.getElementById("hangup-btn");

  // окно звонка
  const callWindow = document.getElementById("call-window");
  const callUserName = document.getElementById("call-user-name");
  const callStatusText = document.getElementById("call-status-text");
  const toggleVideoBtn = document.getElementById("toggle-video-btn");
  const cancelCallBtn = document.getElementById("cancel-call-btn");
  const acceptCallWindowBtn = document.getElementById("accept-call-window-btn");

  // видео
  const remoteVideo = document.getElementById("remote-video");
  const localVideo = document.getElementById("local-video");

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

  /* ==== WebRTC ==== */
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  let pc = null, localStream = null;
  let isMuted = false;
  let isVideoEnabled = true;

  async function startPeer(isOffer, withVideo=false) {
    pc = new RTCPeerConnection(rtcConfig);

    pc.ontrack = e => {
      if (e.streams[0].getVideoTracks().length > 0) {
        remoteVideo.srcObject = e.streams[0];
      } else {
        remoteAudio.srcObject = e.streams[0];
      }
    };

    pc.onicecandidate = e => {
      if (e.candidate && currentPeerUsername) {
        socket.emit("webrtc:ice", { toUsername: currentPeerUsername, candidate: e.candidate });
      }
    };

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo
    });

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    if (withVideo) {
      localVideo.srcObject = localStream;
    }

    if (isOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { toUsername: currentPeerUsername, sdp: offer });
    }
  }

  /* ==== Звонки ==== */
  callBtn.addEventListener("click", () => {
    if (!currentPeerUsername) return alert("Выберите пользователя для звонка");
    inCallUI.style.display = "block";
    callStatus.textContent = `Звоним ${currentPeerUsername}…`;
    socket.emit("call:invite", { toUsername: currentPeerUsername, fromUsername: currentUser, fromNickname: currentNick, video: false });
  });

  videoCallBtn.addEventListener("click", () => {
    if (!currentPeerUsername) return alert("Выберите пользователя для видеозвонка");
    inCallUI.style.display = "block";
    callStatus.textContent = `Видеозвонок ${currentPeerUsername}…`;
    socket.emit("call:invite", { toUsername: currentPeerUsername, fromUsername: currentUser, fromNickname: currentNick, video: true });
  });

  socket.on("call:incoming", ({ fromUsername, video }) => {
    currentPeerUsername = fromUsername;
    callWindow.style.display = "block";
    callWindow.querySelector(".modal-content").classList.add("pulsing");
    callUserName.textContent = fromUsername;
    callStatusText.textContent = video ? "Входящий видеозвонок" : "Входящий звонок";

    callNotificationText.textContent = `Звонок от ${fromUsername}`;
    callNotification.classList.add("show");
    ringtone.play().catch(()=>{});
  });

  acceptCallWindowBtn.addEventListener("click", async () => {
    acceptCallWindowBtn.classList.add("accepted"); // ✅ подсветка и анимация
    callWindow.querySelector(".modal-content").classList.remove("pulsing");
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;
    inCallUI.style.display = "block";
    socket.emit("call:accept", { toUsername: currentPeerUsername });
    await startPeer(false, true);
  });


  cancelCallBtn.addEventListener("click", () => {
    callWindow.style.display = "none";
    callWindow.querySelector(".modal-content").classList.remove("pulsing");
    socket.emit("call:reject", { toUsername: currentPeerUsername });
    callNotification.classList.remove("show");
    ringtone.pause(); ringtone.currentTime = 0;
    currentPeerUsername = null;
  });

  socket.on("call:accepted", async () => {
    callStatus.textContent = "Соединение установлено";
    inCallUI.style.display = "block";
    await startPeer(true, true);
  });

  socket.on("webrtc:offer", async ({ sdp }) => {
    if (!pc) await startPeer(false, true);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc:answer", { toUsername: currentPeerUsername, sdp: answer });
  });
  socket.on("webrtc:answer", async ({ sdp }) => {
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  });
  socket.on("webrtc:ice", async ({ candidate }) => {
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  });

  hangupBtn.addEventListener("click", () => {
    socket.emit("call:hangup", { toUsername: currentPeerUsername });
    if (pc) pc.close();
    inCallUI.style.display = "none";
    callWindow.style.display = "none";
    callWindow.querySelector(".modal-content").classList.remove("pulsing");
    currentPeerUsername = null;
  });

  socket.on("call:hangup", () => {
    if (pc) pc.close();
    inCallUI.style.display = "none";
    callWindow.style.display = "none";
    callWindow.querySelector(".modal-content").classList.remove("pulsing");
    currentPeerUsername = null;
  });

  socket.on("call:rejected", () => {
    callWindow.style.display = "none";
    inCallUI.style.display = "none";
    currentPeerUsername = null;
  });

  // Свернуть звонок
  minimizeCallBtn.addEventListener("click", () => {
    callWindow.style.display = "none";
    inCallUI.style.display = "block";
  });

  // Развернуть звонок
  expandCallBtn.addEventListener("click", () => {
    callWindow.style.display = "block";
    inCallUI.style.display = "none";
  });


  /* ==== Управление микрофоном и камерой ==== */
  muteBtn.addEventListener("click", () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    muteBtn.textContent = isMuted ? "Unmute" : "Mute";
  });

  toggleVideoBtn.addEventListener("click", () => {
    if (!localStream) return;
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
    toggleVideoBtn.innerHTML = isVideoEnabled ? `<i class="fas fa-video"></i>` : `<i class="fas fa-video-slash"></i>`;
  });

  /* ==== Профиль ==== */
  document.getElementById("edit-profile-btn").addEventListener("click", () => {
    document.getElementById("profile-modal").style.display = "block";
  });
  document.getElementById("save-profile").addEventListener("click", async () => {
    const newName = document.getElementById("new-username").value.trim();
    const newNick = document.getElementById("new-nickname").value.trim();
    const oldPassword = document.getElementById("profile-old-password").value.trim();
    const newPassword = document.getElementById("profile-new-password").value.trim();
    const avatarFile = document.getElementById("profile-avatar").files[0];
    let avatar = null;

    if (avatarFile) {
      const formData = new FormData();
      formData.append("avatar", avatarFile);
      const res = await fetch(`${API_URL}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      avatar = data.url;
    }

    const res = await fetch(`${API_URL}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, newName, newNick, oldPassword, newPassword, avatar })
    });
    const data = await res.json();
    if (res.ok) {
      alert("Профиль обновлен!");
      localStorage.setItem("username", data.user.username);
      localStorage.setItem("nickname", data.user.nickname);
      if (data.user.avatar) localStorage.setItem("avatar", data.user.avatar);
      location.reload();
    } else {
      alert(data.error);
    }
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

  /* ==== Выход из аккаунта ==== */
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      socket.emit("presence:offline", { username: currentUser });
      localStorage.clear();
      socket.disconnect();
      location.href = "login.html";
    });
  }
});
