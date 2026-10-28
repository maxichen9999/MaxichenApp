package de.maxichen.app.crypto

/* =====================================================================
   🛡️ ML-KEM-768  (FIPS 203, „Kyber")  —  Post-Quantum-Schlüsselaustausch
   ---------------------------------------------------------------------
   Warum das hier steht: ein heutiger Angreifer kann verschlüsselten
   Verkehr mitschneiden und später mit einem Quantenrechner öffnen
   („harvest now, decrypt later"). Kyber nimmt ihm das: der Schlüssel
   hängt an einem Gitterproblem (MLWE), für das es keinen bekannten
   Quantenangriff gibt.

   Aufbau exakt nach FIPS 203:
     n=256 · q=3329 · k=3 · η1=η2=2 · du=10 · dv=4
     ek = 1184 B · dk = 2400 B · ct = 1088 B · ss = 32 B
     G = SHA3-512 · H = SHA3-256 · J = SHAKE256 · XOF = SHAKE128

   Ehrlich: keine vorkompilierten Tabellen — die ζ-Potenzen und die
   Bit-Reversal-Indizes werden berechnet, damit keine Zahl falsch
   abgetippt sein kann.
   ===================================================================== */

object MlKem768 {
    const val K = 3
    private const val N = 256
    private const val Q = 3329
    private const val ETA1 = 2
    private const val ETA2 = 2
    private const val DU = 10
    private const val DV = 4

    const val EK_BYTES = 1184
    const val DK_BYTES = 2400
    const val CT_BYTES = 1088
    const val SS_BYTES = 32

    private const val POLY12 = 384     // 256 * 12 / 8
    private const val POLY_DU = 320    // 256 * 10 / 8

    /* ------------------------- Arithmetik ------------------------- */

    private fun mod(x: Int): Int {
        val r = x % Q
        return if (r < 0) r + Q else r
    }

    private fun modL(x: Long): Int {
        val r = (x % Q).toInt()
        return if (r < 0) r + Q else r
    }

    private fun bitRev7(i: Int): Int {
        var x = i and 0x7F
        var r = 0
        for (b in 0 until 7) { r = (r shl 1) or (x and 1); x = x ushr 1 }
        return r
    }

    /** ζ^e mod q mit ζ = 17 (primitiv 256. Ordnung) */
    private fun zetaPow(e: Int): Int {
        var result = 1L
        var base = 17L
        var exp = e % 256
        while (exp > 0) {
            if (exp and 1 == 1) result = (result * base) % Q
            base = (base * base) % Q
            exp = exp ushr 1
        }
        return result.toInt()
    }

    /* ------------------------- NTT ------------------------- */

    /** FIPS 203 Alg. 9 — in-place, 128 Schmetterlinge */
    private fun ntt(f: IntArray) {
        var i = 1
        var len = 128
        while (len >= 2) {
            var start = 0
            while (start < N) {
                val zeta = zetaPow(bitRev7(i)); i++
                var j = start
                while (j < start + len) {
                    val t = mod(zeta * f[j + len])
                    f[j + len] = mod(f[j] - t)
                    f[j] = mod(f[j] + t)
                    j++
                }
                start += 2 * len
            }
            len /= 2
        }
    }

    /** FIPS 203 Alg. 10 — inkl. Multiplikation mit 128⁻¹ = 3303 */
    private fun intt(f: IntArray) {
        var i = 127
        var len = 2
        while (len <= 128) {
            var start = 0
            while (start < N) {
                val zeta = zetaPow(bitRev7(i)); i--
                var j = start
                while (j < start + len) {
                    val t = f[j]
                    f[j] = mod(t + f[j + len])
                    f[j + len] = modL(zeta.toLong() * (f[j + len] - t))
                    j++
                }
                start += 2 * len
            }
            len *= 2
        }
        for (j in 0 until N) f[j] = modL(f[j].toLong() * 3303L)
    }

