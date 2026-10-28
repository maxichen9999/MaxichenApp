package de.maxichen.app.ui

import android.util.Base64
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.R
import kotlin.math.sin
import kotlin.random.Random

/* =====================================================================
   🎨 DESIGN TOKENS V3 — pink · lila · neon · kawaii
   ===================================================================== */

/** 🎨 V4.11: der Chat folgt jetzt derselben Palette (Rolle „chat"). */
object V3 {
    private val t get() = MaxiTheme.chat

    val bg: Brush get() = Brush.verticalGradient(listOf(Color(t.gradA), Color(t.gradB), Color(t.gradC)))
    val neon: Color get() = Color(t.neon)
    val blue: Color get() = Color(t.blue)
    val green: Color get() = Color(t.success)
    val lila: Color get() = Color(t.accent2)
    val gold: Color get() = Color(t.warn)
    val danger: Color get() = Color(t.danger)
    val text: Color get() = Color(t.onSurface)
    val muted: Color get() = Color(t.muted)
    val glass: Color get() = Color(t.glass)
    val glassBorder: Color get() = Color(t.glassBorder)
    val ink: Color get() = Color(t.onSurface)
    val primaryBrush: Brush get() = Brush.horizontalGradient(listOf(Color(t.accent), Color(t.accent2)))
    val bubbleMine: Brush get() = Brush.verticalGradient(listOf(Color(t.bubbleMineA), Color(t.bubbleMineB)))
    val bubbleOther: Brush get() = Brush.verticalGradient(
        listOf(Color(t.glass).copy(alpha = 0.14f), Color(t.glass).copy(alpha = 0.07f)),
    )
}

val Outfit = FontFamily(Font(R.font.outfit, FontWeight.Normal))

/* =====================================================================
   🖼️ HINTERGRUND
   ===================================================================== */

data class AppBackground(val type: String, val value: String) {
    companion object {
        fun from(s: String): AppBackground {
            val i = s.indexOf('|')
            return if (i < 0) AppBackground("preset", s.ifEmpty { "pink-dream" })
            else AppBackground(s.substring(0, i), s.substring(i + 1))
        }
    }
}

data class BgPreset(val id: String, val name: String, val colors: List<Color>)

val APP_PRESETS = listOf(
    BgPreset("pink-dream", "Pink Dream", listOf(Color(0xFF3B0F35), Color(0xFF6D1B5A), Color(0xFF2A0B3F))),
    BgPreset("kawaii-cloud", "Kawaii Cloud", listOf(Color(0xFF3A2350), Color(0xFF9A6FC7), Color(0xFF4B2A67))),
    BgPreset("lila-nacht", "Lila Nacht", listOf(Color(0xFF1A0A2E), Color(0xFF2D1B4E), Color(0xFF3B1E5A))),
    BgPreset("neon-city", "Neon City", listOf(Color(0xFF0B0418), Color(0xFF3A0C4E), Color(0xFF0F2A5A))),
    BgPreset("sakura", "Sakura", listOf(Color(0xFF4A1B33), Color(0xFFB85C86), Color(0xFF3A1230))),
    BgPreset("galaxy", "Galaxy", listOf(Color(0xFF120722), Color(0xFF3B1E6E), Color(0xFF0B1B3A))),
    BgPreset("ocean", "Ocean", listOf(Color(0xFF06222E), Color(0xFF0E5A6E), Color(0xFF08243A))),
    BgPreset("forest", "Forest", listOf(Color(0xFF0C2418), Color(0xFF1E5A38), Color(0xFF08221A))),
    BgPreset("sunset", "Sunset", listOf(Color(0xFF3A1030), Color(0xFF9A4A2A), Color(0xFF2A0A2A))),
    BgPreset("candy", "Candy", listOf(Color(0xFF4A1440), Color(0xFFFF7EDB), Color(0xFF7A2B6A))),
    BgPreset("mono", "Mono", listOf(Color(0xFF14141A), Color(0xFF33333F), Color(0xFF0E0E14))),
    BgPreset("aurora", "Aurora", listOf(Color(0xFF0B1B2A), Color(0xFF2BB89A), Color(0xFF3B1E6E))),
    BgPreset("peach", "Peach", listOf(Color(0xFF3A1A18), Color(0xFFC97A5E), Color(0xFF2A1220))),
    BgPreset("mint", "Mint", listOf(Color(0xFF0C2A26), Color(0xFF5EC9AE), Color(0xFF103A34))),
    BgPreset("lavender", "Lavender", listOf(Color(0xFF241436), Color(0xFF8D7BD6), Color(0xFF2E1A4E))),
    BgPreset("midnight", "Midnight", listOf(Color(0xFF05070F), Color(0xFF1A2240), Color(0xFF0A0E1E))),
    BgPreset("rose-gold", "Rose Gold", listOf(Color(0xFF3A1E24), Color(0xFFC98A76), Color(0xFF2A141C))),
    BgPreset("bubblegum", "Bubblegum", listOf(Color(0xFF3A0E34), Color(0xFFFF9AD5), Color(0xFF5C1460))),
    BgPreset("emerald", "Emerald", listOf(Color(0xFF06231A), Color(0xFF1F8F63), Color(0xFF08301F))),
    BgPreset("cherry", "Cherry", listOf(Color(0xFF2A0612), Color(0xFFB03050), Color(0xFF1A0410))),
)

