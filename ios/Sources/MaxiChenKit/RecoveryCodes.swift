import Foundation

// =====================================================================
// 🎫 RecoveryCodes.swift — 10 Codes, jeder genau einmal
// ---------------------------------------------------------------------
// Alphabet ohne O/0/I/1/L: die verwechselt man beim Abtippen.
// PBKDF2-HMAC-SHA256 mit 120.000 Runden und eigenem Salt je Code —
// dieselben Parameter wie Kotlin und der Node-Server.
// =====================================================================

public struct RecoveryCode: Equatable {
    public let index: Int
    public let salt: [UInt8]
    public let hash: [UInt8]
    public var used: Bool

    /// ABCD-EFGH — so, wie man es abschreibt.
    public var formatted: String { RecoveryCodes.format(raw) }

    public let raw: String

    public init(index: Int, salt: [UInt8], hash: [UInt8], used: Bool = false, raw: String = "") {
        self.index = index
        self.salt = salt
        self.hash = hash
        self.used = used
        self.raw = raw
    }
}

public enum RecoveryCodes {

    public static let alphabet: [Character] = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    public static let codeLength = 8
    public static let rounds = 120_000

    /// Erzeugt 10 Codes. Das Klartext-Format wird EINMAL gezeigt, danach
    /// liegen nur Salt + Hash vor.
    public static func generate(count: Int = 10) -> (codes: [RecoveryCode], plain: [String]) {
        var out: [RecoveryCode] = []
        var plain: [String] = []
        for i in 0..<count {
            let raw = randomCode()
            let salt = randomBytes(16)
            let hash = PBKDF2.sha256(password: raw, salt: salt, rounds: rounds, keyLength: 32)
            out.append(RecoveryCode(index: i, salt: salt, hash: hash, used: false, raw: raw))
            plain.append(format(raw))
        }
        return (out, plain)
    }

    /// Prüft ALLE Einträge, ohne beim ersten Treffer abzubrechen.
    /// Sonst verrät die Laufzeit, an welcher Stelle der Code stand.
    public static func verify(_ input: String, codes: [RecoveryCode]) -> Int? {
        let clean = normalize(input)
        guard clean.count == codeLength else { return nil }

        var hit: Int? = nil
        for c in codes where !c.used {
            let h = PBKDF2.sha256(password: clean, salt: c.salt, rounds: rounds, keyLength: 32)
            if ConstantTime.equals(h, c.hash) { hit = c.index }
        }
        return hit
    }

    /// normalisiert Eingaben wie "abcd efgh" oder "abcd-efgh"
    public static func normalize(_ input: String) -> String {
        let up = input.uppercased()
        let filtered = up.filter { $0.isLetter || $0.isNumber }
        // O→0 und I/L→1 sind Tippfehler, aber NICHT im Alphabet — also verwerfen
        let cleaned = filtered.filter { alphabet.contains($0) }
        return String(cleaned.prefix(codeLength))
    }

    public static func format(_ raw: String) -> String {
        let s = String(raw.prefix(codeLength))
        guard s.count == codeLength else { return s }
        let a = s.prefix(4)
        let b = s.suffix(4)
        return "\(a)-\(b)"
    }

    public static func randomCode() -> String {
        var s = ""
        for _ in 0..<codeLength { s.append(alphabet[Int.random(in: 0..<alphabet.count)]) }
        return s
    }

    public static func randomBytes(_ n: Int) -> [UInt8] {
        var b = [UInt8](repeating: 0, count: n)
        for i in 0..<n { b[i] = UInt8.random(in: 0...255) }
        return b
    }

    /// Speicherformat wie in Kotlin: index,salt,hash,used;…
    public static func encode(_ codes: [RecoveryCode]) -> String {
        codes.map {
            "\($0.index),\(Hex.encode($0.salt)),\(Hex.encode($0.hash)),\($0.used ? 1 : 0)"
        }.joined(separator: ";")
    }

