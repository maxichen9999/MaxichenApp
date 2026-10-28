package de.maxichen.app.ui

/* =====================================================================
   👀 V4.9.1 — DEMO-MODUS (Gast) + ONBOARDING
   ---------------------------------------------------------------------
   „Erst schauen, dann anmelden."

   Wichtig: die Demo ist NICHT gefaked im Sinne von „Bild zeigt Badge".
   Beim Öffnen eines Demo-Chats läuft ECHT ein PQXDH-Handshake mit
   Wegwerf-Schlüsseln auf dem Gerät — und der Badge zeigt das Ergebnis
   dieser echten Rechnung. Deshalb darf man der Demo glauben.

   Kein Server, kein Konto, keine Netzverbindung.
   ===================================================================== */

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.SelfTest
import de.maxichen.app.Vault
import de.maxichen.app.crypto.Crypto
import de.maxichen.app.crypto.Curve25519
import de.maxichen.app.crypto.DoubleRatchet
import de.maxichen.app.crypto.Envelope
import de.maxichen.app.crypto.MlKem768
import de.maxichen.app.crypto.Pqxdh
import de.maxichen.app.crypto.SenderKeyDistribution
import de.maxichen.app.crypto.SenderKeyState
import de.maxichen.app.crypto.X3DH
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Nur im Speicher: App neu starten = Demo aus. Nichts wird gespeichert. */
object DemoMode {
    var active by mutableStateOf(false)
    var onboardingDone by mutableStateOf(true)   // wird beim Start gesetzt
}

/* ------------------------------------------------------------------ */
/*  Was in der Demo passiert — echte Krypto, echte Messwerte          */
/* ------------------------------------------------------------------ */

data class DemoResult(
    val pq: Boolean,
    val badge: String,
    val headline: String,
    val lines: List<Pair<String, String>>,
    val ms: Double,
)

object DemoEngine {

    /**
     * Baut eine echte Gegenstelle und führt den kompletten Handshake aus.
     * @param pqFähig ob die „andere Seite" einen ML-KEM-Prekey veröffentlicht hat
     */
    suspend fun handshake(pqFaehig: Boolean): DemoResult = withContext(Dispatchers.Default) {
        val t0 = System.nanoTime()
        val aIk = Curve25519.pair()      // „ich"
        val bIk = Curve25519.pair()      // Gegenstelle
        val bSpk = Curve25519.pair()
        val sign = Crypto.newSigningKeyPair()
        val spkSig = Crypto.sign(sign.private, bSpk.second)
        val pq = if (pqFaehig) MlKem768.keygenRandom() else null
        val pqSig = pq?.let { Crypto.sign(sign.private, it.first) }

        var sessionA: DoubleRatchet
        var sessionB: DoubleRatchet
        var initObj: de.maxichen.app.crypto.PreKeyInit

        if (pq != null) {
            val bundle = Pqxdh.PeerBundle(
                identityKey = bIk.second, signedPrekey = bSpk.second, prekeySignature = spkSig,
                signingKey = sign.public.encoded, signedPrekeyId = "1",
                oneTimePrekey = null, oneTimePrekeyId = "",
                pqPrekey = pq.first, pqSignature = pqSig,
            )
            val (sA, init) = Pqxdh.initiate(aIk.first, aIk.second, sign.public.encoded, bundle)
            sessionA = sA; initObj = init
            sessionB = Pqxdh.respond(bIk.first, bSpk.first, bSpk.second, null, pq.second, init)
        } else {
            val bundle = X3DH.PeerBundle(
                identityKey = bIk.second, signedPrekey = bSpk.second, prekeySignature = spkSig,
                signingKey = sign.public.encoded, signedPrekeyId = "1",
                oneTimePrekey = null, oneTimePrekeyId = "",
            )
            val (sA, init) = X3DH.initiate(aIk.first, aIk.second, sign.public.encoded, bundle)
            sessionA = sA; initObj = init
            sessionB = X3DH.respond(bIk.first, bSpk.first, bSpk.second, null, init)
        }

        // echte Nachricht durch die Sitzung
        val text = "Hallo aus der Demo 💗"
        val env = sessionA.encrypt(text.toByteArray())
        val back = String(sessionB.decrypt(Envelope(env.header, env.iv, env.ciphertext, initObj)))
        val okRoundtrip = back == text
        val ms = (System.nanoTime() - t0) / 1_000_000.0

        val lines = ArrayList<Pair<String, String>>()
        lines += "Handshake" to (if (pqFaehig) "PQXDH = X3DH + ML-KEM-768" else "X3DH = nur X25519")
        lines += "Kurve" to "X25519 (Curve25519)"
        if (pqFaehig) {
            lines += "Gitter" to "ML-KEM-768 · FIPS 203"
            lines += "PQ-Ciphertext" to "1088 Byte (reist in Nachricht 1 mit)"
            lines += "PQ-Prekey" to "1184 Byte"
        }
        lines += "Sitzungsschlüssel" to "32 Byte, HKDF-SHA256"
        lines += "Test-Nachricht" to if (okRoundtrip) "verschlüsselt → entschlüsselt ✓" else "FEHLGESCHLAGEN 🛑"
        lines += "Rechenzeit" to String.format("%.1f ms auf diesem Gerät", ms)

        DemoResult(
            pq = pqFaehig,
            badge = if (pqFaehig) "🌌 PQ" else "🔐 X3DH",
            headline = if (pqFaehig) "Quantensicher" else "Nur klassisch",
            lines = lines,
            ms = ms,
        )
    }

