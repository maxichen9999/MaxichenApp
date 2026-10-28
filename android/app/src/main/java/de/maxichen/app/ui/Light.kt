package de.maxichen.app.ui

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* =====================================================================
   🌤️ LIGHT — helles, cleanes Design für die Tabs
   Nur die BOTTOM-BAR ist Liquid Glass (iOS 26) — alles oben ist normal.
   ===================================================================== */

/**
 * 🎨 V4.11: KEINE festen Farben mehr — alles zeigt auf die aktive Palette
 * (`MaxiTheme.chrome`). Dadurch färbt sich die komplette App um, ohne dass
 * eine einzige der ~200 Aufrufstellen angefasst werden musste.
 *
 * Die Namen bleiben absichtlich gleich (`pink`, `bg`, `ink` …), damit alter
 * Code weiter kompiliert und man beim Lesen weiß, was gemeint ist.
 */
object Light {
    private val t get() = MaxiTheme.chrome

    val bg: Color get() = Color(t.surface)
    val card: Color get() = Color(t.card)
    val ink: Color get() = Color(t.onSurface)
    val soft: Color get() = Color(t.muted)
    val pink: Color get() = Color(t.accent)
    val pinkSoft: Color get() = Color(t.accentSoft)
    val lila: Color get() = Color(t.accent2)
    val line: Color get() = Color(t.line)
    val green: Color get() = Color(t.success)
    val danger: Color get() = Color(t.danger)
    val gold: Color get() = Color(t.warn)

    /** Verlauf für aktive Elemente — folgt dem Akzent des Themes */
    val pinkBrush: Brush
        get() = Brush.horizontalGradient(listOf(Color(t.accent), Color(t.accent2)))
}

/* =====================================================================
   🧊 LIQUID GLASS — NUR unten
   ===================================================================== */

@Composable
fun LiquidGlassBar(
    items: List<Triple<String, String, Boolean>>,
    onSelect: (Int) -> Unit,
    shot: GlassShot? = null,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        var origin by remember { mutableStateOf(Offset.Zero) }
        var innerW by remember { mutableStateOf(0f) }

        val activeIndex = items.indexOfFirst { it.third }.coerceAtLeast(0)
        val wave = rememberGlassWave()
        val scope = rememberCoroutineScope()
        val haptics = LocalHapticFeedback.current
        val density = LocalDensity.current

        // 🌊 der aktive Glas-Knopf wandert gefedert zu seinem Tab
        val pill = remember { Animatable(activeIndex.toFloat()) }
        LaunchedEffect(activeIndex) {
            pill.animateTo(activeIndex.toFloat(), PillSpring)
        }
        val itemW = if (items.isEmpty() || innerW <= 0f) 0f else innerW / items.size

        GlassPanel(
            shot = shot,
            origin = origin,
            modifier = Modifier
                .fillMaxWidth()
                .height(GlassSpec.BAR_HEIGHT_DP.dp)
                .trackPosition { origin = it }
                // 👆 Wischen über das Glas: Welle folgt dem Finger, Loslassen wählt den Tab
                .glassWave(wave, items.size, scope, haptics) { onSelect(it) },
        ) {
            // ganz leichter pink-lila Schimmer, damit das Glas zur Marke passt
            Box(
                Modifier.matchParentSize().background(
                    Brush.horizontalGradient(
                        listOf(
                            Color(0x14FFB3D9), Color(0x0FC9A7FF),
                            Color(0x14FFB3D9), Color(0x0FC9A7FF),
                        ),
                    ),
                ),
            )
            Box(
                Modifier
                    .matchParentSize()
                    .padding(horizontal = 8.dp)
                    .onSizeChanged { innerW = it.width.toFloat() },
            ) {
                // gleitender pinker Knopf (Spring, kein Sprung)
                if (itemW > 0f) {
                    Box(
                        Modifier
                            .offset { IntOffset((pill.value * itemW).roundToInt(), 0) }
                            .width(with(density) { itemW.toDp() })
                            .fillMaxHeight()
                            .padding(vertical = 6.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(Light.pinkBrush),
                    )
                }
                Row(
                    Modifier.fillMaxSize(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    items.forEachIndexed { i, item ->
                        val (icon, label, active) = item
                        Column(
                            Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(22.dp))
                                .clickable { onSelect(i) }
                                .padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(icon, fontSize = if (active) 20.sp else 18.sp)
                            Spacer(Modifier.height(2.dp))
                            Text(
                                label,
                                fontFamily = Outfit,
                                fontSize = 9.sp,
                                fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold,
                                color = if (active) Color.White else Light.soft,
                                maxLines = 1,
                            )
                        }
                    }
                }
                // ✨ Haze-Schleier + Lichtkern + Tropfen-Ring über dem Glas
                GlassWaveOverlay(wave, Modifier.matchParentSize())
            }
        }
    }
}

