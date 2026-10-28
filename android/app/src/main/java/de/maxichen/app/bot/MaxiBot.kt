package de.maxichen.app.bot

/* =====================================================================
   🤖 V4.11 — MAXIBOT (lokal, im RAM, ohne Server)
   ---------------------------------------------------------------------
   Drei Regeln, die den Bot ehrlich machen:

     1. Er bekommt NUR Text. Kein Context, keinen Vault, keine DB.
        Er kann also gar nicht an Schlüssel kommen — nicht "darf nicht",
        sondern "kann nicht". Deshalb sind alle Funktionen hier `pure`.
     2. Er lügt nicht. Wo er etwas nicht kann (`/translate` ohne Modell),
        sagt er das und schlägt den Weg vor — statt Kauderwelsch zu
        erfinden und es "Übersetzung" zu nennen.
     3. Alles ist deterministisch: gleicher Input → gleicher Output.
        Nur so kann man es testen, und nur so ist es kein Glücksspiel.

   Was er WIRKLICH kann (kein Fake, echte Algorithmen):
     /summarize  — extraktive Zusammenfassung über Worthäufigkeit (TF)
     /rewrite    — deterministische Umformulierung (kürzer · schöner ·
                   förmlich) mit Füllwort-Liste und Satznormalisierung
     /remind     — echter Zeitparser ("in 2h", "in 1h30m", "morgen 18:00")
     /poll       — Umfrage aus "Frage | A | B | C"
   ===================================================================== */

object MaxiBot {

    enum class Kind { HELP, SUMMARY, REWRITE, REMINDER, POLL, REFUSED, UNKNOWN }

    data class Reply(
        val kind: Kind,
        val text: String,
        /** Millis (bei Erinnerungen) — sonst 0 */
        val atMillis: Long = 0,
        /** Optionen (bei Umfragen) */
        val options: List<String> = emptyList(),
    )

    data class Reminder(val atMillis: Long, val text: String)
    data class Poll(val question: String, val options: List<String>)

    private val COMMANDS = listOf("summarize", "rewrite", "remind", "poll", "translate", "help")

    fun isCommand(input: String): Boolean {
        val t = input.trim()
        if (!t.startsWith("/")) return false
        val name = t.removePrefix("/").substringBefore(' ').lowercase()
        return name in COMMANDS
    }

    /* ------------------------------------------------------------------ */
    /*  Einstieg                                                          */
    /* ------------------------------------------------------------------ */

    fun handle(input: String, nowMillis: Long, history: List<String> = emptyList()): Reply {
        val t = input.trim()
        if (!t.startsWith("/")) return unknown()
        val name = t.removePrefix("/").substringBefore(' ').lowercase()
        val rest = t.removePrefix("/").substringAfter(' ', "").trim()

        return when (name) {
            "help" -> help()
            "summarize" -> summarize(if (history.isNotEmpty()) history else listOfNotNull(rest.ifEmpty { null }))
            "rewrite" -> rewrite(rest)
            "remind" -> remind(rest, nowMillis)
            "poll" -> poll(rest)
            "translate" -> translate(rest)
            else -> unknown()
        }
    }

    /* ------------------------------------------------------------------ */
    /*  /help                                                             */
    /* ------------------------------------------------------------------ */

    fun help() = Reply(
        Kind.HELP,
        """
        🤖 MaxiBot — läuft nur auf deinem Handy
        ─────────────────────────────
        /summarize — fasst den Chat zusammen (lokal, extraktiv)
        /rewrite kürzer <Text> — kürzt deine Nachricht
        /rewrite schöner <Text> — macht sie lesbarer, gleicher Ton
        /rewrite förmlich <Text> — für Bewerbung & Amt
        /remind in 2h <Text> — Erinnerung (auch "in 30m", "morgen 18:00")
        /poll Frage | A | B | C — kleine Umfrage
        /translate — sag ich dir ehrlich: geht hier nicht
        ─────────────────────────────
        Ich lese nur Text. Kein Zugriff auf Schlüssel, Server oder Datenbank.
        """.trimIndent(),
    )

