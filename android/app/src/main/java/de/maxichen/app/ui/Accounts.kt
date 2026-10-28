package de.maxichen.app.ui

/* =====================================================================
   👥 V4.4 — MULTI-ACCOUNT (max. 5)
   ---------------------------------------------------------------------
   • jede weitere Nummer braucht einen SMS-Code (Server prüft UNIQUE)
   • gleiche Nummer → 409 phone_exists (kommt als ApiError an)
   • Tokens werden PRO ACCOUNT im DataStore gehalten, nicht überschrieben
   • Wechsel in ~400 ms mit Spring-Animation
   ===================================================================== */

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.Api4
import de.maxichen.app.ApiError
import de.maxichen.app.Hub
import de.maxichen.app.Ws
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

data class LocalAccount(
    val id: String,
    val username: String,
    val displayName: String,
    val avatar: String,
    val phone: String,
    val token: String,
)

/**
 * Hält ALLE Accounts dieses Geräts inkl. eigenem Token je Account.
 * Der aktive Account ist der, dessen Token gerade in Hub.token liegt.
 */
object AccountStore {
    private val _list = mutableStateListOf<LocalAccount>()
    val list: List<LocalAccount> get() = _list

    var activeId by mutableStateOf("")
        private set

    /** Wechsel-Animation (0..1) — 400 ms Spring */
    var switching by mutableStateOf(false)
        private set

    fun load(raw: String) {
        if (raw.isBlank()) return
        try {
            val arr = JSONArray(raw)
            val parsed = (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                LocalAccount(
                    o.optString("id"), o.optString("username"), o.optString("displayName"),
                    o.optString("avatar"), o.optString("phone"), o.optString("token"),
                )
            }
            _list.clear()
            _list.addAll(parsed.take(5))
            activeId = _list.firstOrNull { it.token == Hub.token }?.id ?: _list.firstOrNull()?.id ?: ""
        } catch (e: Exception) {}
    }

    private fun persist() {
        val arr = JSONArray()
        _list.forEach { a ->
            arr.put(
                JSONObject()
                    .put("id", a.id).put("username", a.username).put("displayName", a.displayName)
                    .put("avatar", a.avatar).put("phone", a.phone).put("token", a.token)
            )
        }
        Hub.saveAccountsRaw(arr.toString())
    }

    /** nach Login/Registrierung aufrufen */
    fun remember(id: String, username: String, displayName: String, avatar: String, phone: String, token: String) {
        if (id.isEmpty() || token.isEmpty()) return
        val idx = _list.indexOfFirst { it.id == id || it.username == username }
        val a = LocalAccount(id, username, displayName, avatar, phone, token)
        if (idx >= 0) _list[idx] = a else if (_list.size < 5) _list.add(a) else _list[4] = a
        activeId = id
        persist()
    }

    fun remove(id: String) {
        _list.removeAll { it.id == id }
        if (activeId == id) activeId = _list.firstOrNull()?.id ?: ""
        persist()
    }

    fun byId(id: String) = _list.firstOrNull { it.id == id }

    /** 400-ms-Spring beim Umschalten */
    suspend fun switchTo(id: String, onDone: (Boolean) -> Unit) {
        if (id == activeId || switching) return
        switching = true
        val ok = try {
            val token = Api4.switchAccount(id)
            if (token.isEmpty()) false else {
                Ws.disconnect()
                Hub.saveToken(token)
                val entered = Hub.enterApp()
                if (entered) {
                    val idx = _list.indexOfFirst { it.id == id }
                    if (idx >= 0) _list[idx] = _list[idx].copy(token = token)
                    activeId = id
                    persist()
                    Ws.connect()
                }
                entered
            }
        } catch (e: Exception) {
            Hub.toast("💔", "Wechsel fehlgeschlagen", (e as? ApiError)?.msg ?: "Server nicht erreichbar")
            false
        }
        // Spring fühlt sich bei ~400 ms am besten an
        delay(400)
        switching = false
        onDone(ok)
    }
}

/* =====================================================================
   🖥️ ACCOUNT-SCREEN
   ===================================================================== */

