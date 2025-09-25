function initUserSystem(socket, currentUser, currentNick, chatSystem) {
    const API_URL = "http://193.233.86.5:4000/api";
    const userList = document.getElementById("user-list");
    const searchUser = document.getElementById("search-user");

    async function fetchUsers(filter = "") {
        try {
            console.log("Загрузка пользователей с сервера...");
            const res = await fetch(`${API_URL}/users`);
            const users = await res.json();
            console.log("Получено пользователей:", users);

            userList.innerHTML = "";

            users.forEach(u => {
                if (filter && !u.nickname.toLowerCase().includes(filter.toLowerCase())) return;

                const div = document.createElement("div");
                div.className = "user-list-item";
                div.textContent = `${u.username} (${u.nickname})`;

                div.addEventListener("click", () => {
                    // Приватный чат
                    const roomId = chatSystem.pvRoomId(currentNick, u.username);

                    if (!document.querySelector(`.chat-item[data-room="${roomId}"]`)) {
                        const chatEl = document.createElement("div");
                        chatEl.className = "chat-item";
                        chatEl.dataset.room = roomId;
                        chatEl.textContent = `💬 ${u.nickname}`;
                        document.getElementById("chat-list").appendChild(chatEl);
                    }

                    chatSystem.activateChatItem(roomId, u.nickname, `Приватный чат с ${u.nickname}`);
                });

                userList.appendChild(div);
            });

            if (userList.children.length === 0) {
                userList.innerHTML = "<p>Пользователи не найдены</p>";
            }

        } catch (err) {
            console.error("Ошибка загрузки пользователей:", err);
            userList.innerHTML = "<p>Ошибка загрузки пользователей</p>";
        }
    }

    // Поиск пользователей
    if (searchUser) {
        searchUser.addEventListener("input", () => fetchUsers(searchUser.value));
    }

    // Авто-загрузка при открытии вкладки "users"
    const usersTabButton = document.querySelector('[data-tab="users"]');
    if (usersTabButton) {
        usersTabButton.addEventListener("click", () => {
            fetchUsers(searchUser?.value || "");
        });
    }

    // Первоначальная загрузка сразу
    fetchUsers();
}
