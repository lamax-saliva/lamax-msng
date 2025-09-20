document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://193.233.86.5:3000/api";
  const SOCKET_URL = "http://193.233.86.5:3000";
  const socket = io(SOCKET_URL);

  console.log("✅ main.js загружен");

  let currentUser = localStorage.getItem("username");
  let currentNick = localStorage.getItem("nickname");
  let currentAvatar = localStorage.getItem("avatar");

  if (!currentUser) {
    alert("Сначала войдите!");
    location.href = "login.html";
    return;
  }

  // профиль
  document.getElementById("user-name").textContent = `${currentUser} (${currentNick})`;
  const meAvatar = document.getElementById("me-avatar");
  if (currentAvatar) {
    meAvatar.style.backgroundImage = `url(${SOCKET_URL}${currentAvatar})`;
    meAvatar.style.backgroundSize = "cover";
    meAvatar.textContent = "";
  }

  // онлайн статус
  socket.emit("presence:online", { username: currentUser, nickname: currentNick });

  // подключение модулей
  const callSystem = initCallSystem(socket, currentUser, currentNick);
  const chatSystem = initChatSystem(socket, currentUser, currentNick);
  initUserSystem(socket, currentUser, currentNick, callSystem, chatSystem);

  /* --- Переключение вкладок --- */
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
    });
  });

  /* --- Закрытие модалок --- */
  document.querySelectorAll(".modal .close").forEach(c => {
    c.addEventListener("click", () => {
      c.closest(".modal").style.display = "none";
    });
  });

  /* --- Настройки --- */
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

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
      socket.disconnect();
      location.href = "login.html";
    });
  }

  const editProfileBtn = document.getElementById("edit-profile-btn");
  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", () => {
      document.getElementById("profile-modal").style.display = "block";
    });
  }
});
