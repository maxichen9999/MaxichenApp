import Foundation

// =====================================================================
// 🔐 Crypto.swift — SHA-1, SHA-256, HMAC, PBKDF2, Base32, Hex
// ---------------------------------------------------------------------
// Warum selbst geschrieben?
//   CryptoKit gibt es erst ab iOS 13. Wir wollen ab iOS 12 laufen.
//   CommonCrypto gäbe es, ist aber ein C-Header ohne Swift-Typen und
//   lässt sich auf Linux nicht testen.
//   Also: reines Swift. Damit ist der Code auf iOS 12, auf dem Mac und
//   auf Linux identisch — und ich kann ihn hier beweisen.

// MARK: - SHA-1 (nur für TOTP, nie für Passwörter)

public enum SHA1 {

    public static func hash(_ message: [UInt8]) -> [UInt8] {
        var h: [UInt32] = [0x6745_2301, 0xEFCD_AB89, 0x98BA_DCFE, 0x1032_5476, 0xC3D2_E1F0]
        var msg = message
        let bitLen = UInt64(message.count) * 8

        msg.append(0x80)
        while msg.count % 64 != 56 { msg.append(0x00) }
        for i in (0..<8).reversed() { msg.append(UInt8((bitLen >> (UInt64(i) * 8)) & 0xFF)) }

        var w = [UInt32](repeating: 0, count: 80)

        for chunk in stride(from: 0, to: msg.count, by: 64) {
            for i in 0..<16 {
                let b = chunk + i * 4
                w[i] = (UInt32(msg[b]) << 24) | (UInt32(msg[b + 1]) << 16)
                    | (UInt32(msg[b + 2]) << 8) | UInt32(msg[b + 3])
            }
            for i in 16..<80 {
                let x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
                w[i] = rotl(x, 1)
            }

            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4]

            for i in 0..<80 {
                var f: UInt32
                var k: UInt32
                switch i {
                case 0..<20: f = (b & c) | (~b & d); k = 0x5A82_7999
                case 20..<40: f = b ^ c ^ d; k = 0x6ED9_EBA1
                case 40..<60: f = (b & c) | (b & d) | (c & d); k = 0x8F1B_BCDC
                default: f = b ^ c ^ d; k = 0xCA62_C1D6
                }
                let temp = rotl(a, 5) &+ f &+ e &+ k &+ w[i]
                e = d; d = c; c = rotl(b, 30); b = a; a = temp
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c
            h[3] = h[3] &+ d; h[4] = h[4] &+ e
        }

        var out = [UInt8]()
        out.reserveCapacity(20)
        for v in h {
            out.append(UInt8((v >> 24) & 0xFF)); out.append(UInt8((v >> 16) & 0xFF))
            out.append(UInt8((v >> 8) & 0xFF)); out.append(UInt8(v & 0xFF))
        }
        return out
    }

    private static func rotl(_ x: UInt32, _ n: UInt32) -> UInt32 {
        (x << n) | (x >> (32 - n))
    }
}

// MARK: - SHA-256

public enum SHA256 {

    private static let k: [UInt32] = [
        0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4, 0xab1c_5ed5,
        0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe, 0x9bdc_06a7, 0xc19b_f174,
        0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f, 0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da,
        0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7, 0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967,
        0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc, 0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85,
        0xa2bf_e8a1, 0xa81a_664b, 0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070,
        0x19a4_c116, 0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
        0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7, 0xc671_78f2,
    ]