@Composable
fun AccountsScreen(onBack: () -> Unit, onChanged: () -> Unit) {
    val me by Hub.user.collectAsState()
    var serverAccounts by remember { mutableStateOf<List<Api4.AccountLite>>(emptyList()) }
    var maxAccounts by remember { mutableIntStateOf(5) }
    var showAdd by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var switchTarget by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            val (a, m) = Api4.accounts()
            serverAccounts = a
            maxAccounts = m
        } catch (e: Exception) {}
    }

    // 400-ms-Spring: die Liste skaliert kurz weich
    val springScale by animateFloatAsState(
        targetValue = if (AccountStore.switching) 0.94f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "account-switch",
    )

    Box(Modifier.fillMaxSize().background(Light.bg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            ScreenHeader("Konten", "max. 5 · jede Nummer 1×", onBack)
            Column(
                Modifier.padding(horizontal = 16.dp).scale(springScale),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LightCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LightAvatar(me?.avatar?.ifEmpty { "💗" } ?: "💗", 52)
                        Spacer(Modifier.width(11.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                me?.displayName ?: "—",
                                fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = Light.ink,
                            )
                            SoftText("@" + (me?.username ?: "") + " · aktiv", 10.5f, 1)
                        }
                        LightBadge("aktiv", Light.green)
                    }
                }

                Spacer(Modifier.height(2.dp))
                Text(
                    "Deine Konten",
                    fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                    color = Light.soft, modifier = Modifier.padding(start = 4.dp),
                )

                val local = AccountStore.list
                if (local.isEmpty()) {
                    LightCard {
                        SoftText("Noch keine Konten gespeichert — logge dich ein, dann erscheinen sie hier.", 11f, 2)
                    }
                }
                local.forEach { acc ->
                    val isActive = acc.token == Hub.token || acc.id == AccountStore.activeId
                    LightCard(onClick = {
                        if (!isActive && !busy) {
                            busy = true
                            switchTarget = acc.id
                            scope.launch {
                                AccountStore.switchTo(acc.id) { ok ->
                                    busy = false
                                    switchTarget = null
                                    if (ok) onChanged()
                                }
                            }
                        }
                    }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            LightAvatar(acc.avatar.ifEmpty { acc.displayName.take(1) }, 46)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(acc.displayName, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.5.sp, color = Light.ink)
                                SoftText("@" + acc.username + if (acc.phone.isNotEmpty()) " · " + acc.phone else "", 10f, 1)
                            }
                            when {
                                isActive -> LightBadge("aktiv", Light.green)
                                switchTarget == acc.id -> LightBadge("wechselt…", Light.lila)
                                else -> Text("›", fontSize = 19.sp, color = Light.soft)
                            }
                        }
                    }
                }

                Spacer(Modifier.height(4.dp))
                if (local.size < maxAccounts) {
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(18.dp))
                            .background(Light.pinkSoft).border(1.dp, Light.pink.copy(alpha = 0.25f), RoundedCornerShape(18.dp))
                            .clickable { showAdd = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("＋ Account hinzufügen (" + local.size + "/" + maxAccounts + ")",
                            fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, color = Light.pink)
                    }
                } else {
                    LightCard { SoftText("Maximal " + maxAccounts + " Accounts pro Gerät 👥", 11f, 1) }
                }

                Spacer(Modifier.height(8.dp))
                LightCard {
                    Text("Wie das funktioniert", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, color = Light.ink)
                    Spacer(Modifier.height(4.dp))
                    SoftText("Jede zusätzliche Nummer bekommt eine echte SMS mit 6-stelligem Code (10 Min gültig). " +
                            "Eine Nummer kann nur zu EINEM Konto gehören — sonst kommt 409 phone_exists.", 10.5f, 4)
                    Spacer(Modifier.height(4.dp))
                    SoftText("Der Wechsel dauert ~400 ms und lädt deine Chats sofort neu.", 10.5f, 2)
                }

                if (serverAccounts.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text("Auf dem Server verknüpft", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                        color = Light.soft, modifier = Modifier.padding(start = 4.dp))
                    serverAccounts.forEach { a ->
                        LightCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(a.avatar.ifEmpty { "💗" }, fontSize = 20.sp)
                                Spacer(Modifier.width(8.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(a.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Light.ink)
                                    SoftText("@" + a.username + " · " + (if (a.phone.isEmpty()) "keine Nummer" else a.phone), 9.5f, 1)
                                }
                                if (a.verified) LightBadge("✓ SMS", Light.green) else LightBadge("unbestätigt", Light.gold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }

        // 🌀 Wechsel-Overlay (Spring, 400 ms)
        AnimatedVisibility(
            visible = AccountStore.switching,
            enter = fadeIn() + scaleIn(initialScale = 0.6f),
            exit = fadeOut() + scaleOut(targetScale = 1.3f),
            modifier = Modifier.align(Alignment.Center),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.size(74.dp).clip(CircleShape).background(Light.pinkBrush),
                    contentAlignment = Alignment.Center,
                ) { Text("👥", fontSize = 32.sp) }
                Spacer(Modifier.height(10.dp))
                Text("Account wechseln…", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, color = Light.ink)
            }
        }
    }

    if (showAdd) AddAccountSheet(onDismiss = { showAdd = false }, onAdded = {
        showAdd = false
        onChanged()
    })
}

/* =====================================================================
   ➕ ACCOUNT HINZUFÜGEN — echter SMS-Flow
   ===================================================================== */

