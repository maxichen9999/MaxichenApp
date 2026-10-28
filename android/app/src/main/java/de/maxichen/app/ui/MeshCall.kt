package de.maxichen.app.ui

/* =====================================================================
   🎧 V4.5 — GRUPPEN-CALL-SCREEN (Mesh, Audio)
   Zeigt alle Teilnehmer als Glas-Kugeln: verbunden = pinker Ring,
   verbindet = pulsierender Ring. Unten Mikro + Auflegen.
   ===================================================================== */

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.CallMesh
import de.maxichen.app.Hub
import de.maxichen.app.fmtClock
import kotlinx.coroutines.delay

@Composable
fun MeshCallScreen(onClose: () -> Unit) {
    val st by CallMesh.state.collectAsState()
    val peers by CallMesh.peers.collectAsState()
    val live by CallMesh.connected.collectAsState()
    var seconds by remember { mutableIntStateOf(0) }

    LaunchedEffect(st.active) {
        seconds = 0
        while (st.active) {
            delay(1000)
            seconds++
        }
    }

    if (!st.active) return

    Box(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(Color(0xFF12061F), Color(0xFF33124F), Color(0xFF12061F))),
        ),
    ) {
        Column(Modifier.fillMaxSize().padding(top = 54.dp, bottom = 30.dp, start = 18.dp, end = 18.dp)) {
            Text("Gruppen-Call", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Color.White)
            Text(
                st.chatName.ifEmpty { "Mesh · " + (peers.size + 1) + " Personen" },
                fontFamily = Outfit, fontSize = 11.sp, color = Color(0xFFFFA9D6),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                when {
                    st.error != null -> "💔 " + st.error
                    st.starting -> "Verbinde…"
                    else -> fmtClock(seconds) + " · " + live.size + "/" + (peers.size + 1) + " verbunden"
                },
                fontFamily = Outfit, fontSize = 12.sp, color = Color(0xFFE9D7FF),
            )
            Spacer(Modifier.height(18.dp))

            val all = listOf(CallMesh.MeshPeer(Hub.user.value?.id ?: "me", "Du")) + peers
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                items(all) { p ->
                    val mine = p.id == (Hub.user.value?.id ?: "me")
                    val ok = mine || live.contains(p.id)
                    PeerBlob(p.name.ifEmpty { "?" }, ok, mine)
                }
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CallBtn(if (st.muted) "🔇" else "🎤", st.muted) { CallMesh.toggleMute() }
                CallBtn("📞", true, danger = true) {
                    CallMesh.leave()
                    onClose()
                }
            }
        }
    }
}

@Composable
private fun PeerBlob(name: String, connected: Boolean, mine: Boolean) {
    val pulse by rememberInfiniteTransition(label = "p").animateFloat(
        initialValue = 1f, targetValue = 1.06f,
        animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "pulse",
    )
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .scale(if (connected) 1f else pulse)
                .clip(RoundedCornerShape(28.dp))
                .background(
                    if (connected) Brush.linearGradient(listOf(Color(0x33FF7EDB), Color(0x22A97BFF)))
                    else Brush.linearGradient(listOf(Color(0x22FFFFFF), Color(0x11FFFFFF))),
                )
                .border(
                    if (connected) 2.dp else 1.dp,
                    if (connected) Color(0xFFFF7EDB) else Color(0x33FFFFFF),
                    RoundedCornerShape(28.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.size(52.dp).clip(CircleShape)
                        .background(if (connected) Color(0xFFFF7EDB) else Color(0x33FFFFFF)),
                    contentAlignment = Alignment.Center,
                ) { Text(if (mine) "💗" else name.take(1).uppercase(), fontSize = 22.sp, color = Color(0xFF2B1030)) }
                Spacer(Modifier.height(8.dp))
                Text(
                    name, fontFamily = Outfit, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    color = Color.White, maxLines = 1, textAlign = TextAlign.Center,
                )
                Text(
                    if (connected) (if (mine) "Du" else "verbunden") else "verbinde…",
                    fontFamily = Outfit, fontSize = 9.sp, color = Color(0x99FFFFFF),
                )
            }
        }
        if (mine) Spacer(Modifier.height(6.dp))
    }
}

@Composable
private fun CallBtn(icon: String, active: Boolean, danger: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .size(if (danger) 64.dp else 58.dp)
            .clip(CircleShape)
            .background(
                when {
                    danger -> Brush.linearGradient(listOf(Color(0xFFE8546E), Color(0xFFB22B48)))
                    active -> Brush.linearGradient(listOf(Color(0xFFFF7EDB), Color(0xFFA97BFF)))
                    else -> Brush.linearGradient(listOf(Color(0x33FFFFFF), Color(0x22FFFFFF)))
                },
            )
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(icon, fontSize = if (danger) 24.sp else 20.sp) }
}
