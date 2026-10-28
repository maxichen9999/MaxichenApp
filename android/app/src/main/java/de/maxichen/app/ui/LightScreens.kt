package de.maxichen.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch
import org.json.JSONObject

/* =====================================================================
   🛡️ V4.3 — HAUPTSCREEN: hell, clean · unten Liquid Glass
   ===================================================================== */

@Composable
fun MainScreen3(openExtra: String) {
    var tab by remember { mutableIntStateOf(0) }        // 0 Chats · 1 Calls · 2 Contacts · 3 Settings
    var openChat by remember { mutableStateOf<String?>(null) }
    var showNew by remember { mutableStateOf(false) }
    var showSecurity by remember { mutableStateOf(false) }
    var showSearch by remember { mutableStateOf(false) }
    var showScheduled by remember { mutableStateOf(false) }
    var showBlocked by remember { mutableStateOf(false) }
    var showHidden by remember { mutableStateOf(false) }
    var showMoments by remember { mutableStateOf(false) }
    var showAI by remember { mutableStateOf(false) }
    var showAdmin by remember { mutableStateOf(false) }
    var showAccounts by remember { mutableStateOf(false) }
    var showThemes by remember { mutableStateOf(false) }
    var show2fa by remember { mutableStateOf(false) }
    var showVault by remember { mutableStateOf(false) }
    var showDesign by remember { mutableStateOf(false) }
    var showSecCenter by remember { mutableStateOf(false) }
    val callState by CallManager.state.collectAsState()
    val meshState by CallMesh.state.collectAsState()

    LaunchedEffect(Hub.chatStyleRaw) { ChatStyle.load(Hub.chatStyleRaw) }

    LaunchedEffect(openExtra) {
        val t = if (openExtra.isNotEmpty()) openExtra else Hub.chatIdToOpen ?: ""
        if (t.isNotEmpty()) { openChat = t; Hub.chatIdToOpen = null }
    }

    // Vollbild-Screens
    when {
        openChat != null -> {
            Box(Modifier.fillMaxSize().background(Light.bg)) {
                ChatScreen3(openChat!!, onBack = { openChat = null; Hub.setActiveChat(null) }, onOpenChat = { openChat = it })
            }
            return
        }
        showSecurity -> { SecurityCenterScreen(onBack = { showSecurity = false }); return }
        showAdmin -> { AdminScreen2(onBack = { showAdmin = false }); return }
        showSearch -> { MessageSearchLight(onBack = { showSearch = false }, onOpenChat = { showSearch = false; openChat = it }); return }
        showScheduled -> { ScheduledLight(onBack = { showScheduled = false }); return }
        showBlocked -> { BlockedLight(onBack = { showBlocked = false }); return }
        showHidden -> { HiddenChatsScreen(onBack = { showHidden = false }, onOpenChat = { showHidden = false; openChat = it }); return }
        showMoments -> { Box(Modifier.fillMaxSize().background(Light.bg)) { MomenteScreen() }; return }
        showAI -> { Box(Modifier.fillMaxSize().background(Light.bg)) { KiTab2("", onBack = { showAI = false }) }; return }
        showAccounts -> { AccountsScreen(onBack = { showAccounts = false }, onChanged = { showAccounts = false }); return }
        showThemes -> { ThemeGalleryLight(onBack = { showThemes = false }); return }
        show2fa -> { TwoFaSetupLight(onBack = { show2fa = false }); return }
        showVault -> { VaultLight(onBack = { showVault = false }); return }
        showDesign -> { DesignScreen(onBack = { showDesign = false }); return }
        showSecCenter -> { TotpSecurityScreen(onBack = { showSecCenter = false }); return }
    }

    // 🧊 V4.4: der ganze Screen wird aufgezeichnet, damit die Glas-Leiste
    //    den echten Inhalt dahinter blurren kann (nicht mehr Milchglas).
    val glassLayer = rememberGraphicsLayer()
    val glassShot = rememberGlassShot(glassLayer)

    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .drawWithContent {
                    glassLayer.record { this@drawWithContent.drawContent() }
                    drawContent()
                },
        ) {
    Scaffold(
        containerColor = Light.bg,
    ) { pad ->
        Box(
            Modifier.fillMaxSize()
                .padding(top = pad.calculateTopPadding())
                .padding(bottom = 96.dp),
        ) {
            when (tab) {
                0 -> LightChatsTab(
                    onOpenChat = { openChat = it },
                    onNew = { showNew = true },
                    onSearch = { showSearch = true },
                    onMoments = { showMoments = true },
                    onAI = { showAI = true },
                )
                1 -> LightCallsTab()
                2 -> LightContactsTab(onOpenChat = { openChat = it })
                else -> LightSettingsTab(
                    onSecurity = { showSecurity = true },
                    onSearch = { showSearch = true },
                    onScheduled = { showScheduled = true },
                    onBlocked = { showBlocked = true },
                    onHidden = { showHidden = true },
                    onAdmin = { showAdmin = true },
                    onMoments = { showMoments = true },
                    onAI = { showAI = true },
                    onAccounts = { showAccounts = true },
                    onThemes = { showThemes = true },
                    onTwoFa = { show2fa = true },
                    onVault = { showVault = true },
                    onDesign = { showDesign = true },
                    onSecurityCenter = { showSecCenter = true },
                )
            }
            if (tab == 0) {
                Box(
                    Modifier.align(Alignment.BottomEnd).padding(end = 18.dp, bottom = 6.dp)
                        .size(54.dp).clip(CircleShape).background(Light.pinkBrush)
                        .clickable { showNew = true },
                    contentAlignment = Alignment.Center,
                ) { Text("＋", fontSize = 24.sp, color = Color.White) }
            }
        }
    }
        }
        Box(Modifier.align(Alignment.BottomCenter)) {
            LiquidGlassBar(
                items = listOf(
                    Triple("💬", "Chats", tab == 0),
                    Triple("📞", "Calls", tab == 1),
                    Triple("👥", "Contacts", tab == 2),
                    Triple("⚙️", "Settings", tab == 3),
                ),
                onSelect = { tab = it },
                shot = glassShot,
            )
        }
    }

    if (showNew) NewChatSheetLight(onDismiss = { showNew = false }, onCreated = { showNew = false; openChat = it })
    if (callState.mode != CallManager.Mode.IDLE) CallScreen2(onClose = {})
    if (meshState.active) MeshCallScreen(onClose = {})
    ToastLayerLight()
}

