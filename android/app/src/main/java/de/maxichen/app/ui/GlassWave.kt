package de.maxichen.app.ui

/* =====================================================================
   🌊 V4.5 — SWIPE-GLASWELLE
   ---------------------------------------------------------------------
   Feedback der Liquid-Glass-Bar:
   • Finger zieht über das Glas → eine Lichtwelle läuft mit (Haze-Schleier
     + heller Kern, echter Verlauf, keine Fläche)
   • beim Loslassen springt die Welle mit Spring-Physik in die Mitte des
     Tabs, über dem der Finger steht → dieser Tab wird gewählt
   • der aktive Glas-Knopf wandert ebenfalls gefedert (Sliding Pill)
   • kurzer Ripple-Ring wie ein Tropfen auf Glas, dazu Haptik-Tick

   Bewusst OHNE zusätzliche Haze-Bibliothek: das Blur des Hintergrunds
   macht schon Glass.kt (RenderEffect / RenderScript). Die „Haze" hier ist
   der milchig-weiche Lichtsaum über dem Glas — 0 Extra-Dependencies.
   ===================================================================== */

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** Feder für alles, was auf dem Glas hüpft: leichtes Nachschwingen, kein Zappeln. */
private val WaveSpring = spring<Float>(
    dampingRatio = 0.55f,
    stiffness = Spring.StiffnessMediumLow,
)

/** Feder für den aktiven Knopf — etwas satter, damit er „einrastet". */
val PillSpring = spring<Float>(
    dampingRatio = 0.68f,
    stiffness = Spring.StiffnessMediumLow,
)

class GlassWaveState internal constructor() {
    /** Fingerposition in px — reiner State, damit der Finger 1:1 folgt */
    internal var dragX by mutableStateOf(-1f)
    internal var dragging by mutableStateOf(false)
    /** x-Position der Welle in px (innerhalb der Bar), nach dem Loslassen gefedert */
    internal val x = Animatable(0f)
    /** Deckkraft des Lichtsaums */
    internal val glow = Animatable(0f)
    /** 0 → 1: expandierender Tropfen-Ring */
    internal val ripple = Animatable(1f)
}

@Composable
fun rememberGlassWave(): GlassWaveState = remember { GlassWaveState() }

/**
 * Beobachtet Zeiger auf dem Glas, ohne Klicks zu klauen:
 * PointerEventPass.Initial liest nur mit, `consume()` wird nie gerufen.
 */
fun Modifier.glassWave(
    state: GlassWaveState,
    itemCount: Int,
    scope: CoroutineScope,
    haptics: HapticFeedback? = null,
    onPick: (Int) -> Unit,
): Modifier {
    if (itemCount <= 0) return this
    return this.pointerInput(itemCount) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            val width = size.width.toFloat()
            if (width <= 0f) return@awaitEachGesture
            val itemW = width / itemCount
            fun indexAt(px: Float) = (px / itemW).toInt().coerceIn(0, itemCount - 1)

            state.dragX = down.position.x.coerceIn(0f, width)
            state.dragging = true
            scope.launch { state.glow.animateTo(1f, tween(90)) }
            scope.launch {
                state.ripple.snapTo(0f)
                state.ripple.animateTo(1f, tween(520, easing = LinearOutSlowInEasing))
            }
            var last = indexAt(down.position.x)

            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                val px = change.position.x.coerceIn(0f, width)
                state.dragX = px

                val idx = indexAt(px)
                if (idx != last) {
                    last = idx
                    haptics?.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }

                if (!change.pressed) {
                    // Spring in die Mitte des gewählten Tabs + Haze ausblenden
                    state.dragging = false
                    scope.launch {
                        state.x.snapTo(px)
                        state.x.animateTo(idx * itemW + itemW / 2f, WaveSpring)
                    }
                    scope.launch {
                        state.glow.animateTo(0f, tween(360, delayMillis = 140, easing = FastOutSlowInEasing))
                    }
                    onPick(idx)
                    haptics?.performHapticFeedback(HapticFeedbackType.LongPress)
                    break
                }
            }
        }
    }
}

/**
 * Malt Haze-Schleier, Lichtkern und Tropfen-Ring über das Glas.
 * Liest die Animatable-Werte im Draw-Scope → nur Neuzeichnen, kein Recomposition-Sturm.
 */
@Composable
fun GlassWaveOverlay(
    state: GlassWaveState,
    modifier: Modifier = Modifier,
    tint: Color = Color(0xFFFF8FC7),
) {
    Canvas(modifier.fillMaxSize()) {
        val cx = if (state.dragging) state.dragX else state.x.value
        val g = state.glow.value
        if (cx <= 0f || g <= 0.01f) return@Canvas

        val h = size.height
        val band = (size.width * 0.22f).coerceIn(56f, 190f)

        // 1) weicher Haze-Saum (weiß → rosa → transparent)
        drawRect(
            brush = Brush.horizontalGradient(
                0.0f to Color.Transparent,
                0.32f to Color.White.copy(alpha = 0.16f * g),
                0.5f to Color.White.copy(alpha = 0.30f * g),
                0.68f to tint.copy(alpha = 0.16f * g),
                1.0f to Color.Transparent,
                startX = cx - band,
                endX = cx + band,
            ),
            topLeft = Offset(cx - band, 0f),
            size = Size(band * 2f, h),
        )

        // 2) heller Kern — der eigentliche „Glanzstrich"
        drawRect(
            brush = Brush.horizontalGradient(
                0.0f to Color.Transparent,
                0.5f to Color.White.copy(alpha = 0.55f * g),
                1.0f to Color.Transparent,
                startX = cx - band * 0.16f,
                endX = cx + band * 0.16f,
            ),
            topLeft = Offset(cx - band * 0.16f, 0f),
            size = Size(band * 0.32f, h),
        )

        // 3) Tropfen-Ring, läuft nach außen aus
        val r = state.ripple.value
        if (r < 1f) {
            val radius = (r * band * 1.15f).coerceAtLeast(1f)
            drawCircle(
                color = tint.copy(alpha = (1f - r) * 0.45f * g),
                radius = radius,
                center = Offset(cx, h / 2f),
                style = Stroke(width = 1.5.dp.toPx()),
            )
            drawCircle(
                color = Color.White.copy(alpha = (1f - r) * 0.55f * g),
                radius = radius * 0.62f,
                center = Offset(cx, h / 2f),
                style = Stroke(width = 1.dp.toPx()),
            )
        }

        // 4) kleiner Lichtpunkt oben am Glas (Sheen)
        drawCircle(
            brush = Brush.radialGradient(
                listOf(Color.White.copy(alpha = 0.35f * g), Color.Transparent),
                center = Offset(cx, h * 0.18f),
                radius = band * 0.9f,
            ),
            radius = band * 0.9f,
            center = Offset(cx, h * 0.18f),
        )
    }
}
