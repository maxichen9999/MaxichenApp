import XCTest
@testable import MaxiChenKit

// =====================================================================
// 🛡️ Tests für ML-KEM-768 gegen eine FREMD Implementierung
// ---------------------------------------------------------------------
// Die Erwartungswerte in `vector0/1/2` stammen aus
// `lovechat-v2/tests-vectors/mlkem768.json`. Erzeugt wurden sie mit
// **kyber-py** — einer reinen Python-Implementierung von FIPS 203 von
// einem anderen Autor. Nicht von mir, nicht von Kotlin abgeleitet.
//
// Verglichen werden SHA-256-Hashes von ek/dk/ct/ss. Stimmen die, sind
// die Bytes identisch — und damit auch Kotlin, Swift und Node.
// =====================================================================

final class KeccakTests: XCTestCase {

    func testSha3OfficialVectors() {
        XCTAssertEqual(Hex.encode(Keccak.sha3_256([])),
                       "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a")
        XCTAssertEqual(Hex.encode(Keccak.sha3_256(Array("abc".utf8))),
                       "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532")
        XCTAssertEqual(Hex.encode(Keccak.sha3_512(Array("abc".utf8))),
                       "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e"
                     + "10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0")
    }

    func testShakeOfficialVectors() {
        XCTAssertEqual(Hex.encode(Keccak.shake128([], outLen: 32)),
                       "7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26")
        XCTAssertEqual(Hex.encode(Keccak.shake256([], outLen: 64)),
                       "46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762f"
                     + "d75dc4ddd8c0f200cb05019d67b592f6fc821c49479ab48640292eacb3b7c4be")
    }

    /// Der Streaming-XOF muss dasselbe liefern wie ein einzelner Aufruf.
    func testXofMatchesBulk() {
        let seed = Array("kyber-xof".utf8)
        let bulk = Keccak.shake128(seed, outLen: 900)
        let xof = Keccak.xofShake128(seed)
        var streamed = [UInt8]()
        while streamed.count < 900 {
            streamed.append(contentsOf: xof.read(min(37, 900 - streamed.count)))
        }
        XCTAssertEqual(bulk, streamed)
    }
}

final class MlKemTests: XCTestCase {

    // MARK: Referenzvektoren (aus tests-vectors/mlkem768.json, kyber-py)

    struct Vec {
        let seed: String
        let m: String
        let ekSha: String
        let dkSha: String
        let ctSha: String
        let ssSha: String
    }

    let vectors: [Vec] = [
        Vec(seed: "000102030405060725262728292a2b2c4a4b4c4d4e4f50516f707172737475769495969798999a9bb9babbbcbdbebfc0dedfe0e1e2e3e4e5030405060708090a", m: "050c131a21282f3660676e757c838a91bbc2c9d0d7dee5ec161d242b32394047",
            ekSha: "bd5348f67ace9c3eaeaef953e145bf9b0c509d13109756d233663c7313b730b2", dkSha: "bd6317703f5d0c2adfa056ced133254408a40755165f78f5b47741cd4365dc09",
            ctSha: "a77808db775cbdb4c42f83d4476e89f35d1b1279286f44a2f7e159a6d13e1d34", ssSha: "9ad58db0547d1ebbbf19367d7a11201459130712e06a6c3f0a5e0ded4794e634"),
        Vec(seed: "0b0c0d0e0f101112303132333435363755565758595a5b5c7a7b7c7d7e7f80819fa0a1a2a3a4a5a6c4c5c6c7c8c9cacbe9eaebecedeeeff00e0f101112131415", m: "080f161d242b3239636a71787f868d94bec5ccd3dae1e8ef1920272e353c434a",
            ekSha: "67be1a1a544419ab73f6a83f6a35e6f716e2284bd8e24f9de84109b6e4855adb", dkSha: "16a76e0ec68a398117a1485d00cf5f2b395f8f21b3df31201f79d271ca650838",
            ctSha: "2b1c8decd10a78db64308163b251bf73f9853345e77494464c0c0aa2ada19cb4", ssSha: "444979c4b007823c623f3969202d254e6eb1ba1eb9c08d665f264f564752c292"),
        Vec(seed: "161718191a1b1c1d3b3c3d3e3f404142606162636465666785868788898a8b8caaabacadaeafb0b1cfd0d1d2d3d4d5d6f4f5f6f7f8f9fafb191a1b1c1d1e1f20", m: "0b121920272e353c666d747b82899097c1c8cfd6dde4ebf21c232a31383f464d",
            ekSha: "e3d02ad154dba4c109d6656d097d9a85b71b57791f21231ae218d24c3776cf40", dkSha: "41476f1012789a09ade4dac71910eb915ed9fd3d7fba16b4d99580bf84699760",
            ctSha: "bc5e30b2e8cb6f6735432894cb13fbd9c3e56fd29e494bdde8975182c0bbf576", ssSha: "5578cbe1630662a39e64b3a77a00125cf67f2145f857434a5b5e5b61a1888e9a"),
    ]