    public static func hash(_ message: [UInt8]) -> [UInt8] {
        var h: [UInt32] = [
            0x6a09_e667, 0xbb67_ae85, 0x3c6e_f372, 0xa54f_f53a,
            0x510e_527f, 0x9b05_688c, 0x1f83_d9ab, 0x5be0_cd19,
        ]
        var msg = message
        let bitLen = UInt64(message.count) * 8

        msg.append(0x80)
        while msg.count % 64 != 56 { msg.append(0x00) }
        for i in (0..<8).reversed() { msg.append(UInt8((bitLen >> (UInt64(i) * 8)) & 0xFF)) }

        var w = [UInt32](repeating: 0, count: 64)

        for chunk in stride(from: 0, to: msg.count, by: 64) {
            for i in 0..<16 {
                let b = chunk + i * 4
                w[i] = (UInt32(msg[b]) << 24) | (UInt32(msg[b + 1]) << 16)
                    | (UInt32(msg[b + 2]) << 8) | UInt32(msg[b + 3])
            }
            for i in 16..<64 {
                let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
                let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
                w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
            }

            var a = h[0], b = h[1], c = h[2], d = h[3]
            var e = h[4], f = h[5], g = h[6], hh = h[7]

            for i in 0..<64 {
                let S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
                let ch = (e & f) ^ (~e & g)
                let temp1 = hh &+ S1 &+ ch &+ k[i] &+ w[i]
                let S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
                let maj = (a & b) ^ (a & c) ^ (b & c)
                let temp2 = S0 &+ maj

                hh = g; g = f; f = e
                e = d &+ temp1
                d = c; c = b; b = a
                a = temp1 &+ temp2
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d
            h[4] = h[4] &+ e; h[5] = h[5] &+ f; h[6] = h[6] &+ g; h[7] = h[7] &+ hh
        }

        var out = [UInt8]()
        out.reserveCapacity(32)
        for v in h {
            out.append(UInt8((v >> 24) & 0xFF)); out.append(UInt8((v >> 16) & 0xFF))
            out.append(UInt8((v >> 8) & 0xFF)); out.append(UInt8(v & 0xFF))
        }
        return out
    }

    public static func hash(_ text: String) -> [UInt8] { hash(Array(text.utf8)) }

    private static func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 {
        (x >> n) | (x << (32 - n))
    }
}

// MARK: - HMAC

public enum HMAC {

    public static func sha1(key: [UInt8], message: [UInt8]) -> [UInt8] {
        let blockSize = 64
        var k = key
        if k.count > blockSize { k = SHA1.hash(k) }
        while k.count < blockSize { k.append(0) }

        var ipad = [UInt8](repeating: 0x36, count: blockSize)
        var opad = [UInt8](repeating: 0x5c, count: blockSize)
        for i in 0..<blockSize {
            ipad[i] ^= k[i]
            opad[i] ^= k[i]
        }
        let inner = SHA1.hash(ipad + message)
        return SHA1.hash(opad + inner)
    }

    public static func sha256(key: [UInt8], message: [UInt8]) -> [UInt8] {
        let blockSize = 64
        var k = key
        if k.count > blockSize { k = SHA256.hash(k) }
        while k.count < blockSize { k.append(0) }

        var ipad = [UInt8](repeating: 0x36, count: blockSize)
        var opad = [UInt8](repeating: 0x5c, count: blockSize)
        for i in 0..<blockSize {
            ipad[i] ^= k[i]
            opad[i] ^= k[i]
        }
        let inner = SHA256.hash(ipad + message)
        return SHA256.hash(opad + inner)
    }

    public static func sha1(key: String, message: String) -> [UInt8] {
        sha1(key: Array(key.utf8), message: Array(message.utf8))
    }

    public static func sha256(key: String, message: String) -> [UInt8] {
        sha256(key: Array(key.utf8), message: Array(message.utf8))
    }
}

// MARK: - PBKDF2

#if canImport(CommonCrypto)
import CommonCrypto
#endif

public enum PBKDF2 {

    /// PBKDF2-HMAC-SHA256. Genau die Parameter, die Android und der Server nutzen.
    ///
    /// Auf Apple-Plattformen geht es über CommonCrypto — das ist optimiertes C
    /// und braucht für 120.000 Runden wenige Millisekunden. Auf Linux (also in
    /// meinen Tests hier) gibt es kein CommonCrypto, dann rechnet die Swift-
    /// Fassung darunter. Sie ist korrekt, aber deutlich langsamer — im Debug-
    /// Build rund 17 Sekunden für 120.000 Runden. Deshalb: auf dem Gerät immer
    /// CommonCrypto, und niemals PBKDF2 im UI-Thread.
    public static func sha256(password: String, salt: [UInt8], rounds: Int, keyLength: Int = 32) -> [UInt8] {
        #if canImport(CommonCrypto)
        var derived = [UInt8](repeating: 0, count: keyLength)
        let pw = Array(password.utf8)
        let status = salt.withUnsafeBufferPointer { saltBuf -> Int32 in
            pw.withUnsafeBufferPointer { pwBuf -> Int32 in
                derived.withUnsafeMutableBufferPointer { outBuf -> Int32 in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        pwBuf.baseAddress.map { UnsafePointer<Int8>(OpaquePointer($0)) },
                        pw.count,
                        saltBuf.baseAddress,
                        salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                        UInt32(rounds),
                        outBuf.baseAddress,
                        keyLength
                    )
                }
            }
        }
        if status == kCCSuccess { return derived }
        // CommonCrypto hat abgelehnt → lieber selbst rechnen als still falsch sein
        return sha256Pure(password: password, salt: salt, rounds: rounds, keyLength: keyLength)
        #else
        return sha256Pure(password: password, salt: salt, rounds: rounds, keyLength: keyLength)
        #endif
    }

