package de.maxichen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import de.maxichen.app.*
import kotlinx.coroutines.launch

/* =====================================================================
   🏠 HAUPTSCREEN V4 — 6 Bereiche
   ===================================================================== */

@Composable
fun MainScreen2(openExtra: String) {
    var tab by remember { mutableIntStateOf(0) }
    var openChat by remember { mutableStateOf<String?>(null) }
    var showNew by remember { mutableStateOf(false) }
    var showAdmin by remember { mutableStateOf(false) }
    var showSearch by remember { mutableStateOf(false) }
    var showScheduled by remember { mutableStateOf(false) }
    var showBlocked by remember { mutableStateOf(false) }
    var showAI by remember { mutableStateOf(false) }
    val bg by V3State.appBackground.collectAsState()
    val callState by CallManager.state.collectAsState()
    val meshState by CallMesh.state.collectAsState()

    LaunchedEffect(Unit) { try { V3State.appBackground.value = Api4.appBackground() } catch (e: Exception) {} }
    LaunchedEffect(openExtra) {
        val t = if (openExtra.isNotEmpty()) openExtra else Hub.chatIdToOpen ?: ""
        if (t.isNotEmpty()) { openChat = t; Hub.chatIdToOpen = null }
    }

    AppBackgroundLayer(AppBackground.from(bg)) {
        Box(Modifier.fillMaxSize()) {
            when {
                showAdmin -> AdminScreen2(onBack = { showAdmin = false })
                showSearch -> MessageSearchScreen(onBack = { showSearch = false }, onOpenChat = { showSearch = false; openChat = it })
                showScheduled -> ScheduledListScreen(onBack = { showScheduled = false })
                showBlocked -> BlockedListScreen(onBack = { showBlocked = false })
                showAI -> KiTab2(activeChatId = "", onBack = { showAI = false })
                openChat != null -> ChatScreen2(
                    chatId = openChat!!,
                    onBack = { openChat = null; Hub.setActiveChat(null) },
                    onOpenChat = { openChat = it },
                )
                else -> Column(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(1f)) {
                        when (tab) {
                            0 -> ChatsTab(onOpenChat = { openChat = it }, onNewChat = { showNew = true })
                            1 -> ChatGroupTab("community", "Communitys 🏰", "Deine Gruppen unter einem Dach", { openChat = it }) { showNew = true }
                            2 -> ChatGroupTab("channel", "Kanäle 📢", "News & Ankündigungen", { openChat = it }) { showNew = true }
                            3 -> MomenteScreen()
                            4 -> CallsTab()
                            else -> SettingsScreen3(
                                onBack = { tab = 0 },
                                onOpenAdmin = { showAdmin = true },
                                onLogout = { Hub.logoutAction?.invoke() },
                                onSearch = { showSearch = true },
                                onScheduled = { showScheduled = true },
                                onBlocked = { showBlocked = true },
                                onAI = { showAI = true },
                            )
                        }
                        if (tab == 0) {
                            Box(
                                Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 12.dp)
                                    .size(52.dp).clip(RoundedCornerShape(18.dp))
                                    .background(V3.primaryBrush)
                                    .border(1.dp, V3.neon.copy(alpha = 0.6f), RoundedCornerShape(18.dp))
                                    .clickable { showAI = true },
                                contentAlignment = Alignment.Center,
                            ) { Text("💗", fontSize = 21.sp) }
                        }
                    }
                    BottomNav3(
                        items = listOf(
                            "💬" to "Chats", "🏰" to "Community", "📢" to "Kanäle",
                            "🌸" to "Momente", "📞" to "Anrufe", "⚙️" to "Profil",
                        ),
                        selected = tab, onSelect = { tab = it },
                    )
                }
            }

            if (callState.mode != CallManager.Mode.IDLE) CallScreen2(onClose = {})
    if (meshState.active) MeshCallScreen(onClose = {})
            if (showNew) NewChatSheet(onDismiss = { showNew = false }, onCreated = { showNew = false; openChat = it })
        }
        ToastLayer()
    }
}

/* =====================================================================
   🏰 COMMUNITYS / KANÄLE
   ===================================================================== */

@Composable
fun ChatGroupTab(type: String, title: String, sub: String, onOpenChat: (String) -> Unit, onNew: () -> Unit) {
    val chats by Hub.chats.collectAsState()
    val online by Hub.online.collectAsState()
    var q by remember { mutableStateOf("") }
    val list = chats.filter { it.type == type }.sortedByDescending { it.lastCreatedAt }
    val shown = if (q.isBlank()) list else list.filter { it.name.contains(q, true) }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Title3(title, 22)
                Muted3(sub, 11, 1)
            }
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(V3.primaryBrush).clickable { onNew() },
                contentAlignment = Alignment.Center,
            ) { Text("＋", fontSize = 20.sp, color = V3.ink) }
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) { V2TextField(q, { q = it }, "Suchen…", minHeight = 46) }
        Spacer(Modifier.height(10.dp))
        if (shown.isEmpty()) {
            EmptyState(
                if (type == "channel") "📢" else "🏰", "Noch nichts hier",
                if (type == "channel") "Erstelle deinen ersten Kanal" else "Baue deine erste Community",
            )
        } else {
            androidx.compose.foundation.lazy.LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(shown.size) { i ->
                    val c = shown[i]
                    ChatRow(c, c.members.any { it in online }, onClick = { onOpenChat(c.id) })
                }
                item { Spacer(Modifier.height(96.dp)) }
            }
        }
    }
}

