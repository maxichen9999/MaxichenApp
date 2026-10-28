import Foundation

// =====================================================================
// ✅ Badge.swift — Verified-Haken, clientseitig geprüft
// ---------------------------------------------------------------------
// Die Nutzlast muss BYTE-GENAU dieselbe sein wie auf dem Server und in
// Kotlin:  maxichat-badge-v1|userId|role|avatarHash|issuedAt
// Ein Leerzeichen zu viel und jede Signatur der Welt ist ungültig.
// Genau deshalb steht das Format hier noch einmal — und wird getestet.

public enum BadgeRole: String {
    case owner, team, bot, verified, user

    public var emoji: String {
        switch self {
        case .owner: return "👑"
        case .team: return "🛡️"
        case .bot: return "🤖"
        case .verified: return "✅"
        case .user: return "👤"
        }
    }

    public var label: String {
        switch self {
        case .owner: return "Owner"
        case .team: return "Team"
        case .bot: return "Bot"
        case .verified: return "Verifiziert"
        case .user: return "Benutzer"
        }
    }

    public var colorHex: UInt32 {
        switch self {
        case .owner: return 0xE9A93B
        case .team: return 0xA97BFF
        case .bot: return 0x3BBE7A
        case .verified, .user: return 0x1D9BF0
        }
    }

    public var hasMark: Bool { self != .user }
}

public struct Badge {
    public let userId: String
    public let role: BadgeRole
    public let avatarHash: String
    public let issuedAt: Int64
    public let signature: [UInt8]

    public init(userId: String, role: BadgeRole, avatarHash: String, issuedAt: Int64, signature: [UInt8]) {
        self.userId = userId
        self.role = role
        self.avatarHash = avatarHash
        self.issuedAt = issuedAt
        self.signature = signature
    }
}

public enum BadgeFormat {

    public static let version = "maxichat-badge-v1"
    public static let maxAgeMs: Int64 = 30 * 24 * 60 * 60 * 1000

    /// Die Bytes, die signiert werden. Server, Kotlin und Swift müssen hier
    /// exakt dasselbe erzeugen.
    public static func payload(userId: String, role: String, avatarHash: String, issuedAt: Int64) -> [UInt8] {
        Array("\(version)|\(userId)|\(role)|\(avatarHash)|\(issuedAt)".utf8)
    }

    /// Erste 32 Hex-Zeichen von SHA-256 über das Avatar-Feld. Leer = leer.
    public static func avatarHash(_ avatar: String?) -> String {
        let a = (avatar ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if a.isEmpty { return "" }
        let full = Hex.encode(SHA256.hash(a))
        return String(full.prefix(32))
    }

    public enum Failure: Error, Equatable {
        case noRole
        case wrongUser
        case unsigned
        case fromFuture
        case expired
        case avatarMismatch
        case badSignature

        public var text: String {
            switch self {
            case .noRole: return "keine Rolle"
            case .wrongUser: return "Haken gehört einem anderen Konto"
            case .unsigned: return "nicht signiert"
            case .fromFuture: return "Haken aus der Zukunft"
            case .expired: return "Haken abgelaufen — Server muss neu signieren"
            case .avatarMismatch: return "Profilbild passt nicht zur Signatur"
            case .badSignature: return "Signatur ungültig"
            }
        }
    }

    /// Prüft alles außer der Signatur selbst (die braucht die Plattform:
    /// Security.framework auf iOS, CryptoKit ab 13, BouncyCastle auf Linux).
    /// Gibt die zu prüfenden Bytes zurück, wenn sonst alles stimmt.
    public static func precheck(_ badge: Badge, expectedUserId: String,
                                currentAvatar: String?, nowMillis: Int64,
                                maxAgeMs: Int64 = BadgeFormat.maxAgeMs) -> Result<[UInt8], Failure> {
        if badge.role == .user { return .failure(.noRole) }
        if badge.userId != expectedUserId { return .failure(.wrongUser) }
        if badge.signature.isEmpty { return .failure(.unsigned) }

        let age = nowMillis - badge.issuedAt
        if age < 0 { return .failure(.fromFuture) }
        if age > maxAgeMs { return .failure(.expired) }
        if badge.avatarHash != avatarHash(currentAvatar) { return .failure(.avatarMismatch) }

        return .success(payload(userId: badge.userId, role: badge.role.rawValue,
                                avatarHash: badge.avatarHash, issuedAt: badge.issuedAt))
    }

    /// So schickt der Server einen Haken: userId|role|avatarHash|issuedAt|sig(base64)
    public static func decode(_ wire: String?) -> Badge? {
        guard let s = wire, !s.isEmpty else { return nil }
        let f = s.components(separatedBy: "|")
        guard f.count == 5 else { return nil }
        guard let issued = Int64(f[3]) else { return nil }
        guard let sig = Data(base64Encoded: f[4]) else { return nil }
        guard let role = BadgeRole(rawValue: f[1]) else { return Badge(userId: f[0], role: .user, avatarHash: f[2], issuedAt: issued, signature: [UInt8](sig)) }
        return Badge(userId: f[0], role: role, avatarHash: f[2], issuedAt: issued, signature: [UInt8](sig))
    }

    public static func encode(_ b: Badge) -> String {
        [b.userId, b.role.rawValue, b.avatarHash, String(b.issuedAt), Data(b.signature).base64EncodedString()]
            .joined(separator: "|")
    }
}
