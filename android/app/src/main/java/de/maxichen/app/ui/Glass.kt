package de.maxichen.app.ui

/* =====================================================================
   🧊 V4.4 — LIQUID GLASS, WIRKLICH
   ---------------------------------------------------------------------
   Das alte „Milchglas" (weiß 0.62 + Modifier.blur) war falsch:
   Modifier.blur verwischt den INHALT der Leiste, nicht das, was HINTER
   ihr liegt. Hier wird deshalb der komplette Screen in eine
   Compose-GraphicsLayer aufgezeichnet, alle ~400 ms als Bitmap
   gesampelt und durch die Glas-Blase wieder hindurchgezeichnet — mit
   echtem Blur des HINTERGRUNDS.

   • Android 12+ (API 31+): echte GPU-Blur über
       RenderEffect.createBlurEffect(32f, 32f, Shader.TileMode.CLAMP)
     in Modifier.graphicsLayer { renderEffect = … }
   • Android 8–11 (API 26–30): echter RenderScript-Blur
       ScriptIntrinsicBlur.setRadius(25f)
     auf dem heruntergerechneten Backdrop (kein „sieht gleich aus"-Fake,
     sondern echter Weichzeichner des Hintergrunds).
   • Tint: Weiß mit Alpha 0.15 (nicht 0.62) + Glas-Kante + Sheen.
   ===================================================================== */

import android.graphics.Bitmap
import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.renderscript.Allocation
import android.renderscript.Element
import android.renderscript.RenderScript
import android.renderscript.ScriptIntrinsicBlur
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

object GlassSpec {
    /** exakt der geforderte Radius: RenderEffect.createBlurEffect(32f, 32f, CLAMP) */
    const val BLUR_PX = 32f
    /** Weiß-Anteil des Glases — 0.15 statt 0.62 */
    const val WHITE_ALPHA = 0.15f
    const val BAR_HEIGHT_DP = 66
    const val RADIUS_DP = 32
    const val CAPTURE_MS = 400L
}

/** Ein Backdrop-Schnappschuss: schon auf 1/3 heruntergerechnet (schnell + weich). */
data class GlassShot(val image: ImageBitmap, val scale: Float)

/* =====================================================================
   BACKDROP AUFNEHMEN
   ===================================================================== */

@Composable
fun rememberGlassShot(layer: GraphicsLayer?, refreshMs: Long = GlassSpec.CAPTURE_MS): GlassShot? {
    val ctx = LocalContext.current
    var shot by remember { mutableStateOf<GlassShot?>(null) }

    LaunchedEffect(layer, refreshMs) {
        val l = layer ?: return@LaunchedEffect
        while (true) {
            try {
                val full = l.toImageBitmap()          // muss im Compose-Thread laufen
                if (full.width > 32 && full.height > 32) {
                    val prepared = withContext(Dispatchers.Default) { prepare(ctx, full.asAndroidBitmap()) }
                    if (prepared != null) shot = prepared
                }
            } catch (t: Throwable) {
                // Layer noch nicht aufgezeichnet o. ä. — einfach weiter versuchen
            }
            delay(refreshMs)
        }
    }
    return shot
}

private fun prepare(ctx: android.content.Context, src: Bitmap): GlassShot? {
    return try {
        val targetW = (src.width / 3).coerceIn(180, 560)
        val scale = targetW.toFloat() / src.width.toFloat()
        val small = Bitmap.createScaledBitmap(src, targetW, (src.height * scale).roundToInt().coerceAtLeast(2), true)

        val out = if (Build.VERSION.SDK_INT >= 31) {
            // Blur macht hier die GPU per RenderEffect — Bitmap bleibt scharf gesampelt
            small
        } else {
            blurScript(ctx, small, 25f) ?: boxBlur(small, 6)
        }
        GlassShot(out.asImageBitmap(), scale)
    } catch (t: Throwable) {
        null
    }
}

/** Echter RenderScript-Blur (Android 8–11). Radius max. 25. */
private fun blurScript(ctx: android.content.Context, src: Bitmap, radius: Float): Bitmap? {
    return try {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val rs = RenderScript.create(ctx)
        val inAlloc = Allocation.createFromBitmap(rs, src)
        val outAlloc = Allocation.createFromBitmap(rs, out)
        val blur = ScriptIntrinsicBlur.create(rs, Element.U8_4(rs))
        blur.setRadius(radius.coerceIn(0.1f, 25f))
        blur.setInput(inAlloc)
        blur.forEach(outAlloc)
        outAlloc.copyTo(out)
        rs.destroy()
        out
    } catch (t: Throwable) {
        null
    }
}

