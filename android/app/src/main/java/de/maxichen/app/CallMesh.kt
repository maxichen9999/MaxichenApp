package de.maxichen.app

/* =====================================================================
   👥 V4.5 — GRUPPEN-CALL-MESH (AUDIO, bis 8)
   ---------------------------------------------------------------------
   Echter Full-Mesh: jede Person hält zu jeder anderen eine eigene
   PeerConnection (N-1 Verbindungen). Kein SFU, kein Relay über den
   Server — der Server macht nur:
   • Raum-Verwaltung (max. 8, /api/calls/:chatId/join)
   • Weiterleiten von SDP + ICE (WS "signal")

   Regeln gegen SDP-Glare:
   • wer dem Raum BEITRITT, bietet allen Anwesenden an
   • wer schon drin ist, wartet auf das Angebot
   • Audio läuft über den AudioDeviceModule automatisch (Mischen
     übernimmt WebRTC), ein Mikrofon-Track wird an alle PCs gelegt
   ===================================================================== */

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription

object CallMesh {
    data class MeshState(
        val active: Boolean = false,
        val chatId: String = "",
        val chatName: String = "",
        val muted: Boolean = false,
        val starting: Boolean = false,
        val error: String? = null,
    )

    data class MeshPeer(val id: String, val name: String)

    val state = MutableStateFlow(MeshState())
    val peers = MutableStateFlow<List<MeshPeer>>(emptyList())
    val connected = MutableStateFlow<Set<String>>(emptySet())
    /** Einladung: chatId → Name (Banner im Chat) */
    val invite = MutableStateFlow<Pair<String, String>?>(null)

    private var factory: PeerConnectionFactory? = null
    private var audioSource: AudioSource? = null
    private var localTrack: AudioTrack? = null
    private var appContext: Context? = null
    private val pcs = HashMap<String, PeerConnection>()
    private val offersSent = HashSet<String>()

    /* ------------------------- Setup ------------------------- */

