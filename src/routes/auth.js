const fs = require('fs');
const path = require('path');

module.exports = function(app, authManager, sessionManager) {
    // Главная страница с регистрацией/входом
    app.get('/', (req, res) => {
        const indexHtml = fs.readFileSync(
            path.join(__dirname, '../views/index.html'),
            'utf8'
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(indexHtml);
    });

    // Интерфейс мессенджера
    app.get('/app', (req, res) => {
        const appHtml = fs.readFileSync(
            path.join(__dirname, '../views/app.html'),
            'utf8'
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(appHtml);
    });

    // Регистрация пользователя
    app.post('/api/auth/register', async (req, res) => {
        try {
            const { email, username, password } = req.body;
            const user = await authManager.register(email, username, password);
            const sessionId = sessionManager.createSession(user.id);

            res.json({
                success: true,
                message: 'Регистрация успешна',
                sessionId,
                user
            });
        } catch (error) {
            console.error('Ошибка регистрации:', error.message);
            res.json({
                success: false,
                message: error.message
            });
        }
    });

    // Вход пользователя
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await authManager.login(email, password);
            const sessionId = sessionManager.createSession(user.id);

            res.json({
                success: true,
                message: 'Вход выполнен успешно',
                sessionId,
                user
            });
        } catch (error) {
            console.error('Ошибка входа:', error.message);
            res.json({
                success: false,
                message: error.message
            });
        }
    });

    // Проверка сессии
    app.post('/api/auth/verify', (req, res) => {
        const { sessionId } = req.body;

        if (!sessionId || !sessionManager.verifySession(sessionId)) {
            return res.json({ valid: false });
        }

        const userId = sessionManager.getSessionUserId(sessionId);
        const user = authManager.getUserById(userId);

        if (!user) {
            sessionManager.deleteSession(sessionId);
            return res.json({ valid: false });
        }

        // Удаляем пароль из ответа
        const userResponse = { ...user };
        delete userResponse.passwordHash;

        res.json({
            valid: true,
            user: userResponse
        });
    });

    // Выход из системы
    app.post('/api/auth/logout', (req, res) => {
        const { sessionId } = req.body;

        if (sessionId) {
            sessionManager.deleteSession(sessionId);
            console.log('👋 Сессия завершена');
        }

        res.json({ success: true });
    });
};