/** Letzte Rettung, falls RenderScript auf dem Gerät fehlt: echter Box-Blur. */
private fun boxBlur(src: Bitmap, passes: Int): Bitmap {
    val w = src.width
    val h = src.height
    val px = IntArray(w * h)
    src.getPixels(px, 0, w, 0, 0, w, h)
    val tmp = IntArray(w * h)
    repeat(passes.coerceAtLeast(1)) {
        // horizontal
        for (y in 0 until h) {
            var r = 0; var g = 0; var b = 0; var a = 0
            val row = y * w
            for (x in -1..w) {
                if (x < w) {
                    val c = px[row + x.coerceAtLeast(0)]
                    a += (c ushr 24) and 0xFF; r += (c ushr 16) and 0xFF
                    g += (c ushr 8) and 0xFF; b += c and 0xFF
                }
                if (x - 2 >= 0) {
                    val c = px[row + (x - 2)]
                    a -= (c ushr 24) and 0xFF; r -= (c ushr 16) and 0xFF
                    g -= (c ushr 8) and 0xFF; b -= c and 0xFF
                }
                if (x - 1 >= 0 && x - 1 < w) {
                    tmp[row + (x - 1)] = ((a / 3) shl 24) or ((r / 3) shl 16) or ((g / 3) shl 8) or (b / 3)
                }
            }
        }
        // vertikal
        for (x in 0 until w) {
            var r = 0; var g = 0; var b = 0; var a = 0
            for (y in -1..h) {
                if (y < h) {
                    val c = tmp[y.coerceAtLeast(0) * w + x]
                    a += (c ushr 24) and 0xFF; r += (c ushr 16) and 0xFF
                    g += (c ushr 8) and 0xFF; b += c and 0xFF
                }
                if (y - 2 >= 0) {
                    val c = tmp[(y - 2) * w + x]
                    a -= (c ushr 24) and 0xFF; r -= (c ushr 16) and 0xFF
                    g -= (c ushr 8) and 0xFF; b -= c and 0xFF
                }
                if (y - 1 >= 0 && y - 1 < h) {
                    px[(y - 1) * w + x] = ((a / 3) shl 24) or ((r / 3) shl 16) or ((g / 3) shl 8) or (b / 3)
                }
            }
        }
    }
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    out.setPixels(px, 0, w, 0, 0, w, h)
    return out
}

/* =====================================================================
   DAS GLAS SELBST
   ===================================================================== */

/**
 * Zeichnet den (geblurrten) Backdrop an der richtigen Stelle, darüber
 * Weiß 0.15, eine Licht-Kante und einen weichen Sheen.
 */
@Composable
fun GlassPanel(
    shot: GlassShot?,
    origin: Offset,
    modifier: Modifier = Modifier,
    shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(GlassSpec.RADIUS_DP.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    Box(modifier.clip(shape)) {
        if (shot != null) {
            val effectModifier = if (Build.VERSION.SDK_INT >= 31) {
                Modifier.graphicsLayer {
                    // 🔮 echter Backdrop-Blur (GPU), exakt 32f / CLAMP
                    renderEffect = RenderEffect
                        .createBlurEffect(GlassSpec.BLUR_PX, GlassSpec.BLUR_PX, Shader.TileMode.CLAMP)
                        .asComposeRenderEffect()
                    clip = false
                }
            } else Modifier

            Canvas(Modifier.fillMaxSize().then(effectModifier)) {
                val s = shot.scale.coerceAtLeast(0.0001f)
                val dstW = (shot.image.width / s).roundToInt().coerceAtLeast(1)
                val dstH = (shot.image.height / s).roundToInt().coerceAtLeast(1)
                drawImage(
                    image = shot.image,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(shot.image.width, shot.image.height),
                    dstOffset = IntOffset(-origin.x.roundToInt(), -origin.y.roundToInt()),
                    dstSize = IntSize(dstW, dstH),
                    filterQuality = FilterQuality.Low,
                )
            }
        } else {
            // Noch kein Frame aufgenommen: Glas-Farbe statt Milchglas
            Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.10f)))
        }

        // 🥛 Weiß 0.15 — der eigentliche Glastint
        Box(Modifier.matchParentSize().background(Color.White.copy(alpha = GlassSpec.WHITE_ALPHA)))
        // ✨ Sheen (oben heller, unten matter)
        Box(
            Modifier.matchParentSize().background(
                Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = 0.22f),
                        Color.White.copy(alpha = 0.04f),
                        Color.White.copy(alpha = 0.10f),
                    ),
                ),
            ),
        )
        // 🌈 Glas-Kante (Regenbogen-Schimmer wie iOS 26)
        Box(
            Modifier.matchParentSize().border(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        Color.White.copy(alpha = 0.90f),
                        Color(0x66FF9FD0),
                        Color(0x55B79CFF),
                        Color.White.copy(alpha = 0.55f),
                    ),
                ),
                shape,
            ),
        )
        content()
    }
}

/* =====================================================================
   HILFE FÜR DEN AUFRUFER
   ===================================================================== */

/** Merkt sich die Position der Leiste im Root (für den Backdrop-Ausschnitt). */
@Composable
fun Modifier.trackPosition(onPos: (Offset) -> Unit): Modifier =
    this.onGloballyPositioned { onPos(it.positionInRoot()) }

/** true, wenn echtes GPU-Blur (RenderEffect) verfügbar ist. */
val hasRenderEffectBlur: Boolean get() = Build.VERSION.SDK_INT >= 31
