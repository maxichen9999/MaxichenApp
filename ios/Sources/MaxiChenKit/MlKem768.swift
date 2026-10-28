import Foundation

// =====================================================================
// 🛡️ MlKem768.swift — ML-KEM-768 (FIPS 203, „Kyber")
// ---------------------------------------------------------------------
// 1:1-Port von MlKem768.kt. Das ist die Verschlüsselung selbst, nicht
// nur die Anmeldung: wer heute mitschneidet und in zehn Jahren einen
// Quantenrechner hat, kommt an diesen Bytes nicht vorbei (MLWE).
//
// Parameter exakt nach FIPS 203:
//   n=256 · q=3329 · k=3 · η1=η2=2 · du=10 · dv=4
//   ek = 1184 B · dk = 2400 B · ct = 1088 B · ss = 32 B
//   G = SHA3-512 · H = SHA3-256 · J = SHAKE256 · XOF = SHAKE128
//
// EHRLICH: wie in Kotlin stehen hier KEINE vorkompilierten Tabellen.
// Die ζ-Potenzen und Bit-Reversal-Indizes werden gerechnet — eine falsch
// abgetippte Tabellenzahl wäre der klassische, unsichtbare Fehler.
//
// Beweis: die drei Referenzvektoren aus `tests-vectors/mlkem768.json`
// (erzeugt mit kyber-py, einer fremden Python-Implementierung) müssen
// byte-identisch rauskommen. Getestet in MlKemTests.swift.
// =====================================================================

public enum MlKem768 {

    public static let k = 3
    private static let n = 256
    private static let q = 3329
    private static let eta1 = 2
    private static let eta2 = 2
    private static let du = 10
    private static let dv = 4

    public static let ekBytes = 1184
    public static let dkBytes = 2400
    public static let ctBytes = 1088
    public static let ssBytes = 32

    private static let poly12 = 384    // 256 * 12 / 8
    private static let polyDu = 320    // 256 * 10 / 8

    public struct KeyPair {
        public let publicKey: [UInt8]   // ek, 1184 B
        public let secretKey: [UInt8]   // dk, 2400 B
        public init(publicKey: [UInt8], secretKey: [UInt8]) {
            self.publicKey = publicKey
            self.secretKey = secretKey
        }
    }

    public struct EncapsResult {
        public let ciphertext: [UInt8]  // 1088 B
        public let sharedSecret: [UInt8] // 32 B
        public init(ciphertext: [UInt8], sharedSecret: [UInt8]) {
            self.ciphertext = ciphertext
            self.sharedSecret = sharedSecret
        }
    }

    public enum KemError: Error {
        case wrongKeySize(String, Int, Int)
    }

    /* ------------------------- Arithmetik ------------------------- */

    @inline(__always)
    private static func mod(_ x: Int) -> Int {
        let r = x % q
        return r < 0 ? r + q : r
    }

    @inline(__always)
    private static func modL(_ x: Int64) -> Int {
        let r = Int(x % Int64(q))
        return r < 0 ? r + q : r
    }

    private static func bitRev7(_ i: Int) -> Int {
        var x = i & 0x7F
        var r = 0
        for _ in 0..<7 {
            r = (r << 1) | (x & 1)
            x >>= 1
        }
        return r
    }

    /// ζ^e mod q mit ζ = 17 (primitiv 256. Ordnung)
    private static func zetaPow(_ e: Int) -> Int {
        var result: Int64 = 1
        var base: Int64 = 17
        var exp = e % 256
        while exp > 0 {
            if exp & 1 == 1 { result = (result * base) % Int64(q) }
            base = (base * base) % Int64(q)
            exp >>= 1
        }
        return Int(result)
    }

    /* ------------------------- NTT ------------------------- */

    /// FIPS 203 Alg. 9 — in-place, 128 Schmetterlinge
    private static func ntt(_ f: inout [Int]) {
        var i = 1
        var len = 128
        while len >= 2 {
            var start = 0
            while start < n {
                let zeta = zetaPow(bitRev7(i))
                i += 1
                var j = start
                while j < start + len {
                    let t = mod(zeta * f[j + len])
                    f[j + len] = mod(f[j] - t)
                    f[j] = mod(f[j] + t)
                    j += 1
                }
                start += 2 * len
            }
            len /= 2
        }
    }

    /// FIPS 203 Alg. 10 — inkl. Multiplikation mit 128⁻¹ = 3303
    private static func intt(_ f: inout [Int]) {
        var i = 127
        var len = 2
        while len <= 128 {
            var start = 0
            while start < n {
                let zeta = zetaPow(bitRev7(i))
                i -= 1
                var j = start
                while j < start + len {
                    let t = f[j]
                    f[j] = mod(t + f[j + len])
                    f[j + len] = modL(Int64(zeta) * Int64(f[j + len] - t))
                    j += 1
                }
                start += 2 * len
            }
            len *= 2
        }
        for j in 0..<n { f[j] = modL(Int64(f[j]) * 3303) }
    }

