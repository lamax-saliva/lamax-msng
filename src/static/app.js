// Класс Messenger - основной класс мессенджера
class Messenger {
    constructor() {
        this.socket = null;
        this.user = null;
        this.session = null;
        this.currentChannel = 'general';
        this.users = new Map();
        this.messageHistoryLoaded = false;
        this.historyOffset = 0;
        this.HISTORY_CHUNK_SIZE = 100;
        this.voiceChat = null;
        this.voiceChatActive = false;
        this.initialize();
    }

    async initialize() {
        await this.checkAuth();
        this.connectSocket();
        this.setupEventListeners();
    }

    async checkAuth() {
        const sessionData = localStorage.getItem('lamax_session');
        if (!sessionData) {
            window.location.href = '/';
            return;
        }

        try {
            this.session = JSON.parse(sessionData);

            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.session.sessionId })
            });

            const data = await response.json();

            if (!data.valid) {
                localStorage.removeItem('lamax_session');
                window.location.href = '/';
                return;
            }

            this.user = data.user;
            this.updateUserUI();

            // Скрываем экран загрузки
            setTimeout(() => {
                document.getElementById('loadingScreen').classList.add('hidden');
                document.getElementById('appContainer').classList.add('loaded');
            }, 500);

        } catch (error) {
            localStorage.removeItem('lamax_session');
            window.location.href = '/';
        }
    }

    updateUserUI() {
        if (this.user && this.user.avatar) {
            document.getElementById('userAvatar').src = this.user.avatar;
        }
    }

    connectSocket() {
        if (!this.session) return;

        this.socket = io({
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            query: {
                sessionId: this.session.sessionId
            }
        });

        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу');
            this.showNotification('Подключено к серверу');
            this.registerUser();
        });

        this.socket.on('authenticated', (data) => {
            console.log('✅ Аутентификация прошла успешно');
            this.addSystemMessage('Вы подключены к серверу');
            this.showNotification('Аутентификация успешна');
        });

        this.socket.on('auth-error', (data) => {
            console.error('❌ Ошибка аутентификации:', data.message);
            localStorage.removeItem('lamax_session');
            window.location.href = '/';
        });

        this.socket.on('new-message', (message) => {
            this.addMessage(message);
        });

        this.socket.on('user-joined', (data) => {
            this.addSystemMessage(data.username + ' присоединился к чату');
            this.showNotification(data.username + ' присоединился');
            this.addUser(data.user);
        });

        this.socket.on('user-left', (data) => {
            this.addSystemMessage(data.username + ' покинул чат');
            this.showNotification(data.username + ' покинул чат');
            this.removeUser(data.userId);
        });

        this.socket.on('users-list', (users) => {
            this.updateUsersList(users);
        });

        this.socket.on('room-joined', (data) => {
            this.loadInitialMessages(data.messages);
        });

        this.socket.on('online-stats', (data) => {
            document.getElementById('usersCount').textContent = data.online + 1;
        });

        this.socket.on('message-history', (data) => {
            this.loadMessageHistory(data);
        });

        this.socket.on('typing', (data) => {
            this.showTypingIndicator(data.username);
        });

        this.socket.on('voice-user-joined', (data) => {
            this.addSystemMessage(`🎤 ${data.username} присоединился к голосовому чату`);
        });

        this.socket.on('voice-user-left', (data) => {
            this.addSystemMessage(`🎤 ${data.username} покинул голосовой чат`);
        });
    }

    registerUser() {
        if (this.socket.connected && this.user) {
            this.socket.emit('authenticate', {
                sessionId: this.session.sessionId
            });
            this.socket.emit('join-room', this.currentChannel);
        }
    }

    setupEventListeners() {
        // Меню пользователя
        document.getElementById('userMenuBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('userDropdown').classList.toggle('show');
        });

        document.getElementById('profileBtn').addEventListener('click', () => {
            this.showProfile();
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Закрытие меню при клике вне его
        document.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.remove('show');
        });

        // Смена канала
        document.querySelectorAll('.channel').forEach(channel => {
            channel.addEventListener('click', () => {
                document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
                channel.classList.add('active');

                const channelName = channel.dataset.channel;
                this.switchChannel(channelName);
            });
        });

        // Отправка сообщения
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');

        const sendMessage = () => {
            const text = messageInput.value.trim();
            if (text && this.socket) {
                this.socket.emit('send-message', {
                    roomId: this.currentChannel,
                    content: text,
                    type: 'text'
                });
                messageInput.value = '';
                messageInput.style.height = 'auto';
            }
        };

        sendBtn.addEventListener('click', sendMessage);

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';

            // Отправка статуса набора текста
            if (this.value.trim() && window.messenger && window.messenger.socket) {
                window.messenger.socket.emit('typing', {
                    roomId: window.messenger.currentChannel
                });
            }
        });

        // Тест микрофона
        document.getElementById('testMicBtn').addEventListener('click', async () => {
            await this.testMicrophone();
        });

        // Голосовой чат
        document.getElementById('voiceCallBtn').addEventListener('click', async () => {
            // Если голосовой чат уже активен, предлагаем выйти
            if (this.voiceChatActive && this.voiceChat) {
                if (confirm('Вы уже в голосовом чате. Хотите выйти?')) {
                    await this.voiceChat.disconnect();
                    this.voiceChatActive = false;
                    this.updateVoiceChatStatus(false);
                }
                return;
            }

            // Иначе запускаем новый голосовой чат
            await this.initiateCall('voice');
        });

        // Видеозвонок
        document.getElementById('videoCallBtn').addEventListener('click', () => {
            this.initiateCall('video');
        });

        // Информация о голосовом чате
        document.getElementById('voiceInfoBtn').addEventListener('click', () => {
            this.showVoiceChatInfo();
        });

        // Анимация наведения на элементы
        this.addHoverEffects();
    }

    addHoverEffects() {
        // Добавляем классы для анимаций при наведении
        const elements = document.querySelectorAll('.server-icon, .channel, .user, .action-btn');
        elements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                el.classList.add('hover-effect');
            });
            el.addEventListener('mouseleave', () => {
                el.classList.remove('hover-effect');
            });
        });
    }

    async testMicrophone() {
        try {
            this.showNotification('Проверка микрофона...');

            // Проверяем поддержку
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Ваш браузер не поддерживает доступ к микрофону');
            }

            // Запрашиваем доступ
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            // Останавливаем поток
            stream.getTracks().forEach(track => track.stop());

            this.showNotification('✅ Микрофон работает нормально!', 'success');

        } catch (error) {
            console.error('Ошибка теста микрофона:', error);

            let message = 'Не удалось получить доступ к микрофону. ';

            if (error.name === 'NotAllowedError') {
                message += 'Разрешите доступ к микрофону в настройках браузера.';
            } else if (error.name === 'NotFoundError') {
                message += 'Микрофон не найден.';
            } else if (error.name === 'NotReadableError') {
                message += 'Микрофон занят другим приложением.';
            } else {
                message += error.message;
            }

            this.showNotification('❌ ' + message);
        }
    }

    async initiateCall(type) {
        if (type === 'voice') {
            // Показываем информацию о голосовом чате
            this.showVoiceChatInfo();

            // Спрашиваем подтверждение
            if (confirm(`Присоединиться к голосовому чату "${this.currentChannel}"?\n\nВы сможете общаться с другими участниками в реальном времени.`)) {
                try {
                    // Активируем кнопку
                    const voiceBtn = document.getElementById('voiceCallBtn');
                    voiceBtn.classList.add('active');

                    if (!this.voiceChat) {
                        this.voiceChat = new VoiceChat();
                    }

                    await this.voiceChat.startVoiceChat(this.currentChannel, this.user);
                    this.voiceChatActive = true;

                    // Обновляем статус в основном интерфейсе
                    this.updateVoiceChatStatus(true);

                } catch (error) {
                    console.error('Ошибка запуска голосового чата:', error);
                    this.showNotification('Не удалось подключиться к голосовому чату');

                    // Деактивируем кнопку
                    const voiceBtn = document.getElementById('voiceCallBtn');
                    voiceBtn.classList.remove('active');
                }
            }
        } else {
            this.showNotification('Видеозвонок будет реализован в следующей версии');
        }
    }

    showVoiceChatInfo() {
        this.showNotification(`
            🎤 Голосовой чат "${this.currentChannel}"
            ------------------------
            • Подключайтесь к реальным участникам
            • Общайтесь в реальном времени
            • Нажмите 🎤 чтобы начать
            • Микрофон выключен по умолчанию
            • Для работы требуется HTTPS
        `, 'info');
    }

    updateVoiceChatStatus(active) {
        this.voiceChatActive = active;
        const voiceBtn = document.getElementById('voiceCallBtn');

        if (active) {
            voiceBtn.classList.add('active');
            voiceBtn.innerHTML = '<i class="fas fa-phone-slash"></i>';
            voiceBtn.title = 'Выйти из голосового чата';
        } else {
            voiceBtn.classList.remove('active');
            voiceBtn.innerHTML = '<i class="fas fa-phone"></i>';
            voiceBtn.title = 'Голосовой звонок';
        }
    }

    switchChannel(channelName) {
        this.currentChannel = channelName;
        const chatTitle = document.querySelector('.chat-title');

        // Анимация смены названия канала
        chatTitle.style.animation = 'none';
        setTimeout(() => {
            chatTitle.textContent = channelName;
            chatTitle.style.animation = 'slideUp 0.3s ease';
        }, 100);

        // Сбрасываем историю для нового канала
        this.messageHistoryLoaded = false;
        this.historyOffset = 0;

        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '<div class="welcome-message"><h2>Загрузка истории канала...</h2><div class="history-loader">Загружаем все сообщения...</div></div>';

        // Загружаем полную историю
        this.loadFullMessageHistory();
    }

    async loadFullMessageHistory() {
        try {
            const response = await fetch(`/api/messages/${this.currentChannel}?limit=${this.HISTORY_CHUNK_SIZE}&offset=${this.historyOffset}`);
            const data = await response.json();

            if (data.success && data.messages.length > 0) {
                this.loadMessageHistory(data);

                // Если есть еще сообщения, добавляем кнопку "Загрузить еще"
                if (data.total > this.historyOffset + data.messages.length) {
                    this.addLoadMoreButton(data.total);
                }
            } else {
                this.addSystemMessage('В этой комнате еще нет сообщений');
            }
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            this.addSystemMessage('Ошибка загрузки истории сообщений');
        }
    }

    loadMessageHistory(data) {
        const messagesContainer = document.getElementById('messagesContainer');

        // Удаляем лоадер если есть
        const loader = messagesContainer.querySelector('.history-loader');
        if (loader) {
            loader.remove();
        }

        // Удаляем приветственное сообщение если это первая загрузка
        if (!this.messageHistoryLoaded) {
            messagesContainer.innerHTML = '';
            this.messageHistoryLoaded = true;
        }

        // Добавляем сообщения в правильном порядке
        const messages = data.messages.reverse(); // Переворачиваем обратно
        messages.forEach((message, index) => {
            this.addMessageToHistory(message);

            // Добавляем разделитель дат если следующее сообщение другого дня
            if (index < messages.length - 1) {
                const currentDate = new Date(message.timestamp).toDateString();
                const nextDate = new Date(messages[index + 1].timestamp).toDateString();

                if (currentDate !== nextDate) {
                    this.addDateSeparator(new Date(messages[index + 1].timestamp));
                }
            }
        });

        this.historyOffset += messages.length;
        this.scrollToBottom();
    }

    addMessageToHistory(message) {
        const messagesContainer = document.getElementById('messagesContainer');

        const messageElement = document.createElement('div');
        messageElement.className = 'message new-message';

        const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML =
            '<div class="avatar">' +
            '<img src="' + message.avatar + '" alt="' + message.username + '">' +
            '</div>' +
            '<div class="message-content">' +
            '<div class="message-header">' +
            '<span class="username" style="color: ' + message.color + '">' + message.username + '</span>' +
            '<span class="timestamp">' + time + '</span>' +
            '</div>' +
            '<div class="message-text">' + this.escapeHtml(message.content) + '</div>' +
            '</div>';

        messagesContainer.appendChild(messageElement);
    }

    addDateSeparator(date) {
        const messagesContainer = document.getElementById('messagesContainer');

        const dateStr = date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const timeMarker = document.createElement('div');
        timeMarker.className = 'time-marker';
        timeMarker.innerHTML =
            '<div class="time-marker-line"></div>' +
            '<span>' + dateStr + '</span>' +
            '<div class="time-marker-line"></div>';

        messagesContainer.appendChild(timeMarker);
    }

    addLoadMoreButton(totalMessages) {
        const messagesContainer = document.getElementById('messagesContainer');

        // Удаляем существующую кнопку если есть
        const oldButton = messagesContainer.querySelector('.load-more-btn');
        if (oldButton) {
            oldButton.remove();
        }

        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.textContent = `Загрузить еще (${this.historyOffset} из ${totalMessages})`;

        loadMoreBtn.addEventListener('click', () => {
            this.loadFullMessageHistory();
        });

        messagesContainer.insertBefore(loadMoreBtn, messagesContainer.firstChild);
    }

    loadInitialMessages(messages) {
        // Эта функция теперь не используется для истории,
        // но оставляем для обратной совместимости
        if (!this.messageHistoryLoaded) {
            this.loadMessageHistory({
                messages: messages,
                total: messages.length,
                offset: 0,
                limit: messages.length
            });
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messagesContainer');
        setTimeout(() => {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }

    addMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');

        if (messagesContainer.querySelector('.welcome-message')) {
            messagesContainer.innerHTML = '';
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'message new-message';

        const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML =
            '<div class="avatar">' +
            '<img src="' + message.avatar + '" alt="' + message.username + '">' +
            '</div>' +
            '<div class="message-content">' +
            '<div class="message-header">' +
            '<span class="username" style="color: ' + message.color + '">' + message.username + '</span>' +
            '<span class="timestamp">' + time + '</span>' +
            '</div>' +
            '<div class="message-text">' + this.escapeHtml(message.content) + '</div>' +
            '</div>';

        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    addSystemMessage(text) {
        const messagesContainer = document.getElementById('messagesContainer');

        if (messagesContainer.querySelector('.welcome-message')) {
            messagesContainer.innerHTML = '';
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'message new-message';
        messageElement.innerHTML =
            '<div class="message-content" style="text-align: center; color: var(--text-muted); font-style: italic;">' +
            text +
            '</div>';

        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    showTypingIndicator(username) {
        const messagesContainer = document.getElementById('messagesContainer');
        let indicator = document.getElementById('typing-indicator');

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'typing-indicator';
            indicator.innerHTML = '<span>' + username + ' печатает...</span>';
            indicator.style.cssText = 'color: var(--text-muted); font-style: italic; padding: 10px; animation: fadeIn 0.3s ease;';
            messagesContainer.appendChild(indicator);
        }

        clearTimeout(window.typingTimeout);
        window.typingTimeout = setTimeout(() => {
            if (indicator && indicator.parentNode) {
                indicator.style.animation = 'fadeIn 0.3s ease reverse';
                setTimeout(() => {
                    if (indicator && indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 300);
            }
        }, 2000);
    }

    addUser(user) {
        this.users.set(user.id, user);
        this.updateUsersDisplay();
    }

    removeUser(userId) {
        this.users.delete(userId);
        this.updateUsersDisplay();
    }

    updateUsersList(users) {
        this.users.clear();
        users.forEach(user => this.users.set(user.id, user));
        this.updateUsersDisplay();
    }

    updateUsersDisplay() {
        const usersList = document.getElementById('usersList');
        const usersCount = document.getElementById('usersCount');

        usersList.innerHTML = '';
        usersCount.textContent = this.users.size + 1;

        // Добавляем системного пользователя
        const systemUser = document.createElement('div');
        systemUser.className = 'user';
        systemUser.innerHTML =
            '<div class="user-avatar">' +
            '<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=system" alt="System">' +
            '<div class="status"></div>' +
            '</div>' +
            '<div class="user-info">' +
            '<div class="user-name">Система</div>' +
            '</div>';
        usersList.appendChild(systemUser);

        // Добавляем всех пользователей
        this.users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user';
            userElement.innerHTML =
                '<div class="user-avatar">' +
                '<img src="' + user.avatar + '" alt="' + user.username + '">' +
                '<div class="status ' + (user.status || 'online') + '"></div>' +
                '</div>' +
                '<div class="user-info">' +
                '<div class="user-name">' + user.username + '</div>' +
                '</div>';
            usersList.appendChild(userElement);
        });
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    showProfile() {
        this.showNotification('Профиль пользователя ' + this.user.username);
    }

    showSettings() {
        this.showNotification('Настройки будут доступны в следующей версии');
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.session.sessionId })
            });
        } catch (error) {
            // Игнорируем ошибки при выходе
        }

        localStorage.removeItem('lamax_session');
        window.location.href = '/';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    window.messenger = new Messenger();
});