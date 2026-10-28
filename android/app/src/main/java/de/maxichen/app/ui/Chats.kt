package de.maxichen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*

/* =====================================================================
   💬 CHAT-LISTE
   ===================================================================== */

@Composable
fun ChatsTab(onOpenChat: (String) -> Unit, onNewChat: () -> Unit) {
    val chats by Hub.chats.collectAsState()
    val online by Hub.online.collectAsState()
    val me by Hub.user.collectAsState()
    var q by remember { mutableStateOf("") }
    var showArchive by remember { mutableStateOf(false) }
    var favOnly by remember { mutableStateOf(false) }

    val base = chats.filter { !it.archived && it.type != "community" && it.type != "channel" }
    val archived = chats.filter { it.archived }
    val list = (if (showArchive) archived else base)
        .filter { q.isBlank() || it.name.contains(q, true) || it.lastText.contains(q, true) }
        .filter { !favOnly || Hub.isFavorite(it.id) }
        .sortedWith(compareByDescending<ChatSummary> { Hub.isFavorite(it.id) }.thenByDescending { it.lastCreatedAt })

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Title3("Chats 💬", 23)
                Muted3(
                    if (me?.isOwner == true) "Owner-Modus 👑 · alles unter Kontrolle"
                    else "Hey " + (me?.displayName ?: "") + " 💗", 11, 1,
                )
            }
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(V3.primaryBrush).clickable { onNewChat() },
                contentAlignment = Alignment.Center,
            ) { Text("＋", fontSize = 20.sp, color = V3.ink) }
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            V2TextField(q, { q = it }, "Chats durchsuchen…", minHeight = 46, leading = "🔍")
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ChipFilter("Alle", !favOnly && !showArchive) { favOnly = false; showArchive = false }
            ChipFilter("💗 Favoriten", favOnly) { favOnly = true; showArchive = false }
            ChipFilter("📦 Archiv" + if (archived.isEmpty()) "" else " " + archived.size, showArchive) { showArchive = true; favOnly = false }
        }
        Spacer(Modifier.height(6.dp))

        if (list.isEmpty()) {
            EmptyState(
                if (showArchive) "📦" else "💬",
                if (showArchive) "Archiv ist leer" else "Noch keine Chats",
                if (showArchive) "Archivierte Chats landen hier" else "Starte mit ＋ einen Chat 💗",
            )
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(list.size) { i ->
                    val c = list[i]
                    ChatRow(c, c.members.any { it in online && it != me?.id }, onClick = { onOpenChat(c.id) })
                }
                item { Spacer(Modifier.height(96.dp)) }
            }
        }
    }
}

@Composable
fun ChipFilter(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50))
            .background(if (active) Color(0x33FF7EDB) else V3.glass)
            .border(1.dp, if (active) V3.neon.copy(alpha = 0.6f) else V3.glassBorder, RoundedCornerShape(50))
            .clickable { onClick() }.padding(horizontal = 11.dp, vertical = 5.dp),
    ) {
        Text(label, fontFamily = Outfit, fontSize = 10.5.sp, fontWeight = FontWeight.Bold,
            color = if (active) V3.neon else V3.muted, maxLines = 1)
    }
}

@Composable
fun ChatRow(c: ChatSummary, online: Boolean, onClick: () -> Unit) {
    val typing by Hub.typing.collectAsState()
    val fav = Hub.isFavorite(c.id)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(V3.glass)
            .border(1.dp, V3.glassBorder, RoundedCornerShape(20.dp))
            .clickable { onClick() }.padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar3(c.avatar.ifEmpty { if (c.type == "channel") "📢" else if (c.type == "community") "🏰" else c.name.take(1) }, 48, online)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.name.ifEmpty { "Chat" }, fontFamily = Outfit, fontWeight = FontWeight.Bold,
                    fontSize = 13.5.sp, color = V3.text, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, false))
                if (fav) { Spacer(Modifier.width(3.dp)); Text("💗", fontSize = 9.sp) }
                if (c.mutedUntil > System.currentTimeMillis()) { Spacer(Modifier.width(3.dp)); Text("🔕", fontSize = 9.sp) }
                if (c.pinned != null) { Spacer(Modifier.width(3.dp)); Text("📌", fontSize = 9.sp) }
            }
            Spacer(Modifier.height(2.dp))
            val t = typing[c.id]
            if (t != null) {
                Text("$t tippt…", fontFamily = Outfit, fontSize = 11.sp, color = V3.neon)
            } else {
                val preview = c.lastText.ifEmpty {
                    when {
                        c.type == "channel" -> "Kanal"
                        c.type == "community" -> "Community"
                        c.lastImage -> "📷 Foto"
                        else -> "Noch keine Nachricht"
                    }
                }
                Muted3(preview, 11, 1)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Muted3(fmtTime(c.lastCreatedAt), 9, 1)
            Spacer(Modifier.height(3.dp))
            if (c.unread > 0) {
                Box(Modifier.size(19.dp).clip(CircleShape).background(V3.neon), contentAlignment = Alignment.Center) {
                    Text(c.unread.toString(), fontFamily = Outfit, fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = V3.ink)
                }
            } else if (c.type != "private") {
                Chip3(if (c.type == "channel") "Kanal" else c.count.toString(), if (c.type == "channel") V3.blue else V3.muted)
            }
        }
    }
}