    /// FIPS 203 Alg. 12 — Basis-Fall (a0 + a1X)(b0 + b1X) mod (X² − γ)
    /// Gibt das Paar als gepackten UInt64 zurück (c0 oben, c1 unten) —
    /// gleiche Idee wie in Kotlin, damit beide Seiten dasselbe rechnen.
    private static func baseCase(_ a0: Int, _ a1: Int, _ b0: Int, _ b1: Int, _ gamma: Int) -> UInt64 {
        let c0 = modL(Int64(a0) * Int64(b0) + Int64(a1) * Int64(b1) % Int64(q) * Int64(gamma))
        let c1 = modL(Int64(a0) * Int64(b1) + Int64(a1) * Int64(b0))
        return (UInt64(c0) << 32) | (UInt64(c1) & 0xFFFF_FFFF)
    }

    /// FIPS 203 Alg. 11 — Multiplikation im NTT-Bereich
    private static func mulNtt(_ a: [Int], _ b: [Int]) -> [Int] {
        var r = [Int](repeating: 0, count: n)
        for i in 0..<128 {
            let g = zetaPow(2 * bitRev7(i) + 1)
            let packed = baseCase(a[2 * i], a[2 * i + 1], b[2 * i], b[2 * i + 1], g)
            r[2 * i] = Int(packed >> 32)
            r[2 * i + 1] = Int(packed & 0xFFFF_FFFF)
        }
        return r
    }

    /* ------------------------- Kodierung ------------------------- */

