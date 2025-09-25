document.addEventListener("DOMContentLoaded", () => {
    const socket = window.electronAPI.createSocket();

    socket.on("connect", () => {
        console.log("Socket подключен с id:", socket.id);
        initApp(socket);
    });

    socket.on("connect_error", (err) => {
        console.error("Ошибка подключения Socket.io:", err);
        alert("Не удалось подключиться к серверу");
    });
});

function initApp(socket) {
    const currentUser = localStorage.getItem("username");
    const currentNick = localStorage.getItem("nickname");
    const currentAvatar = localStorage.getItem("avatar");

    if (!currentUser) {
        alert("Сначала войдите!");
        window.electronAPI.redirectToLogin();
        return;
    }

        // --- Профиль пользователя ---
        document.getElementById("user-name").textContent = `${currentUser} (${currentNick})`;
        const meAvatar = document.getElementById("me-avatar");
        if (currentAvatar) {
            meAvatar.style.backgroundImage = `url(http://193.233.86.5:3000${currentAvatar})`;
            meAvatar.style.backgroundSize = "cover";
            meAvatar.textContent = "";
        }

        // --- Онлайн статус ---
        socket.emit("presence:online", { username: currentUser, nickname: currentNick });

        // --- Инициализация систем ---
        const callSystem = initCallSystem(socket, currentUser, currentNick);
        const chatSystem = initChatSystem(socket, currentUser, currentNick);
        initUserSystem(socket, currentUser, currentNick, chatSystem);

        // --- Переключение вкладок ---
        const buttons = document.querySelectorAll(".hex-button");
        const tabs = document.querySelectorAll(".tab-content");

        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.tab;

                buttons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                tabs.forEach(c => c.style.display = "none");

                if (tab === "settings") {
                    document.getElementById("settings-modal").style.display = "block";
                    return;
                }

                const activeTab = document.getElementById(`${tab}-tab`);
                if (activeTab) activeTab.style.display = "block";

                // Авто-загрузка пользователей при открытии вкладки
                if (tab === "users") {
                    const searchInput = document.getElementById("search-user");
                    if (searchInput) {
                        initUserSystem(socket, currentUser, currentNick, chatSystem);
                    }
                }
            });
        });

        // --- Закрытие модалок ---
        document.querySelectorAll(".modal .close").forEach(c => {
            c.addEventListener("click", () => {
                c.closest(".modal").style.display = "none";
            });
        });

        // --- Настройки темы ---
        const themeSelect = document.getElementById("theme-select");
        if (themeSelect) {
            themeSelect.addEventListener("change", () => {
                document.body.className = themeSelect.value;
                localStorage.setItem("theme", themeSelect.value);
            });
            const savedTheme = localStorage.getItem("theme") || "dark";
            themeSelect.value = savedTheme;
            document.body.className = savedTheme;
        }

        // --- Выход ---
        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => {
                localStorage.clear();
                socket.disconnect();
                window.electronAPI.logout();
            });
        }

        // --- Редактирование профиля ---
        const editProfileBtn = document.getElementById("edit-profile-btn");
        if (editProfileBtn) {
            editProfileBtn.addEventListener("click", () => {
                document.getElementById("profile-modal").style.display = "block";
            });
        }

        // --- Дополнительно: авто-загрузка пользователей при старте ---
        initUserSystem(socket, currentUser, currentNick, chatSystem);

};
