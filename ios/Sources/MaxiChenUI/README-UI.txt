Diese Dateien sind bewusst NICHT Teil des Swift-Packages:

  OnboardingView.swift   — SwiftUI, braucht Apple-SDKs
  SignupAPI.swift        — nur Foundation, könnte auch auf Linux laufen

Warum nicht im Package?
  Package.swift definiert Targets. Würde ich SwiftUI dort als Target
  eintragen, scheitert `swift build` auf Linux mit "no such module SwiftUI".
  Der getestete Kern (MaxiChenKit) bleibt dadurch sauber baubar.

So kommen sie in die App:
  Xcode → File → Add Files to "MaxiChen"… → beide .swift wählen.