    private static func byteEncode(_ f: [Int], _ d: Int) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: n * d / 8)
        var acc: UInt64 = 0
        var bits = 0
        var o = 0
        let mask: UInt64 = (1 << UInt64(d)) - 1
        for v in f {
            acc |= (UInt64(v) & mask) << UInt64(bits)
            bits += d
            while bits >= 8 {
                out[o] = UInt8(acc & 0xFF)
                o += 1
                acc >>= 8
                bits -= 8
            }
        }
        return out
    }

    private static func byteDecode(_ b: ArraySlice<UInt8>, _ d: Int) -> [Int] {
        var f = [Int](repeating: 0, count: n)
        var acc: UInt64 = 0
        var bits = 0
        var o = b.startIndex
        let mask: UInt64 = (1 << UInt64(d)) - 1
        for i in 0..<n {
            while bits < d {
                acc |= UInt64(b[o]) << UInt64(bits)
                o += 1
                bits += 8
            }
            f[i] = Int(acc & mask)
            acc >>= UInt64(d)
            bits -= d
        }
        return f
    }

    private static func compress(_ x: Int, _ d: Int) -> Int {
        let t = (Int64(x) << Int64(d)) + Int64(q / 2)
        return Int((t / Int64(q)) % (1 << Int64(d)))
    }

    private static func decompress(_ y: Int, _ d: Int) -> Int {
        Int((Int64(y) * Int64(q) + (Int64(1) << Int64(d - 1))) >> Int64(d))
    }

    /* ------------------------- Sampling ------------------------- */

    /// FIPS 203 Alg. 7 — gleichverteilt aus SHAKE128(ρ ‖ x ‖ y)
    private static func sampleNtt(_ rho: ArraySlice<UInt8>, _ x: Int, _ y: Int) -> [Int] {
        var seed = Array(rho)
        seed.append(UInt8(x))
        seed.append(UInt8(y))
        let xof = Keccak.xofShake128(seed)

        var a = [Int](repeating: 0, count: n)
        var idx = 0
        while idx < n {
            let b = xof.read(3)
            let b0 = Int(b[0])
            let b1 = Int(b[1])
            let b2 = Int(b[2])
            let d1 = b0 | ((b1 & 0x0F) << 8)
            let d2 = (b1 >> 4) | (b2 << 4)
            if d1 < q { a[idx] = d1; idx += 1 }
            if idx < n && d2 < q { a[idx] = d2; idx += 1 }
        }
        return a
    }

    @inline(__always)
    private static func bitAt(_ b: [UInt8], _ k: Int) -> Int {
        (Int(b[k / 8]) >> (k % 8)) & 1
    }

    /// FIPS 203 Alg. 8 — zentrierte Binomialverteilung
    private static func sampleCbd(_ bytes: [UInt8], _ eta: Int) -> [Int] {
        var f = [Int](repeating: 0, count: n)
        for i in 0..<n {
            var a = 0
            var b = 0
            for j in 0..<eta {
                a += bitAt(bytes, 2 * i * eta + j)
                b += bitAt(bytes, 2 * i * eta + eta + j)
            }
            f[i] = mod(a - b)
        }
        return f
    }

    private static func prf(_ eta: Int, _ s: ArraySlice<UInt8>, _ counter: Int) -> [UInt8] {
        var input = Array(s)
        input.append(UInt8(counter))
        return Keccak.shake256(input, outLen: 64 * eta)
    }

    private static func samplePolyCbd(_ s: ArraySlice<UInt8>, _ counter: Int, _ eta: Int) -> [Int] {
        sampleCbd(prf(eta, s, counter), eta)
    }

    /* ------------------------- K-PKE ------------------------- */

    /// Gibt (ek, dkPke) zurück.
    private static func kpkeKeygen(_ d: ArraySlice<UInt8>) -> (ek: [UInt8], dkPke: [UInt8]) {
        var gInput = Array(d)
        gInput.append(UInt8(k))
        let g = Keccak.sha3_512(gInput)
        let rho = g[0..<32]
        let sigma = g[32..<64]

        // FIPS 203 Alg. 13: erst alle ŝ mit N = 0..k-1, DANN alle ê mit N = k..2k-1.
        // Nicht verschränken — sonst kommen andere Polynome raus.
        var counter = 0
        var s = [[Int]]()
        var e = [[Int]]()
        for _ in 0..<k { s.append(samplePolyCbd(sigma, counter, eta1)); counter += 1 }
        for _ in 0..<k { e.append(samplePolyCbd(sigma, counter, eta1)); counter += 1 }
        for i in 0..<k { ntt(&s[i]); ntt(&e[i]) }

        var ek = [UInt8](repeating: 0, count: 384 * k + 32)
        for i in 0..<k {
            var acc = [Int](repeating: 0, count: n)
            for j in 0..<k {
                let a = sampleNtt(rho, j, i)          // Â[i][j] = SampleNTT(ρ ‖ j ‖ i)
                let p = mulNtt(a, s[j])
                for x in 0..<n { acc[x] = mod(acc[x] + p[x]) }
            }
            for x in 0..<n { acc[x] = mod(acc[x] + e[i][x]) }
            let enc = byteEncode(acc, 12)
            for (off, v) in enc.enumerated() { ek[i * poly12 + off] = v }
        }
        for (off, v) in rho.enumerated() { ek[384 * k + off] = v }

        var dkPke = [UInt8](repeating: 0, count: 384 * k)
        for i in 0..<k {
            let enc = byteEncode(s[i], 12)
            for (off, v) in enc.enumerated() { dkPke[i * poly12 + off] = v }
        }
        return (ek, dkPke)
    }

    private static func kpkeEncrypt(_ ek: [UInt8], _ m: [UInt8], _ r: ArraySlice<UInt8>) -> [UInt8] {
        var t = [[Int]]()
        for i in 0..<k {
            t.append(byteDecode(ek[(i * poly12)..<((i + 1) * poly12)], 12))
        }
        let rho = ek[(384 * k)..<(384 * k + 32)]

        // FIPS 203 Alg. 14: y mit N = 0..k-1, e1 mit N = k..2k-1, e2 mit N = 2k.
        var counter = 0
        var y = [[Int]]()
        var e1 = [[Int]]()
        for _ in 0..<k { y.append(samplePolyCbd(r, counter, eta1)); counter += 1 }
        for _ in 0..<k { e1.append(samplePolyCbd(r, counter, eta2)); counter += 1 }
        let e2 = samplePolyCbd(r, counter, eta2)
        for i in 0..<k { ntt(&y[i]) }

        var u = [[Int]]()
        for i in 0..<k {
            var acc = [Int](repeating: 0, count: n)
            for j in 0..<k {
                let a = sampleNtt(rho, i, j)          // Âᵀ[i][j] = Â[j][i]
                let p = mulNtt(a, y[j])
                for x in 0..<n { acc[x] = mod(acc[x] + p[x]) }
            }
            intt(&acc)
            for x in 0..<n { acc[x] = mod(acc[x] + e1[i][x]) }
            u.append(acc)
        }

        var v = [Int](repeating: 0, count: n)
        for j in 0..<k {
            let p = mulNtt(t[j], y[j])
            for x in 0..<n { v[x] = mod(v[x] + p[x]) }
        }
        intt(&v)
        for x in 0..<n {
            v[x] = mod(v[x] + e2[x] + decompress(bitAt(m, x), 1))
        }

        var out = [UInt8](repeating: 0, count: ctBytes)
        var off = 0
        for i in 0..<k {
            let enc = byteEncode((0..<n).map { compress(u[i][$0], du) }, du)
            for (o2, val) in enc.enumerated() { out[off + o2] = val }
            off += polyDu
        }
        let encV = byteEncode((0..<n).map { compress(v[$0], dv) }, dv)
        for (o2, val) in encV.enumerated() { out[off + o2] = val }
        return out
    }

    private static func kpkeDecrypt(_ dkPke: [UInt8], _ c: [UInt8]) -> [UInt8] {
        var s = [[Int]]()
        for i in 0..<k {
            s.append(byteDecode(dkPke[(i * poly12)..<((i + 1) * poly12)], 12))
        }
        var u = [[Int]]()
        for i in 0..<k {
            let raw = byteDecode(c[(i * polyDu)..<((i + 1) * polyDu)], du)
            u.append((0..<n).map { decompress(raw[$0], du) })
        }
        let vRaw = byteDecode(c[(k * polyDu)..<(k * polyDu + 128)], dv)
        let v = (0..<n).map { decompress(vRaw[$0], dv) }

        var acc = [Int](repeating: 0, count: n)
        for i in 0..<k {
            var uh = u[i]
            ntt(&uh)
            let p = mulNtt(s[i], uh)
            for x in 0..<n { acc[x] = mod(acc[x] + p[x]) }
        }
        intt(&acc)

        let w = (0..<n).map { mod(v[$0] - acc[$0]) }
        return byteEncode((0..<n).map { compress(w[$0], 1) }, 1)
    }

    /* ------------------------- ML-KEM ------------------------- */

    /// FIPS 203 Alg. 16 — d = 32 B Würfel, z = 32 B Fallback-Geheimnis.
    public static func keygen(d: [UInt8], z: [UInt8]) throws -> KeyPair {
        guard d.count == 32 else { throw KemError.wrongKeySize("d", d.count, 32) }
        guard z.count == 32 else { throw KemError.wrongKeySize("z", z.count, 32) }

        let (ek, dkPke) = kpkeKeygen(d[...])
        var dk = [UInt8](repeating: 0, count: dkBytes)
        for (i, v) in dkPke.enumerated() { dk[i] = v }
        for (i, v) in ek.enumerated() { dk[384 * k + i] = v }
        let h = Keccak.sha3_256(ek)
        for (i, v) in h.enumerated() { dk[768 * k + 32 + i] = v }
        for (i, v) in z.enumerated() { dk[768 * k + 64 + i] = v }
        return KeyPair(publicKey: ek, secretKey: dk)
    }

    public static func keygenRandom() throws -> KeyPair {
        try keygen(d: RecoveryCodes.randomBytes(32), z: RecoveryCodes.randomBytes(32))
    }

    /// FIPS 203 Alg. 17 mit vorgegebenem m (für Tests und Determinismus).
    public static func encaps(ek: [UInt8], m: [UInt8]) throws -> EncapsResult {
        guard ek.count == ekBytes else { throw KemError.wrongKeySize("ek", ek.count, ekBytes) }
        guard m.count == 32 else { throw KemError.wrongKeySize("m", m.count, 32) }

        var gInput = m
        gInput.append(contentsOf: Keccak.sha3_256(ek))
        let g = Keccak.sha3_512(gInput)
        let key = Array(g[0..<32])
        let r = g[32..<64]
        let ct = kpkeEncrypt(ek, m, r)
        return EncapsResult(ciphertext: ct, sharedSecret: key)
    }

    public static func encapsRandom(ek: [UInt8]) throws -> EncapsResult {
        try encaps(ek: ek, m: RecoveryCodes.randomBytes(32))
    }

    /// FIPS 203 Alg. 18 — inkl. impliziter Ablehnung.
    /// Bei manipuliertem Ciphertext kommt J(z ‖ c) raus, kein Fehler —
    /// so verrät der Empfänger einem Angreifer nicht, dass er es gemerkt hat.
    public static func decaps(dk: [UInt8], ct: [UInt8]) throws -> [UInt8] {
        guard dk.count == dkBytes else { throw KemError.wrongKeySize("dk", dk.count, dkBytes) }
        guard ct.count == ctBytes else { throw KemError.wrongKeySize("ct", ct.count, ctBytes) }

        let dkPke = Array(dk[0..<(384 * k)])
        let ek = Array(dk[(384 * k)..<(384 * k + ekBytes)])
        let h = Array(dk[(384 * k + ekBytes)..<(384 * k + ekBytes + 32)])
        let z = Array(dk[(dkBytes - 32)..<dkBytes])

        let m = kpkeDecrypt(dkPke, ct)
        var gInput = m
        gInput.append(contentsOf: h)
        let g = Keccak.sha3_512(gInput)
        let keyPrime = Array(g[0..<32])
        let r = g[32..<64]
        let ctPrime = kpkeEncrypt(ek, m, r[...])

        var jInput = z
        jInput.append(contentsOf: ct)
        let fallback = Keccak.shake256(jInput, outLen: 32)

        return ConstantTime.equals(ct, ctPrime) ? keyPrime : fallback
    }
}
