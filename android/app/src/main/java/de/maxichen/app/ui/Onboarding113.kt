package de.maxichen.app.ui

/* =====================================================================
   📱 V4.13 — ANMELDUNG WIE BEI WHATSAPP
   ---------------------------------------------------------------------
   Sieben Schritte, genau in der Reihenfolge, die jeder kennt:

     0  Startseite        „Willkommen bei MaxiChen"        [Weiter]
     1  16+-Hinweis       „Du musst mindestens 16 sein"   [Zustimmen]
     2  Nummer            Ländervorwahl + Nummer          [Weiter]
     3  Code per WhatsApp 6 Kästchen, prüft automatisch
     4  Profil            Kontoname + Anzeigename + Bild
     5  E-Mail            „für den Fall, dass das Handy weg ist"
     6  Mail-Code         6 Kästchen
     7  Fertig            → ab in die App

   Warum keine WebView, keine Lib für die Eingabefelder:
   Der Flow ist die erste Sache, die ein neuer Mensch sieht. Wenn der
   hakelt, ist die App für ihn kaputt. Also alles hier und alles selbst.

   ⚠️ EHRLICH: Der Code-Feld-Trick (6 Kästchen, ein unsichtbares Textfeld)
   ist Absicht — so macht es WhatsApp auch. Einzeln fokussierbare Felder
   machen auf kleinen Handys mehr Ärger als Freude.
   ===================================================================== */

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.Api4
import de.maxichen.app.Api4Signup
import de.maxichen.app.Hub
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/* =====================================================================
   Ländervorwahl — nur die, die wirklich jemand braucht.
   Absichtlich kurz: eine Liste mit 200 Ländern ist auf einem Handy
   schlimmer als eine mit 12 und einem „anderes"-Feld.
   ===================================================================== */

private data class Country(val flag: String, val code: String, val name: String)

private val COUNTRIES = listOf(
    Country("🇩🇪", "+49", "Deutschland"),
    Country("🇦🇹", "+43", "Österreich"),
    Country("🇨🇭", "+41", "Schweiz"),
    Country("🇹🇷", "+90", "Türkei"),
    Country("🇵🇱", "+48", "Polen"),
    Country("🇳🇱", "+31", "Niederlande"),
    Country("🇫🇷", "+33", "Frankreich"),
    Country("🇮🇹", "+39", "Italien"),
    Country("🇬🇧", "+44", "UK"),
    Country("🇺🇸", "+1", "USA/Kanada"),
    Country("🇷🇺", "+7", "Russland"),
    Country("🇺🇦", "+380", "Ukraine"),
)

/* =====================================================================
   Der Flow
   ===================================================================== */