    /* ------------------------------------------------------------------ */
    /*  /summarize — extraktiv über Worthäufigkeit                        */
    /* ------------------------------------------------------------------ */

    private val STOP = setOf(
        "der", "die", "das", "und", "aber", "oder", "ist", "sind", "war", "waren", "ich", "du", "er", "sie", "es",
        "wir", "ihr", "ein", "eine", "einen", "einem", "eines", "nicht", "mit", "auf", "für", "von", "zu", "den",
        "dem", "des", "im", "in", "an", "am", "als", "wie", "auch", "noch", "nur", "mich", "mir", "dir", "dich",
        "hab", "habe", "hast", "hat", "hatte", "bin", "bist", "mal", "so", "ja", "nein", "ok", "okay", "hm",
        "the", "and", "a", "to", "of", "in", "is", "it", "you", "me", "we", "that", "this",
    )

    private fun sentences(text: String): List<String> =
        text.split(Regex("(?<=[.!?…])\\s+|\\n+"))
            .map { it.trim() }
            .filter { it.length > 2 }

    private fun words(s: String): List<String> =
        Regex("[\\p{L}\\p{N}]+").findAll(s.lowercase()).map { it.value }.filter { it !in STOP && it.length > 2 }.toList()

    /**
     * Echte extraktive Zusammenfassung:
     *   1. Worthäufigkeit im ganzen Text (Termfrequenz)
     *   2. Satz-Score = Summe der Worthäufigkeiten / sqrt(Länge)
     *      (lange Sätze werden gedämpft, sonst gewinnt immer der längste)
     *   3. die N besten Sätze, aber in ORIGINAL-Reihenfolge
     */
    fun summarize(lines: List<String>, maxSentences: Int = 3): Reply {
        val all = sentences(lines.joinToString("\n"))
        if (all.isEmpty()) return Reply(Kind.SUMMARY, "Hier ist noch nichts, was ich zusammenfassen könnte 💗")
        if (all.size <= maxSentences) {
            return Reply(Kind.SUMMARY, "Der Chat ist kurz genug — keine Zusammenfassung nötig:\n\n" + all.joinToString("\n"))
        }

        val freq = HashMap<String, Int>()
        for (s in all) for (w in words(s)) freq[w] = (freq[w] ?: 0) + 1

        val scored = all.mapIndexed { i, s ->
            val ws = words(s)
            val sum = ws.sumOf { freq[it] ?: 0 }.toDouble()
            val score = if (ws.isEmpty()) 0.0 else sum / Math.sqrt(ws.size.toDouble())
            Triple(i, s, score)
        }

        val top = scored.sortedByDescending { it.third }.take(maxSentences).sortedBy { it.first }
        return Reply(
            Kind.SUMMARY,
            "📝 Zusammenfassung (${top.size} von ${all.size} Sätzen, lokal berechnet):\n\n" +
                top.joinToString("\n\n") { "• " + it.second },
        )
    }

    /* ------------------------------------------------------------------ */
    /*  /rewrite — deterministisch, kein Modell                           */
    /* ------------------------------------------------------------------ */

    private val FILLER = listOf(
        "halt", "eben", "irgendwie", "sozusagen", "quasi", "eigentlich", "ja mal", "also", "einfach mal",
        "im prinzip", "gewissermaßen", "mehr oder weniger", "wie gesagt",
    )

    private val FORMAL = mapOf(
        "hi" to "Guten Tag", "hallo" to "Guten Tag", "hey" to "Guten Tag", "moin" to "Guten Tag",
        "danke" to "Vielen Dank", "thanks" to "Vielen Dank", "ok" to "in Ordnung", "okay" to "in Ordnung",
        "kannst du" to "könnten Sie", "kannst" to "können Sie", "hast du" to "haben Sie",
        "du" to "Sie", "dich" to "Sie", "dir" to "Ihnen", "dein" to "Ihr", "deine" to "Ihre",
    )

