package de.maxichen.app.theme

/* =====================================================================
   🎨 V4.11 — PALETTEN (reines Kotlin, keine Compose-Abhängigkeit)
   ---------------------------------------------------------------------
   Warum hier nur Longs und keine Color-Objekte? Damit die Tests ohne
   Robolectric und ohne Compose laufen können — eine Palette ist eine
   Rechnung, kein UI. Die Umwandlung in Color passiert eine Ebene höher.

   Jede Palette hat ZWEI Rollen:
     • chrome — die hellen Tab-/Einstellungs-Seiten (Light.*)
     • chat   — der Chat-Bildschirm (V3.*), dunkel und neon

   Vier Themes, bewusst unterschiedlich:
     💗 Maxi Pink  — das Original. Soft, warm, kawaii.
     🌚 Midnight   — edgy. Fast schwarz, Neon-Pink. Auch die Tabs werden dunkel.
     🌌 Glass      — tiefes Lila mit Glaseffekt, AMOLED-tauglich.
     📄 Paper      — ruhig, cremeweiß, wenig Farbe. Für lange Lesesessions.
   ===================================================================== */

data class Tokens(
    // Flächen
    val surface: Long,
    val card: Long,
    val onSurface: Long,
    val muted: Long,
    val line: Long,
    // Akzente
    val accent: Long,
    val accentSoft: Long,
    val accent2: Long,
    // Status
    val success: Long,
    val danger: Long,
    val warn: Long,
    // Chat
    val gradA: Long = surface,
    val gradB: Long = surface,
    val gradC: Long = surface,
    val neon: Long = accent,
    val blue: Long = accent2,
    val glass: Long = 0x15FFFFFF,
    val glassBorder: Long = 0x30FFFFFF,
    val bubbleMineA: Long = accent2,
    val bubbleMineB: Long = accent,
)

data class Palette(
    val id: String,
    val name: String,
    val emoji: String,
    val dark: Boolean,
    val chrome: Tokens,
    val chat: Tokens,
)

object MaxiPalettes {

    /* ---------------- 💗 Maxi Pink (Original, V4.3–V4.10) ---------------- */
    val PINK = Palette(
        id = "pink", name = "Maxi Pink", emoji = "💗", dark = false,
        chrome = Tokens(
            surface = 0xFFFFF5F7, card = 0xFFFFFFFF, onSurface = 0xFF2B1A2E, muted = 0xFF8B7A93,
            line = 0xFFF0E3EA, accent = 0xFFFF5FA8, accentSoft = 0xFFFFE3F0, accent2 = 0xFFA97BFF,
            success = 0xFF3BBE7A, danger = 0xFFE8546E, warn = 0xFFE9A93B,
        ),
        chat = Tokens(
            surface = 0xFF1A0A2E, card = 0xFF2D1B4E, onSurface = 0xFFF8F0FF, muted = 0xFFB49CC8,
            line = 0x30FFFFFF, accent = 0xFFFF7EDB, accentSoft = 0xFF2D1B4E, accent2 = 0xFFC86BFF,
            success = 0xFFAAFF7E, danger = 0xFFFF5C7A, warn = 0xFFFFD166,
            gradA = 0xFF1A0A2E, gradB = 0xFF2D1B4E, gradC = 0xFF3B1E5A,
            neon = 0xFFFF7EDB, blue = 0xFF7EB8FF, glass = 0x15FFFFFF, glassBorder = 0x30FFFFFF,
            bubbleMineA = 0xFF6E8BFF, bubbleMineB = 0xFFB06BFF,
        ),
    )

    /* ---------------- 🌚 Midnight (edgy, ganz dunkel) ---------------- */
    val MIDNIGHT = Palette(
        id = "midnight", name = "Midnight", emoji = "🌚", dark = true,
        chrome = Tokens(
            surface = 0xFF0B0910, card = 0xFF171320, onSurface = 0xFFF2ECF7, muted = 0xFF9C8FAD,
            line = 0xFF2A2336, accent = 0xFFFF3D8B, accentSoft = 0xFF2B1420, accent2 = 0xFF9B6BFF,
            success = 0xFF4ADE80, danger = 0xFFFF5C7A, warn = 0xFFFFC46B,
            gradA = 0xFF0B0910, gradB = 0xFF0B0910, gradC = 0xFF0B0910,
            neon = 0xFFFF3D8B, glass = 0x18FFFFFF, glassBorder = 0x2AFFFFFF,
        ),
        chat = Tokens(
            surface = 0xFF08060C, card = 0xFF12101A, onSurface = 0xFFF5EFFF, muted = 0xFF9C8FAD,
            line = 0xFF2A2336, accent = 0xFFFF3D8B, accentSoft = 0xFF1F1220, accent2 = 0xFF9B6BFF,
            success = 0xFF4ADE80, danger = 0xFFFF5C7A, warn = 0xFFFFC46B,
            gradA = 0xFF08060C, gradB = 0xFF100C1A, gradC = 0xFF180D22,
            neon = 0xFFFF3D8B, blue = 0xFF6BA8FF, glass = 0x14FFFFFF, glassBorder = 0x26FFFFFF,
            bubbleMineA = 0xFF5B3DFF, bubbleMineB = 0xFF9B3DFF,
        ),
    )

