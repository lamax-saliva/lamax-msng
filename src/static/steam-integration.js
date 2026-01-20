class SteamIntegration {
    constructor() {
        this.steamApiKey = '749DC4FE0D5700FE242C991311D0CF10';
        this.steamId = null;
        this.userData = null;
        this.friends = [];
        this.games = [];
        this.recentGames = [];
        this.voiceChat = null;
        this.isAuthenticated = false;

        // Конфигурация API
        this.apiEndpoints = {
            playerSummaries: 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
            friendList: 'http://api.steampowered.com/ISteamUser/GetFriendList/v0001/',
            ownedGames: 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/',
            recentlyPlayed: 'http://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/',
            playerAchievements: 'http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/',
            userStatsForGame: 'http://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/',
            playerBans: 'http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/',
            resolveVanityURL: 'http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/'
        };

        console.log('🎮 Steam Integration инициализирована');
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.setupEventListeners();

        if (this.steamId) {
            this.authenticate(this.steamId);
        }
    }

    loadFromStorage() {
        const savedSteamId = localStorage.getItem('steamId');
        const savedUserData = localStorage.getItem('steamUserData');

        if (savedSteamId) {
            this.steamId = savedSteamId;
        }

        if (savedUserData) {
            try {
                this.userData = JSON.parse(savedUserData);
                this.isAuthenticated = true;
            } catch (e) {
                console.error('Ошибка загрузки данных пользователя:', e);
            }
        }
    }

    saveToStorage() {
        if (this.steamId) {
            localStorage.setItem('steamId', this.steamId);
        }

        if (this.userData) {
            localStorage.setItem('steamUserData', JSON.stringify(this.userData));
        }
    }

    setupEventListeners() {
        console.log('Настройка обработчиков Steam...');

        // Steam в сайдбаре (иконка gamepad) - ГЛАВНЫЙ ОБРАБОТЧИК
        document.getElementById('steamSidebarBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Клик по Steam в сайдбаре');
            this.showSteamUI();
        });

        // Закрытие Steam UI
        document.getElementById('steamClose')?.addEventListener('click', () => {
            this.hideSteamUI();
        });

        // Кнопка обновления
        document.getElementById('steamRefresh')?.addEventListener('click', () => {
            if (this.isAuthenticated && this.steamId) {
                this.loadSteamData(this.steamId);
            }
        });

        // Вход через кнопку
        document.getElementById('steamLoginBtn')?.addEventListener('click', () => {
            this.showLoginModal();
        });

        // Ввод Steam ID вручную
        document.getElementById('steamIdBtn')?.addEventListener('click', () => {
            const steamId = document.getElementById('steamIdInput').value.trim();
            if (this.validateSteamId(steamId)) {
                this.authenticate(steamId);
            }
        });

        // Переключение вкладок
        document.querySelectorAll('.steam-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Поиск друзей
        document.getElementById('friendsSearch')?.addEventListener('input', (e) => {
            this.filterFriends(e.target.value);
        });

        // Поиск игр
        document.getElementById('gamesSearch')?.addEventListener('input', (e) => {
            this.filterGames(e.target.value);
        });

        // Модальное окно входа
        document.getElementById('closeModal')?.addEventListener('click', () => {
            this.hideLoginModal();
        });

        // API логин через модалку
        document.getElementById('steamApiLogin')?.addEventListener('click', () => {
            this.steamApiLogin();
        });

        // Steam ID через модалку
        document.getElementById('modalSteamIdBtn')?.addEventListener('click', () => {
            const steamId = document.getElementById('modalSteamId').value.trim();
            if (this.validateSteamId(steamId)) {
                this.authenticate(steamId);
                this.hideLoginModal();
            }
        });

        // Никнейм через модалку
        document.getElementById('modalSteamNameBtn')?.addEventListener('click', () => {
            const username = document.getElementById('modalSteamName').value.trim();
            if (username) {
                this.resolveVanityURL(username);
            }
        });

        // Enter для ввода
        document.getElementById('steamIdInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('steamIdBtn').click();
            }
        });

        document.getElementById('modalSteamId')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('modalSteamIdBtn').click();
            }
        });

        document.getElementById('modalSteamName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('modalSteamNameBtn').click();
            }
        });

        // Голосовой чат
        document.getElementById('steamMuteToggle')?.addEventListener('click', () => {
            if (this.voiceChat) {
                this.voiceChat.toggleMute();
            } else {
                this.startVoiceChat();
            }
        });

        document.getElementById('steamDisconnect')?.addEventListener('click', () => {
            if (this.voiceChat) {
                this.voiceChat.disconnect();
                this.voiceChat = null;
                this.updateVoiceUI();
            }
        });

        document.getElementById('steamInvite')?.addEventListener('click', () => {
            this.showInviteDialog();
        });

        // Сворачивание голосовой панели
        document.getElementById('voiceToggle')?.addEventListener('click', () => {
            const content = document.getElementById('voiceContent');
            const icon = document.getElementById('voiceToggle').querySelector('i');

            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.className = 'fas fa-chevron-down';
            } else {
                content.style.display = 'none';
                icon.className = 'fas fa-chevron-up';
            }
        });
    }

    validateSteamId(steamId) {
        if (!steamId) {
            this.showNotification('Введите Steam ID', 'error');
            return false;
        }

        // Steam ID должен быть числом и иметь длину 17 цифр
        if (!/^\d{17}$/.test(steamId)) {
            this.showNotification('Некорректный Steam ID. Steam ID должен состоять из 17 цифр', 'error');
            return false;
        }

        return true;
    }

    async authenticate(steamId) {
        this.showLoading(true, 'Авторизация...');

        try {
            this.steamId = steamId;
            await this.loadSteamData(steamId);
            this.isAuthenticated = true;
            this.saveToStorage();

            this.showNotification('✅ Успешный вход через Steam', 'success');
            this.updateLoginUI();

        } catch (error) {
            console.error('Ошибка авторизации Steam:', error);
            this.showNotification('❌ Ошибка авторизации: ' + error.message, 'error');
            this.isAuthenticated = false;
        } finally {
            this.showLoading(false);
        }
    }

    async loadSteamData(steamId) {
        try {
            // Загружаем данные пользователя
            this.userData = await this.getPlayerSummaries(steamId);
            this.updateUserUI();

            // Загружаем друзей
            this.friends = await this.getFriendList(steamId);
            this.renderFriends();

            // Загружаем игры
            this.games = await this.getOwnedGames(steamId);
            this.renderGames();

            // Загружаем недавние игры
            this.recentGames = await this.getRecentlyPlayedGames(steamId);
            this.renderRecentGames();

            // Загружаем статистику
            await this.loadUserStats();

            // Обновляем бейдж в сайдбаре
            this.updateSidebarBadge();

        } catch (error) {
            throw new Error('Не удалось загрузить данные Steam: ' + error.message);
        }
    }

    updateSidebarBadge() {
        if (!this.isAuthenticated || this.friends.length === 0) return;

        const onlineFriends = this.friends.filter(f => f.status === 'online' || f.status === 'ingame').length;
        const badge = document.getElementById('steamOnlineCount');

        if (badge) {
            badge.textContent = onlineFriends;
            badge.style.display = onlineFriends > 0 ? 'flex' : 'none';

            // Анимация для новых уведомлений
            if (onlineFriends > 0) {
                badge.style.animation = 'pulse 2s infinite';
            }
        }
    }

    async getPlayerSummaries(steamId) {
        const url = `${this.apiEndpoints.playerSummaries}?key=${this.steamApiKey}&steamids=${steamId}`;

        const response = await fetch(`/api/steam/proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error('Ошибка получения данных пользователя');
        }

        const data = await response.json();
        const player = data.response.players[0];

        if (!player) {
            throw new Error('Пользователь не найден');
        }

        return {
            steamId: player.steamid,
            username: player.personaname,
            avatar: player.avatarfull,
            profileUrl: player.profileurl,
            status: this.getPlayerStatus(player.personastate, player.gameextrainfo),
            lastLogoff: player.lastlogoff,
            createdAt: player.timecreated,
            countryCode: player.loccountrycode
        };
    }

    async getFriendList(steamId) {
        const url = `${this.apiEndpoints.friendList}?key=${this.steamApiKey}&steamid=${steamId}&relationship=friend`;

        const response = await fetch(`/api/steam/proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error('Ошибка получения списка друзей');
        }

        const data = await response.json();
        const friendsList = data.friendslist?.friends || [];

        if (friendsList.length === 0) {
            return [];
        }

        // Получаем данные для каждого друга
        const friendIds = friendsList.map(friend => friend.steamid).join(',');
        const summariesUrl = `${this.apiEndpoints.playerSummaries}?key=${this.steamApiKey}&steamids=${friendIds}`;

        const summariesResponse = await fetch(`/api/steam/proxy?url=${encodeURIComponent(summariesUrl)}`);
        const summariesData = await summariesResponse.json();

        // Сопоставляем данные
        return friendsList.map(friend => {
            const summary = summariesData.response.players.find(p => p.steamid === friend.steamid);
            return {
                steamId: friend.steamid,
                friendSince: friend.friend_since,
                username: summary?.personaname || 'Unknown',
                avatar: summary?.avatarfull || 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb.jpg',
                status: this.getPlayerStatus(summary?.personastate, summary?.gameextrainfo),
                gameInfo: summary?.gameextrainfo || null,
                gameId: summary?.gameid || null,
                lastLogoff: summary?.lastlogoff || 0
            };
        });
    }

    async getOwnedGames(steamId) {
        const url = `${this.apiEndpoints.ownedGames}?key=${this.steamApiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;

        const response = await fetch(`/api/steam/proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error('Ошибка получения списка игр');
        }

        const data = await response.json();
        const games = data.response?.games || [];

        return games.map(game => ({
            appId: game.appid,
            name: game.name,
            playtime: Math.round(game.playtime_forever / 60), // В часах
            playtime2weeks: Math.round(game.playtime_2weeks / 60),
            imgIconUrl: `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
            imgLogoUrl: `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
            hasCommunityVisibleStats: game.has_community_visible_stats
        }));
    }

    async getRecentlyPlayedGames(steamId) {
        const url = `${this.apiEndpoints.recentlyPlayed}?key=${this.steamApiKey}&steamid=${steamId}`;

        const response = await fetch(`/api/steam/proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            return []; // Не критичная ошибка
        }

        const data = await response.json();
        return data.response?.games || [];
    }

    async resolveVanityURL(vanityName) {
        const url = `${this.apiEndpoints.resolveVanityURL}?key=${this.steamApiKey}&vanityurl=${vanityName}`;

        const response = await fetch(`/api/steam/proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            this.showNotification('Ошибка поиска пользователя', 'error');
            return;
        }

        const data = await response.json();

        if (data.response?.steamid) {
            this.authenticate(data.response.steamid);
            this.hideLoginModal();
        } else {
            this.showNotification('Пользователь не найден', 'error');
        }
    }

    async loadUserStats() {
        if (!this.steamId) return;

        // Подсчитываем общую статистику
        const totalPlaytime = this.games.reduce((sum, game) => sum + game.playtime, 0);
        const totalGames = this.games.length;

        // Обновляем UI статистики
        document.getElementById('totalPlaytime').textContent = `${totalPlaytime} ч`;
        document.getElementById('totalGames').textContent = totalGames;

        if (this.userData?.createdAt) {
            const joinDate = new Date(this.userData.createdAt * 1000);
            document.getElementById('memberSince').textContent = joinDate.getFullYear();
        }

        // Обновляем бейджи
        const onlineFriends = this.friends.filter(f => f.status === 'online' || f.status === 'ingame').length;
        document.getElementById('onlineCount').textContent = onlineFriends;
        document.getElementById('gamesCount').textContent = totalGames;

        // TODO: Загрузить достижения
        // document.getElementById('achievementsCount').textContent = '0';
    }

    getPlayerStatus(personaState, gameExtraInfo) {
        if (gameExtraInfo) {
            return 'ingame';
        }

        switch (personaState) {
            case 1: return 'online';
            case 2: return 'busy';
            case 3: return 'away';
            case 4: return 'snooze';
            case 5: return 'lookingToTrade';
            case 6: return 'lookingToPlay';
            default: return 'offline';
        }
    }

    renderFriends() {
        const friendsList = document.getElementById('friendsList');
        if (!friendsList) return;

        const onlineFriends = this.friends.filter(f => f.status === 'online' || f.status === 'ingame');
        const offlineFriends = this.friends.filter(f => f.status === 'offline');

        // Обновляем бейдж в сайдбаре
        this.updateSidebarBadge();

        if (onlineFriends.length === 0 && offlineFriends.length === 0) {
            friendsList.innerHTML = `
                <div class="steam-empty-state">
                    <div class="steam-empty-icon">
                        <i class="fas fa-users-slash"></i>
                    </div>
                    <h4>Нет друзей в списке</h4>
                    <p>Добавьте друзей в Steam, чтобы они появились здесь</p>
                </div>
            `;
            return;
        }

        let html = '';

        // Онлайн друзья
        onlineFriends.forEach(friend => {
            html += this.createFriendCard(friend);
        });

        // Оффлайн друзья (свернуты по умолчанию)
        if (offlineFriends.length > 0) {
            html += `
                <div class="friends-offline-header">
                    <h4>Друзья оффлайн (${offlineFriends.length})</h4>
                    <button class="steam-btn-toggle" id="toggleOffline">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="friends-offline-list" id="offlineFriendsList" style="display: none;">
            `;

            offlineFriends.forEach(friend => {
                html += this.createFriendCard(friend);
            });

            html += '</div>';
        }

        friendsList.innerHTML = html;

        // Добавляем обработчики для оффлайн друзей
        if (offlineFriends.length > 0) {
            document.getElementById('toggleOffline').addEventListener('click', (e) => {
                const list = document.getElementById('offlineFriendsList');
                const icon = e.currentTarget.querySelector('i');

                if (list.style.display === 'none') {
                    list.style.display = 'block';
                    icon.className = 'fas fa-chevron-up';
                } else {
                    list.style.display = 'none';
                    icon.className = 'fas fa-chevron-down';
                }
            });
        }

        // Добавляем обработчики для кнопок действий
        document.querySelectorAll('.friend-invite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const steamId = e.currentTarget.dataset.steamid;
                const friend = this.friends.find(f => f.steamId === steamId);
                if (friend) {
                    this.sendVoiceInvite(friend);
                }
            });
        });

        document.querySelectorAll('.friend-profile-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const steamId = e.currentTarget.dataset.steamid;
                window.open(`https://steamcommunity.com/profiles/${steamId}`, '_blank');
            });
        });

        document.querySelectorAll('.friend-message-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const steamId = e.currentTarget.dataset.steamid;
                window.open(`https://steamcommunity.com/chat/`, '_blank');
            });
        });
    }

    createFriendCard(friend) {
        const statusClass = friend.status === 'ingame' ? 'ingame' :
            friend.status === 'online' ? 'online' : 'offline';
        const statusText = friend.status === 'ingame' ? 'В игре' :
            friend.status === 'online' ? 'Онлайн' : 'Оффлайн';
        const statusIcon = friend.status === 'ingame' ? 'fa-gamepad' :
            friend.status === 'online' ? 'fa-circle' : 'fa-circle';

        const gameInfo = friend.gameInfo ? `
            <div class="friend-game">
                <div class="friend-game-icon">
                    <img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${friend.gameId}/header.jpg" 
                         alt="${friend.gameInfo}">
                </div>
                <div class="friend-game-info">
                    <div class="friend-game-name">${friend.gameInfo}</div>
                    <div class="friend-game-time">В игре сейчас</div>
                </div>
            </div>
        ` : '';

        return `
            <div class="friend-card">
                <div class="friend-avatar">
                    <img src="${friend.avatar}" alt="${friend.username}">
                    <div class="friend-status ${statusClass}"></div>
                </div>
                <div class="friend-info">
                    <div class="friend-name">
                        ${friend.username}
                        <span class="friend-status-text ${statusClass}">
                            <i class="fas ${statusIcon}"></i> ${statusText}
                        </span>
                    </div>
                    ${gameInfo}
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn friend-invite-btn" 
                            data-steamid="${friend.steamId}"
                            title="Пригласить в голосовой чат">
                        <i class="fas fa-phone-alt"></i>
                    </button>
                    <button class="friend-action-btn friend-profile-btn" 
                            data-steamid="${friend.steamId}"
                            title="Профиль Steam">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                    <button class="friend-action-btn friend-message-btn" 
                            data-steamid="${friend.steamId}"
                            title="Написать сообщение">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderGames() {
        const gamesGrid = document.getElementById('gamesGrid');
        if (!gamesGrid) return;

        if (this.games.length === 0) {
            gamesGrid.innerHTML = `
                <div class="steam-empty-state">
                    <div class="steam-empty-icon">
                        <i class="fas fa-gamepad"></i>
                    </div>
                    <h4>Нет игр в библиотеке</h4>
                    <p>Игры из вашей Steam библиотеки появятся здесь</p>
                </div>
            `;
            return;
        }

        // Сортируем по времени игры (самые сыгранные сначала)
        const sortedGames = [...this.games].sort((a, b) => b.playtime - a.playtime);

        let html = '';
        sortedGames.slice(0, 50).forEach(game => { // Показываем только первые 50 игр
            html += this.createGameCard(game);
        });

        gamesGrid.innerHTML = html;

        // Добавляем обработчики для кнопок игр
        document.querySelectorAll('.game-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const appId = e.currentTarget.dataset.appid;
                this.launchGame(appId);
            });
        });

        document.querySelectorAll('.game-achievements-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const appId = e.currentTarget.dataset.appid;
                this.showGameAchievements(appId);
            });
        });
    }

    createGameCard(game) {
        const playtime = game.playtime > 0 ? `${game.playtime} ч` : 'Не играл';

        return `
            <div class="game-card">
                <div class="game-cover">
                    <img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg" 
                         alt="${game.name}">
                    <div class="game-playtime">${playtime}</div>
                </div>
                <div class="game-info">
                    <div class="game-title" title="${game.name}">${game.name}</div>
                    <div class="game-actions">
                        <button class="game-action-btn game-play-btn" 
                                data-appid="${game.appId}"
                                title="Запустить игру">
                            <i class="fas fa-play"></i> Играть
                        </button>
                        <button class="game-action-btn game-achievements-btn" 
                                data-appid="${game.appId}"
                                title="Достижения">
                            <i class="fas fa-trophy"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentGames() {
        const recentGames = document.getElementById('recentGames');
        if (!recentGames) return;

        if (this.recentGames.length === 0) {
            recentGames.innerHTML = `
                <div class="steam-empty-state">
                    <div class="steam-empty-icon">
                        <i class="fas fa-history"></i>
                    </div>
                    <h4>Нет недавних игр</h4>
                    <p>Недавно сыгранные игры появятся здесь</p>
                </div>
            `;
            return;
        }

        let html = '<div class="recent-games-list">';

        this.recentGames.forEach(game => {
            const playtime = Math.round(game.playtime_2weeks / 60);

            html += `
                <div class="recent-game-card">
                    <div class="recent-game-cover">
                        <img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg" 
                             alt="${game.name}">
                    </div>
                    <div class="recent-game-info">
                        <h5>${game.name}</h5>
                        <div class="recent-game-stats">
                            <span><i class="fas fa-clock"></i> ${playtime} ч за 2 недели</span>
                            <span><i class="fas fa-calendar"></i> ${this.formatLastPlayed(game.rtime_last_played)}</span>
                        </div>
                        <button class="steam-btn-small" data-appid="${game.appid}">
                            <i class="fas fa-play"></i> Играть
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        recentGames.innerHTML = html;
    }

    filterFriends(query) {
        const friendCards = document.querySelectorAll('.friend-card');
        const queryLower = query.toLowerCase();

        friendCards.forEach(card => {
            const name = card.querySelector('.friend-name').textContent.toLowerCase();
            const game = card.querySelector('.friend-game-name')?.textContent.toLowerCase() || '';

            if (name.includes(queryLower) || game.includes(queryLower)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }

    filterGames(query) {
        const gameCards = document.querySelectorAll('.game-card');
        const queryLower = query.toLowerCase();

        gameCards.forEach(card => {
            const title = card.querySelector('.game-title').textContent.toLowerCase();

            if (title.includes(queryLower)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    switchTab(tabName) {
        // Убираем активный класс со всех кнопок и вкладок
        document.querySelectorAll('.steam-nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelectorAll('.steam-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Добавляем активный класс выбранной кнопке и вкладке
        document.querySelector(`.steam-nav-btn[data-tab="${tabName}"]`)?.classList.add('active');
        document.getElementById(`${tabName}Tab`)?.classList.add('active');
    }

    updateUserUI() {
        if (!this.userData) return;

        const userInfo = document.getElementById('steamUserInfo');
        const avatar = document.getElementById('steamAvatar');
        const username = document.getElementById('steamUsername');
        const status = document.getElementById('steamStatus');

        if (userInfo && avatar && username && status) {
            avatar.src = this.userData.avatar;
            username.textContent = this.userData.username;

            status.className = 'steam-user-status';
            status.classList.add(this.userData.status);

            // Показываем информацию о пользователе
            document.getElementById('steamLoginPanel').style.display = 'none';
            document.getElementById('steamStatsPanel').style.display = 'block';
        }
    }

    updateLoginUI() {
        if (this.isAuthenticated) {
            document.getElementById('steamLoginPanel').style.display = 'none';
            document.getElementById('steamStatsPanel').style.display = 'block';

            // Показываем бейдж с количеством онлайн друзей
            const onlineFriends = this.friends.filter(f => f.status === 'online' || f.status === 'ingame').length;
            const badge = document.getElementById('steamOnlineCount');
            if (badge) {
                badge.textContent = onlineFriends;
                badge.style.display = onlineFriends > 0 ? 'flex' : 'none';
            }

            // Делаем иконку активной
            const steamIcon = document.getElementById('steamSidebarBtn');
            if (steamIcon) {
                steamIcon.classList.add('active');
            }
        } else {
            document.getElementById('steamLoginPanel').style.display = 'block';
            document.getElementById('steamStatsPanel').style.display = 'none';

            // Скрываем бейдж
            const badge = document.getElementById('steamOnlineCount');
            if (badge) badge.style.display = 'none';

            // Убираем активный класс
            const steamIcon = document.getElementById('steamSidebarBtn');
            if (steamIcon) {
                steamIcon.classList.remove('active');
            }
        }
    }

    updateVoiceUI() {
        const voicePanel = document.getElementById('steamVoicePanel');
        const muteBtn = document.getElementById('steamMuteToggle');

        if (this.voiceChat) {
            voicePanel.style.display = 'block';
            muteBtn.innerHTML = this.voiceChat.isMuted ?
                '<i class="fas fa-microphone-slash"></i>' :
                '<i class="fas fa-microphone"></i>';
        } else {
            voicePanel.style.display = 'none';
        }
    }

    showSteamUI() {
        // Показываем overlay и контейнер
        document.getElementById('steamOverlay').classList.add('active');
        document.getElementById('steamContainer').classList.add('active');
        document.body.style.overflow = 'hidden';

        console.log('Открытие Steam UI');

        if (!this.isAuthenticated) {
            this.showLoginModal();
        }
    }

    hideSteamUI() {
        // Скрываем overlay и контейнер
        document.getElementById('steamOverlay').classList.remove('active');
        document.getElementById('steamContainer').classList.remove('active');
        document.body.style.overflow = '';

        console.log('Закрытие Steam UI');
    }

    showLoginModal() {
        document.getElementById('steamModal').classList.add('active');
        console.log('Открытие модального окна входа');
    }

    hideLoginModal() {
        document.getElementById('steamModal').classList.remove('active');
        console.log('Закрытие модального окна входа');
    }

    showLoading(show, text = 'Загрузка...') {
        const loading = document.getElementById('steamLoading');
        const loadingText = loading.querySelector('.steam-loading-text');

        if (show) {
            loadingText.textContent = text;
            loading.style.display = 'flex';
        } else {
            loading.style.display = 'none';
        }
    }

    showNotification(message, type = 'info') {
        console.log(`[Steam] ${type}: ${message}`);

        // Пробуем использовать систему уведомлений мессенджера
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            // Временное решение - alert
            alert(`Steam: ${message}`);
        }
    }

    formatLastPlayed(timestamp) {
        if (!timestamp) return 'Никогда';

        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Сегодня';
        if (diffDays === 1) return 'Вчера';
        if (diffDays < 7) return `${diffDays} дней назад`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} недель назад`;
        return `${Math.floor(diffDays / 30)} месяцев назад`;
    }

    // Методы для работы с играми

    launchGame(appId) {
        if (!appId) return;

        this.showNotification(`Запуск игры...`, 'info');

        const game = this.games.find(g => g.appId === parseInt(appId));
        if (game) {
            // Попытка запуска через Steam protocol
            window.open(`steam://run/${appId}`, '_blank');
        }
    }

    showGameAchievements(appId) {
        this.showNotification('Достижения будут доступны в следующем обновлении', 'info');
    }

    // Методы для голосового чата

    startVoiceChat() {
        if (!window.VoiceChat) {
            this.showNotification('Голосовой чат недоступен', 'error');
            return;
        }

        if (!this.isAuthenticated) {
            this.showNotification('Войдите в Steam для использования голосового чата', 'warning');
            return;
        }

        this.voiceChat = new window.VoiceChat();

        // Создаем комнату на основе Steam ID
        const roomId = `steam_${this.steamId}`;
        const user = {
            id: this.steamId,
            username: this.userData.username,
            avatar: this.userData.avatar
        };

        this.voiceChat.startVoiceChat(roomId, user).then(success => {
            if (success) {
                this.updateVoiceUI();
                this.showNotification('Голосовой чат запущен', 'success');
            }
        });
    }

    sendVoiceInvite(friend) {
        if (!this.voiceChat) {
            this.showNotification('Сначала запустите голосовой чат', 'warning');
            return;
        }

        this.showNotification(`Приглашение отправлено ${friend.username}`, 'info');

        // Имитация получения приглашения (для демо)
        setTimeout(() => {
            this.showIncomingInvite(friend);
        }, 1000);
    }

    showIncomingInvite(friend) {
        const inviteCard = document.getElementById('steamInviteCard');
        const userAvatar = document.getElementById('inviteUserAvatar');
        const userName = document.getElementById('inviteUserName');
        const gameIcon = document.getElementById('inviteGameIcon');
        const gameName = document.getElementById('inviteGameName');

        if (!inviteCard || !userAvatar || !userName) return;

        userAvatar.src = friend.avatar;
        userName.textContent = friend.username;

        if (friend.gameInfo) {
            gameIcon.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${friend.gameId}/header.jpg`;
            gameName.textContent = friend.gameInfo;
            document.querySelector('.steam-invite-game').style.display = 'flex';
        } else {
            document.querySelector('.steam-invite-game').style.display = 'none';
        }

        inviteCard.style.display = 'block';

        // Обработчики для кнопок приглашения
        document.getElementById('acceptInvite').onclick = () => {
            this.joinVoiceChat();
            inviteCard.style.display = 'none';
        };

        document.getElementById('declineInvite').onclick = () => {
            inviteCard.style.display = 'none';
        };

        document.getElementById('closeInvite').onclick = () => {
            inviteCard.style.display = 'none';
        };

        // Автоматическое закрытие через 30 секунд
        setTimeout(() => {
            if (inviteCard.style.display === 'block') {
                inviteCard.style.display = 'none';
            }
        }, 30000);
    }

    joinVoiceChat() {
        if (!this.voiceChat) {
            this.startVoiceChat();
        }
        this.showNotification('Присоединяюсь к голосовому чату...', 'info');
    }

    showInviteDialog() {
        if (!this.voiceChat) {
            this.showNotification('Сначала запустите голосовой чат', 'warning');
            return;
        }

        this.showNotification('Выберите друга для приглашения', 'info');
    }

    // Steam API логин (через OpenID)
    steamApiLogin() {
        const steamLoginUrl = `https://steamcommunity.com/openid/login?` +
            `openid.ns=http://specs.openid.net/auth/2.0&` +
            `openid.mode=checkid_setup&` +
            `openid.return_to=${encodeURIComponent(window.location.origin + '/api/steam/callback')}&` +
            `openid.realm=${encodeURIComponent(window.location.origin)}&` +
            `openid.identity=http://specs.openid.net/auth/2.0/identifier_select&` +
            `openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select`;

        window.location.href = steamLoginUrl;
    }

    // Метод для обработки callback от Steam
    handleSteamCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const claimedId = urlParams.get('openid.claimed_id');

        if (claimedId) {
            // Извлекаем Steam ID из URL
            const steamIdMatch = claimedId.match(/\/id\/(\d+)$/);
            if (steamIdMatch) {
                const steamId = steamIdMatch[1];
                this.authenticate(steamId);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    if (!window.steamIntegration) {
        window.steamIntegration = new SteamIntegration();
    }

    // Проверяем, не находимся ли мы на странице callback
    if (window.location.search.includes('openid.')) {
        window.steamIntegration.handleSteamCallback();
    }
});