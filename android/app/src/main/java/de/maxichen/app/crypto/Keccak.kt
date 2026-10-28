package de.maxichen.app.crypto

/* =====================================================================
   🧪 KECCAK — SHA3-256 · SHA3-512 · SHAKE128 · SHAKE256  (FIPS 202)
   ---------------------------------------------------------------------
   Warum selbst gebaut? Android 8 (minSdk 26) hat kein SHA3 im JCA,
   und SHAKE/XOF gibt es dort gar nicht. Kyber (ML-KEM) braucht:
     G = SHA3-512 · H = SHA3-256 · J = SHAKE256 · XOF = SHAKE128

   Umsetzung: Keccak-f[1600] mit 24 Runden, Sponge mit rate = 200 - 2·cap.
   Byte-Order und Padding exakt nach FIPS 202 (domain 0x06 / 0x1F).
   ===================================================================== */

object Keccak {
    /**
     * Rundenkonstanten. Als Hex-Strings + parseUnsignedLong, weil Kotlin
     * Literale > Long.MAX_VALUE ablehnt (Java erlaubt sie) — so kann auch
     * keine Ziffer beim Abtippen verloren gehen.
     */
    private val RC: LongArray = arrayOf(
        "0000000000000001", "0000000000008082", "800000000000808a", "8000000080008000",
        "000000000000808b", "0000000080000001", "8000000080008081", "8000000000008009",
        "000000000000008a", "0000000000000088", "0000000080008009", "000000008000000a",
        "000000008000808b", "800000000000008b", "8000000000008089", "8000000000008003",
        "8000000000008002", "8000000000000080", "000000000000800a", "800000008000000a",
        "8000000080008081", "8000000000008080", "0000000080000001", "8000000080008008",
    ).map { java.lang.Long.parseUnsignedLong(it, 16) }.toLongArray()

    /** Rotation-Offsets, Index = x + 5y */
    private val RHO = intArrayOf(
        0, 1, 62, 28, 27,
        36, 44, 6, 55, 20,
        3, 10, 43, 25, 39,
        41, 45, 15, 21, 8,
        18, 2, 61, 56, 14,
    )

    private fun rotl(x: Long, n: Int): Long =
        if (n == 0) x else (x shl n) or (x ushr (64 - n))

    private fun permute(a: LongArray) {
        val c = LongArray(5)
        val b = LongArray(25)
        for (round in 0 until 24) {
            // θ
            for (x in 0 until 5) c[x] = a[x] xor a[x + 5] xor a[x + 10] xor a[x + 15] xor a[x + 20]
            for (x in 0 until 5) {
                val d = c[(x + 4) % 5] xor rotl(c[(x + 1) % 5], 1)
                for (y in 0 until 5) a[x + 5 * y] = a[x + 5 * y] xor d
            }
            // ρ + π
            for (x in 0 until 5) for (y in 0 until 5) {
                b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(a[x + 5 * y], RHO[x + 5 * y])
            }
            // χ
            for (x in 0 until 5) for (y in 0 until 5) {
                a[x + 5 * y] = b[x + 5 * y] xor (b[(x + 1) % 5 + 5 * y].inv() and b[(x + 2) % 5 + 5 * y])
            }
            // ι
            a[0] = a[0] xor RC[round]
        }
    }

    /**
     * Ein Durchlauf Sponge: absorbieren, padden (domain + 0x80), squeeze.
     * @param rate Bytes pro Block (136 für SHA3-256/SHAKE256, 72 für SHA3-512, 168 für SHAKE128)
     * @param domain 0x06 = SHA3, 0x1F = SHAKE
     */
    private fun sponge(rate: Int, domain: Int, input: ByteArray, outLen: Int): ByteArray {
        val st = LongArray(25)
        var pos = 0

        fun xorByte(idx: Int, v: Byte) {
            val lane = idx / 8
            val shift = 8 * (idx % 8)
            st[lane] = st[lane] xor ((v.toLong() and 0xFF) shl shift)
        }

        for (byte in input) {
            xorByte(pos, byte)
            pos++
            if (pos == rate) { permute(st); pos = 0 }
        }
        xorByte(pos, domain.toByte())
        xorByte(rate - 1, 0x80.toByte())
        permute(st)
        pos = 0

        val out = ByteArray(outLen)
        var o = 0
        while (o < outLen) {
            val lane = st[pos / 8]
            val shift = 8 * (pos % 8)
            out[o] = ((lane ushr shift) and 0xFF).toByte()
            o++; pos++
            if (pos == rate && o < outLen) { permute(st); pos = 0 }
        }
        return out
    }

    fun sha3_256(data: ByteArray): ByteArray = sponge(136, 0x06, data, 32)
    fun sha3_512(data: ByteArray): ByteArray = sponge(72, 0x06, data, 64)
    fun shake256(data: ByteArray, outLen: Int): ByteArray = sponge(136, 0x1F, data, outLen)
    fun shake128(data: ByteArray, outLen: Int): ByteArray = sponge(168, 0x1F, data, outLen)

    /* ---------- Streaming-XOF für die Rejection-Sampling-Schleife ---------- */

    class Xof(rate: Int, domain: Int, input: ByteArray) {
        private val st = LongArray(25)
        private val rate = rate
        private var pos = 0

        init {
            var p = 0
            for (byte in input) {
                val lane = p / 8
                val shift = 8 * (p % 8)
                st[lane] = st[lane] xor ((byte.toLong() and 0xFF) shl shift)
                p++
                if (p == rate) { permute(st); p = 0 }
            }
            val lane = p / 8
            st[lane] = st[lane] xor ((domain.toLong() and 0xFF) shl (8 * (p % 8)))
            val last = rate - 1
            st[last / 8] = st[last / 8] xor (0x80L shl (8 * (last % 8)))
            permute(st)
            pos = 0
        }

        fun read(n: Int): ByteArray {
            val out = ByteArray(n)
            for (i in 0 until n) {
                out[i] = ((st[pos / 8] ushr (8 * (pos % 8))) and 0xFF).toByte()
                pos++
                if (pos == rate) { permute(st); pos = 0 }
            }
            return out
        }
    }

    fun xofShake128(seed: ByteArray): Xof = Xof(168, 0x1F, seed)
}
