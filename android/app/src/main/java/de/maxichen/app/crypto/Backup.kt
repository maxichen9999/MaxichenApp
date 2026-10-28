package de.maxichen.app.crypto

/* =====================================================================
   💾 V4.10 — BACKUP: das, was der Keystore NICHT kann
   ---------------------------------------------------------------------
   V4.8 hat bewusst eine Lücke aufgerissen: liegt der Schlüssel im
   Keystore, ist er nicht exportierbar — und damit sind alte Nachrichten
   nach einem Gerätewechsel für immer weg. Genau das war der Preis.

   Diese Datei schließt die Lücke. Sie nimmt die Geheimnisse, die der
   Keystore nicht hergibt, entschlüsselt sie kurz auf dem Gerät und
   verschließt sie mit einem Passwort, das NUR der Nutzer kennt.

   ---------------------------------------------------------------------
   DATEIFORMAT  "MCBK1"   (alles big-endian)

       Offset  Größe  Feld
       0       4      Magic "MCBK"
       4       1      Version = 1
       5       4      Iterationen (PBKDF2, uint32)
       9       32     Salt
       41      12     Nonce
       53      …      AES-256-GCM Ciphertext ‖ 16-Byte-Tag

       AAD = Bytes 0..52  → Header ist authentifiziert. Wer die
             Iterationszahl kleiner dreht (um das Passwort billiger zu
             knacken), macht die Datei unbrauchbar, statt sie zu
             schwächen. Das ist der Grund für die AAD.

       Key = PBKDF2-HMAC-SHA256(Passwort, Salt, Iterationen, 32)

   ---------------------------------------------------------------------
   ⚠️ EHRLICH: strongBox schützt gegen Root. Diese Datei schützt gegen
   "Handy weg". Sie ist nur so stark wie das Passwort — deshalb gibt es
   eine Passwort-Bewertung und eine Warnung bei kurzen Passwörtern.
   Wer die Datei UND das Passwort hat, hat die Identität. Das ist bei
   jeder Backup-Lösung so, die den Keystore überleben soll.
   ===================================================================== */

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

object Backup {

    const val MAGIC_TEXT = "MCBK"
    const val VERSION = 1
    const val DEFAULT_ITERATIONS = 310_000       // OWASP-Empfehlung für PBKDF2-SHA256 (2023)
    const val MIN_ITERATIONS = 100_000           // darunter lehnen wir ab
    const val HEADER = 53                        // 4+1+4+32+12
    const val TAG = 16

    data class Header(val version: Int, val iterations: Int, val salt: ByteArray, val nonce: ByteArray)

    class BackupException(message: String) : Exception(message)

    /* ---------------- Passwort-Bewertung ---------------- */

    /**
     * 0 = zu kurz, 1 = schwach, 2 = ok, 3 = gut, 4 = stark.
     * Bewusst einfach und ehrlich: Länge zählt am meisten, aber eine
     * reine Zahlenfolge ist trotzdem schlecht.
     */
    fun passwordScore(pw: CharArray): Int {
        if (pw.size < 8) return 0
        var score = 1
        if (pw.size >= 12) score++
        if (pw.size >= 16) score++
        val hasLetter = pw.any { it.isLetter() }
        val hasDigit = pw.any { it.isDigit() }
        val hasOther = pw.any { !it.isLetterOrDigit() }
        if (hasLetter && hasDigit) score++
        if (hasOther) score++
        // "12345678" oder "aaaaaaaa" nicht schönreden
        if (pw.distinct().size <= 3) score = 1
        return score.coerceAtMost(4)
    }

    fun passwordHint(pw: CharArray): String = when (passwordScore(pw)) {
        0 -> "zu kurz — mindestens 8 Zeichen"
        1 -> "schwach — nimm mehr Zeichen oder ein Wort mehr"
        2 -> "ok — besser: 12+ Zeichen mit Zahl"
        3 -> "gut"
        else -> "stark"
    }

    /* ---------------- Verschlüsseln ---------------- */