    /* ---------------- 🌌 Glass (AMOLED, tiefes Lila) ---------------- */
    val GLASS = Palette(
        id = "glass", name = "Glass", emoji = "🌌", dark = true,
        chrome = Tokens(
            surface = 0xFF000000, card = 0xFF0E0B14, onSurface = 0xFFEDE7F6, muted = 0xFF8E86A0,
            line = 0xFF211C2B, accent = 0xFFB388FF, accentSoft = 0xFF1A1426, accent2 = 0xFF7C4DFF,
            success = 0xFF69F0AE, danger = 0xFFFF7A93, warn = 0xFFFFD180,
            gradA = 0xFF000000, gradB = 0xFF000000, gradC = 0xFF000000,
            neon = 0xFFB388FF, glass = 0x1CFFFFFF, glassBorder = 0x33FFFFFF,
        ),
        chat = Tokens(
            surface = 0xFF000000, card = 0xFF0A0810, onSurface = 0xFFF3EEFF, muted = 0xFF8E86A0,
            line = 0xFF211C2B, accent = 0xFFB388FF, accentSoft = 0xFF171021, accent2 = 0xFF7C4DFF,
            success = 0xFF69F0AE, danger = 0xFFFF7A93, warn = 0xFFFFD180,
            gradA = 0xFF000000, gradB = 0xFF06040C, gradC = 0xFF0B0616,
            neon = 0xFFB388FF, blue = 0xFF80D8FF, glass = 0x16FFFFFF, glassBorder = 0x2EFFFFFF,
            bubbleMineA = 0xFF4527A0, bubbleMineB = 0xFF7C4DFF,
        ),
    )

    /* ---------------- 📄 Paper (ruhig, creme) ---------------- */
    val PAPER = Palette(
        id = "paper", name = "Paper", emoji = "📄", dark = false,
        chrome = Tokens(
            surface = 0xFFFBF8F2, card = 0xFFFFFDF9, onSurface = 0xFF2E2822, muted = 0xFF8A8073,
            line = 0xFFEDE6DA, accent = 0xFFC2557A, accentSoft = 0xFFF7E9EA, accent2 = 0xFF7E6BA8,
            success = 0xFF4F8A5B, danger = 0xFFC0504D, warn = 0xFFC08A2E,
        ),
        chat = Tokens(
            surface = 0xFF2A2521, card = 0xFF36302A, onSurface = 0xFFF6F1E9, muted = 0xFFB0A697,
            line = 0x30FFFFFF, accent = 0xFFE08AA6, accentSoft = 0xFF36302A, accent2 = 0xFFA896D0,
            success = 0xFF9ED9A8, danger = 0xFFE58A87, warn = 0xFFE8C077,
            gradA = 0xFF2A2521, gradB = 0xFF322C27, gradC = 0xFF3A332C,
            neon = 0xFFE08AA6, blue = 0xFF9BC4E8, glass = 0x14FFFFFF, glassBorder = 0x2AFFFFFF,
            bubbleMineA = 0xFF7E6BA8, bubbleMineB = 0xFFC2557A,
        ),
    )

    val ALL = listOf(PINK, MIDNIGHT, GLASS, PAPER)

    fun byId(id: String?): Palette = ALL.firstOrNull { it.id == id } ?: PINK

    /* ---------------- Rechenbare Eigenschaften (testbar) ---------------- */

    /** Relative Helligkeit nach WCAG 2.1 */
    fun luminance(argb: Long): Double {
        fun ch(shift: Int): Double {
            val v = ((argb shr shift) and 0xFF).toInt() / 255.0
            return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0)
    }

    /** Kontrastverhältnis 1..21 (WCAG: 4.5 = lesbar, 7 = sehr gut) */
    fun contrast(fg: Long, bg: Long): Double {
        val a = luminance(fg)
        val b = luminance(bg)
        val hi = maxOf(a, b)
        val lo = minOf(a, b)
        return (hi + 0.05) / (lo + 0.05)
    }
}