/* =====================================================================
   ✨ NEUER CHAT / GRUPPE / COMMUNITY / KANAL
   ===================================================================== */

@Composable
fun NewChatSheet(onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    var mode by remember { mutableStateOf("private") }
    var q by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<UserData>>(emptyList()) }
    var name by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var picked by remember { mutableStateOf<Set<String>>(emptySet()) }
    var busy by remember { mutableStateOf(false) }
    var searching by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val me by Hub.user.collectAsState()

    fun search() {
        if (q.isBlank()) return
        scope.launch {
            searching = true
            try { users = ApiCall.search(q).users.filter { it.id != me?.id && it.id != "lovebot" } }
            catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            searching = false
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable { onDismiss() }) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().heightIn(max = 700.dp)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(Color(0xFF1B0F2E))
                .border(1.dp, V3.glassBorder, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .clickable { }.verticalScroll(rememberScrollState()).padding(18.dp),
        ) {
            Title3("✨ Neu starten", 19)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                listOf("private" to "💬 Chat", "group" to "👥 Gruppe", "community" to "🏰 Community", "channel" to "📢 Kanal")
                    .forEach { (k, l) ->
                        val on = mode == k
                        Box(
                            Modifier.weight(1f).clip(RoundedCornerShape(13.dp))
                                .background(if (on) V3.primaryBrush else Brush.linearGradient(listOf(V3.glass, V3.glass)))
                                .clickable { mode = k; picked = emptySet() }.padding(vertical = 9.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(l, fontFamily = Outfit, fontSize = 8.5.sp, fontWeight = FontWeight.Bold,
                                color = if (on) V3.ink else V3.muted, maxLines = 1)
                        }
                    }
            }
            Spacer(Modifier.height(12.dp))

            if (mode != "private") {
                V2TextField(name, { name = it },
                    if (mode == "group") "Gruppenname" else if (mode == "channel") "Kanalname" else "Community-Name", minHeight = 48)
                Spacer(Modifier.height(8.dp))
                V2TextField(desc, { desc = it }, "Beschreibung (optional)", minHeight = 48)
                Spacer(Modifier.height(10.dp))
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { V2TextField(q, { q = it }, "Personen suchen…", minHeight = 46) }
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier.size(46.dp).clip(RoundedCornerShape(15.dp)).background(V3.primaryBrush).clickable { search() },
                    contentAlignment = Alignment.Center,
                ) { if (searching) Spinner(V3.ink) else Text("🔍", fontSize = 15.sp) }
            }
            Spacer(Modifier.height(8.dp))

            users.forEach { u ->
                val on = picked.contains(u.id)
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(15.dp))
                        .background(if (on) Color(0x33FF7EDB) else V3.glass)
                        .border(1.dp, if (on) V3.neon.copy(alpha = 0.6f) else V3.glassBorder, RoundedCornerShape(15.dp))
                        .clickable {
                            if (mode == "private") {
                                scope.launch {
                                    busy = true
                                    try {
                                        val c = ApiCall.createChat("private", userId = u.id)
                                        Hub.upsertChat(c)
                                        onCreated(c.id)
                                    } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                    busy = false
                                }
                            } else picked = if (on) picked - u.id else picked + u.id
                        }.padding(9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar3(u.avatar.ifEmpty { u.displayName.take(1) }, 36, online = u.online)
                    Spacer(Modifier.width(9.dp))
                    Column(Modifier.weight(1f)) {
                        Text(u.displayName, fontFamily = Outfit, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = V3.text)
                        Muted3("@" + u.username, 9, 1)
                    }
                    if (mode != "private") {
                        Box(
                            Modifier.size(22.dp).clip(RoundedCornerShape(7.dp)).background(if (on) V3.neon else Color(0x22FFFFFF)),
                            contentAlignment = Alignment.Center,
                        ) { if (on) Text("✓", fontSize = 12.sp, color = V3.ink, fontWeight = FontWeight.Bold) }
                    }
                }
            }

            if (mode != "private") {
                Spacer(Modifier.height(14.dp))
                NeonButton3(
                    when (mode) {
                        "group" -> "Gruppe erstellen 👥 (${picked.size + 1})"
                        "channel" -> "Kanal erstellen 📢"
                        else -> "Community erstellen 🏰"
                    },
                    loading = busy,
                ) {
                    if (name.trim().length < 2) { Hub.toast("⚠️", "Name fehlt", "Mindestens 2 Zeichen"); return@NeonButton3 }
                    scope.launch {
                        busy = true
                        try {
                            val c = ApiCall.createChat(mode, name = name.trim(), description = desc.trim(), memberIds = picked.toList())
                            Hub.upsertChat(c)
                            onCreated(c.id)
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        busy = false
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            GhostButton3("Abbrechen") { onDismiss() }
            Spacer(Modifier.height(24.dp))
        }
    }
}
