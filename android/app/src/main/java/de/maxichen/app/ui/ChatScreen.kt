package de.maxichen.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch
import org.json.JSONObject

private val QUICK_REACTIONS = listOf("💗", "😂", "😢", "🔥", "✨", "🥺", "👑")

/* =====================================================================
   💬 CHAT-SCREEN V4
   ===================================================================== */

@Composable
fun ChatScreen2(chatId: String, onBack: () -> Unit, onOpenChat: (String) -> Unit = {}) {
    val chats by Hub.chats.collectAsState()
    val msgsMap by Hub.messages.collectAsState()
    val detailsMap by Hub.details.collectAsState()
    val typing by Hub.typing.collectAsState()
    val online by Hub.online.collectAsState()
    val polls by PollHub.byId.collectAsState()
    val me by Hub.user.collectAsState()
    val appBg by V3State.appBackground.collectAsState()
    val chat = chats.find { it.id == chatId }
    val msgs = msgsMap[chatId] ?: emptyList()
    val details = detailsMap[chatId]

    var text by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<Msg?>(null) }
    var editing by remember { mutableStateOf<Msg?>(null) }
    var actionMsg by remember { mutableStateOf<Msg?>(null) }
    var showWallpaper by remember { mutableStateOf(false) }
    var showInfo by remember { mutableStateOf(false) }
    var showForward by remember { mutableStateOf<Msg?>(null) }
    var showTranslate by remember { mutableStateOf<Msg?>(null) }
    var showPoll by remember { mutableStateOf(false) }
    var showSchedule by remember { mutableStateOf(false) }
    var showAttach by remember { mutableStateOf(false) }
    var showExtras by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val listState = rememberLazyListState()

    // 🛡️ V4.4: FLAG_SECURE für geschützte Chats (Screenshot-Schutz pro Chat)
    val secureChat = Hub.secureChats.contains(chatId)
    // 🔐 V4.5: Doppel-Ratchet an/aus + lokal entschlüsselter Klartext
    var e2eOn by remember(chatId) { mutableStateOf(SecureChat.isOn(ctx, chatId)) }
    val plain = remember(chatId) { mutableStateMapOf<String, String>() }
    LaunchedEffect(secureChat) {
        de.maxichen.app.SecureScreen.setSecure(secureChat)
    }
    DisposableEffect(Unit) {
        onDispose { de.maxichen.app.SecureScreen.setSecure(false) }
    }

    LaunchedEffect(chatId) {
        Hub.setActiveChat(chatId)
        try { Hub.setMessages(chatId, ApiCall.messages(chatId)) } catch (e: Exception) {}
        try { Hub.setDetails(chatId, ApiCall.chatDetails(chatId)) } catch (e: Exception) {}
        try { PollHub.setAll(Api4.chatPolls(chatId)) } catch (e: Exception) {}
        try { ApiCall.read(chatId); Hub.setUnread(chatId, 0) } catch (e: Exception) {}
    }
    LaunchedEffect(msgs.size) {
        if (msgs.isNotEmpty()) try { listState.animateScrollToItem(msgs.size - 1) } catch (e: Exception) {}
    }
    // 🔓 alles, was als Umschlag ankommt, lokal aufmachen (1:1 UND Gruppe)
    LaunchedEffect(msgs.size, e2eOn) {
        if (msgs.any { it.enc != null }) {
            try { plain.putAll(SecureChat.decryptAll(ctx, chatId, msgs, me?.id ?: "")) } catch (e: Exception) {}
        }
        if (msgs.any { it.group != null }) {
            try { plain.putAll(GroupE2E.decryptAll(ctx, chatId, msgs, me?.id ?: "")) } catch (e: Exception) {}
        }
    }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            sending = true
            val data = compressToDataUrl(ctx, uri, 1080, 620_000)
            if (data == null) Hub.toast("💔", "Bild zu groß", "Nimm ein kleineres Foto")
            else try {
                val m = ApiCall.sendMessage(chatId, "", data, "photo", JSONObject().put("url", data).put("name", queryName(ctx, uri)), replyTo?.id)
                Hub.appendMessage(chatId, m); replyTo = null
            } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            sending = false
        }
    }

    fun send(kind: String = "text", attachment: JSONObject? = null) {
        val t = text.trim()
        if (t.isEmpty() && attachment == null) return
        if (sending) return
        sending = true
        text = ""
        val reply = replyTo?.id
        replyTo = null
        scope.launch {
            try {
                if (editing != null) {
                    val updated = Api4.editMessage(chatId, editing!!.id, t)
                    Hub.setMessages(chatId, (Hub.messages.value[chatId] ?: emptyList()).map { if (it.id == updated.id) updated else it })
                    editing = null
                } else if (e2eOn && chat?.type != "private" && kind == "text" && attachment == null) {
                    // 👥 V4.6: ein Ciphertext für die ganze Gruppe (Sender Keys)
                    val members = details?.members?.map { it.id } ?: emptyList()
                    if (members.isEmpty()) throw ApiError(400, "Mitglieder nicht geladen", "e2e_no_members")
                    val m = GroupE2E.send(ctx, chatId, members, me?.id ?: "", t)
                    plain[m.id] = t
                    Hub.appendMessage(chatId, m)
                    Ws.send("typing", JSONObject().put("chatId", chatId).put("name", ""))
                } else if (e2eOn && kind == "text" && attachment == null) {
                    // 🔐 V4.5: Klartext verlässt das Handy nie — nur der Umschlag geht raus
                    val peerId = details?.members?.firstOrNull { it.id != me?.id }?.id
                    if (peerId == null) throw ApiError(400, "Kein Gegenüber für E2E gefunden", "e2e_no_peer")
                    val m = SecureChat.send(ctx, chatId, peerId, t)
                    plain[m.id] = t
                    Hub.appendMessage(chatId, m)
                    Ws.send("typing", JSONObject().put("chatId", chatId).put("name", ""))
                } else {
                    val m = ApiCall.sendMessage(chatId, t, null, kind, attachment, reply)
                    Hub.appendMessage(chatId, m)
                    Ws.send("typing", JSONObject().put("chatId", chatId).put("name", ""))
                }
            } catch (e: Exception) {
                // ApiError = Server, IllegalStateException = E2E (z. B. Gegenüber ohne Keys)
                val msg = (e as? ApiError)?.msg ?: e.message ?: "Unbekannter Fehler"
                Hub.toast("💔", "Nicht gesendet", msg)
                text = t
            }
            sending = false
        }
    }

    fun doReact(m: Msg, emoji: String) {
        scope.launch {
            try {
                ApiCall.reaction(chatId, m.id, emoji)
                Hub.setMessages(chatId, (Hub.messages.value[chatId] ?: emptyList()).map {
                    if (it.id == m.id) {
                        val r = it.reactions.toMutableMap()
                        if (r[me?.id ?: ""] == emoji) r.remove(me?.id ?: "") else r[me?.id ?: ""] = emoji
                        it.copy(reactions = r)
                    } else it
                })
            } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
        }
    }

    val wall = chat?.wallpaper
    val backdrop = when {
        wall == null -> AppBackground.from(appBg)
        wall.type == "custom" -> AppBackground("custom", wall.value)
        wall.type == "preset" -> AppBackground("preset", wall.value)
        else -> AppBackground.from(appBg)
    }

    AppBackgroundLayer(backdrop) {
        Column(Modifier.fillMaxSize()) {
            ChatHeader2(
                chat = chat, online = online, typing = typing[chatId], meId = me?.id,
                onBack = onBack, onInfo = { showInfo = true }, onWallpaper = { showWallpaper = true },
                onExtras = { showExtras = true }, secure = secureChat,
                e2e = e2eOn,
                pq = if (!e2eOn) "?" else SecureChat.pqState(ctx, chatId),
                onGroupCall = if (chat?.type != null && chat?.type != "private") ({
                    CallMesh.join(ctx, chatId, chat?.name ?: "Gruppe", me?.id ?: "")
                }) else null,
                onToggleE2E = ({
                    if (!e2eOn) {
                        // beim Einschalten direkt Keys veröffentlichen
                        scope.launch {
                            try {
                                SecureChat.publish(ctx)
                                val meId = me?.id ?: ""
                                if (chat?.type == "private") {
                                    e2eOn = true
                                    SecureChat.setOn(ctx, chatId, true)
                                    Hub.toast("🔒", "Ende-zu-Ende an", "Deine Schlüssel sind veröffentlicht · Doppel-Ratchet aktiv")
                                } else {
                                    // 👥 Gruppen: Sender-Key erzeugen + verschlüsselt an alle verteilen
                                    val members = details?.members?.map { it.id } ?: emptyList()
                                    val count = GroupE2E.distribute(ctx, chatId, members, meId)
                                    e2eOn = true
                                    SecureChat.setOn(ctx, chatId, true)
                                    Hub.toast(
                                        "👥", "Gruppen-Ende-zu-Ende an",
                                        "Sender-Key an $count von ${(members.size - 1).coerceAtLeast(0)} verteilt · jede Nachricht signiert",
                                    )
                                }
                            } catch (e: Exception) {
                                Hub.toast("💔", "Keys nicht veröffentlicht", (e as? ApiError)?.msg ?: e.message ?: "")
                            }
                        }
                    } else {
                        e2eOn = false
                        SecureChat.setOn(ctx, chatId, false)
                        Hub.toast("🔓", "Ende-zu-Ende aus", "Neue Nachrichten gehen wieder normal raus")
                    }
                }),
            )

            chat?.pinned?.let { p ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(12.dp)).background(Color(0x33FF7EDB))
                        .border(1.dp, V3.neon.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("📌", fontSize = 11.sp); Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Angepinnt · " + p.senderName, fontFamily = Outfit, fontSize = 8.5.sp, color = V3.neon)
                        Muted3(p.text, 10, 1)
                    }
                    Box(Modifier.clip(RoundedCornerShape(50)).clickable {
                        scope.launch { try { Api4.pinMessage(chatId, p.id) } catch (e: Exception) {} }
                    }.padding(4.dp)) { Text("✕", fontSize = 10.sp, color = V3.muted) }
                }
            }

            Box(Modifier.weight(1f)) {
                if (msgs.isEmpty()) {
                    EmptyState("💗", "Sag Hallo!", "Die erste Nachricht bist du ✨")
                } else {
                    LazyColumn(
                        Modifier.fillMaxSize(), state = listState,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        items(msgs.size) { i ->
                            val raw = msgs[i]
                            // entschlüsselter Text, sonst ein ehrlicher Platzhalter
                            val m = when {
                                raw.enc != null -> raw.copy(text = plain[raw.id] ?: "🔒 verschlüsselt")
                                raw.group != null -> raw.copy(text = plain[raw.id] ?: "🔒 verschlüsselt (Gruppe)")
                                else -> raw
                            }
                            val mine = m.senderId == me?.id
                            val prev = msgs.getOrNull(i - 1)
                            val showSender = !mine && (prev == null || prev.senderId != m.senderId)
                            val senderName = details?.members?.find { it.id == m.senderId }?.displayName
                                ?: if (chat?.type == "private") (chat?.name ?: "") else ""
                            val poll = m.attachment?.pollId?.let { polls[it] }
                                ?: if (m.kind == "poll") polls.values.find { it.chatId == chatId && it.question == m.text } else null
                            BubbleRow(
                                m = m, mine = mine, senderName = senderName, showSender = showSender,
                                poll = poll, chatId = chatId,
                                onReact = { e -> doReact(m, e) },
                                onLong = { actionMsg = m },
                            )
                        }
                        item { Spacer(Modifier.height(4.dp)) }
                    }
                }
            }

            // 🔊 jemand ist im Gruppen-Call → direkt beitreten
            val invite by remember { derivedStateOf { CallMesh.invite.value } }
            if (invite != null && invite!!.first == chatId) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 3.dp)
                        .clip(RoundedCornerShape(14.dp)).background(Color(0x33FF7EDB))
                        .border(1.dp, Color(0x88FF7EDB), RoundedCornerShape(14.dp))
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("🔊", fontSize = 13.sp)
                    Spacer(Modifier.width(7.dp))
                    Text(
                        invite!!.second + " ist im Gruppen-Call",
                        fontFamily = Outfit, fontSize = 10.sp, color = V3.text, modifier = Modifier.weight(1f),
                    )
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(V3.primaryBrush)
                            .clickable { CallMesh.join(ctx, chatId, chat?.name ?: "Gruppe", me?.id ?: "") }
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) { Text("Beitreten", fontFamily = Outfit, fontSize = 9.5.sp, color = Color.White, fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.clickable { CallMesh.invite.value = null }.padding(4.dp)) {
                        Text("✕", fontSize = 10.sp, color = V3.muted)
                    }
                }
            }

            (replyTo ?: editing)?.let { r ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp).clip(RoundedCornerShape(14.dp))
                        .background(Color(0xCC241338)).padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (editing != null) "✏️" else "↩️", fontSize = 12.sp)
                    Spacer(Modifier.width(7.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (editing != null) "Bearbeiten" else "Antwort an " + (if (r.senderId == me?.id) "dich" else r.senderId),
                            fontFamily = Outfit, fontSize = 9.sp, color = V3.neon, fontWeight = FontWeight.Bold,
                        )
                        Muted3(r.text.ifEmpty { "📷 Foto" }, 10, 1)
                    }
                    Box(Modifier.clickable { replyTo = null; editing = null; text = "" }.padding(4.dp)) {
                        Text("✕", fontSize = 11.sp, color = V3.muted)
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Box(
                    Modifier.size(42.dp).clip(CircleShape).background(V3.glass)
                        .border(1.dp, V3.glassBorder, CircleShape).clickable { showAttach = true },
                    contentAlignment = Alignment.Center,
                ) { Text("＋", fontSize = 20.sp, color = V3.text) }
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier.weight(1f).clip(RoundedCornerShape(22.dp)).background(V3.glass)
                        .border(1.dp, V3.glassBorder, RoundedCornerShape(22.dp))
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                ) {
                    if (text.isEmpty()) Text("Nachricht… 💗", fontFamily = Outfit, fontSize = 13.sp, color = V3.muted.copy(alpha = 0.8f))
                    BasicTextField(
                        value = text,
                        onValueChange = { v ->
                            text = v
                            scope.launch {
                                try { Ws.send("typing", JSONObject().put("chatId", chatId).put("name", me?.displayName ?: "")) }
                                catch (e: Exception) {}
                            }
                        },
                        maxLines = 5,
                        textStyle = TextStyle(fontFamily = Outfit, fontSize = 13.5.sp, color = V3.text),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(V3.neon),
                    )
                }
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier.size(44.dp).clip(CircleShape).background(V3.primaryBrush).clickable { send() },
                    contentAlignment = Alignment.Center,
                ) { if (sending) Spinner(V3.ink) else Text(if (editing != null) "✓" else "➤", fontSize = 16.sp, color = V3.ink) }
            }
            Spacer(Modifier.height(4.dp))
        }

        actionMsg?.let { m ->
            MessageActionSheet(
                m = m, mine = m.senderId == me?.id,
                onDismiss = { actionMsg = null },
                onReact = { e -> doReact(m, e); actionMsg = null },
                onReply = { replyTo = m; actionMsg = null },
                onEdit = { editing = m; text = m.text; actionMsg = null },
                onDelete = {
                    actionMsg = null
                    scope.launch {
                        try {
                            Api4.deleteMessage(chatId, m.id)
                            Hub.setMessages(chatId, (Hub.messages.value[chatId] ?: emptyList()).filterNot { it.id == m.id })
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                },
                onCopy = { actionMsg = null },
                onForward = { showForward = m; actionMsg = null },
                onPin = {
                    actionMsg = null
                    scope.launch {
                        try {
                            val on = Api4.pinMessage(chatId, m.id)
                            Hub.toast("📌", if (on) "Angepinnt" else "Pin gelöst", "")
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                },
                onUnread = {
                    actionMsg = null
                    scope.launch {
                        try { Api4.markUnread(chatId, m.id); Hub.toast("🔵", "Als ungelesen markiert") }
                        catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                },
                onTranslate = { showTranslate = m; actionMsg = null },
                onTranscribe = {
                    actionMsg = null
                    scope.launch {
                        try {
                            val t = Api4.transcribe(chatId, m.id)
                            Hub.toast("🎙️", "Transkription", t.take(180))
                        } catch (e: ApiError) { Hub.toast("💔", "Keine Transkription", e.msg) }
                    }
                },
                onReport = { actionMsg = null; Hub.toast("🚩", "Melden", "Nutze Chat-Info → Melden") },
            )
        }
        if (showExtras) ChatExtrasSheet(
            chatId = chatId,
            autoDeleteHours = details?.autoDelete ?: 0,
            screenshotProtected = secureChat,
            onDismiss = { showExtras = false },
            onChanged = { },
        )
        if (showWallpaper) ChatWallpaperSheet(chatId, chat?.wallpaper, onDismiss = { showWallpaper = false })
        if (showInfo) ChatInfoSheet(
            chat = chat, details = details, meId = me?.id, onDismiss = { showInfo = false },
            onBlock = {
                showInfo = false
                val peer = chat?.members?.firstOrNull { it != me?.id }
                if (peer != null) scope.launch {
                    try { Hub.toast("🚫", "Blockiert", Api4.block(peer)); Hub.removeChat(chatId); onBack() }
                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                }
            },
            onReport = {
                showInfo = false
                val peer = chat?.members?.firstOrNull { it != me?.id }
                if (peer != null) scope.launch {
                    try { Api4.report(peer, "Chat", "Gemeldet über Chat-Info", chatId); Hub.toast("🚩", "Danke 💗", "Das Team schaut es sich an") }
                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                }
            },
            onLovebot = {
                showInfo = false
                scope.launch {
                    try { Api4.lovebotInChat(chatId, true); Hub.toast("🤖", "LoveBot", "Ist jetzt im Chat") }
                    catch (e: ApiError) { Hub.toast("💔", "Nur Chat-Admins", e.msg) }
                }
            },
            onLeave = {
                showInfo = false
                scope.launch {
                    try { ApiCall.leave(chatId); Hub.removeChat(chatId); onBack() }
                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                }
            },
        )
        showForward?.let { m -> ForwardSheet(msg = m, chatId = chatId, onDismiss = { showForward = null }, onOpen = onOpenChat) }
        showTranslate?.let { m -> TranslateSheet(text = m.text, onDismiss = { showTranslate = null }) }
        if (showPoll) PollCreateSheet(chatId) { showPoll = false }
        if (showSchedule) ScheduleSheet(chatId, text) { showSchedule = false }
        if (showAttach) AttachSheet(
            onDismiss = { showAttach = false },
            onPhoto = { showAttach = false; pickImage.launch("image/*") },
            onPoll = { showAttach = false; showPoll = true },
            onSchedule = { showAttach = false; showSchedule = true },
            onSticker = { s ->
                showAttach = false
                scope.launch {
                    try {
                        val m = ApiCall.sendMessage(chatId, "", null, "sticker", JSONObject().put("sticker", s).put("name", "Sticker"), replyTo?.id)
                        Hub.appendMessage(chatId, m); replyTo = null
                    } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                }
            },
            onLocation = { showAttach = false; Hub.toast("📍", "Standort", "Bald mit Karte 🗺") },
            onVoice = { showAttach = false; Hub.toast("🎙️", "Sprachnachricht", "Bald verfügbar") },
        )
        ToastLayer()
    }
}

/* ---------------- Header ---------------- */

@Composable
fun ChatHeader2(
    chat: ChatSummary?, online: Set<String>, typing: String?, meId: String?,
    onBack: () -> Unit, onInfo: () -> Unit, onWallpaper: () -> Unit,
    onExtras: () -> Unit = {}, secure: Boolean = false,
    e2e: Boolean = false, onToggleE2E: (() -> Unit)? = null,
    onGroupCall: (() -> Unit)? = null,
    /** 🌌 V4.9: "pq" = quantensicher, "classic" = nur X25519, "?" = noch keine Sitzung */
    pq: String = "?",
) {
    val peer = chat?.members?.firstOrNull { it != meId }
    Row(
        Modifier.fillMaxWidth().padding(top = 44.dp, start = 10.dp, end = 10.dp, bottom = 6.dp)
            .clip(RoundedCornerShape(20.dp)).background(Color(0xCC1B0F2E))
            .border(1.dp, V3.glassBorder, RoundedCornerShape(20.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
            contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
        Spacer(Modifier.width(8.dp))
        Avatar3(chat?.avatar?.ifEmpty { "💗" } ?: "💗", 38, online = peer != null && peer in online)
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f).clickable { onInfo() }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(chat?.name ?: "Chat", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                    color = V3.text, maxLines = 1)
                if (chat?.type == "channel") { Spacer(Modifier.width(4.dp)); Text("✔️", fontSize = 9.sp) }
            }
            val sub = when {
                typing != null -> "$typing tippt…"
                peer != null && peer in online -> "online ✨"
                chat?.type == "private" -> "zuletzt gesehen " + timeAgo(chat?.lastCreatedAt ?: 0)
                else -> (chat?.count ?: 0).toString() + " Mitglieder"
            }
            Text(sub, fontFamily = Outfit, fontSize = 9.5.sp, color = if (typing != null) V3.neon else V3.muted, maxLines = 1)
        }
        if (onGroupCall != null) {
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass)
                    .clickable { onGroupCall() },
                contentAlignment = Alignment.Center,
            ) { Text("📞", fontSize = 14.sp) }
            Spacer(Modifier.width(5.dp))
        }
        if (e2e && pq != "?") {
            Box(
                Modifier.clip(RoundedCornerShape(11.dp))
                    .background(if (pq == "pq") Color(0x55A97BFF) else Color(0x33FFFFFF))
                    .border(1.dp, if (pq == "pq") Color(0x99A97BFF) else Color(0x22FFFFFF), RoundedCornerShape(11.dp))
                    .padding(horizontal = 7.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (pq == "pq") "🌌 PQ" else "🔐 X3DH",
                    fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 9.sp, color = V3.text,
                )
            }
            Spacer(Modifier.width(5.dp))
        }
        if (onToggleE2E != null) {
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(11.dp))
                    .background(if (e2e) Color(0x6658E08C) else V3.glass)
                    .border(1.dp, if (e2e) Color(0x9958E08C) else Color.Transparent, RoundedCornerShape(11.dp))
                    .clickable { onToggleE2E() },
                contentAlignment = Alignment.Center,
            ) { Text(if (e2e) "🔒" else "🔓", fontSize = 14.sp) }
            Spacer(Modifier.width(5.dp))
        }
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onExtras() },
            contentAlignment = Alignment.Center) { Text(if (secure) "🛡" else "✨", fontSize = 14.sp) }
        Spacer(Modifier.width(5.dp))
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onWallpaper() },
            contentAlignment = Alignment.Center) { Text("🖼", fontSize = 14.sp) }
        Spacer(Modifier.width(5.dp))
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onInfo() },
            contentAlignment = Alignment.Center) { Text("⋮", fontSize = 16.sp, color = V3.text) }
    }
}