/* =====================================================================
   💬 CHATS — weiß · Schatten · pinke Überschrift
   ===================================================================== */

@Composable
fun LightChatsTab(
    onOpenChat: (String) -> Unit, onNew: () -> Unit, onSearch: () -> Unit,
    onMoments: () -> Unit, onAI: () -> Unit,
) {
    val chats by Hub.chats.collectAsState()
    val online by Hub.online.collectAsState()
    val typing by Hub.typing.collectAsState()
    val me by Hub.user.collectAsState()
    var q by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }

    val list = chats
        .filter { it.type != "community" && it.type != "channel" }
        .filter { q.isBlank() || it.name.contains(q, true) || it.lastText.contains(q, true) }
        .filter { filter == "all" || (filter == "unread" && it.unread > 0) || (filter == "fav" && Hub.isFavorite(it.id)) }
        .sortedWith(compareByDescending<ChatSummary> { Hub.isFavorite(it.id) }.thenByDescending { it.lastCreatedAt })

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 46.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    PinkTitle("Chats", 28)
                    SoftText("Hey " + (me?.displayName ?: "du") + " 💗", 11.5f, 1)
                }
                CircleIcon("🌸") { onMoments() }
                Spacer(Modifier.width(7.dp))
                CircleIcon("💗") { onAI() }
            }
        }
        item { Spacer(Modifier.height(2.dp)) }

        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SearchPill(q, { q = it }, "Chats durchsuchen…") }
                Spacer(Modifier.width(7.dp))
                Box(
                    Modifier.size(46.dp).clip(RoundedCornerShape(18.dp)).background(Light.pinkBrush)
                        .clickable { onSearch() },
                    contentAlignment = Alignment.Center,
                ) { Text("⌕", fontSize = 18.sp, color = Color.White) }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LightChip("Alle", filter == "all") { filter = "all" }
                LightChip("Ungelesen", filter == "unread") { filter = "unread" }
                LightChip("💗 Favoriten", filter == "fav") { filter = "fav" }
            }
        }

        if (list.isEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().padding(top = 60.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("💬", fontSize = 44.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Noch keine Chats", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                        fontSize = 15.sp, color = Light.ink)
                    SoftText("Tippe auf ＋ und starte 💗", 11f, 1)
                    Spacer(Modifier.height(14.dp))
                    Box(Modifier.width(180.dp)) { LightButton("Neuer Chat 💗") { onNew() } }
                }
            }
        }

        items(list.size) { i ->
            val c = list[i]
            val peer = c.members.firstOrNull { it != me?.id }
            LightChatCard(
                c = c,
                online = peer != null && peer in online,
                typingName = typing[c.id],
                favourite = Hub.isFavorite(c.id),
                onClick = { onOpenChat(c.id) },
            )
        }
        item { Spacer(Modifier.height(10.dp)) }
    }
}

@Composable
fun CircleIcon(icon: String, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).clip(CircleShape).background(Light.card)
            .border(1.dp, Light.line, CircleShape).clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(icon, fontSize = 16.sp) }
}

@Composable
fun LightChatCard(
    c: ChatSummary, online: Boolean, typingName: String?, favourite: Boolean,
    onClick: () -> Unit,
) {
    LightCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            LightAvatar(c.avatar.ifEmpty { if (c.type == "private") "💗" else "👥" }, 50, online)
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        c.name.ifEmpty { "Chat" },
                        fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp,
                        color = Light.ink, maxLines = 1, modifier = Modifier.weight(1f, false),
                    )
                    if (favourite) { Spacer(Modifier.width(3.dp)); Text("💗", fontSize = 10.sp) }
                    if (c.mutedUntil > System.currentTimeMillis()) { Spacer(Modifier.width(3.dp)); Text("🔕", fontSize = 10.sp) }
                }
                Spacer(Modifier.height(3.dp))
                if (typingName != null) {
                    Text("$typingName tippt…", fontFamily = Outfit, fontSize = 11.5.sp, color = Light.pink)
                } else {
                    Text(
                        c.lastText.ifEmpty { if (c.lastImage) "📷 Foto" else "Noch keine Nachricht" },
                        fontFamily = Outfit, fontSize = 11.5.sp, color = Light.soft, maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                SoftText(fmtTime(c.lastCreatedAt), 9f, 1)
                Spacer(Modifier.height(5.dp))
                if (c.unread > 0) {
                    Box(
                        Modifier.size(20.dp).clip(CircleShape).background(Light.pinkBrush),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(c.unread.toString(), fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                            fontSize = 10.sp, color = Color.White)
                    }
                } else if (c.type != "private") {
                    LightBadge(if (c.type == "channel") "Kanal" else (c.count.toString() + " 👥"), Light.lila)
                } else {
                    Text("✓✓", fontFamily = Outfit, fontSize = 9.5.sp, color = Light.lila)
                }
            }
        }
    }
}

/* =====================================================================
   📞 CALLS
   ===================================================================== */

