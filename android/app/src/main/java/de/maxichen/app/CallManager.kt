package de.maxichen.app

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.CapturerObserver
import org.webrtc.DataChannel
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * 💗 LoveChat Anrufe — 100% nativer WebRTC-Stack.
 * Signaling läuft über den LoveChat-Server (WS "signal" an Chat-Mitglieder).
 * Unterstützt 1:1 Sprach- und Videoanrufe.
 */
object CallManager {
    enum class Mode { IDLE, OUTGOING, INCOMING, ACTIVE }

    data class CallInfo(
        val mode: Mode = Mode.IDLE,
        val chatId: String = "",
        val peerId: String = "",
        val peerName: String = "",
        val isVideo: Boolean = false,
        val connected: Boolean = false,
        val error: String? = null
    )

    val state = MutableStateFlow(CallInfo())
    val micOn = MutableStateFlow(true)
    val camOn = MutableStateFlow(false)
    val tracksVersion = MutableStateFlow(0)
    var startedAt: Long = 0L

    /** EglBase.Context für die SurfaceViewRenderer (vom CallScreen gelesen). */
    var eglContext: EglBase.Context? = null
        private set

    var localVideo: VideoTrack? = null
        private set
    var remoteVideo: VideoTrack? = null
        private set

    private var factory: PeerConnectionFactory? = null
    private var pc: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var localAudio: AudioTrack? = null
    private var videoSource: VideoSource? = null
    private var capturer: CameraVideoCapturer? = null
    private var helper: SurfaceTextureHelper? = null
    private var eglBase: EglBase? = null
    private var pendingOffer: JSONObject? = null
    private var appContext: Context? = null

    fun init(ctx: Context) {
        appContext = ctx.applicationContext
        if (eglBase == null) {
            try { eglBase = EglBase.create() } catch (e: Exception) {}
        }
    }

    private fun bumpTracks() { tracksVersion.value++ }