    /// Die reine Swift-Fassung — auf Linux die einzige, auf dem Mac der Notausgang.
    static func sha256Pure(password: String, salt: [UInt8], rounds: Int, keyLength: Int) -> [UInt8] {
        let pw = Array(password.utf8)
        let hLen = 32
        let blocks = (keyLength + hLen - 1) / hLen
        var out = [UInt8]()

        for block in 1...max(1, blocks) {
            var u = HMAC.sha256(key: pw, message: salt + beUInt32(UInt32(block)))
            var t = u
            if rounds > 1 {
                for _ in 1..<rounds {
                    u = HMAC.sha256(key: pw, message: u)
                    for i in 0..<t.count { t[i] ^= u[i] }
                }
            }
            out.append(contentsOf: t)
        }
        return Array(out.prefix(keyLength))
    }

    private static func beUInt32(_ v: UInt32) -> [UInt8] {
        [UInt8((v >> 24) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)]
    }
}

// MARK: - Base32 (RFC 4648, ohne Padding — so wie Android und der Server)

public enum Base32 {

    private static let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".utf8)

    public static func encode(_ data: [UInt8]) -> String {
        var out = [UInt8]()
        var buffer: UInt32 = 0
        var bits = 0
        for byte in data {
            buffer = (buffer << 8) | UInt32(byte)
            bits += 8
            while bits >= 5 {
                let idx = Int((buffer >> UInt32(bits - 5)) & 0x1F)
                out.append(alphabet[idx])
                bits -= 5
            }
        }
        if bits > 0 {
            let idx = Int((buffer << UInt32(5 - bits)) & 0x1F)
            out.append(alphabet[idx])
        }
        return String(decoding: out, as: UTF8.self)
    }

    public static func decode(_ text: String) -> [UInt8]? {
        let clean = text.uppercased().replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "=", with: "")
        var out = [UInt8]()
        var buffer: UInt32 = 0
        var bits = 0

        for ch in clean.utf8 {
            guard let idx = alphabet.firstIndex(of: ch) else { return nil }
            buffer = (buffer << 5) | UInt32(idx)
            bits += 5
            if bits >= 8 {
                out.append(UInt8((buffer >> UInt32(bits - 8)) & 0xFF))
                bits -= 8
            }
        }
        return out
    }
}

// MARK: - Hex

public enum Hex {

    public static func encode(_ data: [UInt8]) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    public static func decode(_ text: String) -> [UInt8]? {
        let s = text.lowercased()
        guard s.count % 2 == 0 else { return nil }
        var out = [UInt8]()
        var i = s.startIndex
        while i < s.endIndex {
            let next = s.index(i, offsetBy: 2)
            guard let v = UInt8(s[i..<next], radix: 16) else { return nil }
            out.append(v)
            i = next
        }
        return out
    }
}

// MARK: - Konstantzeit-Vergleich

public enum ConstantTime {

    /// Vergleicht zwei Bytes, ohne beim ersten Unterschied abzubrechen.
    /// Ein normaler == wäre über die Laufzeit messbar.
    public static func equals(_ a: [UInt8], _ b: [UInt8]) -> Bool {
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<a.count { diff |= a[i] ^ b[i] }
        return diff == 0
    }

    public static func equals(_ a: String, _ b: String) -> Bool {
        equals(Array(a.utf8), Array(b.utf8))
    }
}