@Composable
fun LightCallsTab() {
    val chats by Hub.chats.collectAsState()
    val online by Hub.online.collectAsState()
    val me by Hub.user.collectAsState()
    val privates = chats.filter { it.type == "private" }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 46.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        item {
            PinkTitle("Calls", 28)
            SoftText("1:1 · Video · verschlüsselt", 11.5f, 1)
            Spacer(Modifier.height(10.dp))
        }
        item {
            LightCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(Light.pinkSoft),
                        contentAlignment = Alignment.Center,
                    ) { Text("🔒", fontSize = 17.sp) }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Peer-to-Peer", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                            fontSize = 13.sp, color = Light.ink)
                        SoftText("Anrufe laufen direkt zwischen euch — nicht über einen Server.", 10.5f, 2)
                    }
                }
            }
        }
        item {
            Spacer(Modifier.height(4.dp))
            Text("Kontakte", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
        }
        if (privates.isEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("📞", fontSize = 40.sp)
                    Spacer(Modifier.height(8.dp))
                    SoftText("Noch keine Kontakte", 11.5f, 1)
                }
            }
        }
        items(privates.size) { i ->
            val c = privates[i]
            val peer = c.members.firstOrNull { it != me?.id } ?: ""
            LightCard(padding = 10) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LightAvatar(c.avatar.ifEmpty { "💗" }, 44, peer in online)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.name, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                        SoftText(if (peer in online) "online ✨" else "offline", 10f, 1)
                    }
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(Light.pinkSoft).clickable {
                            CallManager.startOutgoing(c.id, peer, c.name, false)
                        },
                        contentAlignment = Alignment.Center,
                    ) { Text("📞", fontSize = 15.sp) }
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(Color(0x14A97BFF)).clickable {
                            CallManager.startOutgoing(c.id, peer, c.name, true)
                        },
                        contentAlignment = Alignment.Center,
                    ) { Text("🎥", fontSize = 15.sp) }
                }
            }
        }
    }
}

/* =====================================================================
   👥 CONTACTS
   ===================================================================== */

@Composable
fun LightContactsTab(onOpenChat: (String) -> Unit) {
    val chats by Hub.chats.collectAsState()
    val online by Hub.online.collectAsState()
    val me by Hub.user.collectAsState()
    var q by remember { mutableStateOf("") }
    var people by remember { mutableStateOf<List<UserData>>(emptyList()) }

    LaunchedEffect(Unit) {
        try { people = ApiCall.search("a").users.filter { it.id != me?.id && it.id != "lovebot" } } catch (e: Exception) {}
    }

    val privates = chats.filter { it.type == "private" }
    val filtered = privates.filter { q.isBlank() || it.name.contains(q, true) }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 46.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        item {
            PinkTitle("Contacts", 28)
            SoftText(privates.size.toString() + " Kontakte · " + people.size + " gefunden", 11.5f, 1)
            Spacer(Modifier.height(10.dp))
            SearchPill(q, { q = it }, "Kontakte suchen…")
            Spacer(Modifier.height(6.dp))
        }
        items(filtered.size) { i ->
            val c = filtered[i]
            val peer = c.members.firstOrNull { it != me?.id } ?: ""
            LightCard(padding = 10, onClick = { onOpenChat(c.id) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LightAvatar(c.avatar.ifEmpty { "💗" }, 44, peer in online)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.name, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                        SoftText(if (peer in online) "jetzt online" else "zuletzt " + timeAgo(c.lastCreatedAt), 10f, 1)
                    }
                    Text("›", fontSize = 20.sp, color = Light.soft)
                }
            }
        }
        if (filtered.isEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("👥", fontSize = 40.sp)
                    Spacer(Modifier.height(8.dp))
                    SoftText("Noch keine Kontakte — starte über Chats 💗", 11f, 2)
                }
            }
        }
    }
}

/* =====================================================================
   ⚙️ SETTINGS
   ===================================================================== */

