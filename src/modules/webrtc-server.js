const WebSocket = require('ws');
const EventEmitter = require('events');

class WebRTCServer extends EventEmitter {
    constructor(port = 8080) {
        super();
        this.port = port;
        this.wss = null;
        this.peers = new Map(); // Map<peerId, {ws, userId, roomId}>
        this.init();
    }

    init() {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws, req) => {
            const peerId = this.generatePeerId();

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, peerId, message);
                } catch (error) {
                    console.error('Ошибка парсинга сообщения:', error);
                }
            });

            ws.on('close', () => {
                const peer = this.peers.get(peerId);
                if (peer) {
                    this.emit('peer-disconnected', peerId, peer.userId, peer.roomId);
                    this.peers.delete(peerId);

                    // Уведомляем других пиров в комнате
                    this.broadcastToRoom(peer.roomId, peerId, {
                        type: 'peer-disconnected',
                        peerId: peerId,
                        userId: peer.userId
                    });
                }
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            // Отправляем ID пира при подключении
            ws.send(JSON.stringify({
                type: 'your-peer-id',
                peerId: peerId
            }));
        });

        console.log(`✅ WebRTC сервер запущен на порту ${this.port}`);
    }

    handleMessage(ws, peerId, message) {
        switch (message.type) {
            case 'join-room':
                this.handleJoinRoom(ws, peerId, message);
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                this.handleRTCMessage(peerId, message);
                break;

            case 'mute':
            case 'unmute':
            case 'disconnect':
                this.handleActionMessage(peerId, message);
                break;
        }
    }

    handleJoinRoom(ws, peerId, message) {
        const { userId, roomId, username } = message;

        // Сохраняем информацию о пире
        this.peers.set(peerId, { ws, userId, roomId, username });

        // Получаем список других пиров в комнате
        const otherPeers = this.getPeersInRoom(roomId).filter(p => p.peerId !== peerId);

        // Отправляем новому пиру список существующих пиров
        ws.send(JSON.stringify({
            type: 'existing-peers',
            peers: otherPeers.map(p => ({
                peerId: p.peerId,
                userId: p.userId,
                username: p.username
            }))
        }));

        // Уведомляем других пиров о новом участнике
        this.broadcastToRoom(roomId, peerId, {
            type: 'new-peer',
            peerId: peerId,
            userId: userId,
            username: username
        });

        this.emit('peer-joined', peerId, userId, roomId, username);
    }

    handleRTCMessage(senderPeerId, message) {
        const { targetPeerId, ...rest } = message;
        const targetPeer = this.peers.get(targetPeerId);

        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
                ...rest,
                senderPeerId: senderPeerId
            }));
        }
    }

    handleActionMessage(peerId, message) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        this.broadcastToRoom(peer.roomId, peerId, {
            ...message,
            peerId: peerId,
            userId: peer.userId,
            username: peer.username
        });
    }

    broadcastToRoom(roomId, excludePeerId, message) {
        this.getPeersInRoom(roomId).forEach(peer => {
            if (peer.peerId !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(JSON.stringify(message));
            }
        });
    }

    getPeersInRoom(roomId) {
        return Array.from(this.peers.values())
            .filter(peer => peer.roomId === roomId)
            .map(peer => ({
                peerId: Array.from(this.peers.entries())
                    .find(([id, p]) => p.userId === peer.userId && p.roomId === roomId)[0],
                ...peer
            }));
    }

    generatePeerId() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }

    close() {
        if (this.wss) {
            this.wss.close();
        }
    }
}

module.exports = WebRTCServer;