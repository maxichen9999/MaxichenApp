package de.maxichen.app.crypto

/* =====================================================================
   🔐 Curve25519 (X25519) — RFC 7748, pure Kotlin
   ---------------------------------------------------------------------
   Warum selbst? minSdk 26 → java.security "X25519" gibt es erst ab
   Android 13 / JDK 11. Eine Bibliothek (Tink) wäre eine weitere
   Abhängigkeit mit eigener CVE-Geschichte. Diese Implementierung ist
   klein, ohne Nebenwirkungen und wird mit den OFFIZIELLEN RFC-7748-
   Testvektoren geprüft (siehe Curve25519Test).
   ===================================================================== */

import java.math.BigInteger
import java.security.SecureRandom

object Curve25519 {
    private val P: BigInteger = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19))
    private val A24: BigInteger = BigInteger.valueOf(121665)
    private val ONE = BigInteger.ONE
    private val ZERO = BigInteger.ZERO

    /** Der Standard-Basispunkt u = 9 */
    val BASE_POINT: ByteArray = ByteArray(32).also { it[0] = 9 }

    fun clamp(k: ByteArray): ByteArray {
        val c = k.copyOf(32)
        c[0] = (c[0].toInt() and 248).toByte()
        c[31] = (c[31].toInt() and 127).toByte()
        c[31] = (c[31].toInt() or 64).toByte()
        return c
    }

    private fun decodeLittle(b: ByteArray): BigInteger {
        val rev = ByteArray(b.size)
        for (i in b.indices) rev[i] = b[b.size - 1 - i]
        return BigInteger(1, rev)
    }

    private fun encodeLittle(n: BigInteger): ByteArray {
        val be = n.mod(P).toByteArray()
        val out = ByteArray(32)
        val start = if (be.size > 32) be.size - 32 else 0
        val len = be.size - start
        for (i in 0 until len) out[i] = be[be.size - 1 - i]
        return out
    }

    /**
     * Montgomery-Ladder nach RFC 7748 §5.
     * @param k privater Skalar (wird geklemmt)
     * @param u u-Koordinate des Punktes (32 Byte, little endian)
     */
    fun scalarMult(k: ByteArray, u: ByteArray): ByteArray {
        val kk = clamp(k)
        val uu = u.copyOf(32)
        uu[31] = (uu[31].toInt() and 0x7f).toByte()

        val x1 = decodeLittle(uu).mod(P)
        var x2 = ONE
        var z2 = ZERO
        var x3 = x1
        var z3 = ONE
        var swap = 0

        for (t in 254 downTo 0) {
            val kt = (kk[t ushr 3].toInt() ushr (t and 7)) and 1
            swap = swap xor kt
            if (swap == 1) {
                val tx = x2; x2 = x3; x3 = tx
                val tz = z2; z2 = z3; z3 = tz
            }
            swap = kt

            val a = x2.add(z2).mod(P)
            val aa = a.multiply(a).mod(P)
            val b = x2.subtract(z2).mod(P)
            val bb = b.multiply(b).mod(P)
            val e = aa.subtract(bb).mod(P)
            val c = x3.add(z3).mod(P)
            val d = x3.subtract(z3).mod(P)
            val da = d.multiply(a).mod(P)
            val cb = c.multiply(b).mod(P)

            x3 = da.add(cb).mod(P).let { it.multiply(it).mod(P) }
            z3 = x1.multiply(da.subtract(cb).mod(P).let { it.multiply(it).mod(P) }).mod(P)
            x2 = aa.multiply(bb).mod(P)
            z2 = e.multiply(aa.add(A24.multiply(e).mod(P)).mod(P)).mod(P)
        }

        if (swap == 1) {
            val tx = x2; x2 = x3; x3 = tx
            val tz = z2; z2 = z3; z3 = tz
        }

        val res = x2.multiply(z2.modPow(P.subtract(BigInteger.valueOf(2)), P)).mod(P)
        return encodeLittle(res)
    }

    /** Öffentlicher Schlüssel zu einem privaten (32 Byte) */
    fun publicKey(privateKey: ByteArray): ByteArray = scalarMult(privateKey, BASE_POINT)

    /** Gemeinsames Geheimnis (32 Byte) */
    fun sharedSecret(myPrivate: ByteArray, theirPublic: ByteArray): ByteArray =
        scalarMult(myPrivate, theirPublic)

    fun randomPrivateKey(rnd: SecureRandom = SecureRandom()): ByteArray =
        ByteArray(32).also { rnd.nextBytes(it) }.let { clamp(it) }

    fun pair(rnd: SecureRandom = SecureRandom()): Pair<ByteArray, ByteArray> {
        val priv = randomPrivateKey(rnd)
        return priv to publicKey(priv)
    }
}
