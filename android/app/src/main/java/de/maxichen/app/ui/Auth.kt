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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch

/* =====================================================================
   🔐 LOGIN · REGISTRIERUNG · 2FA · EINSPRUCH
   ===================================================================== */

@Composable
fun AuthScreen2(onSuccess: () -> Unit) {
    var mode by remember { mutableStateOf("login") }
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var step2fa by remember { mutableStateOf(false) }
    var totp by remember { mutableStateOf("") }
    var banText by remember { mutableStateOf("") }
    var appealMode by remember { mutableStateOf(false) }
    var appealText by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun doLogin(useTotp: Boolean) {
        busy = true
        scope.launch {
            try {
                if (useTotp) ApiCall.loginWithTotp(login.trim(), password, totp.trim())
                else ApiCall.login(login.trim(), password)
                onSuccess()
            } catch (e: ApiError) {
                when (e.reason) {
                    "2fa_required", "2fa_invalid" -> { step2fa = true; Hub.toast("🔐", "2FA nötig", e.msg) }
                    "banned", "deactivated" -> { banText = e.msg; appealMode = true }
                    else -> Hub.toast("💔", "Fehler", e.msg)
                }
            } catch (e: Exception) {
                Hub.toast("💔", "Keine Verbindung", "Server erreichbar?")
            }
            busy = false
        }
    }

    AppBackgroundLayer(AppBackground.from(V3State.appBackground.collectAsState().value)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(70.dp))
            Box(Modifier.size(84.dp).clip(RoundedCornerShape(28.dp)).background(V3.primaryBrush), contentAlignment = Alignment.Center) {
                Text("💗", fontSize = 40.sp)
            }
            Spacer(Modifier.height(14.dp))
            Text("MaxiChat", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 30.sp, color = V3.text)
            Muted3("by Maxichen · pink · kawaii · sicher", 11, 1)
            Spacer(Modifier.height(22.dp))

            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(V3.glass)
                    .border(1.dp, V3.glassBorder, RoundedCornerShape(16.dp)).padding(4.dp),
            ) {
                listOf("login" to "Anmelden", "register" to "Neu hier 💗").forEach { (k, l) ->
                    val on = mode == k
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                            .background(if (on) V3.primaryBrush else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent)))
                            .clickable { mode = k }.padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(l, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
                            color = if (on) V3.ink else V3.muted)
                    }
                }
            }
            Spacer(Modifier.height(14.dp))

            if (mode == "login") {
                if (!step2fa) {
                    V2TextField(login, { login = it }, "Benutzername · Telefon · E-Mail", leading = "👤")
                    Spacer(Modifier.height(8.dp))
                    V2TextField(password, { password = it }, "Passwort", password = true, leading = "🔑")
                    Spacer(Modifier.height(14.dp))
                    NeonButton3(if (busy) "Einen Moment…" else "Anmelden 💗", loading = busy) { doLogin(false) }
                    Spacer(Modifier.height(8.dp))
                    GhostButton3("👀 Ohne Konto reinschauen") { DemoMode.active = true }
                } else {
                    GlassCard3(Modifier.fillMaxWidth()) {
                        Text("🔐 Zwei-Faktor", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
                        Spacer(Modifier.height(4.dp))
                        Muted3("Gib den 6-stelligen Code aus deiner Authenticator-App ein.", 11, 2)
                    }
                    Spacer(Modifier.height(10.dp))
                    V2TextField(totp, { totp = it }, "123 456", keyboard = KeyboardType.Number, leading = "🔢")
                    Spacer(Modifier.height(10.dp))
                    NeonButton3(if (busy) "Prüfe…" else "Bestätigen ✅", loading = busy) { doLogin(true) }
                    Spacer(Modifier.height(6.dp))
                    GhostButton3("Zurück") { step2fa = false }
                }
            } else {
                V2TextField(username, { username = it.filter { c -> c.isLetterOrDigit() || c == '_' || c == '.' } }, "Benutzername (einzigartig)", leading = "@")
                Spacer(Modifier.height(8.dp))
                V2TextField(displayName, { displayName = it }, "Anzeigename 💗", leading = "✨")
                Spacer(Modifier.height(8.dp))
                V2TextField(phone, { phone = it }, "Telefon (optional)", keyboard = KeyboardType.Phone, leading = "📞")
                Spacer(Modifier.height(8.dp))
                V2TextField(email, { email = it }, "E-Mail (optional)", keyboard = KeyboardType.Email, leading = "✉️")
                Spacer(Modifier.height(8.dp))
                V2TextField(password, { password = it }, "Passwort (min. 6)", password = true, leading = "🔑")
                Spacer(Modifier.height(14.dp))
                NeonButton3(if (busy) "Erstelle…" else "Konto erstellen 🌸", loading = busy) {
                    if (username.trim().length < 3) { Hub.toast("⚠️", "Benutzername zu kurz", "Mind. 3 Zeichen"); return@NeonButton3 }
                    if (password.length < 6) { Hub.toast("⚠️", "Passwort zu kurz", "Mind. 6 Zeichen"); return@NeonButton3 }
                    busy = true
                    scope.launch {
                        try {
                            ApiCall.register(
                                username.trim().lowercase(), displayName.trim().ifEmpty { username.trim() },
                                password, phone.trim(), email.trim(), "💗",
                            )
                            onSuccess()
                        } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        catch (e: Exception) { Hub.toast("💔", "Keine Verbindung", "") }
                        busy = false
                    }
                }
            }

            if (appealMode) {
                Spacer(Modifier.height(14.dp))
                GlassCard3(Modifier.fillMaxWidth()) {
                    Text("🚫 Konto gesperrt", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.danger)
                    Spacer(Modifier.height(4.dp))
                    Muted3(banText, 11, 4)
                    Spacer(Modifier.height(8.dp))
                    V2TextField(appealText, { appealText = it }, "Dein Einspruch…", minHeight = 46)
                    Spacer(Modifier.height(8.dp))
                    NeonButton3("Einspruch senden 📬") {
                        if (appealText.trim().length < 10) { Hub.toast("⚠️", "Schreib ein bisschen mehr", ""); return@NeonButton3 }
                        scope.launch {
                            try {
                                val msg = ApiCall.appeal(login.trim(), password, appealText.trim())
                                Hub.toast("📬", "Gesendet", msg)
                                appealMode = false
                            } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            Text(
                "LoveBot ist der einzige Bot · keine fremden Bots 🤖\nDeine Daten bleiben bei dir 💗",
                fontFamily = Outfit, fontSize = 9.5.sp, color = V3.muted, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(40.dp))
        }
    }
}
