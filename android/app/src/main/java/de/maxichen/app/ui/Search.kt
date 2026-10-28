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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch

/* =====================================================================
   🔍 NACHRICHTEN-SUCHE (alle Chats)
   ===================================================================== */

@Composable
fun MessageSearchScreen(onBack: () -> Unit, onOpenChat: (String) -> Unit) {
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<SearchHit>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var searched by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun run() {
        if (q.trim().length < 2) { Hub.toast("⚠️", "Mindestens 2 Zeichen", ""); return }
        scope.launch {
            busy = true
            try { hits = Api4.searchMessages(q.trim()) } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            busy = false; searched = true
        }
    }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Title3("Suche 🔍", 20)
                Muted3("Über alle Chats · Nachrichten", 10, 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { V2TextField(q, { q = it }, "Suchbegriff…", minHeight = 48, leading = "🔎") }
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(15.dp)).background(V3.primaryBrush).clickable { run() },
                contentAlignment = Alignment.Center) { if (busy) Spinner(V3.ink) else Text("➤", fontSize = 16.sp, color = V3.ink) }
        }
        Spacer(Modifier.height(10.dp))

        when {
            busy -> Box(Modifier.fillMaxWidth().padding(26.dp), contentAlignment = Alignment.Center) { Spinner() }
            hits.isEmpty() -> EmptyState("🔍", if (searched) "Nichts gefunden" else "Wonach suchst du?",
                if (searched) "Versuch es mit einem anderen Wort" else "Durchsucht alle deine Chats")
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)) {
                item {
                    Muted3(hits.size.toString() + " Treffer", 10, 1, Modifier.padding(vertical = 4.dp))
                }
                items(hits.size) { i ->
                    val h = hits[i]
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(15.dp))
                            .clickable { onOpenChat(h.chatId) }.padding(10.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(h.chatName, fontFamily = Outfit, fontWeight = FontWeight.Bold,
                                fontSize = 12.sp, color = V3.neon, maxLines = 1, modifier = Modifier.weight(1f))
                            Muted3(fmtDate(h.createdAt), 8, 1)
                        }
                        Spacer(Modifier.height(2.dp))
                        Text(h.text.ifEmpty { if (h.kind == "photo") "📷 Foto" else "📎 Anhang" },
                            fontFamily = Outfit, fontSize = 11.5.sp, color = V3.text, maxLines = 3)
                        Spacer(Modifier.height(1.dp))
                        Muted3(h.senderName, 8.5, 1)
                    }
                }
                item { Spacer(Modifier.height(20.dp)) }
            }
        }
    }
}

/* =====================================================================
   ⏰ GEPLANTE NACHRICHTEN
   ===================================================================== */

@Composable
fun ScheduledListScreen(onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<ScheduledMsg>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try { list = Api4.scheduled() } catch (e: Exception) {}
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Title3("Geplant ⏰", 20)
                Muted3("Nachrichten, die später rausgehen", 10, 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        when {
            loading -> Box(Modifier.fillMaxWidth().padding(26.dp), contentAlignment = Alignment.Center) { Spinner() }
            list.isEmpty() -> EmptyState("⏰", "Nichts geplant", "Im Chat: ＋ → ⏰")
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)) {
                items(list.size) { i ->
                    val s = list[i]
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(15.dp)).padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(s.chatName, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, color = V3.neon)
                                Spacer(Modifier.width(5.dp))
                                Chip3(fmtDate(s.at), V3.gold)
                            }
                            Spacer(Modifier.height(2.dp))
                            Text(s.text, fontFamily = Outfit, fontSize = 11.5.sp, color = V3.text, maxLines = 2)
                        }
                        Spacer(Modifier.width(6.dp))
                        Box(
                            Modifier.size(32.dp).clip(CircleShape).background(Color(0x33FF5C7A)).clickable {
                                scope.launch {
                                    try { Api4.cancelScheduled(s.id); list = list.filterNot { it.id == s.id }; Hub.toast("🗑", "Abgesagt") }
                                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                }
                            }, contentAlignment = Alignment.Center,
                        ) { Text("✕", fontSize = 12.sp, color = V3.danger) }
                    }
                }
                item { Spacer(Modifier.height(20.dp)) }
            }
        }
    }
}

/* =====================================================================
   🚫 BLOCKIERTE NUTZER
   ===================================================================== */

@Composable
fun BlockedListScreen(onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<BlockedUser>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var q by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try { list = Api4.blocks() } catch (e: Exception) {}
        loading = false
    }
    LaunchedEffect(Unit) { reload() }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Title3("Blockiert 🚫", 20)
                Muted3("Diese Personen können dir nicht schreiben", 10, 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        when {
            loading -> Box(Modifier.fillMaxWidth().padding(26.dp), contentAlignment = Alignment.Center) { Spinner() }
            list.isEmpty() -> EmptyState("🕊", "Niemand blockiert", "Alles friedlich 💗")
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)) {
                items(list.size) { i ->
                    val b = list[i]
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(15.dp)).padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar3(b.avatar, 36)
                        Spacer(Modifier.width(9.dp))
                        Column(Modifier.weight(1f)) {
                            Text(b.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = V3.text)
                            Muted3("@" + b.username, 9, 1)
                        }
                        Box(
                            Modifier.clip(RoundedCornerShape(50)).background(Color(0x22AAFF7E))
                                .border(1.dp, V3.green.copy(alpha = 0.5f), RoundedCornerShape(50))
                                .clickable {
                                    scope.launch {
                                        try {
                                            Api4.unblock(b.id)
                                            list = list.filterNot { it.id == b.id }
                                            Hub.toast("🕊", "Blockierung aufgehoben", b.displayName)
                                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                    }
                                }.padding(horizontal = 10.dp, vertical = 5.dp),
                        ) { Text("freigeben", fontFamily = Outfit, fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = V3.green) }
                    }
                }
                item { Spacer(Modifier.height(20.dp)) }
            }
        }
    }
}