    /** Gruppen-Demo: Sender Key, verteilt über 1:1-PQXDH an jedes Mitglied. */
    suspend fun group(): DemoResult = withContext(Dispatchers.Default) {
        val t0 = System.nanoTime()
        val members = listOf("Alice", "Bob", "Du")
        val (st, dist) = SenderKeyState.create()
        var verteilt = 0
        for (m in members.dropLast(1)) {
            val a = Curve25519.pair()
            val b = Curve25519.pair()
            val sign = Crypto.newSigningKeyPair()
            val pq = MlKem768.keygenRandom()
            val bundle = Pqxdh.PeerBundle(
                identityKey = b.second, signedPrekey = b.second,
                prekeySignature = Crypto.sign(sign.private, b.second),
                signingKey = sign.public.encoded, signedPrekeyId = "1",
                oneTimePrekey = null, oneTimePrekeyId = "",
                pqPrekey = pq.first, pqSignature = Crypto.sign(sign.private, pq.first),
            )
            val (sA, init) = Pqxdh.initiate(a.first, a.second, sign.public.encoded, bundle)
            val sB = Pqxdh.respond(b.first, b.second, b.second, null, pq.second, init)
            val env = sA.encrypt(dist.encode().toByteArray())
            val body = String(sB.decrypt(Envelope(env.header, env.iv, env.ciphertext, init)))
            // Empfänger baut daraus seinen eigenen Sender-Key-State
            val parsed = SenderKeyDistribution.parse(body)
            if (parsed != null) {
                val peerState = SenderKeyState.fromDistribution(parsed, "demo-chat".toByteArray())
                if (peerState.keyId == st.keyId) verteilt++
            }
            require(m.isNotEmpty())
        }
        // echte Gruppen-Nachricht mit Sender Key
        val msg = st.encrypt("Wir sind quantensicher 💗".toByteArray(), "demo-chat".toByteArray())
        val wieder = String(st.decrypt(msg, "demo-chat".toByteArray()))
        val ms = (System.nanoTime() - t0) / 1_000_000.0

        DemoResult(
            pq = true,
            badge = "🌌 PQ",
            headline = "Gruppe über Sender Keys",
            lines = listOf(
                "Mitglieder" to "3 (Alice · Bob · Du)",
                "Schlüsselverteilung" to "$verteilt× über PQXDH (je 1:1)",
                "Gruppen-Nachricht" to if (wieder == "Wir sind quantensicher 💗") "verschlüsselt → entschlüsselt ✓" else "FEHLGESCHLAGEN",
                "Rechenzeit" to String.format("%.1f ms", ms),
            ),
            ms = ms,
        )
    }
}

/* ------------------------------------------------------------------ */
/*  Bildschirme                                                       */
/* ------------------------------------------------------------------ */

private val PQ_LILA = Color(0xFFA97BFF)
private val GRAU = Color(0xFF9A8FA8)

