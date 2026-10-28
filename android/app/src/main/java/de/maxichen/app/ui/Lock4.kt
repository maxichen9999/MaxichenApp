package de.maxichen.app.ui

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import de.maxichen.app.Hub
import java.security.MessageDigest

/* =====================================================================
   🔒 APP-SPERRE — PIN + Biometrie + Auto-Lock
   ===================================================================== */

object LockState {
    private const val PREF = "lovechat_lock"
    private var appCtx: Context? = null
    private var prefs: android.content.SharedPreferences? = null

    /**
     * 🔧 V4.12: Die PIN lag früher als EIN SHA-256-Hash in den Prefs.
     * Bei 4 Ziffern sind das 10.000 Möglichkeiten — ein Skript hat die in
     * unter einer Sekunde durch. Jetzt: PBKDF2-HMAC-SHA256 mit 120.000
     * Runden und eigenem Salt, versiegelt im Vault (StrongBox/TEE).
     */
    private var legacyHash: String = ""

    var pinHash: String = ""
        private set
    var biometricEnabled: Boolean = false
        private set
    var autoLockMinutes: Int = 1
        private set

    /** Zeitpunkt, an dem die App in den Hintergrund ging (0 = im Vordergrund). */
    var backgroundedAt: Long = 0L
        private set
    var unlocked: Boolean = true

    fun init(ctx: Context) {
        val app = ctx.applicationContext
        appCtx = app
        prefs = app.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        legacyHash = prefs?.getString("pin", "") ?: ""
        pinHash = if (de.maxichen.app.PinLockStore.exists(app)) "pbkdf2" else legacyHash
        biometricEnabled = prefs?.getBoolean("bio", false) ?: false
        autoLockMinutes = prefs?.getInt("autolock", 1) ?: 1
    }

    fun enabled(): Boolean = pinHash.isNotEmpty()

    /** nur noch für die Migration alter Hashes — nie für neue PINs */
    fun hash(pin: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return md.digest(("maxichat·" + pin).toByteArray()).joinToString("") { "%02x".format(it) }
    }

    fun setPin(pin: String) {
        val ctx = appCtx ?: return
        val err = de.maxichen.app.PinLockStore.set(ctx, pin)
        if (err != null) { Hub.toast("⚠️", "PIN zu schwach", err); return }
        legacyHash = ""
        prefs?.edit()?.remove("pin")?.apply()
        pinHash = "pbkdf2"
    }

    fun clearPin() {
        val ctx = appCtx
        if (ctx != null) de.maxichen.app.PinLockStore.remove(ctx)
        legacyHash = ""
        pinHash = ""
        prefs?.edit()?.remove("pin")?.apply()
    }

    /** @return true bei Erfolg. Sperrzeit wird über PinLockStore verwaltet. */
    fun checkPin(pin: String): Boolean {
        val ctx = appCtx ?: return false
        if (de.maxichen.app.PinLockStore.exists(ctx)) {
            return de.maxichen.app.PinLockStore.verify(ctx, pin) == null
        }
        // Alt-Hash: prüfen, bei Erfolg sofort auf PBKDF2 umziehen
        if (legacyHash.isNotEmpty() && hash(pin) == legacyHash) {
            de.maxichen.app.PinLockStore.set(ctx, pin)
            legacyHash = ""
            prefs?.edit()?.remove("pin")?.apply()
            pinHash = "pbkdf2"
            return true
        }
        return false
    }

    /** Warum ging es nicht? (Sperrzeit / falsch) — für den Sperrbildschirm. */
    fun checkPinReason(pin: String): String? {
        val ctx = appCtx ?: return "Kein Kontext"
        if (de.maxichen.app.PinLockStore.exists(ctx)) return de.maxichen.app.PinLockStore.verify(ctx, pin)
        return if (checkPin(pin)) null else "Falsche PIN 💔"
    }

    fun applyBiometric(on: Boolean) {
        biometricEnabled = on
        prefs?.edit()?.putBoolean("bio", on)?.apply()
    }

    fun applyAutoLock(minutes: Int) {
        autoLockMinutes = minutes.coerceIn(0, 120)
        prefs?.edit()?.putInt("autolock", autoLockMinutes)?.apply()
    }

    fun onBackground() { backgroundedAt = System.currentTimeMillis() }

