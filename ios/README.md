# 🍏 MaxiChen für iOS — was hier wirklich drin ist

**Stand:** 25.10.2026 · Paket `MaxiChenKit` · Ziel iOS 12.0+ · **V4.15 mit ML-KEM-768**

---

## Was geprüft ist (und wie)

| Teil | Status | Wie |
|---|---|---|
| `MaxiChenKit` (Crypto, TOTP, Onboarding-Logik, Badges, Recovery, PIN) | ✅ **41 Tests, 0 Fehler** | `swift test -c release` auf Linux mit Swift 6.0.3 |
| **ML-KEM-768 + Keccak/SHA3** (FIPS 203 / FIPS 202) | ✅ **byte-identisch zu kyber-py** | 3 Referenzvektoren: `ek`/`dk`/`ct`/`ss` = exakt die Hashes aus `tests-vectors/mlkem768.json` |
| `SignupAPI.swift` (die 5 Server-Aufrufe) | ✅ **kompiliert** + **10/10 Integrationstests** | echter Server, echter Client, kein Mock |
| Zahlen identisch zu Android + Node | ✅ **17 Werte** | `Integration/cross-vectors.js` gegen die Swift-Ausgabe |
| `OnboardingView.swift` (SwiftUI) | ❌ **nicht kompiliert** | SwiftUI gibt es nur in Apples SDK |

Das ist der ehrliche Stand. Alles, was hier rechnet, ist bewiesen.
Was nur Layout ist, kann ich nicht beweisen — dafür braucht es Xcode.

---

## Schnellstart auf Linux (ohne Mac)

```bash
cd maxichen-ios
export PATH=/opt/swift/usr/bin:$PATH    # oder Swift normal installiert

swift build                              # kompiliert das Paket
swift test -c release                    # 41 Tests
bash Integration/run-integration.sh       # 10 Tests gegen den echten Server
```

Der Integrationstest braucht laufende Server:

```bash
cd /home/user/lovechat
INTERNAL_TOKEN=testtoken123456789012345678 WA_SIMULATE=1  node pair.js  &
INTERNAL_TOKEN=testtoken123456789012345678 MAIL_SIMULATE=1 node server.js &
```

---

## Auf dem Mac (Xcode)

1. **Neues Projekt** → iOS App → Interface: SwiftUI → Language: Swift
   - Deployment Target: **iOS 12.0**
   - Bundle Identifier: `de.maxichen.app`
2. **Paket hinzufügen:** File → Add Package Dependencies → Add Local… →
   Ordner `maxichen-ios` wählen → Produkt `MaxiChenKit` zur App hinzufügen.
3. **Zwei Dateien dazu:** aus `Sources/MaxiChenUI/`
   `OnboardingView.swift` und `SignupAPI.swift` per Drag&Drop in den
   Projekt-Navigator (Target-Häkchen setzen).
4. **In `ContentView.swift`:**

```swift
import SwiftUI
import MaxiChenKit

@main
struct MaxiChenApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    @State private var token: String? = nil

    var body: some View {
        if let token = token {
            Text("Angemeldet 💗")        // hier kommt die Chat-Liste hin
                .onAppear { UserDefaults.standard.set(token, forKey: "token") }
        } else {
            OnboardingView(
                api: SignupAPI(baseURL: "https://maxichen.de"),
                onDone: { t in token = t }
            )
        }
    }
}
```

5. **Archive** → Distribute App → Ad Hoc / App Store.
   Für ein echtes `.ipa` brauchst du ein Apple-Developer-Konto (99 €/Jahr)
   und ein passendes Provisioning-Profil.

---

## Was noch fehlt (ehrlich)

- **Chat-UI für iOS** — hier ist nur das Onboarding. Die Chats, die
  Verschlüsselung im Betrieb und die Anrufe sind Android-only.
- **Signal-Protokoll auf iOS** — `MaxiChenKit` kann TOTP, Badges, PIN,
  Recovery **und seit V4.15 ML-KEM-768** (der PQ-Teil von PQXDH).
  Es fehlen noch Curve25519 (X3DH) und der Doppel-Ratchet in Swift.
  ML-KEM allein ist der halbe PQXDH — der andere half fehlt noch.
- **Keychain statt UserDefaults** für den Token — gehört in die App,
  nicht ins Package (Keychain gibt es auf Linux nicht).
- **APNs** für Push (Android nutzt WebSocket).

---

## ML-KEM-768 (V4.15) — und der Fehler, den die Referenzvektoren gefunden haben

`MlKem768.keygen/encaps/decaps` ist ein 1:1-Port von `MlKem768.kt`.
Geprüft gegen **kyber-py** (fremde Python-Implementierung von FIPS 203),
3 Vektoren, je `ek` 1184 B · `dk` 2400 B · `ct` 1088 B · `ss` 32 B:

| Vektor | `ek` SHA-256 | `ct` SHA-256 | `ss` |
|---|---|---|---|
| 0 | `bd5348f6…b730b2` ✅ | `a77808db…3e1d34` ✅ | `ab8a9c78…d1cb0d` ✅ |
| 1 | `67be1a1a…855adb` ✅ | `2b1c8dec…a19cb4` ✅ | `444979c4…52c292` ✅ |
| 2 | `e3d02ad1…76cf40` ✅ | `bc5e30b2…bbf576` ✅ | `5578cbe1…188e9a` ✅ |

**Der gefundene Fehler:** Mein erster Swift-Port hat `s` und `e` mit
*verschränkten* Zählern gesampled (`s0`=0, `e0`=1, `s1`=2, `e1`=3 …).
FIPS 203 will `s` mit `N = 0,1,2` und **erst danach** `e` mit `N = 3,4,5`.
Die Folge: Schlüssel, die zwar in sich funktionieren (encaps/decaps passten
zusammen), aber für Android-Geräte **unbrauchbar** gewesen wären.
Sichtbar wurde das nur, weil gegen eine fremde Implementierung geprüft wird —
nicht gegen sich selbst.

---

## Der Fehler, den dieser Port gefunden hat

Das Recovery-Alphabet hieß in Swift zuerst
`ABCDEFGHJKMNPQRSTUVWXYZ234567` (29 Zeichen), in Kotlin aber
`…23456789` (31 Zeichen). Zwei Zeichen Unterschied — ein auf Android
erzeugter Code wäre auf iOS **nicht einlösbar** gewesen.

Aufgefallen ist das nur, weil der Test den **String selbst** vergleicht
und nicht bloß „Länge > 0". Genau dafür gibt es diese Tests.
