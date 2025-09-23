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

    // запись
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingStartTime = 0;
    let recordingTimer = null;
    let chosenMime = ""; // выбранный MIME для MediaRecorder
    let isRecording = false;

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

    function saveFavorites() {
        localStorage.setItem("favorites", JSON.stringify(favorites));
    }

    // ---- favorites ----
    function toggleFavorite(msgId, user, text, attachment, roomId) {
        const exists = favorites.find(f => f.id === msgId);
        if (exists) {
            favorites = favorites.filter(f => f.id !== msgId);
        } else {
            favorites.push({ id: msgId, user, text, attachment, roomId, time: new Date().toISOString() });
        }
        saveFavorites();
        renderFavorites();

        const favBtn = document.querySelector(`.message[data-msg-id="${msgId}"] .fav-btn`);
        if (favBtn) {
            favBtn.innerHTML = exists ? '<i class="fas fa-star"></i>' : '<i class="fas fa-star" style="color: gold;"></i>';
            favBtn.title = exists ? "В избранное" : "Убрать из избранного";
        }
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
            let content = f.text;
            if (!content && f.attachment) {
                if (f.attachment.type?.startsWith("image/")) content = "[изображение]";
                else if (f.attachment.type?.startsWith("audio")) content = "[голосовое сообщение]";
                else content = "[файл]";
            }
            div.innerHTML = `<b>${f.user}</b>: ${content || "[сообщение]"}`;

            div.addEventListener("click", () => {
                if (f.roomId !== currentRoomId) activateChatItem(f.roomId);
                setTimeout(() => {
                    const msg = document.querySelector(`.message[data-msg-id="${f.id}"]`);
                    if (msg) {
                        msg.classList.add("highlight");
                        msg.scrollIntoView({ behavior: "smooth", block: "center" });
                        setTimeout(() => msg.classList.remove("highlight"), 2000);
                    }
                }, 400);
            });

            div.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                const targetRoom = prompt("Введите ID чата для пересылки:");
                if (!targetRoom) return;
                socket.emit("message", {
                    roomId: targetRoom,
                    user: currentNick,
                    text: f.text,
                    attachment: f.attachment,
                    time: new Date().toISOString()
                });
                alert("Сообщение переслано!");
            });

            list.appendChild(div);
        });
    }
    renderFavorites();

    // ---- attachments render helpers ----
    function dataURLToBlob(dataUrl) {
        const [header, b64] = dataUrl.split(",");
        const mimeMatch = /data:([^;]+);base64/.exec(header);
        const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const bin = atob(b64);
        const len = bin.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    function renderAttachment(attachment) {
        if (!attachment) return "";
        if (attachment.type?.startsWith("image/")) {
            return `<div class="media-attachment"><img src="${attachment.dataUrl}" alt="${attachment.name || "image"}"></div>`;
        }
        if (attachment.type?.startsWith("audio")) {
            const duration = attachment.duration || 0;
            const mins = Math.floor(duration / 60);
            const secs = Math.floor(duration % 60).toString().padStart(2, "0");
            const totalTime = `${mins}:${secs}`;

            return `
        <div class="voice-message" data-duration="${duration}">
          <button class="play-btn"><i class="fas fa-play"></i></button>
          <div class="progress-container"><div class="progress-bar"></div></div>
          <span class="time">0:00 / ${totalTime}</span>
          <audio src="${attachment.dataUrl}" preload="metadata" style="display:none"></audio>
          <a class="voice-download" href="${attachment.dataUrl}" download="${attachment.name || "voice"}" style="display:none">Скачать</a>
        </div>
      `;
        }
        return `<a href="${attachment.dataUrl}" download>${attachment.name || "file"}</a>`;
    }

    // ---- add message ----
    function addMessage(user, text, type, attachment = null, time = null, roomId = currentRoomId, msgId = null) {
        const msg = document.createElement("div");
        msg.className = `message ${type}`;
        const messageId = msgId || Date.now() + "-" + Math.random().toString(36).slice(2, 7);
        msg.dataset.msgId = messageId;

        const isFavorite = favorites.some(f => f.id === messageId);
        const starIcon = isFavorite ? '<i class="fas fa-star" style="color: gold;"></i>' : '<i class="fas fa-star"></i>';
        const starTitle = isFavorite ? "Убрать из избранного" : "В избранное";

        msg.innerHTML = `
      <div class="message-avatar">${user?.charAt(0) || "?"}</div>
      <div class="message-content">
        <div class="message-sender"><b>${user || "unknown"}</b></div>
        ${text ? `<div class="message-text">${text}</div>` : ""}
        ${attachment ? renderAttachment(attachment) : ""}
        <span class="message-time">${time ? formatTime(time) : formatTime(new Date())}</span>
      </div>
      <button class="fav-btn" title="${starTitle}">${starIcon}</button>
    `;

        msg.querySelector(".fav-btn").addEventListener("click", () =>
            toggleFavorite(messageId, user, text, attachment, roomId)
        );

        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // оживляем аудиоплеер
        msg.querySelectorAll(".voice-message").forEach(vm => {
            const audio = vm.querySelector("audio");
            const playBtn = vm.querySelector(".play-btn");
            const progressBar = vm.querySelector(".progress-bar");
            const timeEl = vm.querySelector(".time");
            const downloadLink = vm.querySelector(".voice-download");
            const duration = parseFloat(vm.getAttribute("data-duration")) || 0;

            const totalRight = timeEl.textContent.split(" / ")[1];

            audio.addEventListener("loadedmetadata", () => {
                if (audio.duration && audio.duration !== Infinity) {
                    const mins = Math.floor(audio.duration / 60);
                    const secs = Math.floor(audio.duration % 60).toString().padStart(2, "0");
                    timeEl.textContent = `0:00 / ${mins}:${secs}`;
                }
            });

            function playSafe() {
                // останавливаем другие
                if (currentlyPlayingAudio && currentlyPlayingAudio !== audio) {
                    currentlyPlayingAudio.pause();
                    const prevBtn = document.querySelector('.voice-message audio[src="' + currentlyPlayingAudio.src + '"]')
                        ?.closest(".voice-message")?.querySelector(".play-btn");
                    if (prevBtn) prevBtn.innerHTML = '<i class="fas fa-play"></i>';
                }

                audio.play().then(() => {
                    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                    currentlyPlayingAudio = audio;
                }).catch(err => {
                    console.warn("play() fail:", err);
                    // мягкий фолбэк — позволяем скачать
                    downloadLink.style.display = "inline-block";
                    alert("Не удалось воспроизвести аудио. Вы можете скачать файл и открыть его в плеере.");
                });
            }

            playBtn.addEventListener("click", () => {
                if (audio.paused) playSafe();
                else {
                    audio.pause();
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    currentlyPlayingAudio = null;
                }
            });

            audio.addEventListener("timeupdate", () => {
                if (audio.duration && audio.duration !== Infinity) {
                    const progress = (audio.currentTime / audio.duration) * 100;
                    progressBar.style.width = progress + "%";
                    const mins = Math.floor(audio.currentTime / 60);
                    const secs = Math.floor(audio.currentTime % 60).toString().padStart(2, "0");
                    timeEl.textContent = `${mins}:${secs} / ${totalRight}`;
                }
            });

            audio.addEventListener("ended", () => {
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                progressBar.style.width = "0%";
                timeEl.textContent = `0:00 / ${totalRight}`;
                currentlyPlayingAudio = null;
                // можно вернуть в начало
                audio.currentTime = 0;
            });
        });
    }

    // ---- switch chat ----
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

        if (currentlyPlayingAudio) {
            currentlyPlayingAudio.pause();
            currentlyPlayingAudio = null;
        }
    }

    chatList.addEventListener("click", (e) => {
        const item = e.target.closest(".chat-item");
        if (item) activateChatItem(item.dataset.room, item.textContent, "");
    });

    // ---- history + new messages ----
    socket.emit("joinChat", currentRoomId);

    socket.on("chatHistory", ({ roomId, history }) => {
        if (roomId !== currentRoomId) return;
        messagesContainer.innerHTML = "";
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

    // ---- text send ----
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

    // ---- files ----
    attachButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        for (const file of fileInput.files) {
            const reader = new FileReader();
            reader.onload = () => {
                socket.emit("message", {
                    roomId: currentRoomId,
                    user: currentNick,
                    text: "",
                    attachment: { type: file.type, dataUrl: reader.result, name: file.name },
                    time: new Date().toISOString()
                });
            };
            reader.readAsDataURL(file);
        }
        fileInput.value = "";
    });

    // ---- voice recording ----
    function updateRecordingTime() {
        if (recordingIndicator.style.display === "inline") {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            recordingIndicator.textContent = `Запись: ${mins}:${secs.toString().padStart(2, "0")}`;
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            isRecording = false;
            clearInterval(recordingTimer);
        }
    }

    function pickSupportedMime() {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
            if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
            if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus";
            if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
        }
        return ""; // пусть браузер сам решит
    }

    micButton.addEventListener("mousedown", async () => {
        if (isRecording) {
            stopRecording();
            return;
        }

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Ваш браузер не поддерживает запись аудио (getUserMedia недоступен).");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 44100,
                    sampleSize: 16
                }
            });

            chosenMime = pickSupportedMime();
            mediaRecorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);

            audioChunks = [];
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                clearInterval(recordingTimer);
                recordingIndicator.style.display = "none";
                if (audioChunks.length === 0) return;

                const blob = new Blob(audioChunks, { type: chosenMime || "audio/webm" });

                // длительность (через WebAudio)
                let duration = 0;
                try {
                    const audioContext = new AudioContext();
                    const buf = await blob.arrayBuffer();
                    const decoded = await audioContext.decodeAudioData(buf);
                    duration = decoded.duration || 0;
                    audioContext.close();
                } catch (e) {
                    console.warn("decodeAudioData failed:", e);
                    // Если не удалось получить длительность через WebAudio, используем время записи
                    duration = Math.floor((Date.now() - recordingStartTime) / 1000);
                }

                // сохраняем как dataURL
                const reader = new FileReader();
                reader.onload = () => {
                    const genericType = (chosenMime || "audio/webm").split(";")[0];
                    socket.emit("message", {
                        roomId: currentRoomId,
                        user: currentNick,
                        text: "",
                        attachment: {
                            type: genericType,
                            dataUrl: reader.result,
                            name: "voice-message.webm",
                            duration
                        },
                        time: new Date().toISOString()
                    });
                };
                reader.readAsDataURL(blob);

                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorder.onerror = (e) => {
                console.error("MediaRecorder error:", e);
                clearInterval(recordingTimer);
                recordingIndicator.style.display = "none";
                isRecording = false;
                alert("Ошибка записи аудио.");
            };

            mediaRecorder.start(100);
            isRecording = true;
            recordingStartTime = Date.now();
            recordingIndicator.style.display = "inline";
            recordingIndicator.textContent = "Запись: 0:00";
            recordingTimer = setInterval(updateRecordingTime, 1000);

        } catch (err) {
            console.error("Ошибка работы с микрофоном:", err);
            if (err.name === "NotAllowedError") alert("Доступ к микрофону запрещён.");
            else if (err.name === "NotFoundError") alert("Микрофон не найден.");
            else if (err.name === "NotReadableError") alert("Микрофон уже используется другим приложением.");
            else alert("Ошибка: " + err.message);
        }
    });

    micButton.addEventListener("mouseup", stopRecording);
    document.addEventListener("mouseup", (e) => {
        if (e.button === 0 && isRecording) stopRecording();
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

    // экспорт
    return { pvRoomId, activateChatItem };
}