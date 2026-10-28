import Foundation

// =====================================================================
// 📱 Onboard.swift — dieselbe Logik wie `Onboard.kt` auf Android
// ---------------------------------------------------------------------
// Die Nummer ist der Schlüssel zum Konto. Geht hier ein Zeichen verloren,
// bekommt ein Fremder den Code — oder niemand kommt mehr rein.
// Deshalb: exakt dieselben Regeln wie Server (accounts.js) und Android.
// =====================================================================

public enum Onboard {

    // MARK: Telefonnummer

    /// Wie `accounts.normalizePhone` im Node-Server und `Onboard.kt` in Android.
    public static func normalizePhone(_ raw: String?) -> String {
        var p = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        p = String(p.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) || $0 == "+" })
        if p.isEmpty { return "" }
        if p.hasPrefix("00") { p = "+" + p.dropFirst(2) }
        if !p.hasPrefix("+") { p = "+" + p }

        // ^\+\d{7,15}$
        let body = p.dropFirst()
        guard p.hasPrefix("+"), body.count >= 7, body.count <= 15,
              body.allSatisfy({ $0.isNumber }) else { return "" }
        return p
    }

    public static func nationalNumber(_ raw: String?) -> String {
        (raw ?? "").filter { $0.isNumber }
    }

    /// +49 151 558 947 14 — grob, aber stabil.
    public static func prettyPhone(_ e164: String?) -> String {
        let p = normalizePhone(e164)
        guard !p.isEmpty else { return "" }
        let d = String(p.dropFirst())
        guard d.count > 6 else { return p }

        let cc = (d.hasPrefix("49") || d.hasPrefix("43") || d.hasPrefix("41"))
            ? String(d.prefix(2)) : String(d.prefix(1))
        let rest = String(d.dropFirst(cc.count))
        var groups: [String] = []
        var i = rest.startIndex
        while i < rest.endIndex {
            let end = rest.index(i, offsetBy: min(3, rest.distance(from: i, to: rest.endIndex)))
            groups.append(String(rest[i..<end]))
            i = end
        }
        return "+" + cc + " " + groups.joined(separator: " ")
    }

    // MARK: Codes

    public static func sanitizeCode(_ raw: String?, max: Int = 6) -> String {
        String((raw ?? "").filter { $0.isNumber }.prefix(max))
    }

    public static func isCompleteCode(_ raw: String?, length: Int = 6) -> Bool {
        sanitizeCode(raw, max: length).count == length
    }

    public static func codeProblem(_ raw: String?, length: Int = 6) -> String? {
        let s = raw ?? ""
        if s.isEmpty { return nil }
        if s.contains(where: { !$0.isNumber }) { return "Nur Ziffern" }
        if s.count < length { return "Noch \(length - s.count) Ziffern" }
        return nil
    }

    // MARK: Kontoname

    public static func sanitizeUsername(_ raw: String?) -> String {
        let lowered = (raw ?? "").lowercased()
        let filtered = lowered.filter { ("a"..."z").contains($0) || $0.isNumber || $0 == "_" }
        // Achtung: isNumber ist zu breit (٣ ist auch eine Zahl) — deshalb prüfen wir ASCII
        let ascii = lowered.filter { c in
            guard let a = c.asciiValue else { return false }
            return (a >= 97 && a <= 122) || (a >= 48 && a <= 57) || a == 95
        }
        _ = filtered
        return String(ascii.prefix(20))
    }

    public static func usernameProblem(_ raw: String?) -> String? {
        let s = raw ?? ""
        if s.count < 3 { return "Mindestens 3 Zeichen" }
        if s.count > 20 { return "Höchstens 20 Zeichen" }
        let ok = s.allSatisfy { c in
            guard let a = c.asciiValue else { return false }
            return (a >= 97 && a <= 122) || (a >= 48 && a <= 57) || a == 95
        }
        if !ok { return "Nur a–z, 0–9 und _" }
        return nil
    }

    public static func displayNameProblem(_ raw: String?) -> String? {
        let s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.count < 2 { return "Mindestens 2 Zeichen" }
        if s.count > 30 { return "Höchstens 30 Zeichen" }
        return nil
    }

    // MARK: E-Mail

    public static func isEmail(_ raw: String?) -> Bool {
        let s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        // ^[^\s@]+@[^\s@]+\.[^\s@]{2,}$  — derselbe Test wie im Server
        guard let at = s.firstIndex(of: "@"), s.firstIndex(of: "@") == s.lastIndex(of: "@") else { return false }
        let local = String(s[s.startIndex..<at])
        let domain = String(s[s.index(after: at)...])
        guard !local.isEmpty, !domain.isEmpty else { return false }
        guard !local.contains(where: { $0.isWhitespace }), !domain.contains(where: { $0.isWhitespace }) else { return false }
        guard let dot = domain.lastIndex(of: ".") else { return false }
        let tld = domain[domain.index(after: dot)...]
        return tld.count >= 2
    }

    // MARK: Ablauf

    public enum Step: String {
        case phone, profile, email, done
    }

    public static func nextStep(phoneVerified: Bool, profileDone: Bool, emailDone: Bool) -> Step {
        if !phoneVerified { return .phone }
        if !profileDone { return .profile }
        if !emailDone { return .email }
        return .done
    }

    public static func resendAllowed(secondsSinceLast: Int, lastMinuteCount: Int) -> Bool {
        secondsSinceLast >= 30 && lastMinuteCount < 3
    }

    // MARK: feste Werte

    public static let mailFrom = "contact@maxichen.de"
    public static let mailSubject = "maxichen verifizierungscode"
    public static let whatsappSession = "Verifi"
}