    /** FIPS 203 Alg. 12 — Basis-Fall (a0 + a1X)(b0 + b1X) mod (X² − γ) */
    private fun baseCase(a0: Int, a1: Int, b0: Int, b1: Int, gamma: Int): Long {
        val c0 = modL(a0.toLong() * b0 + a1.toLong() * b1 % Q * gamma)
        val c1 = modL(a0.toLong() * b1 + a1.toLong() * b0)
        return (c0.toLong() shl 32) or (c1.toLong() and 0xFFFFFFFFL)
    }

    /** FIPS 203 Alg. 11 — Multiplikation im NTT-Bereich */
    private fun mulNtt(a: IntArray, b: IntArray): IntArray {
        val r = IntArray(N)
        for (i in 0 until 128) {
            val g = zetaPow(2 * bitRev7(i) + 1)
            val packed = baseCase(a[2 * i], a[2 * i + 1], b[2 * i], b[2 * i + 1], g)
            r[2 * i] = (packed ushr 32).toInt()
            r[2 * i + 1] = (packed and 0xFFFFFFFFL).toInt()
        }
        return r
    }

    /* ------------------------- Kodierung ------------------------- */

    private fun byteEncode(f: IntArray, d: Int): ByteArray {
        val out = ByteArray(N * d / 8)
        var acc = 0L
        var bits = 0
        var o = 0
        val mask = (1L shl d) - 1
        for (v in f) {
            acc = acc or ((v.toLong() and mask) shl bits)
            bits += d
            while (bits >= 8) {
                out[o++] = (acc and 0xFF).toByte()
                acc = acc ushr 8
                bits -= 8
            }
        }
        return out
    }

    private fun byteDecode(b: ByteArray, d: Int): IntArray {
        val f = IntArray(N)
        var acc = 0L
        var bits = 0
        var o = 0
        val mask = (1L shl d) - 1
        for (i in 0 until N) {
            while (bits < d) {
                acc = acc or ((b[o++].toLong() and 0xFF) shl bits)
                bits += 8
            }
            f[i] = (acc and mask).toInt()
            acc = acc ushr d
            bits -= d
        }
        return f
    }

    private fun compress(x: Int, d: Int): Int {
        val t = (x.toLong() shl d) + (Q / 2)
        return ((t / Q) % (1L shl d)).toInt()
    }

    private fun decompress(y: Int, d: Int): Int =
        ((y.toLong() * Q + (1L shl (d - 1))) ushr d).toInt()

    /* ------------------------- Sampling ------------------------- */

    /** FIPS 203 Alg. 7 — gleichverteilt aus SHAKE128(ρ ‖ x ‖ y) */
    private fun sampleNtt(rho: ByteArray, x: Int, y: Int): IntArray {
        val xof = Keccak.xofShake128(rho + byteArrayOf(x.toByte(), y.toByte()))
        val a = IntArray(N)
        var n = 0
        while (n < N) {
            val b = xof.read(3)
            val b0 = b[0].toInt() and 0xFF
            val b1 = b[1].toInt() and 0xFF
            val b2 = b[2].toInt() and 0xFF
            val d1 = b0 or ((b1 and 0x0F) shl 8)
            val d2 = (b1 shr 4) or (b2 shl 4)
            if (d1 < Q) a[n++] = d1
            if (n < N && d2 < Q) a[n++] = d2
        }
        return a
    }

    private fun bitAt(b: ByteArray, k: Int): Int = (b[k / 8].toInt() shr (k % 8)) and 1

    /** FIPS 203 Alg. 8 — zentrierte Binomialverteilung */
    private fun sampleCbd(bytes: ByteArray, eta: Int): IntArray {
        val f = IntArray(N)
        for (i in 0 until N) {
            var a = 0
            var b = 0
            for (j in 0 until eta) {
                a += bitAt(bytes, 2 * i * eta + j)
                b += bitAt(bytes, 2 * i * eta + eta + j)
            }
            f[i] = mod(a - b)
        }
        return f
    }