/* =====================================================================
   🃏 KARTEN & KLEINKRAM (hell)
   ===================================================================== */

@Composable
fun LightCard(
    modifier: Modifier = Modifier,
    padding: Int = 12,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val base = modifier
        .fillMaxWidth()
        .shadow(6.dp, RoundedCornerShape(22.dp), ambientColor = Color(0x1AFF5FA8), spotColor = Color(0x14A97BFF))
        .clip(RoundedCornerShape(22.dp))
        .background(Light.card)
    Column(
        if (onClick != null) base.clickable { onClick() }.padding(padding.dp) else base.padding(padding.dp),
        content = content,
    )
}

@Composable
fun PinkTitle(text: String, size: Int = 26) {
    Text(text, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = size.sp, color = Light.pink)
}

@Composable
fun SoftText(text: String, size: Float = 11f, lines: Int = 1) {
    Text(text, fontFamily = Outfit, fontSize = size.sp, color = Light.soft, maxLines = lines)
}

@Composable
fun SearchPill(value: String, onChange: (String) -> Unit, hint: String = "Suchen 💗") {
    Row(
        Modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Light.card)
            .border(1.dp, Light.line, RoundedCornerShape(18.dp))
            .padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("🔍", fontSize = 14.sp)
        Spacer(Modifier.width(8.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) SoftText(hint, 12.5f, 1)
            androidx.compose.foundation.text.BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(
                    fontFamily = Outfit, fontSize = 13.sp, color = Light.ink,
                ),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(Light.pink),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (value.isNotEmpty()) {
            Text("✕", fontSize = 12.sp, color = Light.soft, modifier = Modifier.clickable { onChange("") })
        }
    }
}

@Composable
fun LightChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (active) Light.pinkSoft else Light.card)
            .border(1.dp, if (active) Light.pink.copy(alpha = 0.5f) else Light.line, RoundedCornerShape(50))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            label, fontFamily = Outfit, fontSize = 10.5.sp,
            fontWeight = if (active) FontWeight.ExtraBold else FontWeight.Medium,
            color = if (active) Light.pink else Light.soft, maxLines = 1,
        )
    }
}

@Composable
fun LightAvatar(seed: String, size: Int = 50, online: Boolean = false) {
    Box {
        Box(
            Modifier.size(size.dp).clip(CircleShape).background(Light.pinkSoft),
            contentAlignment = Alignment.Center,
        ) {
            Text(seed.ifBlank { "💗" }, fontSize = (size * 0.42f).sp)
        }
        if (online) {
            Box(
                Modifier
                    .size((size * 0.26f).dp)
                    .align(Alignment.BottomEnd)
                    .clip(CircleShape)
                    .background(Light.green)
                    .border(2.dp, Color.White, CircleShape),
            )
        }
    }
}

@Composable
fun LightBadge(text: String, color: Color = Light.pink) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f))
            .padding(horizontal = 7.dp, vertical = 2.dp),
    ) { Text(text, fontFamily = Outfit, fontSize = 8.5.sp, fontWeight = FontWeight.Bold, color = color, maxLines = 1) }
}

@Composable
fun LightButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Light.pinkBrush)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 13.5.sp, color = Color.White)
    }
}

@Composable
fun LightGhost(label: String, danger: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Light.card)
            .border(1.dp, if (danger) Light.danger.copy(alpha = 0.4f) else Light.line, RoundedCornerShape(16.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp,
            color = if (danger) Light.danger else Light.soft)
    }
}
