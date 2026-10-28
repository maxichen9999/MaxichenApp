package de.maxichen.app.ui

/* =====================================================================
   ✨ V4.4 — die neuen Screens
   ---------------------------------------------------------------------
   • ThemeGalleryLight  — 20 Themes mit LIVE-Vorschau
   • TwoFaSetupLight    — 2FA per Authenticator-App (TOTP, kein PIN!)
   • VaultLight         — verschlüsseltes Backup + Einladung
   • ChatExtrasSheet    — Bubble-Farbe, Auto-Delete, Screenshot-Schutz,
                          Standort live, Gruppen-Call, Transkription
   ===================================================================== */

import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import de.maxichen.app.*
import kotlinx.coroutines.launch
import org.json.JSONObject

/* =====================================================================
   🎨 20 THEMES MIT LIVE-VORSCHAU
   ===================================================================== */

@Composable
fun ThemeGalleryLight(onBack: () -> Unit) {
    val currentBg by V3State.appBackground.collectAsState()
    var chosen by remember { mutableStateOf(currentBg.substringAfter('|')) }
    val scope = rememberCoroutineScope()
    var saved by remember { mutableStateOf(chosen) }

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        ScreenHeader("Themes", "20 Stück · Live-Vorschau", onBack)

        // 🔍 große Live-Vorschau
        Box(
            Modifier.fillMaxWidth().height(150.dp).padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(24.dp)),
        ) {
            val p = presetById(chosen) ?: APP_PRESETS[0]
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(p.colors)))
            Row(
                Modifier.align(Alignment.BottomStart).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(Color.White.copy(alpha = 0.18f))
                        .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(13.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text("💬", fontSize = 17.sp) }
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(p.name, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Color.White)
                    Text("so sieht dein Chat aus", fontFamily = Outfit, fontSize = 9.5.sp, color = Color.White.copy(alpha = 0.75f))
                }
            }
            if (chosen != saved) {
                Box(
                    Modifier.align(Alignment.TopEnd).padding(10.dp)
                        .clip(RoundedCornerShape(14.dp)).background(Color.White)
                        .clickable {
                            scope.launch {
                                try {
                                    V3State.appBackground.value = Api4.setAppBackground("preset", chosen)
                                    saved = chosen
                                    Hub.toast("🎨", "Theme übernommen", presetById(chosen)?.name ?: chosen)
                                } catch (e: Exception) { Hub.toast("💔", "Konnte nicht speichern", "") }
                            }
                        }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text("Übernehmen ✨", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 10.5.sp, color = Light.pink)
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        Text(
            "Tippe zum Vorschauen — nichts wird gespeichert, bis du 'Übernehmen' drückst.",
            fontFamily = Outfit, fontSize = 10.sp, color = Light.soft,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        Spacer(Modifier.height(10.dp))

        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(9.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            items(APP_PRESETS) { p ->
                val on = p.id == chosen
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.fillMaxWidth().height(74.dp).clip(RoundedCornerShape(18.dp))
                            .background(Brush.verticalGradient(p.colors))
                            .border(
                                if (on) 2.dp else 1.dp,
                                if (on) Light.pink else Color.White.copy(alpha = 0.6f),
                                RoundedCornerShape(18.dp),
                            )
                            .clickable { chosen = p.id },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (on) Text("✓", fontSize = 20.sp, color = Color.White)
                    }
                    Spacer(Modifier.height(3.dp))
                    Text(p.name, fontFamily = Outfit, fontSize = 9.sp, color = if (on) Light.pink else Light.soft, maxLines = 1)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
    }
}

/* =====================================================================
   🔐 2FA MIT AUTHENTICATOR-APP (TOTP)
   ===================================================================== */

@Composable
fun TwoFaSetupLight(onBack: () -> Unit) {
    var status by remember { mutableStateOf<Api4.TwoFaStatus?>(null) }
    var secret by remember { mutableStateOf("") }
    var otpauth by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun refresh() {
        scope.launch {
            try { status = Api4.twoFa() } catch (e: Exception) { error = "Server nicht erreichbar" }
        }
    }
    LaunchedEffect(Unit) { refresh() }

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        ScreenHeader("2FA", "Authenticator-App · TOTP", onBack)
        Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            LoginStatusCard(
                active = status?.enabled == true,
                title = if (status?.enabled == true) "2FA ist aktiv 🔐" else "2FA ist aus ⚠️",
                sub = if (status?.enabled == true)
                    "Beim Login fragt der Server nach dem 6-stelligen Code aus deiner App."
                else
                    "Ein Passwort allein reicht nicht. 30 Sekunden Aufwand, riesiger Schutz.",
            )

            Spacer(Modifier.height(10.dp))

            if (status?.enabled != true) {
                LightCard {
                    Text("So geht's", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, color = Light.ink)
                    Spacer(Modifier.height(4.dp))
                    SoftText("1. Setup starten → geheimen Schlüssel bekommen", 10.5f, 1)
                    SoftText("2. In Aegis / Google Authenticator / 1Password eintragen", 10.5f, 1)
                    SoftText("3. Den 6-stelligen Code hier bestätigen", 10.5f, 1)
                }
                Spacer(Modifier.height(10.dp))

                if (secret.isEmpty()) {
                    LightButton(if (busy) "Starte…" else "Setup starten 🔑") {
                        busy = true; error = ""
                        scope.launch {
                            try {
                                val r = Api4.twoFaStart()
                                secret = r.secret
                                otpauth = r.otpauth
                            } catch (e: Exception) { error = "Setup fehlgeschlagen" }
                            busy = false
                        }
                    }
                } else {
                    LightCard {
                        Text("Geheimer Schlüssel", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, color = Light.ink)
                        Spacer(Modifier.height(6.dp))
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Light.pinkSoft).padding(10.dp),
                        ) {
                            Text(
                                secret.chunked(4).joinToString(" "),
                                fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Light.pink,
                                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Spacer(Modifier.height(5.dp))
                        SoftText("oder in der App den Link öffnen:", 9.5f, 1)
                        SoftText(otpauth, 8.5f, 3)
                    }
                    Spacer(Modifier.height(10.dp))
                    V2TextField(code, { code = it.filter { c -> c.isDigit() }.take(6) }, "123456", leading = "🔢")
                    Spacer(Modifier.height(8.dp))
                    LightButton(if (busy) "Prüfe…" else "2FA aktivieren ✅") {
                        busy = true; error = ""
                        scope.launch {
                            try {
                                Api4.twoFaEnable(code)
                                Hub.toast("🔐", "2FA aktiv", "Ab jetzt fragt der Login nach dem Code.")
                                code = ""
                                refresh()
                            } catch (e: ApiError) { error = e.msg }
                            catch (e: Exception) { error = "Server nicht erreichbar" }
                            busy = false
                        }
                    }
                }
            } else {
                V2TextField(code, { code = it.filter { c -> c.isDigit() }.take(6) }, "Code zum Ausschalten", leading = "🔢")
                Spacer(Modifier.height(8.dp))
                LightGhost("2FA deaktivieren", danger = true) {
                    busy = true; error = ""
                    scope.launch {
                        try {
                            Api4.twoFaDisable(code)
                            Hub.toast("🔓", "2FA aus", "Dein Konto ist weniger geschützt.")
                            code = ""
                            refresh()
                        } catch (e: ApiError) { error = e.msg }
                        catch (e: Exception) { error = "Server nicht erreichbar" }
                        busy = false
                    }
                }
            }

            if (error.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                LightCard { SoftText(error, 10.5f, 3) }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun LoginStatusCard(active: Boolean, title: String, sub: String) {
    LightCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(42.dp).clip(CircleShape)
                    .background(if (active) Light.green.copy(alpha = 0.15f) else Light.gold.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { Text(if (active) "✅" else "⚠️", fontSize = 19.sp) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.5.sp, color = Light.ink)
                SoftText(sub, 10f, 3)
            }
        }
    }
}

/* =====================================================================
   🔐 BACKUP + EINLADUNG
   ===================================================================== */

@Composable
fun VaultLight(onBack: () -> Unit) {
    var showNewBackup by remember { mutableStateOf(false) }
    if (showNewBackup) { BackupScreen(onBack = { showNewBackup = false }); return }
    var password by remember { mutableStateOf("") }
    var inviteLink by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf("") }
    var sizeInfo by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        ScreenHeader("Backup & Einladung", "verschlüsselt · nur du", onBack)
        Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            // 💾 V4.10: lokales Backup (Schlüssel + Verlauf, nur auf dem Gerät)
            LightCard(onClick = { showNewBackup = true }) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("💾", fontSize = 22.sp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Backup auf diesem Gerät", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                        SoftText("Schlüssel + Verlauf · .mcbk-Datei · Passwort nur bei dir", 9.5f, 2)
                    }
                    Text("›", fontSize = 18.sp, color = Light.soft)
                }
            }
            Spacer(Modifier.height(10.dp))

            LightCard {
                Text("🔐 Verschlüsseltes Backup", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText("scrypt (N=16384) → AES-256-GCM → gzip. Der Server kann es NICHT entschlüsseln — " +
                        "ohne dein Passwort ist es für immer weg.", 10.5f, 4)
                Spacer(Modifier.height(8.dp))
                V2TextField(password, { password = it }, "Backup-Passwort (min. 8 Zeichen)", password = true, leading = "🔑")
                Spacer(Modifier.height(8.dp))
                LightButton(if (busy) "Erstelle…" else "Backup erzeugen 💾") {
                    if (password.length < 8) { info = "Passwort mindestens 8 Zeichen"; return@LightButton }
                    busy = true; info = ""
                    scope.launch {
                        try {
                            val r = Api4.exportEncrypted(password)
                            sizeInfo = "Format " + r.optString("format") + " · " + r.optInt("size") + " Bytes Rohdaten"
                            info = "Backup fertig ✅ Speichere die Antwort (Base64) an einem sicheren Ort."
                        } catch (e: ApiError) { info = e.msg }
                        catch (e: Exception) { info = "Server nicht erreichbar" }
                        busy = false
                    }
                }
                if (sizeInfo.isNotEmpty()) { Spacer(Modifier.height(5.dp)); SoftText(sizeInfo, 9.5f, 2) }
                if (info.isNotEmpty()) { Spacer(Modifier.height(5.dp)); SoftText(info, 10f, 3) }
            }

            Spacer(Modifier.height(10.dp))

            LightCard {
                Text("💌 Einladung", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText("Teile einen Link — wer ihn öffnet, kann direkt beitreten.", 10.5f, 2)
                Spacer(Modifier.height(8.dp))
                if (inviteLink.isEmpty()) {
                    LightButton("Einladung erstellen ✨") {
                        busy = true
                        scope.launch {
                            try {
                                val (code, link) = Api4.invite()
                                inviteLink = if (link.isNotEmpty()) link else "https://maxichen.de/invite/$code"
                            } catch (e: Exception) { info = "Einladung fehlgeschlagen" }
                            busy = false
                        }
                    }
                } else {
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Light.pinkSoft).padding(10.dp),
                    ) { Text(inviteLink, fontFamily = Outfit, fontSize = 11.sp, color = Light.pink) }
                }
            }

            Spacer(Modifier.height(10.dp))
            LightCard {
                Text("📇 Kontakte importieren", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText("Nummern werden NUR als SHA-256-Hash verglichen — der Server sieht nie deine Kontakte.", 10.5f, 3)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/* =====================================================================
   💬 CHAT-EXTRAS (pro Chat)
   ===================================================================== */

object ChatStyle {
    /** 8 Bubble-Verläufe — pro Kontakt wählbar */
    val colors: List<Pair<String, List<Color>>> = listOf(
        "Rose" to listOf(Color(0xFFFF7EBB), Color(0xFFFF5FA8)),
        "Lila" to listOf(Color(0xFFB18AFF), Color(0xFF8B5CF6)),
        "Ozean" to listOf(Color(0xFF5EC8FF), Color(0xFF3B82F6)),
        "Minze" to listOf(Color(0xFF6EE7C4), Color(0xFF2BB673)),
        "Sonnenuntergang" to listOf(Color(0xFFFFB07C), Color(0xFFFF7A59)),
        "Gold" to listOf(Color(0xFFFFD98A), Color(0xFFE9A93B)),
        "Nacht" to listOf(Color(0xFF6B7BFF), Color(0xFF3B3FB6)),
        "Neon" to listOf(Color(0xFFFF7EDB), Color(0xFF7EB8FF)),
    )

    private var map: Map<String, Int> = emptyMap()

    fun load(raw: String) {
        if (raw.isBlank()) return
        try {
            val o = JSONObject(raw)
            val m = HashMap<String, Int>()
            o.keys().forEach { k -> m[k] = o.optInt(k, 0) }
            map = m
        } catch (e: Exception) {}
    }

    fun indexOf(chatId: String): Int = map[chatId] ?: 0

    fun set(chatId: String, idx: Int) {
        val m = map.toMutableMap()
        m[chatId] = idx
        map = m
        val o = JSONObject()
        m.forEach { (k, v) -> o.put(k, v) }
        Hub.saveChatStyleRaw(o.toString())
    }

    fun brushFor(chatId: String): Brush {
        val c = colors[indexOf(chatId).coerceIn(0, colors.lastIndex)].second
        return Brush.verticalGradient(c)
    }

    fun nameFor(chatId: String): String = colors[indexOf(chatId).coerceIn(0, colors.lastIndex)].first
}

@Composable
fun ChatExtrasSheet(
    chatId: String,
    autoDeleteHours: Int,
    screenshotProtected: Boolean,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
) {
    var bubble by remember { mutableIntStateOf(ChatStyle.indexOf(chatId)) }
    var autoDelete by remember { mutableIntStateOf(autoDeleteHours) }
    var secure by remember { mutableStateOf(screenshotProtected) }
    var liveOn by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    var callInfo by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current

    fun pushLocation() {
        val hasPerm = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) { note = "Standort-Berechtigung fehlt"; return }
        try {
            val lm = ctx.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
            val loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            if (loc == null) { note = "Kein Standort verfügbar — GPS kurz anmachen 📍"; return }
            scope.launch {
                try {
                    Api4.startLiveLocation(chatId, loc.latitude, loc.longitude, 60)
                    liveOn = true
                    note = "Standort läuft 60 Minuten 📍"
                } catch (e: Exception) { note = "Konnte Standort nicht senden" }
            }
        } catch (e: Exception) { note = "Standort nicht verfügbar" }
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        if (res.values.any { it }) pushLocation() else note = "Ohne Berechtigung kein Standort 🌸"
    }

    Box(Modifier.fillMaxSize().background(Color(0xAA2B1A2E)).clickable { onDismiss() }) {
        Column(
            Modifier.fillMaxWidth().align(Alignment.BottomCenter)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(Light.card)
                .clickable { }
                .padding(18.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("💬 Chat-Extras", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Light.ink)
                Spacer(Modifier.weight(1f))
                Text("✕", fontSize = 17.sp, color = Light.soft, modifier = Modifier.clickable { onDismiss() })
            }
            Spacer(Modifier.height(12.dp))

            Text("Bubble-Farbe für diesen Kontakt", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Light.ink)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                ChatStyle.colors.forEachIndexed { i, (_, cols) ->
                    Box(
                        Modifier.weight(1f).height(34.dp).clip(RoundedCornerShape(11.dp))
                            .background(Brush.verticalGradient(cols))
                            .border(if (i == bubble) 2.dp else 0.dp, Light.ink.copy(alpha = if (i == bubble) 0.5f else 0f), RoundedCornerShape(11.dp))
                            .clickable { bubble = i; ChatStyle.set(chatId, i) },
                    )
                }
            }
            Spacer(Modifier.height(14.dp))

            Text("Nachrichten automatisch löschen", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Light.ink)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf(0 to "aus", 1 to "1 Std", 24 to "1 Tag", 168 to "1 Woche").forEach { (h, label) ->
                    LightChip(label, autoDelete == h) {
                        autoDelete = h
                        scope.launch {
                            try {
                                Api4.setAutoDelete(chatId, h)
                                Hub.toast("🧹", "Auto-Delete", if (h == 0) "aus" else label)
                            } catch (e: Exception) { note = "Nur Chat-Admins dürfen das" }
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Screenshot-Schutz", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Light.ink)
                    SoftText("FLAG_SECURE: Screenshots werden schwarz", 9.5f, 2)
                }
                LightChip(if (secure) "AN" else "AUS", secure) {
                    secure = !secure
                    Hub.setSecureChat(chatId, secure)
                    scope.launch {
                        try { Api4.screenshotProtect(chatId, secure) } catch (e: Exception) {}
                    }
                }
            }
            Spacer(Modifier.height(14.dp))

            Text("Standort live (max. 60 Min)", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Light.ink)
            Spacer(Modifier.height(6.dp))
            if (!liveOn) {
                LightButton("Standort 60 Min teilen 📍") {
                    permLauncher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                }
            } else {
                LightGhost("Standort stoppen") {
                    scope.launch { Api4.stopLiveLocation(chatId); liveOn = false; note = "Standort gestoppt" }
                }
            }
            Spacer(Modifier.height(14.dp))

            Text("Gruppen-Call (bis 8)", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Light.ink)
            Spacer(Modifier.height(6.dp))
            LightGhost("Call beitreten 👥") {
                scope.launch {
                    try {
                        val r = Api4.joinGroupCall(chatId)
                        val peers = r.optJSONArray("peers")?.length() ?: 0
                        callInfo = "Im Call · " + peers + " andere · max. 8"
                    } catch (e: ApiError) {
                        callInfo = if (e.reason == "call_full") "Call ist voll (8/8) 👥" else e.msg
                    } catch (e: Exception) { callInfo = "Call nicht möglich" }
                }
            }
            if (callInfo.isNotEmpty()) { Spacer(Modifier.height(4.dp)); SoftText(callInfo, 10f, 2) }

            if (note.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Light.pinkSoft).padding(9.dp)) {
                    SoftText(note, 10f, 3)
                }
            }
            Spacer(Modifier.height(18.dp))
        }
    }
}