    private fun prf(eta: Int, s: ByteArray, counter: Int): ByteArray =
        Keccak.shake256(s + byteArrayOf(counter.toByte()), 64 * eta)

    private fun samplePolyCbd(s: ByteArray, counter: Int, eta: Int): IntArray =
        sampleCbd(prf(eta, s, counter), eta)

    /* ------------------------- K-PKE ------------------------- */

    /** Gibt (ek, dkPke) zurück. */
    private fun kpkeKeygen(d: ByteArray): Pair<ByteArray, ByteArray> {
        val g = Keccak.sha3_512(d + byteArrayOf(K.toByte()))
        val rho = g.copyOfRange(0, 32)
        val sigma = g.copyOfRange(32, 64)

        var n = 0
        val s = Array(K) { samplePolyCbd(sigma, n++, ETA1) }
        val e = Array(K) { samplePolyCbd(sigma, n++, ETA1) }
        for (i in 0 until K) { ntt(s[i]); ntt(e[i]) }

        val ek = ByteArray(384 * K + 32)
        for (i in 0 until K) {
            var acc = IntArray(N)
            for (j in 0 until K) {
                val a = sampleNtt(rho, j, i)          // Â[i][j] = SampleNTT(ρ ‖ j ‖ i)
                val p = mulNtt(a, s[j])
                for (x in 0 until N) acc[x] = mod(acc[x] + p[x])
            }
            for (x in 0 until N) acc[x] = mod(acc[x] + e[i][x])
            byteEncode(acc, 12).copyInto(ek, i * POLY12)
        }
        rho.copyInto(ek, 384 * K)

        val dk = ByteArray(384 * K)
        for (i in 0 until K) byteEncode(s[i], 12).copyInto(dk, i * POLY12)
        return ek to dk
    }

    private fun kpkeEncrypt(ek: ByteArray, m: ByteArray, r: ByteArray): ByteArray {
        val t = Array(K) { byteDecode(ek.copyOfRange(it * POLY12, (it + 1) * POLY12), 12) }
        val rho = ek.copyOfRange(384 * K, 384 * K + 32)

        var n = 0
        val y = Array(K) { samplePolyCbd(r, n++, ETA1) }
        val e1 = Array(K) { samplePolyCbd(r, n++, ETA2) }
        val e2 = samplePolyCbd(r, n, ETA2)
        for (i in 0 until K) ntt(y[i])

        val u = Array(K) { IntArray(N) }
        for (i in 0 until K) {
            var acc = IntArray(N)
            for (j in 0 until K) {
                val a = sampleNtt(rho, i, j)          // Âᵀ[i][j] = Â[j][i]
                val p = mulNtt(a, y[j])
                for (x in 0 until N) acc[x] = mod(acc[x] + p[x])
            }
            intt(acc)
            for (x in 0 until N) acc[x] = mod(acc[x] + e1[i][x])
            u[i] = acc
        }

        val v = IntArray(N)
        for (j in 0 until K) {
            val p = mulNtt(t[j], y[j])
            for (x in 0 until N) v[x] = mod(v[x] + p[x])
        }
        intt(v)
        for (x in 0 until N) {
            v[x] = mod(v[x] + e2[x] + decompress(bitAt(m, x), 1))
        }

        val out = ByteArray(CT_BYTES)
        var off = 0
        for (i in 0 until K) {
            byteEncode(IntArray(N) { compress(u[i][it], DU) }, DU).copyInto(out, off)
            off += POLY_DU
        }
        byteEncode(IntArray(N) { compress(v[it], DV) }, DV).copyInto(out, off)
        return out
    }