@Composable
fun AddAccountSheet(onDismiss: () -> Unit, onAdded: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }         // 0 Nummer · 1 Code · 2 Profil
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var ticket by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var devHint by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun requestCode() {
        error = ""
        if (phone.count { it.isDigit() } < 7) { error = "Bitte eine echte Nummer, z. B. +49 151 1234567"; return }
        busy = true
        scope.launch {
            try {
                val r = Api4.requestSms(phone.trim())
                devHint = r.optString("devCode").ifEmpty { "" }
                step = 1
                Hub.toast("📲", "SMS unterwegs", r.optString("hint"))
            } catch (e: ApiError) {
                error = when (e.reason) {
                    "phone_exists" -> "Diese Nummer gehört schon zu einem Konto. Nutze 'Account wechseln' oder eine andere Nummer."
                    "sms_rate_limited" -> "Zu viele Codes — warte 10 Minuten."
                    "phone_invalid" -> "Die Nummer sieht nicht richtig aus."
                    else -> e.msg
                }
            } catch (e: Exception) {
                error = "Server nicht erreichbar"
            }
            busy = false
        }
    }

    fun verify() {
        error = ""
        busy = true
        scope.launch {
            try {
                ticket = Api4.verifySms(phone.trim(), code.trim())
                step = 2
            } catch (e: ApiError) {
                error = e.msg
            } catch (e: Exception) { error = "Server nicht erreichbar" }
            busy = false
        }
    }

    fun create() {
        error = ""
        busy = true
        scope.launch {
            try {
                val r = Api4.addAccount(ticket, phone.trim(), username.trim(), displayName.trim(), password)
                val token = r.optString("token")
                val u = r.optJSONObject("user")
                if (u != null && token.isNotEmpty()) {
                    AccountStore.remember(
                        u.optString("id"), u.optString("username"), u.optString("displayName"),
                        u.optString("avatar"), u.optString("phone"), token,
                    )
                    Ws.disconnect()
                    Hub.saveToken(token)
                    Hub.enterApp()
                    Ws.connect()
                    Hub.toast("👥", "Account hinzugefügt", "Du bist jetzt als @" + u.optString("username") + " unterwegs")
                    onAdded()
                }
            } catch (e: ApiError) {
                error = when (e.reason) {
                    "max_accounts" -> "Maximal 5 Accounts pro Gerät."
                    "phone_exists" -> "Nummer gehört schon zu einem Konto."
                    "username_taken" -> "Benutzername ist vergeben."
                    "phone_unverified" -> "SMS-Code abgelaufen — fordere einen neuen an."
                    else -> e.msg
                }
            } catch (e: Exception) { error = "Server nicht erreichbar" }
            busy = false
        }
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
                Text("👥 Account hinzufügen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Light.ink)
                Spacer(Modifier.weight(1f))
                Text("✕", fontSize = 17.sp, color = Light.soft, modifier = Modifier.clickable { onDismiss() })
            }
            Spacer(Modifier.height(4.dp))
            SoftText(
                when (step) {
                    0 -> "Schritt 1 von 3 · Nummer bestätigen"
                    1 -> "Schritt 2 von 3 · SMS-Code"
                    else -> "Schritt 3 von 3 · Profil"
                }, 10.5f, 1,
            )
            Spacer(Modifier.height(12.dp))

            when (step) {
                0 -> {
                    V2TextField(phone, { phone = it }, "+49 151 1234567", keyboard = KeyboardType.Phone, leading = "📱")
                    Spacer(Modifier.height(8.dp))
                    SoftText("Eine Nummer = ein Konto. Ist sie schon vergeben, sagt dir der Server das ehrlich (409).", 10f, 2)
                    Spacer(Modifier.height(12.dp))
                    LightButton(if (busy) "Sende SMS…" else "Code anfordern 📲") { if (!busy) requestCode() }
                }
                1 -> {
                    V2TextField(code, { code = it.filter { c -> c.isDigit() }.take(6) }, "123456", keyboard = KeyboardType.Number, leading = "🔢")
                    if (devHint.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        LightCard { SoftText("Dev-Server: Code = " + devHint + " (steht auch in data/sms-outbox.log)", 10f, 2) }
                    }
                    Spacer(Modifier.height(12.dp))
                    LightButton(if (busy) "Prüfe…" else "Bestätigen ✅") { if (!busy) verify() }
                    Spacer(Modifier.height(6.dp))
                    LightGhost("Nummer ändern") { step = 0 }
                }
                else -> {
                    V2TextField(username, { username = it.filter { c -> c.isLetterOrDigit() || c == '_' }.take(20) }, "benutzername", leading = "@")
                    Spacer(Modifier.height(7.dp))
                    V2TextField(displayName, { displayName = it.take(30) }, "Anzeigename", leading = "💗")
                    Spacer(Modifier.height(7.dp))
                    V2TextField(password, { password = it }, "Passwort (min. 6)", password = true, leading = "🔑")
                    Spacer(Modifier.height(12.dp))
                    LightButton(if (busy) "Lege an…" else "Account anlegen 💗") { if (!busy) create() }
                }
            }

            if (error.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(Light.danger.copy(alpha = 0.10f))
                        .border(1.dp, Light.danger.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
                        .padding(10.dp),
                ) { SoftText(error, 10.5f, 3) }
            }
            Spacer(Modifier.height(18.dp))
        }
    }
}

/* =====================================================================
   🔝 kleiner gemeinsamer Header für Vollbild-Screens
   ===================================================================== */

@Composable
fun ScreenHeader(title: String, sub: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 12.dp, end = 16.dp, top = 44.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(38.dp).clip(CircleShape).background(Light.card).clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) { Text("‹", fontSize = 24.sp, color = Light.ink) }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Light.pink)
            if (sub.isNotEmpty()) SoftText(sub, 10f, 1)
        }
    }
}
