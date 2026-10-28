package de.maxichen.app.crypto

/* =====================================================================
   🎫 V4.12 — RECOVERY CODES (Einmal-Codes, wie GitHub sie gibt)
   ---------------------------------------------------------------------
   Wenn das Handy mit dem Authenticator weg ist, muss es einen Weg zurück
   geben — sonst sperrst du dich selbst aus. Das sind die Regeln:

     · 10 Codes, jeder genau einmal gültig
     · 8 Zeichen aus einem Alphabet ohne Verwechslungen (kein O/0, I/1/L)
     · gespeichert wird NUR der Hash (PBKDF2, eigener Salt pro Code)
       → wer die Liste klaut, kann sie nicht benutzen
     · Vergleich in konstanter Zeit
     · Anzeige in Gruppen "ABCD-EFGH" — tippbar, vorlesbar, aufschreibbar

   Bewusst KEIN Base32-Zufall aus dem TOTP-Secret: Recovery-Codes müssen
   unabhängig sein. Wer das TOTP-Secret hat, darf damit nicht auch die
   Recovery-Codes ableiten können.
   ===================================================================== */

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object RecoveryCodes {

    /** Ohne O/0, I/1/L — was man auf einem Zettel nicht verwechselt. */
    const val ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    const val COUNT = 10
    const val LENGTH = 8
    const val ITERATIONS = 120_000

    data class Entry(val index: Int, val hashB64: String, val saltB64: String, val used: Boolean = false)

    data class Generated(val plain: List<String>, val entries: List<Entry>)

    /** Erzeugt einen Satz Codes. Die Klartexte existieren NUR hier im RAM. */
    fun generate(count: Int = COUNT, length: Int = LENGTH, rnd: SecureRandom = SecureRandom()): Generated {
        val plain = ArrayList<String>(count)
        val entries = ArrayList<Entry>(count)
        val seen = HashSet<String>()
        while (plain.size < count) {
            val sb = StringBuilder(length)
            for (i in 0 until length) sb.append(ALPHABET[rnd.nextInt(ALPHABET.length)])
            val code = sb.toString()
            if (!seen.add(code)) continue          // keine Dubletten
            plain += code
            val salt = ByteArray(16).also { rnd.nextBytes(it) }
            entries += Entry(plain.size - 1, hash(code, salt), Crypto.b64(salt))
        }
        return Generated(plain, entries)
    }

    /** "ABCDEFGH" → "ABCD-EFGH" (so wird er angezeigt und aufgeschrieben) */
    fun format(code: String): String {
        val c = normalize(code)
        return if (c.length <= 4) c else c.substring(0, 4) + "-" + c.substring(4)
    }

    /** Entfernt Trennzeichen, Leerzeichen und Kleinschreibung. */
    fun normalize(input: String): String =
        input.uppercase().filter { it in ALPHABET }

    fun hash(code: String, salt: ByteArray): String {
        val spec = PBEKeySpec(normalize(code).toCharArray(), salt, ITERATIONS, 256)
        return try {
            Crypto.b64(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded)
        } finally {
            spec.clearPassword()
        }
    }

    /**
     * Prüft einen eingegebenen Code gegen die Liste.
     * @return der Index des verbrauchten Codes, oder -1
     *
     * Der Vergleich läuft über ALLE Einträge (nicht abbrechen beim ersten
     * Treffer) — sonst verrät die Laufzeit, welcher Code passt.
     */
    fun verify(input: String, entries: List<Entry>): Int {
        val norm = normalize(input)
        if (norm.length != LENGTH) return -1
        var match = -1
        for (e in entries) {
            if (e.used) continue
            val salt = Crypto.unb64(e.saltB64)
            val h = hash(norm, salt)
            if (MessageDigest.isEqual(h.toByteArray(), e.hashB64.toByteArray())) {
                if (match < 0) match = e.index
            }
        }
        return match
    }

    fun remaining(entries: List<Entry>): Int = entries.count { !it.used }

    /** Serialisierung für SharedPreferences (das JSON-freie Format des Projekts). */
    fun encode(entries: List<Entry>): String =
        entries.joinToString(";") { "${it.index},${it.saltB64},${it.hashB64},${if (it.used) 1 else 0}" }

    fun decode(raw: String): List<Entry> {
        if (raw.isBlank()) return emptyList()
        return raw.split(";").mapNotNull { row ->
            val f = row.split(",")
            if (f.size != 4) return@mapNotNull null
            Entry(f[0].toIntOrNull() ?: return@mapNotNull null, f[2], f[1], f[3] == "1")
        }
    }

    fun markUsed(entries: List<Entry>, index: Int): List<Entry> =
        entries.map { if (it.index == index) it.copy(used = true) else it }
}