    private fun kpkeDecrypt(dkPke: ByteArray, c: ByteArray): ByteArray {
        val s = Array(K) { byteDecode(dkPke.copyOfRange(it * POLY12, (it + 1) * POLY12), 12) }
        val u = Array(K) { i ->
            val raw = byteDecode(c.copyOfRange(i * POLY_DU, (i + 1) * POLY_DU), DU)
            IntArray(N) { decompress(raw[it], DU) }
        }
        val vRaw = byteDecode(c.copyOfRange(K * POLY_DU, K * POLY_DU + 128), DV)
        val v = IntArray(N) { decompress(vRaw[it], DV) }

        val acc = IntArray(N)
        for (i in 0 until K) {
            val uh = u[i].copyOf()
            ntt(uh)
            val p = mulNtt(s[i], uh)
            for (x in 0 until N) acc[x] = mod(acc[x] + p[x])
        }
        intt(acc)

        val w = IntArray(N) { mod(v[it] - acc[it]) }
        return byteEncode(IntArray(N) { compress(w[it], 1) }, 1)
    }

    /* ------------------------- ML-KEM ------------------------- */

    /**
     * Deterministisch nach FIPS 203 Alg. 16 (d = 32 B Würfel, z = 32 B Fallback).
     */
    fun keygen(d: ByteArray, z: ByteArray): Pair<ByteArray, ByteArray> {
        require(d.size == 32 && z.size == 32) { "d und z müssen 32 Byte sein" }
        val (ek, dkPke) = kpkeKeygen(d)
        val dk = ByteArray(DK_BYTES)
        dkPke.copyInto(dk, 0)
        ek.copyInto(dk, 384 * K)
        Keccak.sha3_256(ek).copyInto(dk, 768 * K + 32)
        z.copyInto(dk, 768 * K + 64)
        return ek to dk
    }

    fun keygenRandom(): Pair<ByteArray, ByteArray> =
        keygen(Crypto.randomBytes(32), Crypto.randomBytes(32))

    /** FIPS 203 Alg. 17 mit vorgegebenem m (für Tests/Determinismus). */
    fun encaps(ek: ByteArray, m: ByteArray): Pair<ByteArray, ByteArray> {
        require(ek.size == EK_BYTES) { "ek muss $EK_BYTES Byte sein" }
        require(m.size == 32) { "m muss 32 Byte sein" }
        val g = Keccak.sha3_512(m + Keccak.sha3_256(ek))
        val key = g.copyOfRange(0, 32)
        val r = g.copyOfRange(32, 64)
        val ct = kpkeEncrypt(ek, m, r)
        return key to ct        // (K, c)
    }

    fun encapsRandom(ek: ByteArray): Pair<ByteArray, ByteArray> = encaps(ek, Crypto.randomBytes(32))

    /** FIPS 203 Alg. 18 — inkl. impliziter Ablehnung (constant-time-Vergleich) */
    fun decaps(dk: ByteArray, ct: ByteArray): ByteArray {
        require(dk.size == DK_BYTES) { "dk muss $DK_BYTES Byte sein" }
        require(ct.size == CT_BYTES) { "ct muss $CT_BYTES Byte sein" }

        val dkPke = dk.copyOfRange(0, 384 * K)
        val ek = dk.copyOfRange(384 * K, 384 * K + EK_BYTES)
        val h = dk.copyOfRange(384 * K + EK_BYTES, 384 * K + EK_BYTES + 32)
        val z = dk.copyOfRange(DK_BYTES - 32, DK_BYTES)

        val m = kpkeDecrypt(dkPke, ct)
        val g = Keccak.sha3_512(m + h)
        val keyPrime = g.copyOfRange(0, 32)
        val r = g.copyOfRange(32, 64)
        val ctPrime = kpkeEncrypt(ek, m, r)

        // J(z ‖ c) — Fallback-Schlüssel, falls der Ciphertext manipuliert wurde
        val fallback = Keccak.shake256(z + ct, 32)
        return if (Crypto.constantTimeEquals(ct, ctPrime)) keyPrime else fallback
    }
}