@Composable
fun LightSettingsTab(
    onSecurity: () -> Unit, onSearch: () -> Unit, onScheduled: () -> Unit,
    onBlocked: () -> Unit, onHidden: () -> Unit, onAdmin: () -> Unit,
    onMoments: () -> Unit, onAI: () -> Unit,
    onAccounts: () -> Unit, onThemes: () -> Unit, onTwoFa: () -> Unit, onVault: () -> Unit,
    onDesign: () -> Unit = {},
    onSecurityCenter: () -> Unit = {},
) {
    val me by Hub.user.collectAsState()
    val context = LocalContext.current
    var score by remember { mutableIntStateOf(-1) }

    LaunchedEffect(Unit) {
        try { score = Api.get("/api/security/overview").optInt("score", -1) } catch (e: Exception) {}
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(46.dp))
        PaddingValues(0.dp)
        Column(Modifier.padding(horizontal = 16.dp)) {
            PinkTitle("Settings", 28)
            SoftText("by Maxichen · 910maxi", 11.5f, 1)
            Spacer(Modifier.height(12.dp))

            /* Profil */
            LightCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LightAvatar(me?.avatar.orEmpty().ifEmpty { (me?.displayName ?: "?").take(1) }, 58)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(me?.displayName ?: "—", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp, color = Light.ink)
                            if (me?.isOwner == true) { Spacer(Modifier.width(4.dp)); Text("👑", fontSize = 13.sp) }
                        }
                        SoftText("@" + (me?.username ?: ""), 10.5f, 1)
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            LightBadge(me?.roleLabel ?: "Benutzer", if (me?.isOwner == true) Light.gold else Light.lila)
                            if (me?.isOwner == true) LightBadge("Owner-Rechte", Light.pink)
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            /* Sicherheits-Score */
            LightCard(onClick = onSecurity) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ScoreRing(if (score < 0) 0 else score, 62)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Sicherheits-Center", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                            fontSize = 14.sp, color = Light.ink)
                        SoftText(
                            if (score < 0) "Wird geladen…" else "Score " + score + " % · " + gradeOf(score),
                            10.5f, 1,
                        )
                        Spacer(Modifier.height(3.dp))
                        LightBadge("2FA · PIN · Privat-Modus", Light.lila)
                    }
                    Text("›", fontSize = 20.sp, color = Light.soft)
                }
            }

            Spacer(Modifier.height(10.dp))
            Text("Deine Sachen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
            LightRow("👥", "Konten", "bis zu 5 · in 400 ms wechseln") { onAccounts() }
            LightRow("🎨", "Themes", "20 Stück · Live-Vorschau") { onThemes() }
            LightRow("🔍", "Nachrichten suchen", "über alle Chats") { onSearch() }
            LightRow("⏰", "Geplante Nachrichten", "was später rausgeht") { onScheduled() }
            LightRow("🙈", "Versteckte Chats", "nur mit Geste sichtbar") { onHidden() }
            LightRow("🚫", "Blockierte Nutzer", "wen du stumm gestellt hast") { onBlocked() }
            LightRow("🌸", "Momente", "24 Stunden · dann weg") { onMoments() }
            LightRow("💗", "LoveAI", "deine KI-Assistentin") { onAI() }

            Spacer(Modifier.height(10.dp))
            Text("Sicherheit", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
            LightRow("🛡️", "Sicherheits-Center", "Score · Sitzungen · Verlauf") { onSecurity() }
            LightRow("📱", "2FA · PIN · Recovery · Haken", "TOTP mit jeder Authenticator-App · Server-Signatur") { onSecurityCenter() }
            LightRow("🔐", "2FA mit Authenticator-App", "TOTP · Aegis · Google Authenticator") { onTwoFa() }
            LightRow("💾", "Backup & Einladung", "Schlüssel + Verlauf · .mcbk · PBKDF2 + AES-256-GCM") { onVault() }
            // 🔐 V4.8: liegt wirklich alles im Keystore-Tresor?
            var vaultInfo by remember { mutableStateOf(Vault.info(context)) }
            var vaultBusy by remember { mutableStateOf(false) }
            val vaultScope = rememberCoroutineScope()
            // 🌸 V4.9.1: Status GROSS und in Farbe — man soll es auf einen Blick sehen
            LightCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (vaultInfo.strongBox) "💎" else if (!vaultInfo.available) "⚠️" else if (vaultInfo.hardware) "🛡️" else "⚠️",
                        fontSize = 26.sp,
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            when {
                                !vaultInfo.available -> "Kein sicherer Tresor"
                                vaultInfo.strongBox -> "StrongBox"
                                vaultInfo.hardware -> "TEE (Hardware)"
                                else -> "Software-Keystore"
                            },
                            fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp,
                            color = when {
                                !vaultInfo.available -> Light.danger
                                vaultInfo.strongBox -> Light.lila
                                vaultInfo.hardware -> Light.green
                                else -> Light.gold
                            },
                        )
                        SoftText(
                            when {
                                !vaultInfo.available -> "E2E bleibt aus — kein Klartext-Fallback"
                                vaultInfo.strongBox -> "Privater Schlüssel im eigenen Sicherheitschip — nicht exportierbar"
                                vaultInfo.hardware -> "Privater Schlüssel in Hardware — nicht exportierbar"
                                else -> "Schlüssel nicht exportierbar · Software-Ebene"
                            },
                            9.5f, 2,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth()) {
                    LightGhost(if (vaultBusy) "prüft…" else "🔐 Tresor testen") {
                        if (!vaultBusy) {
                            vaultBusy = true
                            vaultScope.launch {
                                val ok = Vault.selfTest(context)
                                vaultInfo = Vault.info(context)
                                vaultBusy = false
                                Hub.toast(
                                    if (ok) "🔐" else "💔",
                                    if (ok) "Tresor arbeitet" else "Tresor antwortet nicht",
                                    if (ok) vaultInfo.label + " · privater Schlüssel verlässt das Gerät nie"
                                    else "E2E bleibt aus, statt Schlüssel im Klartext zu speichern",
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))
            LightRow("🎨", "Design & Theme", MaxiTheme.palette.emoji + " " + MaxiTheme.palette.name +
                (if (MaxiTheme.amoled) " · AMOLED" else "") + " · 4 Themes, Material You") { onDesign() }
            LightRow(
                if (vaultInfo.strongBox) "💎" else if (vaultInfo.available) "🔐" else "⚠️",
                "Schlüsseltresor",
                when {
                    vaultBusy -> "wird geprüft…"
                    !vaultInfo.available -> "nicht verfügbar — E2E bleibt aus (kein Klartext-Fallback)"
                    else -> vaultInfo.label + " · Selbsttest antippen"
                },
            ) {
                if (!vaultBusy) {
                    vaultBusy = true
                    vaultScope.launch {
                        val ok = Vault.selfTest(context)
                        vaultInfo = Vault.info(context)
                        vaultBusy = false
                        Hub.toast(
                            if (ok) "🔐" else "💔",
                            if (ok) "Tresor arbeitet" else "Tresor antwortet nicht",
                            if (ok) vaultInfo.label + " · privater Schlüssel verlässt das Gerät nie"
                            else "E2E bleibt aus, statt Schlüssel im Klartext zu speichern",
                        )
                    }
                }
            }

            // 🔥 V4.7: ist der Anruf-Relay (TURN) erreichbar?
            var turnOn by remember { mutableStateOf(IceConfig.turnAvailable) }
            var turnBusy by remember { mutableStateOf(false) }
            val turnScope = rememberCoroutineScope()
            LightRow(
                if (turnOn) "🔥" else "🌐",
                "Anruf-Relay (TURN)",
                when {
                    turnBusy -> "wird geprüft…"
                    turnOn -> "aktiv · Anrufe halten auch hinter NAT/Firewall"
                    else -> "nur STUN — hinter strengen NATs scheitert der Anruf · tippen zum Prüfen"
                },
            ) {
                if (!turnBusy) {
                    turnBusy = true
                    turnScope.launch {
                        IceConfig.refresh(force = true)
                        turnOn = IceConfig.turnAvailable
                        turnBusy = false
                        Hub.toast(
                            if (turnOn) "🔥" else "🌐",
                            if (turnOn) "TURN aktiv" else "Kein TURN",
                            if (turnOn) "Relay antwortet · Anrufe sind robust"
                            else (IceConfig.lastError ?: "Server ohne TURN_HOST/SECRET — deploy/install-turn.sh"),
                        )
                    }
                }
            }

            if (me?.isStaff == true) {
                LightRow(
                    "🏛", "Team-Zentrale",
                    if (me?.isOwner == true) "Owner · volle Rechte 👑" else "nur Leserechte · Sperren nur Owner",
                ) { onAdmin() }
            }

            Spacer(Modifier.height(10.dp))
            LightCard {
                Text("MaxiChat 4.13", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                SoftText("Build 16 · By Maxichen · 910maxi", 9.5f, 1)
                Spacer(Modifier.height(3.dp))
                Spacer(Modifier.height(3.dp))
                SoftText("🌌 PQXDH · ML-KEM-768 (FIPS 203) · quantensicher", 9.5f, 1)
                SoftText("🎨 4 Themes · Material You · MaxiBot lokal", 9.5f, 1)
                SoftText("0 % WebView · 100 % native Compose · Android 16 ready", 9.5f, 2)
            }

            Spacer(Modifier.height(10.dp))
            Box(Modifier.fillMaxWidth()) {
                LightGhost("Abmelden") { Hub.logoutAction?.invoke() }
            }
            Spacer(Modifier.height(26.dp))
        }
    }
}

@Composable
fun LightRow(icon: String, title: String, sub: String, onClick: () -> Unit) {
    Box(Modifier.padding(bottom = 5.dp)) {
        LightCard(padding = 11, onClick = onClick) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(34.dp).clip(RoundedCornerShape(12.dp)).background(Light.pinkSoft),
                    contentAlignment = Alignment.Center,
                ) { Text(icon, fontSize = 15.sp) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, color = Light.ink)
                    SoftText(sub, 9.5f, 1)
                }
                Text("›", fontSize = 18.sp, color = Light.soft)
            }
        }
    }
}

