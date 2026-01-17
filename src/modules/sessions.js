const { v4: uuidv4 } = require('uuid');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // {sessionId: userId}
    }

    createSession(userId) {
        const sessionId = uuidv4();
        this.sessions.set(sessionId, userId);
        return sessionId;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    deleteSession(sessionId) {
        return this.sessions.delete(sessionId);
    }

    verifySession(sessionId) {
        return this.sessions.has(sessionId);
    }

    getSessionUserId(sessionId) {
        return this.sessions.get(sessionId);
    }

    getStats() {
        return {
            active_sessions: this.sessions.size
        };
    }
}

module.exports = SessionManager;