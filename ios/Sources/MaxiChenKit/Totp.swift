import Foundation

// =====================================================================
// 🔢 Totp.swift — RFC 4226 / RFC 6238, identisch zum Android-Kern
// ---------------------------------------------------------------------
// SHA1 · 30 Sekunden · 6 Stellen · ±1 Fenster beim Prüfen.
// Die Vektoren sind dieselben, gegen die auch Kotlin und Node geprüft
// werden — wenn hier etwas abweicht, fällt es sofort auf.
// =====================================================================

public struct TotpConfig {
    public var secret: [UInt8]
    public var digits: Int
    public var period: Int
    public var issuer: String
    public var account: String

    public init(secret: [UInt8], digits: Int = 6, period: Int = 30,
                issuer: String = "MaxiChen", account: String = "") {
        self.secret = secret
        self.digits = digits
        self.period = period
        self.issuer = issuer
        self.account = account
    }
}

public enum Totp {

    public static let digitsDefault = 6
    public static let period = 30

    /// Rohes HOTP nach RFC 4226.
    public static func hotp(secret: [UInt8], counter: UInt64, digits: Int = digitsDefault) -> String {
        var msg = [UInt8]()
        for i in (0..<8).reversed() { msg.append(UInt8((counter >> (UInt64(i) * 8)) & 0xFF)) }

        let h = HMAC.sha1(key: secret, message: msg)
        let offset = Int(h[19] & 0x0F)
        let bin = (UInt32(h[offset] & 0x7F) << 24)
            | (UInt32(h[offset + 1]) << 16)
            | (UInt32(h[offset + 2]) << 8)
            | UInt32(h[offset + 3])

        var mod: UInt32 = 1
        for _ in 0..<digits { mod *= 10 }
        let code = bin % mod
        var s = String(code)
        while s.count < digits { s = "0" + s }
        return s
    }

    /// TOTP für einen Unix-Zeitpunkt (in Sekunden).
    public static func totp(secret: [UInt8], timeSeconds: Int64, period p: Int = period, digits: Int = digitsDefault) -> String {
        let counter = UInt64(bitPattern: timeSeconds) / UInt64(p)
        return hotp(secret: secret, counter: counter, digits: digits)
    }

    /// Prüft einen Code. Fenster ±1 = 30 s davor/danach, wie die meisten Server.
    public static func verify(secret: [UInt8], code: String, timeSeconds: Int64,
                              window: Int = 1, period p: Int = period, digits: Int = digitsDefault) -> Bool {
        let clean = code.filter { $0.isNumber }
        guard clean.count == digits else { return false }
        let counter = Int64(bitPattern: UInt64(bitPattern: timeSeconds) / UInt64(p))

        // Bewusst ALLE Fenster prüfen, nicht beim ersten Treffer abbrechen —
        // sonst verrät die Laufzeit, ob der Code im ersten Fenster lag.
        var hit = false
        for d in -window...window {
            let c = counter + Int64(d)
            if c < 0 { continue }
            let candidate = hotp(secret: secret, counter: UInt64(c), digits: digits)
            if ConstantTime.equals(candidate, clean) { hit = true }
        }
        return hit
    }

    /// Sekunden bis zum nächsten Code (für den Ring in der UI).
    public static func secondsRemaining(_ timeSeconds: Int64, period p: Int = period) -> Int {
        Int(Int64(p) - (timeSeconds % Int64(p)))
    }

    /// 20 zufällige Bytes — 160 Bit, wie bei den meisten Authenticator-Apps.
    public static func newSecret() -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: 20)
        for i in 0..<bytes.count { bytes[i] = UInt8.random(in: 0...255) }
        return bytes
    }

    /// otpauth://totp/… — der Doppelpunkt zwischen Issuer und Konto ist
    /// TRENNER, nicht Text. Darum werden die beiden Teile einzeln kodiert.
    public static func otpauthUrl(_ cfg: TotpConfig) -> String {
        let secret = Base32.encode(cfg.secret)
        var label = encodeLabelPart(cfg.issuer)
        if !cfg.account.isEmpty { label += ":" + encodeLabelPart(cfg.account) }

        var url = "otpauth://totp/" + label
        url += "?secret=" + secret
        url += "&issuer=" + encodeQuery(cfg.issuer)
        url += "&algorithm=SHA1"
        url += "&digits=" + String(cfg.digits)
        url += "&period=" + String(cfg.period)
        return url
    }

    private static func encodeLabelPart(_ s: String) -> String {
        // wie Android: Leerzeichen als %20, Doppelpunkt bleibt Trenner
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    private static func encodeQuery(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }
}
