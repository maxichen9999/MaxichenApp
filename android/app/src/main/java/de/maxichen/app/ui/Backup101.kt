package de.maxichen.app.ui

/* =====================================================================
   💾 V4.10 — Backup-Bildschirm
   ---------------------------------------------------------------------
   Drei ehrliche Warnungen, bevor irgendwas passiert:
     · Das Passwort ist der einzige Schlüssel — weg ist weg.
     · Die Datei enthält deine privaten Schlüssel (anders geht Restore
       nach Gerätewechsel nicht).
     · Sie ist nur so stark wie das Passwort.

   Und ein Versprechen, das eingehalten wird: die Datei prüft sich nach
   dem Schreiben selbst. Steht hier „Selbstprüfung ✓", hat die App sie
   wirklich wieder geöffnet und verglichen.
   ===================================================================== */

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.BackupService
import de.maxichen.app.Hub
import de.maxichen.app.crypto.Backup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun BackupScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var withMessages by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<BackupService.ExportResult?>(null) }
    var info by remember { mutableStateOf("") }
    var restoreInfo by remember { mutableStateOf("") }

    // 🔻 Export: Datei-Ziel wählen (SAF — keine Speicher-Berechtigung nötig)
    val createDoc = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri: Uri? ->
        val r = result
        if (uri == null || r == null) { busy = false; return@rememberLauncherForActivityResult }
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    ctx.contentResolver.openOutputStream(uri)?.use { it.write(r.bytes) }
                        ?: throw IllegalStateException("Ziel nicht beschreibbar")
                }
                info = "Gespeichert ✓ · ${BackupService.humanSize(r.bytes.size)} · Code ${r.fingerprint}"
                Hub.toast("💾", "Backup gespeichert", "Code ${r.fingerprint} — schreib ihn dir auf")
            } catch (t: Throwable) {
                info = "Speichern fehlgeschlagen: ${t.message}"
            }
            busy = false
        }
    }

    // 🔺 Restore: Datei auswählen und öffnen
    val openDoc = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        if (password.isEmpty()) { restoreInfo = "Erst das Backup-Passwort oben eingeben"; return@rememberLauncherForActivityResult }
        busy = true
        scope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) {
                    ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw IllegalStateException("Datei nicht lesbar")
                }
                val r = withContext(Dispatchers.Default) {
                    BackupService.restore(ctx, bytes, password.toCharArray())
                }
                restoreInfo = "Wiederhergestellt ✓ · ${r.secrets} Geheimnisse · ${r.chats} Chats" +
                    if (r.account.isNotEmpty()) " · Konto ${r.account}" else ""
                Hub.toast("✅", "Backup wiederhergestellt", "${r.secrets} Schlüssel zurück im Tresor")
            } catch (t: Throwable) {
                restoreInfo = t.message ?: "Wiederherstellen fehlgeschlagen"
            }
            busy = false
        }
    }

    val pw = password.toCharArray()
    val score = if (password.isEmpty()) -1 else Backup.passwordScore(pw)

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        ScreenHeader("Backup", "Das Loch, das der Tresor aufgerissen hat", onBack)
        Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {

            /* ---------- Warum ---------- */
            LightCard {
                Text("🗝️ Warum das nötig ist", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText(
                    "Seit V4.8 liegt dein privater Schlüssel im Android Keystore. Der lässt sich nicht " +
                        "exportieren — gut gegen Root, schlecht beim Handywechsel: ohne Backup wären alte " +
                        "Nachrichten für immer weg. Diese Datei ist der Gegenzug.",
                    10.5f, 6,
                )
            }

            Spacer(Modifier.height(10.dp))

            /* ---------- Export ---------- */
            LightCard {
                Text("💾 Backup erstellen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText("PBKDF2-SHA256 (310.000 Runden) → AES-256-GCM · Dateiendung .mcbk", 9.5f, 2)
                Spacer(Modifier.height(10.dp))

                V2TextField(password, { password = it }, "Backup-Passwort", password = true, leading = "🔑")
                if (score >= 0) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            (0..3).forEach { i ->
                                Box(
                                    Modifier.width(22.dp).height(4.dp).clip(RoundedCornerShape(2.dp))
                                        .background(
                                            if (i < score) when (score) {
                                                1 -> Light.danger
                                                2 -> Light.gold
                                                else -> Light.green
                                            } else Light.line,
                                        ),
                                )
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        SoftText(Backup.passwordHint(pw), 9.5f, 1)
                    }
                }
                Spacer(Modifier.height(8.dp))
                V2TextField(confirm, { confirm = it }, "Passwort wiederholen", password = true, leading = "🔁")
                Spacer(Modifier.height(8.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.width(38.dp).height(22.dp).clip(RoundedCornerShape(11.dp))
                            .background(if (withMessages) Light.pink.copy(alpha = 0.85f) else Light.line)
                            .clickable { withMessages = !withMessages },
                        contentAlignment = if (withMessages) Alignment.CenterEnd else Alignment.CenterStart,
                    ) {
                        Box(Modifier.padding(3.dp).width(16.dp).height(16.dp)
                            .clip(RoundedCornerShape(8.dp)).background(Light.card))
                    }
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("Chat-Verlauf mitnehmen", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Light.ink)
                        SoftText(if (withMessages) "alte Nachrichten bleiben nach dem Restore lesbar" else "nur Schlüssel — Verlauf weg", 9.5f, 1)
                    }
                }

                Spacer(Modifier.height(10.dp))
                LightButton(if (busy) "rechnet…" else "Backup erstellen 💾") {
                    if (busy) return@LightButton
                    if (password.length < 8) { info = "Passwort mindestens 8 Zeichen"; return@LightButton }
                    if (password != confirm) { info = "Die zwei Passwörter sind nicht gleich"; return@LightButton }
                    busy = true; info = ""; result = null
                    scope.launch {
                        try {
                            val user = Hub.user.value
                            val r = withContext(Dispatchers.Default) {
                                BackupService.export(
                                    ctx, password.toCharArray(), withMessages,
                                    user?.id ?: "", user?.username ?: "", user?.displayName ?: "",
                                )
                            }
                            result = r
                            if (!r.selfCheckOk) {
                                info = "Die Datei ließ sich NICHT wieder öffnen — nicht verwenden 🛑"
                                busy = false
                            } else {
                                info = "${r.secrets} Geheimnisse · ${r.chats} Chats · ${BackupService.humanSize(r.bytes.size)} · Selbstprüfung ✓"
                                createDoc.launch(BackupService.fileName())
                            }
                        } catch (t: Throwable) {
                            info = t.message ?: "Backup fehlgeschlagen"
                            busy = false
                        }
                    }
                }

                if (info.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    SoftText(info, 10f, 4)
                }

                result?.let { r ->
                    if (r.selfCheckOk) {
                        Spacer(Modifier.height(8.dp))
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(Light.pinkSoft).padding(10.dp),
                        ) {
                            Column {
                                Text("Code ${r.fingerprint}", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold,
                                    fontSize = 14.sp, color = Light.pink)
                                Spacer(Modifier.height(2.dp))
                                SoftText("Schreib den Code auf den Zettel mit dem Passwort. Beim Wiederherstellen zeigt die App ihn wieder — dann weißt du, dass es die richtige Datei ist.", 9.5f, 3)
                                Spacer(Modifier.height(4.dp))
                                SoftText("SHA-256: " + r.sha256.take(32) + "…", 8.5f, 2)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            /* ---------- Restore ---------- */
            LightCard {
                Text("♻️ Backup wiederherstellen", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Light.ink)
                Spacer(Modifier.height(4.dp))
                SoftText("Datei auswählen — die Schlüssel werden in den Tresor DIESES Geräts gelegt.", 10f, 2)
                Spacer(Modifier.height(8.dp))
                LightGhost(if (busy) "wartet…" else "📂 Datei auswählen") {
                    if (busy) return@LightGhost
                    if (password.isEmpty()) { restoreInfo = "Erst das Backup-Passwort oben eingeben"; return@LightGhost }
                    openDoc.launch(arrayOf("*/*"))
                }
                if (restoreInfo.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    SoftText(restoreInfo, 10f, 4)
                }
            }

            Spacer(Modifier.height(10.dp))

            /* ---------- Die ehrlichen Warnungen ---------- */
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(Light.card).border(1.dp, Light.gold.copy(alpha = 0.45f), RoundedCornerShape(18.dp))
                    .padding(14.dp),
            ) {
                Column {
                    Text("⚠️ Drei Dinge, die du wissen musst", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, color = Light.gold)
                    Spacer(Modifier.height(6.dp))
                    SoftText(
                        "1 · Das Passwort ist der einzige Schlüssel. Die App speichert es nirgends, der Server " +
                            "sieht es nie. Vergessen = Datei für immer Müll. Auch wir können sie nicht öffnen.",
                        10f, 4,
                    )
                    Spacer(Modifier.height(5.dp))
                    SoftText(
                        "2 · Die Datei enthält deine PRIVATEN Schlüssel. Anders lässt sich nach einem " +
                            "Gerätewechsel nichts wiederherstellen. Wer Datei + Passwort hat, ist du.",
                        10f, 4,
                    )
                    Spacer(Modifier.height(5.dp))
                    SoftText(
                        "3 · Anders als der Keystore ist die Datei nicht hardwaregeschützt. Sie ist genau so " +
                            "stark wie dein Passwort. Nimm 12+ Zeichen — oder vier Wörter.",
                        10f, 4,
                    )
                    Spacer(Modifier.height(8.dp))
                    SoftText(
                        "Tipp: Backup auf einen USB-Stick oder in einen Passwort-Manager — nicht in den " +
                            "gleichen Cloud-Ordner wie die Fotos.",
                        9.5f, 3,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}