fun gradeOf(score: Int): String = when {
    score >= 90 -> "Fort Knox 👑"
    score >= 70 -> "Sehr sicher 💪"
    score >= 45 -> "Okay 🌸"
    else -> "Ausbaufähig ⚠️"
}

/* =====================================================================
   🟣 SCORE-RING
   ===================================================================== */

@Composable
fun ScoreRing(score: Int, size: Int = 70) {
    Box(Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 7.dp.toPx()
            val inset = stroke / 2
            drawArc(
                color = Color(0xFFF3E4EC),
                startAngle = -90f, sweepAngle = 360f, useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(this.size.width - stroke, this.size.height - stroke),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            drawArc(
                brush = Brush.sweepGradient(listOf(Color(0xFFFF7EBB), Color(0xFFA97BFF), Color(0xFFFF7EBB))),
                startAngle = -90f, sweepAngle = 3.6f * score.coerceIn(0, 100), useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(this.size.width - stroke, this.size.height - stroke),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$score", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Light.pink)
            SoftText("%", 8f, 1)
        }
    }
}

/* =====================================================================
   🛡️ SICHERHEITS-CENTER
   ===================================================================== */

@Composable
fun SecurityCenterScreen(onBack: () -> Unit) {
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var privacy by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try {
            val j = Api.get("/api/security/overview")
            data = j
            privacy = j.optJSONObject("privacy")
        } catch (e: Exception) {}
        loading = false
    }
    LaunchedEffect(Unit) { reload() }

    fun setP(field: String, value: Any) {
        scope.launch {
            try {
                val body = JSONObject().put(field, value)
                val r = Api.post("/api/privacy", body)
                privacy = r.optJSONObject("privacy")
                reload()
            } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
        }
    }

    val score = data?.optInt("score", 0) ?: 0
    val checks = data?.optJSONArray("checks")

    Column(Modifier.fillMaxSize().background(Light.bg).verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(46.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Light.card).border(1.dp, Light.line, CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) { Text("←", fontSize = 17.sp, color = Light.ink) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                PinkTitle("Sicherheit", 22)
                SoftText("Dein Schutz-Cockpit 🛡️", 10.5f, 1)
            }
        }
        Spacer(Modifier.height(12.dp))

        Column(Modifier.padding(horizontal = 16.dp)) {
            if (loading) {
                Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { Spinner(Light.pink) }
            } else {
                LightCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ScoreRing(score, 78)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(gradeOf(score), fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp, color = Light.pink)
                            SoftText(
                                (data?.optInt("points", 0) ?: 0).toString() + " von " + (data?.optInt("max", 100) ?: 100) + " Punkten",
                                10.5f, 1,
                            )
                            Spacer(Modifier.height(4.dp))
                            SoftText((data?.optInt("sessions", 0) ?: 0).toString() + " aktive Sitzung(en)", 10f, 1)
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))
                Text("Prüfungen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                    color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
                if (checks != null) {
                    for (i in 0 until checks.length()) {
                        val c = checks.getJSONObject(i)
                        val ok = c.optBoolean("ok")
                        LightCard(padding = 11) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    Modifier.size(30.dp).clip(CircleShape)
                                        .background(if (ok) Light.green.copy(alpha = 0.14f) else Light.gold.copy(alpha = 0.14f)),
                                    contentAlignment = Alignment.Center,
                                ) { Text(if (ok) "✓" else "!", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold,
                                    color = if (ok) Light.green else Light.gold) }
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(c.optString("label"), fontFamily = Outfit, fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp, color = Light.ink)
                                    val hint = c.optString("hint")
                                    if (hint.isNotEmpty()) SoftText(hint, 9.5f, 2)
                                }
                                LightBadge(if (ok) "ok" else "+" + c.optInt("weight"), if (ok) Light.green else Light.gold)
                            }
                        }
                        Spacer(Modifier.height(5.dp))
                    }
                }

                Spacer(Modifier.height(6.dp))
                Text("Privat-Modus", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                    color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))

                val dm = privacy?.optString("allowDmFrom") ?: "all"
                LightCard {
                    Text("Wer darf mir schreiben?", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                        fontSize = 12.5.sp, color = Light.ink)
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        LightChip("Alle", dm == "all") { setP("allowDmFrom", "all") }
                        LightChip("Kontakte", dm == "contacts") { setP("allowDmFrom", "contacts") }
                        LightChip("Niemand", dm == "nobody") { setP("allowDmFrom", "nobody") }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("Wer sieht, wann ich online war?", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                        fontSize = 12.5.sp, color = Light.ink)
                    Spacer(Modifier.height(6.dp))
                    val ls = privacy?.optString("lastSeenPrivacy") ?: "all"
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        LightChip("Alle", ls == "all") { setP("lastSeenPrivacy", "all") }
                        LightChip("Kontakte", ls == "contacts") { setP("lastSeenPrivacy", "contacts") }
                        LightChip("Niemand", ls == "nobody") { setP("lastSeenPrivacy", "nobody") }
                    }
                }

                Spacer(Modifier.height(8.dp))
                val filterOn = privacy?.optBoolean("strictFilter", true) ?: true
                val quietOn = privacy?.optJSONObject("quietHours")?.optBoolean("enabled") ?: false
                val receipts = privacy?.optBoolean("readReceipts", true) ?: true

                ToggleRow("🛡️", "Inhaltsfilter", "Blockt Scam- und Betrugsnachrichten", filterOn) { setP("strictFilter", !filterOn) }
                ToggleRow("🌙", "Stille Stunden", "22:00 – 07:00 keine Push-Flut", quietOn) {
                    scope.launch {
                        try {
                            Api.post("/api/privacy", JSONObject().put(
                                "quietHours",
                                JSONObject().put("enabled", !quietOn).put("from", "22:00").put("to", "07:00"),
                            ))
                            reload()
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                }
                ToggleRow("✓✓", "Lesebestätigungen", "andere sehen, dass du gelesen hast", receipts) { setP("readReceipts", !receipts) }

                Spacer(Modifier.height(8.dp))
                Text("Letzte Anmeldungen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                    color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
                val logins = data?.optJSONArray("logins")
                if (logins != null && logins.length() > 0) {
                    for (i in 0 until logins.length()) {
                        val l = logins.getJSONObject(i)
                        LightCard(padding = 10) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (l.optString("device").contains("Android") || l.optString("device").contains("iOS")) "📱" else "💻",
                                    fontSize = 15.sp)
                                Spacer(Modifier.width(8.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(l.optString("device"), fontFamily = Outfit, fontWeight = FontWeight.Bold,
                                        fontSize = 11.5.sp, color = Light.ink)
                                    SoftText(timeAgo(l.optLong("at")), 9f, 1)
                                }
                                if (l.optBoolean("newDevice")) LightBadge("neu 👀", Light.danger)
                            }
                        }
                        Spacer(Modifier.height(5.dp))
                    }
                } else SoftText("Noch keine Einträge", 10f, 1)

                Spacer(Modifier.height(10.dp))
                val tips = data?.optJSONArray("tips")
                if (tips != null) {
                    LightCard {
                        Text("Tipps 💗", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, color = Light.ink)
                        Spacer(Modifier.height(5.dp))
                        for (i in 0 until tips.length()) {
                            SoftText("• " + tips.getString(i), 10f, 3)
                            Spacer(Modifier.height(3.dp))
                        }
                    }
                }
            }
            Spacer(Modifier.height(26.dp))
        }
    }
}

