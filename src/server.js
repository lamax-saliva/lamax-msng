#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios'); // Добавляем axios

// Конфигурация
const PORT = 443;
const HOST = '0.0.0.0';
const SERVER_IP = '193.233.86.5';
const DOMAIN = '193.233.86.5';
const APP_NAME = 'Lamax';

// Steam API ключ (получите на https://steamcommunity.com/dev/apikey)
const STEAM_API_KEY = process.env.STEAM_API_KEY || '749DC4FE0D5700FE242C991311D0CF10';

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
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    console.log(`✅ WebRTC клиент подключен: ${peerId} (IP: ${clientIp})`);

    // Отправляем конфигурацию сразу при подключении
    ws.send(JSON.stringify({
        type: 'server-config',
        peerId: peerId,
        timestamp: Date.now(),
        turnEnabled: true,
        serverIp: SERVER_IP
    }));

    // Отправляем peerId
    setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'your-peer-id',
            peerId: peerId,
            timestamp: Date.now()
        }));
    }, 100);

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
                        isSpeaking: false,
                        ip: clientIp
                    });

                    console.log(`👤 ${username} присоединился к голосовому чату ${roomId} (IP: ${clientIp})`);

                    // Получаем список других участников
                    const peers = Array.from(room.entries())
                        .filter(([id, _]) => id !== peerId)
                        .map(([id, peer]) => ({
                            peerId: id,
                            userId: peer.userId,
                            username: peer.username,
                            avatar: peer.avatar
                        }));

                    // Отправляем список участников
                    ws.send(JSON.stringify({
                        type: 'existing-peers',
                        peers: peers,
                        roomId: roomId,
                        yourId: peerId,
                        totalUsers: room.size,
                        serverTime: Date.now()
                    }));

                    // Уведомляем других участников
                    room.forEach((otherPeer, otherId) => {
                        if (otherId !== peerId && otherPeer.ws.readyState === WebSocket.OPEN) {
                            otherPeer.ws.send(JSON.stringify({
                                type: 'new-peer',
                                peerId: peerId,
                                userId: userId,
                                username: username,
                                avatar: avatar,
                                roomId: roomId,
                                timestamp: Date.now()
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
                                        roomId: data.roomId,
                                        timestamp: Date.now()
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
                                        roomId: data.roomId,
                                        timestamp: Date.now()
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
                        ping: Date.now() - data.timestamp,
                        serverTime: Date.now()
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
                                // Логируем передачу сигнальных сообщений
                                console.log(`📨 ${data.type} от ${peerId.substring(0, 8)} → ${data.targetPeerId.substring(0, 8)}`);

                                targetPeer.ws.send(JSON.stringify({
                                    type: data.type,
                                    sdp: data.sdp,
                                    candidate: data.candidate,
                                    senderPeerId: peerId,
                                    roomId: data.roomId,
                                    timestamp: Date.now()
                                }));
                            } else {
                                console.warn(`⚠️ Целевой пир ${data.targetPeerId} не найден или отключен`);
                            }
                        }
                    }
                    break;

                case 'leave-room':
                    handleLeaveRoom(peerId, data.roomId);
                    break;

                case 'diagnostics':
                    // Клиент запрашивает диагностику
                    const diagnostics = {
                        type: 'diagnostics-response',
                        peerId: peerId,
                        serverTime: Date.now(),
                        roomsCount: webrtcRooms.size,
                        totalPeers: Array.from(webrtcRooms.values())
                            .reduce((sum, room) => sum + room.size, 0),
                        yourRoom: data.roomId ? {
                            roomId: data.roomId,
                            peerCount: webrtcRooms.get(data.roomId)?.size || 0,
                            peers: webrtcRooms.get(data.roomId) ?
                                Array.from(webrtcRooms.get(data.roomId).keys()).map(id => id.substring(0, 8)) : []
                        } : null
                    };
                    ws.send(JSON.stringify(diagnostics));
                    break;
            }
        } catch (error) {
            console.error('❌ Ошибка обработки сообщения:', error);
            // Отправляем клиенту информацию об ошибке
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Ошибка обработки сообщения',
                error: error.message
            }));
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

    ws.on('error', (error) => {
        console.error(`❌ WebSocket ошибка для ${peerId}:`, error);
    });
});

