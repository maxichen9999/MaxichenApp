import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// =====================================================================
// Integrationstest: der ECHTE iOS-Client (SignupAPI) gegen den ECHTEN
// Server. Kein Nachbau, keine Attrappe — dieselbe Datei, die in der App
// landet. Läuft hier auf Linux, weil URLSession dort genauso funktioniert.
// =====================================================================

let root = "/home/user/lovechat"
var pass = 0, fail = 0
func ok(_ name: String, _ cond: Bool, _ extra: String = "") {
    if cond { pass += 1; print("✅ \(name)") }
    else { fail += 1; print("❌ \(name) \(extra)") }
}

func lastLine(_ path: String) -> String? {
    guard let s = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
    return s.split(separator: "\n").last.map(String.init)
}

func codeFrom(_ path: String, pattern: String) -> String? {
    guard let line = lastLine(path) else { return nil }
    let re = try! NSRegularExpression(pattern: pattern)
    let ns = line as NSString
    guard let m = re.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)),
          m.numberOfRanges > 1 else { return nil }
    return ns.substring(with: m.range(at: 1))
}

let api = SignupAPI(baseURL: "http://127.0.0.1:3000")
let phone = "+49 177 " + String(Int(Date().timeIntervalSince1970) % 100000000).prefix(8)
var finished = false
func done() { finished = true }

func step1() {
    api.requestCode(phone: phone) { r in
        switch r {
        case .success:
            ok("Swift → Server: Code angefordert", true)
            let wa = codeFrom(root + "/data/wa-outbox.jsonl", pattern: "\\*(\\d{6})\\*")
            ok("Code kam per WhatsApp an", wa != nil)
            guard let wa = wa else { done(); return }
            step2(wa)
        case .failure(let e):
            ok("Code angefordert", false, e.localizedDescription); done()
        }
    }
}

func step2(_ waCode: String) {
    // absichtlich falsch: der Client muss den Serverfehler sauber durchreichen
    api.verifyCode(phone: phone, code: "000000") { r in
        if case .failure(let e) = r {
            ok("falscher Code → Fehler kommt beim Client an", !e.localizedDescription.isEmpty, e.localizedDescription)
        } else { ok("falscher Code → Fehler", false) }

        api.verifyCode(phone: phone, code: waCode) { r in
            switch r {
            case .success(let token):
                ok("richtiger Code → signupToken", token.count > 20)
                step3(token)
            case .failure(let e):
                ok("richtiger Code", false, e.localizedDescription); done()
            }
        }
    }
}

func step3(_ token: String) {
    let uname = "ios" + String(Int(Date().timeIntervalSince1970) % 1000000)
    api.saveProfile(token: token, username: uname, displayName: "iOS Tester", avatar: "🦊") { r in
        switch r {
        case .success: ok("Profil gespeichert (Kontoname, Name, Bild)", true)
        case .failure(let e): ok("Profil", false, e.localizedDescription); done(); return
        }
        let mail = "ios\(Int(Date().timeIntervalSince1970))@example.com"
        api.requestEmailCode(token: token, email: mail) { r2 in
            switch r2 {
            case .success: ok("E-Mail-Code angefordert", true)
            case .failure(let e): ok("E-Mail-Code", false, e.localizedDescription); done(); return
            }
            let mc = codeFrom(root + "/data/mail-outbox.jsonl", pattern: "MaxiChen Code: (\\d{6})")
            ok("Mail-Code kam per E-Mail an", mc != nil)
            guard let mc = mc else { done(); return }

            api.finish(token: token, code: mc) { r3 in
                switch r3 {
                case .success(let login):
                    ok("Konto erstellt → Login-Token", login.count > 20)
                    // und jetzt beweisen, dass der Token funktioniert
                    var req = URLRequest(url: URL(string: "http://127.0.0.1:3000/api/me")!)
                    req.setValue("Bearer " + login, forHTTPHeaderField: "Authorization")
                    URLSession.shared.dataTask(with: req) { d, resp, _ in
                        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                        let body = d.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
                        let uname2 = (body?["user"] as? [String: Any])?["username"] as? String
                        ok("Login-Token funktioniert (GET /api/me)", code == 200, "HTTP \(code)")
                        ok("Konto hat den richtigen Namen", uname2?.hasPrefix("ios") == true, uname2 ?? "-")
                        done()
                    }.resume()
                case .failure(let e):
                    ok("Konto erstellt", false, e.localizedDescription); done()
                }
            }
        }
    }
}

step1()
// Der Client ruft seine Callbacks auf der Main-Queue auf (richtig für SwiftUI).
// Also MUSS hier der Main-RunLoop laufen — ein Semaphor würde ihn blockieren.
let deadline = Date().addingTimeInterval(40)
while !finished && Date() < deadline {
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
}

print("\n" + String(repeating: "=", count: 58))
print("🏁 \(pass)/\(pass + fail) bestanden")
exit(fail == 0 ? 0 : 1)