/* ---------------- Bubble ---------------- */

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun BubbleRow(
    m: Msg, mine: Boolean, senderName: String, showSender: Boolean,
    poll: PollData?, chatId: String, onReact: (String) -> Unit, onLong: () -> Unit,
) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        if (showSender && senderName.isNotEmpty()) {
            Text(senderName, fontFamily = Outfit, fontSize = 9.sp, color = V3.neon,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 10.dp, bottom = 1.dp))
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
            Box(
                Modifier.widthIn(max = 300.dp).clip(
                    RoundedCornerShape(
                        topStart = 20.dp, topEnd = 20.dp,
                        bottomStart = if (mine) 20.dp else 6.dp,
                        bottomEnd = if (mine) 6.dp else 20.dp,
                    ),
                )
                    .background(if (mine) ChatStyle.brushFor(chatId) else V3.bubbleOther)
                    .border(1.dp, V3.glassBorder, RoundedCornerShape(20.dp))
                    .combinedClickable(onClick = {}, onLongClick = { onLong() })
                    .padding(horizontal = 11.dp, vertical = 8.dp),
            ) {
                Column {
                    m.replyTo?.let { r ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                                .background(Color(0x33FFFFFF)).padding(horizontal = 7.dp, vertical = 4.dp),
                        ) {
                            Box(Modifier.width(2.dp).height(20.dp).clip(RoundedCornerShape(2.dp)).background(V3.neon))
                            Spacer(Modifier.width(6.dp))
                            Column {
                                Text(r.senderName, fontFamily = Outfit, fontSize = 8.sp, color = V3.neon, fontWeight = FontWeight.Bold)
                                Text(r.text.ifEmpty { "📷 Foto" }, fontFamily = Outfit, fontSize = 9.5.sp,
                                    color = V3.text.copy(alpha = 0.8f), maxLines = 1)
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                    }
                    if (m.deleted) {
                        Text("🗑 Nachricht gelöscht", fontFamily = Outfit, fontSize = 11.5.sp, color = V3.muted)
                    } else if (m.kind == "poll" || poll != null) {
                        PollBubble(
                            poll ?: PollData(m.id, chatId, m.text, emptyList(), false, false, false, m.createdAt, 0, 0, false, ""),
                            chatId,
                        )
                    } else if (m.kind == "sticker") {
                        Text(m.attachment?.sticker ?: "💗", fontSize = 46.sp)
                    } else if (m.kind == "photo" && (m.image != null || m.attachment?.url != null)) {
                        val bmp = remember(m.id) { DecodeBase64(m.image ?: m.attachment?.url ?: "") }
                        if (bmp != null) Image(
                            bitmap = bmp.asImageBitmap(), contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.widthIn(max = 260.dp).heightIn(max = 320.dp).clip(RoundedCornerShape(14.dp)),
                        )
                        if (m.text.isNotEmpty()) Spacer(Modifier.height(4.dp))
                    }
                    if (m.text.isNotEmpty() && m.kind != "poll" && m.kind != "sticker") {
                        Text(formatText(m.text), fontFamily = Outfit, fontSize = 13.sp, color = V3.text)
                    }
                    Row(Modifier.align(Alignment.End).padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (m.scheduled) Text("⏰ ", fontSize = 8.sp)
                        if (m.bot) Text("🤖 ", fontSize = 8.sp)
                        if (m.pinned) Text("📌 ", fontSize = 8.sp)
                        if (m.forwarded) Text("➡️ ", fontSize = 8.sp)
                        Text(
                            (if (m.editedAt > 0) "bearbeitet · " else "") + fmtTime(m.createdAt),
                            fontFamily = Outfit, fontSize = 8.sp, color = V3.text.copy(alpha = 0.55f),
                        )
                        if (mine) Text(
                            if (m.readBy.size > 1) " ✓✓" else " ✓",
                            fontFamily = Outfit, fontSize = 8.sp,
                            color = if (m.readBy.size > 1) V3.blue else V3.text.copy(alpha = 0.55f),
                        )
                    }
                }
            }
        }
        if (m.reactions.isNotEmpty()) {
            Row(
                Modifier.padding(start = if (mine) 0.dp else 8.dp, end = if (mine) 8.dp else 0.dp, top = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                m.reactions.values.groupingBy { it }.eachCount().forEach { (e, n) ->
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(Color(0x33FF7EDB))
                            .border(1.dp, V3.neon.copy(alpha = 0.4f), RoundedCornerShape(50))
                            .clickable { onReact(e) }.padding(horizontal = 6.dp, vertical = 1.dp),
                    ) { Text(if (n > 1) "$e $n" else e, fontFamily = Outfit, fontSize = 9.sp, color = V3.text) }
                }
            }
        }
    }
}

