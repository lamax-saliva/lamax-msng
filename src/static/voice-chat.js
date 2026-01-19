class VoiceChat {
    constructor() {
        this.peerConnections = new Map();
        this.remoteAudios = new Map();
        this.localStream = null;
        this.peers = new Map();
        this.websocket = null;
        this.peerId = null;
        this.roomId = null;
        this.userId = null;
        this.username = null;
        this.avatar = null;
        this.isMuted = true;
        this.isConnected = false;
        this.audioContext = null;
        this.analyser = null;
        this.audioLevel = 0;
        this.audioBars = [];
        this.isSpeaking = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.speakingThreshold = 0.05;
        this.audioContainer = null; // Контейнер для аудио элементов

        console.log('🎤 VoiceChat инициализирован');
    }

    checkWebRTCSupport() {
        const requiredAPIs = [
            'mediaDevices' in navigator,
            'getUserMedia' in (navigator.mediaDevices || {}),
            'RTCPeerConnection' in window,
            'RTCSessionDescription' in window,
            'RTCIceCandidate' in window,
            'WebSocket' in window
        ];

        if (!requiredAPIs.every(Boolean)) {
            console.error('❌ Ваш браузер не поддерживает WebRTC');
            return false;
        }
        return true;
    }

    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 48000,
                    sampleSize: 16
                },
                video: false
            });

            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = true;
                console.log('🎤 Трек микрофона:', track.label, 'состояние:', track.readyState);
            });
            this.isMuted = false;

            this.setupAudioAnalysis();
            console.log('✅ Микрофон получен');

        } catch (error) {
            console.error('❌ Ошибка доступа к микрофону:', error);

            // Показываем помощь по микрофону
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                this.showMicrophoneHelp();
            }

            throw error;
        }
    }

    setupAudioAnalysis() {
        try {
            if (!this.localStream) return;

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            this.analyser = this.audioContext.createAnalyser();

            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            this.updateAudioVisualization();

        } catch (error) {
            console.error('❌ Ошибка настройки анализа аудио:', error);
        }
    }

    updateAudioVisualization() {
        if (!this.analyser) {
            requestAnimationFrame(() => this.updateAudioVisualization());
            return;
        }

        try {
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            this.audioLevel = sum / dataArray.length / 255;

            const wasSpeaking = this.isSpeaking;
            this.isSpeaking = this.audioLevel > this.speakingThreshold && !this.isMuted;

            if (this.isSpeaking !== wasSpeaking && this.websocket && this.websocket.readyState === WebSocket.OPEN && this.peerId) {
                this.websocket.send(JSON.stringify({
                    type: 'user-speaking',
                    speaking: this.isSpeaking,
                    roomId: this.roomId,
                    peerId: this.peerId
                }));
            }

            this.updateVisualizationBars(dataArray);
            this.updateSpeakingStatus();

        } catch (error) {
            console.error('❌ Ошибка визуализации:', error);
        }

        requestAnimationFrame(() => this.updateAudioVisualization());
    }

    updateVisualizationBars(dataArray) {
        const barCount = 7;
        const step = Math.floor(dataArray.length / barCount);
        this.audioBars = [];

        for (let i = 0; i < barCount; i++) {
            const index = i * step;
            const value = dataArray[index] / 255;
            this.audioBars.push(value);
        }

        const bars = document.querySelectorAll('.vc-audio-bar, .vc-sound-wave');
        bars.forEach((bar, index) => {
            if (this.audioBars[index] !== undefined) {
                const height = Math.max(5, this.audioBars[index] * 100);
                bar.style.height = `${height}%`;
            }
        });
    }

    updateSpeakingStatus() {
        const youCard = document.querySelector('.vc-participant-card.you');
        const youGrid = document.querySelector('.vc-grid-participant.you');

        if (youCard) youCard.classList.toggle('speaking', this.isSpeaking);
        if (youGrid) youGrid.classList.toggle('speaking', this.isSpeaking);

        this.peers.forEach((peer, peerId) => {
            if (peer.isSpeaking) {
                const peerCard = document.querySelector(`.vc-participant-card[data-peer-id="${peerId}"]`);
                const peerGrid = document.querySelector(`.vc-grid-participant[data-peer-id="${peerId}"]`);

                if (peerCard) peerCard.classList.add('speaking');
                if (peerGrid) peerGrid.classList.add('speaking');
            }
        });
    }

    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.getWebRTCConfig().then(config => {
                    console.log('Подключение к WebSocket:', config.websocketUrl);

                    if (!config.websocketUrl) {
                        reject(new Error('WebSocket URL не указан'));
                        return;
                    }

                    this.websocket = new WebSocket(config.websocketUrl);

                    const timeout = setTimeout(() => {
                        reject(new Error('Таймаут подключения к WebSocket'));
                    }, 10000);

                    this.websocket.onopen = () => {
                        clearTimeout(timeout);
                        console.log('✅ Подключено к серверу WebRTC');
                        this.isConnected = true;
                        this.updateConnectionStatus(true);
                        resolve();
                    };

                    this.websocket.onmessage = (event) => {
                        try {
                            const message = JSON.parse(event.data);
                            console.log('📨 Получено сообщение:', message.type);
                            this.handleWebSocketMessage(message);
                        } catch (error) {
                            console.error('❌ Ошибка парсинга сообщения:', error);
                        }
                    };

                    this.websocket.onclose = (event) => {
                        console.log('🔌 Отключено от сервера WebRTC:', event.code);
                        this.isConnected = false;
                        this.updateConnectionStatus(false);
                        clearTimeout(timeout);

                        if (this.connectionAttempts < this.maxConnectionAttempts) {
                            this.connectionAttempts++;
                            console.log(`Попытка переподключения ${this.connectionAttempts}/${this.maxConnectionAttempts}...`);

                            setTimeout(() => {
                                this.connectWebSocket().catch(() => {
                                    this.showNotification('Не удалось подключиться к голосовому чату', 'error');
                                });
                            }, 3000);
                        } else {
                            this.showNotification('Не удалось подключиться к серверу голосового чата', 'error');
                        }
                    };

                    this.websocket.onerror = (error) => {
                        console.error('❌ WebSocket error:', error);
                        clearTimeout(timeout);
                        reject(new Error('Ошибка подключения к серверу WebRTC'));
                    };

                }).catch(error => {
                    console.error('❌ Ошибка получения конфигурации:', error);
                    reject(new Error('Не удалось получить конфигурацию WebRTC'));
                });

            } catch (error) {
                console.error('❌ Ошибка инициализации WebSocket:', error);
                reject(error);
            }
        });
    }

    async startVoiceChat(roomId, user) {
        this.roomId = roomId;
        this.userId = user.id;
        this.username = user.username;
        this.avatar = user.avatar;

        try {
            this.connectionAttempts = 0;
            this.showVoiceChatUI();
            this.showLoading(true, 'Подготовка голосового чата...');

            if (!this.checkWebRTCSupport()) {
                throw new Error('Ваш браузер не поддерживает WebRTC');
            }

            await this.getUserMedia();
            await this.connectWebSocket();
            this.joinRoom();

            this.showNotification('✅ Голосовой чат запущен', 'success');
            this.showLoading(false);

            return true;

        } catch (error) {
            console.error('❌ Ошибка запуска голосового чата:', error);
            this.showLoading(false);
            this.showNotification('❌ Не удалось запустить голосовой чат: ' + error.message, 'error');
            return false;
        }
    }

    async getWebRTCConfig() {
        const response = await fetch('/api/webrtc/config');
        if (!response.ok) {
            throw new Error('Не удалось получить конфигурацию');
        }
        return await response.json();
    }

    handleWebSocketMessage(message) {
        console.log('WebSocket сообщение:', message.type);

        switch (message.type) {
            case 'your-peer-id':
                this.peerId = message.peerId;
                this.updatePeerInfo();
                this.showNotification('✅ Подключено к голосовому чату', 'success');
                break;

            case 'existing-peers':
                if (message.peers && message.peers.length > 0) {
                    console.log(`📋 Загружаем ${message.peers.length} участников`);
                    message.peers.forEach(peer => {
                        this.addPeer(peer.peerId, peer.userId, peer.username, peer.avatar);
                    });
                    console.log(`✅ Загружено ${message.peers.length} участников`);
                } else {
                    console.log('📋 В комнате нет других участников');
                }
                break;

            case 'new-peer':
                this.addPeer(message.peerId, message.userId, message.username, message.avatar);
                console.log(`👤 Новый участник: ${message.username}`);
                this.showNotification(`👤 ${message.username} присоединился`, 'info');
                break;

            case 'peer-disconnected':
                this.removePeer(message.peerId);
                console.log(`👋 Участник отключился: ${message.username || message.peerId}`);
                if (message.username) {
                    this.showNotification(`👋 ${message.username} покинул чат`, 'info');
                }
                break;

            case 'user-speaking':
                if (this.peers.has(message.peerId)) {
                    const peer = this.peers.get(message.peerId);
                    peer.isSpeaking = message.speaking;
                    this.updatePeerSpeakingStatus(message.peerId, message.speaking);
                }
                break;

            case 'user-muted':
                if (this.peers.has(message.peerId)) {
                    const peer = this.peers.get(message.peerId);
                    peer.isMuted = message.muted;
                    this.updatePeerMuteStatus(message.peerId, message.muted);
                }
                break;

            case 'pong':
                if (message.ping) {
                    this.updatePing(message.ping);
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                this.handleRTCMessage(message);
                break;
        }
    }

    handleRTCMessage(message) {
        const peerId = message.senderPeerId;

        if (!this.peerConnections.has(peerId)) {
            console.log(`🆕 Создаем соединение для входящего сообщения от ${peerId}`);
            this.createPeerConnection(peerId);
        }

        const pc = this.peerConnections.get(peerId);

        switch (message.type) {
            case 'offer':
                console.log(`📨 Получен offer от ${peerId}`);
                pc.setRemoteDescription(new RTCSessionDescription(message.sdp))
                    .then(() => {
                        console.log(`✅ Remote description установлен для ${peerId}`);
                        return pc.createAnswer();
                    })
                    .then(answer => {
                        console.log(`✅ Answer создан для ${peerId}`);
                        return pc.setLocalDescription(answer);
                    })
                    .then(() => {
                        this.websocket.send(JSON.stringify({
                            type: 'answer',
                            sdp: pc.localDescription,
                            targetPeerId: peerId,
                            roomId: this.roomId,
                            senderPeerId: this.peerId
                        }));
                        console.log(`📤 Answer отправлен к ${peerId}`);
                    })
                    .catch(error => console.error(`❌ Ошибка обработки offer от ${peerId}:`, error));
                break;

            case 'answer':
                console.log(`📨 Получен answer от ${peerId}`);
                pc.setRemoteDescription(new RTCSessionDescription(message.sdp))
                    .then(() => {
                        console.log(`✅ Answer обработан для ${peerId}`);
                    })
                    .catch(error => console.error(`❌ Ошибка обработки answer от ${peerId}:`, error));
                break;

            case 'ice-candidate':
                if (message.candidate) {
                    pc.addIceCandidate(new RTCIceCandidate(message.candidate))
                        .then(() => {
                            console.log(`✅ ICE candidate добавлен от ${peerId}`);
                        })
                        .catch(error => console.error(`❌ Ошибка добавления ICE candidate от ${peerId}:`, error));
                }
                break;
        }
    }

    createPeerConnection(peerId) {
        console.log(`🔄 Создаем WebRTC соединение с ${peerId}`);

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                // TURN серверы для лучшей совместимости
                {
                    urls: 'turn:turn.bistri.com:80',
                    credential: 'homeo',
                    username: 'homeo'
                },
                {
                    urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                    credential: 'webrtc',
                    username: 'webrtc'
                }
            ],
            iceTransportPolicy: 'all',
            rtcpMuxPolicy: 'require',
            bundlePolicy: 'max-bundle'
        };

        const pc = new RTCPeerConnection(configuration);

        // Обработчик получения удаленного трека (самое важное!)
        pc.ontrack = (event) => {
            console.log(`🔊 AUDIO TRACK получен от ${peerId}`, event.track.kind, event.track.readyState);

            // Получаем поток
            const stream = event.streams[0];
            if (!stream) {
                console.warn('⚠️ Получен track без stream');
                return;
            }

            // Убедимся, что это аудио трек
            if (event.track.kind !== 'audio') {
                console.log('❌ Получен не аудио трек:', event.track.kind);
                return;
            }

            // Создаем или получаем аудио элемент
            let audio = this.remoteAudios.get(peerId);
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${peerId}`;
                audio.autoplay = true;
                audio.playsInline = true;
                audio.controls = false;
                audio.muted = false;
                audio.volume = 1.0;
                audio.style.display = 'none';

                // Добавляем в специальный контейнер
                if (!this.audioContainer) {
                    this.audioContainer = document.createElement('div');
                    this.audioContainer.id = 'vc-audio-container';
                    this.audioContainer.style.display = 'none';
                    document.body.appendChild(this.audioContainer);
                }
                this.audioContainer.appendChild(audio);
                this.remoteAudios.set(peerId, audio);

                console.log(`✅ Аудио элемент создан для ${peerId}`);
            }

            // Устанавливаем поток
            audio.srcObject = stream;

            // Попытка воспроизведения
            const playAudio = () => {
                audio.play().then(() => {
                    console.log(`✅ Аудио воспроизводится от ${peerId}`);
                    this.updatePeerAudioStatus(peerId, true);

                    // Проверяем, есть ли звук
                    setTimeout(() => {
                        if (audio.readyState >= 2) { // HAVE_ENOUGH_DATA
                            console.log(`✅ Аудио от ${peerId} готово к воспроизведению`);
                        }
                    }, 1000);

                }).catch(err => {
                    console.warn(`⚠️ Ошибка воспроизведения аудио от ${peerId}:`, err.message);

                    // Пытаемся воспроизвести при клике
                    const tryOnce = () => {
                        audio.play().catch(e => console.log('Еще одна попытка не удалась:', e));
                        document.body.removeEventListener('click', tryOnce);
                    };
                    document.body.addEventListener('click', tryOnce, { once: true });
                });
            };

            // Ждем когда трек будет готов
            event.track.onunmute = () => {
                console.log(`🔊 Трек от ${peerId} разблокирован`);
                playAudio();
            };

            // Если трек уже не заблокирован, воспроизводим сразу
            if (event.track.readyState === 'live' && !event.track.muted) {
                playAudio();
            }

            // Логируем изменения состояния трека
            event.track.onended = () => console.log(`🔇 Трек от ${peerId} завершен`);
            event.track.onmute = () => console.log(`🔇 Трек от ${peerId} заблокирован`);

            // Настраиваем анализ аудио
            this.setupRemoteAudioAnalysis(peerId, stream);
        };

        // Обработчик ICE кандидатов
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.websocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    targetPeerId: peerId,
                    roomId: this.roomId,
                    senderPeerId: this.peerId
                }));
                console.log(`🧊 ICE candidate отправлен к ${peerId}`);
            }
        };

        // Обработчик состояния соединения
        pc.onconnectionstatechange = () => {
            console.log(`🔗 Состояние соединения с ${peerId}: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                console.log(`✅ Соединение с ${peerId} установлено!`);
                this.showNotification(`✅ Соединение с ${this.peers.get(peerId)?.username || 'участником'} установлено`, 'success');
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                console.warn(`⚠️ Проблема с соединением ${peerId}: ${pc.connectionState}`);
                // Попытка переподключения
                setTimeout(() => {
                    if (this.peers.has(peerId) && pc.connectionState !== 'connected') {
                        console.log(`🔄 Пытаемся переподключиться к ${peerId}`);
                        this.removePeer(peerId);
                        this.addPeer(peerId,
                            this.peers.get(peerId)?.userId,
                            this.peers.get(peerId)?.username,
                            this.peers.get(peerId)?.avatar
                        );
                    }
                }, 2000);
            }
        };

        // Обработчик ICE состояния
        pc.oniceconnectionstatechange = () => {
            console.log(`🧊 ICE состояние с ${peerId}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'failed') {
                console.warn(`❌ ICE соединение с ${peerId} завершилось ошибкой`);
                // Попробуем перезапустить ICE
                try {
                    pc.restartIce();
                } catch (e) {
                    console.log('Не удалось перезапустить ICE:', e);
                }
            }
        };

        // Обработчик сигнального состояния
        pc.onsignalingstatechange = () => {
            console.log(`📶 Сигнальное состояние с ${peerId}: ${pc.signalingState}`);
        };

        // Добавляем локальные треки ТОЛЬКО если мы не слышим других
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                // Убедимся, что трек не добавляется несколько раз
                const existingSender = pc.getSenders().find(sender => sender.track === track);
                if (!existingSender) {
                    try {
                        const sender = pc.addTrack(track, this.localStream);
                        console.log(`✅ Локальный аудио трек добавлен в соединение с ${peerId}`, track.id);

                        // Логируем состояние трека
                        track.onmute = () => console.log(`🔇 Локальный трек ${track.id} заблокирован`);
                        track.onunmute = () => console.log(`🔊 Локальный трек ${track.id} разблокирован`);
                        track.onended = () => console.log(`🔇 Локальный трек ${track.id} завершен`);

                    } catch (error) {
                        console.error(`❌ Ошибка добавления трека для ${peerId}:`, error);
                    }
                } else {
                    console.log(`⚠️ Трек уже добавлен для ${peerId}`);
                }
            });
        }

        this.peerConnections.set(peerId, pc);

        // Если это не входящее соединение, создаем offer
        if (this.localStream && this.peerId) {
            setTimeout(() => {
                if (pc.signalingState === 'stable') {
                    this.createOfferForPeer(pc, peerId);
                }
            }, 1000 + Math.random() * 1000); // Случайная задержка для избежания коллизий
        }

        return pc;
    }

    createOfferForPeer(pc, peerId) {
        console.log(`🤝 Создаем offer для ${peerId}`);

        pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
            voiceActivityDetection: true
        })
            .then(offer => {
                console.log(`✅ Offer создан для ${peerId}`);
                // Устанавливаем битрейт для лучшего качества
                if (offer.sdp) {
                    offer.sdp = offer.sdp.replace(/a=mid:0/g, 'a=mid:0\r\nb=AS:64');
                }
                return pc.setLocalDescription(offer);
            })
            .then(() => {
                this.websocket.send(JSON.stringify({
                    type: 'offer',
                    sdp: pc.localDescription,
                    targetPeerId: peerId,
                    roomId: this.roomId,
                    senderPeerId: this.peerId
                }));
                console.log(`📤 Offer отправлен к ${peerId}`);
            })
            .catch(error => {
                console.error(`❌ Ошибка создания offer для ${peerId}:`, error);
                // Повторная попытка через 2 секунды
                setTimeout(() => {
                    if (this.peerConnections.has(peerId) && this.peerConnections.get(peerId).signalingState === 'stable') {
                        console.log(`🔄 Повторная попытка создания offer для ${peerId}`);
                        this.createOfferForPeer(this.peerConnections.get(peerId), peerId);
                    }
                }, 2000);
            });
    }

    addPeer(peerId, userId, username, avatar) {
        if (peerId === this.peerId || this.peers.has(peerId)) {
            return;
        }

        console.log(`➕ Добавляем пира: ${username} (${peerId})`);

        this.peers.set(peerId, {
            userId,
            username,
            avatar,
            isMuted: false,
            isSpeaking: false,
            hasAudio: false,
            audioLevel: 0
        });

        // Немедленно создаем соединение, если его еще нет
        if (!this.peerConnections.has(peerId)) {
            this.createPeerConnection(peerId);
        } else {
            console.log(`⚠️ Соединение с ${peerId} уже существует`);
        }

        this.addParticipantToUI(peerId, userId, username, avatar);
        this.updateParticipantCount();
    }

    removePeer(peerId) {
        if (this.peers.has(peerId)) {
            const peer = this.peers.get(peerId);
            console.log(`➖ Удаляем пира: ${peer.username} (${peerId})`);

            // Закрываем соединение
            if (this.peerConnections.has(peerId)) {
                const pc = this.peerConnections.get(peerId);
                pc.close();
                this.peerConnections.delete(peerId);
            }

            // Останавливаем и удаляем аудио элемент
            if (this.remoteAudios.has(peerId)) {
                const audio = this.remoteAudios.get(peerId);
                audio.pause();
                audio.srcObject = null;
                audio.src = '';

                if (audio.parentNode === this.audioContainer) {
                    this.audioContainer.removeChild(audio);
                }
                this.remoteAudios.delete(peerId);
            }

            this.peers.delete(peerId);
            this.removeParticipantFromUI(peerId);
            this.updateParticipantCount();
        }
    }

    setupRemoteAudioAnalysis(peerId, stream) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();

            source.connect(analyser);
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;

            const checkAudioLevel = () => {
                if (!this.peers.has(peerId)) return;

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const level = sum / dataArray.length / 255;

                const peer = this.peers.get(peerId);
                peer.audioLevel = level;
                peer.isSpeaking = level > this.speakingThreshold && !peer.isMuted;

                this.updatePeerSpeakingStatus(peerId, peer.isSpeaking);

                if (this.peers.has(peerId)) {
                    requestAnimationFrame(checkAudioLevel);
                }
            };

            checkAudioLevel();

        } catch (error) {
            console.error(`❌ Ошибка анализа удаленного аудио ${peerId}:`, error);
        }
    }

    updatePeerAudioStatus(peerId, hasAudio) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.hasAudio = hasAudio;

            const participantCard = document.querySelector(`.vc-participant-card[data-peer-id="${peerId}"]`);
            const gridCard = document.querySelector(`.vc-grid-participant[data-peer-id="${peerId}"]`);

            if (participantCard) {
                participantCard.classList.toggle('has-audio', hasAudio);
            }
            if (gridCard) {
                gridCard.classList.toggle('has-audio', hasAudio);
            }
        }
    }

    updatePeerSpeakingStatus(peerId, speaking) {
        const participantCard = document.querySelector(`.vc-participant-card[data-peer-id="${peerId}"]`);
        const gridCard = document.querySelector(`.vc-grid-participant[data-peer-id="${peerId}"]`);

        if (participantCard) {
            participantCard.classList.toggle('speaking', speaking);
        }
        if (gridCard) {
            gridCard.classList.toggle('speaking', speaking);
        }

        const peer = this.peers.get(peerId);
        if (peer) {
            peer.isSpeaking = speaking;
        }
    }

    updatePeerMuteStatus(peerId, muted) {
        const muteIndicator = document.querySelector(`.vc-participant-card[data-peer-id="${peerId}"] .vc-participant-status`);
        if (muteIndicator) {
            muteIndicator.style.background = muted ? 'var(--vc-danger)' : 'var(--vc-secondary)';
            muteIndicator.classList.toggle('muted', muted);
        }
    }

    joinRoom() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'join-room',
                userId: this.userId,
                roomId: this.roomId,
                username: this.username,
                avatar: this.avatar
            }));
            console.log(`Присоединились к голосовому чату: ${this.roomId}`);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
                console.log(`🎤 Микрофон ${this.isMuted ? 'выключен' : 'включен'}`, track.enabled);
            });
        }

        this.updateMuteButton();

        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'user-muted',
                roomId: this.roomId,
                muted: this.isMuted,
                peerId: this.peerId
            }));
        }

        this.showNotification(
            this.isMuted ? '🎤 Микрофон выключен' : '🎤 Микрофон включен',
            this.isMuted ? 'warning' : 'success'
        );
    }

    disconnect() {
        console.log('Отключение от голосового чата...');

        // Отправляем сообщение о выходе
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'leave-room',
                roomId: this.roomId,
                peerId: this.peerId
            }));
        }

        // Закрываем все соединения
        this.peerConnections.forEach((pc, peerId) => {
            pc.close();
        });
        this.peerConnections.clear();

        // Очищаем все аудио элементы
        this.remoteAudios.forEach((audio, peerId) => {
            audio.pause();
            audio.srcObject = null;
            audio.src = '';
            if (audio.parentNode) {
                audio.parentNode.removeChild(audio);
            }
        });
        this.remoteAudios.clear();

        // Удаляем контейнер для аудио
        if (this.audioContainer && this.audioContainer.parentNode) {
            this.audioContainer.parentNode.removeChild(this.audioContainer);
            this.audioContainer = null;
        }

        this.peers.clear();

        // Останавливаем локальный стрим
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Закрываем WebSocket
        if (this.websocket) {
            this.websocket.close();
        }

        // Закрываем аудио контекст
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Очищаем интервалы
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.pingInterval) clearInterval(this.pingInterval);

        this.hideVoiceChatUI();
        this.showNotification('👋 Вы покинули голосовой чат', 'info');

        // Сбрасываем состояние
        this.isConnected = false;
        this.peerId = null;
    }

    // ========== UI МЕТОДЫ ==========

    showVoiceChatUI() {
        // Добавляем класс к body чтобы скрыть основной интерфейс
        document.body.classList.add('voice-chat-active');

        const html = `
            <div class="voice-chat-container vc-slide-in">
                <!-- Шапка -->
                <div class="vc-header">
                    <div class="vc-header-left">
                        <div class="vc-logo">
                            <div class="vc-logo-icon">
                                <i class="fas fa-phone-alt"></i>
                            </div>
                            <div class="vc-logo-text">Голосовой чат</div>
                        </div>
                        
                        <div class="vc-room-info">
                            <div class="vc-room-icon">
                                <i class="fas fa-hashtag"></i>
                            </div>
                            <div class="vc-room-details">
                                <h3 id="vcRoomName">${this.roomId}</h3>
                                <p>
                                    <span class="vc-status-dot"></span>
                                    <span id="vcConnectionStatus">Подключение...</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="vc-header-right">
                        <div class="vc-controls">
                            <button class="vc-control-btn mute-toggle" title="${this.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}">
                                <i class="fas ${this.isMuted ? 'fa-microphone-slash vc-icon-mic-muted' : 'fa-microphone vc-icon-mic'}"></i>
                            </button>
                            <button class="vc-control-btn debug-btn" title="Отладка">
                                <i class="fas fa-bug"></i>
                            </button>
                            <button class="vc-control-btn disconnect" title="Покинуть чат">
                                <i class="fas fa-phone-slash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Основная область -->
                <div class="vc-main">
                    <!-- Сайдбар участников -->
                    <div class="vc-participants-sidebar">
                        <div class="vc-participants-header">
                            <h3>
                                <i class="fas fa-users"></i>
                                Участники
                            </h3>
                            <div class="vc-participants-count">
                                <i class="fas fa-user-friends"></i>
                                <span>Онлайн: <span id="vcParticipantCount">1</span></span>
                            </div>
                        </div>
                        
                        <div class="vc-participants-list" id="vcParticipantsList">
                            <!-- Список реальных участников будет здесь -->
                        </div>
                        
                        <div class="vc-connection-info">
                            <div class="vc-connection-status">
                                <span class="vc-status-dot"></span>
                                <span id="vcWsStatus">Подключение к серверу...</span>
                            </div>
                            <div class="vc-ping">
                                <i class="fas fa-signal vc-icon-signal"></i>
                                <span>Пинг: <span id="vcPingValue">--</span> мс</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Основная область чата -->
                    <div class="vc-chat-area">
                        <div class="vc-welcome-message" id="vcWelcomeMessage">
                            <div class="vc-welcome-icon">
                                <i class="fas fa-headphones vc-icon-headphones"></i>
                            </div>
                            <h2>Голосовой чат "${this.roomId}"</h2>
                            <p>Общайтесь с участниками в реальном времени.</p>
                            
                            <div style="margin-top: 30px; padding: 20px; background: rgba(88, 101, 242, 0.1); border-radius: 15px; border-left: 4px solid var(--vc-primary);">
                                <h4 style="color: var(--vc-primary); margin-bottom: 10px;">
                                    <i class="fas fa-info-circle"></i> Управление:
                                </h4>
                                <ul style="color: var(--vc-text-secondary); margin: 0; padding-left: 20px; line-height: 1.8;">
                                    <li>Нажмите <i class="fas fa-microphone"></i> чтобы включить микрофон</li>
                                    <li>Зеленый индикатор - вы говорите</li>
                                    <li>Красный индикатор - микрофон выключен</li>
                                    <li>Другие участники видны когда они онлайн</li>
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Сетка участников -->
                        <div class="vc-participants-grid" id="vcParticipantsGrid">
                            <!-- Реальные участники в сетке будут здесь -->
                        </div>
                    </div>
                </div>
                
                <!-- Панель управления -->
                <div class="vc-control-panel">
                    <div class="vc-control-group">
                        <div class="vc-slider-group">
                            <i class="fas fa-volume-up"></i>
                            <input type="range" class="vc-volume-slider" min="0" max="100" value="80" 
                                   title="Громкость">
                            <span class="vc-volume-value">80%</span>
                        </div>
                        
                        <button class="vc-control-btn" title="Настройки" id="vcSettingsBtn">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                    
                    <div class="vc-info-stats">
                        <div class="vc-stat">
                            <i class="fas fa-clock"></i>
                            <span>Время: <span class="vc-stat-value" id="vcTime">00:00</span></span>
                        </div>
                        <div class="vc-stat">
                            <i class="fas fa-microphone"></i>
                            <span>Статус: <span class="vc-stat-value" id="vcMicStatus">${this.isMuted ? 'Выкл' : 'Вкл'}</span></span>
                        </div>
                    </div>
                </div>
                
                <!-- Экран загрузки -->
                <div class="vc-loading" id="vcLoading" style="display: flex;">
                    <div class="vc-loading-spinner"></div>
                    <div class="vc-loading-text">Подключение к голосовому чату...</div>
                </div>
                
                <!-- Кнопка возврата -->
                <a href="#" class="vc-back-to-chat" id="vcBackToChat">
                    <i class="fas fa-arrow-left"></i>
                    Вернуться в чат
                </a>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);

        // Добавляем себя в список участников
        this.addParticipantToUI('you', this.userId, this.username, this.avatar);

        // Настраиваем обработчики
        this.setupUIControls();

        // Запускаем таймер
        this.startTimer();

        // Запускаем пинг
        this.startPingTest();
    }

    setupUIControls() {
        // Кнопка отключения микрофона
        document.querySelector('.mute-toggle').addEventListener('click', () => {
            this.toggleMute();
        });

        // Кнопка отладки
        document.querySelector('.debug-btn').addEventListener('click', () => {
            this.debug();
        });

        // Кнопка выхода
        document.querySelector('.disconnect').addEventListener('click', () => {
            if (confirm('Покинуть голосовой чат?')) {
                this.disconnect();
            }
        });

        // Кнопка возврата в чат
        document.getElementById('vcBackToChat').addEventListener('click', (e) => {
            e.preventDefault();
            this.disconnect();
        });

        // Слайдер громкости
        const volumeSlider = document.querySelector('.vc-volume-slider');
        const volumeValue = document.querySelector('.vc-volume-value');

        volumeSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            volumeValue.textContent = `${value}%`;

            // Устанавливаем громкость для всех аудио элементов
            this.remoteAudios.forEach(audio => {
                audio.volume = value / 100;
            });
        });

        // Кнопка настроек
        document.getElementById('vcSettingsBtn').addEventListener('click', () => {
            this.showNotification('Настройки будут доступны в следующем обновлении', 'info');
        });

        // Обновляем статус микрофона
        document.getElementById('vcMicStatus').textContent = this.isMuted ? 'Выкл' : 'Вкл';
    }

    addParticipantToUI(peerId, userId, username, avatar) {
        const isYou = peerId === 'you';
        const avatarUrl = avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId || username}`;

        // Карточка в сайдбаре
        const participantCard = document.createElement('div');
        participantCard.className = `vc-participant-card ${isYou ? 'you' : ''}`;
        participantCard.dataset.peerId = peerId;

        participantCard.innerHTML = `
            <div class="vc-participant-header">
                <div class="vc-participant-avatar">
                    <img src="${avatarUrl}" alt="${username}" 
                         onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${username}'">
                    <div class="vc-participant-status ${isYou && this.isMuted ? 'muted' : ''}"></div>
                </div>
                <div class="vc-participant-info">
                    <div class="vc-participant-name">${username}</div>
                    <div class="vc-participant-role">
                        ${isYou ? '<span class="vc-you-badge">Вы</span>' : ''}
                        <span class="vc-participant-device">
                            <i class="fas fa-headphones"></i> Онлайн
                        </span>
                    </div>
                </div>
            </div>
            <div class="vc-audio-visualization">
                <div class="vc-audio-bars">
                    <div class="vc-audio-bar"></div>
                    <div class="vc-audio-bar"></div>
                    <div class="vc-audio-bar"></div>
                    <div class="vc-audio-bar"></div>
                    <div class="vc-audio-bar"></div>
                    <div class="vc-audio-bar"></div>
                    <div class="vc-audio-bar"></div>
                </div>
            </div>
        `;

        document.getElementById('vcParticipantsList').appendChild(participantCard);

        // Карточка в сетке
        const gridCard = document.createElement('div');
        gridCard.className = `vc-grid-participant ${isYou ? 'you' : ''}`;
        gridCard.dataset.peerId = peerId;

        gridCard.innerHTML = `
            <div class="vc-grid-avatar">
                <img src="${avatarUrl}" alt="${username}" 
                     onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${username}'">
                <div class="vc-participant-status ${isYou && this.isMuted ? 'muted' : ''}"></div>
            </div>
            <div class="vc-grid-name">${username}</div>
            <div class="vc-grid-status">
                <i class="fas fa-circle ${isYou ? 'online' : ''}"></i>
                ${isYou ? 'Вы' : 'В сети'}
            </div>
            <div class="vc-sound-waves">
                <div class="vc-sound-wave"></div>
                <div class="vc-sound-wave"></div>
                <div class="vc-sound-wave"></div>
                <div class="vc-sound-wave"></div>
                <div class="vc-sound-wave"></div>
            </div>
        `;

        document.getElementById('vcParticipantsGrid').appendChild(gridCard);

        // Анимация появления
        setTimeout(() => {
            participantCard.style.opacity = '1';
            participantCard.style.transform = 'translateY(0)';
            gridCard.style.opacity = '1';
            gridCard.style.transform = 'scale(1)';
        }, 100);
    }

    removeParticipantFromUI(peerId) {
        // Удаляем из сайдбара
        const sidebarCard = document.querySelector(`.vc-participant-card[data-peer-id="${peerId}"]`);
        if (sidebarCard) {
            sidebarCard.style.animation = 'vc-scaleUp 0.3s ease reverse';
            setTimeout(() => {
                if (sidebarCard.parentNode) {
                    sidebarCard.parentNode.removeChild(sidebarCard);
                }
            }, 300);
        }

        // Удаляем из сетки
        const gridCard = document.querySelector(`.vc-grid-participant[data-peer-id="${peerId}"]`);
        if (gridCard) {
            gridCard.style.animation = 'vc-scaleUp 0.3s ease reverse';
            setTimeout(() => {
                if (gridCard.parentNode) {
                    gridCard.parentNode.removeChild(gridCard);
                }
            }, 300);
        }
    }

    updateParticipantCount() {
        const count = this.peers.size + 1; // +1 для себя
        document.getElementById('vcParticipantCount').textContent = count;
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('vcConnectionStatus');
        const wsStatusElement = document.getElementById('vcWsStatus');
        const dot = document.querySelector('.vc-connection-status .vc-status-dot');

        if (connected) {
            statusElement.textContent = 'Подключено';
            wsStatusElement.textContent = 'Соединение установлено';
            dot.style.background = 'var(--vc-success)';
        } else {
            statusElement.textContent = 'Отключено';
            wsStatusElement.textContent = 'Соединение потеряно';
            dot.style.background = 'var(--vc-danger)';
        }
    }

    updateMuteButton() {
        const muteBtn = document.querySelector('.mute-toggle');
        const muteIcon = muteBtn.querySelector('i');
        const muteIndicator = document.querySelector('.vc-participant-card.you .vc-participant-status');
        const micStatus = document.getElementById('vcMicStatus');

        if (this.isMuted) {
            muteBtn.classList.add('mute');
            muteBtn.title = 'Включить микрофон';
            muteIcon.className = 'fas fa-microphone-slash vc-icon-mic-muted';
            if (muteIndicator) {
                muteIndicator.style.background = 'var(--vc-danger)';
                muteIndicator.classList.add('muted');
            }
            if (micStatus) micStatus.textContent = 'Выкл';
        } else {
            muteBtn.classList.remove('mute');
            muteBtn.title = 'Выключить микрофон';
            muteIcon.className = 'fas fa-microphone vc-icon-mic';
            if (muteIndicator) {
                muteIndicator.style.background = 'var(--vc-success)';
                muteIndicator.classList.remove('muted');
            }
            if (micStatus) micStatus.textContent = 'Вкл';
        }
    }

    updatePeerInfo() {
        const roomName = document.getElementById('vcRoomName');
        if (roomName && this.peerId) {
            roomName.textContent = `${this.roomId}`;
        }
    }

    startTimer() {
        let seconds = 0;
        const timerElement = document.getElementById('vcTime');

        this.timerInterval = setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }

    startPingTest() {
        this.pingInterval = setInterval(() => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const startTime = Date.now();

                this.websocket.send(JSON.stringify({
                    type: 'ping',
                    timestamp: startTime
                }));
            }
        }, 5000);
    }

    updatePing(ping) {
        const pingElement = document.getElementById('vcPingValue');
        if (pingElement) {
            pingElement.textContent = Math.max(1, ping);
        }
    }

    showLoading(show, text = 'Загрузка...') {
        const loadingElement = document.getElementById('vcLoading');
        const loadingText = loadingElement.querySelector('.vc-loading-text');

        if (show) {
            loadingText.textContent = text;
            loadingElement.style.display = 'flex';
        } else {
            loadingElement.style.display = 'none';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'vc-notification';

        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        if (type === 'warning') icon = 'fa-exclamation-triangle';

        notification.innerHTML = `
            <div class="vc-notification-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="vc-notification-content">
                <div class="vc-notification-title">Голосовой чат</div>
                <div class="vc-notification-message">${message}</div>
            </div>
            <button class="vc-notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(notification);

        // Удаляем уведомление при клике
        notification.querySelector('.vc-notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'vc-slideDown 0.3s ease reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
    }

    hideVoiceChatUI() {
        // Очищаем интервалы
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.pingInterval) clearInterval(this.pingInterval);

        // Удаляем класс с body
        document.body.classList.remove('voice-chat-active');

        // Находим и анимируем закрытие
        const container = document.querySelector('.voice-chat-container');
        if (container) {
            container.style.animation = 'vc-slideOutToRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
        }

        // Удаляем все элементы голосового чата с задержкой
        setTimeout(() => {
            const elements = document.querySelectorAll(
                '.voice-chat-container, .vc-notification'
            );
            elements.forEach(el => {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        }, 400);
    }

    showMicrophoneHelp() {
        const helpHtml = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.95);
                padding: 30px;
                border-radius: 20px;
                border: 2px solid var(--vc-primary);
                z-index: 10010;
                color: white;
                max-width: 500px;
                width: 90%;
                backdrop-filter: blur(10px);
            ">
                <h3 style="color: var(--vc-primary); margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-microphone-slash"></i> Настройка микрофона
                </h3>
                
                <div style="margin-bottom: 20px;">
                    <p style="color: #B9BBBE; line-height: 1.5;">
                        Для работы голосового чата необходим доступ к микрофону.
                    </p>
                </div>
                
                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; margin-bottom: 25px;">
                    <h4 style="color: var(--vc-secondary); margin-bottom: 10px;">
                        <i class="fas fa-check-circle"></i> Как разрешить доступ:
                    </h4>
                    <ol style="color: #B9BBBE; margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li>Нажмите на иконку 🔒 в адресной строке</li>
                        <li>Найдите раздел "Микрофон"</li>
                        <li>Выберите "Разрешить"</li>
                        <li>Обновите страницу</li>
                    </ol>
                </div>
                
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="this.parentElement.parentElement.remove()" style="
                        background: var(--vc-danger);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-times"></i> Закрыть
                    </button>
                    
                    <button onclick="location.reload()" style="
                        background: var(--vc-primary);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-redo"></i> Обновить страницу
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', helpHtml);
    }

    // ========== ОТЛАДКА ==========

    debug() {
        console.group('🔍 Отладка VoiceChat');
        console.log('Peer ID:', this.peerId);
        console.log('Room ID:', this.roomId);
        console.log('WebSocket состояние:', this.websocket?.readyState);
        console.log('Локальный стрим:', this.localStream ? '✓' : '✗');
        if (this.localStream) {
            const tracks = this.localStream.getTracks();
            console.log('Локальные треки:', tracks.length);
            tracks.forEach(track => {
                console.log(`  - ${track.kind}: ${track.label}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
            });
        }
        console.log('Количество пиров:', this.peers.size);
        console.log('Количество соединений:', this.peerConnections.size);
        console.log('Количество аудио элементов:', this.remoteAudios.size);

        // Детали о каждом соединении
        console.log('Детали соединений:');
        this.peerConnections.forEach((pc, peerId) => {
            console.group(`Соединение с ${peerId}:`);
            console.log('Состояние:', pc.connectionState);
            console.log('ICE состояние:', pc.iceConnectionState);
            console.log('Сигнальное состояние:', pc.signalingState);
            console.log('Получатели:', pc.getReceivers().length);
            console.log('Отправители:', pc.getSenders().length);

            // Треки получателей
            pc.getReceivers().forEach(receiver => {
                if (receiver.track) {
                    console.log(`  Получаемый трек: ${receiver.track.kind}, состояние: ${receiver.track.readyState}, muted: ${receiver.track.muted}`);
                }
            });

            console.groupEnd();
        });

        // Проверяем аудио элементы
        console.log('Аудио элементы:');
        this.remoteAudios.forEach((audio, peerId) => {
            console.group(`Аудио ${peerId}:`);
            console.log('srcObject:', audio.srcObject ? '✓' : '✗');
            console.log('readyState:', audio.readyState);
            console.log('paused:', audio.paused);
            console.log('muted:', audio.muted);
            console.log('volume:', audio.volume);

            if (audio.srcObject) {
                const stream = audio.srcObject;
                console.log('Аудио треки в потоке:', stream.getAudioTracks().length);
                stream.getAudioTracks().forEach(track => {
                    console.log(`  - ${track.label}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
                });
            }

            console.groupEnd();
        });

        // Проверяем WebRTC поддержку
        console.log('WebRTC поддержка:');
        console.log('RTCPeerConnection:', !!window.RTCPeerConnection);
        console.log('getUserMedia:', !!navigator.mediaDevices?.getUserMedia);
        console.log('AudioContext:', !!window.AudioContext || !!window.webkitAudioContext);

        console.groupEnd();

        // Показываем уведомление
        this.showNotification('Отладочная информация выведена в консоль (F12)', 'info');

        // Автоматически проверяем аудио через 2 секунды
        setTimeout(() => {
            this.checkAudioPlayback();
        }, 2000);
    }

    checkAudioPlayback() {
        console.group('🎵 Проверка воспроизведения аудио');

        let hasAudio = false;
        this.remoteAudios.forEach((audio, peerId) => {
            if (audio.srcObject && audio.readyState >= 2) {
                hasAudio = true;
                console.log(`✅ Аудио от ${peerId} воспроизводится`);

                // Создаем временный элемент для теста
                const testAudio = document.createElement('audio');
                testAudio.srcObject = audio.srcObject;
                testAudio.volume = 0.5;

                testAudio.play().then(() => {
                    console.log(`✅ Тестовое воспроизведение ${peerId} успешно`);
                    testAudio.pause();
                }).catch(err => {
                    console.warn(`❌ Тестовое воспроизведение ${peerId} не удалось:`, err.message);
                });
            } else {
                console.warn(`⚠️ Аудио от ${peerId} не готово: readyState=${audio.readyState}`);
            }
        });

        if (!hasAudio) {
            console.warn('⚠️ Нет активных аудио потоков для воспроизведения');
        }

        console.groupEnd();
    }
}

// Экспортируем класс
window.VoiceChat = VoiceChat;