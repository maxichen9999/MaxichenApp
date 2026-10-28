package de.maxichen.app.ui

/* =====================================================================
   🎨 V4.11 — DESIGN-SCHIRM + MAXIBOT-SCHIRM
   ---------------------------------------------------------------------
   Der Design-Schirm zeigt die Paletten LIVE: tippst du „Midnight" an,
   ist der Schirm in dem Moment schon dunkel. Kein „Vorschau"-Bild, das
   lügt — du siehst das echte Theme auf echtem UI.
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.horizontalScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.Hub
import de.maxichen.app.bot.MaxiBot
import de.maxichen.app.theme.MaxiPalettes
import de.maxichen.app.theme.Palette

/* =====================================================================
   🎨 Design-Schirm
   ===================================================================== */

@Composable
fun DesignScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current

    Column(Modifier.fillMaxSize().background(Light.bg)) {
        ScreenHeader("Design", "Vier Themes · Material You · AMOLED", onBack)
        Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {

            // ---------- Live-Vorschau ----------
            LightCard {
                Text("So sieht es gerade aus", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, color = Light.soft)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(Light.pinkBrush),
                        contentAlignment = Alignment.Center,
                    ) { Text("💗", fontSize = 16.sp) }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Box(
                            Modifier.fillMaxWidth(0.7f).height(11.dp).clip(RoundedCornerShape(6.dp))
                                .background(Light.ink.copy(alpha = 0.85f)),
                        )
                        Spacer(Modifier.height(5.dp))
                        Box(
                            Modifier.fillMaxWidth(0.5f).height(8.dp).clip(RoundedCornerShape(4.dp))
                                .background(Light.soft.copy(alpha = 0.5f)),
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("💗", "🌚", "🌌", "📄").forEachIndexed { i, e ->
                        Box(
                            Modifier.size(30.dp).clip(RoundedCornerShape(9.dp))
                                .background(if (i == 0) Light.pink.copy(alpha = 0.18f) else Light.line),
                            contentAlignment = Alignment.Center,
                        ) { Text(e, fontSize = 13.sp) }
                    }
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(Light.pinkBrush)
                            .padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Senden", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Color.White) }
                }
            }

            Spacer(Modifier.height(12.dp))

            // ---------- Paletten ----------
            Text("Theme", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
            MaxiPalettes.ALL.forEach { p ->
                PaletteRow(p) { MaxiTheme.select(ctx, p.id) }
                Spacer(Modifier.height(7.dp))
            }

            Spacer(Modifier.height(8.dp))

            // ---------- Schalter ----------
            Text("Extras", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp,
                color = Light.soft, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
            LightCard {
                DesignToggleRow(
                    "🖤", "AMOLED-Schwarz",
                    if (MaxiTheme.palette.dark) "echtes Schwarz — spart Strom auf OLED"
                    else "nur bei dunklen Themes verfügbar",
                    MaxiTheme.amoled,
                ) { MaxiTheme.setAmoled(ctx, it) }
                Spacer(Modifier.height(12.dp))
                DesignToggleRow(
                    "🎨", "Material You",
                    "Akzentfarbe aus deinem Wallpaper (Android 12+)",
                    MaxiTheme.materialYou,
                ) { MaxiTheme.setMaterialYou(ctx, it) }
            }

            Spacer(Modifier.height(10.dp))
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(Light.pinkSoft).padding(12.dp),
            ) {
                Text(
                    "Ehrlich: Material You übernimmt nur den AKZENT (Pink → dein Systemton). " +
                        "Flächen und Text bleiben von uns — sonst hätte die App auf jedem Handy ein anderes " +
                        "Gesicht, und das Design wäre weg. Die Liquid-Glass-Bottom-Bar bleibt bei 0,15 Alpha, " +
                        "in jedem Theme.",
                    fontFamily = Outfit, fontSize = 9.5.sp, color = Light.ink, lineHeight = 13.sp,
                )
            }
            Spacer(Modifier.height(26.dp))
        }
    }
}

@Composable
private fun PaletteRow(p: Palette, onClick: () -> Unit) {
    val active = MaxiTheme.id == p.id
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
            .background(if (active) Light.pinkSoft else Light.card)
            .border(1.dp, if (active) Light.pink.copy(alpha = 0.55f) else Light.line, RoundedCornerShape(18.dp))
            .clickable { onClick() }
            .padding(11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Farbmuster: 4 Punkte der Palette
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                .background(Brush.linearGradient(listOf(Color(p.chrome.surface), Color(p.chrome.card))))
                .border(1.dp, Color(p.chrome.line), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                listOf(p.chrome.accent, p.chrome.accent2, p.chrome.onSurface).forEach {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(Color(it)))
                }
            }
        }
        Spacer(Modifier.width(11.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(p.emoji + " " + p.name, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Light.ink)
                if (active) {
                    Spacer(Modifier.width(6.dp))
                    Text("aktiv", fontFamily = Outfit, fontSize = 8.5.sp, color = Light.pink,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Light.card).padding(horizontal = 5.dp, vertical = 1.dp))
                }
            }
            Text(
                when (p.id) {
                    "pink" -> "das Original · soft, warm, kawaii"
                    "midnight" -> "edgy · fast schwarz, Neon-Pink"
                    "glass" -> "AMOLED · tiefes Lila, gläsern"
                    else -> "ruhig · creme, wenig Farbe"
                },
                fontFamily = Outfit, fontSize = 9.5.sp, color = Light.soft,
            )
        }
        // Kontrast als kleines echtes Maß
        val c = MaxiPalettes.contrast(p.chrome.onSurface, p.chrome.card)
        Text(
            "%.1f:1".format(c),
            fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 9.sp,
            color = if (c >= 7) Light.green else if (c >= 4.5) Light.gold else Light.danger,
        )
    }
}

