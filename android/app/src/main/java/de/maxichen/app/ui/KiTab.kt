package de.maxichen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch

/* =====================================================================
   💗 LOVEAI — KI-Tab
   ===================================================================== */

@Composable
fun KiTab2(activeChatId: String, onBack: () -> Unit) {
    val msgs = remember { mutableStateListOf<AiService.AiMsg>() }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var showKey by remember { mutableStateOf(Hub.aiKey.isEmpty()) }
    var key by remember { mutableStateOf(Hub.aiKey) }
    var summary by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    if (msgs.isEmpty()) {
        msgs.add(AiService.AiMsg("assistant", "Hey 💗 Ich bin LoveAI. Frag mich was, lass dir helfen oder quatsch einfach mit mir ✨"))
    }

    LaunchedEffect(msgs.size) {
        if (msgs.isNotEmpty()) try { listState.animateScrollToItem(msgs.size - 1) } catch (e: Exception) {}
    }

    fun send() {
        val t = text.trim()
        if (t.isEmpty() || busy) return
        if (Hub.aiKey.isEmpty()) { showKey = true; Hub.toast("🔑", "API-Key fehlt", "Einmal eintragen"); return }
        msgs.add(AiService.AiMsg("user", t))
        text = ""
        busy = true
        scope.launch {
            try {
                val answer = AiService.chat(msgs.toList())
                msgs.add(AiService.AiMsg("assistant", answer))
            } catch (e: AiApiError) {
                msgs.add(AiService.AiMsg("assistant", "⚠️ " + (e.message ?: "Fehler")))
            } catch (e: Exception) {
                msgs.add(AiService.AiMsg("assistant", "⚠️ Keine Verbindung zur KI."))
            }
            busy = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(9.dp))
            Box(Modifier.size(34.dp).clip(CircleShape).background(V3.primaryBrush), contentAlignment = Alignment.Center) {
                Text("💗", fontSize = 16.sp)
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Title3("LoveAI", 19)
                Muted3(if (busy) "tippt…" else "deine KI · always here", 10, 1)
            }
            if (activeChatId.isNotEmpty()) {
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(V3.glass)
                        .border(1.dp, V3.glassBorder, RoundedCornerShape(50))
                        .clickable {
                            scope.launch {
                                try { summary = Api4.aiSummary(activeChatId); Hub.toast("✨", "Zusammenfassung", "unten lesen") }
                                catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                            }
                        }.padding(horizontal = 9.dp, vertical = 5.dp),
                ) { Text("✨ Summary", fontFamily = Outfit, fontSize = 9.sp, color = V3.neon, fontWeight = FontWeight.Bold) }
            }
            Spacer(Modifier.width(5.dp))
            Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(V3.glass).clickable { showKey = !showKey },
                contentAlignment = Alignment.Center) { Text("🔑", fontSize = 13.sp) }
        }

        if (showKey) {
            Spacer(Modifier.height(8.dp))
            GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                Text("KI-Zugang 🔑", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text)
                Spacer(Modifier.height(5.dp))
                Muted3("OpenAI-kompatibel · z. B. api.openai.com/v1", 9.5, 2)
                Spacer(Modifier.height(5.dp))
                V2TextField(key, { key = it }, "sk-…", minHeight = 44, password = true)
                Spacer(Modifier.height(5.dp))
                NeonButton3("Speichern") {
                    Hub.setAiSettings(key.trim(), Hub.aiUrl.ifEmpty { "https://api.openai.com/v1" })
                    showKey = false
                    Hub.toast("💗", "Gespeichert", "LoveAI ist bereit")
                }
            }
        }

        if (summary.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                Row {
                    Text("✨ Chat-Zusammenfassung", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, color = V3.gold)
                    Spacer(Modifier.weight(1f))
                    Text("✕", fontSize = 11.sp, color = V3.muted, modifier = Modifier.clickable { summary = "" })
                }
                Spacer(Modifier.height(3.dp))
                Text(summary, fontFamily = Outfit, fontSize = 11.sp, color = V3.text)
            }
        }

        Spacer(Modifier.height(8.dp))
        LazyColumn(
            Modifier.weight(1f), state = listState,
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            items(msgs.size) { i ->
                val m = msgs[i]
                val mine = m.role == "user"
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Box(
                        Modifier.widthIn(max = 300.dp).clip(
                            RoundedCornerShape(
                                topStart = 18.dp, topEnd = 18.dp,
                                bottomStart = if (mine) 18.dp else 5.dp,
                                bottomEnd = if (mine) 5.dp else 18.dp,
                            ),
                        )
                            .background(if (mine) V3.bubbleMine else androidx.compose.ui.graphics.SolidColor(Color(0x22FFFFFF)))
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp))
                            .padding(horizontal = 11.dp, vertical = 8.dp),
                    ) {
                        Text(m.text, fontFamily = Outfit, fontSize = 12.5.sp, color = V3.text)
                    }
                }
            }
            if (busy) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
                        Box(Modifier.clip(RoundedCornerShape(18.dp)).background(Color(0x22FFFFFF)).padding(12.dp)) { Spinner() }
                    }
                }
            }
            item { Spacer(Modifier.height(4.dp)) }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f).clip(RoundedCornerShape(22.dp)).background(V3.glass)
                .border(1.dp, V3.glassBorder, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp, vertical = 11.dp)) {
                if (text.isEmpty()) Text("Frag LoveAI… ✨", fontFamily = Outfit, fontSize = 13.sp, color = V3.muted.copy(alpha = 0.8f))
                BasicTextField(
                    value = text, onValueChange = { text = it }, maxLines = 4,
                    textStyle = TextStyle(fontFamily = Outfit, fontSize = 13.5.sp, color = V3.text),
                    cursorBrush = SolidColor(V3.neon),
                )
            }
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(44.dp).clip(CircleShape).background(V3.primaryBrush).clickable { send() },
                contentAlignment = Alignment.Center) { if (busy) Spinner(V3.ink) else Text("➤", fontSize = 16.sp, color = V3.ink) }
        }
        Spacer(Modifier.height(84.dp))
    }
}
