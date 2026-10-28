// swift-tools-version:5.9
import PackageDescription

// =====================================================================
// MaxiChenKit — der gemeinsame Kern für iOS
// ---------------------------------------------------------------------
// Warum das ein eigenes Package ist und nicht direkt in der App liegt:
//   Er enthält KEINEN UI-Code und KEINE Plattform-API. Also kann ich ihn
//   auf Linux kompilieren und testen — mit denselben RFC-Vektoren, gegen
//   die auch der Android-Kern läuft. Wenn hier ein Bit kippt, fällt es
//   lange vor dem ersten Mac auf.
//
// iOS-Ziel: 12.0 (kein CryptoKit — das gibt es erst ab iOS 13).
//           Deshalb SHA/HMAC/PBKDF2 selbst implementiert, pur in Swift.
// =====================================================================

let package = Package(
    name: "MaxiChenKit",
    platforms: [
        .iOS(.v12),
        .macOS(.v10_15),
    ],
    products: [
        .library(name: "MaxiChenKit", targets: ["MaxiChenKit"]),
    ],
    targets: [
        .target(name: "MaxiChenKit", path: "Sources/MaxiChenKit"),
        .testTarget(name: "MaxiChenKitTests", dependencies: ["MaxiChenKit"], path: "Tests/MaxiChenKitTests"),
    ]
)