@Composable
private fun DesignToggleRow(emoji: String, title: String, sub: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(emoji, fontSize = 18.sp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Light.ink)
            Text(sub, fontFamily = Outfit, fontSize = 9.5.sp, color = Light.soft, lineHeight = 12.sp)
        }
        Box(
            Modifier.width(42.dp).height(24.dp).clip(RoundedCornerShape(12.dp))
                .background(if (on) Light.pink.copy(alpha = 0.9f) else Light.line)
                .clickable { onChange(!on) },
            contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Box(Modifier.padding(3.dp).size(18.dp).clip(CircleShape).background(Color.White))
        }
    }
}

/* =====================================================================
   🤖 MaxiBot
   ===================================================================== */

@Composable
fun BotScreen(onBack: () -> Unit) {
    val msgs = remember { mutableStateListOf<Pair<Boolean, String>>() }   // true = Bot
    var input by remember { mutableStateOf("") }

    if (msgs.isEmpty()) {
        msgs += true to MaxiBot.help().text
    }

    fun send() {
        val t = input.trim()
        if (t.isEmpty()) return
        msgs += false to t
        input = ""
        val r = MaxiBot.handle(t, System.currentTimeMillis())
        msgs += true to r.text
    }

    Box(Modifier.fillMaxSize().background(V3.bg)) {
        Column(Modifier.fillMaxSize().padding(top = 44.dp)) {
            // Kopf
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                    .clip(RoundedCornerShape(18.dp)).background(V3.glass)
                    .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                    contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
                Spacer(Modifier.width(9.dp))
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(V3.primaryBrush),
                    contentAlignment = Alignment.Center,
                ) { Text("🤖", fontSize = 17.sp) }
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) {
                    Text("MaxiBot", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
                    Text("läuft nur hier · kein Server", fontFamily = Outfit, fontSize = 9.5.sp, color = V3.muted)
                }
            }

            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
                Spacer(Modifier.height(6.dp))
                msgs.forEach { (fromBot, text) ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        horizontalArrangement = if (fromBot) Arrangement.Start else Arrangement.End,
                    ) {
                        Box(
                            Modifier.fillMaxWidth(0.88f).clip(RoundedCornerShape(16.dp))
                                .background(if (fromBot) Brush.verticalGradient(listOf(Color(0x22FFFFFF), Color(0x11FFFFFF)))
                                else V3.bubbleMine)
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                        ) {
                            Text(
                                text, fontFamily = Outfit, fontSize = 11.sp, color = V3.text, lineHeight = 16.sp,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            // Eingabe + Schnellbefehle
            Row(
                Modifier.fillMaxWidth()
                    .horizontalScroll(androidx.compose.foundation.rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                listOf("/summarize", "/rewrite kürzer ", "/remind in 2h ", "/poll ", "/translate").forEach { c ->
                    Box(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(12.dp))
                            .clickable { if (c.endsWith(" ")) input = c else { input = c; send() } }
                            .padding(horizontal = 9.dp, vertical = 6.dp),
                    ) { Text(c.trim(), fontFamily = Outfit, fontSize = 9.5.sp, color = V3.text) }
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.weight(1f).heightIn(min = 46.dp).clip(RoundedCornerShape(16.dp))
                        .background(V3.glass).border(1.dp, V3.glassBorder, RoundedCornerShape(16.dp))
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    androidx.compose.foundation.text.BasicTextField(
                        value = input, onValueChange = { input = it },
                        textStyle = androidx.compose.ui.text.TextStyle(
                            color = V3.text, fontFamily = Outfit, fontSize = 12.sp,
                        ),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(V3.neon),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
                    )
                }
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier.size(46.dp).clip(RoundedCornerShape(16.dp)).background(V3.primaryBrush).clickable { send() },
                    contentAlignment = Alignment.Center,
                ) { Text("➤", fontSize = 16.sp, color = Color.White) }
            }
        }
    }
}

/* =====================================================================
   💎 Vault-Badge mit Puls — nur wenn StrongBox
   ===================================================================== */

/**
 * 💎 pulsiert nur, wenn wirklich StrongBox da ist — und dann pulsiert auch
 * die Fläche dahinter. Kein Puls auf „Software-Keystore", das wäre Deko-Lüge.
 */
@Composable
fun VaultPulseBox(strongBox: Boolean, size: Int = 40, content: @Composable () -> Unit) {
    val t = rememberInfiniteTransition(label = "vault")
    val a by t.animateFloat(
        initialValue = if (strongBox) 0.0f else 0.0f,
        targetValue = if (strongBox) 0.28f else 0.0f,
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Reverse), label = "a",
    )
    val scale by t.animateFloat(
        initialValue = 1f, targetValue = if (strongBox) 1.04f else 1f,
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Reverse), label = "s",
    )
    Box(
        Modifier
            .size(size.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape((size / 3).dp))
            .background(Light.lila.copy(alpha = 0.14f + a))
            .border(1.dp, Light.lila.copy(alpha = 0.35f + a), RoundedCornerShape((size / 3).dp)),
        contentAlignment = Alignment.Center,
    ) { content() }
}