@Composable
fun WhatsAppOnboarding(onDone: (String) -> Unit, onDemo: () -> Unit = {}) {
    var step by remember { mutableStateOf(0) }
    var country by remember { mutableStateOf(COUNTRIES[0]) }
    var number by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var mailCode by remember { mutableStateOf("") }
    var signupToken by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var avatar by remember { mutableStateOf("🦊") }
    var email by remember { mutableStateOf("") }
    var mailCodeValue by remember { mutableStateOf("") }
    var err by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    val fullNumber = remember(country, number) {
        country.code + number.filter { it.isDigit() }
    }

    Box(Modifier.fillMaxSize().background(Light.bg)) {
        Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState())) {

            // Fortschritt oben — 6 Punkte, sichtbar wie in einer Story
            if (step in 1..6) ProgressDots(step - 1, 6)

            when (step) {
                /* ---------- 0. Startseite ---------- */
                0 -> HeroStart(onNext = { step = 1 }, onDemo = onDemo)

                /* ---------- 1. 16+ ---------- */
                1 -> Step16(
                    onBack = { step = 0 },
                    onAccept = { step = 2 },
                )

                /* ---------- 2. Nummer ---------- */
                2 -> StepPhone(
                    country = country,
                    onCountry = { country = it },
                    number = number,
                    onNumber = { v -> number = v.filter { it.isDigit() }.take(14); err = "" },
                    error = err,
                    busy = busy,
                    onBack = { step = 1 },
                    onNext = {
                        if (number.filter { it.isDigit() }.length < 6) { err = "Die Nummer ist zu kurz."; return@StepPhone }
                        busy = true; err = ""; info = ""
                        scope.launch {
                            try {
                                Api4Signup.requestCode(fullNumber)
                                step = 3
                                code = ""
                                info = ""
                            } catch (e: Throwable) {
                                err = friendly(e.message)
                            }
                            busy = false
                        }
                    },
                )

                /* ---------- 3. WhatsApp-Code ---------- */
                3 -> StepCode(
                    title = "Code aus WhatsApp",
                    subtitle = "Wir haben " + fullNumber + " einen 6-stelligen Code geschickt. Schau in WhatsApp.",
                    value = code,
                    onValue = { v -> code = v.filter { it.isDigit() }.take(6); err = "" },
                    error = err,
                    busy = busy,
                    onBack = { step = 2 },
                    onResend = {
                        busy = true; err = ""; info = ""
                        scope.launch {
                            try { Api4Signup.requestCode(fullNumber); code = ""; info = "Neuer Code unterwegs ✨" }
                            catch (e: Throwable) { err = friendly(e.message) }
                            busy = false
                        }
                    },
                    onNext = {
                        busy = true; err = ""; info = ""
                        scope.launch {
                            try {
                                signupToken = Api4Signup.verifyCode(fullNumber, code)
                                avatar = "🦊"
                                step = 4
                            } catch (e: Throwable) { err = friendly(e.message); code = "" }
                            busy = false
                        }
                    },
                    info = info,
                )

                /* ---------- 4. Profil ---------- */
                4 -> StepProfile(
                    username = username,
                    onUsername = { v -> username = v.lowercase().filter { it.isLetterOrDigit() || it == '_' }.take(20); err = "" },
                    displayName = displayName,
                    onDisplayName = { v -> displayName = v.take(30); err = "" },
                    avatar = avatar,
                    onAvatar = { avatar = it },
                    error = err,
                    busy = busy,
                    onNext = {
                        busy = true; err = ""
                        scope.launch {
                            try {
                                Api4Signup.saveProfile(signupToken, username, displayName, avatar)
                                step = 5
                            } catch (e: Throwable) { err = friendly(e.message) }
                            busy = false
                        }
                    },
                )

                /* ---------- 5. E-Mail ---------- */
                5 -> StepEmail(
                    email = email,
                    onEmail = { v -> email = v.trim(); err = "" },
                    error = err,
                    busy = busy,
                    info = info,
                    onSkipNote = { info = "Ohne E-Mail kannst du dein Konto bei Handyverlust nicht wiederherstellen." },
                    onNext = {
                        busy = true; err = ""
                        scope.launch {
                            try {
                                Api4Signup.requestEmailCode(signupToken, email)
                                step = 6
                                mailCode = ""
                            } catch (e: Throwable) { err = friendly(e.message) }
                            busy = false
                        }
                    },
                )

                /* ---------- 6. Mail-Code ---------- */
                6 -> StepCode(
                    title = "Code aus der E-Mail",
                    subtitle = "Wir haben an " + email + " geschrieben. Betreff: „maxichen verifizierungscode\".",
                    value = mailCode,
                    onValue = { v -> mailCode = v.filter { it.isDigit() }.take(6); err = "" },
                    error = err,
                    busy = busy,
                    onBack = { step = 5 },
                    onResend = {
                        busy = true; err = ""; info = ""
                        scope.launch {
                            try { Api4Signup.requestEmailCode(signupToken, email); mailCode = ""; info = "Neue Mail unterwegs 📬" }
                            catch (e: Throwable) { err = friendly(e.message) }
                            busy = false
                        }
                    },
                    onNext = {
                        busy = true; err = ""
                        scope.launch {
                            try {
                                val token = Api4Signup.finish(signupToken, mailCode)
                                step = 7
                                delay(900)
                                onDone(token)
                            } catch (e: Throwable) { err = friendly(e.message); mailCode = "" }
                            busy = false
                        }
                    },
                    info = info,
                    fieldSize = 6,
                )

                /* ---------- 7. Fertig ---------- */
                else -> StepDone(displayName, avatar)
            }
        }
    }
}

/* =====================================================================
   Bausteine
   ===================================================================== */

