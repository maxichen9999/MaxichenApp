import Foundation

// =====================================================================
// 🧪 Keccak.swift — SHA3-256 · SHA3-512 · SHAKE128 · SHAKE256 (FIPS 202)
// ---------------------------------------------------------------------
// Port von Keccak.kt. Warum selbst gebaut?
//   CryptoKit hat SHA3 erst ab iOS 13 und SHAKE/XOF gar nicht.
//   ML-KEM braucht G=SHA3-512, H=SHA3-256, J=SHAKE256, XOF=SHAKE128.
//   Also: Keccak-f[1600], 24 Runden, Sponge mit rate = 200 − 2·cap.
//
// Die Rundenkonstanten stehen hier als Hex-Strings und werden geparst —
// nicht als UInt64-Literale. Zwei Gründe: sie sind so aus der Spezifikation
// ablesbar, und es kann keine Ziffer beim Abtippen untergehen.
// =====================================================================

public enum Keccak {

    /// Rundenkonstanten aus FIPS 202, Tabelle 3.
    private static let RC: [UInt64] = [
        "0000000000000001", "0000000000008082", "800000000000808a", "8000000080008000",
        "000000000000808b", "0000000080000001", "8000000080008081", "8000000000008009",
        "000000000000008a", "0000000000000088", "0000000080008009", "000000008000000a",
        "000000008000808b", "800000000000008b", "8000000000008089", "8000000000008003",
        "8000000000008002", "8000000000000080", "000000000000800a", "800000008000000a",
        "8000000080008081", "8000000000008080", "0000000080000001", "8000000080008008",
    ].map { UInt64($0, radix: 16)! }

    /// Rotation-Offsets, Index = x + 5y
    private static let RHO: [Int] = [
        0, 1, 62, 28, 27,
        36, 44, 6, 55, 20,
        3, 10, 43, 25, 39,
        41, 45, 15, 21, 8,
        18, 2, 61, 56, 14,
    ]

    @inline(__always)
    private static func rotl(_ x: UInt64, _ n: Int) -> UInt64 {
        n == 0 ? x : (x << UInt64(n)) | (x >> UInt64(64 - n))
    }

    /// Keccak-f[1600] — 24 Runden, θ ρ π χ ι
    private static func permute(_ a: inout [UInt64]) {
        var c = [UInt64](repeating: 0, count: 5)
        var b = [UInt64](repeating: 0, count: 25)

        for round in 0..<24 {
            // θ
            for x in 0..<5 {
                c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20]
            }
            for x in 0..<5 {
                let d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1)
                for y in 0..<5 { a[x + 5 * y] ^= d }
            }
            // ρ + π
            for x in 0..<5 {
                for y in 0..<5 {
                    b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(a[x + 5 * y], RHO[x + 5 * y])
                }
            }
            // χ
            for y in 0..<5 {
                for x in 0..<5 {
                    a[x + 5 * y] = b[x + 5 * y] ^ (~b[(x + 1) % 5 + 5 * y] & b[(x + 2) % 5 + 5 * y])
                }
            }
            // ι
            a[0] ^= RC[round]
        }
    }

    @inline(__always)
    private static func xorByte(_ st: inout [UInt64], _ idx: Int, _ v: UInt8) {
        let lane = idx / 8
        let shift = UInt64(8 * (idx % 8))
        st[lane] ^= (UInt64(v) << shift)
    }

    /// Ein Sponge-Durchlauf: absorbieren, padden, squeeze.
    /// - rate: Bytes pro Block (136 SHA3-256/SHAKE256, 72 SHA3-512, 168 SHAKE128)
    /// - domain: 0x06 = SHA3, 0x1F = SHAKE
    private static func sponge(rate: Int, domain: UInt8, input: [UInt8], outLen: Int) -> [UInt8] {
        var st = [UInt64](repeating: 0, count: 25)
        var pos = 0

        for byte in input {
            xorByte(&st, pos, byte)
            pos += 1
            if pos == rate { permute(&st); pos = 0 }
        }
        xorByte(&st, pos, domain)
        xorByte(&st, rate - 1, 0x80)
        permute(&st)
        pos = 0

        var out = [UInt8](repeating: 0, count: outLen)
        var o = 0
        while o < outLen {
            let lane = st[pos / 8]
            let shift = UInt64(8 * (pos % 8))
            out[o] = UInt8((lane >> shift) & 0xFF)
            o += 1
            pos += 1
            if pos == rate && o < outLen { permute(&st); pos = 0 }
        }
        return out
    }

    public static func sha3_256(_ data: [UInt8]) -> [UInt8] { sponge(rate: 136, domain: 0x06, input: data, outLen: 32) }
    public static func sha3_512(_ data: [UInt8]) -> [UInt8] { sponge(rate: 72, domain: 0x06, input: data, outLen: 64) }
    public static func shake256(_ data: [UInt8], outLen: Int) -> [UInt8] { sponge(rate: 136, domain: 0x1F, input: data, outLen: outLen) }
    public static func shake128(_ data: [UInt8], outLen: Int) -> [UInt8] { sponge(rate: 168, domain: 0x1F, input: data, outLen: outLen) }

    // MARK: Streaming-XOF für das Rejection-Sampling

    /// Für SampleNTT: wir wissen nicht vorher, wie viele Bytes wir brauchen.
    /// Ein fester shake128-Aufruf mit geschätzter Länge wäre falsch.
    public final class Xof {
        private var st = [UInt64](repeating: 0, count: 25)
        private let rate: Int
        private var pos = 0

        public init(rate: Int, domain: UInt8, input: [UInt8]) {
            self.rate = rate
            var p = 0
            for byte in input {
                let lane = p / 8
                let shift = UInt64(8 * (p % 8))
                st[lane] ^= (UInt64(byte) << shift)
                p += 1
                if p == rate { Keccak.permute(&st); p = 0 }
            }
            let lane = p / 8
            st[lane] ^= (UInt64(domain) << UInt64(8 * (p % 8)))
            let last = rate - 1
            st[last / 8] ^= (0x80 << UInt64(8 * (last % 8)))
            Keccak.permute(&st)
            pos = 0
        }

        public func read(_ n: Int) -> [UInt8] {
            var out = [UInt8](repeating: 0, count: n)
            for i in 0..<n {
                out[i] = UInt8((st[pos / 8] >> UInt64(8 * (pos % 8))) & 0xFF)
                pos += 1
                if pos == rate { Keccak.permute(&st); pos = 0 }
            }
            return out
        }
    }

    public static func xofShake128(_ seed: [UInt8]) -> Xof { Xof(rate: 168, domain: 0x1F, input: seed) }
}