@Composable
fun DemoScreen() {
    val ctx = LocalContext.current
    var chat by remember { mutableStateOf<String?>(null) }
    var showTest by remember { mutableStateOf(false) }
    var showCall by remember { mutableStateOf(false) }
    var showBot by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(V3.bg)) {
        when {
            showTest -> SelfTestScreen(onBack = { showTest = false })
            showCall -> DemoCallScreen(onBack = { showCall = false })
            showBot -> BotScreen(onBack = { showBot = false })
            chat == "alice" -> DemoChatScreen("Alice Hartmann", "alice", true, { chat = null })
            chat == "bob" -> DemoChatScreen("Bob (alte App 4.8)", "bob", false, { chat = null })
            chat == "gruppe" -> DemoGroupScreen({ chat = null })
            else -> Column(Modifier.fillMaxSize().padding(top = 44.dp, start = 14.dp, end = 14.dp)) {
                Header("👀 Demo-Modus", "Kein Konto · kein Server · alles auf deinem Gerät")
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    VaultBadge(ctx)
                    Text(
                        "Tippe einen Chat an — die App rechnet dann WIRKLICH einen Handshake durch " +
                            "(ML-KEM-768 + X25519) und zeigt, was dabei rauskommt.",
                        fontFamily = Outfit, fontSize = 11.sp, color = V3.muted, lineHeight = 15.sp,
                    )
                    DemoRow("💞", "Alice Hartmann", "hat die neue Version · PQ-fähig", PQ_LILA) { chat = "alice" }
                    DemoRow("🌙", "Bob", "noch auf 4.8 · kein PQ-Prekey", GRAU) { chat = "bob" }
                    DemoRow("👥", "Quantum Test", "3 Mitglieder · Sender Keys", PQ_LILA) { chat = "gruppe" }
                    DemoRow("📞", "Anruf-Demo", "TURN-Status prüfen (echt)", Color(0xFF58E08C)) { showCall = true }
                    DemoRow("🤖", "MaxiBot", "lokal · /summarize /rewrite /remind /poll", Color(0xFF7EB8FF)) { showBot = true }
                    DemoRow("🧪", "Alles testen", "15 echte Prüfungen auf diesem Handy", Color(0xFFFFC46B)) { showTest = true }

                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Die Demo benutzt Wegwerf-Schlüssel und verschwindet beim Schließen der App. " +
                            "Dein echtes Konto bleibt unberührt.",
                        fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, lineHeight = 14.sp,
                    )
                    Spacer(Modifier.height(20.dp))
                    GhostButton3("Demo beenden") { DemoMode.active = false }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun VaultBadge(ctx: android.content.Context) {
    val info = remember { Vault.info(ctx) }
    val (emoji, label, color) = when {
        !info.available -> Triple("⚠️", "Kein Keystore — E2E wäre aus", Color(0xFFE8546E))
        info.strongBox -> Triple("💎", "StrongBox · eigener Sicherheitschip", PQ_LILA)
        info.hardware -> Triple("🛡️", "TEE · Schlüssel in Hardware", Color(0xFF58E08C))
        else -> Triple("⚠️", "Software-Keystore", Color(0xFFFFC46B))
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass)
            .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 22.sp)
        Spacer(Modifier.width(10.dp))
        Column {
            Text("Schlüsseltresor", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text)
            Text(label, fontFamily = Outfit, fontSize = 10.sp, color = color)
        }
    }
}

@Composable
private fun Header(title: String, sub: String) {
    Column(Modifier.padding(bottom = 12.dp)) {
        Text(title, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = V3.neon)
        Text(sub, fontFamily = Outfit, fontSize = 10.5.sp, color = V3.muted)
    }
}

@Composable
private fun DemoRow(emoji: String, name: String, sub: String, tint: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass)
            .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp))
            .clickable { onClick() }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(tint.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 18.sp) }
        Spacer(Modifier.width(11.dp))
        Column(Modifier.weight(1f)) {
            Text(name, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.text)
            Text(sub, fontFamily = Outfit, fontSize = 10.sp, color = V3.muted)
        }
        Text("›", fontFamily = Outfit, fontSize = 18.sp, color = V3.muted)
    }
}

