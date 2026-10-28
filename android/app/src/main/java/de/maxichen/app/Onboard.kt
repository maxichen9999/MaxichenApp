package de.maxichen.app

/* =====================================================================
   📱 V4.13 — Anmelde-Logik, ohne UI und ohne Netz
   ---------------------------------------------------------------------
   Warum das eine eigene Datei ist: alles hier ist reine Rechnerei.
   Kein Compose, kein OkHttp, kein Android. Dadurch kann ich es auf der
   JVM testen — und nur was getestet ist, darf in den Flow.

   Und weil zwei Leute dieselbe Regel brauchen (App und Server), steht
   sie hier nochmal exakt so, wie sie auf dem Server in accounts.js
   steht. Weicht eine Seite ab, fällt es im Test auf.
   ===================================================================== */

object Onboard {

    /**
     * Dieselbe Normalisierung wie `accounts.normalizePhone` auf dem Server:
     * alles außer Ziffern weg, führende 00 → +, führendes + erzwingen,
     * 7–15 Ziffern. Alles andere ist keine Nummer.
     */
    fun normalizePhone(raw: String?): String {
        var p = (raw ?: "").trim().replace(Regex("[^\\d+]"), "")
        if (p.isEmpty()) return ""
        if (p.startsWith("00")) p = "+" + p.substring(2)
        if (!p.startsWith("+")) p = "+$p"
        return if (Regex("^\\+\\d{7,15}$").matches(p)) p else ""
    }

    /** Ziffern ohne Ländervorwahl — für die Anzeige im Eingabefeld. */
    fun nationalNumber(raw: String?): String = (raw ?: "").filter { it.isDigit() }

    /**
     * Wie WhatsApp die Nummer anzeigt: +49 151 55894714.
     * Bewusst grob — eine perfekte Formatierung pro Land wäre ein eigener
     * Datenbestand, und die falsche Gruppierung irritiert mehr, als sie hilft.
     */
    fun prettyPhone(e164: String?): String {
        val p = normalizePhone(e164)
        if (p.isEmpty()) return ""
        val d = p.substring(1)
        return if (d.length > 6) {
            val cc = if (d.startsWith("49") || d.startsWith("43") || d.startsWith("41")) d.substring(0, 2) else d.substring(0, 1)
            val rest = d.substring(cc.length)
            "+" + cc + " " + rest.chunked(3).joinToString(" ")
        } else p
    }

    /** Nur Ziffern, höchstens [max] Stück — für Code-Felder. */
    fun sanitizeCode(raw: String?, max: Int = 6): String =
        (raw ?: "").filter { it.isDigit() }.take(max)

    fun isCompleteCode(raw: String?, length: Int = 6): Boolean =
        sanitizeCode(raw, length).length == length

    /** Kontoname: a–z, 0–9, _ · 3–20 Zeichen · wie auf dem Server. */
    fun sanitizeUsername(raw: String?): String =
        (raw ?: "").lowercase().filter { it in 'a'..'z' || it in '0'..'9' || it == '_' }.take(20)

    fun usernameProblem(u: String?): String? {
        val s = (u ?: "")
        if (s.length < 3) return "Mindestens 3 Zeichen"
        if (s.length > 20) return "Höchstens 20 Zeichen"
        if (!Regex("^[a-z0-9_]+$").matches(s)) return "Nur a–z, 0–9 und _"
        return null
    }

    fun displayNameProblem(n: String?): String? {
        val s = (n ?: "").trim()
        if (s.length < 2) return "Mindestens 2 Zeichen"
        if (s.length > 30) return "Höchstens 30 Zeichen"
        return null
    }

    /** E-Mail: genau der Test, den der Server auch macht. */
    fun isEmail(raw: String?): Boolean =
        Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$").matches((raw ?: "").trim())

    /**
     * Was fehlt noch? Damit die UI nicht raten muss, in welchem Schritt
     * sie ist. Reihenfolge wie im echten Flow.
     */
    fun nextStep(phoneVerified: Boolean, profileDone: Boolean, emailDone: Boolean): String = when {
        !phoneVerified -> "phone"
        !profileDone -> "profile"
        !emailDone -> "email"
        else -> "done"
    }

    /**
     * „Darf ich einen neuen Code anfordern?" — die App fragt das lokal,
     * damit man nicht sinnlos auf einen 429 zuläuft.
     * Server-Regel: 3 in 15 Minuten.
     */
    fun resendAllowed(secondsSinceLast: Long, lastMinuteCount: Int): Boolean =
        secondsSinceLast >= 30 && lastMinuteCount < 3

    /** Warum ist ein Code kaputt? (reine Anzeige, geprüft wird am Server) */
    fun codeProblem(raw: String?, length: Int = 6): String? {
        val s = (raw ?: "")
        if (s.isEmpty()) return null
        if (s.any { !it.isDigit() }) return "Nur Ziffern"
        if (s.length < length) return "Noch ${length - s.length} Ziffern"
        return null
    }

    /** Absender, den die App in der Mail nennen darf. */
    const val MAIL_FROM = "contact@maxichen.de"
    const val MAIL_SUBJECT = "maxichen verifizierungscode"
    const val WHATSAPP_SESSION = "Verifi"
}