    private func b(_ hex: String) -> [UInt8] { Hex.decode(hex)! }
    private func sha(_ bytes: [UInt8]) -> String { Hex.encode(SHA256.hash(bytes)) }

    /// Der eigentliche Beweis: Byte für Byte gegen eine fremde Implementierung.
    func testReferenceVectors() throws {
        for (i, v) in vectors.enumerated() {
            let seed = b(v.seed)
            XCTAssertEqual(seed.count, 64, "Seed \(i)")

            let kp = try MlKem768.keygen(d: Array(seed[0..<32]), z: Array(seed[32..<64]))
            XCTAssertEqual(kp.publicKey.count, MlKem768.ekBytes, "ek-Länge \(i)")
            XCTAssertEqual(kp.secretKey.count, MlKem768.dkBytes, "dk-Länge \(i)")
            XCTAssertEqual(sha(kp.publicKey), v.ekSha, "ek-Hash Vektor \(i)")
            XCTAssertEqual(sha(kp.secretKey), v.dkSha, "dk-Hash Vektor \(i)")

            let res = try MlKem768.encaps(ek: kp.publicKey, m: b(v.m))
            XCTAssertEqual(res.ciphertext.count, MlKem768.ctBytes, "ct-Länge \(i)")
            XCTAssertEqual(res.sharedSecret.count, MlKem768.ssBytes, "ss-Länge \(i)")
            XCTAssertEqual(sha(res.ciphertext), v.ctSha, "ct-Hash Vektor \(i)")
            XCTAssertEqual(sha(res.sharedSecret), v.ssSha, "ss-Hash Vektor \(i)")

            // Decaps muss dasselbe Geheimnis liefern
            let ss = try MlKem768.decaps(dk: kp.secretKey, ct: res.ciphertext)
            XCTAssertEqual(ss, res.sharedSecret, "Decaps ≠ Encaps bei Vektor \(i)")
        }
    }

    /// Bei jedem Bit-Flip muss ein ANDERES Geheimnis rauskommen —
    /// und zwar ohne Absturz (implizite Ablehnung nach FIPS 203).
    func testTamperedCiphertextIsRejected() throws {
        let v = vectors[0]
        let seed = b(v.seed)
        let kp = try MlKem768.keygen(d: Array(seed[0..<32]), z: Array(seed[32..<64]))
        let res = try MlKem768.encaps(ek: kp.publicKey, m: b(v.m))

        for pos in [0, 17, 400, 1087] {
            var ct = res.ciphertext
            ct[pos] ^= 0x01
            let ss = try MlKem768.decaps(dk: kp.secretKey, ct: ct)
            XCTAssertNotEqual(ss, res.sharedSecret, "Bit-Flip bei Byte \(pos) wurde nicht erkannt")
            XCTAssertEqual(ss.count, 32, "Fallback-Schlüssel muss 32 Byte haben")
        }
    }

    /// Zwei Schlüsselpaare dürfen nicht dasselbe Geheimnis erzeugen.
    func testDifferentKeysDifferentSecrets() throws {
        let a = try MlKem768.keygenRandom()
        let b2 = try MlKem768.keygenRandom()
        let ra = try MlKem768.encapsRandom(ek: a.publicKey)
        let rb = try MlKem768.encapsRandom(ek: b2.publicKey)
        XCTAssertNotEqual(ra.sharedSecret, rb.sharedSecret)

        // und die Gegenprobe: falscher dk → falsches Ergebnis, kein Absturz
        let wrong = try MlKem768.decaps(dk: b2.secretKey, ct: ra.ciphertext)
        XCTAssertNotEqual(wrong, ra.sharedSecret)
    }

    func testWrongSizesThrow() {
        XCTAssertThrowsError(try MlKem768.keygen(d: [0, 1, 2], z: [UInt8](repeating: 0, count: 32)))
        XCTAssertThrowsError(try MlKem768.encaps(ek: [UInt8](repeating: 0, count: 100), m: [UInt8](repeating: 0, count: 32)))
        XCTAssertThrowsError(try MlKem768.decaps(dk: [UInt8](repeating: 0, count: 100), ct: [UInt8](repeating: 0, count: 1088)))
    }

    /// Die Parameter müssen zu FIPS 203 passen — ein falscher k-Wert
    /// würde sonst stillschweigend andere Größen produzieren.
    func testParameterSizes() throws {
        XCTAssertEqual(MlKem768.ekBytes, 384 * 3 + 32)       // 1184
        XCTAssertEqual(MlKem768.ctBytes, 10 * 3 * 32 + 4 * 32)  // du*k*32 + dv*32 = 1088
        XCTAssertEqual(MlKem768.dkBytes, 768 * 3 + 96)       // 2400
        let kp = try MlKem768.keygenRandom()
        XCTAssertEqual(kp.publicKey.count, 1184)
        XCTAssertEqual(kp.secretKey.count, 2400)
    }
}