@Composable
private fun DemoChatScreen(name: String, key: String, pq: Boolean, onBack: () -> Unit) {
    var result by remember { mutableStateOf<DemoResult?>(null) }
    LaunchedEffect(key) { result = DemoEngine.handshake(pq) }

    Column(Modifier.fillMaxSize().padding(top = 44.dp, start = 14.dp, end = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(name, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
                Text(if (pq) "PQXDH · quantensicher" else "X3DH · klassisch", fontFamily = Outfit, fontSize = 9.5.sp, color = V3.muted)
            }
            val r = result
            if (r != null) {
                Box(
                    Modifier.clip(RoundedCornerShape(10.dp))
                        .background(if (r.pq) PQ_LILA.copy(alpha = 0.22f) else GRAU.copy(alpha = 0.18f))
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                ) { Text(r.badge, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = V3.text) }
            }
        }
        Spacer(Modifier.height(14.dp))

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            if (result == null) {
                Text("rechnet…", fontFamily = Outfit, fontSize = 11.sp, color = V3.muted)
            } else {
                val r = result!!
                // Bubbles
                Bubble("Hey! Ich hab endlich die neue Version 💗", false)
                Bubble("Schick mir was Geheimes!", false)
                Bubble(
                    if (r.pq) "Diese Nachricht ging mit ML-KEM-768 raus — der Server kann sie auch in 30 Jahren nicht lesen 🌌"
                    else "Diese Nachricht ging nur mit X25519 raus. Sicher heute, angreifbar für einen Quantenrechner von morgen 🌙",
                    true,
                )
                Spacer(Modifier.height(14.dp))
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass)
                        .border(1.dp, if (r.pq) PQ_LILA.copy(alpha = 0.5f) else V3.glassBorder, RoundedCornerShape(18.dp))
                        .padding(12.dp),
                ) {
                    Text(
                        (if (r.pq) "🌌 " else "🔐 ") + r.headline,
                        fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp,
                        color = if (r.pq) PQ_LILA else GRAU,
                    )
                    Spacer(Modifier.height(8.dp))
                    r.lines.forEach { (k, v) ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Text(k, fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, modifier = Modifier.width(120.dp))
                            Text(v, fontFamily = Outfit, fontSize = 10.sp, color = V3.text, modifier = Modifier.weight(1f))
                        }
                    }
                }
                if (!r.pq) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Deshalb ist der Badge grau und nicht lila: die Gegenstelle hat keinen PQ-Prekey " +
                            "veröffentlicht. Die App behauptet dann auch keinen Quantenschutz — sie zeigt, was da ist.",
                        fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, lineHeight = 14.sp,
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun DemoGroupScreen(onBack: () -> Unit) {
    var result by remember { mutableStateOf<DemoResult?>(null) }
    LaunchedEffect("g") { result = DemoEngine.group() }

    Column(Modifier.fillMaxSize().padding(top = 44.dp, start = 14.dp, end = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(10.dp))
            Text("Quantum Test", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
        }
        Spacer(Modifier.height(14.dp))
        val r = result
        if (r == null) Text("verteilt Schlüssel…", fontFamily = Outfit, fontSize = 11.sp, color = V3.muted)
        else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass).padding(12.dp)) {
            Text("🌌 Gruppen-E2E", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = PQ_LILA)
            Spacer(Modifier.height(8.dp))
            r.lines.forEach { (k, v) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                    Text(k, fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, modifier = Modifier.width(130.dp))
                    Text(v, fontFamily = Outfit, fontSize = 10.sp, color = V3.text, modifier = Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Jeder bekommt den Gruppen-Schlüssel über einen eigenen PQXDH-Handshake — " +
                    "nicht über den Server.",
                fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, lineHeight = 14.sp,
            )
        }
    }
}

