import SwiftUI
import MaxiChenKit

// =====================================================================
// 📱 OnboardingView.swift — 7 Schritte wie auf Android und WhatsApp
// ---------------------------------------------------------------------
// ⚠️ EHRLICH: Diese Datei liegt NICHT im Testziel des Packages, weil
// SwiftUI auf Linux nicht existiert. Sie ist hier geschrieben und
// geprüft, aber nicht kompiliert. Kompilieren kann sie nur Xcode.
// Der ganze Rechenkern (Telefonnummern, Codes, TOTP, Badges, PIN) liegt
// in MaxiChenKit — und DER ist kompiliert und getestet (33 Tests).
//
// iOS 12 ist das Minimum: kein `@State var x: some View`-Quatsch,
// keine Availability-Fallen ohne Prüfung. Wo iOS 13+ nötig wäre,
// steht ein #available-Block drumherum.
// =====================================================================

// MARK: - Design-Tokens (dieselben wie Android Light.kt)

public enum MaxiColor {
    public static let bg = Color(red: 1.00, green: 0.96, blue: 0.97)      // #FFF5F7
    public static let card = Color.white
    public static let ink = Color(red: 0.17, green: 0.10, blue: 0.18)     // #2B1A2E
    public static let soft = Color(red: 0.55, green: 0.48, blue: 0.58)    // #8B7A93
    public static let pink = Color(red: 1.00, green: 0.37, blue: 0.66)    // #FF5FA8
    public static let pinkSoft = Color(red: 1.00, green: 0.89, blue: 0.94) // #FFE3F0
    public static let lila = Color(red: 0.66, green: 0.48, blue: 1.00)    // #A97BFF
    public static let line = Color(red: 0.94, green: 0.89, blue: 0.92)    // #F0E3EA
    public static let green = Color(red: 0.23, green: 0.75, blue: 0.48)   // #3BBE7A
    public static let danger = Color(red: 0.91, green: 0.33, blue: 0.43)  // #E8546E
    public static let gold = Color(red: 0.91, green: 0.66, blue: 0.23)    // #E9A93B
    public static let verified = Color(red: 0.11, green: 0.61, blue: 0.94) // #1D9BF0