    fun rewrite(rest: String): Reply {
        val variant = rest.substringBefore(' ', "").lowercase()
        val body = rest.substringAfter(' ', "").trim()
        if (body.isEmpty()) {
            return Reply(
                Kind.REWRITE,
                "Schreib es so: `/rewrite kürzer Dein Text hier`\nVarianten: kürzer · schöner · förmlich",
            )
        }
        val out = when (variant) {
            "kürzer", "kuerzer" -> shorter(body)
            "schöner", "schoener" -> nicer(body)
            "förmlich", "foermlich" -> formal(body)
            "" -> nicer(body)
            else -> return Reply(
                Kind.REWRITE,
                "„" + variant + "\" kenne ich nicht. Nimm: kürzer · schöner · förmlich",
            )
        }
        return Reply(Kind.REWRITE, out)
    }

    private fun tidy(s: String): String =
        s.replace(Regex("\\s+"), " ")
            .replace(Regex("\\s+([,.!?;:])"), "$1")
            .trim()

    private fun capitalizeSentences(s: String): String {
        val sb = StringBuilder()
        var start = true
        for (ch in s) {
            if (start && ch.isLetter()) { sb.append(ch.uppercaseChar()); start = false } else sb.append(ch)
            if (ch == '.' || ch == '!' || ch == '?' || ch == '\n') start = true
        }
        return sb.toString()
    }

    fun shorter(text: String): String {
        var s = text
        for (f in FILLER) s = s.replace(Regex("(?i)\\b" + Regex.escape(f) + "\\b"), "")
        s = tidy(s)
        s = capitalizeSentences(s)
        return s.ifEmpty { text.trim() }
    }

    fun nicer(text: String): String {
        var s = shorter(text)
        if (s.isNotEmpty() && s.last() !in ".!?…" ) s += "."
        // Doppelte Satzzeichen killen ("!!" bleibt "!", "?!" bleibt)
        s = s.replace(Regex("([.!?])\\1{2,}"), "$1")
        return s
    }

    fun formal(text: String): String {
        var s = nicer(text)
        for ((k, v) in FORMAL) {
            s = s.replace(Regex("(?i)\\b" + Regex.escape(k) + "\\b"), v)
        }
        return s
    }

    /* ------------------------------------------------------------------ */
    /*  /remind — echter Zeitparser                                       */
    /* ------------------------------------------------------------------ */

    /**
     * Unterstützt:
     *   in 2h · in 30m · in 1h30m · in 45min · in 2 stunden
     *   heute 20:00 · morgen 18:30 · 18:30 (nächste passende Uhrzeit)
     */
    fun parseReminder(input: String, nowMillis: Long): Reminder? {
        val t = input.trim()
        if (t.isEmpty()) return null

        // --- relativ: "in 2h", "in 1h30m", "in 45 min" ---
        val rel = Regex("(?i)^in\\s+(.+?)\\s+(.*)$").find(t)
        if (rel != null) {
            val amount = rel.groupValues[1]
            val text = rel.groupValues[2].trim()
            val minutes = parseDurationMinutes(amount) ?: return null
            if (minutes <= 0) return null
            return Reminder(nowMillis + minutes * 60_000L, text)
        }

        // --- "heute 20:00" / "morgen 18:30" / "18:30" ---
        val abs = Regex("(?i)^(heute|morgen)?\\s*(\\d{1,2})[:.](\\d{2})\\s+(.*)$").find(t)
        if (abs != null) {
            val day = abs.groupValues[1].lowercase()
            val h = abs.groupValues[2].toIntOrNull() ?: return null
            val m = abs.groupValues[3].toIntOrNull() ?: return null
            val text = abs.groupValues[4].trim()
            if (h !in 0..23 || m !in 0..59) return null

            val cal = java.util.Calendar.getInstance().apply { timeInMillis = nowMillis }
            cal.set(java.util.Calendar.HOUR_OF_DAY, h)
            cal.set(java.util.Calendar.MINUTE, m)
            cal.set(java.util.Calendar.SECOND, 0)
            cal.set(java.util.Calendar.MILLISECOND, 0)
            when (day) {
                "morgen" -> cal.add(java.util.Calendar.DAY_OF_MONTH, 1)
                "heute" -> { /* heute, auch wenn schon vorbei -> wird als vergangen erkannt */ }
                else -> if (cal.timeInMillis <= nowMillis) cal.add(java.util.Calendar.DAY_OF_MONTH, 1)
            }
            if (cal.timeInMillis <= nowMillis) return null
            return Reminder(cal.timeInMillis, text)
        }

        return null
    }

