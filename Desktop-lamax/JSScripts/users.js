function initUserSystem(socket, currentUser, currentNick, callSystem, chatSystem) {
    const userList = document.getElementById("user-list");
    const searchUser = document.getElementById("search-user");
    const chatList = document.getElementById("chat-list");

    let onlineUsers = [];

    socket.on("presence:list", (list) => {
        onlineUsers = list;
        renderUsers(searchUser.value);
    });

    async function renderUsers(filter="") {
        try {
            const res = await fetch("http://193.233.86.5:3000/api/users");
            const users = await res.json();
            userList.innerHTML = "";

            users.forEach(u => {
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
                if (filter && !u.nickname.toLowerCase().includes(filter.toLowerCase())) {
                    div.style.display = "none";
                }
                userList.appendChild(div);
            });
        } catch (e) { console.error(e); }
    }

    function openPrivateChat(username, nickname) {
        callSystem.setPeer(username);
        const roomId = chatSystem.pvRoomId(currentUser, username);
        if (!document.querySelector(`.chat-item[data-room="${roomId}"]`)) {
            const div = document.createElement("div");
            div.className = "chat-item";
            div.dataset.room = roomId;
            div.textContent = `💬 Чат с ${nickname}`;
            chatList.appendChild(div);
        }
        chatSystem.activateChatItem(roomId, `Чат с ${nickname}`, `Логин: ${username}`);
    }

    renderUsers();
    searchUser.addEventListener("input", () => renderUsers(searchUser.value));
}