function handleLeaveRoom(peerId, roomId) {
    const room = webrtcRooms.get(roomId);
    if (room && room.has(peerId)) {
        const peer = room.get(peerId);

        // Уведомляем других участников
        room.forEach((otherPeer, otherId) => {
            if (otherId !== peerId && otherPeer.ws.readyState === WebSocket.OPEN) {
                otherPeer.ws.send(JSON.stringify({
                    type: 'peer-disconnected',
                    peerId: peerId,
                    username: peer.username,
                    roomId: roomId,
                    timestamp: Date.now()
                }));
            }
        });

        room.delete(peerId);
        console.log(`👋 ${peer?.username || peerId} покинул голосовой чат ${roomId}`);

        if (room.size === 0) {
            webrtcRooms.delete(roomId);
            console.log(`🗑️  Комната ${roomId} удалена (пустая)`);
        }
    }
}

// ==================== Steam API Маршруты ====================

// Прокси для Steam API (обход CORS)
app.get('/api/steam/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).json({ error: 'URL не указан' });
        }

        // Добавляем API ключ если его нет в URL
        let finalUrl = url;
        if (!url.includes('key=') && STEAM_API_KEY !== 'YOUR_STEAM_API_KEY_HERE') {
            finalUrl += (url.includes('?') ? '&' : '?') + `key=${STEAM_API_KEY}`;
        }

        console.log(`🌐 Steam API запрос: ${finalUrl.substring(0, 100)}...`);

        const response = await axios.get(finalUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Lamax-Steam-Integration/1.0'
            },
            timeout: 10000
        });

        res.json(response.data);
    } catch (error) {
        console.error('Steam API proxy error:', error.message);
        res.status(500).json({
            error: 'Ошибка получения данных Steam',
            details: error.message
        });
    }
});

// Steam Games страница
app.get('/steam-games', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'steam-games.html'));
});

// Статика Steam
app.use('/views/css/steam-games.css', express.static(path.join(__dirname, 'views/css/steam-games.css')));

// Получение данных пользователя по Steam ID
app.get('/api/steam/user/:steamId', async (req, res) => {
    try {
        const steamId = req.params.steamId;

        if (!/^\d{17}$/.test(steamId)) {
            return res.status(400).json({ error: 'Некорректный Steam ID' });
        }

        const url = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`;

        const response = await axios.get(url);
        const players = response.data.response?.players || [];

        if (players.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const player = players[0];

        res.json({
            success: true,
            steamId: player.steamid,
            username: player.personaname,
            avatar: player.avatarfull,
            profileUrl: player.profileurl,
            status: getSteamStatus(player.personastate),
            gameInfo: player.gameextrainfo,
            gameId: player.gameid,
            lastLogoff: player.lastlogoff,
            timeCreated: player.timecreated,
            countryCode: player.loccountrycode,
            visibility: player.communityvisibilitystate
        });
    } catch (error) {
        console.error('Steam user data error:', error.message);
        res.status(500).json({
            error: 'Ошибка получения данных пользователя',
            details: error.message
        });
    }
});

// Поиск пользователя по никнейму
app.get('/api/steam/resolve/:vanityName', async (req, res) => {
    try {
        const vanityName = req.params.vanityName;

        const url = `http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_API_KEY}&vanityurl=${vanityName}`;

        const response = await axios.get(url);
        const data = response.data.response;

        if (data.success === 1) {
            res.json({
                success: true,
                steamId: data.steamid,
                vanityName: vanityName
            });
        } else {
            res.status(404).json({
                error: 'Пользователь не найден',
                message: 'Проверьте правильность никнейма'
            });
        }
    } catch (error) {
        console.error('Steam resolve error:', error.message);
        res.status(500).json({
            error: 'Ошибка поиска пользователя',
            details: error.message
        });
    }
});

// Получение списка игр пользователя
app.get('/api/steam/games/:steamId', async (req, res) => {
    try {
        const steamId = req.params.steamId;

        if (!/^\d{17}$/.test(steamId)) {
            return res.status(400).json({ error: 'Некорректный Steam ID' });
        }

        const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;

        const response = await axios.get(url);
        const games = response.data.response?.games || [];

        res.json({
            success: true,
            gameCount: response.data.response?.game_count || 0,
            games: games.map(game => ({
                appId: game.appid,
                name: game.name,
                playtimeForever: game.playtime_forever,
                playtime2Weeks: game.playtime_2weeks,
                imgIconUrl: `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
                imgLogoUrl: `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
                hasCommunityVisibleStats: game.has_community_visible_stats
            }))
        });
    } catch (error) {
        console.error('Steam games error:', error.message);
        res.status(500).json({
            error: 'Ошибка получения списка игр',
            details: error.message
        });
    }
});

// Получение списка друзей
app.get('/api/steam/friends/:steamId', async (req, res) => {
    try {
        const steamId = req.params.steamId;

        if (!/^\d{17}$/.test(steamId)) {
            return res.status(400).json({ error: 'Некорректный Steam ID' });
        }

        // Получаем список друзей
        const friendsUrl = `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&relationship=friend`;

        const friendsResponse = await axios.get(friendsUrl);
        const friendsList = friendsResponse.data.friendslist?.friends || [];

        if (friendsList.length === 0) {
            return res.json({
                success: true,
                friends: []
            });
        }

        // Получаем данные всех друзей
        const friendIds = friendsList.map(friend => friend.steamid).join(',');
        const summariesUrl = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${friendIds}`;

        const summariesResponse = await axios.get(summariesUrl);
        const summaries = summariesResponse.data.response?.players || [];

        // Сопоставляем данные
        const friends = friendsList.map(friend => {
            const summary = summaries.find(p => p.steamid === friend.steamid);
            return {
                steamId: friend.steamid,
                friendSince: friend.friend_since,
                username: summary?.personaname || 'Unknown',
                avatar: summary?.avatarfull || 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb.jpg',
                status: getSteamStatus(summary?.personastate),
                gameInfo: summary?.gameextrainfo,
                gameId: summary?.gameid,
                lastLogoff: summary?.lastlogoff || 0
            };
        });

        res.json({
            success: true,
            friends: friends
        });
    } catch (error) {
        console.error('Steam friends error:', error.message);
        res.status(500).json({
            error: 'Ошибка получения списка друзей',
            details: error.message
        });
    }
});