    /** "2h" → 120 · "30m" → 30 · "1h30m" → 90 · "45 min" → 45 · "2 stunden" → 120 */
    fun parseDurationMinutes(spec: String): Long? {
        val s = spec.trim().lowercase().replace(" ", "")
        if (s.isEmpty()) return null
        var total = 0L
        var found = false
        val re = Regex("(\\d+)(h|std|stunde|stunden|min|m|minuten|minute)")
        for (m in re.findAll(s)) {
            val n = m.groupValues[1].toLongOrNull() ?: return null
            total += when (m.groupValues[2]) {
                "h", "std", "stunde", "stunden" -> n * 60
                else -> n
            }
            found = true
        }
        if (!found) {
            // reine Zahl = Minuten
            return s.toLongOrNull()
        }
        return total
    }

    fun remind(rest: String, nowMillis: Long): Reply {
        val r = parseReminder(rest, nowMillis)
            ?: return Reply(
                Kind.REFUSED,
                "Ich habe die Zeit nicht verstanden 🕐\nSo geht's: `/remind in 2h Kaffee` · `/remind in 30m Anruf` · `/remind morgen 18:00 Essen`",
            )
        val inMin = (r.atMillis - nowMillis) / 60_000L
        val whenText = if (inMin < 60) "in $inMin Minuten" else String.format("%.1f Stunden", inMin / 60.0)
        return Reply(
            Kind.REMINDER,
            "⏰ Alles klar — ich erinnere dich $whenText" + (if (r.text.isNotEmpty()) " an: ${r.text}" else "") +
                "\n\n(Läuft auf deinem Handy. Kein Server, kein Push über fremde Dienste.)",
            atMillis = r.atMillis,
        )
    }

    /* ------------------------------------------------------------------ */
    /*  /poll                                                             */
    /* ------------------------------------------------------------------ */

    fun poll(rest: String): Reply {
        val parts = rest.split("|").map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.size < 3) {
            return Reply(
                Kind.REFUSED,
                "Eine Umfrage braucht eine Frage und mindestens zwei Antworten:\n`/poll Pizza oder Sushi? | Pizza | Sushi | Egal`",
            )
        }
        val question = parts.first()
        val options = parts.drop(1)
        if (options.size > 8) {
            return Reply(Kind.REFUSED, "Höchstens 8 Antworten — sonst scrollt niemand mehr 😅")
        }
        return Reply(
            Kind.POLL,
            "📊 " + question,
            options = options,
        )
    }

    /* ------------------------------------------------------------------ */
    /*  /translate — die ehrliche Absage                                  */
    /* ------------------------------------------------------------------ */

    fun translate(rest: String): Reply = Reply(
        Kind.REFUSED,
        """
        🌍 Übersetzen kann ich nicht — und ich tue auch nicht so.
        ─────────────────────────────
        Eine echte Übersetzung braucht ein Sprachmodell. In der APK ist keins,
        denn eine Modelldatei wäre 100+ MB, und alles über einen fremden Server
        zu schicken würde dein „Ende-zu-Ende" kaputt machen: der Text müsste
        unverschlüsselt rausgehen.

        Zwei ehrliche Wege:
        · Ein kleines Offline-Modell (OPUS-MT, ~50 MB) nachladen — dann bleibt
          alles auf dem Handy.
        · Oder du tippst es selbst — dauert 20 Sekunden, kostet nichts.
        ─────────────────────────────
        Alles, was ICH mache (Zusammenfassen, Kürzen, Erinnern), läuft ohne
        Modell und verlässt dein Handy nie.
        """.trimIndent(),
    )

    private fun unknown() = Reply(
        Kind.UNKNOWN,
        "Das habe ich nicht verstanden 🤖\nSchreib `/help` — dann zeige ich, was ich kann.",
    )
}