/** 20 Themes: die 12 App-Themes + 8 zusätzliche Chat-Wallpaper → 20 insgesamt */
val CHAT_PRESETS = APP_PRESETS

fun presetById(id: String): BgPreset? = (APP_PRESETS + CHAT_PRESETS).find { it.id == id }

fun DecodeBase64(dataUrl: String): android.graphics.Bitmap? = try {
    val b64 = dataUrl.substringAfter("base64,", "")
    val bytes = Base64.decode(b64, Base64.DEFAULT)
    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
} catch (e: Exception) { null }

@Composable
fun AppBackgroundLayer(bg: AppBackground, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        when (bg.type) {
            "animated" -> {
                Box(Modifier.fillMaxSize().background(V3.bg))
                when (bg.value) {
                    "hearts" -> FloatingHearts()
                    "bubbles" -> FloatingBubbles()
                    "aurora" -> AuroraWaves()
                    else -> AnimatedStars()
                }
            }
            "custom" -> {
                val bmp = remember(bg.value) { DecodeBase64(bg.value) }
                if (bmp != null) androidx.compose.foundation.Image(
                    bitmap = bmp.asImageBitmap(), contentDescription = null,
                    contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                ) else Box(Modifier.fillMaxSize().background(V3.bg))
                Box(Modifier.fillMaxSize().background(Color(0x66000000)))
            }
            else -> {
                val p = presetById(bg.value) ?: APP_PRESETS[2]
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(p.colors)))
            }
        }
        content()
    }
}

/* ---------------- Animationen ---------------- */

@Composable
fun AnimatedStars() {
    val t = rememberInfiniteTransition(label = "stars")
    val twinkle by t.animateFloat(0.35f, 1f, infiniteRepeatable(tween(2400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tw")
    val drift by t.animateFloat(0f, 1f, infiniteRepeatable(tween(30000, easing = LinearEasing), RepeatMode.Restart), label = "dr")
    val rnd = remember { Random(7) }
    val stars = remember { (0 until 90).map { Triple(rnd.nextFloat(), rnd.nextFloat(), 0.6f + rnd.nextFloat() * 1.9f) } }
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        stars.forEachIndexed { idx, st ->
            val y = ((st.second + drift * 0.15f) % 1f)
            val alpha = if (idx % 4 == 0) twinkle else 0.55f
            drawCircle(
                Color(0xFFFFF3FF).copy(alpha = alpha * 0.85f),
                radius = st.third * density * 0.9f,
                center = Offset(st.first * w, h * (1f - y)),
            )
        }
    }
}

@Composable
fun FloatingHearts() {
    val t = rememberInfiniteTransition(label = "h")
    val y by t.animateFloat(0f, 1f, infiniteRepeatable(tween(14000, easing = LinearEasing)), label = "y")
    val rnd = remember { Random(3) }
    val hearts = remember { (0 until 18).map { Triple(rnd.nextFloat(), rnd.nextFloat(), 8 + rnd.nextInt(16)) } }
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        hearts.forEach { (fx, off, r) ->
            val ypos = ((y + off) % 1f)
            drawCircle(
                color = if (r % 3 == 0) Color(0x55FF7EDB) else Color(0x33C86BFF),
                radius = r.toFloat(),
                center = Offset(fx * w, h * (1f - ypos)),
            )
        }
    }
}

@Composable
fun FloatingBubbles() {
    val t = rememberInfiniteTransition(label = "b")
    val y by t.animateFloat(0f, 1f, infiniteRepeatable(tween(18000, easing = LinearEasing)), label = "y2")
    val rnd = remember { Random(9) }
    val dots = remember { (0 until 22).map { Triple(rnd.nextFloat(), rnd.nextFloat(), 4 + rnd.nextInt(18)) } }
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        dots.forEach { (fx, off, r) ->
            val ypos = ((y + off) % 1f)
            drawCircle(Color(0x22FFFFFF), r.toFloat(), Offset(fx * w, h * (1f - ypos)))
            drawCircle(Color(0x33FF7EDB), r * 0.35f, Offset(fx * w, h * (1f - ypos)))
        }
    }
}

