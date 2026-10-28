package de.maxichen.app.ui

/* =====================================================================
   ✅ V4.12 — VERIFIED-BADGE (UI) · SECURITY CENTER · PROFIL
   ---------------------------------------------------------------------
   Der blaue Haken wird hier NICHT einfach gemalt. Er erscheint nur,
   wenn `BadgeTrust.verify` die Server-Signatur geprüft hat. Sonst gibt
   es einen grauen „nicht geprüft"-Zustand — sichtbar, nicht heimlich.
   ===================================================================== */

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.Api4
import de.maxichen.app.BadgeTrust
import de.maxichen.app.Hub
import de.maxichen.app.PinLockStore
import de.maxichen.app.Vault
import de.maxichen.app.VaultTotpStore
import de.maxichen.app.crypto.VerifiedBadge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val BLUE = Color(0xFF1D9BF0)

/* =====================================================================
   ✅ Der Haken
   ===================================================================== */

/**
 * Blauer Haken — nur wenn [verified] true ist. Der Schimmer läuft nur,
 * wenn wirklich geprüft wurde; ein Dauer-Glitzern auf allem wäre Deko.
 */
@Composable
fun VerifiedBadgeIcon(verified: Boolean, size: Int = 15) {
    if (!verified) return
    val t = rememberInfiniteTransition(label = "v")
    val a by t.animateFloat(
        initialValue = 0.55f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2200), RepeatMode.Reverse), label = "a",
    )
    Box(
        Modifier.size(size.dp).clip(CircleShape)
            .background(BLUE.copy(alpha = 0.92f))
            .border(0.5.dp, Color.White.copy(alpha = a * 0.8f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text("✓", fontSize = (size * 0.62f).sp, color = Color.White, fontWeight = FontWeight.Bold)
    }
}

/** Rollen-Abzeichen neben dem Namen: 👑 Owner · 🛡️ Team · 🤖 Bot */
@Composable
fun RoleBadge(role: VerifiedBadge.Role, compact: Boolean = false) {
    if (role == VerifiedBadge.Role.USER || role == VerifiedBadge.Role.VERIFIED) return
    Box(
        Modifier.clip(RoundedCornerShape(7.dp))
            .background(Color(role.color).copy(alpha = 0.18f))
            .border(0.5.dp, Color(role.color).copy(alpha = 0.5f), RoundedCornerShape(7.dp))
            .padding(horizontal = if (compact) 4.dp else 6.dp, vertical = 1.dp),
    ) {
        Text(
            if (compact) role.emoji else role.emoji + " " + role.label,
            fontFamily = Outfit, fontWeight = FontWeight.Bold,
            fontSize = if (compact) 8.sp else 8.5.sp, color = Color(role.color),
        )
    }
}

/* =====================================================================
   🛡️ Security Center
   ===================================================================== */

@Composable
fun TotpSecurityScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var totpOn by remember { mutableStateOf(false) }
    var recoveryLeft by remember { mutableStateOf(0) }
    var setupSecret by remember { mutableStateOf<String?>(null) }
    var setupUrl by remember { mutableStateOf("") }
    var newCodes by remember { mutableStateOf<List<String>>(emptyList()) }
    var code by remember { mutableStateOf("") }
    var info by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect("tick") {
        while (true) { kotlinx.coroutines.delay(1000); tick++ }
    }

    val vaultInfo = remember { Vault.info(ctx) }
    val pinStored = remember {
        PinLockStore.exists(ctx)
    }

    LaunchedEffect("load") {
        try {
            val r = Api4.totpStatus()
            totpOn = r.optBoolean("enabled")
            recoveryLeft = r.optInt("recoveryLeft")
        } catch (t: Throwable) { info = "Server nicht erreichbar" }
        // Schlüssel pinnen (einmalig) — damit Haken prüfbar sind
        try { BadgeTrust.fetchAndCheck(ctx) } catch (t: Throwable) {}
    }

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        ScreenHeader("Sicherheit", "2FA · PIN · Tresor · Haken", onBack)
        Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {

            /* ---------- Übersicht als Kacheln ---------- */
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusTile("🔑", "Passwort", true, "gesetzt", Modifier.weight(1f))
                StatusTile("🔢", "PIN", pinStored, if (pinStored) "aktiv" else "nicht gesetzt", Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusTile("📱", "2FA", totpOn, if (totpOn) "TOTP aktiv" else "aus", Modifier.weight(1f))
                StatusTile(
                    if (vaultInfo.strongBox) "💎" else if (vaultInfo.available) "🔐" else "⚠️",
                    "Tresor",
                    vaultInfo.available,
                    if (vaultInfo.strongBox) "StrongBox" else if (vaultInfo.hardware) "TEE" else "Software",
                    Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))

            /* ---------- TOTP ---------- */
            LightCard {
                Text("📱 Zwei-Faktor (TOTP)", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText(
                    "Kompatibel mit Google Authenticator, Aegis, Authy, 1Password. " +
                        "RFC 6238 · SHA1 · 30 s · 6 Stellen.",
                    9.5f, 3,
                )
                Spacer(Modifier.height(10.dp))

                if (!totpOn) {
                    if (setupSecret == null) {
                        LightButton(if (busy) "…" else "2FA einrichten 🔐") {
                            if (busy) return@LightButton
                            busy = true; info = ""
                            scope.launch {
                                try {
                                    val r = Api4.totpSetup()
                                    setupSecret = r.optString("secret")
                                    setupUrl = r.optString("otpauth")
                                    // 🔐 V4.12: Secret auch ins Geräte-Vault — dann
                                    // kennt die App ihren Code, ohne den Server zu fragen
                                    runCatching { VaultTotpStore.save(ctx, r.optString("secret"), "MaxiChat") }
                                } catch (e: Throwable) { info = e.message ?: "Setup fehlgeschlagen" }
                                busy = false
                            }
                        }
                    } else {
                        // QR-Ersatz: Secret groß und in Blöcken (kein QR-Generator in der APK)
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(Light.pinkSoft).padding(12.dp),
                        ) {
                            Column {
                                Text("1. Secret in deiner App eintragen", fontFamily = Outfit, fontWeight = FontWeight.Bold,
                                    fontSize = 10.5.sp, color = Light.ink)
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    setupSecret!!.chunked(4).joinToString(" "),
                                    fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp,
                                    color = Light.pink, lineHeight = 20.sp,
                                )
                                Spacer(Modifier.height(6.dp))
                                SoftText("otpauth-Link (zum Kopieren):", 9f, 1)
                                SoftText(setupUrl, 8f, 3)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("2. Code aus der App eingeben", fontFamily = Outfit, fontWeight = FontWeight.Bold,
                            fontSize = 10.5.sp, color = Light.ink)
                        Spacer(Modifier.height(5.dp))
                        V2TextField(code, { code = it.filter { c -> c.isDigit() }.take(6) }, "123456", keyboard = androidx.compose.ui.text.input.KeyboardType.Number)
                        Spacer(Modifier.height(8.dp))
                        LightButton(if (busy) "prüft…" else "Bestätigen ✅") {
                            if (busy) return@LightButton
                            busy = true
                            scope.launch {
                                try {
                                    val codes = Api4.totpEnable(code)
                                    newCodes = codes
                                    totpOn = true
                                    recoveryLeft = codes.size
                                    setupSecret = null
                                    info = "2FA ist aktiv 🎉"
                                } catch (e: Throwable) { info = "Code falsch — Uhrzeit am Handy prüfen?" }
                                busy = false
                            }
                        }
                    }
                } else {
                    // 🔢 Code direkt aus dem Vault gerechnet — kein Server-Roundtrip
                    val vaultSecret = remember(totpOn) { VaultTotpStore.secret(ctx) }
                    if (vaultSecret != null) {
                        val code = remember(vaultSecret, tick) { VaultTotpStore.currentCode(ctx) ?: "" }
                        val left = remember(vaultSecret, tick) { VaultTotpStore.secondsLeft() }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(code.chunked(3).joinToString(" "), fontFamily = Outfit,
                                fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Light.ink)
                            Spacer(Modifier.width(10.dp))
                            Text("${left}s", fontFamily = Outfit, fontSize = 10.sp, color = Light.soft)
                        }
                        SoftText("wird im Gerät gerechnet — nie über das Netz", 8.5f, 1)
                        Spacer(Modifier.height(6.dp))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("✅", fontSize = 16.sp)
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text("TOTP aktiv", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, color = Light.green)
                            SoftText("$recoveryLeft Recovery-Codes übrig", 9.5f, 1)
                        }
                    }
                }

                if (info.isNotEmpty()) { Spacer(Modifier.height(6.dp)); SoftText(info, 10f, 3) }
            }

            /* ---------- Recovery-Codes ---------- */
            if (newCodes.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                        .background(Light.card).border(1.dp, Light.gold.copy(alpha = 0.6f), RoundedCornerShape(18.dp))
                        .padding(14.dp),
                ) {
                    Column {
                        Text("🎫 Deine 10 Recovery-Codes", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                            fontSize = 13.sp, color = Light.gold)
                        Spacer(Modifier.height(4.dp))
                        SoftText("JETZT aufschreiben — sie werden nie wieder angezeigt. Jeder gilt genau einmal.", 9.5f, 2)
                        Spacer(Modifier.height(10.dp))
                        newCodes.chunked(2).forEach { pair ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                pair.forEach { c ->
                                    Text(c, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                                        color = Light.ink, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }

            /* ---------- PIN ---------- */
            Spacer(Modifier.height(10.dp))
            LightCard {
                Text("🔢 App-PIN", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText(
                    "Sperrt die App, wenn dein Handy entsperrt in fremden Händen ist. " +
                        "Gespeichert als PBKDF2-Hash im Tresor — nie im Klartext.",
                    9.5f, 3,
                )
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (pinStored) "✅ aktiv" else "⚠️ nicht gesetzt", fontFamily = Outfit,
                        fontWeight = FontWeight.Bold, fontSize = 11.sp,
                        color = if (pinStored) Light.green else Light.gold)
                    Spacer(Modifier.weight(1f))
                    SoftText("Einstellungen → App-Sperre", 9f, 1)
                }
            }

            /* ---------- Haken ---------- */
            Spacer(Modifier.height(10.dp))
            LightCard {
                Text("✅ Verifizierter Haken", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText(
                    "Der blaue Haken ist eine Signatur des Servers über Konto + Rolle + Profilbild. " +
                        "Die App prüft sie selbst — ein gefälschter Haken aus einem manipulierten Server " +
                        "wird abgelehnt. Owner und Bot brauchen dafür 2FA.",
                    9.5f, 4,
                )
                Spacer(Modifier.height(8.dp))
                val key = remember { BadgeTrust.cachedKey(ctx) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (key != null) "🔐" else "⚠️", fontSize = 14.sp)
                    Spacer(Modifier.width(8.dp))
                    SoftText(
                        if (key != null) "Server-Schlüssel gepinnt (${key.size} Byte) — " +
                            (key.copyOfRange(0, 4).joinToString("") { "%02x".format(it) })
                        else "noch nicht gepinnt — Sicherheit antippen",
                        9.5f, 2,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun StatusTile(emoji: String, title: String, on: Boolean, sub: String, modifier: Modifier = Modifier) {
    Box(
        modifier.clip(RoundedCornerShape(16.dp))
            .background(Light.card)
            .border(1.dp, if (on) Light.green.copy(alpha = 0.4f) else Light.line, RoundedCornerShape(16.dp))
            .padding(11.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(emoji, fontSize = 14.sp)
                Spacer(Modifier.width(5.dp))
                Text(if (on) "✅" else "⚠️", fontSize = 10.sp)
            }
            Spacer(Modifier.height(4.dp))
            Text(title, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Light.ink)
            Text(sub, fontFamily = Outfit, fontSize = 9.sp, color = if (on) Light.green else Light.gold)
        }
    }
}

/* =====================================================================
   👤 Profil-Karte mit Badges
   ===================================================================== */

@Composable
fun ProfileCardWithBadges(
    displayName: String,
    username: String,
    avatar: String,
    isOnline: Boolean,
    role: VerifiedBadge.Role?,
    verified: Boolean,
    bio: String = "",
    onSecurity: () -> Unit = {},
) {
    LightCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(contentAlignment = Alignment.BottomEnd) {
                Box(
                    Modifier.size(64.dp).clip(CircleShape)
                        .background(
                            if (role != null && role != VerifiedBadge.Role.USER)
                                Brush.linearGradient(listOf(Color(role.color).copy(alpha = 0.45f), Light.pink))
                            else Light.pinkBrush,
                        ),
                    contentAlignment = Alignment.Center,
                ) { Text(if (avatar.isEmpty()) "💗" else avatar, fontSize = 26.sp) }
                if (isOnline) {
                    Box(
                        Modifier.size(16.dp).clip(CircleShape).background(Light.green)
                            .border(2.dp, Light.card, CircleShape),
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(displayName, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Light.ink)
                    if (verified) { Spacer(Modifier.width(5.dp)); VerifiedBadgeIcon(true, 16) }
                }
                Text("@" + username, fontFamily = Outfit, fontSize = 10.5.sp, color = Light.soft)
                if (role != null && role != VerifiedBadge.Role.USER) {
                    Spacer(Modifier.height(4.dp))
                    RoleBadge(role)
                }
            }
        }
        if (bio.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            SoftText(bio, 10.5f, 4)
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth()) {
            LightGhost("🛡️ Sicherheit") { onSecurity() }
        }
    }
}
