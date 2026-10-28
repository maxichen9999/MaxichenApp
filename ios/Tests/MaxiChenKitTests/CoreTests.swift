import XCTest
@testable import MaxiChenKit

// =====================================================================
// 🧪 Tests gegen die offiziellen Vektoren — nicht gegen mich selbst
// ---------------------------------------------------------------------
// Dieselben Zahlen prüft auch der Android-Kern (TotpTest.kt) und die
// Node-Gegenprobe (tests/totp-vectors.js). Wenn iOS davon abweicht,
// passt eine der drei Seiten nicht.
// =====================================================================

final class CryptoVectorTests: XCTestCase {

    // MARK: SHA-1 (FIPS 180-4 / RFC 3174)

    func testSha1OfficialVectors() {
        XCTAssertEqual(Hex.encode(SHA1.hash(Array("abc".utf8))),
                       "a9993e364706816aba3e25717850c26c9cd0d89d")
        XCTAssertEqual(Hex.encode(SHA1.hash(Array("".utf8))),
                       "da39a3ee5e6b4b0d3255bfef95601890afd80709")
        XCTAssertEqual(Hex.encode(SHA1.hash(Array("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".utf8))),
                       "84983e441c3bd26ebaae4aa1f95129e5e54670f1")
    }

    // MARK: SHA-256 (FIPS 180-4)

    func testSha256OfficialVectors() {
        XCTAssertEqual(Hex.encode(SHA256.hash(Array("abc".utf8))),
                       "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(Hex.encode(SHA256.hash(Array("".utf8))),
                       "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(Hex.encode(SHA256.hash(Array("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".utf8))),
                       "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
    }

    // MARK: HMAC (RFC 2202 / RFC 4231)

    func testHmacSha1Vectors() {
        // RFC 2202, Test Case 1
        XCTAssertEqual(Hex.encode(HMAC.sha1(key: [0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b,
                                                 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b,
                                                 0x0b, 0x0b, 0x0b, 0x0b],
                                         message: Array("Hi There".utf8))),
                       "b617318655057264e28bc0b6fb378c8ef146be00")
        // RFC 2202, Test Case 2
        XCTAssertEqual(Hex.encode(HMAC.sha1(key: Array("Jefe".utf8),
                                            message: Array("what do ya want for nothing?".utf8))),
                       "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79")
    }

    func testHmacSha256Vectors() {
        // RFC 4231, Test Case 2
        XCTAssertEqual(Hex.encode(HMAC.sha256(key: Array("Jefe".utf8),
                                              message: Array("what do ya want for nothing?".utf8))),
                       "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843")
    }

    // MARK: Base32 (RFC 4648)

    func testBase32Rfc4648() {
        XCTAssertEqual(Base32.encode(Array("f".utf8)), "MY")
        XCTAssertEqual(Base32.encode(Array("fo".utf8)), "MZXQ")
        XCTAssertEqual(Base32.encode(Array("foo".utf8)), "MZXW6")
        XCTAssertEqual(Base32.encode(Array("foob".utf8)), "MZXW6YQ")
        XCTAssertEqual(Base32.encode(Array("fooba".utf8)), "MZXW6YTB")
        XCTAssertEqual(Base32.encode(Array("foobar".utf8)), "MZXW6YTBOI")
        XCTAssertEqual(Base32.decode("MZXW6YTBOI"), Array("foobar".utf8))
        XCTAssertEqual(Base32.decode("my"), Array("f".utf8), "klein geschrieben muss auch gehen")
        XCTAssertNil(Base32.decode("MZXW6YT1OI"), "1 ist kein Base32-Zeichen")
    }

    // MARK: PBKDF2 (RFC 6070 ist SHA-1; für SHA-256 der bekannte Vektor)

    func testPbkdf2Sha256() {
        // password="password", salt="salt", c=1, dkLen=32
        XCTAssertEqual(Hex.encode(PBKDF2.sha256(password: "password", salt: Array("salt".utf8), rounds: 1, keyLength: 32)),
                       "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b")
        // c=2
        XCTAssertEqual(Hex.encode(PBKDF2.sha256(password: "password", salt: Array("salt".utf8), rounds: 2, keyLength: 32)),
                       "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43")
        // c=4096
        XCTAssertEqual(Hex.encode(PBKDF2.sha256(password: "password", salt: Array("salt".utf8), rounds: 4096, keyLength: 32)),
                       "c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a")
    }
}

final class TotpTests: XCTestCase {

