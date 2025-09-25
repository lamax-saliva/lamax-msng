function initChatSystem(socket, currentUser, currentNick) {
    // -------- DOM refs --------
    const messagesContainer = document.getElementById("messages-container");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");
    const emojiButton = document.getElementById("emoji-button");
    const attachButton = document.getElementById("attach-button");
    const micButton = document.getElementById("mic-button");
    const fileInput = document.getElementById("file-input");
    const emojiPanel = document.getElementById("emoji-panel");
    const recordingIndicator = document.getElementById("recording-indicator");
    const chatList = document.getElementById("chat-list");
    const chatNameEl = document.getElementById("current-chat-name");
    const chatDescEl = document.getElementById("current-chat-desc");
    const createChatBtn = document.getElementById("create-chat-btn");

    // -------- state --------
    let currentRoomId = "room:public";
    let unreadCounts = {};
    let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
    let currentlyPlayingAudio = null;

    // -------- utils --------
    const pvRoomId = (a, b) => "pv:" + [a, b].sort().join("|");

    function formatTime(iso) {
        const d = new Date(iso);
        return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
    }

    function updateUnreadBadge(roomId) {
        const chatEl = document.querySelector(`.chat-item[data-room="${roomId}"]`);
        if (!chatEl) return;
        const oldBadge = chatEl.querySelector(".unread-count");
        if (oldBadge) oldBadge.remove();
        const count = unreadCounts[roomId] || 0;
        if (count > 0) {
            const badge = document.createElement("span");
            badge.className = "unread-count";
            badge.textContent = count;
            chatEl.appendChild(badge);
        }
    }

    // ---- favorites ----
    function toggleFavorite(msgId, user, text, attachment, roomId) {
        const exists = favorites.find(f => f.id === msgId);
        if (exists) {
            favorites = favorites.filter(f => f.id !== msgId);
        } else {
            favorites.push({ id: msgId, user, text, attachment, roomId, time: new Date().toISOString() });
        }
        localStorage.setItem("favorites", JSON.stringify(favorites));
        renderFavorites();
    }

    function renderFavorites() {
        const list = document.getElementById("favorites-list");
        list.innerHTML = "";
        if (favorites.length === 0) {
            list.innerHTML = "<p>Пока пусто</p>";
            return;
        }
        favorites.forEach(f => {
            const div = document.createElement("div");
            div.className = "favorite-item";
            let content = f.text || (f.attachment ? "[файл]" : "[сообщение]");
            div.innerHTML = `<b>${f.user}</b>: ${content}`;
            div.addEventListener("click", () => {
                if (f.roomId !== currentRoomId) activateChatItem(f.roomId);
            });
            list.appendChild(div);
        });
    }
    renderFavorites();

    // ---- render messages ----
    function renderAttachment(attachment) {
        if (!attachment) return "";
        if (attachment.type.startsWith("image/")) {
            return `<div class="media-attachment"><img src="${attachment.dataUrl}" alt="${attachment.name || "image"}"></div>`;
        }
        if (attachment.type.startsWith("audio")) {
            const duration = attachment.duration || 0;
            const mins = Math.floor(duration / 60);
            const secs = Math.floor(duration % 60).toString().padStart(2, "0");
            return `
                <div class="voice-message" data-duration="${duration}">
                  <button class="play-btn"><i class="fas fa-play"></i></button>
                  <div class="progress-container"><div class="progress-bar"></div></div>
                  <span class="time">0:00 / ${mins}:${secs}</span>
                  <audio src="${attachment.dataUrl}" preload="metadata" style="display:none"></audio>
                </div>
            `;
        }
        return `<a href="${attachment.dataUrl}" download>${attachment.name || "file"}</a>`;
    }

    function addMessage(user, text, type, attachment = null, time = null, roomId = currentRoomId, msgId = null) {
        const msg = document.createElement("div");
        msg.className = `message ${type}`;
        const messageId = msgId || Date.now() + "-" + Math.random().toString(36).slice(2, 7);
        msg.dataset.msgId = messageId;

        const isFavorite = favorites.some(f => f.id === messageId);
        const starIcon = isFavorite ? '<i class="fas fa-star" style="color: gold;"></i>' : '<i class="fas fa-star"></i>';
        msg.innerHTML = `
          <div class="message-avatar">${user?.charAt(0) || "?"}</div>
          <div class="message-content">
            <div class="message-sender"><b>${user || "unknown"}</b></div>
            ${text ? `<div class="message-text">${text}</div>` : ""}
            ${attachment ? renderAttachment(attachment) : ""}
            <span class="message-time">${time ? formatTime(time) : formatTime(new Date())}</span>
          </div>
          <button class="fav-btn">${starIcon}</button>
        `;

        msg.querySelector(".fav-btn").addEventListener("click", () =>
            toggleFavorite(messageId, user, text, attachment, roomId)
        );

        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ---- chat switch ----
    function activateChatItem(roomId, chatName = "", chatDesc = "") {
        currentRoomId = roomId;
        document.querySelectorAll(".chat-item").forEach(c => c.classList.remove("active"));
        const chatEl = document.querySelector(`.chat-item[data-room="${roomId}"]`);
        if (chatEl) chatEl.classList.add("active");

        chatNameEl.textContent = chatName || (chatEl ? chatEl.textContent : "");
        chatDescEl.textContent = chatDesc || "";
        messagesContainer.innerHTML = "";
        socket.emit("joinChat", roomId);

        unreadCounts[roomId] = 0;
        updateUnreadBadge(roomId);
    }

    chatList.addEventListener("click", (e) => {
        const item = e.target.closest(".chat-item");
        if (item) activateChatItem(item.dataset.room, item.textContent, "");
    });

    // ---- socket events ----
    socket.emit("joinChat", currentRoomId);

    socket.on("chatHistory", ({ roomId, history }) => {
        if (roomId !== currentRoomId) return;
        history.forEach(m =>
            addMessage(m.user, m.text, m.user === currentNick ? "outgoing" : "incoming", m.attachment, m.time, roomId, m.id)
        );
    });

    socket.on("message", (m) => {
        addMessage(m.user, m.text, m.user === currentNick ? "outgoing" : "incoming", m.attachment, m.time, m.roomId, m.id);
        if (m.roomId !== currentRoomId) {
            unreadCounts[m.roomId] = (unreadCounts[m.roomId] || 0) + 1;
            updateUnreadBadge(m.roomId);
        }
    });

    // ---- send text ----
    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text) return;
        const msg = { roomId: currentRoomId, user: currentNick, text, time: new Date().toISOString() };
        socket.emit("message", msg);
        addMessage(msg.user, msg.text, "outgoing", null, msg.time, currentRoomId);
        messageInput.value = "";
    }
    sendButton.addEventListener("click", sendMessage);
    messageInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

    // ---- emoji ----
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

    // ---- file send ----
    attachButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        for (const file of fileInput.files) {
            const reader = new FileReader();
            reader.onload = () => {
                const msg = {
                    roomId: currentRoomId,
                    user: currentNick,
                    text: "",
                    attachment: { type: file.type, dataUrl: reader.result, name: file.name },
                    time: new Date().toISOString()
                };
                socket.emit("message", msg);
                addMessage(msg.user, msg.text, "outgoing", msg.attachment, msg.time, currentRoomId);
            };
            reader.readAsDataURL(file);
        }
        fileInput.value = "";
    });

    // ---- group chat create ----
    if (createChatBtn) {
        createChatBtn.addEventListener("click", () => {
            const participants = prompt("Введите логины участников через запятую:");
            if (!participants) return;
            const users = participants.split(",").map(u => u.trim()).filter(Boolean);
            if (users.length === 0) return;

            const roomId = "group:" + Date.now();
            const div = document.createElement("div");
            div.className = "chat-item";
            div.dataset.room = roomId;
            div.textContent = `👥 Группа: ${users.join(", ")}`;
            chatList.appendChild(div);

            socket.emit("joinChat", roomId);
            socket.emit("message", {
                roomId,
                user: currentNick,
                text: `Создан групповой чат с: ${users.join(", ")}`,
                time: new Date().toISOString()
            });

            activateChatItem(roomId, "Групповой чат", `Участники: ${users.join(", ")}`);
        });
    }

    return { pvRoomId, activateChatItem };
}
