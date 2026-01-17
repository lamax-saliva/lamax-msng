const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class AuthManager {
    constructor() {
        this.userDatabase = new Map();
        this.DATA_DIR = path.join(__dirname, '../data');
        this.USERS_FILE = path.join(this.DATA_DIR, 'users.json');
        this.loadUsersFromFile();
        this.setupAutoSave();
    }

    async loadUsersFromFile() {
        try {
            await fs.mkdir(this.DATA_DIR, { recursive: true });
            const data = await fs.readFile(this.USERS_FILE, 'utf8');
            const usersData = JSON.parse(data);

            Object.keys(usersData).forEach(email => {
                const user = usersData[email];
                // Конвертируем строки дат обратно в объекты Date
                user.created = new Date(user.created);
                user.lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
                this.userDatabase.set(email, user);
            });

            console.log(`📂 Загружены ${this.userDatabase.size} пользователей`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Ошибка загрузки пользователей:', error);
            } else {
                console.log('📂 Файл пользователей не найден, создаем новый');
            }
        }
    }

    async saveUsersToFile() {
        try {
            const usersData = {};
            this.userDatabase.forEach((user, email) => {
                usersData[email] = {
                    ...user,
                    created: user.created.toISOString(),
                    lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null
                };
            });
            await fs.writeFile(this.USERS_FILE, JSON.stringify(usersData, null, 2));
            console.log('💾 Пользователи сохранены на диск');
        } catch (error) {
            console.error('❌ Ошибка сохранения пользователей:', error);
        }
    }

    setupAutoSave() {
        // Автосохранение каждые 5 минут
        setInterval(() => {
            this.saveUsersToFile().catch(console.error);
        }, 5 * 60 * 1000);
    }

    async register(email, username, password) {
        // Проверка данных
        if (!email || !username || !password) {
            throw new Error('Все поля обязательны для заполнения');
        }

        if (!this.isValidEmail(email)) {
            throw new Error('Неверный формат email');
        }

        if (username.length < 3 || username.length > 20) {
            throw new Error('Имя пользователя должно быть от 3 до 20 символов');
        }

        if (password.length < 6) {
            throw new Error('Пароль должен содержать минимум 6 символов');
        }

        // Проверка существования пользователя
        if (this.userDatabase.has(email.toLowerCase())) {
            throw new Error('Пользователь с таким email уже существует');
        }

        // Хеширование пароля
        const passwordHash = await bcrypt.hash(password, 10);

        // Создание пользователя
        const userId = uuidv4();
        const user = {
            id: userId,
            email: email.toLowerCase(),
            username: username.trim(),
            passwordHash,
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + email,
            created: new Date(),
            lastLogin: new Date(),
            status: 'offline'
        };

        this.userDatabase.set(email.toLowerCase(), user);
        console.log('✅ Зарегистрирован новый пользователь: ' + username + ' (' + email + ')');

        // Сохраняем на диск
        await this.saveUsersToFile();

        // Удаляем пароль из ответа
        const userResponse = { ...user };
        delete userResponse.passwordHash;

        return userResponse;
    }

    async login(email, password) {
        if (!email || !password) {
            throw new Error('Email и пароль обязательны');
        }

        const user = this.userDatabase.get(email.toLowerCase());
        if (!user) {
            throw new Error('Неверный email или пароль');
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            throw new Error('Неверный email или пароль');
        }

        // Обновляем время последнего входа
        user.lastLogin = new Date();

        // Сохраняем на диск
        await this.saveUsersToFile();

        // Удаляем пароль из ответа
        const userResponse = { ...user };
        delete userResponse.passwordHash;

        console.log('✅ Пользователь вошел в систему: ' + user.username + ' (' + email + ')');

        return userResponse;
    }

    getUserById(userId) {
        return Array.from(this.userDatabase.values()).find(u => u.id === userId);
    }

    getUserByEmail(email) {
        return this.userDatabase.get(email.toLowerCase());
    }

    getAllUsers() {
        return Array.from(this.userDatabase.values());
    }

    updateUserStatus(userId, status) {
        const user = this.getUserById(userId);
        if (user) {
            user.status = status;
        }
    }

    getStats() {
        return {
            total_users: this.userDatabase.size
        };
    }

    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email.toLowerCase());
    }
}

module.exports = AuthManager;