    /// RFC 4226, Anhang D — die zehn offiziellen HOTP-Werte.
    let rfc4226Secret: [UInt8] = Array("12345678901234567890".utf8)
    let rfc4226: [(UInt64, String)] = [
        (0, "755224"), (1, "287082"), (2, "359152"), (3, "969429"), (4, "338314"),
        (5, "254676"), (6, "287922"), (7, "162583"), (8, "399871"), (9, "520489"),
    ]

    func testHotpRfc4226() {
        for (counter, expected) in rfc4226 {
            XCTAssertEqual(Totp.hotp(secret: rfc4226Secret, counter: counter), expected,
                           "Counter \(counter)")
        }
    }

    /// RFC 6238, Anhang B — 8-stellig (SHA1-Reihe).
    func testTotpRfc6238() {
        let cases: [(Int64, String)] = [
            (59, "94287082"),
            (1111111109, "07081804"),
            (1111111111, "14050471"),
            (1234567890, "89005924"),
            (2000000000, "69279037"),
            (20000000000, "65353130"),
        ]
        for (time, expected) in cases {
            XCTAssertEqual(Totp.totp(secret: rfc4226Secret, timeSeconds: time, digits: 8), expected,
                           "t=\(time)")
        }
    }

    /// Dieselben Zeitpunkte, 6-stellig — genau die Werte, die auch Kotlin prüft.
    func testTotpSixDigits() {
        let cases: [(Int64, String)] = [
            (59, "287082"),
            (1111111109, "081804"),
            (1111111111, "050471"),
            (1234567890, "005924"),
            (2000000000, "279037"),
            (20000000000, "353130"),
        ]
        for (time, expected) in cases {
            XCTAssertEqual(Totp.totp(secret: rfc4226Secret, timeSeconds: time), expected, "t=\(time)")
        }
    }

    func testVerifyWindow() {
        let t: Int64 = 1_700_000_010
        let code = Totp.totp(secret: rfc4226Secret, timeSeconds: t)
        XCTAssertTrue(Totp.verify(secret: rfc4226Secret, code: code, timeSeconds: t))
        XCTAssertTrue(Totp.verify(secret: rfc4226Secret, code: code, timeSeconds: t + 20), "im Fenster")
        XCTAssertFalse(Totp.verify(secret: rfc4226Secret, code: code, timeSeconds: t + 120), "zu weit weg")
        XCTAssertFalse(Totp.verify(secret: rfc4226Secret, code: "000000", timeSeconds: t) && code != "000000")
    }

    func testSecondsRemaining() {
        XCTAssertEqual(Totp.secondsRemaining(0), 30)
        XCTAssertEqual(Totp.secondsRemaining(29), 1)
        XCTAssertEqual(Totp.secondsRemaining(30), 30)
        XCTAssertEqual(Totp.secondsRemaining(45), 15)
    }

