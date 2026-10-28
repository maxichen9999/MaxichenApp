package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom

/**
 * V4.12 — PIN-Lock + Recovery Codes.
 *
 * Was hier bewiesen wird:
 *  · PIN steht nirgends im Klartext, gleiche PIN + anderer Salt = anderer Hash
 *  · Fehlversuche werden bestraft (sonst ist eine 4-stellige PIN in Sekunden weg)
 *  · Recovery-Code geht GENAU EINMAL
 *  · ein gestohlener Hash hilft nicht (man kann ihn nicht als Code eingeben)
 *  · Punkte/Striche/Bindestriche beim Eingeben werden toleriert
 */
class AuthTest {

    /* ================= 🎫 Recovery Codes ================= */

    @Test
    fun `erzeugt zehn eindeutige Codes`() {
        val g = RecoveryCodes.generate()
        assertEquals(10, g.plain.size)
        assertEquals(10, g.entries.size)
        assertEquals("keine Dubletten", 10, g.plain.toSet().size)
        g.plain.forEach { assertEquals(8, it.length) }
    }

    @Test
    fun `Alphabet ohne Verwechslungszeichen`() {
        val g = RecoveryCodes.generate(count = 50)
        val used = g.plain.joinToString("").toSet()
        listOf('O', '0', 'I', '1', 'L').forEach {
            assertFalse("'$it' darf nicht vorkommen — verwechselt man auf Papier", it in used)
        }
    }

    @Test
    fun `ein Recovery-Code funktioniert genau einmal`() {
        val g = RecoveryCodes.generate()
        val code = g.plain[3]
        val idx = RecoveryCodes.verify(code, g.entries)
        assertEquals(3, idx)

        // nach Verbrauch
        val after = RecoveryCodes.markUsed(g.entries, idx)
        assertEquals(-1, RecoveryCodes.verify(code, after))
        assertEquals(9, RecoveryCodes.remaining(after))
    }

    @Test
    fun `falscher Code wird abgelehnt`() {
        val g = RecoveryCodes.generate()
        assertEquals(-1, RecoveryCodes.verify("ZZZZZZZZ", g.entries))
        assertEquals(-1, RecoveryCodes.verify("ABC", g.entries))
        assertEquals(-1, RecoveryCodes.verify("", g.entries))
    }

    @Test
    fun `Anzeigeformat mit Bindestrich wird akzeptiert`() {
        val g = RecoveryCodes.generate()
        val code = g.plain[0]
        val pretty = RecoveryCodes.format(code)
        assertEquals(9, pretty.length)     // 8 + Bindestrich
        assertTrue(pretty.contains("-"))
        assertEquals(0, RecoveryCodes.verify(pretty, g.entries))
        // klein geschrieben + mit Leerzeichen geht auch
        assertEquals(0, RecoveryCodes.verify(" " + pretty.lowercase() + " ", g.entries))
    }

    @Test
    fun `gespeicherte Hashes verraten den Code nicht`() {
        val g = RecoveryCodes.generate()
        val code = g.plain[0]
        val entry = g.entries[0]
        assertFalse("Klartext darf nicht im Hash stecken", entry.hashB64.contains(code))
        assertFalse("Salt darf nicht der Code sein", entry.saltB64 == code)
        // und der Hash ist nicht der Code
        assertTrue(entry.hashB64.length > 20)
    }

    @Test
    fun `zwei Saetze Codes sind verschieden und unabhaengig`() {
        val a = RecoveryCodes.generate()
        val b = RecoveryCodes.generate()
        assertFalse(a.plain.toSet().intersect(b.plain.toSet()).isNotEmpty())
        // Codes vom einen Satz dürfen im anderen NICHT gehen
        assertEquals(-1, RecoveryCodes.verify(a.plain[0], b.entries))
    }

    @Test
    fun `Serialisierung ueberlebt encode-decode inklusive used`() {
        var entries = RecoveryCodes.generate().entries
        entries = RecoveryCodes.markUsed(entries, 2)
        val back = RecoveryCodes.decode(RecoveryCodes.encode(entries))
        assertEquals(10, back.size)
        assertEquals(9, RecoveryCodes.remaining(back))
        assertTrue(back[2].used)
        assertFalse(back[0].used)
    }