/** **fett** · *kursiv* · ~~durchgestrichen~~ */
fun formatText(raw: String): AnnotatedString {
    val b = AnnotatedString.Builder()
    var i = 0
    while (i < raw.length) {
        when {
            raw.startsWith("**", i) -> {
                val end = raw.indexOf("**", i + 2)
                if (end > 0) {
                    b.withStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Bold)) { b.append(raw.substring(i + 2, end)) }
                    i = end + 2
                } else { b.append(raw[i].toString()); i++ }
            }
            raw.startsWith("~~", i) -> {
                val end = raw.indexOf("~~", i + 2)
                if (end > 0) {
                    b.withStyle(androidx.compose.ui.text.SpanStyle(textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough)) {
                        b.append(raw.substring(i + 2, end))
                    }
                    i = end + 2
                } else { b.append(raw[i].toString()); i++ }
            }
            raw[i] == '*' && i + 1 < raw.length && raw[i + 1] != '*' -> {
                val end = raw.indexOf('*', i + 1)
                if (end > 0) {
                    b.withStyle(androidx.compose.ui.text.SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)) {
                        b.append(raw.substring(i + 1, end))
                    }
                    i = end + 1
                } else { b.append(raw[i].toString()); i++ }
            }
            else -> { b.append(raw[i].toString()); i++ }
        }
    }
    return b.toAnnotatedString()
}