private fun friendly(msg: String?): String {
    val m = msg ?: "Etwas ist schiefgelaufen."
    return if (m.startsWith("HTTP")) "Server antwortet nicht richtig. Versuch es nochmal." else m
}

@Composable
private fun ProgressDots(index: Int, total: Int) {
    Row(
        Modifier.fillMaxWidth().padding(top = 22.dp, start = 24.dp, end = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        repeat(total) { i ->
            val w by animateFloatAsState(if (i <= index) 1f else 0.35f, tween(220), label = "p")
            Box(
                Modifier.height(3.dp).weight(1f).clip(RoundedCornerShape(2.dp))
                    .background(Light.pink.copy(alpha = w)),
            )
        }
    }
}

@Composable
private fun HeroStart(onNext: () -> Unit, onDemo: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(96.dp))
        Box(
            Modifier.size(104.dp).clip(RoundedCornerShape(32.dp))
                .background(Light.pinkBrush),
            contentAlignment = Alignment.Center,
        ) { Text("💗", fontSize = 46.sp) }
        Spacer(Modifier.height(26.dp))
        Text("MaxiChen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
            fontSize = 32.sp, color = Light.ink, letterSpacing = (-1).sp)
        Spacer(Modifier.height(8.dp))
        Text(
            "Nachrichten, die bleiben,\nwo sie hingehören.",
            fontFamily = Outfit, fontSize = 13.sp, color = Light.soft, textAlign = TextAlign.Center,
            lineHeight = 19.sp,
        )
        Spacer(Modifier.height(44.dp))
        ObButton("Weiter", enabled = true, busy = false, onClick = onNext)
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().clickable { onDemo() }.padding(12.dp), contentAlignment = Alignment.Center) {
            Text("👀 Ohne Konto reinschauen", fontFamily = Outfit, fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp, color = Light.soft)
        }
        Spacer(Modifier.height(18.dp))
        Text("Pink · Midnight · Post-Quantum", fontFamily = Outfit, fontSize = 9.sp, color = Light.line)
    }
}

