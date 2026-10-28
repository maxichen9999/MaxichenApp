package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64
import javax.crypto.spec.SecretKeySpec

/**
 * V4.8 — SecretBox (die Hülle um jeden privaten Schlüssel).
 *
 * Auf dem Gerät kommt der Schlüssel aus dem AndroidKeyStore (nicht
 * exportierbar). Hier läuft DERSELBE Code mit einem SecretKeySpec —
 * deshalb ist genau das testbar, was auch auf dem Handy passiert:
 *
 * 1) verschlüsseln → entschlüsseln
 * 2) manipulierter Ciphertext fällt auf
 * 3) manipulierter IV fällt auf
 * 4) falscher Schlüssel öffnet nichts
 * 5) jeder Aufruf würfelt einen neuen IV (kein ECB-Muster)
 * 6) AAD bindet an den Eintragsnamen (Umsetzen unmöglich)
 * 7) Format ist stabil (sb1:…), Migrationsplan erkennt alte Klartextdaten
 * 8) leerer und großer Inhalt
 */
class SecretBoxTest {

    private fun key(seed: Byte = 7) = SecretKeySpec(ByteArray(32) { seed }, "AES")
    private val aad = SecretBox.aad("ik_priv")

    @Test
    fun `verschluesseln und entschluesseln`() {
        val k = key()
        val plain = "mein privater X25519-Schlüssel 💗".toByteArray(Charsets.UTF_8)
        val blob = SecretBox.seal(k, plain, aad)
        assertTrue("Format muss sb1: sein", blob.startsWith(SecretBox.PREFIX))
        val back = SecretBox.open(k, blob, aad)
        assertEquals(String(plain), String(back!!))
    }

    @Test
    fun `manipulierter Ciphertext faellt auf`() {
        val k = key()
        val blob = SecretBox.seal(k, "geheim".toByteArray(), aad)
        val parts = blob.removePrefix(SecretBox.PREFIX).split(":")
        val ct = Base64.getDecoder().decode(parts[1])
        ct[ct.size / 2] = (ct[ct.size / 2].toInt() xor 0x01).toByte()
        val broken = SecretBox.PREFIX + parts[0] + ":" + Base64.getEncoder().encodeToString(ct)
        assertNull("Manipulation muss null liefern", SecretBox.open(k, broken, aad))
    }

    @Test
    fun `manipulierter IV faellt auf`() {
        val k = key()
        val blob = SecretBox.seal(k, "geheim".toByteArray(), aad)
        val parts = blob.removePrefix(SecretBox.PREFIX).split(":")
        val iv = Base64.getDecoder().decode(parts[0])
        iv[0] = (iv[0].toInt() xor 0x01).toByte()
        val broken = SecretBox.PREFIX + Base64.getEncoder().encodeToString(iv) + ":" + parts[1]
        assertNull(SecretBox.open(k, broken, aad))
    }

    @Test
    fun `falscher Schluessel oeffnet nichts`() {
        val blob = SecretBox.seal(key(7), "geheim".toByteArray(), aad)
        assertNull(SecretBox.open(key(9), blob, aad))
    }

    @Test
    fun `jeder Aufruf hat einen neuen IV`() {
        val k = key()
        val ivs = (1..20).map {
            SecretBox.seal(k, "gleicher Text".toByteArray(), aad).removePrefix(SecretBox.PREFIX).substringBefore(':')
        }
        assertEquals("20 Verschlüsselungen müssen 20 verschiedene IVs haben", 20, ivs.toSet().size)
        val blobs = (1..5).map { SecretBox.seal(k, "gleich".toByteArray(), aad) }
        assertEquals("gleicher Klartext darf nie gleich aussehen", 5, blobs.toSet().size)
    }

    @Test
    fun `AAD bindet an den Eintragsnamen`() {
        val k = key()
        val blob = SecretBox.seal(k, "wert".toByteArray(), SecretBox.aad("ik_priv"))
        assertNull("unter anderem Namen darf es nicht aufgehen", SecretBox.open(k, blob, SecretBox.aad("sign_priv")))
        assertEquals("wert", String(SecretBox.open(k, blob, SecretBox.aad("ik_priv"))!!))
    }

    @Test
    fun `leerer Inhalt funktioniert`() {
        val k = key()
        val blob = SecretBox.seal(k, ByteArray(0), aad)
        assertTrue(blob.startsWith(SecretBox.PREFIX))
        assertEquals(0, SecretBox.open(k, blob, aad)!!.size)
    }

    @Test
    fun `grosser Inhalt - 100 KB Session-Blob`() {
        val k = key()
        val plain = ByteArray(100_000) { (it % 251).toByte() }
        val blob = SecretBox.seal(k, plain, aad)
        assertTrue(SecretBox.open(k, blob, aad)!!.contentEquals(plain))
    }

    @Test
    fun `kaputte Formate werden abgelehnt statt zu werfen`() {
        val k = key()
        assertNull(SecretBox.open(k, "kein-prefix", aad))
        assertNull(SecretBox.open(k, "sb1:", aad))
        assertNull(SecretBox.open(k, "sb1:abc", aad))
        assertNull(SecretBox.open(k, "sb1:!!!:???", aad))
        assertNull(SecretBox.open(k, "sb1:::", aad))
    }

    @Test
    fun `Migrationsplan erkennt alte Klartextdaten`() {
        assertEquals(SecretBox.Plan.NONE, SecretBox.plan(null))
        assertEquals(SecretBox.Plan.MIGRATE, SecretBox.plan("aGVsbG8="))          // V4.4–V4.7: Base64 im Klartext
        assertEquals(SecretBox.Plan.MIGRATE, SecretBox.plan(""))
        assertEquals(SecretBox.Plan.SEALED, SecretBox.plan(SecretBox.seal(key(), "x".toByteArray(), aad)))
    }

    @Test
    fun `Migration verliert nichts - alter Klartext bleibt lesbar`() {
        // so läuft es auf dem Gerät: alter Klartext rein, versiegelt raus, gleicher Wert
        val k = key()
        val alt = "cHJpdmF0ZXItc2NobHVlc3NlbA=="
        val versiegelt = SecretBox.seal(k, alt.toByteArray(), aad)
        assertEquals(alt, String(SecretBox.open(k, versiegelt, aad)!!))
        assertFalse("nach der Migration darf der Klartext nicht mehr drinstehen", versiegelt.contains(alt))
    }

    @Test
    fun `isSealed erkennt Huelle und Klartext`() {
        val k = key()
        assertTrue(SecretBox.isSealed(SecretBox.seal(k, "x".toByteArray(), aad)))
        assertFalse(SecretBox.isSealed("aGVsbG8="))
        assertFalse(SecretBox.isSealed(null))
    }

    @Test
    fun `zwei Schluessel - gleiche Daten, andere Huelle`() {
        val a = SecretBox.seal(key(1), "gleich".toByteArray(), aad)
        val b = SecretBox.seal(key(2), "gleich".toByteArray(), aad)
        assertNotEquals(a, b)
        assertNull(SecretBox.open(key(1), b, aad))
    }
}
