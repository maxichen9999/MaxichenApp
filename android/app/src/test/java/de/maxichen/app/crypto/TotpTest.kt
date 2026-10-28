package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V4.12 — TOTP. Beweis gegen den STANDARD, nicht gegen mich selbst.
 *
 * 1) RFC 4226 (HOTP) — die 10 offiziellen Vektoren, 6-stellig
 * 2) RFC 6238 (TOTP) — die 6 offiziellen Vektoren, 8-stellig (SHA1)
 * 3) RFC 6238 dieselben Zeitpunkte 6-stellig (das ist, was die App nutzt)
 * 4) Base32 nach RFC 4648 — "foobar" muss "MZXW6YTBOI" ergeben
 * 5) Zeitfenster, Ablauf, Ablehnung von Unsinn
 * 6) otpauth://-URL muss von Authenticator-Apps verstanden werden
 */
class TotpTest {

    // Das Secret aus RFC 4226 / RFC 6238: ASCII "12345678901234567890"
    private val secret = "12345678901234567890".toByteArray()

    /* ---------------- RFC 4226 - HOTP ---------------- */

    @Test
    fun `RFC 4226 - alle zehn HOTP-Vektoren`() {
        val expected = listOf(
            "755224", "287082", "359152", "969429", "338314",
            "254676", "287922", "162583", "399871", "520489",
        )
        expected.forEachIndexed { counter, exp ->
            assertEquals("HOTP counter=$counter", exp, Totp.hotp(secret, counter.toLong(), 6))
        }
    }

    /* ---------------- RFC 6238 - TOTP ---------------- */

    @Test
    fun `RFC 6238 - alle sechs TOTP-Vektoren (8 Stellen, SHA1)`() {
        // exakt die Tabelle aus RFC 6238, Anhang B
        val vectors = listOf(
            59L to "94287082",
            1111111109L to "07081804",
            1111111111L to "14050471",
            1234567890L to "89005924",
            2000000000L to "69279037",
            20000000000L to "65353130",
        )
        for ((t, exp) in vectors) {
            assertEquals("TOTP T=$t", exp, Totp.totp(secret, t, 8))
        }
    }

    @Test
    fun `RFC 6238 - dieselben Zeitpunkte mit 6 Stellen (was die App nutzt)`() {
        val vectors = listOf(
            59L to "287082",
            1111111109L to "081804",
            1111111111L to "050471",
            1234567890L to "005924",
            2000000000L to "279037",
            20000000000L to "353130",
        )
        for ((t, exp) in vectors) {
            assertEquals("TOTP T=$t (6)", exp, Totp.totp(secret, t, 6))
        }
    }

    @Test
    fun `zwei Zeitpunkte in derselben Periode geben denselben Code`() {
        // Periode 30: t=60 und t=89 liegen im selben Fenster
        assertEquals(Totp.totp(secret, 60), Totp.totp(secret, 89))
        // t=90 ist das naechste
        assertTrue(Totp.totp(secret, 60) != Totp.totp(secret, 90))
    }

    /* ---------------- Base32 ---------------- */

    @Test
    fun `Base32 nach RFC 4648`() {
        assertEquals("MZXW6YTBOI", Totp.base32Encode("foobar".toByteArray()))
        assertEquals("MZXW6", Totp.base32Encode("foo".toByteArray()))
        // RFC 4648, Tabelle 1 (ohne Padding): "f"->MY, "fo"->MZXQ, "foo"->MZXW6
        assertEquals("MY", Totp.base32Encode("f".toByteArray()))
        assertEquals("MZXQ", Totp.base32Encode("fo".toByteArray()))
        assertEquals("MZXW6YQ", Totp.base32Encode("foob".toByteArray()))
        assertEquals("MZXW6YTB", Totp.base32Encode("fooba".toByteArray()))
        // RFC-Testvektor Base32-Dekodierung
        assertTrue("foobar".toByteArray().contentEquals(Totp.base32Decode("MZXW6YTBOI")))
        assertTrue("foobar".toByteArray().contentEquals(Totp.base32Decode("mzxw6ytboi")))
    }

    @Test
    fun `Base32 Rundreise mit echtem Secret`() {
        val s = Totp.newSecret()
        val enc = Totp.base32Encode(s)
        assertTrue("Secret muss die Base32-Rundreise ueberleben", s.contentEquals(Totp.base32Decode(enc)))
        assertEquals(32, enc.length)   // 20 Byte -> 32 Zeichen
    }

    @Test
    fun `das RFC-Secret in Base32 sieht aus wie bei Google`() {
        assertEquals("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", Totp.base32Encode(secret))
    }