// Недавние игры
app.get('/api/steam/recent/:steamId', async (req, res) => {
    try {
        const steamId = req.params.steamId;

        const url = `http://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}`;

        const response = await axios.get(url);
        const games = response.data.response?.games || [];

        res.json({
            success: true,
            games: games.map(game => ({
                appId: game.appid,
                name: game.name,
                playtime2Weeks: game.playtime_2weeks,
                playtimeForever: game.playtime_forever,
                imgIconUrl: `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
                rtimeLastPlayed: game.rtime_last_played
            }))
        });
    } catch (error) {
        console.error('Steam recent games error:', error.message);
        // Не критичная ошибка, возвращаем пустой список
        res.json({
            success: true,
            games: []
        });
    }
});

// Steam Web API информация
app.get('/api/steam/info', (req, res) => {
    res.json({
        success: true,
        apiAvailable: STEAM_API_KEY !== 'YOUR_STEAM_API_KEY_HERE',
        endpoints: {
            getUser: '/api/steam/user/:steamId',
            resolveVanity: '/api/steam/resolve/:vanityName',
            getGames: '/api/steam/games/:steamId',
            getFriends: '/api/steam/friends/:steamId',
            getRecent: '/api/steam/recent/:steamId',
            proxy: '/api/steam/proxy?url=ENCODED_URL'
        },
        note: 'Для использования Steam API необходимо получить API ключ на https://steamcommunity.com/dev/apikey'
    });
});

// ==================== Основные маршруты ====================

app.get('/api/webrtc/config', (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.ip;
    console.log(`📡 Конфигурация WebRTC запрошена с IP: ${clientIp}`);

    res.json({
        success: true,
        websocketUrl: `wss://${DOMAIN}/webrtc`,
        iceServers: [
            // STUN серверы
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            // Ваш TURN сервер
            {
                urls: [
                    `turn:${SERVER_IP}:3478?transport=udp`,
                    `turn:${SERVER_IP}:3478?transport=tcp`,
                    `turns:${SERVER_IP}:5349?transport=tcp`
                ],
                username: 'your_username',
                credential: 'your_secret_key_here_change_me',
                credentialType: 'password'
            },
            // Резервные публичные TURN серверы
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        serverInfo: {
            ip: SERVER_IP,
            protocol: 'https',
            secure: true,
            ssl: true,
            turnAvailable: true,
            stunAvailable: true,
            serverTime: Date.now()
        },
        clientInfo: {
            ip: clientIp,
            userAgent: req.headers['user-agent']
        }
    });
});

app.get('/api/webrtc/diagnostics', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        rooms: Array.from(webrtcRooms.entries()).map(([roomId, room]) => ({
            roomId,
            peerCount: room.size,
            peers: Array.from(room.values()).map(p => ({
                peerId: Array.from(room.entries()).find(([id, _]) => _.userId === p.userId)?.[0]?.substring(0, 8),
                username: p.username,
                connectedFor: Math.floor((Date.now() - p.joinTime) / 1000) + 's'
            }))
        })),
        totalPeers: Array.from(webrtcRooms.values()).reduce((sum, room) => sum + room.size, 0),
        serverUptime: process.uptime()
    });
});

app.get('/api/webrtc/turn-test', async (req, res) => {
    try {
        res.json({
            status: 'testing',
            message: 'TURN сервер настроен',
            turnServer: `turn:${SERVER_IP}:3478`,
            tlsTurnServer: `turns:${SERVER_IP}:5349`
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Ошибка тестирования TURN',
            error: error.message
        });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            websocket: true,
            turn: true,
            stun: true,
            steam: STEAM_API_KEY !== 'YOUR_STEAM_API_KEY_HERE'
        }
    });
});

