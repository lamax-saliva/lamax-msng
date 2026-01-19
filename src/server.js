#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');

// Конфигурация
const PORT = 443;
const HOST = '0.0.0.0';
const SERVER_IP = '193.233.86.5';
const DOMAIN = '193.233.86.5';
const APP_NAME = 'Lamax';

const app = express();

// SSL сертификаты
const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
}

const certPath = path.join(sslDir, 'cert.pem');
const keyPath = path.join(sslDir, 'key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log('🔐 Создаем SSL сертификаты...');
    const { execSync } = require('child_process');
    try {
        execSync(`openssl req -x509 -newkey rsa:4096 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/C=RU/ST=Moscow/L=Moscow/O=Lamax/CN=${DOMAIN}"`, {
            stdio: 'inherit'
        });
        console.log('✅ SSL сертификаты созданы');
    } catch (error) {
        console.error('❌ Ошибка создания SSL:', error.message);
        process.exit(1);
    }
}

const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const server = https.createServer(httpsOptions, app);
const io = socketIo(server, {
    cors: { origin: "*", credentials: true },
    transports: ['websocket', 'polling']
});

// Импортируем менеджеры
const AuthManager = require('./modules/authmodul');
const SessionManager = require('./modules/sessions.js');
const RoomManager = require('./modules/rooms.js');

const authManager = new AuthManager();
const sessionManager = new SessionManager();
const roomManager = new RoomManager();

