package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

/**
 * V4.9 — ML-KEM-768 (FIPS 203) gegen eine UNABHÄNGIGE Referenz.
 *
 * Die Erwartungswerte wurden mit `kyber-py` (reine Python-Implementierung
 * von FIPS 203, andere Codebasis, anderer Autor) aus demselben Seed
 * erzeugt. Verglichen werden SHA-256-Hashes von ek/dk/ct/ss — wenn die
 * passen, sind die Bytes identisch.
 *
 * Zusätzlich: SHA3/SHAKE-Vektoren (FIPS 202) und die KEM-Sicherheit
 * (manipulierter Ciphertext → anderer Schlüssel, kein Absturz).
 */
class MlKemTest {

    private fun hex(s: String): ByteArray {
        val out = ByteArray(s.length / 2)
        for (i in out.indices) out[i] = ((s.substring(2 * i, 2 * i + 2)).toInt(16)).toByte()
        return out
    }

    private fun sha256(b: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    /* ---------------- FIPS 202: die Basis muss stimmen ---------------- */

    @Test
    fun `SHA3-256 und SHA3-512 nach FIPS 202`() {
        assertEquals(
            "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
            Keccak.sha3_256(ByteArray(0)).joinToString("") { "%02x".format(it) },
        )
        assertEquals(
            "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
            Keccak.sha3_256("abc".toByteArray()).joinToString("") { "%02x".format(it) },
        )
        assertEquals(
            "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
            Keccak.sha3_512("abc".toByteArray()).joinToString("") { "%02x".format(it) },
        )
    }

    @Test
    fun `SHAKE128 und SHAKE256 nach FIPS 202`() {
        assertEquals(
            "7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26",
            Keccak.shake128(ByteArray(0), 32).joinToString("") { "%02x".format(it) },
        )
        assertEquals(
            "46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762fd75dc4ddd8c0f200cb05019d67b592f6fc821c49479ab48640292eacb3b7c4be",
            Keccak.shake256(ByteArray(0), 64).joinToString("") { "%02x".format(it) },
        )
    }

    @Test
    fun `XOF-Stream liefert dasselbe wie Einzelaufruf`() {
        val seed = "kyber-xof".toByteArray()
        val one = Keccak.shake128(seed, 900)
        val xof = Keccak.xofShake128(seed)
        val a = xof.read(400); val b = xof.read(500)
        assertTrue(one.contentEquals(a + b))
    }

    /* ---------------- ML-KEM-768 gegen kyber-py ---------------- */

    @Test
    fun `ML-KEM-768 Vektor 0 - stimmt Byte fuer Byte mit der Referenz`() {
        val seed = hex("000102030405060725262728292a2b2c4a4b4c4d4e4f50516f707172737475769495969798999a9bb9babbbcbdbebfc0dedfe0e1e2e3e4e5030405060708090a")
        val m = hex("050c131a21282f3660676e757c838a91bbc2c9d0d7dee5ec161d242b32394047")
        val (ek, dk) = MlKem768.keygen(seed.copyOfRange(0, 32), seed.copyOfRange(32, 64))
        assertEquals(MlKem768.EK_BYTES, ek.size)
        assertEquals(MlKem768.DK_BYTES, dk.size)
        assertEquals("bd5348f67ace9c3eaeaef953e145bf9b0c509d13109756d233663c7313b730b2", sha256(ek))
        assertEquals("bd6317703f5d0c2adfa056ced133254408a40755165f78f5b47741cd4365dc09", sha256(dk))

        val (ss, ct) = MlKem768.encaps(ek, m)
        assertEquals(MlKem768.CT_BYTES, ct.size)
        assertEquals("a77808db775cbdb4c42f83d4476e89f35d1b1279286f44a2f7e159a6d13e1d34", sha256(ct))
        assertEquals("9ad58db0547d1ebbbf19367d7a11201459130712e06a6c3f0a5e0ded4794e634", sha256(ss))

        val back = MlKem768.decaps(dk, ct)
        assertTrue("Empfänger muss denselben Schlüssel bekommen", back.contentEquals(ss))
    }

    @Test
    fun `ML-KEM-768 Vektor 1 - stimmt Byte fuer Byte mit der Referenz`() {
        val seed = hex("0b0c0d0e0f101112303132333435363755565758595a5b5c7a7b7c7d7e7f80819fa0a1a2a3a4a5a6c4c5c6c7c8c9cacbe9eaebecedeeeff00e0f101112131415")
        val m = hex("080f161d242b3239636a71787f868d94bec5ccd3dae1e8ef1920272e353c434a")
        val (ek, dk) = MlKem768.keygen(seed.copyOfRange(0, 32), seed.copyOfRange(32, 64))
        assertEquals(MlKem768.EK_BYTES, ek.size)
        assertEquals(MlKem768.DK_BYTES, dk.size)
        assertEquals("67be1a1a544419ab73f6a83f6a35e6f716e2284bd8e24f9de84109b6e4855adb", sha256(ek))
        assertEquals("16a76e0ec68a398117a1485d00cf5f2b395f8f21b3df31201f79d271ca650838", sha256(dk))

        val (ss, ct) = MlKem768.encaps(ek, m)
        assertEquals(MlKem768.CT_BYTES, ct.size)
        assertEquals("2b1c8decd10a78db64308163b251bf73f9853345e77494464c0c0aa2ada19cb4", sha256(ct))
        assertEquals("444979c4b007823c623f3969202d254e6eb1ba1eb9c08d665f264f564752c292", sha256(ss))

        val back = MlKem768.decaps(dk, ct)
        assertTrue("Empfänger muss denselben Schlüssel bekommen", back.contentEquals(ss))
    }

    @Test
    fun `ML-KEM-768 Vektor 2 - stimmt Byte fuer Byte mit der Referenz`() {
        val seed = hex("161718191a1b1c1d3b3c3d3e3f404142606162636465666785868788898a8b8caaabacadaeafb0b1cfd0d1d2d3d4d5d6f4f5f6f7f8f9fafb191a1b1c1d1e1f20")
        val m = hex("0b121920272e353c666d747b82899097c1c8cfd6dde4ebf21c232a31383f464d")
        val (ek, dk) = MlKem768.keygen(seed.copyOfRange(0, 32), seed.copyOfRange(32, 64))
        assertEquals(MlKem768.EK_BYTES, ek.size)
        assertEquals(MlKem768.DK_BYTES, dk.size)
        assertEquals("e3d02ad154dba4c109d6656d097d9a85b71b57791f21231ae218d24c3776cf40", sha256(ek))
        assertEquals("41476f1012789a09ade4dac71910eb915ed9fd3d7fba16b4d99580bf84699760", sha256(dk))

        val (ss, ct) = MlKem768.encaps(ek, m)
        assertEquals(MlKem768.CT_BYTES, ct.size)
        assertEquals("bc5e30b2e8cb6f6735432894cb13fbd9c3e56fd29e494bdde8975182c0bbf576", sha256(ct))
        assertEquals("5578cbe1630662a39e64b3a77a00125cf67f2145f857434a5b5e5b61a1888e9a", sha256(ss))

        val back = MlKem768.decaps(dk, ct)
        assertTrue("Empfänger muss denselben Schlüssel bekommen", back.contentEquals(ss))
    }

    @Test
    fun `Groesse der Schluessel ist FIPS-konform`() {
        val (ek, dk) = MlKem768.keygenRandom()
        assertEquals(1184, ek.size)
        assertEquals(2400, dk.size)
        val (ss, ct) = MlKem768.encapsRandom(ek)
        assertEquals(32, ss.size)
        assertEquals(1088, ct.size)
    }

    @Test
    fun `Handshake - beide Seiten bekommen denselben Schluessel`() {
        val (ek, dk) = MlKem768.keygenRandom()
        repeat(5) {
            val (ss, ct) = MlKem768.encapsRandom(ek)
            assertTrue(MlKem768.decaps(dk, ct).contentEquals(ss))
        }
    }

    @Test
    fun `manipulierter Ciphertext - implizite Ablehnung greift`() {
        val (ek, dk) = MlKem768.keygenRandom()
        val (ss, ct) = MlKem768.encapsRandom(ek)
        val broken = ct.copyOf()
        broken[broken.size / 2] = (broken[broken.size / 2].toInt() xor 0x01).toByte()

        val out = MlKem768.decaps(dk, broken)   // darf NICHT werfen
        assertNotNull(out)
        assertEquals(32, out.size)
        assertFalse("manipulierter Ciphertext darf nicht denselben Schlüssel geben", out.contentEquals(ss))
    }

    @Test
    fun `falscher Ciphertext - kein Absturz, anderer Schluessel`() {
        val (_, dk) = MlKem768.keygenRandom()
        val (ek2, _) = MlKem768.keygenRandom()
        val (ss2, ct2) = MlKem768.encapsRandom(ek2)
        val out = MlKem768.decaps(dk, ct2)      // Ciphertext für einen anderen Schlüssel
        assertFalse(out.contentEquals(ss2))
    }

    @Test
    fun `zwei KeyGen-Laeufe sind verschieden`() {
        val (a1, _) = MlKem768.keygenRandom()
        val (a2, _) = MlKem768.keygenRandom()
        assertFalse(a1.contentEquals(a2))
    }

    @Test
    fun `falsche Groessen werden abgelehnt`() {
        try { MlKem768.keygen(ByteArray(16), ByteArray(32)); assertTrue("hätte werfen müssen", false) }
        catch (e: IllegalArgumentException) { }
        try { MlKem768.encaps(ByteArray(10), ByteArray(32)); assertTrue("hätte werfen müssen", false) }
        catch (e: IllegalArgumentException) { }
        try { MlKem768.decaps(ByteArray(10), ByteArray(1088)); assertTrue("hätte werfen müssen", false) }
        catch (e: IllegalArgumentException) { }
    }
}
