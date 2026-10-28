package de.maxichen.app.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V4.11 — Themes. Kein "sieht gut aus"-Test, sondern messbar:
 *
 *  · jeder Text hat mindestens WCAG-AA-Kontrast (4.5) auf seiner Fläche
 *  · Akzent-Buttons bleiben lesbar
 *  · dunkle Themes sind wirklich dunkel, helle wirklich hell
 *  · AMOLED/Glass hat echtes Schwarz (0xFF000000)
 *  · jede Palette ist vollständig (kein Feld vergessen)
 */
class MaxiPaletteTest {

    @Test
    fun `alle vier Themes sind da und eindeutig`() {
        assertEquals(4, MaxiPalettes.ALL.size)
        assertEquals(4, MaxiPalettes.ALL.map { it.id }.toSet().size)
        assertEquals(4, MaxiPalettes.ALL.map { it.name }.toSet().size)
    }

    @Test
    fun `byId faellt sauber auf Pink zurueck`() {
        assertEquals("pink", MaxiPalettes.byId(null).id)
        assertEquals("pink", MaxiPalettes.byId("gibtsnicht").id)
        assertEquals("midnight", MaxiPalettes.byId("midnight").id)
    }

    @Test
    fun `Text auf Karte hat ueberall mindestens 4_5 zu 1 Kontrast`() {
        for (p in MaxiPalettes.ALL) {
            for ((role, t) in listOf("chrome" to p.chrome, "chat" to p.chat)) {
                val c = MaxiPalettes.contrast(t.onSurface, t.card)
                assertTrue(
                    "${p.name}/$role Text auf Karte: ${"%.2f".format(c)}:1 ist zu blass",
                    c >= 4.5,
                )
            }
        }
    }

    @Test
    fun `Nebentext bleibt lesbar (mindestens 3 zu 1)`() {
        for (p in MaxiPalettes.ALL) {
            for ((role, t) in listOf("chrome" to p.chrome, "chat" to p.chat)) {
                val c = MaxiPalettes.contrast(t.muted, t.card)
                assertTrue("${p.name}/$role Nebentext: ${"%.2f".format(c)}:1", c >= 3.0)
            }
        }
    }

    @Test
    fun `Akzentfarbe hebt sich von der Karte ab`() {
        for (p in MaxiPalettes.ALL) {
            val c = MaxiPalettes.contrast(p.chrome.accent, p.chrome.card)
            assertTrue("${p.name} Akzent: ${"%.2f".format(c)}:1", c >= 2.5)
        }
    }

    @Test
    fun `dunkle Themes sind dunkel, helle sind hell`() {
        val mid = MaxiPalettes.MIDNIGHT
        val pink = MaxiPalettes.PINK
        assertTrue("Midnight", MaxiPalettes.luminance(mid.chrome.surface) < 0.05)
        assertTrue("Midnight-Text hell", MaxiPalettes.luminance(mid.chrome.onSurface) > 0.7)
        assertTrue("Pink", MaxiPalettes.luminance(pink.chrome.surface) > 0.85)
        assertTrue("Pink-Text dunkel", MaxiPalettes.luminance(pink.chrome.onSurface) < 0.1)
    }

    @Test
    fun `Glass ist echtes AMOLED-Schwarz`() {
        assertEquals(0xFF000000, MaxiPalettes.GLASS.chrome.surface)
        assertEquals(0xFF000000, MaxiPalettes.GLASS.chat.surface)
        assertTrue(MaxiPalettes.GLASS.dark)
    }

    @Test
    fun `jede Palette hat Chat-Verlauf und Glas-Alpha`() {
        for (p in MaxiPalettes.ALL) {
            assertTrue("${p.name}: Verlauf fehlt", p.chat.gradA != 0L)
            val alpha = ((p.chat.glass shr 24) and 0xFF).toInt()
            assertTrue("${p.name}: Glas-Alpha ${alpha} muss zwischen 8 und 60 liegen", alpha in 8..60)
            assertTrue("${p.name}: Glasrand fehlt", p.chat.glassBorder != 0L)
        }
    }

    @Test
    fun `Liquid-Glass bleibt transparent - kein deckender Balken`() {
        for (p in MaxiPalettes.ALL) {
            val alpha = ((p.chat.glass shr 24) and 0xFF).toInt()
            assertTrue("${p.name}: Alpha $alpha wäre nicht mehr gläsern", alpha < 0x60)
        }
    }

    @Test
    fun `Statusfarben sind unterscheidbar`() {
        for (p in MaxiPalettes.ALL) {
            val t = p.chrome
            assertTrue("${p.name}: grün/rot zu ähnlich", t.success != t.danger)
            assertTrue("${p.name}: rot/gold zu ähnlich", t.danger != t.warn)
            assertFalse("${p.name}: danger darf nicht transparent sein", (t.danger shr 24) and 0xFF < 0xFF)
        }
    }

    @Test
    fun `Kontrastrechnung stimmt mit bekannten Werten`() {
        // schwarz auf weiß ist exakt 21:1
        assertEquals(21.0, MaxiPalettes.contrast(0xFF000000, 0xFFFFFFFF), 0.01)
        // gleiche Farbe ist 1:1
        assertEquals(1.0, MaxiPalettes.contrast(0xFF336699, 0xFF336699), 0.01)
        // Reihenfolge egal (hell/dunkel vertauscht = gleicher Wert)
        assertEquals(
            MaxiPalettes.contrast(0xFF000000, 0xFFFFFFFF),
            MaxiPalettes.contrast(0xFFFFFFFF, 0xFF000000),
            0.001,
        )
    }
}