    private fun ensureFactory(): PeerConnectionFactory? {
        if (factory != null) return factory
        val ctx = appContext ?: return null
        try {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(ctx)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions()
            )
        } catch (e: Exception) {}
        factory = try {
            PeerConnectionFactory.builder().createPeerConnectionFactory()
        } catch (e: Exception) {
            null
        }
        return factory
    }

    private fun ensureAudio() {
        val f = ensureFactory() ?: return
        if (localTrack != null) return
        try {
            audioSource = f.createAudioSource(MediaConstraints())
            localTrack = f.createAudioTrack("maxichat_mesh_audio", audioSource)
            localTrack?.setEnabled(!state.value.muted)
        } catch (e: Exception) {}
    }

    // 🔥 V4.7: kommt aus /api/rtc/ice (STUN + TURN, kurzlebig signiert)
    private fun iceServers(): List<PeerConnection.IceServer> = try {
        IceConfig.servers()
    } catch (e: Exception) {
        emptyList()
    }

    private fun observer(peerId: String) = object : PeerConnection.Observer {
        override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
        override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
        override fun onIceConnectionReceivingChange(p0: Boolean) {}
        override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}

        override fun onIceCandidate(c: IceCandidate?) {
            if (c == null) return
            val s = state.value
            if (!s.active) return
            Ws.sendSignal(
                s.chatId, peerId,
                JSONObject()
                    .put("kind", "mesh-ice")
                    .put("sdpMid", c.sdpMid ?: "")
                    .put("label", c.sdpMLineIndex)
                    .put("sdp", c.sdp ?: ""),
            )
        }

        override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
        override fun onAddStream(p0: MediaStream?) {}
        override fun onRemoveStream(p0: MediaStream?) {}
        override fun onDataChannel(p0: DataChannel?) {}
        override fun onRenegotiationNeeded() {}

        override fun onTrack(t: RtpTransceiver?) {
            // Audio wird vom AudioDeviceModule automatisch abgespielt
            connected.value = connected.value + peerId
        }

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            when (newState) {
                PeerConnection.PeerConnectionState.CONNECTED ->
                    connected.value = connected.value + peerId
                PeerConnection.PeerConnectionState.FAILED,
                PeerConnection.PeerConnectionState.CLOSED ->
                    dropPeer(peerId)
                else -> {}
            }
        }
    }

    private fun pcFor(peer: MeshPeer): PeerConnection? {
        pcs[peer.id]?.let { return it }
        val f = ensureFactory() ?: return null
        val cfg = PeerConnection.RTCConfiguration(emptyList())
        cfg.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        cfg.iceServers = iceServers()
        val pc = try {
            f.createPeerConnection(cfg, observer(peer.id))
        } catch (e: Exception) {
            null
        } ?: return null
        pcs[peer.id] = pc
        localTrack?.let {
            try { pc.addTrack(it, listOf("maxichat_mesh")) } catch (e: Exception) {}
        }
        return pc
    }

    /* ------------------------- Raum ------------------------- */

    fun join(ctx: Context, chatId: String, chatName: String, meId: String) {
        appContext = ctx.applicationContext
        if (state.value.active) return
        state.value = MeshState(active = true, chatId = chatId, chatName = chatName, starting = true)
        peers.value = emptyList()
        connected.value = emptySet()
        pcs.values.forEach { try { it.close() } catch (e: Exception) {} }
        pcs.clear()
        offersSent.clear()
        ensureAudio()
        invite.value = null

        HubScope.launch {
            try {
                // erst frische ICE-Credentials, dann Räume bauen (sonst nur STUN)
                IceConfig.refresh(force = true)
                if (!IceConfig.turnAvailable) {
                    Hub.toast("🔥", "Mesh ohne TURN", "Bei strengen NATs/Firewalls verbinden sich nicht alle — Relay aktivieren")
                }
                val res = Api.post("/api/calls/" + chatId + "/join")
                val arr = res.optJSONArray("peers") ?: JSONArray()
                val list = (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    MeshPeer(o.optString("userId"), o.optString("name"))
                }.filter { it.id.isNotEmpty() && it.id != meId }
                peers.value = list
                state.value = state.value.copy(starting = false)
                // Neu-Beigetretene bieten an → kein Glare
                list.forEach { offerTo(it) }
            } catch (e: ApiError) {
                state.value = MeshState(error = e.msg)
            } catch (e: Exception) {
                state.value = MeshState(error = "Call konnte nicht starten 💔")
            }
        }
    }

    fun leave() {
        val s = state.value
        if (s.chatId.isNotEmpty()) {
            HubScope.launch { try { Api.post("/api/calls/" + s.chatId + "/leave") } catch (e: Exception) {} }
        }
        pcs.values.forEach { try { it.close() } catch (e: Exception) {} }
        pcs.clear()
        offersSent.clear()
        try { localTrack?.setEnabled(false) } catch (e: Exception) {}
        state.value = MeshState()
        peers.value = emptyList()
        connected.value = emptySet()
        invite.value = null
    }

    fun toggleMute() {
        val m = !state.value.muted
        state.value = state.value.copy(muted = m)
        try { localTrack?.setEnabled(!m) } catch (e: Exception) {}
    }

    /* ------------------------- Signaling ------------------------- */

    private fun offerTo(peer: MeshPeer) {
        if (offersSent.contains(peer.id)) return
        val pc = pcFor(peer) ?: return
        offersSent.add(peer.id)
        try {
            pc.createOffer(object : SdpObserver {
                override fun onCreateSuccess(sdp: SessionDescription?) {
                    if (sdp == null) return
                    pc.setLocalDescription(object : SdpObserver {
                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onSetSuccess() {
                            val s = state.value
                            if (!s.active) return
                            Ws.sendSignal(
                                s.chatId, peer.id,
                                JSONObject().put("kind", "mesh-offer").put("sdp", sdp.description ?: ""),
                            )
                        }
                        override fun onCreateFailure(p0: String?) {}
                        override fun onSetFailure(p0: String?) {}
                    }, sdp)
                }
                override fun onSetSuccess() {}
                override fun onCreateFailure(p0: String?) {}
                override fun onSetFailure(p0: String?) {}
            }, MediaConstraints())
        } catch (e: Exception) {}
    }

    private fun sendAnswer(peerId: String, sdp: SessionDescription) {
        val s = state.value
        if (!s.active) return
        Ws.sendSignal(
            s.chatId, peerId,
            JSONObject().put("kind", "mesh-answer").put("sdp", sdp.description ?: ""),
        )
    }

    /** WS: jemand anderes ist dem Call beigetreten. */
    fun onPeerJoined(chatId: String, peer: MeshPeer) {
        val s = state.value
        if (s.active && s.chatId == chatId) {
            if (peers.value.none { it.id == peer.id }) peers.value = peers.value + peer
            ensureAudio()
            return
        }
        // ich bin nicht drin → Einladung anzeigen
        if (peer.name.isNotEmpty()) invite.value = chatId to peer.name
    }

    fun onPeerLeft(userId: String) = dropPeer(userId)

    fun onSignal(from: String, data: JSONObject?) {
        val s = state.value
        if (!s.active || data == null || from.isEmpty()) return
        val kind = data.optString("kind")
        if (!kind.startsWith("mesh-")) return

        val peer = peers.value.find { it.id == from }
            ?: MeshPeer(from, "").also { peers.value = peers.value + it }

        when (kind) {
            "mesh-offer" -> {
                val pc = pcFor(peer) ?: return
                val remote = SessionDescription(SessionDescription.Type.OFFER, data.optString("sdp"))
                pc.setRemoteDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        pc.createAnswer(object : SdpObserver {
                            override fun onCreateSuccess(answer: SessionDescription?) {
                                if (answer == null) return
                                pc.setLocalDescription(object : SdpObserver {
                                    override fun onCreateSuccess(p0: SessionDescription?) {}
                                    override fun onSetSuccess() = sendAnswer(from, answer)
                                    override fun onCreateFailure(p0: String?) {}
                                    override fun onSetFailure(p0: String?) {}
                                }, answer)
                            }
                            override fun onSetSuccess() {}
                            override fun onCreateFailure(p0: String?) {}
                            override fun onSetFailure(p0: String?) {}
                        }, MediaConstraints())
                    }
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                }, remote)
            }
            "mesh-answer" -> {
                val pc = pcs[from] ?: return
                val remote = SessionDescription(SessionDescription.Type.ANSWER, data.optString("sdp"))
                try { pc.setRemoteDescription(simpleObserver(), remote) } catch (e: Exception) {}
            }
            "mesh-ice" -> {
                val pc = pcs[from] ?: return
                try {
                    pc.addIceCandidate(
                        IceCandidate(data.optString("sdpMid"), data.optInt("label"), data.optString("sdp")),
                    )
                } catch (e: Exception) {}
            }
            "mesh-hangup" -> dropPeer(from)
        }
    }

    private fun simpleObserver() = object : SdpObserver {
        override fun onCreateSuccess(p0: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(p0: String?) {}
        override fun onSetFailure(p0: String?) {}
    }

    private fun dropPeer(peerId: String) {
        try { pcs.remove(peerId)?.close() } catch (e: Exception) {}
        peers.value = peers.value.filter { it.id != peerId }
        connected.value = connected.value - peerId
        offersSent.remove(peerId)
    }
}
