const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.messages = new Map();
        this.DATA_DIR = path.join(__dirname, '../data');
        this.MESSAGES_FILE = path.join(this.DATA_DIR, 'messages.json');
        this.loadMessagesFromFile();
        this.setupAutoSave();
    }

    async loadMessagesFromFile() {
        try {
            await fs.mkdir(this.DATA_DIR, { recursive: true });
            const data = await fs.readFile(this.MESSAGES_FILE, 'utf8');
            const messagesData = JSON.parse(data);

            Object.keys(messagesData).forEach(roomId => {
                const roomMessages = messagesData[roomId];
                // Конвертируем строки дат обратно в объекты Date
                const convertedMessages = roomMessages.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                this.messages.set(roomId, convertedMessages);
            });

            console.log(`📂 Загружены сообщения из ${Object.keys(messagesData).length} комнат`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Ошибка загрузки сообщений:', error);
            } else {
                console.log('📂 Файл сообщений не найден, создаем новый');
            }
        }
    }

    async saveMessagesToFile() {
        try {
            const messagesData = {};
            this.messages.forEach((roomMessages, roomId) => {
                // Конвертируем даты в строки для сохранения
                messagesData[roomId] = roomMessages.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp.toISOString()
                }));
            });
            await fs.writeFile(this.MESSAGES_FILE, JSON.stringify(messagesData, null, 2));
            console.log('💾 Сообщения сохранены на диск');
        } catch (error) {
            console.error('❌ Ошибка сохранения сообщений:', error);
        }
    }

    setupAutoSave() {
        // Автосохранение каждые 5 минут
        setInterval(() => {
            this.saveMessagesToFile().catch(console.error);
        }, 5 * 60 * 1000);
    }

    createRoom(roomId, name, type = 'text', description = '') {
        const room = {
            id: roomId,
            name: name || roomId.charAt(0).toUpperCase() + roomId.slice(1),
            type,
            description,
            users: [],
            created: new Date()
        };

        this.rooms.set(roomId, room);
        if (!this.messages.has(roomId)) {
            this.messages.set(roomId, []);
        }

        console.log(`✅ Создана новая комната: ${room.name} (${roomId})`);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    getAllRooms() {
        return Array.from(this.rooms.values());
    }

    addUserToRoom(roomId, userId) {
        const room = this.getRoom(roomId);
        if (room && !room.users.includes(userId)) {
            room.users.push(userId);
            return true;
        }
        return false;
    }

    removeUserFromRoom(roomId, userId) {
        const room = this.getRoom(roomId);
        if (room) {
            const index = room.users.indexOf(userId);
            if (index > -1) {
                room.users.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    async addMessage(roomId, message) {
        if (!this.messages.has(roomId)) {
            this.messages.set(roomId, []);
        }

        const roomMessages = this.messages.get(roomId);
        roomMessages.push(message);

        // Сохраняем на диск
        await this.saveMessagesToFile();

        return message;
    }

    getMessages(roomId, limit = 100) {
        const messages = this.messages.get(roomId) || [];
        return messages.slice(-limit);
    }

    getAllMessages(roomId) {
        return this.messages.get(roomId) || [];
    }

    getStats() {
        const totalMessages = Array.from(this.messages.values())
            .reduce((sum, msgs) => sum + msgs.length, 0);

        return {
            rooms: this.rooms.size,
            total_messages: totalMessages
        };
    }
}

// Стандартные комнаты
const defaultRooms = [
    { id: 'general', name: 'Основной', type: 'text', description: 'Общий чат' },
    { id: 'gaming', name: 'Игры', type: 'text', description: 'Обсуждение игр' },
    { id: 'music', name: 'Музыка', type: 'text', description: 'Музыка и треки' },
    { id: 'help', name: 'Помощь', type: 'text', description: 'Вопросы и помощь' },
    { id: 'voice', name: 'Голосовой чат', type: 'voice', description: 'Голосовое общение' }
];

function initializeRooms(roomManager) {
    defaultRooms.forEach(roomConfig => {
        if (!roomManager.getRoom(roomConfig.id)) {
            roomManager.createRoom(
                roomConfig.id,
                roomConfig.name,
                roomConfig.type,
                roomConfig.description
            );
        }
    });
}

module.exports = RoomManager;
module.exports.initializeRooms = initializeRooms;