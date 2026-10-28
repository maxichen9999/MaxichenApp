package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

/**
 * V4.10 — Backup-Format. Echte Fälle, keine Statuscodes:
 *
 *  1) Rundreise: verschließen → öffnen → exakt dieselben Bytes
 *  2) falsches Passwort → null (nicht "irgendwas")
 *  3) ein gekipptes Bit → null (GCM-Tag merkt es)
 *  4) Header-Manipulation (Iterationen runterdrehen) → null
 *  5) abgeschnittene Datei → null (kein Absturz)
 *  6) zwei Backups desselben Inhalts sind verschieden (Salt + Nonce frisch)
 *  7) Header ist ohne Passwort lesbar, aber der Inhalt nicht
 *  8) Passwort-Bewertung sagt die Wahrheit
 *  9) FESTER VEKTOR: dieselbe Datei muss eine fremde Implementierung
 *     (Node.js, PBKDF2+AES-GCM) Byte für Byte nachbauen können
 */
class BackupTest {

    private val pw = "MaxiChat-Backup-Test-2026".toCharArray()

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

    @Test
    fun `Rundreise - dieselben Bytes kommen zurueck`() {
        val plain = "Hallo 💗".toByteArray()
        val file = Backup.seal(plain, pw)
        val back = Backup.open(file, pw)
        assertNotNull(back)
        assertTrue(plain.contentEquals(back!!))
    }

    @Test
    fun `falsches Passwort gibt null, nicht Unsinn`() {
        val file = Backup.seal("geheim".toByteArray(), pw)
        assertNull(Backup.open(file, "falsch".toCharArray()))
        assertNull(Backup.open(file, "".toCharArray()))
        assertNull(Backup.open(file, "MaxiChat-Backup-Test-202".toCharArray()))
    }

    @Test
    fun `ein gekipptes Bit macht die Datei unbrauchbar`() {
        val file = Backup.seal("geheim".toByteArray(), pw)
        // im Ciphertext kippen
        val a = file.copyOf(); a[file.size - 20] = (a[file.size - 20].toInt() xor 0x01).toByte()
        assertNull(Backup.open(a, pw))
        // im Tag kippen
        val b = file.copyOf(); b[file.size - 1] = (b[file.size - 1].toInt() xor 0x80).toByte()
        assertNull(Backup.open(b, pw))
    }

    @Test
    fun `Header-Manipulation - Iterationen runterdrehen scheitert`() {
        val file = Backup.seal("geheim".toByteArray(), pw)
        // Iterationen auf 100 (statt 310000) setzen -> Header passt nicht mehr zur AAD
        val tampered = file.copyOf()
        tampered[5] = 0; tampered[6] = 0; tampered[7] = 0; tampered[8] = 100
        assertNull("AAD muss den Header schützen", Backup.open(tampered, pw))
        // und peek lehnt zu wenige Iterationen ganz ab
        assertNull(Backup.peek(tampered))
    }

    @Test
    fun `abgeschnittene oder fremde Datei crasht nicht`() {
        assertNull(Backup.open(ByteArray(0), pw))
        assertNull(Backup.open(ByteArray(52), pw))
        assertNull(Backup.open("MCPK".toByteArray() + ByteArray(200), pw))
        val file = Backup.seal("geheim".toByteArray(), pw)
        assertNull(Backup.open(file.copyOfRange(0, 60), pw))    // mitten im Ciphertext abgeschnitten
    }

    @Test
    fun `zwei Backups desselben Inhalts sind verschieden`() {
        val a = Backup.seal("gleich".toByteArray(), pw)
        val b = Backup.seal("gleich".toByteArray(), pw)
        assertFalse("Salt+Nonce müssen frisch sein", a.contentEquals(b))
        // aber beide öffnen sich mit demselben Passwort
        assertEquals("gleich", String(Backup.open(a, pw)!!))
        assertEquals("gleich", String(Backup.open(b, pw)!!))
    }