/* ---------------- Umfrage ---------------- */

@Composable
fun PollBubble(p: PollData, chatId: String) {
    val scope = rememberCoroutineScope()
    Column(Modifier.widthIn(min = 200.dp, max = 270.dp)) {
        Text("📊 " + p.question, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = V3.text)
        Spacer(Modifier.height(6.dp))
        if (p.options.isEmpty()) {
            Muted3("Lade Umfrage…", 10)
        } else {
            p.options.forEach { o ->
                Box(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(10.dp))
                        .background(if (o.mine) Color(0x44FF7EDB) else Color(0x22FFFFFF))
                        .border(1.dp, if (o.mine) V3.neon.copy(alpha = 0.6f) else V3.glassBorder, RoundedCornerShape(10.dp))
                        .clickable(enabled = !p.closed) {
                            scope.launch {
                                try { PollHub.upsert(Api4.vote(chatId, p.id, o.index)) }
                                catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                            }
                        }.padding(horizontal = 8.dp, vertical = 7.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(o.label, fontFamily = Outfit, fontSize = 11.sp, color = V3.text,
                            fontWeight = if (o.mine) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
                        Text(o.percent.toString() + "%", fontFamily = Outfit, fontSize = 9.5.sp, color = V3.neon)
                    }
                }
            }
            Spacer(Modifier.height(3.dp))
            Text(
                p.totalVotes.toString() + " Stimmen" + (if (p.closed) " · beendet" else "") + (if (p.anonymous) " · anonym" else ""),
                fontFamily = Outfit, fontSize = 8.5.sp, color = V3.muted,
            )
        }
    }
}