    /* ---------------- otpauth-URL ---------------- */

    @Test
    fun `otpauth-URL hat alle Parameter die Authenticator-Apps erwarten`() {
        val cfg = Totp.Config(secret = secret, account = "test", issuer = "MaxiChat")
        val url = Totp.otpauthUrl(cfg)
        // Der Doppelpunkt MUSS unkodiert bleiben, sonst verstehen Apps den Namen nicht
        assertTrue(url, url.startsWith("otpauth://totp/MaxiChat:test?"))
        assertFalse("Doppelpunkt darf nicht %3A sein", url.contains("%3A"))
        assertTrue(url, url.contains("secret=" + Totp.base32Encode(secret)))
        assertTrue(url, url.contains("issuer=MaxiChat"))
        assertTrue(url, url.contains("algorithm=SHA1"))
        assertTrue(url, url.contains("digits=6"))
        assertTrue(url, url.contains("period=30"))
    }

    @Test
    fun `otpauth-URL maskiert Sonderzeichen im Konto`() {
        val cfg = Totp.Config(secret = secret, account = "a b+c@d.e", issuer = "Maxi Chat")
        val url = Totp.otpauthUrl(cfg)
        assertFalse("Leerzeichen muss maskiert sein", url.contains("Maxi Chat"))
        assertTrue(url, url.contains("Maxi%20Chat"))
    }

    /* ---------------- Prüfung ---------------- */

    @Test
    fun `verify akzeptiert den richtigen Code`() {
        val t = 1_700_000_000L
        val code = Totp.totp(secret, t)
        assertTrue(Totp.verify(secret, code, t))
    }

    @Test
    fun `verify erlaubt ein Fenster von einer Periode`() {
        val t = 1_700_000_000L
        val prev = Totp.totp(secret, t - 30)
        val next = Totp.totp(secret, t + 30)
        assertTrue("vorherige Periode", Totp.verify(secret, prev, t))
        assertTrue("naechste Periode", Totp.verify(secret, next, t))
        // zwei Perioden daneben = abgelehnt
        assertFalse(Totp.verify(secret, Totp.totp(secret, t - 60), t))
        assertFalse(Totp.verify(secret, Totp.totp(secret, t + 60), t))
    }

    @Test
    fun `verify lehnt Unsinn ab, ohne zu werfen`() {
        val t = 1_700_000_000L
        assertFalse(Totp.verify(secret, "", t))
        assertFalse(Totp.verify(secret, "12345", t))       // zu kurz
        assertFalse(Totp.verify(secret, "1234567", t))     // zu lang
        assertFalse(Totp.verify(secret, "abcdef", t))      // keine Ziffern
        assertFalse(Totp.verify(secret, "000000", t))      // falsch
    }

    @Test
    fun `Leerzeichen im Code werden ignoriert - Nutzer tippen "123 456"`() {
        val t = 1_700_000_000L
        val code = Totp.totp(secret, t)
        val spaced = code.substring(0, 3) + " " + code.substring(3)
        assertTrue(Totp.verify(secret, spaced, t))
    }

    @Test
    fun `zwei verschiedene Secrets geben verschiedene Codes`() {
        val t = 1_700_000_000L
        val a = Totp.totp(Totp.newSecret(), t)
        val b = Totp.totp(Totp.newSecret(), t)
        // astronomisch unwahrscheinlich, dass sie gleich sind
        assertFalse(a == b)
    }

    /* ---------------- Zeit ---------------- */

    @Test
    fun `secondsRemaining zaehlt richtig runter`() {
        assertEquals(30, Totp.secondsRemaining(0))
        assertEquals(29, Totp.secondsRemaining(1))
        assertEquals(1, Totp.secondsRemaining(29))
        assertEquals(30, Totp.secondsRemaining(30))
    }

    @Test
    fun `prettySecret gruppiert in Viererbloecke`() {
        val p = Totp.prettySecret(secret)
        assertEquals(32 + 7, p.length)     // 32 Zeichen + 7 Trennzeichen
        assertTrue(p.startsWith("GEZD GNBV"))
    }

    @Test
    fun `newConfig erzeugt brauchbares 20-Byte-Secret`() {
        val c = Totp.newConfig("test")
        assertEquals(20, c.secret.size)
        assertEquals(6, c.digits)
        assertEquals(30, c.period)
        // zwei Aufrufe duerfen nie dasselbe Secret geben
        assertFalse(Totp.newConfig("a").secret.contentEquals(Totp.newConfig("a").secret))
    }
}