@Composable
fun ToggleRow(icon: String, title: String, sub: String, on: Boolean, onToggle: () -> Unit) {
    Box(Modifier.padding(bottom = 5.dp)) {
        LightCard(padding = 11, onClick = onToggle) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(Light.pinkSoft),
                    contentAlignment = Alignment.Center,
                ) { Text(icon, fontSize = 14.sp) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, color = Light.ink)
                    SoftText(sub, 9.5f, 2)
                }
                Box(
                    Modifier.size(width = 42.dp, height = 24.dp).clip(RoundedCornerShape(50))
                        .background(if (on) Light.pinkBrush else Brush.horizontalGradient(listOf(Color(0xFFEADDE5), Color(0xFFEADDE5)))),
                    contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
                ) {
                    Box(
                        Modifier.padding(horizontal = 3.dp).size(18.dp).clip(CircleShape).background(Color.White),
                    )
                }
            }
        }
    }
}

/* =====================================================================
   🙈 VERSTECKTE CHATS
   ===================================================================== */

@Composable
fun HiddenChatsScreen(onBack: () -> Unit, onOpenChat: (String) -> Unit) {
    var list by remember { mutableStateOf<List<ChatSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try {
            val j = Api.get("/api/me?hidden=1")
            val arr = j.optJSONArray("chats")
            list = if (arr == null) emptyList() else (0 until arr.length()).map { ChatSummary.from(arr.getJSONObject(it)) }
        } catch (e: Exception) {}
        loading = false
    }
    LaunchedEffect(Unit) { reload() }

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        Spacer(Modifier.height(46.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Light.card).border(1.dp, Light.line, CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) { Text("←", fontSize = 17.sp, color = Light.ink) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                PinkTitle("Versteckt", 22)
                SoftText("Nur du siehst diese Chats 🙈", 10.5f, 1)
            }
        }
        Spacer(Modifier.height(12.dp))
        if (loading) {
            Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { Spinner(Light.pink) }
        } else if (list.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("🙈", fontSize = 40.sp)
                Spacer(Modifier.height(8.dp))
                SoftText("Nichts versteckt", 11.5f, 1)
                Spacer(Modifier.height(4.dp))
                SoftText("In einem Chat: ⋮ → Verstecken", 10f, 1)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(list.size) { i ->
                    val c = list[i]
                    LightCard(onClick = { onOpenChat(c.id) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            LightAvatar(c.avatar.ifEmpty { "🙈" }, 44)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(c.name, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                                SoftText(c.lastText.ifEmpty { "Kein Text" }, 10f, 1)
                            }
                            Box(
                                Modifier.clip(RoundedCornerShape(50)).background(Light.pinkSoft)
                                    .clickable {
                                        scope.launch {
                                            try {
                                                Api.post("/api/chats/" + c.id + "/hide", JSONObject().put("hidden", false))
                                                Hub.toast("👁", "Wieder sichtbar", c.name)
                                                reload()
                                            } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                        }
                                    }.padding(horizontal = 9.dp, vertical = 4.dp),
                            ) { Text("zeigen", fontFamily = Outfit, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Light.pink) }
                        }
                    }
                }
            }
        }
    }
}

