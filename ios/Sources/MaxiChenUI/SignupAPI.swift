import Foundation
import MaxiChenKit

// =====================================================================
// 🌐 SignupAPI.swift — die fünf Anrufe an deinen Server
// ---------------------------------------------------------------------
// Reines Foundation (URLSession) — läuft ab iOS 7 und ist damit auch auf
// iOS 12 unproblematisch. Keine Combine-Abhängigkeit, keine async/await
// (das gibt es erst ab iOS 13).
//
// ⚠️ Der Code steht NIE in einer Antwort. Wer hier eine Methode sucht,
// die einen Code zurückgibt: die gibt es absichtlich nicht.
// =====================================================================

public enum SignupError: LocalizedError {
    case http(Int, String?)
    case encoding

    public var errorDescription: String? {
        switch self {
        case .http(_, let msg):
            return msg ?? "Server antwortet nicht richtig."
        case .encoding:
            return "Antwort konnte nicht gelesen werden."
        }
    }
}

public final class SignupAPI {

    private let base: URL
    private let session: URLSession

    public init(baseURL: String = "https://maxichen.de") {
        self.base = URL(string: baseURL)!
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        #if canImport(Darwin)
        cfg.waitsForConnectivity = false   // gibt es nur auf Apple-Plattformen
        #endif
        self.session = URLSession(configuration: cfg)
    }

    // MARK: ① Code per WhatsApp

    public func requestCode(phone: String, done: @escaping (Result<Void, Error>) -> Void) {
        post("/api/auth/request-code", ["phone": phone]) { result in
            switch result {
            case .success: done(.success(()))
            case .failure(let e): done(.failure(e))
            }
        }
    }

    // MARK: ② Code prüfen → signupToken

    public func verifyCode(phone: String, code: String, done: @escaping (Result<String, Error>) -> Void) {
        post("/api/auth/verify-code", ["phone": phone, "code": code]) { result in
            switch result {
            case .success(let json):
                guard let token = json["signupToken"] as? String, !token.isEmpty else {
                    return done(.failure(SignupError.http(500, "Server hat keinen Sitzungsschlüssel geschickt")))
                }
                done(.success(token))
            case .failure(let e): done(.failure(e))
            }
        }
    }

    // MARK: ③ Profil

    public func saveProfile(token: String, username: String, displayName: String, avatar: String,
                            done: @escaping (Result<Void, Error>) -> Void) {
        post("/api/auth/profile", [
            "signupToken": token,
            "username": username,
            "displayName": displayName,
            "avatar": avatar,
        ]) { result in
            switch result {
            case .success: done(.success(()))
            case .failure(let e): done(.failure(e))
            }
        }
    }

    // MARK: ④ Code per E-Mail

    public func requestEmailCode(token: String, email: String, done: @escaping (Result<Void, Error>) -> Void) {
        post("/api/auth/request-email-code", ["signupToken": token, "email": email]) { result in
            switch result {
            case .success: done(.success(()))
            case .failure(let e): done(.failure(e))
            }
        }
    }

    // MARK: ⑤ Fertig

    public func finish(token: String, code: String, done: @escaping (Result<String, Error>) -> Void) {
        post("/api/auth/verify-email", ["signupToken": token, "code": code]) { result in
            switch result {
            case .success(let json):
                guard let loginToken = json["token"] as? String, !loginToken.isEmpty else {
                    return done(.failure(SignupError.http(500, "Server hat keinen Login-Token geschickt")))
                }
                done(.success(loginToken))
            case .failure(let e): done(.failure(e))
            }
        }
    }

    // MARK: - Basis

    private func post(_ path: String, _ body: [String: Any],
                      done: @escaping (Result<[String: Any], Error>) -> Void) {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        guard let data = try? JSONSerialization.data(withJSONObject: body) else {
            return done(.failure(SignupError.encoding))
        }
        req.httpBody = data

        session.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                if let err = err { return done(.failure(err)) }
                guard let http = resp as? HTTPURLResponse else {
                    return done(.failure(SignupError.http(0, "Keine Antwort")))
                }
                let json = (data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]

                if (200...299).contains(http.statusCode) {
                    return done(.success(json))
                }
                // Der Server schickt immer eine deutsche Klartext-Meldung im Feld "error"
                let msg = json["error"] as? String
                done(.failure(SignupError.http(http.statusCode, msg)))
            }
        }.resume()
    }
}
