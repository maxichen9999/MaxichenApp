package de.maxichen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import de.maxichen.app.CallManager
import de.maxichen.app.Hub
import de.maxichen.app.fmtClock
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import kotlinx.coroutines.delay

/* =====================================================================
   📞 ANRUF-SCREEN (WebRTC)
   ===================================================================== */

@Composable
fun CallScreen2(onClose: () -> Unit) {
    val st by CallManager.state.collectAsState()
    val mic by CallManager.micOn.collectAsState()
    val cam by CallManager.camOn.collectAsState()
    val tracks by CallManager.tracksVersion.collectAsState()
    var seconds by remember { mutableIntStateOf(0) }

    LaunchedEffect(st.mode, st.connected) {
        seconds = 0
        while (st.mode != CallManager.Mode.IDLE) {
            if (CallManager.startedAt > 0) seconds = ((System.currentTimeMillis() - CallManager.startedAt) / 1000).toInt()
            delay(1000)
        }
    }
    if (st.mode == CallManager.Mode.IDLE) return

    Box(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(Color(0xFF12061F), Color(0xFF2D1146), Color(0xFF12061F))),
        ),
    ) {
        // Video (falls aktiv)
        if (st.isVideo) {
            val remote = CallManager.remoteVideo
            if (remote != null && CallManager.eglContext != null) {
                key(tracks) {
                    AndroidView(
                        factory = { ctx ->
                            SurfaceViewRenderer(ctx).apply {
                                try {
                                    init(CallManager.eglContext, null)
                                    setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                                    setEnableHardwareScaler(true)
                                    remote.addSink(this)
                                } catch (e: Exception) {}
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            val local = CallManager.localVideo
            if (local != null && CallManager.eglContext != null) {
                key(tracks) {
                    AndroidView(
                        factory = { ctx ->
                            SurfaceViewRenderer(ctx).apply {
                                try {
                                    init(CallManager.eglContext, null)
                                    setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                                    setMirror(true)
                                    setEnableHardwareScaler(true)
                                    local.addSink(this)
                                } catch (e: Exception) {}
                            }
                        },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 56.dp, end = 14.dp)
                            .size(width = 108.dp, height = 152.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .border(1.dp, V3.neon.copy(alpha = 0.6f), RoundedCornerShape(16.dp)),
                    )
                }
            }
        }

        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(66.dp))
            Text(
                when (st.mode) {
                    CallManager.Mode.OUTGOING -> "Wählt…"
                    CallManager.Mode.INCOMING -> "Eingehender Anruf 💗"
                    CallManager.Mode.ACTIVE -> "Verbunden ✨"
                    else -> ""
                },
                fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = V3.muted,
            )
            Spacer(Modifier.height(14.dp))
            if (!st.isVideo) {
                Box(
                    Modifier.size(120.dp).clip(CircleShape).background(V3.primaryBrush)
                        .border(3.dp, V3.neon.copy(alpha = 0.7f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) { Text(st.peerName.take(1).ifEmpty { "💗" }, fontSize = 46.sp) }
                Spacer(Modifier.height(16.dp))
            }
            Text(st.peerName.ifEmpty { "Unbekannt" }, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                fontSize = 26.sp, color = V3.text)
            Spacer(Modifier.height(4.dp))
            Text(
                if (st.mode == CallManager.Mode.ACTIVE) fmtClock(seconds) else if (st.isVideo) "🎥 Videoanruf" else "🎙️ Sprachanruf",
                fontFamily = Outfit, fontSize = 13.sp, color = V3.neon,
            )
            if (st.error != null) {
                Spacer(Modifier.height(6.dp))
                Text("⚠️ " + st.error, fontFamily = Outfit, fontSize = 11.sp, color = V3.danger)
            }
            Spacer(Modifier.weight(1f))

            // Steuerung
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                CallRoundBtn(if (mic) "🎙️" else "🔇", active = mic) { CallManager.setMic(!mic) }
                if (st.isVideo) CallRoundBtn(if (cam) "📷" else "📷", active = cam) { CallManager.setCam(!cam) }
                CallRoundBtn("🔊", active = true) { Hub.toast("🔊", "Lautsprecher", "System-Lautstärke nutzen") }
            }
            Spacer(Modifier.height(22.dp))

            if (st.mode == CallManager.Mode.INCOMING) {
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    CallRoundBtn("✕", danger = true, size = 64) { CallManager.reject() }
                    CallRoundBtn("📞", active = true, size = 64) { CallManager.acceptIncoming() }
                }
            } else {
                CallRoundBtn("✕", danger = true, size = 64) {
                    CallManager.hangup()
                    onClose()
                }
            }
            Spacer(Modifier.height(26.dp))
            Text("P2P · verschlüsselt · by Maxichen", fontFamily = Outfit, fontSize = 9.sp, color = V3.muted)
            Spacer(Modifier.height(14.dp))
        }
    }
}

@Composable
fun CallRoundBtn(icon: String, active: Boolean = false, danger: Boolean = false, size: Int = 54, onClick: () -> Unit) {
    Box(
        Modifier.size(size.dp).clip(CircleShape)
            .background(
                when {
                    danger -> Brush.linearGradient(listOf(Color(0xFFFF5C7A), Color(0xFFD63356)))
                    active -> Brush.linearGradient(listOf(Color(0x44FF7EDB), Color(0x33C86BFF)))
                    else -> Brush.linearGradient(listOf(Color(0x22FFFFFF), Color(0x18FFFFFF)))
                },
            )
            .border(1.dp, if (danger) Color(0x88FF5C7A) else V3.glassBorder, CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(icon, fontSize = (size * 0.32f).sp) }
}