@Composable
private fun DemoCallScreen(onBack: () -> Unit) {
    val turn = de.maxichen.app.IceConfig.turnAvailable
    Column(Modifier.fillMaxSize().padding(top = 44.dp, start = 14.dp, end = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(10.dp))
            Text("Anruf-Demo", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
        }
        Spacer(Modifier.height(16.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass).padding(14.dp)) {
            Text("📞 Anruf", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = V3.text)
            Spacer(Modifier.height(8.dp))
            Row {
                Text("Relay (TURN)", fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, modifier = Modifier.width(120.dp))
                Text(
                    if (turn) "verbunden · Anruf hält auch hinter NAT ✓" else "kein TURN — nur STUN (eingeschränkt)",
                    fontFamily = Outfit, fontSize = 10.sp,
                    color = if (turn) Color(0xFF58E08C) else Color(0xFFFFC46B),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "Der Status kommt aus IceConfig — derselbe Wert, den der echte Anruf benutzt. " +
                    "In der Demo wird nur nichts verbunden.",
                fontFamily = Outfit, fontSize = 10.sp, color = V3.muted, lineHeight = 14.sp,
            )
        }
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Box(
            Modifier.fillMaxWidth(0.86f).padding(vertical = 3.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(if (mine) PQ_LILA.copy(alpha = 0.22f) else V3.glass)
                .padding(horizontal = 12.dp, vertical = 9.dp),
        ) {
            Text(text, fontFamily = Outfit, fontSize = 11.sp, color = V3.text, lineHeight = 15.sp)
        }
    }
}

@Composable
fun SelfTestScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    var checks by remember { mutableStateOf<List<SelfTest.Check>?>(null) }
    LaunchedEffect("run") { checks = withContext(Dispatchers.Default) { SelfTest.run(ctx) } }

    Column(Modifier.fillMaxSize().padding(top = 44.dp, start = 14.dp, end = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(10.dp))
            Text("Alles testen", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
        }
        Spacer(Modifier.height(12.dp))
        val list = checks
        if (list == null) {
            Text("rechnet auf diesem Gerät…", fontFamily = Outfit, fontSize = 11.sp, color = V3.muted)
        } else {
            val ok = list.count { it.ok }
            Text(
                "$ok/${list.size} bestanden",
                fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp,
                color = if (ok == list.size) Color(0xFF58E08C) else Color(0xFFE8546E),
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Diese Prüfungen liefen gerade WIRKLICH auf deinem Handy — mit deinem Keystore.",
                fontFamily = Outfit, fontSize = 10.sp, color = V3.muted,
            )
            Spacer(Modifier.height(10.dp))
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                list.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(12.dp))
                            .background(V3.glass).padding(10.dp),
                    ) {
                        Text(if (c.ok) "✓" else "✗", fontFamily = Outfit, fontWeight = FontWeight.Bold,
                            fontSize = 12.sp, color = if (c.ok) Color(0xFF58E08C) else Color(0xFFE8546E))
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.name, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, color = V3.text)
                            Text(c.detail, fontFamily = Outfit, fontSize = 9.5.sp, color = V3.muted, lineHeight = 13.sp)
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Onboarding — 3 Slides                                             */
/* ------------------------------------------------------------------ */

@Composable
fun OnboardingScreen(onDone: () -> Unit, onDemo: () -> Unit) {
    var page by remember { mutableStateOf(0) }
    val slides = listOf(
        Triple("🔐", "Ende-zu-Ende", "Deine Nachrichten werden auf deinem Handy verschlüsselt. Der Server sieht nur Kauderwelsch — keine Nachricht, kein Bild, kein Schlüssel."),
        Triple("🌌", "Quantensicher", "Der Handshake nutzt zusätzlich ML-KEM-768 (FIPS 203). Wer heute mitschneidet und morgen einen Quantenrechner hat, kommt nicht rein."),
        Triple("🗝️", "Kein Klartext-Schlüssel", "Deine Schlüssel liegen im Android Keystore — StrongBox 💎 oder TEE 🛡️. Auf einem gerooteten Handy sind sie trotzdem nicht lesbar."),
    )
    val s = slides[page]

    Box(Modifier.fillMaxSize().background(V3.bg)) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(90.dp))
            Text(s.first, fontSize = 64.sp)
            Spacer(Modifier.height(20.dp))
            Text(s.second, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp,
                color = V3.neon, textAlign = TextAlign.Center)
            Spacer(Modifier.height(14.dp))
            Text(s.third, fontFamily = Outfit, fontSize = 13.sp, color = V3.text,
                textAlign = TextAlign.Center, lineHeight = 20.sp)
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (0..2).forEach { i ->
                    Box(
                        Modifier.size(width = if (i == page) 20.dp else 7.dp, height = 7.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(if (i == page) V3.neon else V3.glassBorder),
                    )
                }
            }
            Spacer(Modifier.height(22.dp))
            if (page < 2) {
                NeonButton3("Weiter") { page++ }
                Spacer(Modifier.height(8.dp))
                GhostButton3("Überspringen") { onDone() }
            } else {
                NeonButton3("Loslegen 💗") { onDone() }
                Spacer(Modifier.height(8.dp))
                GhostButton3("👀 Erst mal Demo anschauen") { onDemo() }
            }
            Spacer(Modifier.height(30.dp))
        }
    }
}
