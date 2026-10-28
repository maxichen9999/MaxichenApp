package de.maxichen.app.crypto

/* =====================================================================
   🔢 V4.12 — TOTP (RFC 6238) + Base32 (RFC 4648) + otpauth-URL
   ---------------------------------------------------------------------
   Damit die App in Google Authenticator / Aegis / Authy / 1Password
   funktioniert, muss das hier GENAU dem Standard folgen — nicht "ähnlich".

     HOTP(K, C) = Truncate(HMAC-SHA1(K, C))
     TOTP(K, T) = HOTP(K, floor((T - T0) / X))    T0 = 0, X = 30 s
     Code       = HOTP mod 10^d                    d = 6 (oder 8)

   Warum SHA1, obwohl es "alt" ist? Weil RFC 6238 SHA1 als Default hat
   und JEDER Authenticator das spricht. SHA256/512 werden zusätzlich
   unterstützt, aber die Wahl liegt beim Konto — nicht bei mir.

   ⚠️ Ehrlich: TOTP schützt gegen "Passwort geklaut". Es schützt NICHT
   gegen eine laufende Session, gegen Phishing-Realtime-Proxy oder gegen
   jemanden, der dein Handy entsperrt hat. Dafür sind Passkeys da — die
   stehen als nächstes an. Ein Haken zu viel wäre gelogen.
   ===================================================================== */

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object Totp {

    const val DIGITS_DEFAULT = 6
    const val PERIOD = 30
    const val ALGORITHM = "SHA1"

    data class Config(
        val secret: ByteArray,
        val digits: Int = DIGITS_DEFAULT,
        val period: Int = PERIOD,
        val algorithm: String = ALGORITHM,
        val issuer: String = "MaxiChat",
        val account: String = "",
    )

    /** Rohes HOTP nach RFC 4226. */
    fun hotp(secret: ByteArray, counter: Long, digits: Int = DIGITS_DEFAULT): String {
        require(digits in 6..8) { "digits muss 6..8 sein" }
        require(secret.isNotEmpty()) { "Secret ist leer" }

        val mac = Mac.getInstance("HmacSHA1")      // HOTP ist per RFC immer SHA1
        mac.init(SecretKeySpec(secret, "HmacSHA1"))
        val hash = mac.doFinal(byteArrayOf(
            (counter ushr 56).toByte(), (counter ushr 48).toByte(), (counter ushr 40).toByte(),
            (counter ushr 32).toByte(), (counter ushr 24).toByte(), (counter ushr 16).toByte(),
            (counter ushr 8).toByte(), counter.toByte(),
        ))

        // Dynamic Truncation (RFC 4226, Abschnitt 5.3)
        val offset = hash[hash.size - 1].toInt() and 0x0F
        val bin = ((hash[offset].toInt() and 0x7F) shl 24) or
            ((hash[offset + 1].toInt() and 0xFF) shl 16) or
            ((hash[offset + 2].toInt() and 0xFF) shl 8) or
            (hash[offset + 3].toInt() and 0xFF)
        val mod = when (digits) {
            6 -> 1_000_000
            7 -> 10_000_000
            else -> 100_000_000
        }
        return (bin % mod).toString().padStart(digits, '0')
    }

    /** TOTP zum Zeitpunkt `unixSeconds` (RFC 6238). */
    fun totp(secret: ByteArray, unixSeconds: Long, digits: Int = DIGITS_DEFAULT, period: Int = PERIOD): String {
        require(period > 0) { "Periode muss positiv sein" }
        return hotp(secret, unixSeconds / period, digits)
    }

    /** Aktueller Code. */
    fun now(secret: ByteArray, digits: Int = DIGITS_DEFAULT): String =
        totp(secret, System.currentTimeMillis() / 1000, digits)

    /** Sekunden bis der aktuelle Code abläuft (0..period). */
    fun secondsRemaining(unixSeconds: Long, period: Int = PERIOD): Int =
        (period - (unixSeconds % period)).toInt()

    /**
     * Prüft einen eingegebenen Code. Erlaubt ±1 Fenster (Uhren laufen nie
     * exakt gleich) — mehr wäre ein Sicherheitsloch, weniger wäre im Alltag
     * unbenutzbar.
     */
    fun verify(
        secret: ByteArray, code: String, unixSeconds: Long,
        digits: Int = DIGITS_DEFAULT, period: Int = PERIOD, window: Int = 1,
    ): Boolean {
        val clean = code.filter { it.isDigit() }
        if (clean.length != digits) return false
        for (w in -window..window) {
            val c = totp(secret, unixSeconds + w * period.toLong(), digits, period)
            if (constantTimeEquals(c, clean)) return true
        }
        return false
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }

    /* ---------------- otpauth:// URL ---------------- */

    fun otpauthUrl(cfg: Config): String {
        val enc = { s: String -> java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20") }
        // ⚠️ Der Doppelpunkt zwischen Issuer und Konto ist TRENNER, kein Text.
        //    Wird er kodiert (%3A), zeigen Authenticator-Apps den Kontonamen falsch an.
        val label = if (cfg.account.isEmpty()) enc(cfg.issuer) else enc(cfg.issuer) + ":" + enc(cfg.account)
        return "otpauth://totp/$label" +
            "?secret=${base32Encode(cfg.secret)}" +
            "&issuer=${enc(cfg.issuer)}" +
            "&algorithm=${cfg.algorithm}" +
            "&digits=${cfg.digits}" +
            "&period=${cfg.period}"
    }

    /* ---------------- Base32 (RFC 4648, ohne Padding) ---------------- */

    private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    fun base32Encode(data: ByteArray): String {
        val sb = StringBuilder()
        var buffer = 0
        var bits = 0
        for (b in data) {
            buffer = (buffer shl 8) or (b.toInt() and 0xFF)
            bits += 8
            while (bits >= 5) {
                sb.append(B32[(buffer shr (bits - 5)) and 0x1F])
                bits -= 5
            }
        }
        if (bits > 0) sb.append(B32[(buffer shl (5 - bits)) and 0x1F])
        return sb.toString()
    }

    fun base32Decode(s: String): ByteArray {
        val clean = s.uppercase().filter { it in B32 }
        val out = ArrayList<Byte>(clean.length * 5 / 8 + 1)
        var buffer = 0
        var bits = 0
        for (ch in clean) {
            buffer = (buffer shl 5) or B32.indexOf(ch)
            bits += 5
            if (bits >= 8) {
                out.add(((buffer shr (bits - 8)) and 0xFF).toByte())
                bits -= 8
            }
        }
        return out.toByteArray()
    }

    /* ---------------- Hilfen ---------------- */

    /** 20 Byte = 160 bit, das übliche TOTP-Secret (wie von Google ausgegeben). */
    fun newSecret(): ByteArray = ByteArray(20).also { java.security.SecureRandom().nextBytes(it) }

    fun newConfig(account: String, issuer: String = "MaxiChat"): Config =
        Config(secret = newSecret(), account = account, issuer = issuer)

    /** Für die Anzeige gruppiert: ABCD EFGH IJKL … (wie Authenticator-Apps) */
    fun prettySecret(secret: ByteArray): String =
        base32Encode(secret).chunked(4).joinToString(" ")
}
