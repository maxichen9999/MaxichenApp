package de.maxichen.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch

/* =====================================================================
   ⚙️ EINSTELLUNGEN V4
   ===================================================================== */

@Composable
fun SettingsScreen3(
    onBack: () -> Unit,
    onOpenAdmin: () -> Unit,
    onLogout: () -> Unit,
    onSearch: () -> Unit,
    onScheduled: () -> Unit,
    onBlocked: () -> Unit,
    onAI: () -> Unit,
) {
    val me by Hub.user.collectAsState()
    val appBg by V3State.appBackground.collectAsState()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val clip = LocalClipboardManager.current

    var editProfile by remember { mutableStateOf(false) }
    var displayName by remember { mutableStateOf(me?.displayName ?: "") }
    var bio by remember { mutableStateOf(me?.bio ?: "") }
    var avatar by remember { mutableStateOf(me?.avatar ?: "💗") }
    var showBg by remember { mutableStateOf(false) }
    var show2fa by remember { mutableStateOf(false) }
    var showSessions by remember { mutableStateOf(false) }
    var showDanger by remember { mutableStateOf(false) }
    var exportText by remember { mutableStateOf("") }

    val pickAvatar = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val d = compressToDataUrl(ctx, uri, 320, 260_000)
            if (d != null) {
                avatar = d
                try { Hub.setUser(ApiCall.updateMe(mapOf("avatar" to d))) } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Title3("Profil ⚙️", 21)
                Muted3("by Maxichen · 910maxi 💗", 10, 1)
            }
        }
        Spacer(Modifier.height(12.dp))

        /* --------- Profilkarte --------- */
        GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.clickable { pickAvatar.launch("image/*") }) {
                    val bmp = remember(avatar) { if (avatar.startsWith("data:")) DecodeBase64(avatar) else null }
                    if (bmp != null) androidx.compose.foundation.Image(
                        bitmap = bmp.asImageBitmap(), contentDescription = null,
                        modifier = Modifier.size(60.dp).clip(CircleShape),
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    ) else Avatar3(avatar.ifEmpty { (me?.displayName ?: "?").take(1) }, 60)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(me?.displayName ?: "—", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = V3.text)
                        if (me?.isOwner == true) { Spacer(Modifier.width(4.dp)); Text("👑", fontSize = 13.sp) }
                    }
                    Muted3("@" + (me?.username ?: ""), 10, 1)
                    Spacer(Modifier.height(3.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Chip3(me?.roleLabel ?: "Benutzer", if (me?.isOwner == true) V3.gold else V3.lila)
                        if (me?.isOwner == true) Chip3("Owner-Rechte", V3.gold)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ChipFilter("✏️ Bearbeiten", editProfile) { editProfile = !editProfile }
                ChipFilter("🎨 Hintergrund", showBg) { showBg = !showBg }
                ChipFilter("📷 Avatar", false) { pickAvatar.launch("image/*") }
            }
        }

        if (editProfile) {
            Spacer(Modifier.height(8.dp))
            GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                Text("Profil bearbeiten", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.text)
                Spacer(Modifier.height(6.dp))
                V2TextField(displayName, { displayName = it }, "Anzeigename", minHeight = 46)
                Spacer(Modifier.height(6.dp))
                V2TextField(bio, { bio = it }, "Bio · was über dich?", minHeight = 46, singleLine = false)
                Spacer(Modifier.height(6.dp))
                NeonButton3("Speichern 💗") {
                    scope.launch {
                        try {
                            Hub.setUser(ApiCall.updateMe(mapOf("displayName" to displayName.trim(), "bio" to bio.trim(), "avatar" to avatar)))
                            Hub.toast("💗", "Gespeichert", "Sieht gut aus ✨")
                            editProfile = false
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                }
            }
        }

        if (showBg) {
            Spacer(Modifier.height(8.dp))
            GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                Text("App-Hintergrund 🎨", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.text)
                Spacer(Modifier.height(6.dp))
                APP_PRESETS.chunked(4).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.forEach { p ->
                            val on = appBg == "preset|" + p.id
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(
                                    Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(11.dp))
                                        .background(Brush.verticalGradient(p.colors))
                                        .border(if (on) 2.dp else 1.dp, if (on) V3.neon else V3.glassBorder, RoundedCornerShape(11.dp))
                                        .clickable {
                                            scope.launch {
                                                try { V3State.appBackground.value = Api4.setAppBackground("preset", p.id) }
                                                catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                            }
                                        },
                                    contentAlignment = Alignment.Center,
                                ) { if (on) Text("✓", fontSize = 12.sp, color = V3.neon) }
                                Muted3(p.name, 7.5, 1)
                            }
                        }
                        repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                    Spacer(Modifier.height(6.dp))
                }
                Text("Animiert ✨", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = V3.text)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf("stars" to "⭐ Sterne", "hearts" to "💗 Herzen", "bubbles" to "🫧 Blasen", "aurora" to "🌌 Aurora")
                        .forEach { (id, label) ->
                            ChipFilter(label, appBg == "animated|$id") {
                                scope.launch {
                                    try { V3State.appBackground.value = Api4.setAppBackground("animated", id) }
                                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                                }
                            }
                        }
                }
            }
        }

        /* --------- Schnellzugriff --------- */
        Spacer(Modifier.height(10.dp))
        Text("Deine Sachen", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp,
            color = V3.muted, modifier = Modifier.padding(horizontal = 18.dp))
        Spacer(Modifier.height(4.dp))
        SettingsRow("🔍", "Nachrichten durchsuchen", "Alle Chats auf einmal") { onSearch() }
        SettingsRow("⏰", "Geplante Nachrichten", "Was später rausgeht") { onScheduled() }
        SettingsRow("🚫", "Blockierte Nutzer", "Wen du stumm gestellt hast") { onBlocked() }
        SettingsRow("💗", "LoveAI", "Deine KI-Assistentin") { onAI() }
        SettingsRow("🤖", "LoveBot", "Der einzige Bot auf MaxiChat", "") {
            scope.launch {
                try {
                    val j = Api4.lovebotInfo()
                    Hub.toast("🤖", "LoveBot", j.optString("description", "Immer für dich da"))
                } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            }
        }

        /* --------- Sicherheit --------- */
        Spacer(Modifier.height(10.dp))
        Text("Sicherheit", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp,
            color = V3.muted, modifier = Modifier.padding(horizontal = 18.dp))
        Spacer(Modifier.height(4.dp))
        SettingsRow("🔐", "Zwei-Faktor (2FA)", "Authenticator-Code", if (show2fa) "▲" else "▼") { show2fa = !show2fa }
        if (show2fa) TwoFaCard()
        SettingsRow("📱", "Geräte & Sitzungen", "Wo du angemeldet bist", if (showSessions) "▲" else "▼") { showSessions = !showSessions }
        if (showSessions) SessionsCard()
        SettingsRow("🔒", "App-Sperre", "PIN · Biometrie · Auto-Lock", "") { }
        Spacer(Modifier.height(4.dp))
        Box(Modifier.padding(horizontal = 12.dp)) { PinSetupCard() }
        SettingsRow("📤", "Daten exportieren", "Alles als JSON", "") {
            scope.launch {
                try {
                    exportText = Api4.exportData()
                    clip.setText(AnnotatedString(exportText.take(3000)))
                    Hub.toast("📤", "Export kopiert", humanSize(exportText.length.toLong()))
                } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            }
        }

        /* --------- Team --------- */
        if (me?.isStaff == true) {
            Spacer(Modifier.height(10.dp))
            Text("Team", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                color = V3.muted, modifier = Modifier.padding(horizontal = 18.dp))
            Spacer(Modifier.height(4.dp))
            SettingsRow(
                "🏛", "Team-Zentrale",
                if (me?.isOwner == true) "Owner · volle Rechte 👑" else "nur Leserechte · Sperren nur Owner",
                "",
            ) { onOpenAdmin() }
        }

        /* --------- Über --------- */
        Spacer(Modifier.height(10.dp))
        GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(V3.primaryBrush), contentAlignment = Alignment.Center) {
                    Text("💗", fontSize = 18.sp)
                }
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) {
                    Text("MaxiChat 4.13", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.text)
                    Muted3("Build 5 · By Maxichen · 910maxi", 9.5, 1)
                }
            }
            Spacer(Modifier.height(6.dp))
            Muted3("0 % WebView · 100 % native Compose · Android 16 ready", 9.5, 2)
        }

        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.weight(1f)) { GhostButton3("Abmelden") { onLogout() } }
            Box(Modifier.weight(1f)) { GhostButton3("Konto löschen", danger = true) { showDanger = true } }
        }

        if (showDanger) {
            Spacer(Modifier.height(8.dp))
            DangerCard(onDone = { showDanger = false })
        }

        Spacer(Modifier.height(110.dp))
    }
}