    public static var pinkGradient: LinearGradient {
        LinearGradient(gradient: Gradient(colors: [
            Color(red: 1.00, green: 0.49, blue: 0.73),
            Color(red: 1.00, green: 0.37, blue: 0.66),
        ]), startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

// MARK: - Der Flow

public struct OnboardingView: View {

    @State private var step: Int = 0
    @State private var country: Country = Country.all[0]
    @State private var number: String = ""
    @State private var code: String = ""
    @State private var mailCode: String = ""
    @State private var signupToken: String = ""
    @State private var username: String = ""
    @State private var displayName: String = ""
    @State private var avatar: String = "🦊"
    @State private var email: String = ""
    @State private var error: String = ""
    @State private var info: String = ""
    @State private var busy: Bool = false

    private let api: SignupAPI
    private let onDone: (String) -> Void
    private let onDemo: () -> Void

    public init(api: SignupAPI, onDone: @escaping (String) -> Void, onDemo: @escaping () -> Void = {}) {
        self.api = api
        self.onDone = onDone
        self.onDemo = onDemo
    }

    private var fullNumber: String {
        country.dial + number.filter { $0.isNumber }
    }

    public var body: some View {
        ZStack {
            MaxiColor.bg.edgesIgnoringSafeArea(.all)
            ScrollView {
                VStack(spacing: 0) {
                    if step >= 1 && step <= 6 { progressDots }
                    content.padding(.horizontal, 24)
                }
            }
        }
    }

    // MARK: Fortschritt

    private var progressDots: some View {
        HStack(spacing: 5) {
            ForEach(0..<6, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i <= (step - 1) ? MaxiColor.pink : MaxiColor.line)
                    .frame(height: 3)
            }
        }
        .padding(.horizontal, 24).padding(.top, 22)
    }

    // MARK: Schritte

    @ViewBuilder
    private var content: some View {
        switch step {
        case 0: hero
        case 1: ageNotice
        case 2: phoneEntry
        case 3: phoneCode
        case 4: profile
        case 5: emailEntry
        case 6: emailCode
        default: done
        }
    }

    private var hero: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 90)
            RoundedRectangle(cornerRadius: 32)
                .fill(MaxiColor.pinkGradient)
                .frame(width: 104, height: 104)
                .overlay(Text("💗").font(.system(size: 46)))
            Spacer().frame(height: 26)
            Text("MaxiChen")
                .font(.system(size: 32, weight: .heavy))
                .foregroundColor(MaxiColor.ink)
            Spacer().frame(height: 8)
            Text("Nachrichten, die bleiben,\nwo sie hingehören.")
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundColor(MaxiColor.soft)
            Spacer().frame(height: 44)
            primaryButton("Weiter", enabled: true) { step = 1 }
            Button(action: onDemo) {
                Text("👀 Ohne Konto reinschauen")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(MaxiColor.soft)
                    .padding(.vertical, 14)
            }
            Spacer().frame(height: 18)
            Text("Pink · Midnight · Post-Quantum")
                .font(.system(size: 9)).foregroundColor(MaxiColor.line)
        }
    }

    private var ageNotice: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 64)
            Text("🔞").font(.system(size: 44))
            Spacer().frame(height: 18)
            Text("Du musst mindestens 16 Jahre alt sein")
                .font(.system(size: 24, weight: .heavy))
                .foregroundColor(MaxiColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 14)
            Text("MaxiChen ist ab 16. Wenn du jünger bist, frag deine Eltern — und komm wieder, wenn du 16 bist. Wir speichern dein Geburtsdatum nicht, weil wir es nicht brauchen.")
                .font(.system(size: 12.5))
                .foregroundColor(MaxiColor.soft)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 14)
            Text("Mit „Zustimmen\" bestätigst du außerdem, dass du unsere Regeln liest: keine Beleidigungen, keine Weitergabe von Codes, kein Spam.")
                .font(.system(size: 10.5))
                .foregroundColor(MaxiColor.ink.opacity(0.75))
                .padding(13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(MaxiColor.pinkSoft.opacity(0.6))
                .cornerRadius(14)
            Spacer().frame(height: 30)
            primaryButton("Ich bin 16 oder älter", enabled: true) { step = 2 }
            ghostButton("Zurück") { step = 0 }
        }
    }

    private var phoneEntry: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 46)
            title("Deine Telefonnummer")
            Text("MaxiChen schickt dir den Code per WhatsApp. Wir zeigen deine Nummer niemandem an, außer du willst es.")
                .font(.system(size: 11.5)).foregroundColor(MaxiColor.soft)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            Spacer().frame(height: 22)

            // Länderauswahl — bewusst als Menü, nicht als 200-Zeilen-Liste
            Menu {
                ForEach(Country.all, id: \.dial) { c in
                    Button("\(c.flag) \(c.name)  \(c.dial)") { country = c }
                }
            } label: {
                HStack {
                    Text(country.flag).font(.system(size: 19))
                    Text(country.name).font(.system(size: 13, weight: .semibold)).foregroundColor(MaxiColor.ink)
                    Spacer()
                    Text(country.dial).font(.system(size: 13, weight: .bold)).foregroundColor(MaxiColor.soft)
                    Text("▾").font(.system(size: 10)).foregroundColor(MaxiColor.soft)
                }
                .padding(.horizontal, 15).padding(.vertical, 14)
                .background(MaxiColor.card)
                .cornerRadius(15)
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(MaxiColor.line, lineWidth: 1))
            }

            Spacer().frame(height: 10)

            HStack(spacing: 8) {
                Text(country.dial)
                    .font(.system(size: 14, weight: .bold)).foregroundColor(MaxiColor.ink)
                    .padding(.horizontal, 14).padding(.vertical, 15)
                    .background(MaxiColor.card).cornerRadius(15)
                    .overlay(RoundedRectangle(cornerRadius: 15).stroke(MaxiColor.line, lineWidth: 1))

                TextField("151 55894714", text: Binding(
                    get: { number },
                    set: { number = String($0.filter { $0.isNumber }.prefix(14)); error = "" }
                ))
                .keyboardType(.phonePad)
                .font(.system(size: 14, weight: .semibold))
                .padding(.horizontal, 14).padding(.vertical, 15)
                .background(MaxiColor.card).cornerRadius(15)
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(MaxiColor.line, lineWidth: 1))
            }

            if !error.isEmpty { errorBox.padding(.top, 10) }

            Text("Wir verschicken höchstens 3 Codes in 15 Minuten. Wenn dir das zu viel ist: gut so.")
                .font(.system(size: 9.5)).foregroundColor(MaxiColor.soft)
                .padding(.top, 12)

            Spacer().frame(height: 30)
            primaryButton("Code per WhatsApp", enabled: number.count >= 6) {
                busy = true; error = ""
                api.requestCode(phone: fullNumber) { result in
                    busy = false
                    switch result {
                    case .success: code = ""; step = 3
                    case .failure(let e): error = e.localizedDescription
                    }
                }
            }
            ghostButton("Zurück") { step = 1 }
        }
    }

    private var phoneCode: some View {
        codeStep(
            title: "Code aus WhatsApp",
            subtitle: "Wir haben \(fullNumber) einen 6-stelligen Code geschickt. Schau in WhatsApp.",
            value: $code,
            onBack: { step = 2 },
            onResend: {
                busy = true; error = ""; info = ""
                api.requestCode(phone: fullNumber) { r in
                    busy = false
                    if case .success = r { code = ""; info = "Neuer Code unterwegs ✨" }
                    else if case .failure(let e) = r { error = e.localizedDescription }
                }
            },
            onConfirm: {
                busy = true; error = ""
                api.verifyCode(phone: fullNumber, code: code) { r in
                    busy = false
                    switch r {
                    case .success(let t): signupToken = t; step = 4
                    case .failure(let e): error = e.localizedDescription; code = ""
                    }
                }
            }
        )
    }

    private var profile: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 46)
            title("Dein Profil")
            Text("So sehen dich die anderen.")
                .font(.system(size: 11.5)).foregroundColor(MaxiColor.soft).padding(.top, 6)

            Spacer().frame(height: 22)
            HStack { Spacer()
                Circle().fill(MaxiColor.pinkGradient).frame(width: 104, height: 104)
                    .overlay(Text(avatar).font(.system(size: 44)))
                    .overlay(Circle().stroke(Color.white, lineWidth: 3))
                Spacer()
            }

            Spacer().frame(height: 16)
            let avatars = ["🦊", "💗", "🌸", "🐱", "🌙", "🎧", "🍓", "👾", "🦋", "☁️"]
            HStack(spacing: 7) {
                ForEach(avatars.prefix(5), id: \.self) { a in avatarDot(a) }
            }
            Spacer().frame(height: 7)
            HStack(spacing: 7) {
                ForEach(Array(avatars.dropFirst(5)), id: \.self) { a in avatarDot(a) }
            }

            Spacer().frame(height: 22)
            field("Anzeigename", text: Binding(
                get: { displayName },
                set: { displayName = String($0.prefix(30)); error = "" }
            ), hint: "Maxi")
            Spacer().frame(height: 10)
            field("Kontoname", text: Binding(
                get: { username },
                set: { username = Onboard.sanitizeUsername($0); error = "" }
            ), hint: "maxi_m")
            Text("a–z, 0–9 und _ · 3–20 Zeichen · später änderbar")
                .font(.system(size: 9.5)).foregroundColor(MaxiColor.soft).padding(.top, 6)

            if !error.isEmpty { errorBox.padding(.top, 10) }

            Spacer().frame(height: 26)
            primaryButton("Weiter", enabled: Onboard.usernameProblem(username) == nil
                          && Onboard.displayNameProblem(displayName) == nil) {
                busy = true; error = ""
                api.saveProfile(token: signupToken, username: username,
                                displayName: displayName, avatar: avatar) { r in
                    busy = false
                    switch r {
                    case .success: step = 5
                    case .failure(let e): error = e.localizedDescription
                    }
                }
            }
        }
    }

    private var emailEntry: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 46)
            title("E-Mail zum Wiederherstellen")
            Text("Handy weg, App gelöscht, Akku kaputt — passiert. Mit dieser Adresse kommst du wieder rein. Ohne sie ist dein Konto weg, wenn dein Handy weg ist.")
                .font(.system(size: 11.5)).foregroundColor(MaxiColor.soft)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 8)

            Spacer().frame(height: 22)
            field("E-Mail", text: Binding(
                get: { email },
                set: { email = $0.trimmingCharacters(in: .whitespaces); error = "" }
            ), hint: "name@beispiel.de", keyboard: .emailAddress)

            if !error.isEmpty { errorBox.padding(.top, 10) }

            Text("Wir schicken dir einen 6-stelligen Code von \(Onboard.mailFrom). MaxiChen fragt nie nach deinem Passwort und nie nach diesem Code.")
                .font(.system(size: 10)).foregroundColor(MaxiColor.ink.opacity(0.75))
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(MaxiColor.pinkSoft.opacity(0.5)).cornerRadius(13)
                .padding(.top, 12)

            Spacer().frame(height: 26)
            primaryButton("Code per E-Mail", enabled: Onboard.isEmail(email)) {
                busy = true; error = ""
                api.requestEmailCode(token: signupToken, email: email) { r in
                    busy = false
                    switch r {
                    case .success: mailCode = ""; step = 6
                    case .failure(let e): error = e.localizedDescription
                    }
                }
            }
            ghostButton("Zurück") { step = 4 }
        }
    }

    private var emailCode: some View {
        codeStep(
            title: "Code aus der E-Mail",
            subtitle: "Wir haben an \(email) geschrieben. Betreff: „maxichen verifizierungscode\".",
            value: $mailCode,
            onBack: { step = 5 },
            onResend: {
                busy = true; error = ""; info = ""
                api.requestEmailCode(token: signupToken, email: email) { r in
                    busy = false
                    if case .success = r { mailCode = ""; info = "Neue Mail unterwegs 📬" }
                    else if case .failure(let e) = r { error = e.localizedDescription }
                }
            },
            onConfirm: {
                busy = true; error = ""
                api.finish(token: signupToken, code: mailCode) { r in
                    busy = false
                    switch r {
                    case .success(let t): step = 7; onDone(t)
                    case .failure(let e): error = e.localizedDescription; mailCode = ""
                    }
                }
            }
        )
    }

    private var done: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 120)
            Circle().fill(MaxiColor.pinkGradient).frame(width: 96, height: 96)
                .overlay(Text(avatar).font(.system(size: 42)))
                .overlay(Circle().stroke(Color.white, lineWidth: 3))
            Spacer().frame(height: 22)
            Text("Willkommen, \(displayName.isEmpty ? "du" : displayName) 💗")
                .font(.system(size: 24, weight: .heavy)).foregroundColor(MaxiColor.ink)
            Spacer().frame(height: 8)
            Text("Dein Konto ist bestätigt. Nummer ✓  E-Mail ✓")
                .font(.system(size: 12)).foregroundColor(MaxiColor.green)
        }
    }

    // MARK: Bausteine

    private func codeStep(title t: String, subtitle: String, value: Binding<String>,
                          onBack: @escaping () -> Void, onResend: @escaping () -> Void,
                          onConfirm: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 46)
            title(t)
            Text(subtitle)
                .font(.system(size: 11.5)).foregroundColor(MaxiColor.soft)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 6)

            Spacer().frame(height: 26)

            // Sechs Kästchen + EIN unsichtbares Feld — so macht es WhatsApp auch
            ZStack {
                HStack(spacing: 8) {
                    ForEach(0..<6, id: \.self) { i in
                        let s = value.wrappedValue
                        let filled = i < s.count
                        let active = i == s.count
                        RoundedRectangle(cornerRadius: 13)
                            .fill(MaxiColor.card)
                            .frame(height: 56)
                            .overlay(RoundedRectangle(cornerRadius: 13)
                                .stroke(active ? MaxiColor.pink : (filled ? MaxiColor.pink.opacity(0.45) : MaxiColor.line),
                                        lineWidth: active ? 2 : 1))
                            .overlay(
                                Text(filled ? String(Array(s)[i]) : "")
                                    .font(.system(size: 22, weight: .heavy))
                                    .foregroundColor(MaxiColor.ink)
                            )
                    }
                }
                TextField("", text: Binding(
                    get: { value.wrappedValue },
                    set: { raw in
                        value.wrappedValue = Onboard.sanitizeCode(raw)
                        error = ""
                        if Onboard.isCompleteCode(raw) {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) { onConfirm() }
                        }
                    }
                ))
                .keyboardType(.numberPad)
                .frame(height: 56)
                .opacity(0.01)
            }

            if !error.isEmpty { errorBox.padding(.top, 12) }
            if !info.isEmpty { infoBox.padding(.top, 12) }

            Spacer().frame(height: 26)
            primaryButton("Bestätigen", enabled: Onboard.isCompleteCode(value.wrappedValue), action: onConfirm)
            HStack {
                Button(action: onBack) {
                    Text("Zurück").font(.system(size: 11.5)).foregroundColor(MaxiColor.soft)
                        .padding(10)
                }
                Spacer()
                Button(action: { if !busy { onResend() } }) {
                    Text("Neu schicken").font(.system(size: 11.5, weight: .semibold))
                        .foregroundColor(MaxiColor.pink).padding(10)
                }
            }
        }
    }

    private func title(_ t: String) -> some View {
        Text(t).font(.system(size: 24, weight: .heavy))
            .foregroundColor(MaxiColor.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func avatarDot(_ a: String) -> some View {
        Button(action: { avatar = a }) {
            Circle()
                .fill(a == avatar ? MaxiColor.pinkSoft : MaxiColor.card)
                .frame(width: 46, height: 46)
                .overlay(Circle().stroke(a == avatar ? MaxiColor.pink : MaxiColor.line,
                                         lineWidth: a == avatar ? 2 : 1))
                .overlay(Text(a).font(.system(size: 20)))
        }
    }

    private func field(_ label: String, text: Binding<String>, hint: String,
                       keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.system(size: 10, weight: .semibold)).foregroundColor(MaxiColor.soft)
            TextField(hint, text: text)
                .keyboardType(keyboard)
                .autocapitalization(.none)
                .font(.system(size: 14, weight: .semibold))
                .padding(.horizontal, 15).padding(.vertical, 15)
                .background(MaxiColor.card).cornerRadius(15)
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(MaxiColor.line, lineWidth: 1))
        }
    }

    private func primaryButton(_ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: { if enabled && !busy { action() } }) {
            Text(busy ? "…" : label)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(enabled ? .white : MaxiColor.soft)
                .frame(maxWidth: .infinity).frame(height: 52)
                .background(enabled ? AnyView(MaxiColor.pinkGradient) : AnyView(MaxiColor.line))
                .cornerRadius(17)
        }
        .disabled(!enabled || busy)
    }

    private func ghostButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.system(size: 12, weight: .semibold))
                .foregroundColor(MaxiColor.soft)
                .frame(maxWidth: .infinity).frame(height: 44)
        }
    }

    private var errorBox: some View {
        Text(error).font(.system(size: 10.5)).foregroundColor(MaxiColor.danger)
            .padding(11).frame(maxWidth: .infinity, alignment: .leading)
            .background(MaxiColor.danger.opacity(0.10)).cornerRadius(12)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(MaxiColor.danger.opacity(0.35), lineWidth: 1))
    }

    private var infoBox: some View {
        Text(info).font(.system(size: 10.5)).foregroundColor(MaxiColor.green)
            .padding(11).frame(maxWidth: .infinity, alignment: .leading)
            .background(MaxiColor.green.opacity(0.10)).cornerRadius(12)
    }
}

// MARK: - Länder

public struct Country {
    public let flag: String
    public let dial: String
    public let name: String

    public static let all: [Country] = [
        Country(flag: "🇩🇪", dial: "+49", name: "Deutschland"),
        Country(flag: "🇦🇹", dial: "+43", name: "Österreich"),
        Country(flag: "🇨🇭", dial: "+41", name: "Schweiz"),
        Country(flag: "🇹🇷", dial: "+90", name: "Türkei"),
        Country(flag: "🇵🇱", dial: "+48", name: "Polen"),
        Country(flag: "🇳🇱", dial: "+31", name: "Niederlande"),
        Country(flag: "🇫🇷", dial: "+33", name: "Frankreich"),
        Country(flag: "🇮🇹", dial: "+39", name: "Italien"),
        Country(flag: "🇬🇧", dial: "+44", name: "UK"),
        Country(flag: "🇺🇸", dial: "+1", name: "USA/Kanada"),
        Country(flag: "🇷🇺", dial: "+7", name: "Russland"),
        Country(flag: "🇺🇦", dial: "+380", name: "Ukraine"),
    ]
}