@Composable
private fun Step16(onBack: () -> Unit, onAccept: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 28.dp)) {
        Spacer(Modifier.height(64.dp))
        Text("🔞", fontSize = 44.sp)
        Spacer(Modifier.height(18.dp))
        Text("Du musst mindestens 16 Jahre alt sein", fontFamily = Outfit,
            fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, color = Light.ink, lineHeight = 30.sp)
        Spacer(Modifier.height(14.dp))
        Text(
            "MaxiChen ist ab 16. Wenn du jünger bist, frag deine Eltern — " +
                "und komm wieder, wenn du 16 bist. Wir speichern dein Geburtsdatum nicht, " +
                "weil wir es nicht brauchen.",
            fontFamily = Outfit, fontSize = 12.5.sp, color = Light.soft, lineHeight = 19.sp,
        )
        Spacer(Modifier.height(14.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                .background(Light.pinkSoft.copy(alpha = 0.6f)).padding(13.dp),
        ) {
            Text(
                "Mit „Zustimmen\" bestätigst du außerdem, dass du unsere Regeln liest: " +
                    "keine Beleidigungen, keine Weitergabe von Codes, kein Spam.",
                fontFamily = Outfit, fontSize = 10.5.sp, color = Light.ink.copy(alpha = 0.75f), lineHeight = 16.sp,
            )
        }
        Spacer(Modifier.weight(1f))
        ObButton("Ich bin 16 oder älter", enabled = true, busy = false, onClick = onAccept)
        Spacer(Modifier.height(10.dp))
        ObGhost("Zurück", onBack)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun StepPhone(
    country: Country, onCountry: (Country) -> Unit,
    number: String, onNumber: (String) -> Unit,
    error: String, busy: Boolean,
    onBack: () -> Unit, onNext: () -> Unit,
) {
    var pickerOpen by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        Spacer(Modifier.height(46.dp))
        Text("Deine Telefonnummer", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
            fontSize = 24.sp, color = Light.ink)
        Spacer(Modifier.height(6.dp))
        Text(
            "MaxiChen schickt dir den Code per WhatsApp. Wir zeigen deine Nummer " +
                "niemandem an, außer du willst es.",
            fontFamily = Outfit, fontSize = 11.5.sp, color = Light.soft, lineHeight = 17.sp,
        )
        Spacer(Modifier.height(24.dp))

        // Land
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp))
                .background(Color.White).border(1.dp, Light.line, RoundedCornerShape(15.dp))
                .clickable { pickerOpen = !pickerOpen }
                .padding(horizontal = 15.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(country.flag, fontSize = 19.sp)
                Spacer(Modifier.width(10.dp))
                Text(country.name, fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.weight(1f))
                Text(country.code, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Light.soft)
                Text(if (pickerOpen) "  ▲" else "  ▼", fontSize = 9.sp, color = Light.soft)
            }
        }

        AnimatedVisibility(pickerOpen) {
            Column(
                Modifier.fillMaxWidth().padding(top = 6.dp).clip(RoundedCornerShape(15.dp))
                    .background(Color.White).border(1.dp, Light.line, RoundedCornerShape(15.dp)),
            ) {
                COUNTRIES.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onCountry(c); pickerOpen = false }
                            .padding(horizontal = 15.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(c.flag, fontSize = 16.sp)
                        Spacer(Modifier.width(10.dp))
                        Text(c.name, fontFamily = Outfit, fontSize = 12.5.sp, color = Light.ink)
                        Spacer(Modifier.weight(1f))
                        Text(c.code, fontFamily = Outfit, fontSize = 12.sp, color = Light.soft)
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Nummer
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.clip(RoundedCornerShape(15.dp)).background(Color.White)
                    .border(1.dp, Light.line, RoundedCornerShape(15.dp))
                    .padding(horizontal = 14.dp, vertical = 15.dp),
            ) { Text(country.code, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Light.ink) }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(15.dp)).background(Color.White)
                    .border(1.dp, Light.line, RoundedCornerShape(15.dp))
                    .padding(horizontal = 14.dp, vertical = 15.dp),
            ) {
                if (number.isEmpty()) {
                    Text("151 55894714", fontFamily = Outfit, fontSize = 14.sp, color = Light.line)
                }
                BasicTextField(
                    value = number,
                    onValueChange = onNumber,
                    singleLine = true,
                    textStyle = TextStyle(fontFamily = Outfit, fontSize = 14.sp, color = Light.ink, fontWeight = FontWeight.SemiBold),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone),
                    cursorBrush = SolidColor(Light.pink),
                )
            }
        }

        if (error.isNotEmpty()) { Spacer(Modifier.height(10.dp)); ObError(error) }
        Spacer(Modifier.height(12.dp))
        Text(
            "Wir verschicken höchstens 3 Codes in 15 Minuten. Wenn dir das zu viel ist: gut so.",
            fontFamily = Outfit, fontSize = 9.5.sp, color = Light.soft, lineHeight = 14.sp,
        )

        Spacer(Modifier.weight(1f))
        ObButton("Code per WhatsApp", enabled = number.length >= 6, busy = busy, onClick = onNext)
        Spacer(Modifier.height(10.dp))
        ObGhost("Zurück", onBack)
        Spacer(Modifier.height(24.dp))
    }
}

/**
 * Ein Feld, sechs Kästchen. Das echte Eingabefeld liegt unsichtbar dahinter —
 * so muss man nicht sechsmal tippen, um ein Zeichen zu korrigieren.
 */
