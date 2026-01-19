const { v4: uuidv4 } = require('uuid');

module.exports = function(io, authManager, sessionManager, roomManager) {
    const onlineUsers = new Map();

    io.on('connection', (socket) => {
        console.log('🔌 Новое подключение: ' + socket.id);

        // Аутентификация через сессию
        socket.on('authenticate', (data) => {
            const { sessionId } = data;

            if (!sessionId || !sessionManager.verifySession(sessionId)) {
                socket.emit('auth-error', { message: 'Недействительная сессия' });
                socket.disconnect();
                return;
            }

            const userId = sessionManager.getSessionUserId(sessionId);
            const user = authManager.getUserById(userId);

            if (!user) {
                socket.emit('auth-error', { message: 'Пользователь не найден' });
                socket.disconnect();
                return;
            }

            // Обновляем статус пользователя
            user.status = 'online';
            user.socketId = socket.id;
            onlineUsers.set(userId, user);

            socket.userId = userId;
            socket.user = user;

            socket.emit('authenticated', {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    email: user.email
                }
            });

            // Отправляем список онлайн пользователей
            const onlineUsersList = Array.from(onlineUsers.values())
                .filter(u => u.status === 'online')
                .map(u => ({
                    id: u.id,
                    username: u.username,
                    avatar: u.avatar,
                    status: u.status
                }));

            socket.emit('users-list', onlineUsersList);

            // Уведомляем других о новом пользователе
            socket.broadcast.emit('user-joined', {
                userId: user.id,
                username: user.username,
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    status: user.status
                }
            });

            // Обновляем статистику онлайн
            updateOnlineStats();

            console.log('✅ Аутентифицирован: ' + user.username + ' (' + user.email + ')');
        });

        // Присоединение к комнате
        socket.on('join-room', (roomId) => {
            const userId = socket.userId;
            if (!userId || !onlineUsers.has(userId)) return;

            const user = onlineUsers.get(userId);
            let room = roomManager.getRoom(roomId);

            if (!room) {
                room = roomManager.createRoom(roomId);
            }

            if (roomManager.addUserToRoom(roomId, userId)) {
                socket.join(roomId);

                // Загружаем все сообщения комнаты
                const roomMessages = roomManager.getAllMessages(roomId);
                socket.emit('room-joined', {
                    roomId,
                    messages: roomMessages.slice(-100) // Последние 100 сообщений для быстрой загрузки
                });

                console.log('📥 ' + user.username + ' присоединился к ' + roomId);
            }
        });

        // Запрос полной истории сообщений
        socket.on('get-message-history', async (data) => {
            const { roomId, limit = 1000, offset = 0 } = data;
            const userId = socket.userId;

            if (!userId || !onlineUsers.has(userId)) return;

            const roomMessages = roomManager.getAllMessages(roomId) || [];
            const allMessages = [...roomMessages].reverse();
            const paginatedMessages = allMessages.slice(offset, offset + limit);

            socket.emit('message-history', {
                roomId,
                total: roomMessages.length,
                offset,
                limit,
                messages: paginatedMessages
            });
        });

        // Отправка сообщения
        socket.on('send-message', async (data) => {
            const userId = socket.userId;
            if (!userId || !onlineUsers.has(userId)) return;

            const { roomId, content, type = 'text' } = data;
            if (!roomId || !content) return;

            const user = onlineUsers.get(userId);
            const room = roomManager.getRoom(roomId);
            if (!room) return;

            const message = {
                id: uuidv4(),
                userId,
                username: user.username,
                avatar: user.avatar,
                content: content.substring(0, 2000),
                type,
                timestamp: new Date(),
                color: getRandomColor()
            };

            const savedMessage = await roomManager.addMessage(roomId, message);
            io.to(roomId).emit('new-message', savedMessage);

            console.log('💬 ' + user.username + ' в ' + roomId + ': ' + content.substring(0, 50) + (content.length > 50 ? '...' : ''));
        });

        // ========== ОБРАБОТЧИКИ ГОЛОСОВОГО ЧАТА ==========

        // Присоединение к голосовому чату
        socket.on('join-voice-room', (roomId) => {
            const userId = socket.userId;
            if (!userId || !onlineUsers.has(userId)) return;

            const user = onlineUsers.get(userId);

            // Уведомляем других пользователей в текстовом чате
            socket.to(roomId).emit('voice-user-joined', {
                userId: user.id,
                username: user.username,
                roomId: roomId,
                timestamp: new Date()
            });

            console.log(`🎤 ${user.username} присоединился к голосовому чату ${roomId}`);
        });

        // Выход из голосового чата
        socket.on('leave-voice-room', (roomId) => {
            const userId = socket.userId;
            if (!userId || !onlineUsers.has(userId)) return;

            const user = onlineUsers.get(userId);

            // Уведомляем других пользователей
            socket.to(roomId).emit('voice-user-left', {
                userId: user.id,
                username: user.username,
                roomId: roomId,
                timestamp: new Date()
            });

            console.log(`🎤 ${user.username} покинул голосовой чат ${roomId}`);
        });

        // Отключение
        socket.on('disconnect', () => {
            const userId = socket.userId;
            if (!userId) return;

            const user = onlineUsers.get(userId);
            if (user) {
                user.status = 'offline';
                delete user.socketId;

                socket.broadcast.emit('user-left', {
                    userId,
                    username: user.username
                });

                // Удаляем из онлайн пользователей
                onlineUsers.delete(userId);

                // Обновляем статистику онлайн
                updateOnlineStats();

                console.log('🔌 Отключился: ' + user.username);
            }
        });
    });

    function getRandomColor() {
        const colors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#8957E5'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function updateOnlineStats() {
        io.emit('online-stats', {
            online: onlineUsers.size
        });
    }
};