    public static func decode(_ text: String?) -> [RecoveryCode] {
        guard let t = text, !t.isEmpty else { return [] }
        var out: [RecoveryCode] = []
        for part in t.components(separatedBy: ";") {
            let f = part.components(separatedBy: ",")
            guard f.count == 4, let idx = Int(f[0]),
                  let salt = Hex.decode(f[1]), let hash = Hex.decode(f[2]) else { continue }
            out.append(RecoveryCode(index: idx, salt: salt, hash: hash, used: f[3] == "1"))
        }
        return out
    }
}

// =====================================================================
// 🔢 PinLock.swift — App-PIN
// =====================================================================

public struct PinRecord {
    public let salt: [UInt8]
    public let hash: [UInt8]
    public let length: Int
}

public enum PinLock {

    public static let rounds = 120_000
    /// Sekunden Sperre nach n Fehlversuchen (Index = Anzahl Fehlversuche).
    public static let lockoutMs: [Int64] = [0, 0, 0, 30_000, 120_000, 600_000, 1_800_000]

    /// Reihen, die jedes Handy-Skript zuerst probiert.
    private static let weak: Set<String> = ["1111", "0000", "1234", "4321", "2222", "9999", "1212", "1122"]

    public static func validate(_ pin: String) -> String? {
        let digits = pin.filter { $0.isNumber }
        if digits.count != pin.count { return "Nur Ziffern" }
        if pin.count < 4 { return "Mindestens 4 Ziffern" }
        if pin.count > 12 { return "Höchstens 12 Ziffern" }
        if weak.contains(pin) { return "Zu leicht zu raten" }

        // vier gleiche Ziffern hintereinander
        let chars = Array(pin)
        if chars.count >= 4 {
            for i in 0...(chars.count - 4) {
                if chars[i] == chars[i + 1] && chars[i] == chars[i + 2] && chars[i] == chars[i + 3] {
                    return "Zu leicht zu raten"
                }
            }
        }
        // 1234, 2345, … und rückwärts
        if chars.count >= 4 {
            for i in 0...(chars.count - 4) {
                let window = chars[i..<(i + 4)].compactMap { Int(String($0)) }
                if window.count == 4 {
                    let up = window[1] == window[0] + 1 && window[2] == window[1] + 1 && window[3] == window[2] + 1
                    let down = window[1] == window[0] - 1 && window[2] == window[1] - 1 && window[3] == window[2] - 1
                    if up || down { return "Zu leicht zu raten" }
                }
            }
        }
        return nil
    }

    public static func store(_ pin: String) -> PinRecord {
        let salt = RecoveryCodes.randomBytes(16)
        let hash = PBKDF2.sha256(password: pin, salt: salt, rounds: rounds, keyLength: 32)
        return PinRecord(salt: salt, hash: hash, length: pin.count)
    }

    public static func verify(_ pin: String, against record: PinRecord) -> Bool {
        let h = PBKDF2.sha256(password: pin, salt: record.salt, rounds: rounds, keyLength: 32)
        return ConstantTime.equals(h, record.hash)
    }

    /// Wie lange noch gesperrt? 0 = offen.
    public static func lockoutRemaining(failures: Int, lastFailureMs: Int64, nowMs: Int64) -> Int64 {
        guard failures >= 3, failures < lockoutMs.count else {
            return failures >= lockoutMs.count ? 0 : 0
        }
        let wait = lockoutMs[failures]
        let elapsed = nowMs - lastFailureMs
        return max(0, wait - elapsed)
    }

    public static func lockoutText(_ ms: Int64) -> String {
        let s = (ms + 999) / 1000
        if s < 60 { return "\(s) Sekunden" }
        return "\(s / 60) Minuten"
    }

    public static func encode(_ r: PinRecord) -> String {
        "\(Hex.encode(r.salt)),\(Hex.encode(r.hash)),\(r.length)"
    }

    public static func decode(_ text: String?) -> PinRecord? {
        guard let t = text else { return nil }
        let f = t.components(separatedBy: ",")
        guard f.count == 3, let salt = Hex.decode(f[0]), let hash = Hex.decode(f[1]), let len = Int(f[2]) else { return nil }
        return PinRecord(salt: salt, hash: hash, length: len)
    }
}
