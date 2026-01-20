const express = require('express');
const router = express.Router();
const axios = require('axios');

// Ваш Steam API ключ (получите на https://steamcommunity.com/dev/apikey)
const STEAM_API_KEY = '749DC4FE0D5700FE242C991311D0CF10';

// Прокси для запросов к Steam API (обход CORS)
router.get('/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).json({ error: 'URL не указан' });
        }

        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Steam-Integration/1.0'
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Steam API proxy error:', error.message);
        res.status(500).json({ error: 'Ошибка получения данных Steam' });
    }
});

// Callback для Steam OpenID
router.get('/callback', async (req, res) => {
    try {
        // Проверяем аутентификацию Steam
        const params = new URLSearchParams({
            'openid.ns': 'http://specs.openid.net/auth/2.0',
            'openid.mode': 'check_authentication',
            ...req.query
        });

        const response = await axios.post(
            'https://steamcommunity.com/openid/login',
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        if (response.data.includes('is_valid:true')) {
            // Извлекаем Steam ID из claimed_id
            const claimedId = req.query['openid.claimed_id'];
            const steamIdMatch = claimedId.match(/\/id\/(\d+)$/);

            if (steamIdMatch) {
                const steamId = steamIdMatch[1];

                // Получаем информацию о пользователе
                const userResponse = await axios.get(
                    `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`
                );

                const player = userResponse.data.response.players[0];

                // Создаем сессию или токен
                // Здесь можно создать JWT или сохранить в сессии

                // Перенаправляем обратно на клиент с данными
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Steam Login Success</title>
                        <script>
                            // Передаем данные родительскому окну
                            window.opener.postMessage({
                                type: 'steam-login-success',
                                steamId: '${steamId}',
                                userData: ${JSON.stringify(player)}
                            }, '*');
                            window.close();
                        </script>
                    </head>
                    <body>
                        <p>Вы успешно вошли через Steam. Закройте это окно.</p>
                    </body>
                    </html>
                `);
                return;
            }
        }

        res.status(400).send('Ошибка аутентификации Steam');
    } catch (error) {
        console.error('Steam callback error:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// Получение данных пользователя
router.get('/user/:steamId', async (req, res) => {
    try {
        const { steamId } = req.params;

        const [playerResponse, friendsResponse] = await Promise.all([
            axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`),
            axios.get(`http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&relationship=friend`)
        ]);

        res.json({
            player: playerResponse.data.response.players[0],
            friends: friendsResponse.data.friendslist?.friends || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получение списка игр
router.get('/games/:steamId', async (req, res) => {
    try {
        const { steamId } = req.params;

        const response = await axios.get(
            `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`
        );

        res.json(response.data.response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;