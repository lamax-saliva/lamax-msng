#!/usr/bin/env node

// Устанавливаем кодировку для консоли
process.stdout.setEncoding('utf8');

console.log('🚀 Запуск Lamax Messenger с системой регистрации и сохранением сообщений...\n');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SERVER_IP = process.env.SERVER_IP || '193.233.86.5';

const app = express();
const server = http.createServer(app);

// Настройка Socket.IO с CORS
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Импортируем менеджеры
const AuthManager = require('./modules/authmodul');
const SessionManager = require('./modules/sessions.js');
const RoomManager = require('./modules/rooms.js');

// Инициализируем менеджеры
const authManager = new AuthManager();
const sessionManager = new SessionManager();
const roomManager = new RoomManager();

// Инициализируем комнаты
const { initializeRooms } = require('./modules/rooms.js');
initializeRooms(roomManager);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    console.log('[' + timestamp + '] ' + req.method + ' ' + req.url);
    next();
});

// Импортируем маршруты
require('./routes/auth.js')(app, authManager, sessionManager);
require('./routes/api.js')(app, authManager, roomManager);
require('./routes/static.js')(app);

// Импортируем WebSocket обработчики
require('./sockets/main.js')(io, authManager, sessionManager, roomManager);

// Проверяем и устанавливаем зависимости
function installBcrypt() {
    try {
        require.resolve('bcryptjs');
    } catch (err) {
        console.log('📦 Установка bcryptjs...');
        const { execSync } = require('child_process');
        try {
            execSync('npm install bcryptjs', { stdio: 'inherit', encoding: 'utf8' });
            console.log('✅ bcryptjs установлен');
        } catch (err) {
            console.error('❌ Ошибка установки bcryptjs:', err.message);
            console.log('Установите вручную: npm install bcryptjs');
        }
    }
}

// Запускаем сервер
function startServer() {
    installBcrypt();

    server.listen(PORT, HOST, () => {
        const localUrl = 'http://localhost:' + PORT;
        const serverUrl = 'http://' + SERVER_IP + ':' + PORT;

        console.log('\n' + '═'.repeat(60));
        console.log('✅ LAMAX MESSENGER С АУТЕНТИФИКАЦИЕЙ ЗАПУЩЕН');
        console.log('═'.repeat(60));
        console.log('🌐 Локальный адрес:  ' + localUrl);
        console.log('🌐 Ваш IP адрес:     ' + serverUrl);
        console.log('─'.repeat(60));
        console.log('🔐 Регистрация/Вход: ' + serverUrl + '/');
        console.log('🚀 Мессенджер:       ' + serverUrl + '/app');
        console.log('📊 Статистика:       ' + serverUrl + '/api/stats');
        console.log('─'.repeat(60));
        console.log('👤 Тестовый аккаунт:');
        console.log('   Email: test@example.com');
        console.log('   Пароль: 123456');
        console.log('─'.repeat(60));
        console.log('🕒 Время запуска:    ' + new Date().toLocaleString('ru-RU'));
        console.log('🎮 Готов к работе!');
        console.log('═'.repeat(60));
        console.log('\n📝 Используйте Ctrl+C для остановки\n');
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error('❌ Порт ' + PORT + ' уже занят!');
            console.log('Попробуйте: PORT=3001 node server.js');
            process.exit(1);
        } else {
            console.error('❌ Ошибка: ' + error.message);
            process.exit(1);
        }
    });

    process.on('SIGINT', () => {
        console.log('\n🛑 Завершение работы...');
        io.disconnectSockets();
        server.close(() => {
            console.log('✅ Сервер остановлен');
            process.exit(0);
        });
    });
}

// Запускаем сервер
startServer();