/* ---------------- Sheets ---------------- */

@Composable
fun SheetScaffold(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable { onDismiss() }) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().heightIn(max = 640.dp)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Color(0xFF1B0F2E))
                .border(1.dp, V3.glassBorder, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .clickable { }.padding(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = V3.text,
                    modifier = Modifier.weight(1f))
                Box(Modifier.size(30.dp).clip(CircleShape).background(V3.glass).clickable { onDismiss() },
                    contentAlignment = Alignment.Center) { Text("✕", fontSize = 12.sp, color = V3.muted) }
            }
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
fun MessageActionSheet(
    m: Msg, mine: Boolean, onDismiss: () -> Unit,
    onReact: (String) -> Unit, onReply: () -> Unit, onEdit: () -> Unit, onDelete: () -> Unit,
    onCopy: () -> Unit, onForward: () -> Unit, onPin: () -> Unit, onUnread: () -> Unit,
    onTranslate: () -> Unit, onReport: () -> Unit,
    onTranscribe: (() -> Unit)? = null,
) {
    val clip = LocalClipboardManager.current
    SheetScaffold("Nachricht", onDismiss) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            QUICK_REACTIONS.forEach { e ->
                Box(Modifier.size(40.dp).clip(CircleShape).background(V3.glass).clickable { onReact(e) },
                    contentAlignment = Alignment.Center) { Text(e, fontSize = 18.sp) }
            }
        }
        Spacer(Modifier.height(12.dp))
        val actions = buildList {
            add("↩️ Antworten" to onReply)
            add("➡️ Weiterleiten" to onForward)
            add("📌 Anpinnen" to onPin)
            if (m.text.isNotEmpty()) add("📋 Kopieren" to { clip.setText(AnnotatedString(m.text)); onCopy() })
            if (m.text.isNotEmpty()) add("🌍 Übersetzen" to onTranslate)
            if (onTranscribe != null) add("🎙️ Transkription" to onTranscribe)
            add("🔵 Als ungelesen" to onUnread)
            if (mine && m.kind == "text") add("✏️ Bearbeiten" to onEdit)
            if (!mine) add("🚩 Melden" to onReport)
            if (mine) add("🗑 Löschen" to onDelete)
        }
        actions.forEach { (label, action) ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(14.dp))
                    .background(if (label.contains("Löschen")) Color(0x22FF5C7A) else V3.glass)
                    .clickable { action() }.padding(horizontal = 12.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(label, fontFamily = Outfit, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold,
                    color = if (label.contains("Löschen")) V3.danger else V3.text)
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun AttachSheet(
    onDismiss: () -> Unit, onPhoto: () -> Unit, onPoll: () -> Unit, onSchedule: () -> Unit,
    onSticker: (String) -> Unit, onLocation: () -> Unit, onVoice: () -> Unit,
) {
    SheetScaffold("Was möchtest du teilen? ✨", onDismiss) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf("📷" to onPhoto, "📍" to onLocation, "🎙️" to onVoice, "📊" to onPoll, "⏰" to onSchedule)
                .forEach { (icon, act) ->
                    Box(
                        Modifier.size(52.dp).clip(RoundedCornerShape(18.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp)).clickable { act() },
                        contentAlignment = Alignment.Center,
                    ) { Text(icon, fontSize = 22.sp) }
                }
        }
        Spacer(Modifier.height(14.dp))
        Text("Sticker", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf("💗", "🌸", "✨", "🥺", "👑", "🤖").forEach { s ->
                Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(V3.glass).clickable { onSticker(s) },
                    contentAlignment = Alignment.Center) { Text(s, fontSize = 20.sp) }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun PollCreateSheet(chatId: String, onDismiss: () -> Unit) {
    var question by remember { mutableStateOf("") }
    var opts by remember { mutableStateOf(listOf("", "")) }
    var multiple by remember { mutableStateOf(false) }
    var anonymous by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    SheetScaffold("📊 Umfrage erstellen", onDismiss) {
        V2TextField(question, { question = it }, "Deine Frage…", minHeight = 48)
        Spacer(Modifier.height(8.dp))
        opts.forEachIndexed { i, o ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                Box(Modifier.weight(1f)) {
                    V2TextField(o, { v -> opts = opts.toMutableList().also { it[i] = v } }, "Antwort ${i + 1}", minHeight = 46)
                }
                if (opts.size > 2) {
                    Spacer(Modifier.width(5.dp))
                    Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(V3.glass)
                        .clickable { opts = opts.filterIndexed { idx, _ -> idx != i } }, contentAlignment = Alignment.Center) {
                        Text("✕", fontSize = 12.sp, color = V3.muted)
                    }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ChipFilter("＋ Antwort", false) { if (opts.size < 10) opts = opts + "" }
            ChipFilter(if (multiple) "☑️ mehrere" else "◻️ eine", multiple) { multiple = !multiple }
            ChipFilter(if (anonymous) "🕶 anonym" else "👀 offen", anonymous) { anonymous = !anonymous }
        }
        Spacer(Modifier.height(10.dp))
        NeonButton3(if (busy) "Erstelle…" else "Umfrage starten 📊", loading = busy) {
            val clean = opts.map { it.trim() }.filter { it.isNotEmpty() }
            if (question.trim().length < 3) { Hub.toast("⚠️", "Frage fehlt", ""); return@NeonButton3 }
            if (clean.size < 2) { Hub.toast("⚠️", "Mindestens 2 Antworten", ""); return@NeonButton3 }
            busy = true
            scope.launch {
                try {
                    PollHub.upsert(Api4.createPoll(chatId, question.trim(), clean, multiple, anonymous))
                    try { Hub.setMessages(chatId, ApiCall.messages(chatId)) } catch (e: Exception) {}
                    onDismiss()
                } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                busy = false
            }
        }
    }
}

@Composable
fun ScheduleSheet(chatId: String, initial: String, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(initial) }
    var minutes by remember { mutableStateOf("30") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    SheetScaffold("⏰ Geplante Nachricht", onDismiss) {
        V2TextField(text, { text = it }, "Nachricht…", minHeight = 60, singleLine = false)
        Spacer(Modifier.height(8.dp))
        V2TextField(minutes, { minutes = it }, "In wie vielen Minuten?", minHeight = 46, keyboard = KeyboardType.Number)
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            listOf("5", "30", "60", "1440").forEach { m ->
                ChipFilter(if (m == "1440") "1 Tag" else "$m Min", minutes == m) { minutes = m }
            }
        }
        Spacer(Modifier.height(10.dp))
        NeonButton3(if (busy) "Plane…" else "Planen ⏰", loading = busy) {
            val mins = minutes.toIntOrNull() ?: 30
            if (text.trim().isEmpty()) { Hub.toast("⚠️", "Nachricht leer", ""); return@NeonButton3 }
            busy = true
            scope.launch {
                try {
                    val at = System.currentTimeMillis() + mins * 60_000L
                    Api4.scheduleMessage(chatId, text.trim(), at)
                    Hub.toast("⏰", "Geplant", "In $mins Min · " + fmtTime(at))
                    onDismiss()
                } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                busy = false
            }
        }
    }
}

@Composable
fun ForwardSheet(msg: Msg, chatId: String, onDismiss: () -> Unit, onOpen: (String) -> Unit) {
    val chats by Hub.chats.collectAsState()
    val scope = rememberCoroutineScope()
    val others = chats.filter { it.id != chatId }
    SheetScaffold("➡️ Weiterleiten an…", onDismiss) {
        LazyColumn(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            items(others.size) { i ->
                val c = others[i]
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(V3.glass)
                        .clickable {
                            scope.launch {
                                try {
                                    Api4.forwardMessage(chatId, msg.id, c.id)
                                    Hub.toast("➡️", "Weitergeleitet", c.name)
                                    onDismiss()
                                } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                            }
                        }.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar3(c.avatar.ifEmpty { "💬" }, 34)
                    Spacer(Modifier.width(8.dp))
                    Text(c.name, fontFamily = Outfit, fontSize = 12.5.sp, color = V3.text, modifier = Modifier.weight(1f))
                    Text(if (c.type == "private") "💬" else if (c.type == "channel") "📢" else "👥", fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun TranslateSheet(text: String, onDismiss: () -> Unit) {
    var result by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        busy = true
        try { result = Api4.aiTranslate(text) } catch (e: ApiError) { result = e.msg }
        busy = false
    }
    SheetScaffold("🌍 Übersetzen", onDismiss) {
        GlassCard3(Modifier.fillMaxWidth()) { Muted3(text, 11, 4) }
        Spacer(Modifier.height(8.dp))
        GlassCard3(Modifier.fillMaxWidth()) {
            if (busy) Spinner() else Text(result, fontFamily = Outfit, fontSize = 12.5.sp, color = V3.text)
        }
        Spacer(Modifier.height(14.dp))
    }
}

@Composable
fun ChatWallpaperSheet(chatId: String, current: Wallpaper?, onDismiss: () -> Unit) {
    var sel by remember { mutableStateOf(current?.value ?: "default") }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val data = compressToDataUrl(ctx, uri, 1080, 1_600_000)
            if (data == null) Hub.toast("💔", "Bild zu groß", "") else {
                try {
                    Api4.setWallpaper(chatId, "custom", data)
                    Hub.toast("🖼", "Wallpaper gesetzt", "Auch im Web sichtbar ✨")
                    onDismiss()
                } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            }
        }
    }

    SheetScaffold("🖼 Chat-Hintergrund", onDismiss) {
        Column(Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(androidx.compose.foundation.rememberScrollState())) {
            Text("Standard", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = V3.text)
            Spacer(Modifier.height(5.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ChipFilter("✨ App-Hintergrund", sel == "default") {
                    sel = "default"
                    scope.launch { try { Api4.setWallpaper(chatId, "default", ""); Hub.toast("✨", "Standard"); onDismiss() } catch (e: Exception) {} }
                }
                ChipFilter("📷 Eigenes Bild", false) { pick.launch("image/*") }
            }
            Spacer(Modifier.height(10.dp))
            Text("Presets", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = V3.text)
            Spacer(Modifier.height(5.dp))
            CHAT_PRESETS.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { p ->
                        Column(
                            Modifier.weight(1f).clickable {
                                sel = p.id
                                scope.launch {
                                    try {
                                        Api4.setWallpaper(chatId, "preset", p.id)
                                        Hub.toast("🖼", "Wallpaper", p.name)
                                        onDismiss()
                                    } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                }
                            },
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(12.dp))
                                    .background(Brush.verticalGradient(p.colors))
                                    .border(
                                        if (sel == p.id) 2.dp else 1.dp,
                                        if (sel == p.id) V3.neon else V3.glassBorder,
                                        RoundedCornerShape(12.dp),
                                    ),
                                contentAlignment = Alignment.Center,
                            ) { if (sel == p.id) Text("✓", fontSize = 13.sp, color = V3.neon) }
                            Spacer(Modifier.height(2.dp))
                            Muted3(p.name, 8, 1)
                        }
                    }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
                Spacer(Modifier.height(7.dp))
            }
        }
    }
}

@Composable
fun ChatInfoSheet(
    chat: ChatSummary?, details: ChatDetails?, meId: String?, onDismiss: () -> Unit,
    onBlock: () -> Unit, onReport: () -> Unit, onLovebot: () -> Unit, onLeave: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    SheetScaffold("Chat-Info 💗", onDismiss) {
        Column(Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(androidx.compose.foundation.rememberScrollState())) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar3(chat?.avatar?.ifEmpty { "💗" } ?: "💗", 52)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Title3(chat?.name ?: "Chat", 17)
                    Muted3(
                        (chat?.count ?: 0).toString() + " Mitglieder · " +
                            (if (chat?.type == "private") "privat" else if (chat?.type == "channel") "Kanal" else "Gruppe"),
                        10, 1,
                    )
                }
            }
            if (!chat?.description.isNullOrEmpty()) {
                Spacer(Modifier.height(8.dp))
                Muted3(chat?.description ?: "", 11, 3)
            }
            Spacer(Modifier.height(10.dp))
            details?.members?.take(12)?.forEach { u ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar3(u.avatar.ifEmpty { u.displayName.take(1) }, 30, online = u.online)
                    Spacer(Modifier.width(8.dp))
                    Text(u.displayName, fontFamily = Outfit, fontSize = 12.sp, color = V3.text, modifier = Modifier.weight(1f))
                    if (u.isOwner) Chip3("Owner 👑", V3.gold)
                    else if (details.adminIds.contains(u.id)) Chip3("Admin", V3.lila)
                }
            }
            Spacer(Modifier.height(10.dp))
            listOf(
                "🔕 Stummschalten (8 Std)" to {
                    scope.launch {
                        try { Api4.muteChat(chat?.id ?: "", 480); Hub.toast("🔕", "Stummgeschaltet") }
                        catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                    Unit
                },
                "📦 Archivieren" to {
                    scope.launch {
                        try { Api4.archiveChat(chat?.id ?: "", true); Hub.toast("📦", "Archiviert") }
                        catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                    Unit
                },
                "🤖 LoveBot holen" to onLovebot,
                "🚩 Melden" to onReport,
                "🚫 Blockieren" to onBlock,
                "👋 Chat verlassen" to onLeave,
            ).forEach { (label, action) ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(13.dp))
                        .background(if (label.contains("Block") || label.contains("verlassen")) Color(0x22FF5C7A) else V3.glass)
                        .clickable { action() }.padding(horizontal = 11.dp, vertical = 10.dp),
                ) {
                    Text(
                        label, fontFamily = Outfit, fontSize = 12.sp,
                        color = if (label.contains("Block") || label.contains("verlassen")) V3.danger else V3.text,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