    fun onForeground() {
        if (!enabled()) { unlocked = true; backgroundedAt = 0; return }
        if (backgroundedAt == 0L) return
        val diffMin = (System.currentTimeMillis() - backgroundedAt) / 60000.0
        if (autoLockMinutes == 0 || diffMin >= autoLockMinutes) unlocked = false
        backgroundedAt = 0
    }

    fun lockNow() { unlocked = false }

    fun unlock() { unlocked = true }

    fun biometricAvailable(ctx: Context): Boolean =
        BiometricManager.from(ctx).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
        ) == BiometricManager.BIOMETRIC_SUCCESS
}

/* ---------------- Sperrbildschirm ---------------- */

@Composable
fun AppLockScreen(onUnlocked: () -> Unit) {
    val ctx = LocalContext.current
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    val canBio = remember { LockState.biometricEnabled && LockState.biometricAvailable(ctx) }

    fun tryUnlock(candidate: String) {
        if (LockState.checkPin(candidate)) {
            LockState.unlock()
            onUnlocked()
        } else {
            error = LockState.checkPinReason(candidate) ?: "Falsche PIN 💔"
            pin = ""
        }
    }

    fun promptBiometric() {
        val act = ctx as? FragmentActivity ?: run {
            Hub.toast("🔐", "Biometrie nicht verfügbar", "Bitte PIN nutzen")
            return
        }
        val mgr = BiometricPrompt(act, ContextCompat.getMainExecutor(ctx), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                LockState.unlock()
                onUnlocked()
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    Hub.toast("🔐", "Fehlgeschlagen", errString.toString())
                }
            }
        })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("MaxiChat entsperren 💗")
            .setSubtitle("Fingerabdruck oder Gerätesperre")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
            .build()
        try { mgr.authenticate(info) } catch (e: Exception) { Hub.toast("🔐", "Biometrie-Fehler", e.message ?: "") }
    }

    LaunchedEffect(Unit) { if (canBio) promptBiometric() }

    AppBackgroundLayer(AppBackground.from("preset|lila-nacht")) {
        Column(
            Modifier.fillMaxSize().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(72.dp).clip(RoundedCornerShape(24.dp)).background(V3.primaryBrush), contentAlignment = Alignment.Center) {
                Text("🔒", fontSize = 30.sp)
            }
            Spacer(Modifier.height(12.dp))
            Text("MaxiChat ist gesperrt", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = V3.text)
            Muted3("Gib deine PIN ein 💗", 11, 1)
            Spacer(Modifier.height(18.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                repeat(4) { i ->
                    Box(
                        Modifier.size(15.dp).clip(CircleShape)
                            .background(if (i < pin.length) V3.neon else Color(0x33FFFFFF))
                            .border(1.dp, if (i < pin.length) V3.neon else V3.glassBorder, CircleShape),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(error, fontFamily = Outfit, fontSize = 11.sp, color = V3.danger)
            Spacer(Modifier.height(16.dp))

            val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "⌫")
            keys.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(vertical = 4.dp)) {
                    row.forEach { k ->
                        Box(
                            Modifier.size(66.dp).clip(RoundedCornerShape(22.dp))
                                .background(if (k == "bio") Color(0x22FF7EDB) else V3.glass)
                                .border(1.dp, V3.glassBorder, RoundedCornerShape(22.dp))
                                .clickable {
                                    when (k) {
                                        "bio" -> if (canBio) promptBiometric() else Hub.toast("🔐", "Biometrie aus", "In Einstellungen aktivieren")
                                        "⌫" -> { pin = pin.dropLast(1); error = "" }
                                        else -> {
                                            if (pin.length < 4) {
                                                pin += k
                                                error = ""
                                                if (pin.length == 4) tryUnlock(pin)
                                            }
                                        }
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                when (k) { "bio" -> "👆"; else -> k },
                                fontFamily = Outfit, fontSize = if (k.length == 1) 22.sp else 20.sp,
                                fontWeight = FontWeight.SemiBold, color = V3.text,
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Muted3("PIN vergessen? Melde dich neu an — deine Chats bleiben.", 9.5, 2)
        }
    }
}

/* ---------------- PIN-Einrichtung in den Einstellungen ---------------- */

@Composable
fun PinSetupCard() {
    val ctx = LocalContext.current
    var hasPin by remember { mutableStateOf(LockState.enabled()) }
    var bio by remember { mutableStateOf(LockState.biometricEnabled) }
    var auto by remember { mutableStateOf(LockState.autoLockMinutes) }
    var pin1 by remember { mutableStateOf("") }
    var pin2 by remember { mutableStateOf("") }
    var old by remember { mutableStateOf("") }
    var expanding by remember { mutableStateOf(!LockState.enabled()) }
    val bioOk = remember { LockState.biometricAvailable(ctx) }

    GlassCard3(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🔒", fontSize = 15.sp)
            Spacer(Modifier.width(7.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (hasPin) "App-Sperre aktiv" else "App-Sperre aus",
                    fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
                    color = if (hasPin) V3.green else V3.gold,
                )
                Muted3(if (hasPin) "PIN gesetzt · Auto-Lock " + auto + " Min" else "Schütze deine Chats mit PIN", 9.5, 1)
            }
            ChipFilter(if (expanding) "▲" else "▼", expanding) { expanding = !expanding }
        }

        if (expanding) {
            Spacer(Modifier.height(8.dp))
            if (hasPin) {
                V2TextField(old, { old = it }, "Aktuelle PIN", password = true, minHeight = 42, keyboard = KeyboardType.Number)
                Spacer(Modifier.height(5.dp))
            }
            V2TextField(pin1, { pin1 = it.filter { c -> c.isDigit() }.take(12) }, "Neue PIN (4–12 Ziffern)", password = true, minHeight = 42, keyboard = KeyboardType.Number)
            Spacer(Modifier.height(5.dp))
            V2TextField(pin2, { pin2 = it.filter { c -> c.isDigit() }.take(12) }, "PIN wiederholen", password = true, minHeight = 42, keyboard = KeyboardType.Number)
            Spacer(Modifier.height(6.dp))
            NeonButton3("PIN speichern 🔒") {
                if (hasPin && !LockState.checkPin(old)) { Hub.toast("⚠️", "Alte PIN falsch", ""); return@NeonButton3 }
                val weak = de.maxichen.app.crypto.PinLock.validate(pin1)
                if (weak != null) { Hub.toast("⚠️", "PIN zu schwach", weak); return@NeonButton3 }
                if (pin1 != pin2) { Hub.toast("⚠️", "PIN stimmt nicht überein", ""); return@NeonButton3 }
                LockState.setPin(pin1)
                hasPin = true
                pin1 = ""; pin2 = ""; old = ""
                Hub.toast("🔒", "PIN gespeichert", "Beim nächsten Start gefragt")
            }
        }

        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("👆 Biometrie", fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, color = V3.text)
                Muted3(if (bioOk) "Fingerabdruck / Gesicht" else "Auf diesem Gerät nicht verfügbar", 9, 1)
            }
            Switch3(on = bio && bioOk, enabled = bioOk) {
                bio = !bio
                LockState.applyBiometric(bio)
                Hub.toast("👆", if (bio) "Biometrie an" else "Biometrie aus")
            }
        }
        Spacer(Modifier.height(6.dp))
        Text("Auto-Lock ⏱", fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, color = V3.text)
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            listOf(0 to "sofort", 1 to "1 Min", 5 to "5 Min", 30 to "30 Min").forEach { (m, l) ->
                ChipFilter(l, auto == m) { auto = m; LockState.applyAutoLock(m) }
            }
        }
        if (hasPin) {
            Spacer(Modifier.height(6.dp))
            GhostButton3("PIN entfernen", danger = true) {
                LockState.clearPin()
                hasPin = false
                expanding = false
                Hub.toast("🔓", "App-Sperre aus")
            }
        }
    }
}

@Composable
fun Switch3(on: Boolean, enabled: Boolean = true, onChange: () -> Unit) {
    Box(
        Modifier.size(width = 44.dp, height = 24.dp).clip(RoundedCornerShape(50))
            .background(if (on) V3.neon else Color(0x33FFFFFF))
            .clickable(enabled = enabled) { onChange() },
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(
            Modifier.padding(horizontal = 3.dp).size(18.dp).clip(CircleShape)
                .background(if (on) V3.ink else Color(0xAAFFFFFF)),
        )
    }
}
