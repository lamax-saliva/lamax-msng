// call.js — логика звонков (WebRTC + Socket.IO)
function initCallSystem(socket, currentUser, currentNick) {
    /* ==== DOM ==== */
    const callBtn = document.getElementById("call-button");
    const videoCallBtn = document.getElementById("video-call-button");
    const callWindow = document.getElementById("call-window");
    const callUserName = document.getElementById("call-user-name");
    const callStatusText = document.getElementById("call-status-text");
    const acceptCallBtn = document.getElementById("accept-call-window-btn");
    const cancelCallBtn = document.getElementById("cancel-call-btn");
    const minimizeCallBtn = document.getElementById("minimize-call-btn");
    const toggleVideoBtn = document.getElementById("toggle-video-btn");
    const inCallUI = document.getElementById("in-call-ui");
    const callStatus = document.getElementById("call-status");
    const muteBtn = document.getElementById("mute-btn");
    const hangupBtn = document.getElementById("hangup-btn");
    const remoteVideo = document.getElementById("remote-video");
    const localVideo = document.getElementById("local-video");
    const remoteAudio = document.getElementById("remote-audio");
    const ringtone = document.getElementById("ringtone");

    /* ==== state ==== */
    let currentPeerUsername = null;
    let isIncomingVideo = false; // тип входящего звонка
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    let pc = null, localStream = null;
    let isMuted = false;
    let isVideoEnabled = true;

    /* ==== helpers ==== */
    async function startPeer(isOffer, withVideo=false) {
        pc = new RTCPeerConnection(rtcConfig);

        pc.ontrack = e => {
            if (e.streams[0].getVideoTracks().length > 0) {
                remoteVideo.srcObject = e.streams[0];
                remoteVideo.style.display = "block";
            } else {
                remoteAudio.srcObject = e.streams[0];
            }
        };

        pc.onicecandidate = e => {
            if (e.candidate && currentPeerUsername) {
                socket.emit("webrtc:ice", { toUsername: currentPeerUsername, candidate: e.candidate });
            }
        };

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

        if (withVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.display = "block";
        } else {
            localVideo.style.display = "none";
        }

        if (isOffer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("webrtc:offer", { toUsername: currentPeerUsername, sdp: offer });
        }
    }

    function endCall() {
        if (pc) pc.close();
        pc = null;
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        callWindow.style.display = "none";
        inCallUI.style.display = "none";
        currentPeerUsername = null;
        ringtone.pause(); ringtone.currentTime = 0;
        remoteVideo.srcObject = null;
        localVideo.srcObject = null;
    }

    /* ==== кнопки ==== */
    callBtn.addEventListener("click", () => {
        if (!currentPeerUsername) return alert("Выберите пользователя для звонка");
        inCallUI.style.display = "block";
        callStatus.textContent = `Звонок ${currentPeerUsername}…`;
        socket.emit("call:invite", {
            toUsername: currentPeerUsername,
            fromUsername: currentUser,
            fromNickname: currentNick,
            video: false
        });
    });

    videoCallBtn.addEventListener("click", () => {
        if (!currentPeerUsername) return alert("Выберите пользователя для видеозвонка");
        inCallUI.style.display = "block";
        callStatus.textContent = `Видеозвонок ${currentPeerUsername}…`;
        socket.emit("call:invite", {
            toUsername: currentPeerUsername,
            fromUsername: currentUser,
            fromNickname: currentNick,
            video: true
        });
    });

    acceptCallBtn.addEventListener("click", async () => {
        callWindow.style.display = "none";
        inCallUI.style.display = "block";
        ringtone.pause(); ringtone.currentTime = 0;
        socket.emit("call:accept", { toUsername: currentPeerUsername, video: isIncomingVideo });
        await startPeer(false, isIncomingVideo);
    });

    cancelCallBtn.addEventListener("click", () => {
        socket.emit("call:reject", { toUsername: currentPeerUsername });
        endCall();
    });

    hangupBtn.addEventListener("click", () => {
        socket.emit("call:hangup", { toUsername: currentPeerUsername });
        endCall();
    });

    muteBtn.addEventListener("click", () => {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        muteBtn.textContent = isMuted ? "Unmute" : "Mute";
    });

    toggleVideoBtn.addEventListener("click", () => {
        if (!localStream) return;
        isVideoEnabled = !isVideoEnabled;
        localStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
        toggleVideoBtn.innerHTML = isVideoEnabled ? `<i class="fas fa-video"></i>` : `<i class="fas fa-video-slash"></i>`;
    });

    minimizeCallBtn.addEventListener("click", () => {
        callWindow.style.display = "none";
        inCallUI.style.display = "block";
    });

    /* ==== socket ==== */
    socket.on("call:incoming", ({ fromUsername, video }) => {
        currentPeerUsername = fromUsername;
        isIncomingVideo = video;
        callWindow.style.display = "block";
        callUserName.textContent = fromUsername;
        callStatusText.textContent = video ? "Входящий видеозвонок" : "Входящий звонок";

        ringtone.loop = true;
        ringtone.currentTime = 0;
        ringtone.play().catch(()=>{});
    });

    socket.on("call:accepted", async ({ video }) => {
        callStatus.textContent = "Соединение установлено";
        await startPeer(true, video);
    });

    socket.on("call:rejected", () => {
        alert("Звонок отклонён");
        endCall();
    });

    socket.on("call:hungup", () => {
        alert("Звонок завершён");
        endCall();
    });

    socket.on("webrtc:offer", async ({ sdp }) => {
        if (!pc) await startPeer(false, isIncomingVideo);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { toUsername: currentPeerUsername, sdp: answer });
    });

    socket.on("webrtc:answer", async ({ sdp }) => {
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socket.on("webrtc:ice", async ({ candidate }) => {
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    return {
        setPeer: (username) => { currentPeerUsername = username; },
        endCall
    };
}