/* =====================================================================
   📞 ANRUFE
   ===================================================================== */

@Composable
fun CallsTab() {
    val chats by Hub.chats.collectAsState()
    val online by Hub.online.collectAsState()
    var pick by remember { mutableStateOf(false) }
    val privates = chats.filter { it.type == "private" }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Title3("Anrufe 📞", 23)
                Muted3("1:1 · Gruppen · Bildschirm teilen", 11, 1)
            }
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(V3.primaryBrush).clickable { pick = true },
                contentAlignment = Alignment.Center,
            ) { Text("📞", fontSize = 16.sp) }
        }
        Spacer(Modifier.height(12.dp))
        GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔒", fontSize = 18.sp)
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("Peer-to-Peer & verschlüsselt", fontFamily = Outfit, fontWeight = FontWeight.Bold,
                        fontSize = 12.5.sp, color = V3.text)
                    Muted3("Sprachanrufe laufen direkt zwischen euch.", 10, 2)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        if (privates.isEmpty()) {
            EmptyState("📞", "Noch keine Kontakte", "Starte oben einen Anruf")
        } else {
            Text("Kontakte", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                color = V3.text, modifier = Modifier.padding(horizontal = 18.dp, vertical = 6.dp))
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)) {
                items(privates.size) { i ->
                    val c = privates[i]
                    val peer = c.members.firstOrNull { it != Hub.user.value?.id } ?: ""
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp)).padding(9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar3(c.avatar.ifEmpty { "💗" }, 42, online = peer in online)
                        Spacer(Modifier.width(9.dp))
                        Text(c.name, fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                            color = V3.text, modifier = Modifier.weight(1f), maxLines = 1)
                        Box(
                            Modifier.size(36.dp).clip(CircleShape).background(Color(0x337EB8FF)).clickable {
                                CallManager.startOutgoing(c.id, peer, c.name, false)
                            }, contentAlignment = Alignment.Center,
                        ) { Text("📞", fontSize = 14.sp) }
                        Spacer(Modifier.width(6.dp))
                        Box(
                            Modifier.size(36.dp).clip(CircleShape).background(Color(0x33FF7EDB)).clickable {
                                CallManager.startOutgoing(c.id, peer, c.name, true)
                            }, contentAlignment = Alignment.Center,
                        ) { Text("🎥", fontSize = 14.sp) }
                    }
                }
                item { Spacer(Modifier.height(96.dp)) }
            }
        }
    }

    if (pick) {
        CallPickerSheet(onDismiss = { pick = false }, onCall = { chat, video ->
            pick = false
            val peer = chat.members.firstOrNull { it != Hub.user.value?.id } ?: ""
            CallManager.startOutgoing(chat.id, peer, chat.name, video)
        })
    }
}

@Composable
fun CallPickerSheet(onDismiss: () -> Unit, onCall: (ChatSummary, Boolean) -> Unit) {
    val chats by Hub.chats.collectAsState()
    var video by remember { mutableStateOf(false) }
    val privates = chats.filter { it.type == "private" }
    Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable { onDismiss() }) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().heightIn(max = 560.dp)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Color(0xFF1B0F2E))
                .border(1.dp, V3.glassBorder, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .clickable { }.padding(18.dp),
        ) {
            Title3("Wen anrufen? 📞", 18)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ChipFilter("🎙️ Voice", !video) { video = false }
                ChipFilter("🎥 Video", video) { video = true }
            }
            Spacer(Modifier.height(8.dp))
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                items(privates.size) { i ->
                    val c = privates[i]
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(V3.glass)
                            .clickable { onCall(c, video) }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar3(c.avatar.ifEmpty { "💗" }, 40)
                        Spacer(Modifier.width(9.dp))
                        Text(c.name, fontFamily = Outfit, fontSize = 13.sp, color = V3.text, modifier = Modifier.weight(1f))
                        Text(if (video) "🎥" else "📞", fontSize = 16.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            GhostButton3("Abbrechen") { onDismiss() }
        }
    }
}