/* =====================================================================
   💬 CHAT-SCREEN (hell) — nutzt die V4-Logik
   ===================================================================== */

@Composable
fun ChatScreen3(chatId: String, onBack: () -> Unit, onOpenChat: (String) -> Unit) {
    // Der bestehende Chat-Screen kann bleiben, nur die Farbe stimmt bei der Blase.
    // Für V4.3 gibt es oben einen hellen Kopf und unten keinen Glas-Look.
    ChatScreen2(chatId, onBack, onOpenChat)
}

/* =====================================================================
   ✨ TOASTS (hell)
   ===================================================================== */

@Composable
fun ToastLayerLight() {
    val toasts by Hub.toasts.collectAsState()
    Column(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(54.dp))
        toasts.takeLast(3).forEach { t ->
            Box(Modifier.padding(vertical = 3.dp)) {
                LightCard(padding = 10) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t.icon, fontSize = 17.sp)
                        Spacer(Modifier.width(9.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                fontSize = 12.sp, color = Light.ink, maxLines = 1)
                            if (t.sub.isNotEmpty()) SoftText(t.sub, 10f, 2)
                        }
                        Box(Modifier.clickable { Hub.popToast(t.id) }) { Text("✕", fontSize = 10.sp, color = Light.soft) }
                    }
                }
            }
        }
    }
}

/* =====================================================================
   ✨ NEUER CHAT (hell)
   ===================================================================== */

