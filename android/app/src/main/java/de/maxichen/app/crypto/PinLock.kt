package de.maxichen.app.crypto

/* =====================================================================
   🔑 V4.12 — PIN-LOCK (lokal, im Vault, nie im Klartext)
   ---------------------------------------------------------------------
   Die PIN ist der letzte Zaun: sie sperrt die App, wenn jemand dein
   entsperrtes Handy in die Hand bekommt. Vier Regeln, die sie ehrlich
   machen:

     1. Nie im Klartext — PBKDF2 mit eigenem Salt, 120.000 Runden.
        1 Mio. PINs durchprobieren kostet damit ~2 Minuten pro PIN-Reihe
        auf einer GPU — deshalb gibt es Regel 2.
     2. Fehlversuche werden GEZÄHLT und mit wachsender Pause bestraft
        (0 s → 30 s → 2 min → 10 min → 30 min). Ohne das ist eine
        4-stellige PIN in Sekunden durch.
     3. Die PIN wird NICHT über das Netz übertragen und nicht an den
        Server geschickt. Sie ist lokal oder sie ist nichts.
     4. Ehrlich: 4 Ziffern = 10.000 Möglichkeiten. Wer dein entsperrtes
        Handy hat und die App-Daten kopieren kann, knackt sie offline.
        Deshalb ist Biometrie der Standard und die PIN der Notausgang.
   ===================================================================== */

import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object PinLock {

    const val ITERATIONS = 120_000
    const val MIN_LENGTH = 4
    const val MAX_LENGTH = 12

    /** Pausen nach n Fehlversuchen (Index = Fehlversuche, gedeckelt). */
    val LOCKOUT_MS = longArrayOf(0, 0, 0, 30_000, 120_000, 600_000, 1_800_000)

    data class Stored(val hashB64: String, val saltB64: String, val length: Int)

    fun validate(pin: String): String? = when {
        pin.length !in MIN_LENGTH..MAX_LENGTH -> "PIN muss 4–12 Ziffern haben"
        !pin.all { it.isDigit() } -> "Nur Ziffern"
        pin.toSet().size == 1 -> "Nicht 1111 oder 0000 — das errät jeder"
        pin in SEQUENCES -> "Keine Reihen wie 1234 oder 4321"
        else -> null
    }

    private val SEQUENCES = (0..9).flatMap { d ->
        val asc = (0 until 4).joinToString("") { ((d + it) % 10).toString() }
        val desc = (0 until 4).joinToString("") { ((d - it + 10) % 10).toString() }
        listOf(asc, desc)
    }.toSet()

    fun store(pin: String, rnd: SecureRandom = SecureRandom()): Stored {
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        return Stored(hash(pin, salt), Crypto.b64(salt), pin.length)
    }

    fun hash(pin: String, salt: ByteArray): String {
        val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, 256)
        return try {
            Crypto.b64(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded)
        } finally {
            spec.clearPassword()
        }
    }

    fun verify(pin: String, stored: Stored): Boolean {
        if (pin.length != stored.length) return false
        val salt = Crypto.unb64(stored.saltB64)
        return Crypto.constantTimeEquals(hash(pin, salt).toByteArray(), stored.hashB64.toByteArray())
    }

    /** Wie lange muss noch gewartet werden? 0 = darf sofort. */
    fun lockoutRemaining(fails: Int, lastFailAt: Long, nowMillis: Long): Long {
        if (fails <= 0) return 0
        val wait = LOCKOUT_MS[fails.coerceIn(0, LOCKOUT_MS.size - 1)]
        val elapsed = nowMillis - lastFailAt
        return (wait - elapsed).coerceAtLeast(0)
    }

    fun lockoutText(ms: Long): String = when {
        ms <= 0 -> ""
        ms < 60_000 -> "${(ms + 999) / 1000} Sekunden"
        ms < 3_600_000 -> "${(ms + 59_999) / 60_000} Minuten"
        else -> "${(ms + 3_599_999) / 3_600_000} Stunden"
    }

    fun encode(s: Stored): String = "${s.saltB64},${s.hashB64},${s.length}"

    fun decode(raw: String?): Stored? {
        if (raw.isNullOrBlank()) return null
        val f = raw.split(",")
        if (f.size != 3) return null
        return Stored(f[1], f[0], f[2].toIntOrNull() ?: return null)
    }
}