const { initializeRooms } = require('./modules/rooms.js');
initializeRooms(roomManager);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('ru-RU')}] ${req.method} ${req.url} - ${req.ip}`);
    next();
});

// WebSocket сервер для WebRTC
const webrtcServer = new WebSocket.Server({
    server: server,
    path: '/webrtc'
});

const webrtcRooms = new Map();

webrtcServer.on('connection', (ws, req) => {
    const peerId = 'peer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    console.log(`✅ WebRTC клиент подключен: ${peerId}`);

    ws.send(JSON.stringify({
        type: 'your-peer-id',
        peerId: peerId,
        timestamp: Date.now()
    }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
                case 'join-room':
                    const { roomId, userId, username, avatar } = data;

                    if (!webrtcRooms.has(roomId)) {
                        webrtcRooms.set(roomId, new Map());
                    }

                    const room = webrtcRooms.get(roomId);
                    room.set(peerId, {
                        ws,
                        userId,
                        username,
                        avatar,
                        roomId,
                        joinTime: Date.now(),
                        isMuted: true,
                        isSpeaking: false
                    });

                    console.log(`👤 ${username} присоединился к голосовому чату ${roomId}`);

                    const peers = Array.from(room.entries())
                        .filter(([id, _]) => id !== peerId)
                        .map(([id, peer]) => ({
                            peerId: id,
                            userId: peer.userId,
                            username: peer.username,
                            avatar: peer.avatar
                        }));

                    ws.send(JSON.stringify({
                        type: 'existing-peers',
                        peers: peers,
                        roomId: roomId,
                        yourId: peerId,
                        totalUsers: room.size
                    }));

                    room.forEach((otherPeer, otherId) => {
                        if (otherId !== peerId && otherPeer.ws.readyState === WebSocket.OPEN) {
                            otherPeer.ws.send(JSON.stringify({
                                type: 'new-peer',
                                peerId: peerId,
                                userId: userId,
                                username: username,
                                avatar: avatar,
                                roomId: roomId
                            }));
                        }
                    });
                    break;

                case 'user-muted':
                    if (data.roomId && webrtcRooms.has(data.roomId)) {
                        const room = webrtcRooms.get(data.roomId);
                        if (room && room.has(peerId)) {
                            room.get(peerId).isMuted = data.muted;

                            room.forEach((otherPeer, otherId) => {
                                if (otherId !== peerId && otherPeer.ws.readyState === WebSocket.OPEN) {
                                    otherPeer.ws.send(JSON.stringify({
                                        type: 'user-muted',
                                        peerId: peerId,
                                        muted: data.muted,
                                        roomId: data.roomId
                                    }));
                                }
                            });
                        }
                    }
                    break;

                case 'user-speaking':
                    if (data.roomId && webrtcRooms.has(data.roomId)) {
                        const room = webrtcRooms.get(data.roomId);
                        if (room && room.has(peerId)) {
                            room.get(peerId).isSpeaking = data.speaking;

                            room.forEach((otherPeer, otherId) => {
                                if (otherId !== peerId && otherPeer.ws.readyState === WebSocket.OPEN) {
                                    otherPeer.ws.send(JSON.stringify({
                                        type: 'user-speaking',
                                        peerId: peerId,
                                        speaking: data.speaking,
                                        roomId: data.roomId
                                    }));
                                }
                            });
                        }
                    }
                    break;

                case 'ping':
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: data.timestamp,
                        ping: Date.now() - data.timestamp
                    }));
                    break;

                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    if (data.targetPeerId && data.roomId && webrtcRooms.has(data.roomId)) {
                        const room = webrtcRooms.get(data.roomId);
                        if (room) {
                            const targetPeer = room.get(data.targetPeerId);
                            if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
                                targetPeer.ws.send(JSON.stringify({
                                    type: data.type,
                                    sdp: data.sdp,
                                    candidate: data.candidate,
                                    senderPeerId: peerId,
                                    roomId: data.roomId
                                }));
                                console.log(`📨 ${data.type} от ${peerId} → ${data.targetPeerId}`);
                            }
                        }
                    }
                    break;

                case 'leave-room':
                    handleLeaveRoom(peerId, data.roomId);
                    break;
            }
        } catch (error) {
            console.error('❌ Ошибка обработки сообщения:', error);
        }
    });

    ws.on('close', () => {
        console.log(`🔌 WebRTC клиент отключен: ${peerId}`);
        webrtcRooms.forEach((room, roomId) => {
            if (room.has(peerId)) {
                handleLeaveRoom(peerId, roomId);
            }
        });
    });
});

function handleLeaveRoom(peerId, roomId) {
    const room = webrtcRooms.get(roomId);
    if (room && room.has(peerId)) {
        const peer = room.get(peerId);

        room.forEach((otherPeer, otherId) => {
            if (otherId !== peerId && otherPeer.ws.readyState === WebSocket.OPEN) {
                otherPeer.ws.send(JSON.stringify({
                    type: 'peer-disconnected',
                    peerId: peerId,
                    username: peer.username,
                    roomId: roomId
                }));
            }
        });

        room.delete(peerId);
        console.log(`👋 ${peer?.username || peerId} покинул голосовой чат ${roomId}`);

        if (room.size === 0) {
            webrtcRooms.delete(roomId);
        }
    }
}

// Маршруты
app.get('/api/webrtc/config', (req, res) => {
    res.json({
        success: true,
        websocketUrl: `wss://${DOMAIN}/webrtc`,
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' }
        ],
        serverInfo: {
            ip: SERVER_IP,
            protocol: 'https',
            secure: true,
            ssl: true
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Импортируем маршруты
require('./routes/auth.js')(app, authManager, sessionManager);
require('./routes/api.js')(app, authManager, roomManager);
require('./routes/static.js')(app);
require('./sockets/main.js')(io, authManager, sessionManager, roomManager);

// Обработчики ошибок
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
    console.error('❌ Ошибка сервера:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Запуск
server.listen(PORT, HOST, () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`✅ ${APP_NAME} ЗАПУЩЕН НА HTTPS`);
    console.log('═'.repeat(60));
    console.log(`🔐 HTTPS:           https://${DOMAIN}`);
    console.log(`🎤 WebSocket:       wss://${DOMAIN}/webrtc`);
    console.log(`📡 IP адрес:        ${SERVER_IP}`);
    console.log(`🏠 Локальный:       https://localhost`);
    console.log('\n🔗 Ссылки:');
    console.log(`   📱 Мессенджер:    https://${DOMAIN}/app`);
    console.log(`   🔐 Регистрация:   https://${DOMAIN}/`);
    console.log(`   ⚙️  Конфигурация:  https://${DOMAIN}/api/webrtc/config`);
    console.log('═'.repeat(60));
    console.log('\n⚠️  Предупреждение: Используется самоподписанный сертификат');
    console.log('   В браузере нажмите "Дополнительно" → "Перейти на сайт"');
    console.log('═'.repeat(60));
});

process.on('SIGINT', () => {
    console.log('\n🛑 Останавливаем сервер...');
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});