@Composable
fun NewChatSheetLight(onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    var mode by remember { mutableStateOf("private") }
    var q by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<UserData>>(emptyList()) }
    var name by remember { mutableStateOf("") }
    val picked = remember { mutableStateListOf<String>() }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val me by Hub.user.collectAsState()

    fun search() {
        if (q.isBlank()) return
        scope.launch {
            try { users = ApiCall.search(q).users.filter { it.id != me?.id && it.id != "lovebot" } }
            catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0x44000000)).clickable { onDismiss() }) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().heightIn(max = 640.dp)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Light.bg)
                .clickable { }.padding(18.dp).verticalScroll(rememberScrollState()),
        ) {
            PinkTitle("Neu starten ✨", 20)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                listOf("private" to "💬 Chat", "group" to "👥 Gruppe", "community" to "🏰 Community", "channel" to "📢 Kanal")
                    .forEach { (k, l) ->
                        LightChip(l, mode == k) { mode = k; picked.clear() }
                    }
            }
            Spacer(Modifier.height(10.dp))
            if (mode != "private") {
                androidx.compose.foundation.text.BasicTextField(
                    value = name, onValueChange = { name = it }, singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = Outfit, fontSize = 13.sp, color = Light.ink),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(Light.pink),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Light.card)
                        .padding(14.dp),
                )
                Spacer(Modifier.height(8.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SearchPill(q, { q = it }, "Personen suchen…") }
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier.size(46.dp).clip(RoundedCornerShape(18.dp)).background(Light.pinkBrush)
                        .clickable { search() },
                    contentAlignment = Alignment.Center,
                ) { Text("🔍", fontSize = 15.sp) }
            }
            Spacer(Modifier.height(8.dp))
            users.forEach { u ->
                val on = picked.contains(u.id)
                Box(Modifier.padding(bottom = 5.dp)) {
                    LightCard(padding = 9, onClick = {
                        if (mode == "private") {
                            scope.launch {
                                busy = true
                                try {
                                    val c = ApiCall.createChat("private", userId = u.id)
                                    Hub.upsertChat(c)
                                    onCreated(c.id)
                                } catch (e: ApiError) { Hub.toast("🔒", "Nicht möglich", e.msg) }
                                busy = false
                            }
                        } else if (on) picked.remove(u.id) else picked.add(u.id)
                    }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            LightAvatar(u.avatar.ifEmpty { u.displayName.take(1) }, 38, u.online)
                            Spacer(Modifier.width(9.dp))
                            Column(Modifier.weight(1f)) {
                                Text(u.displayName, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                    fontSize = 12.5.sp, color = Light.ink)
                                SoftText("@" + u.username, 9f, 1)
                            }
                            if (mode != "private" && on) Text("✓", fontSize = 14.sp, color = Light.pink, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            if (mode != "private") {
                Spacer(Modifier.height(6.dp))
                LightButton(if (busy) "Erstelle…" else "Erstellen 💗") {
                    if (name.trim().length < 2) { Hub.toast("⚠️", "Name fehlt", ""); return@LightButton }
                    scope.launch {
                        busy = true
                        try {
                            val c = ApiCall.createChat(mode, name = name.trim(), memberIds = picked.toList())
                            Hub.upsertChat(c)
                            onCreated(c.id)
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        busy = false
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            LightGhost("Abbrechen") { onDismiss() }
            Spacer(Modifier.height(16.dp))
        }
    }
}

/* =====================================================================
   🔍 SUCHE · ⏰ GEPLANT · 🚫 BLOCKIERT (hell)
   ===================================================================== */

@Composable
fun MessageSearchLight(onBack: () -> Unit, onOpenChat: (String) -> Unit) {
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<SearchHit>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        Spacer(Modifier.height(46.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Light.card).border(1.dp, Light.line, CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) { Text("←", fontSize = 17.sp, color = Light.ink) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                PinkTitle("Suche", 22)
                SoftText("über alle Chats", 10.5f, 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SearchPill(q, { q = it }, "Suchbegriff…") }
            Spacer(Modifier.width(6.dp))
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(18.dp)).background(Light.pinkBrush).clickable {
                    if (q.trim().length < 2) Hub.toast("⚠️", "Mindestens 2 Zeichen", "") else scope.launch {
                        busy = true
                        try { hits = Api4.searchMessages(q.trim()) } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        busy = false
                    }
                },
                contentAlignment = Alignment.Center,
            ) { if (busy) Spinner(Color.White) else Text("➤", fontSize = 15.sp, color = Color.White) }
        }
        Spacer(Modifier.height(10.dp))
        if (hits.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("🔍", fontSize = 40.sp)
                Spacer(Modifier.height(8.dp))
                SoftText("Wonach suchst du?", 11.5f, 1)
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(hits.size) { i ->
                    val h = hits[i]
                    LightCard(onClick = { onOpenChat(h.chatId) }) {
                        Row {
                            Text(h.chatName, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                fontSize = 11.5.sp, color = Light.pink, modifier = Modifier.weight(1f))
                            SoftText(fmtDate(h.createdAt), 8f, 1)
                        }
                        Spacer(Modifier.height(2.dp))
                        Text(h.text.ifEmpty { "📎 Anhang" }, fontFamily = Outfit, fontSize = 11.5.sp,
                            color = Light.ink, maxLines = 3)
                        Spacer(Modifier.height(2.dp))
                        SoftText(h.senderName, 8.5f, 1)
                    }
                }
            }
        }
    }
}

@Composable
fun ScheduledLight(onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<ScheduledMsg>>(emptyList()) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { try { list = Api4.scheduled() } catch (e: Exception) {} }

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        Spacer(Modifier.height(46.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Light.card).border(1.dp, Light.line, CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) { Text("←", fontSize = 17.sp, color = Light.ink) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                PinkTitle("Geplant", 22)
                SoftText("Nachrichten, die später rausgehen", 10.5f, 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(list.size) { i ->
                val s = list[i]
                LightCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(s.chatName, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                    fontSize = 11.sp, color = Light.pink)
                                Spacer(Modifier.width(5.dp))
                                LightBadge(fmtDate(s.at), Light.gold)
                            }
                            Spacer(Modifier.height(2.dp))
                            Text(s.text, fontFamily = Outfit, fontSize = 11.5.sp, color = Light.ink, maxLines = 2)
                        }
                        Box(
                            Modifier.size(30.dp).clip(CircleShape).background(Color(0x14E8546E)).clickable {
                                scope.launch {
                                    try { Api4.cancelScheduled(s.id); list = list.filterNot { it.id == s.id } }
                                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                }
                            },
                            contentAlignment = Alignment.Center,
                        ) { Text("✕", fontSize = 11.sp, color = Light.danger) }
                    }
                }
            }
            if (list.isEmpty()) {
                item {
                    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("⏰", fontSize = 40.sp)
                        Spacer(Modifier.height(8.dp))
                        SoftText("Nichts geplant", 11.5f, 1)
                    }
                }
            }
        }
    }
}

@Composable
fun BlockedLight(onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<BlockedUser>>(emptyList()) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { try { list = Api4.blocks() } catch (e: Exception) {} }

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        Spacer(Modifier.height(46.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Light.card).border(1.dp, Light.line, CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) { Text("←", fontSize = 17.sp, color = Light.ink) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                PinkTitle("Blockiert", 22)
                SoftText("Diese Personen können dir nicht schreiben", 10.5f, 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(list.size) { i ->
                val b = list[i]
                LightCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LightAvatar(b.avatar, 38)
                        Spacer(Modifier.width(9.dp))
                        Column(Modifier.weight(1f)) {
                            Text(b.displayName, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, color = Light.ink)
                            SoftText("@" + b.username, 9f, 1)
                        }
                        Box(
                            Modifier.clip(RoundedCornerShape(50)).background(Light.green.copy(alpha = 0.12f))
                                .clickable {
                                    scope.launch {
                                        try { Api4.unblock(b.id); list = list.filterNot { it.id == b.id } }
                                        catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                    }
                                }.padding(horizontal = 9.dp, vertical = 4.dp),
                        ) { Text("freigeben", fontFamily = Outfit, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Light.green) }
                    }
                }
            }
            if (list.isEmpty()) {
                item {
                    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("🕊", fontSize = 40.sp)
                        Spacer(Modifier.height(8.dp))
                        SoftText("Niemand blockiert", 11.5f, 1)
                    }
                }
            }
        }
    }
}