@Composable
fun SettingsRow(icon: String, title: String, sub: String, trailing: String = "›", onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(16.dp)).background(V3.glass)
            .border(1.dp, V3.glassBorder, RoundedCornerShape(16.dp))
            .clickable { onClick() }.padding(horizontal = 11.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(32.dp).clip(RoundedCornerShape(11.dp)).background(Color(0x22FF7EDB)), contentAlignment = Alignment.Center) {
            Text(icon, fontSize = 15.sp)
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, color = V3.text)
            if (sub.isNotEmpty()) Muted3(sub, 9.5, 1)
        }
        Text(trailing, fontFamily = Outfit, fontSize = 12.sp, color = V3.muted)
    }
}

/* ---------------- 2FA ---------------- */

@Composable
fun TwoFaCard() {
    var enabled by remember { mutableStateOf<Boolean?>(null) }
    var secret by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { try { enabled = Api4.twoFaStatus() } catch (e: Exception) { enabled = false } }

    GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text(
            if (enabled == true) "2FA ist aktiv ✅" else "2FA ist aus ⚠️",
            fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
            color = if (enabled == true) V3.green else V3.gold,
        )
        Spacer(Modifier.height(6.dp))
        if (enabled != true) {
            if (secret.isEmpty()) {
                GhostButton3("Einrichten") {
                    scope.launch {
                        busy = true
                        try { secret = Api4.twoFaSetup() } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        busy = false
                    }
                }
            } else {
                Muted3("Schlüssel in deiner Authenticator-App eintragen:", 9.5, 2)
                Spacer(Modifier.height(3.dp))
                GlassCard3(Modifier.fillMaxWidth(), radius = 12, padding = 8) {
                    Text(secret, fontFamily = Outfit, fontSize = 11.sp, color = V3.neon)
                }
                Spacer(Modifier.height(6.dp))
                V2TextField(code, { code = it }, "6-stelliger Code", minHeight = 44, keyboard = KeyboardType.Number)
                Spacer(Modifier.height(6.dp))
                NeonButton3(if (busy) "Prüfe…" else "Aktivieren 🔐", loading = busy) {
                    scope.launch {
                        try { Api4.twoFaEnable(code.trim()); enabled = true; Hub.toast("🔐", "2FA aktiv", "Besser geschützt 💗") }
                        catch (e: ApiError) { Hub.toast("💔", "Code falsch", e.msg) }
                    }
                }
            }
        } else {
            V2TextField(code, { code = it }, "Code zum Deaktivieren", minHeight = 44, keyboard = KeyboardType.Number)
            Spacer(Modifier.height(6.dp))
            GhostButton3("2FA deaktivieren", danger = true) {
                scope.launch {
                    try { Api4.twoFaDisable(code.trim()); enabled = false; Hub.toast("🔓", "2FA aus") }
                    catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                }
            }
        }
    }
}