@Composable
private fun StepCode(
    title: String, subtitle: String,
    value: String, onValue: (String) -> Unit,
    error: String, busy: Boolean, info: String,
    onBack: () -> Unit, onResend: () -> Unit, onNext: () -> Unit,
    fieldSize: Int = 6,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { delay(280); runCatching { focus.requestFocus() } }

    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        Spacer(Modifier.height(46.dp))
        Text(title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, color = Light.ink)
        Spacer(Modifier.height(6.dp))
        Text(subtitle, fontFamily = Outfit, fontSize = 11.5.sp, color = Light.soft, lineHeight = 17.sp)
        Spacer(Modifier.height(26.dp))

        // sechs Kästchen
        Box {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                repeat(fieldSize) { i ->
                    val filled = i < value.length
                    val active = i == value.length
                    Box(
                        Modifier.weight(1f).height(56.dp).clip(RoundedCornerShape(13.dp))
                            .background(Color.White)
                            .border(
                                if (active) 2.dp else 1.dp,
                                if (active) Light.pink else if (filled) Light.pink.copy(alpha = 0.45f) else Light.line,
                                RoundedCornerShape(13.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (filled) value[i].toString() else "",
                            fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Light.ink,
                        )
                    }
                }
            }
            // unsichtbares Eingabefeld über den Kästchen
            BasicTextField(
                value = value,
                onValueChange = onValue,
                modifier = Modifier.fillMaxWidth().height(56.dp).alpha(0.01f).focusRequester(focus),
                textStyle = TextStyle(fontSize = 1.sp),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                cursorBrush = SolidColor(Color.Transparent),
            )
        }

        if (error.isNotEmpty()) { Spacer(Modifier.height(12.dp)); ObError(error) }
        if (info.isNotEmpty()) { Spacer(Modifier.height(12.dp)); ObInfo(info) }

        Spacer(Modifier.height(16.dp))
        // Auto-Weiter, sobald 6 Ziffern stehen
        LaunchedEffect(value) {
            if (value.length == fieldSize) { delay(160); onNext() }
        }

        Spacer(Modifier.weight(1f))
        ObButton("Bestätigen", enabled = value.length == fieldSize, busy = busy, onClick = onNext)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Box(Modifier.clickable { onBack() }.padding(10.dp)) {
                Text("Zurück", fontFamily = Outfit, fontSize = 11.5.sp, color = Light.soft)
            }
            Box(Modifier.clickable { if (!busy) onResend() }.padding(10.dp)) {
                Text("Neu schicken", fontFamily = Outfit, fontSize = 11.5.sp, color = Light.pink, fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(18.dp))
    }
}

@Composable
private fun StepProfile(
    username: String, onUsername: (String) -> Unit,
    displayName: String, onDisplayName: (String) -> Unit,
    avatar: String, onAvatar: (String) -> Unit,
    error: String, busy: Boolean, onNext: () -> Unit,
) {
    val avatars = listOf("🦊", "💗", "🌸", "🐱", "🌙", "🎧", "🍓", "👾", "🦋", "☁️")

    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        Spacer(Modifier.height(46.dp))
        Text("Dein Profil", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, color = Light.ink)
        Spacer(Modifier.height(6.dp))
        Text("So sehen dich die anderen.", fontFamily = Outfit, fontSize = 11.5.sp, color = Light.soft)

        Spacer(Modifier.height(22.dp))

        // rundes Bild mit Glow, wie bei WhatsApp der Kreis oben
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(104.dp).clip(CircleShape)
                    .background(Light.pinkBrush)
                    .border(3.dp, Color.White, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Text(avatar, fontSize = 44.sp) }
        }

        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            avatars.take(5).forEach { a -> AvatarDot(a, a == avatar) { onAvatar(a) } }
        }
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            avatars.drop(5).forEach { a -> AvatarDot(a, a == avatar) { onAvatar(a) } }
        }

        Spacer(Modifier.height(22.dp))
        ObField("Anzeigename", displayName, onDisplayName, "Maxi")
        Spacer(Modifier.height(10.dp))
        ObField("Kontoname", username, onUsername, "maxi_m")
        Spacer(Modifier.height(6.dp))
        Text("a–z, 0–9 und _ · 3–20 Zeichen · später änderbar",
            fontFamily = Outfit, fontSize = 9.5.sp, color = Light.soft)

        if (error.isNotEmpty()) { Spacer(Modifier.height(10.dp)); ObError(error) }

        Spacer(Modifier.weight(1f))
        ObButton("Weiter", enabled = username.length >= 3 && displayName.length >= 2, busy = busy, onClick = onNext)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AvatarDot(a: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(46.dp).clip(CircleShape)
            .background(if (selected) Light.pinkSoft else Color.White)
            .border(if (selected) 2.dp else 1.dp, if (selected) Light.pink else Light.line, CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(a, fontSize = 20.sp) }
}