@Composable
fun AuroraWaves() {
    val t = rememberInfiniteTransition(label = "a")
    val ph by t.animateFloat(0f, (2 * Math.PI).toFloat(), infiniteRepeatable(tween(20000, easing = LinearEasing)), label = "p")
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        for (k in 0 until 3) {
            val offset = h * (0.2f + k * 0.22f)
            val amp = h * 0.06f
            val path = androidx.compose.ui.graphics.Path()
            path.moveTo(0f, offset)
            var x = 0f
            while (x <= w) {
                val yy = offset + sin((x / w * 3.5f + ph + k)).toFloat() * amp
                path.lineTo(x, yy)
                x += 12f
            }
            path.lineTo(w, h); path.lineTo(0f, h); path.close()
            drawPath(
                path,
                Brush.verticalGradient(
                    listOf(listOf(Color(0x33FF6EB5), Color(0x227EB8FF), Color(0x22AAFF7E))[k], Color.Transparent),
                    startY = offset, endY = h,
                ),
            )
        }
    }
}

/* =====================================================================
   🧩 KOMPONENTEN
   ===================================================================== */

@Composable
fun GlassCard3(
    modifier: Modifier = Modifier, radius: Int = 24, padding: Int = 16,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier.clip(RoundedCornerShape(radius.dp)).background(V3.glass)
            .border(1.dp, V3.glassBorder, RoundedCornerShape(radius.dp)).padding(padding.dp),
        content = content,
    )
}

@Composable
fun NeonButton3(label: String, loading: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val scale by animateFloatAsState(if (loading) 0.97f else 1f, label = "s")
    Box(
        Modifier.fillMaxWidth().height(52.dp).graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(12.dp, RoundedCornerShape(18.dp), ambientColor = V3.neon, spotColor = V3.neon)
            .clip(RoundedCornerShape(18.dp))
            .background(if (enabled) V3.primaryBrush else Brush.linearGradient(listOf(V3.glass, V3.glass)))
            .clickable(enabled = enabled && !loading) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (loading) Spinner(Color(0xFF2A0930))
        else Text(label, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            color = if (enabled) V3.ink else V3.muted)
    }
}

@Composable
fun GhostButton3(label: String, danger: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(16.dp))
            .background(if (danger) Color(0x22FF5C7A) else V3.glass)
            .border(1.dp, if (danger) V3.danger.copy(alpha = 0.5f) else V3.glassBorder, RoundedCornerShape(16.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
            color = if (danger) V3.danger else V3.text)
    }
}

@Composable
fun Avatar3(seed: String, size: Int = 48, online: Boolean = false) {
    Box {
        Box(
            Modifier.size(size.dp).clip(CircleShape).background(V3.primaryBrush)
                .border(2.dp, V3.neon.copy(alpha = 0.8f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val emoji = seed.takeIf { it.length <= 3 && it.isNotEmpty() } ?: seed.take(1)
            Text(if (emoji.isBlank()) "💗" else emoji, fontSize = (size * 0.42f).sp)
        }
        if (online) Box(
            Modifier.size((size * 0.24f).dp).align(Alignment.BottomEnd)
                .clip(CircleShape).background(V3.green).border(2.dp, Color(0xFF1A0A2E), CircleShape),
        )
    }
}

@Composable
fun Chip3(text: String, color: Color = V3.neon) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.16f))
            .border(1.dp, color.copy(alpha = 0.45f), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(text, fontFamily = Outfit, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = color, maxLines = 1)
    }
}

@Composable
fun Title3(text: String, size: Int = 20, modifier: Modifier = Modifier) {
    Text(text, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = size.sp, color = V3.text,
        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

@Composable
fun Muted3(text: String, size: Int = 11, lines: Int = 1, modifier: Modifier = Modifier) {
    Text(text, fontFamily = Outfit, fontSize = size.sp, color = V3.muted, maxLines = lines,
        overflow = TextOverflow.Ellipsis, modifier = modifier)
}

/** Gleiche Funktion mit Kommawerten (9.5 · 8.5 …). */
@Composable
fun Muted3(text: String, size: Double, lines: Int, modifier: Modifier = Modifier) {
    Text(text, fontFamily = Outfit, fontSize = size.toFloat().sp, color = V3.muted, maxLines = lines,
        overflow = TextOverflow.Ellipsis, modifier = modifier)
}

@Composable
fun BottomNav3(items: List<Pair<String, String>>, selected: Int, onSelect: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(24.dp)).background(Color(0xE61B0F2E))
            .border(1.dp, V3.glassBorder, RoundedCornerShape(24.dp))
            .padding(horizontal = 4.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { i, (icon, label) ->
            val on = i == selected
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).clickable { onSelect(i) }.padding(vertical = 3.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(icon, fontSize = if (on) 19.sp else 17.sp)
                Text(label, fontFamily = Outfit, fontSize = 8.sp, maxLines = 1,
                    fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
                    color = if (on) V3.neon else V3.muted)
                Box(
                    Modifier.padding(top = 2.dp).size(width = 14.dp, height = 2.dp)
                        .clip(RoundedCornerShape(50)).background(if (on) V3.neon else Color.Transparent),
                )
            }
        }
    }
}