/* ---------------- Sessions ---------------- */

@Composable
fun SessionsCard() {
    var list by remember { mutableStateOf<List<SessionRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try { list = Api4.sessions() } catch (e: Exception) {}
        loading = false
    }
    LaunchedEffect(Unit) { reload() }

    GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        if (loading) Spinner()
        else if (list.isEmpty()) Muted3("Keine Sitzungen gefunden", 10, 1)
        else list.forEach { s ->
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (s.current) "📱" else "💻", fontSize = 14.sp)
                Spacer(Modifier.width(7.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        (s.device.ifEmpty { "Unbekannt" }) + if (s.current) " · dieser hier" else "",
                        fontFamily = Outfit, fontSize = 11.5.sp, color = V3.text, fontWeight = FontWeight.SemiBold,
                    )
                    Muted3("aktiv " + timeAgo(s.lastSeen), 9, 1)
                }
                if (!s.current) Box(
                    Modifier.clip(RoundedCornerShape(50)).background(Color(0x22FF5C7A)).clickable {
                        scope.launch {
                            try { Api4.kickSession(s.id); reload(); Hub.toast("👋", "Abgemeldet") }
                            catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        }
                    }.padding(horizontal = 8.dp, vertical = 4.dp),
                ) { Text("raus", fontFamily = Outfit, fontSize = 9.sp, color = V3.danger, fontWeight = FontWeight.Bold) }
            }
        }
        Spacer(Modifier.height(5.dp))
        GhostButton3("Alle anderen abmelden", danger = true) {
            scope.launch {
                try { Hub.toast("👋", Api4.kickAllSessions()); reload() } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
            }
        }
    }
}

/* ---------------- Konto löschen / deaktivieren ---------------- */

@Composable
fun DangerCard(onDone: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var days by remember { mutableStateOf("30") }
    val scope = rememberCoroutineScope()

    GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Text("⚠️ Konto", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.danger)
        Spacer(Modifier.height(4.dp))
        Muted3("Deaktivieren = Pause (jederzeit zurück). Löschen = für immer.", 10, 2)
        Spacer(Modifier.height(6.dp))
        V2TextField(password, { password = it }, "Passwort", password = true, minHeight = 44)
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            listOf("7", "30", "90").forEach { d -> ChipFilter("$d Tage", days == d) { days = d } }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.weight(1f)) {
                GhostButton3("Pausieren") {
                    scope.launch {
                        try { Hub.toast("💤", "Pausiert", Api4.deactivateAccount(password, days.toIntOrNull() ?: 30)); onDone() }
                        catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                }
            }
            Box(Modifier.weight(1f)) {
                GhostButton3("Löschen", danger = true) {
                    scope.launch {
                        try { Api4.deleteAccount(password); Hub.toast("🗑", "Konto gelöscht", "Bye 💔"); Hub.reset() }
                        catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    }
                }
            }
        }
    }
}
