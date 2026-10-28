package de.maxichen.app.ui

/* =====================================================================
   🎨 V4.11 — THEME-ENGINE
   ---------------------------------------------------------------------
   Ein Zustand, drei Schalter, vier Paletten. Und die ganze App färbt
   sich um, weil Light.* und V3.* zu Gettern auf die aktive Palette
   geworden sind — statt 9.000 Zeilen anzufassen.

   Material You: auf Android 12+ lesen wir den System-Akzent aus dem
   Wallpaper und ziehen ihn über unsere Brand-Farbe. Bewusst nur der
   AKZENT, nicht alle Flächen — sonst verliert die App ihr Gesicht.
   ===================================================================== */

import android.content.Context
import android.os.Build
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import de.maxichen.app.theme.MaxiPalettes
import de.maxichen.app.theme.Palette
import de.maxichen.app.theme.Tokens

object MaxiTheme {

    private const val PREFS = "maxichat_ui"

    /** Welche Palette (pink · midnight · glass · paper) */
    var id by mutableStateOf("pink")

    /** AMOLED: schwarze Flächen bei dunklen Themes (spart Strom auf OLED) */
    var amoled by mutableStateOf(false)

    /** Material You: System-Akzent aus dem Wallpaper übernehmen */
    var materialYou by mutableStateOf(false)

    /** vom System gelieferter Akzent (nur wenn materialYou && API 31+) */
    private var systemAccent: Long? = null

    val palette: Palette get() = MaxiPalettes.byId(id)

    val isDark: Boolean get() = palette.dark

    /* ---------------- effektive Tokens ---------------- */

    val chrome: Tokens get() = tweak(palette.chrome)
    val chat: Tokens get() = tweak(palette.chat)

    private fun tweak(t: Tokens): Tokens {
        var out = t
        if (amoled && palette.dark) {
            out = out.copy(surface = 0xFF000000, card = 0xFF060509, gradA = 0xFF000000, gradB = 0xFF000000, gradC = 0xFF000000)
        }
        systemAccent?.let { a ->
            out = out.copy(accent = a, neon = a)
        }
        return out
    }

    /* ---------------- Laden / Speichern ---------------- */

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(ctx: Context) {
        val p = prefs(ctx)
        id = p.getString("theme_id", "pink") ?: "pink"
        amoled = p.getBoolean("theme_amoled", false)
        materialYou = p.getBoolean("theme_material_you", false)
        readSystemAccent(ctx)
    }

    fun save(ctx: Context) {
        prefs(ctx).edit()
            .putString("theme_id", id)
            .putBoolean("theme_amoled", amoled)
            .putBoolean("theme_material_you", materialYou)
            .apply()
        readSystemAccent(ctx)
    }

    fun select(ctx: Context, newId: String) { id = newId; save(ctx) }
    fun setAmoled(ctx: Context, on: Boolean) { amoled = on; save(ctx) }
    fun setMaterialYou(ctx: Context, on: Boolean) { materialYou = on; save(ctx) }

    private fun readSystemAccent(ctx: Context) {
        systemAccent = if (materialYou && Build.VERSION.SDK_INT >= 31) {
            try {
                val scheme = if (palette.dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
                scheme.primary.toArgb().toLong() and 0xFFFFFFFFL
            } catch (t: Throwable) { null }
        } else null
    }

    /** Wird beim Start einmal aufgerufen, damit die Palette steht, bevor gezeichnet wird. */
    fun attach(ctx: Context) = load(ctx)
}

/** Kurz-Helfer: Long-ARGB → Compose-Color */
fun col(argb: Long): Color = Color(argb)