    @Test
    fun `kaputte Serialisierung crasht nicht`() {
        assertEquals(0, RecoveryCodes.decode("").size)
        assertEquals(0, RecoveryCodes.decode("nonsense").size)
        assertEquals(0, RecoveryCodes.decode("1,abc").size)
    }

    /* ================= 🔑 PIN ================= */

    @Test
    fun `PIN wird nie im Klartext gespeichert`() {
        val s = PinLock.store("4712")
        assertFalse(s.hashB64.contains("4712"))
        assertFalse(s.saltB64.contains("4712"))
        assertTrue(s.hashB64.length > 20)
    }

    @Test
    fun `richtige PIN oeffnet, falsche nicht`() {
        val s = PinLock.store("4712")
        assertTrue(PinLock.verify("4712", s))
        assertFalse(PinLock.verify("4713", s))
        assertFalse(PinLock.verify("471", s))
        assertFalse(PinLock.verify("47120", s))
    }

    @Test
    fun `gleiche PIN mit anderem Salt ergibt anderen Hash`() {
        val a = PinLock.store("4712")
        val b = PinLock.store("4712")
        assertFalse("Salt muss frisch sein", a.saltB64 == b.saltB64)
        assertFalse("Hash muss anders sein", a.hashB64 == b.hashB64)
        // beide öffnen sich aber
        assertTrue(PinLock.verify("4712", a))
        assertTrue(PinLock.verify("4712", b))
    }

    @Test
    fun `triviale PINs werden abgelehnt`() {
        assertNotNull(PinLock.validate("1111"))
        assertNotNull(PinLock.validate("0000"))
        assertNotNull(PinLock.validate("1234"))
        assertNotNull(PinLock.validate("4321"))
        assertNotNull(PinLock.validate("471"))      // zu kurz
        assertNotNull(PinLock.validate("abcd"))
        assertNotNull(PinLock.validate(""))
        assertNull(PinLock.validate("4712"))
        assertNull(PinLock.validate("901375"))
    }

    @Test
    fun `Fehlversuche erzeugen wachsende Pause`() {
        val t = 1_000_000L
        assertEquals("0 Fehlversuche = frei", 0, PinLock.lockoutRemaining(0, t, t))
        assertEquals("1 Fehlversuch = noch frei", 0, PinLock.lockoutRemaining(1, t, t))
        assertEquals(30_000, PinLock.lockoutRemaining(3, t, t))
        assertEquals(120_000, PinLock.lockoutRemaining(4, t, t))
        assertEquals(600_000, PinLock.lockoutRemaining(5, t, t))
        // nach Ablauf wieder frei
        assertEquals(0, PinLock.lockoutRemaining(3, t, t + 40_000))
        // halb abgelaufen
        assertEquals(15_000, PinLock.lockoutRemaining(3, t, t + 15_000))
    }

    @Test
    fun `Sperrtext ist lesbar`() {
        assertTrue(PinLock.lockoutText(30_000).contains("Sekunden"))
        assertTrue(PinLock.lockoutText(120_000).contains("Minuten"))
        assertTrue(PinLock.lockoutText(3_600_000).contains("Stunde"))
        assertEquals("", PinLock.lockoutText(0))
    }

    @Test
    fun `PIN-Speicherung ueberlebt serialize und parse`() {
        val s = PinLock.store("901375")
        val back = PinLock.decode(PinLock.encode(s))
        assertNotNull(back)
        assertTrue(PinLock.verify("901375", back!!))
        assertEquals(6, back.length)
    }

    @Test
    fun `kaputter PIN-Speicher gibt null statt Absturz`() {
        assertNull(PinLock.decode(null))
        assertNull(PinLock.decode(""))
        assertNull(PinLock.decode("abc"))
        assertNull(PinLock.decode("a,b,xyz"))
    }

    @Test
    fun `PinLock ist nicht brutal schnell - PBKDF2 kostet wirklich Zeit`() {
        val rnd = SecureRandom()
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        val t0 = System.nanoTime()
        PinLock.hash("123456", salt)
        val ms = (System.nanoTime() - t0) / 1_000_000
        // Wenn das unter 20 ms liegt, hat jemand die Iterationen kaputt gemacht
        assertTrue("PBKDF2 zu schnell (${ms} ms) — Iterationen prüfen", ms >= 20)
    }
}