    fun seal(
        plaintext: ByteArray,
        password: CharArray,
        iterations: Int = DEFAULT_ITERATIONS,
        salt: ByteArray = randomBytes(32),
        nonce: ByteArray = randomBytes(12),
    ): ByteArray {
        if (password.isEmpty()) throw BackupException("Ohne Passwort kein Backup")
        if (iterations < MIN_ITERATIONS) throw BackupException("Zu wenige Iterationen ($iterations)")
        if (salt.size != 32) throw BackupException("Salt muss 32 Byte sein")
        if (nonce.size != 12) throw BackupException("Nonce muss 12 Byte sein")

        val header = header(iterations, salt, nonce)
        val key = deriveKey(password, salt, iterations)
        try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
            c.updateAAD(header)
            val ct = c.doFinal(plaintext)
            val out = ByteArray(header.size + ct.size)
            System.arraycopy(header, 0, out, 0, header.size)
            System.arraycopy(ct, 0, out, header.size, ct.size)
            return out
        } finally {
            key.fill(0)
        }
    }

    /**
     * Öffnet die Datei. Gibt null zurück bei falschem Passwort, manipulierter
     * Datei oder kaputtem Format — wirft nicht, damit die UI nie abstürzt.
     */
    fun open(file: ByteArray, password: CharArray): ByteArray? {
        val h = peek(file) ?: return null
        if (password.isEmpty()) return null
        val key = try { deriveKey(password, h.salt, h.iterations) } catch (t: Throwable) { return null }
        return try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, h.nonce))
            c.updateAAD(header(h.iterations, h.salt, h.nonce))
            val out = c.doFinal(file, HEADER, file.size - HEADER)
            out
        } catch (t: Throwable) {
            null
        } finally {
            key.fill(0)
        }
    }

    /** Header lesen, ohne Passwort — für „was steckt da drin?" und Formatprüfung. */
    fun peek(file: ByteArray): Header? {
        if (file.size < HEADER + TAG) return null
        if (file[0] != 'M'.code.toByte() || file[1] != 'C'.code.toByte() ||
            file[2] != 'B'.code.toByte() || file[3] != 'K'.code.toByte()) return null
        val ver = file[4].toInt() and 0xFF
        if (ver != VERSION) return null
        val iter = ((file[5].toInt() and 0xFF) shl 24) or ((file[6].toInt() and 0xFF) shl 16) or
            ((file[7].toInt() and 0xFF) shl 8) or (file[8].toInt() and 0xFF)
        if (iter < MIN_ITERATIONS) return null
        return Header(ver, iter, file.copyOfRange(9, 41), file.copyOfRange(41, 53))
    }

    /** Kurzer Fingerabdruck der Datei — zum Vergleichen beim Aufbewahren. */
    fun fingerprint(file: ByteArray): String {
        val d = MessageDigest.getInstance("SHA-256").digest(file)
        return d.copyOfRange(0, 4).joinToString("") { "%02x".format(it) }.uppercase()
    }

    fun sha256(file: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(file).joinToString("") { "%02x".format(it) }

    /* ---------------- Innen ---------------- */

    private fun header(iterations: Int, salt: ByteArray, nonce: ByteArray): ByteArray {
        val h = ByteArray(HEADER)
        h[0] = 'M'.code.toByte(); h[1] = 'C'.code.toByte(); h[2] = 'B'.code.toByte(); h[3] = 'K'.code.toByte()
        h[4] = VERSION.toByte()
        h[5] = (iterations ushr 24).toByte(); h[6] = (iterations ushr 16).toByte()
        h[7] = (iterations ushr 8).toByte(); h[8] = iterations.toByte()
        System.arraycopy(salt, 0, h, 9, 32)
        System.arraycopy(nonce, 0, h, 41, 12)
        return h
    }

    private fun deriveKey(password: CharArray, salt: ByteArray, iterations: Int): ByteArray {
        val spec = PBEKeySpec(password, salt, iterations, 256)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    private fun randomBytes(n: Int): ByteArray = ByteArray(n).also { SecureRandom().nextBytes(it) }
}

/* =====================================================================
   Was in der Datei steht — als eigenes Objekt, damit es testbar ist.
   ===================================================================== */

object BackupPayload {
    const val FORMAT = "maxichat-vault-backup-v1"

    data class Secret(val name: String, val value: String)

    data class Payload(
        val exportedAt: Long,
        val accountId: String,
        val username: String,
        val displayName: String,
        val secrets: List<Secret>,
        val messageCache: Map<String, String>,
    ) {
        fun toJson(): String = buildString {
            append("{\"format\":\"").append(FORMAT).append("\",")
            append("\"version\":1,")
            append("\"exportedAt\":").append(exportedAt).append(',')
            append("\"account\":{")
            append("\"id\":\"").append(esc(accountId)).append("\",")
            append("\"username\":\"").append(esc(username)).append("\",")
            append("\"displayName\":\"").append(esc(displayName)).append("\"}")
            append(",\"secrets\":[")
            secrets.forEachIndexed { i, s ->
                if (i > 0) append(',')
                append("{\"name\":\"").append(esc(s.name)).append("\",\"value\":\"").append(esc(s.value)).append("\"}")
            }
            append("],\"messageCache\":{")
            messageCache.entries.forEachIndexed { i, (k, v) ->
                if (i > 0) append(',')
                append('"').append(esc(k)).append("\":\"").append(esc(v)).append('"')
            }
            append("}}")
        }

        private fun esc(s: String): String = buildString {
            for (ch in s) when (ch) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (ch.code < 0x20) append(String.format("\\u%04x", ch.code)) else append(ch)
            }
        }
    }

    /** Nur für Tests/Anzeige: wie viele Geheimnisse stecken drin (ohne Passwort unmöglich). */
    fun describe(payload: Payload): String =
        "${payload.secrets.size} Geheimnisse · ${payload.messageCache.size} Chats im Klartext-Cache"
}
