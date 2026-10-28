package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * KEINE Gefälligkeitstests: hier stehen die OFFIZIELLEN Testvektoren
 * aus RFC 7748 §5.2. Wenn die Implementierung auch nur ein Bit falsch
 * rechnet, fallen diese Tests.
 */
class Curve25519Test {

    private fun hex(s: String): ByteArray {
        val clean = s.replace(" ", "").replace("\n", "")
        return ByteArray(clean.length / 2) {
            ((Character.digit(clean[it * 2], 16) shl 4) + Character.digit(clean[it * 2 + 1], 16)).toByte()
        }
    }

    private fun toHex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }

    @Test
    fun `RFC 7748 Vektor 1 - scalar mult`() {
        val k = hex("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4")
        val u = hex("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c")
        val expected = "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552"
        assertEquals(expected, toHex(Curve25519.scalarMult(k, u)))
    }

    @Test
    fun `RFC 7748 Vektor 2 - scalar mult`() {
        val k = hex("4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d")
        val u = hex("e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493")
        val expected = "95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957"
        assertEquals(expected, toHex(Curve25519.scalarMult(k, u)))
    }

    @Test
    fun `RFC 7748 - public key from private (base point)`() {
        val priv = hex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
        val expected = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a"
        assertEquals(expected, toHex(Curve25519.publicKey(priv)))
    }

    @Test
    fun `Diffie-Hellman stimmt ueberein`() {
        val a = Curve25519.pair()
        val b = Curve25519.pair()
        val sa = Curve25519.sharedSecret(a.first, b.second)
        val sb = Curve25519.sharedSecret(b.first, a.second)
        assertTrue(sa.contentEquals(sb))
        assertEquals(32, sa.size)
    }

    @Test
    fun `verschiedene Partner ergeben verschiedene Secrets`() {
        val a = Curve25519.pair()
        val b = Curve25519.pair()
        val c = Curve25519.pair()
        val s1 = Curve25519.sharedSecret(a.first, b.second)
        val s2 = Curve25519.sharedSecret(a.first, c.second)
        assertTrue(!s1.contentEquals(s2))
    }
}
