module.exports = function(app, authManager, roomManager) {
    // Статистика сервера
    app.get('/api/stats', (req, res) => {
        const authStats = authManager.getStats();
        const roomStats = roomManager.getStats();

        res.json({
            total_users: authStats.total_users,
            online_users: 0, // Будет обновляться через сокеты
            rooms: roomStats.rooms,
            total_messages: roomStats.total_messages,
            uptime: process.uptime()
        });
    });

    // API информация
    app.get('/api/info', (req, res) => {
        const PORT = process.env.PORT || 3000;
        const SERVER_IP = process.env.SERVER_IP || '193.233.86.5';

        res.json({
            name: 'Lamax Messenger',
            version: '1.0.0',
            server_ip: SERVER_IP,
            server_url: 'http://' + SERVER_IP + ':' + PORT,
            port: PORT,
            connections: 0, // Будет обновляться через сокеты
            online_users: 0, // Будет обновляться через сокеты
            total_users: authManager.getStats().total_users,
            rooms: roomManager.getAllRooms().map(r => ({
                id: r.id,
                name: r.name,
                type: r.type,
                users: r.users.length,
                message_count: roomManager.getAllMessages(r.id).length
            })),
            uptime: process.uptime()
        });
    });

    // Health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: 'Lamax Messenger',
            version: '1.0.0',
            connections: 0,
            rooms: roomManager.getAllRooms().length,
            total_messages: roomManager.getStats().total_messages,
            uptime: process.uptime()
        });
    });

    // Получение истории сообщений комнаты
    app.get('/api/messages/:roomId', (req, res) => {
        const roomId = req.params.roomId;
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const roomMessages = roomManager.getAllMessages(roomId) || [];

        // Получаем сообщения с конца (последние сообщения сначала)
        const allMessages = [...roomMessages].reverse();
        const paginatedMessages = allMessages.slice(offset, offset + limit);

        res.json({
            success: true,
            roomId,
            total: roomMessages.length,
            offset,
            limit,
            messages: paginatedMessages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp.toISOString()
            }))
        });
    });

    // Получение всех комнат с количеством сообщений
    app.get('/api/rooms', (req, res) => {
        const roomsList = roomManager.getAllRooms().map(room => {
            const roomMessages = roomManager.getAllMessages(room.id) || [];
            return {
                id: room.id,
                name: room.name,
                type: room.type,
                description: room.description,
                userCount: room.users.length,
                messageCount: roomMessages.length,
                lastMessage: roomMessages.length > 0 ? {
                    ...roomMessages[roomMessages.length - 1],
                    timestamp: roomMessages[roomMessages.length - 1].timestamp.toISOString()
                } : null
            };
        });

        res.json({
            success: true,
            rooms: roomsList
        });
    });
};