    private fun ensureFactory(): PeerConnectionFactory? {
        if (factory == null) {
            try {
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(appContext)
                        .setEnableInternalTracer(false)
                        .createInitializationOptions()
                )
            } catch (e: Exception) {}
            try {
                factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
            } catch (e: Exception) {
                return null
            }
        }
        return factory
    }

    private fun createPc() {
        val f = factory ?: return
        try { pc?.close() } catch (e: Exception) {}
        try {
            val cfg = PeerConnection.RTCConfiguration(emptyList())
            cfg.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            // 🔥 V4.7: STUN + TURN mit kurzlebigen Credentials vom Server.
            // Ohne TURN scheitern Anrufe hinter symmetrischem NAT — die App sagt es jetzt auch.
            try {
                cfg.iceServers = IceConfig.servers()
            } catch (e: Exception) {}
            pc = f.createPeerConnection(cfg, object : PeerConnection.Observer {
                override fun onSignalingChange(s: PeerConnection.SignalingState?) {}
                override fun onIceConnectionChange(s: PeerConnection.IceConnectionState?) {
                    if (s == PeerConnection.IceConnectionState.FAILED) fail("Verbindung verloren 💔")
                }
                override fun onIceConnectionReceivingChange(b: Boolean) {}
                override fun onIceGatheringChange(s: PeerConnection.IceGatheringState?) {}
                override fun onIceCandidate(c: IceCandidate?) {
                    if (c == null) return
                    val s = state.value
                    if (s.chatId.isEmpty() || s.peerId.isEmpty()) return
                    Ws.sendSignal(s.chatId, s.peerId, JSONObject()
                        .put("kind", "ice")
                        .put("sdpMid", c.sdpMid ?: "")
                        .put("label", c.sdpMLineIndex)
                        .put("sdp", c.sdp ?: ""))
                }
                override fun onIceCandidatesRemoved(c: Array<out IceCandidate>?) {}
                override fun onAddStream(s: MediaStream?) {}
                override fun onRemoveStream(s: MediaStream?) {}
                override fun onDataChannel(d: DataChannel?) {}
                override fun onRenegotiationNeeded() {}
                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
                    if (newState == PeerConnection.PeerConnectionState.CONNECTED) {
                        if (state.value.mode != Mode.ACTIVE) {
                            startedAt = System.currentTimeMillis()
                            state.value = state.value.copy(mode = Mode.ACTIVE, connected = true)
                            Notifier.stop()
                        }
                    }
                    if (newState == PeerConnection.PeerConnectionState.DISCONNECTED ||
                        newState == PeerConnection.PeerConnectionState.FAILED) {
                        fail("Verbindung getrennt")
                    }
                }
                override fun onTrack(t: RtpTransceiver?) {
                    val track = t?.receiver?.track() ?: return
                    if (track.kind() == "video") {
                        remoteVideo = track as? VideoTrack
                        bumpTracks()
                    } else {
                        // Audio wird automatisch über den AudioDeviceModule wiedergegeben
                        bumpTracks()
                    }
                }
            })
        } catch (e: Exception) {
            fail("Verbindung fehlgeschlagen")
        }
    }

    private fun addLocalAudio() {
        val f = factory ?: return
        val p = pc ?: return
        try {
            audioSource = f.createAudioSource(MediaConstraints())
            localAudio = f.createAudioTrack("lovechat_audio", audioSource)
            localAudio?.setEnabled(micOn.value)
            p.addTrack(localAudio, listOf("lovechat_stream"))
        } catch (e: Exception) {}
    }

    private fun startVideo() {
        val f = factory ?: return
        val ctx = appContext ?: return
        try {
            if (capturer == null) {
                val egl = eglBase ?: EglBase.create().also { eglBase = it }
                eglContext = egl.eglBaseContext
                helper = SurfaceTextureHelper.create("LoveChatCapture", egl.eglBaseContext)
                val enumerator = Camera2Enumerator(ctx)
                val camName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                    ?: enumerator.deviceNames.firstOrNull()
                if (camName != null) {
                    val cap = enumerator.createCapturer(camName, null)
                    capturer = cap
                    videoSource = f.createVideoSource(false)
                    localVideo = f.createVideoTrack("lovechat_video", videoSource)
                    pc?.addTrack(localVideo, listOf("lovechat_stream"))
                    cap.initialize(helper, ctx, videoSource?.capturerObserver)
                    cap.startCapture(640, 480, 30)
                    bumpTracks()
                }
            }
        } catch (e: Exception) {
            camOn.value = false
        }
    }

    private fun stopVideo() {
        try { capturer?.stopCapture() } catch (e: Exception) {}
        try { capturer?.dispose() } catch (e: Exception) {}
        capturer = null
        try { helper?.dispose() } catch (e: Exception) {}
        helper = null
        videoSource?.dispose()
        videoSource = null
        localVideo = null
    }

    fun setMic(on: Boolean) {
        micOn.value = on
        try { localAudio?.setEnabled(on) } catch (e: Exception) {}
    }

    fun setCam(on: Boolean) {
        camOn.value = on
        if (on) startVideo() else {
            stopVideo()
            bumpTracks()
        }
    }

    /* ---------- Anruf starten ---------- */

    fun startOutgoing(chatId: String, peerId: String, peerName: String, isVideo: Boolean) {
        // Credentials auffrischen (nicht blockierend — createPc nimmt den letzten Stand)
        HubScope.launch {
            IceConfig.refresh(force = true)
            if (!IceConfig.turnAvailable) {
                Hub.toast("🔥", "Ohne TURN unterwegs", "Hinter Firewalls/VPN kann der Anruf scheitern — Relay auf dem Server aktivieren (deploy/install-turn.sh)")
            }
        }
        try {
            if (ensureFactory() == null) {
                Hub.toast("📞", "Anrufe nicht möglich", "WebRTC konnte nicht starten")
                return
            }
            state.value = CallInfo(mode = Mode.OUTGOING, chatId = chatId, peerId = peerId, peerName = peerName, isVideo = isVideo)
            startedAt = 0L
            createPc()
            addLocalAudio()
            if (isVideo) setCam(true)
            Notifier.callNotify("LoveChat 📞", "Anruf läuft…")
            createOffer()
        } catch (e: Exception) {
            fail("Anruf-Fehler")
        }
    }

    /** Vom Annehmen-Button im Incoming-Overlay aufgerufen. */
    fun acceptIncoming() {
        val s = state.value
        val offer = pendingOffer
        if (s.mode != Mode.INCOMING) return
        if (offer == null) { Hub.toast("📞", "Angebot fehlt"); cleanup(); return }
        try {
            if (ensureFactory() == null) { Hub.toast("📞", "Anrufe nicht möglich"); reject(); return }
            createPc()
            addLocalAudio()
            if (s.isVideo) setCam(true)
            val desc = SessionDescription(SessionDescription.Type.OFFER, offer.optString("sdp"))
            pc?.setRemoteDescription(simpleSdpObserver("remote"), desc)
            createAnswer()
        } catch (e: Exception) {
            fail("Annehmen fehlgeschlagen")
        }
    }

    fun reject() {
        val s = state.value
        if (s.mode == Mode.INCOMING && s.peerId.isNotEmpty() && s.chatId.isNotEmpty()) {
            Ws.sendSignal(s.chatId, s.peerId, JSONObject().put("kind", "reject"))
        }
        cleanup()
    }

    fun hangup() {
        val s = state.value
        if ((s.mode == Mode.OUTGOING || s.mode == Mode.ACTIVE) && s.peerId.isNotEmpty() && s.chatId.isNotEmpty()) {
            Ws.sendSignal(s.chatId, s.peerId, JSONObject().put("kind", "hangup"))
        }
        cleanup()
    }

    /* ---------- Signaling ---------- */

    fun onSignal(chatId: String, from: String, data: JSONObject?) {
        if (data == null) return
        val s = state.value
        when (data.optString("kind")) {
            "call" -> {
                if (s.mode == Mode.IDLE) {
                    val isVideo = data.optBoolean("video", false)
                    val name = data.optString("name").ifEmpty {
                        Hub.details.value[chatId]?.members?.find { it.id == from }?.displayName ?: "Anruf"
                    }
                    pendingOffer = data.optJSONObject("offer")
                    state.value = CallInfo(mode = Mode.INCOMING, chatId = chatId, peerId = from, peerName = name, isVideo = isVideo)
                    Notifier.callNotify("Eingehender Anruf 💗", name)
                } else {
                    Ws.sendSignal(chatId, from, JSONObject().put("kind", "reject"))
                }
            }
            "sdp" -> {
                if (s.peerId != from) return
                val type = if (data.optString("sdpType") == "offer") SessionDescription.Type.OFFER else SessionDescription.Type.ANSWER
                val desc = SessionDescription(type, data.optString("sdp"))
                pc?.setRemoteDescription(simpleSdpObserver("remote"), desc)
            }
            "ice" -> {
                if (s.peerId != from) return
                try {
                    pc?.addIceCandidate(IceCandidate(data.optString("sdpMid"), data.optInt("label"), data.optString("sdp")))
                } catch (e: Exception) {}
            }
            "reject" -> {
                if (s.peerId == from && s.mode != Mode.IDLE) {
                    Hub.toast("📞", "Anruf abgelehnt", s.peerName)
                    cleanup()
                }
            }
            "hangup" -> {
                if (s.peerId == from && s.mode != Mode.IDLE) cleanup()
            }
        }
    }

    private fun simpleSdpObserver(tag: String) = object : SdpObserver {
        override fun onCreateSuccess(p0: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(p0: String?) {}
        override fun onSetFailure(p0: String?) {}
    }

    private fun createOffer() {
        val p = pc ?: return
        p.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                if (sdp == null) { fail("Offer fehlgeschlagen"); return }
                p.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        val s = state.value
                        if (s.chatId.isEmpty() || s.peerId.isEmpty()) return
                        Ws.sendSignal(s.chatId, s.peerId, JSONObject()
                            .put("kind", "call")
                            .put("video", s.isVideo)
                            .put("name", Hub.user.value?.displayName ?: "")
                            .put("offer", JSONObject().put("sdp", sdp.description).put("sdpType", "offer")))
                    }
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                }, sdp)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(e: String?) { fail("Offer fehlgeschlagen") }
            override fun onSetFailure(e: String?) {}
        }, MediaConstraints())
    }

    private fun createAnswer() {
        val p = pc ?: return
        p.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                if (sdp == null) { fail("Answer fehlgeschlagen"); return }
                p.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        val s = state.value
                        if (s.chatId.isEmpty() || s.peerId.isEmpty()) return
                        Ws.sendSignal(s.chatId, s.peerId, JSONObject()
                            .put("kind", "sdp")
                            .put("sdpType", "answer")
                            .put("sdp", sdp.description))
                    }
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                }, sdp)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(e: String?) { fail("Answer fehlgeschlagen") }
            override fun onSetFailure(e: String?) {}
        }, MediaConstraints())
    }

    private fun fail(msg: String) {
        Hub.toast("📞", msg)
        cleanup()
    }

    fun cleanup() {
        pendingOffer = null
        Notifier.stop()
        stopVideo()
        try { localAudio?.dispose() } catch (e: Exception) {}
        localAudio = null
        try { audioSource?.dispose() } catch (e: Exception) {}
        audioSource = null
        remoteVideo = null
        try { pc?.close() } catch (e: Exception) {}
        pc = null
        micOn.value = true
        camOn.value = false
        startedAt = 0L
        state.value = CallInfo()
        bumpTracks()
    }
}