@Composable
private fun StepEmail(
    email: String, onEmail: (String) -> Unit,
    error: String, busy: Boolean, info: String,
    onSkipNote: () -> Unit, onNext: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        Spacer(Modifier.height(46.dp))
        Text("E-Mail zum Wiederherstellen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
            fontSize = 23.sp, color = Light.ink, lineHeight = 29.sp)
        Spacer(Modifier.height(8.dp))
        Text(
            "Handy weg, App gelöscht, Akku kaputt — passiert. Mit dieser Adresse " +
                "kommst du wieder rein. Ohne sie ist dein Konto weg, wenn dein Handy weg ist.",
            fontFamily = Outfit, fontSize = 11.5.sp, color = Light.soft, lineHeight = 17.sp,
        )
        Spacer(Modifier.height(24.dp))
        ObField("deine@mail.de", email, onEmail, "name@beispiel.de")

        if (error.isNotEmpty()) { Spacer(Modifier.height(10.dp)); ObError(error) }
        if (info.isNotEmpty()) { Spacer(Modifier.height(10.dp)); ObInfo(info) }

        Spacer(Modifier.height(12.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
                .background(Light.pinkSoft.copy(alpha = 0.5f)).padding(12.dp),
        ) {
            Text(
                "Wir schicken dir einen 6-stelligen Code von contact@maxichen.de. " +
                    "MaxiChen fragt nie nach deinem Passwort und nie nach diesem Code.",
                fontFamily = Outfit, fontSize = 10.sp, color = Light.ink.copy(alpha = 0.75f), lineHeight = 15.sp,
            )
        }

        Spacer(Modifier.weight(1f))
        ObButton("Code per E-Mail", enabled = email.contains("@") && email.contains("."), busy = busy, onClick = onNext)
        Spacer(Modifier.height(10.dp))
        ObGhost("Warum brauche ich das?", onSkipNote)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun StepDone(name: String, avatar: String) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(120.dp))
        Box(
            Modifier.size(96.dp).clip(CircleShape).background(Light.pinkBrush)
                .border(3.dp, Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text(avatar, fontSize = 42.sp) }
        Spacer(Modifier.height(22.dp))
        Text("Willkommen, " + name.ifEmpty { "du" } + " 💗", fontFamily = Outfit,
            fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, color = Light.ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text("Dein Konto ist bestätigt. Nummer ✓  E-Mail ✓",
            fontFamily = Outfit, fontSize = 12.sp, color = Light.green)
    }
}

/* ---------------- kleine Bausteine ---------------- */

@Composable
private fun ObButton(label: String, enabled: Boolean, busy: Boolean, onClick: () -> Unit) {
    val bg = if (enabled && !busy) Light.pinkBrush else SolidColor(Color(0xFFF0E3EA))
    Box(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(17.dp)).background(bg)
            .clickable(enabled = enabled && !busy) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (busy) "…" else label,
            fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            color = if (enabled && !busy) Color.White else Light.soft,
        )
    }
}

@Composable
private fun ObGhost(label: String, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(15.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(label, fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = Light.soft) }
}

@Composable
private fun ObField(label: String, value: String, onChange: (String) -> Unit, hint: String) {
    Column {
        Text(label, fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, color = Light.soft)
        Spacer(Modifier.height(5.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(Color.White)
                .border(1.dp, Light.line, RoundedCornerShape(15.dp))
                .padding(horizontal = 15.dp, vertical = 15.dp),
        ) {
            if (value.isEmpty()) Text(hint, fontFamily = Outfit, fontSize = 14.sp, color = Light.line)
            BasicTextField(
                value = value, onValueChange = onChange, singleLine = true,
                textStyle = TextStyle(fontFamily = Outfit, fontSize = 14.sp, color = Light.ink, fontWeight = FontWeight.SemiBold),
                cursorBrush = SolidColor(Light.pink),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ObError(msg: String) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Light.danger.copy(alpha = 0.10f))
            .border(1.dp, Light.danger.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(11.dp),
    ) {
        Text(msg, fontFamily = Outfit, fontSize = 10.5.sp, color = Light.danger, lineHeight = 15.sp)
    }
}

@Composable
private fun ObInfo(msg: String) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Light.green.copy(alpha = 0.10f)).padding(11.dp),
    ) {
        Text(msg, fontFamily = Outfit, fontSize = 10.5.sp, color = Light.green, lineHeight = 15.sp)
    }
}
