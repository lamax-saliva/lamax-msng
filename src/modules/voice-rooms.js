const { v4: uuidv4 } = require('uuid');

class VoiceRoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> { users: Map<userId, userInfo>, created, type }
    }

    createRoom(roomId, name, type = 'voice') {
        const room = {
            id: roomId,
            name: name || roomId,
            type: type,
            users: new Map(),
            created: new Date(),
            active: true
        };

        this.rooms.set(roomId, room);
        console.log(`🎤 Создана голосовая комната: ${name} (${roomId})`);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    getAllRooms() {
        return Array.from(this.rooms.values());
    }

    addUserToRoom(roomId, user) {
        const room = this.getRoom(roomId);
        if (!room) {
            room = this.createRoom(roomId, roomId);
        }

        if (!room.users.has(user.id)) {
            room.users.set(user.id, {
                ...user,
                joined: new Date(),
                isMuted: true,
                isSpeaking: false,
                socketId: null
            });

            console.log(`🎤 ${user.username} присоединился к голосовой комнате ${roomId}`);
            return true;
        }
        return false;
    }

    removeUserFromRoom(roomId, userId) {
        const room = this.getRoom(roomId);
        if (room) {
            const user = room.users.get(userId);
            if (user) {
                room.users.delete(userId);
                console.log(`🎤 ${user.username} покинул голосовую комнату ${roomId}`);

                // Если комната пустая и не стандартная, удаляем ее
                if (room.users.size === 0 && !this.isDefaultRoom(roomId)) {
                    this.rooms.delete(roomId);
                    console.log(`🗑️ Голосовая комната ${roomId} удалена (пустая)`);
                }
                return true;
            }
        }
        return false;
    }

    updateUserStatus(roomId, userId, status) {
        const room = this.getRoom(roomId);
        if (room && room.users.has(userId)) {
            const user = room.users.get(userId);
            user.status = status;
            return true;
        }
        return false;
    }

    updateUserMuteStatus(roomId, userId, isMuted) {
        const room = this.getRoom(roomId);
        if (room && room.users.has(userId)) {
            const user = room.users.get(userId);
            user.isMuted = isMuted;
            return true;
        }
        return false;
    }

    updateUserSpeakingStatus(roomId, userId, isSpeaking) {
        const room = this.getRoom(roomId);
        if (room && room.users.has(userId)) {
            const user = room.users.get(userId);
            user.isSpeaking = isSpeaking;
            return true;
        }
        return false;
    }

    getRoomUsers(roomId) {
        const room = this.getRoom(roomId);
        if (room) {
            return Array.from(room.users.values()).map(user => ({
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                isMuted: user.isMuted,
                isSpeaking: user.isSpeaking,
                joined: user.joined
            }));
        }
        return [];
    }

    getRoomStats(roomId) {
        const room = this.getRoom(roomId);
        if (room) {
            const users = Array.from(room.users.values());
            return {
                totalUsers: users.length,
                activeSpeakers: users.filter(u => u.isSpeaking && !u.isMuted).length,
                mutedUsers: users.filter(u => u.isMuted).length,
                roomCreated: room.created,
                roomActive: room.active
            };
        }
        return null;
    }

    isDefaultRoom(roomId) {
        const defaultRooms = ['general', 'gaming', 'music', 'help', 'voice'];
        return defaultRooms.includes(roomId);
    }

    getStats() {
        let totalUsers = 0;
        let totalActiveSpeakers = 0;

        this.rooms.forEach(room => {
            const users = Array.from(room.users.values());
            totalUsers += users.length;
            totalActiveSpeakers += users.filter(u => u.isSpeaking && !u.isMuted).length;
        });

        return {
            totalRooms: this.rooms.size,
            totalUsers: totalUsers,
            totalActiveSpeakers: totalActiveSpeakers
        };
    }
}

module.exports = VoiceRoomManager;