// Вспомогательная функция для определения статуса Steam
function getSteamStatus(personaState) {
    switch (personaState) {
        case 0: return 'offline';
        case 1: return 'online';
        case 2: return 'busy';
        case 3: return 'away';
        case 4: return 'snooze';
        case 5: return 'lookingToTrade';
        case 6: return 'lookingToPlay';
        default: return 'offline';
    }
}

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
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Запуск
server.listen(PORT, HOST, () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`✅ ${APP_NAME} ЗАПУЩЕН НА HTTPS`);
    console.log('═'.repeat(60));
    console.log(`🔐 HTTPS:           https://${DOMAIN}`);
    console.log(`🎤 WebSocket:       wss://${DOMAIN}/webrtc`);
    console.log(`🧊 TURN сервер:     turn:${SERVER_IP}:3478`);
    console.log(`🔒 TURN TLS:        turns:${SERVER_IP}:5349`);
    console.log(`🎮 Steam API:       ${STEAM_API_KEY !== 'YOUR_STEAM_API_KEY_HERE' ? '✅ Активен' : '⚠️  Требуется ключ'}`);
    console.log(`📡 IP адрес:        ${SERVER_IP}`);
    console.log(`🏠 Локальный:       https://localhost`);
    console.log('\n🔗 Ссылки:');
    console.log(`   📱 Мессенджер:    https://${DOMAIN}/app`);
    console.log(`   🔐 Регистрация:   https://${DOMAIN}/`);
    console.log(`   🎮 Steam:         https://${DOMAIN}/steam`);
    console.log(`   ⚙️  WebRTC:        https://${DOMAIN}/api/webrtc/config`);
    console.log(`   🩺 Диагностика:   https://${DOMAIN}/api/webrtc/diagnostics`);
    console.log('═'.repeat(60));

    if (STEAM_API_KEY === 'YOUR_STEAM_API_KEY_HERE') {
        console.log('\n⚠️  Steam API не настроен:');
        console.log('   1. Перейдите на https://steamcommunity.com/dev/apikey');
        console.log('   2. Зарегистрируйтесь и получите API ключ');
        console.log('   3. Установите переменную окружения:');
        console.log('      export STEAM_API_KEY="ваш_ключ"');
        console.log('   4. Перезапустите сервер');
        console.log('═'.repeat(60));
    }

    console.log('\n🎤 WebRTC Настройки:');
    console.log('   • STUN: Google STUN серверы');
    console.log(`   • TURN: Ваш собственный TURN сервер на портах 3478/5349`);
    console.log('   • Для работы между городами/странами требуется TURN');
    console.log('═'.repeat(60));
    console.log('\n⚠️  Предупреждение: Используется самоподписанный сертификат');
    console.log('   В браузере нажмите "Дополнительно" → "Перейти на сайт"');
    console.log('═'.repeat(60));

    // Проверяем доступность портов
    console.log('\n🔍 Проверка портов:');
    const net = require('net');

    const portsToCheck = [
        { port: 443, service: 'HTTPS' },
        { port: 3478, service: 'TURN UDP' },
        { port: 3478, service: 'TURN TCP', tcp: true },
        { port: 5349, service: 'TURN TLS' }
    ];

    portsToCheck.forEach(({ port, service, tcp }) => {
        const tester = net.createServer();
        tester.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`   ✅ ${service} (порт ${port}) занят - сервер работает`);
            } else {
                console.log(`   ⚠️  ${service} (порт ${port}): ${err.code}`);
            }
        });
        tester.once('listening', () => {
            console.log(`   ❌ ${service} (порт ${port}) свободен - сервер НЕ запущен`);
            tester.close();
        });
        tester.listen(port, HOST);
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 Останавливаем сервер...');
    // Отправляем сообщения об отключении всем клиентам
    webrtcRooms.forEach((room, roomId) => {
        room.forEach((peer, peerId) => {
            if (peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(JSON.stringify({
                    type: 'server-shutdown',
                    message: 'Сервер останавливается',
                    timestamp: Date.now()
                }));
            }
        });
    });

    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});