    func testOtpauthUrlFormat() {
        let cfg = TotpConfig(secret: Array("12345678901234567890".utf8), issuer: "MaxiChen", account: "maxi")
        let url = Totp.otpauthUrl(cfg)
        XCTAssertTrue(url.hasPrefix("otpauth://totp/MaxiChen:maxi?"), url)
        XCTAssertTrue(url.contains("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), url)
        XCTAssertTrue(url.contains("issuer=MaxiChen"), url)
        XCTAssertTrue(url.contains("digits=6"), url)
        XCTAssertTrue(url.contains("period=30"), url)
        XCTAssertTrue(url.contains("algorithm=SHA1"), url)
        // Der Doppelpunkt zwischen Issuer und Konto darf NICHT kodiert sein
        XCTAssertFalse(url.contains("MaxiChen%3A"), "Doppelpunkt ist Trenner, kein Text")
    }
}

final class OnboardTests: XCTestCase {

    func testPhoneNormalisation() {
        XCTAssertEqual(Onboard.normalizePhone("+49 151 55894714"), "+4915155894714")
        XCTAssertEqual(Onboard.normalizePhone("004915155894714"), "+4915155894714")
        XCTAssertEqual(Onboard.normalizePhone("4915155894714"), "+4915155894714")
        XCTAssertEqual(Onboard.normalizePhone("+49 (151) 558-947-14"), "+4915155894714")
        XCTAssertEqual(Onboard.normalizePhone("hallo"), "")
        XCTAssertEqual(Onboard.normalizePhone("12"), "")
        XCTAssertEqual(Onboard.normalizePhone(""), "")
        XCTAssertEqual(Onboard.normalizePhone("1234567"), "+1234567")
        XCTAssertEqual(Onboard.normalizePhone("123456"), "")
        XCTAssertEqual(Onboard.normalizePhone("123456789012345"), "+123456789012345")
        XCTAssertEqual(Onboard.normalizePhone("1234567890123456"), "")
    }

    func testPrettyPhone() {
        XCTAssertEqual(Onboard.prettyPhone("+4915155894714"), "+49 151 558 947 14")
        XCTAssertEqual(Onboard.prettyPhone(""), "")
    }

    func testCodes() {
        XCTAssertEqual(Onboard.sanitizeCode("123 456"), "123456")
        XCTAssertEqual(Onboard.sanitizeCode("12a34b56"), "123456")
        XCTAssertEqual(Onboard.sanitizeCode("1234567890"), "123456")
        XCTAssertTrue(Onboard.isCompleteCode("123456"))
        XCTAssertFalse(Onboard.isCompleteCode("12345"))
        XCTAssertEqual(Onboard.codeProblem("123"), "Noch 3 Ziffern")
        XCTAssertEqual(Onboard.codeProblem("12a"), "Nur Ziffern")
        XCTAssertNil(Onboard.codeProblem(""))
    }

    func testUsername() {
        XCTAssertEqual(Onboard.sanitizeUsername("Maxi_M"), "maxi_m")
        XCTAssertEqual(Onboard.sanitizeUsername("Maxi M!"), "maxim")
        XCTAssertEqual(Onboard.sanitizeUsername("äöü"), "")
        XCTAssertEqual(Onboard.sanitizeUsername(String(repeating: "a", count: 40)).count, 20)
        XCTAssertEqual(Onboard.usernameProblem("ab"), "Mindestens 3 Zeichen")
        XCTAssertNil(Onboard.usernameProblem("abc"))
        XCTAssertEqual(Onboard.usernameProblem("a b"), "Nur a–z, 0–9 und _")
    }

    func testEmail() {
        XCTAssertTrue(Onboard.isEmail("maxi@example.com"))
        XCTAssertTrue(Onboard.isEmail("a.b+c@sub.example.de"))
        XCTAssertFalse(Onboard.isEmail("maxi@example"))
        XCTAssertFalse(Onboard.isEmail("@example.com"))
        XCTAssertFalse(Onboard.isEmail("maxi example.com"))
        XCTAssertFalse(Onboard.isEmail("a@b@c.de"))
        XCTAssertFalse(Onboard.isEmail(""))
    }

    func testSteps() {
        XCTAssertEqual(Onboard.nextStep(phoneVerified: false, profileDone: false, emailDone: false), .phone)
        XCTAssertEqual(Onboard.nextStep(phoneVerified: true, profileDone: false, emailDone: false), .profile)
        XCTAssertEqual(Onboard.nextStep(phoneVerified: true, profileDone: true, emailDone: false), .email)
        XCTAssertEqual(Onboard.nextStep(phoneVerified: true, profileDone: true, emailDone: true), .done)
    }

    func testConstants() {
        XCTAssertEqual(Onboard.mailFrom, "contact@maxichen.de")
        XCTAssertEqual(Onboard.mailSubject, "maxichen verifizierungscode")
        XCTAssertEqual(Onboard.whatsappSession, "Verifi")
    }
}

final class BadgeTests: XCTestCase {

    /// Dieser Hash stammt aus dem Android-Testlauf für 🦊 —
    /// wenn Swift hier etwas anderes rechnet, ist die Signatur tot.
    func testAvatarHashMatchesAndroid() {
        XCTAssertEqual(BadgeFormat.avatarHash("🦊"), "0a9f72e8edad3748ffee34e08891b3bf")
        XCTAssertEqual(BadgeFormat.avatarHash(""), "")
        XCTAssertEqual(BadgeFormat.avatarHash("   "), "")
        XCTAssertEqual(BadgeFormat.avatarHash("  🦊 "), "0a9f72e8edad3748ffee34e08891b3bf",
                       "Leerraum wird abgeschnitten")
        XCTAssertNotEqual(BadgeFormat.avatarHash("🐙"), BadgeFormat.avatarHash("🦊"))
    }

    func testPayloadExactFormat() {
        let p = String(decoding: BadgeFormat.payload(userId: "u1", role: "owner", avatarHash: "abcd", issuedAt: 1_700_000_000_000), as: UTF8.self)
        XCTAssertEqual(p, "maxichat-badge-v1|u1|owner|abcd|1700000000000")
    }

    func testPrecheck() {
        let now: Int64 = 1_790_000_000_000
        let hash = BadgeFormat.avatarHash("🦊")

        func make(role: BadgeRole = .owner, user: String = "u_maxi", avatar: String = hash,
                  issued: Int64 = 1_790_000_000_000, sig: [UInt8] = [1, 2, 3]) -> Badge {
            Badge(userId: user, role: role, avatarHash: avatar, issuedAt: issued, signature: sig)
        }

        guard case .success = BadgeFormat.precheck(make(), expectedUserId: "u_maxi", currentAvatar: "🦊", nowMillis: now) else {
            return XCTFail("gültiger Haken muss durchgehen")
        }
        XCTAssertEqual(BadgeFormat.precheck(make(role: .user), expectedUserId: "u_maxi", currentAvatar: "🦊", nowMillis: now),
                       .failure(.noRole))
        XCTAssertEqual(BadgeFormat.precheck(make(user: "u_boese"), expectedUserId: "u_maxi", currentAvatar: "🦊", nowMillis: now),
                       .failure(.wrongUser))
        XCTAssertEqual(BadgeFormat.precheck(make(sig: []), expectedUserId: "u_maxi", currentAvatar: "🦊", nowMillis: now),
                       .failure(.unsigned))
        XCTAssertEqual(BadgeFormat.precheck(make(issued: now + 60_000), expectedUserId: "u_maxi", currentAvatar: "🦊", nowMillis: now),
                       .failure(.fromFuture))
        XCTAssertEqual(BadgeFormat.precheck(make(issued: now - BadgeFormat.maxAgeMs - 1), expectedUserId: "u_maxi", currentAvatar: "🦊", nowMillis: now),
                       .failure(.expired))
        // Anti-Impersonation: anderes Bild → Haken weg
        XCTAssertEqual(BadgeFormat.precheck(make(), expectedUserId: "u_maxi", currentAvatar: "🐙", nowMillis: now),
                       .failure(.avatarMismatch))
    }

    func testEncodeDecodeRoundtrip() {
        let b = Badge(userId: "u1", role: .bot, avatarHash: "abc", issuedAt: 1_700_000_000_000, signature: [1, 2, 3, 4])
        let wire = BadgeFormat.encode(b)
        guard let back = BadgeFormat.decode(wire) else { return XCTFail("decode kaputt") }
        XCTAssertEqual(back.userId, b.userId)
        XCTAssertEqual(back.role, .bot)
        XCTAssertEqual(back.avatarHash, b.avatarHash)
        XCTAssertEqual(back.issuedAt, b.issuedAt)
        XCTAssertEqual(back.signature, b.signature)

        XCTAssertNil(BadgeFormat.decode(nil))
        XCTAssertNil(BadgeFormat.decode(""))
        XCTAssertNil(BadgeFormat.decode("nur|vier|felder|hier"))
        XCTAssertNil(BadgeFormat.decode("a|b|c|keinZahl|AAAA"))
    }
}

final class RecoveryTests: XCTestCase {

    func testGenerateAndVerify() {
        let (codes, plain) = RecoveryCodes.generate()
        XCTAssertEqual(codes.count, 10)
        XCTAssertEqual(plain.count, 10)
        XCTAssertEqual(Set(plain).count, 10, "alle Codes verschieden")

        for p in plain {
            // formatiert: ABCD-EFGH
            XCTAssertEqual(p.count, 9)
            XCTAssertEqual(p[p.index(p.startIndex, offsetBy: 4)], "-")
        }

        // Erster Code muss gefunden werden
        let idx = RecoveryCodes.verify(plain[0], codes: codes)
        XCTAssertNotNil(idx)

        // Falscher Code nicht
        XCTAssertNil(RecoveryCodes.verify("ZZZZ-ZZZZ", codes: codes))

        // Groß/klein und Leerzeichen egal
        XCTAssertNotNil(RecoveryCodes.verify(plain[0].lowercased(), codes: codes))
        XCTAssertNotNil(RecoveryCodes.verify(plain[0].replacingOccurrences(of: "-", with: " "), codes: codes))
    }

    func testUsedCodeIsRejected() {
        var (codes, plain) = RecoveryCodes.generate()
        let idx = RecoveryCodes.verify(plain[0], codes: codes)!
        codes[idx].used = true
        XCTAssertNil(RecoveryCodes.verify(plain[0], codes: codes), "verbraucht = tot")
        XCTAssertNotNil(RecoveryCodes.verify(plain[1], codes: codes), "andere gehen noch")
    }

    func testAlphabetHasNoConfusables() {
        let a = String(RecoveryCodes.alphabet)
        for bad in ["O", "0", "I", "1", "L"] {
            XCTAssertFalse(a.contains(bad), "\(bad) ist im Alphabet — Verwechslungsgefahr")
        }
        XCTAssertEqual(RecoveryCodes.alphabet.count, 31, "muss exakt Kotlin entsprechen")
        // gegen den Kotlin-Wert prüfen, nicht gegen eine Wunschzahl
        XCTAssertEqual(String(RecoveryCodes.alphabet), "ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    }

    func testEncodeDecode() {
        let (codes, _) = RecoveryCodes.generate()
        let back = RecoveryCodes.decode(RecoveryCodes.encode(codes))
        XCTAssertEqual(back.count, 10)
        XCTAssertEqual(back[3].index, codes[3].index)
        XCTAssertEqual(back[3].salt, codes[3].salt)
        XCTAssertEqual(back[3].hash, codes[3].hash)
        XCTAssertEqual(RecoveryCodes.decode(nil).count, 0)
        XCTAssertEqual(RecoveryCodes.decode("müll").count, 0)
    }
}

final class PinTests: XCTestCase {

    func testWeakPinsRejected() {
        for weak in ["1111", "0000", "1234", "4321", "9999", "111111", "5678"] {
            XCTAssertNotNil(PinLock.validate(weak), "\(weak) muss abgelehnt werden")
        }
        for ok in ["1947", "8306", "1a2b".replacingOccurrences(of: "a", with: "5").replacingOccurrences(of: "b", with: "8")] {
            XCTAssertNil(PinLock.validate(ok), "\(ok) muss durchgehen")
        }
    }

    func testLengthRules() {
        XCTAssertEqual(PinLock.validate("123"), "Mindestens 4 Ziffern")
        XCTAssertEqual(PinLock.validate("1234567890123"), "Höchstens 12 Ziffern")
        XCTAssertNil(PinLock.validate("1947"))
    }

    func testStoreAndVerify() {
        let rec = PinLock.store("8306")
        XCTAssertTrue(PinLock.verify("8306", against: rec))
        XCTAssertFalse(PinLock.verify("8307", against: rec))
        XCTAssertEqual(rec.salt.count, 16)
        XCTAssertEqual(rec.hash.count, 32)
    }

    func testEncodeDecode() {
        let rec = PinLock.store("1947")
        let back = PinLock.decode(PinLock.encode(rec))!
        XCTAssertTrue(PinLock.verify("1947", against: back))
        XCTAssertNil(PinLock.decode("kaputt"))
    }

    func testLockout() {
        let now: Int64 = 1_000_000
        XCTAssertEqual(PinLock.lockoutRemaining(failures: 0, lastFailureMs: now, nowMs: now), 0)
        XCTAssertEqual(PinLock.lockoutRemaining(failures: 2, lastFailureMs: now, nowMs: now), 0)
        XCTAssertEqual(PinLock.lockoutRemaining(failures: 3, lastFailureMs: now, nowMs: now), 30_000)
        XCTAssertEqual(PinLock.lockoutRemaining(failures: 3, lastFailureMs: now, nowMs: now + 30_000), 0, "abgelaufen")
        XCTAssertEqual(PinLock.lockoutRemaining(failures: 4, lastFailureMs: now, nowMs: now), 120_000)
        XCTAssertEqual(PinLock.lockoutRemaining(failures: 6, lastFailureMs: now, nowMs: now), 1_800_000)
        XCTAssertEqual(PinLock.lockoutText(30_000), "30 Sekunden")
        XCTAssertEqual(PinLock.lockoutText(600_000), "10 Minuten")
    }
}

final class ConstantTimeTests: XCTestCase {

    func testEquals() {
        XCTAssertTrue(ConstantTime.equals([1, 2, 3], [1, 2, 3]))
        XCTAssertFalse(ConstantTime.equals([1, 2, 3], [1, 2, 4]))
        XCTAssertFalse(ConstantTime.equals([1, 2, 3], [1, 2]))
        XCTAssertTrue(ConstantTime.equals("abc", "abc"))
        XCTAssertFalse(ConstantTime.equals("abc", "abd"))
    }
}