    @Test
    fun `Header ist lesbar, Inhalt nicht`() {
        val file = Backup.seal("super-geheimer-text".toByteArray(), pw)
        val h = Backup.peek(file)
        assertNotNull(h)
        assertEquals(Backup.VERSION, h!!.version)
        assertEquals(Backup.DEFAULT_ITERATIONS, h.iterations)
        assertEquals(32, h.salt.size)
        assertEquals(12, h.nonce.size)
        // der Klartext darf nirgends in der Datei stehen
        assertFalse(String(file, Charsets.ISO_8859_1).contains("super-geheimer-text"))
    }

    @Test
    fun `Passwort-Bewertung sagt die Wahrheit`() {
        assertEquals(0, Backup.passwordScore("kurz".toCharArray()))
        assertEquals(1, Backup.passwordScore("12345678".toCharArray()))       // Länge ok, aber trivial
        assertEquals(1, Backup.passwordScore("aaaaaaaaaa".toCharArray()))
        assertTrue(Backup.passwordScore("MaxiChat!2026".toCharArray()) >= 2)
        assertTrue(Backup.passwordScore("MaxiChat!2026-langes-Passwort".toCharArray()) >= 3)
    }

    @Test
    fun `Payload-JSON ueberlebt Sonderzeichen`() {
        val p = BackupPayload.Payload(
            exportedAt = 1_760_000_000_000,
            accountId = "u_test",
            username = "test",
            displayName = "Test \"Account\" \\ mit \\Backslash",
            secrets = listOf(BackupPayload.Secret("ik_priv", "aGVsbG8=\n")),
            messageCache = linkedMapOf("c1" to "{\"m1\":\"Hallo 💗\"}"),
        )
        val json = p.toJson()
        assertTrue(json.contains("\\\"Account\\\""))
        assertTrue(json.contains("\\n"))
        assertTrue(json.contains("Hallo 💗"))
        assertTrue(json.startsWith("{\"format\":\"" + BackupPayload.FORMAT + "\""))
    }

    /* ------------------------------------------------------------------
       FESTER VEKTOR — fremde Gegenprobe
       Diese Werte werden von tests/backup-format.js (Node.js, eigene
       PBKDF2+AES-256-GCM-Implementierung) unabhängig nachgerechnet.
       Wenn beide dasselbe rausbekommen, ist das Format wirklich
       standardkonform und nicht "läuft nur bei uns".
       ------------------------------------------------------------------ */

    @Test
    fun `FESTER VEKTOR - Node muss dieselbe Datei bauen`() {
        val salt = hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
        val nonce = hex("000102030405060708090a0b")
        val pass = "MaxiChat-Backup-Test-2026".toCharArray()
        val plain = "{\"format\":\"maxichat-vault-backup-v1\",\"version\":1,\"probe\":\"vektor\"}".toByteArray()

        val file = Backup.seal(plain, pass, iterations = 310_000, salt = salt, nonce = nonce)

        // Diese drei Zeilen sind der Vertrag mit der Außenwelt:
        assertEquals("feste Dateigröße (Header 53 + Klartext + 16 Tag)", 53 + plain.size + 16, file.size)
        assertEquals("MCBK", String(file.copyOfRange(0, 4)))
        assertEquals(1, file[4].toInt())
        assertEquals(310_000, Backup.peek(file)!!.iterations)
        // ⬇️ DIESER HASH wird von tests/backup-format.js (Node, fremde
        //    PBKDF2+AES-GCM-Implementierung) unabhängig genauso berechnet.
        assertEquals(
            "c4bf83be5b17022419790180443bc10d465e05b1eab3f5f10cb3d8c42d17dddb",
            Backup.sha256(file),
        )
        // und die Rundreise muss mit genau dieser Datei klappen
        assertTrue(plain.contentEquals(Backup.open(file, pass)!!))
    }
}
