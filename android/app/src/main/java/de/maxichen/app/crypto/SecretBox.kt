package de.maxichen.app.crypto

/* =====================================================================
   🔒 V4.8 — SECRETBOX: Hülle fürprivate Schlüssel
   ---------------------------------------------------------------------
   Jeder private Schlüssel (Identität, Signing, Prekeys, Ratchet-Sessions,
   Sender-Keys) wird NIE im Klartext gespeichert, sondern in dieser Hülle:

        sb1:<iv-base64>:<ciphertext+tag-base64>

   • AES-256-GCM, 12-Byte-IV, 128-Bit-Tag
   • der IV wird IMMER vom Cipher erzeugt (AndroidKeyStore verlangt das
     bei `setRandomizedEncryptionRequired(true)` — eigener IV → Fehler)
   • AAD bindet den Eintrag an seinen Namen (z. B. "ik_priv"), damit
     niemand einen Ciphertext an eine andere Stelle kleben kann
   • arbeitet auf javax.crypto.SecretKey → derselbe Code läuft
       - auf dem Gerät mit einem NICHT exportierbaren Keystore-Key
       - im JVM-Test mit einem SecretKeySpec
     Deshalb ist dieser Teil hier wirklich testbar.
   ===================================================================== */

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object SecretBox {
    const val PREFIX = "sb1:"
    private const val IV_LEN = 12
    private const val TAG_BITS = 128

    val rnd = SecureRandom()

    fun isSealed(v: String?): Boolean = v != null && v.startsWith(PREFIX)

    /** Verschlüsselt. Der IV kommt vom Cipher (Keystore-kompatibel). */
    fun seal(key: SecretKey, plain: ByteArray, aad: ByteArray = ByteArray(0)): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key)
        if (aad.isNotEmpty()) c.updateAAD(aad)
        val ct = c.doFinal(plain)
        val iv = c.iv                       // ← vom Cipher, nicht selbst gewürfelt
        require(iv != null && iv.size in 12..16) { "Keystore lieferte keinen brauchbaren IV" }
        return PREFIX + Crypto.b64(iv) + ":" + Crypto.b64(ct)
    }

    /** Öffnet. Gibt null zurück, wenn manipuliert/falscher Schlüssel/kaputtes Format. */
    fun open(key: SecretKey, blob: String, aad: ByteArray = ByteArray(0)): ByteArray? {
        if (!blob.startsWith(PREFIX)) return null
        val rest = blob.removePrefix(PREFIX)
        val sep = rest.indexOf(':')
        if (sep <= 0) return null
        return try {
            val iv = Crypto.unb64(rest.substring(0, sep))
            val ct = Crypto.unb64(rest.substring(sep + 1))
            if (iv.size < 12 || ct.size < 16) return null
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
            if (aad.isNotEmpty()) c.updateAAD(aad)
            c.doFinal(ct)
        } catch (t: Throwable) {
            null
        }
    }

    /* ---------------- Migration alter Klartext-Einträge ---------------- */

    enum class Plan {
        /** Eintrag fehlt → nichts tun */
        NONE,
        /** alter Klartext (V4.4–V4.7) → jetzt versiegeln */
        MIGRATE,
        /** schon versiegelt → nur öffnen */
        SEALED,
    }

    /** Reine Entscheidungslogik — ohne Android, deshalb JVM-testbar. */
    fun plan(raw: String?): Plan = when {
        raw == null -> Plan.NONE
        raw.startsWith(PREFIX) -> Plan.SEALED
        else -> Plan.MIGRATE
    }

    /** Für Tests: Software-Key (auf dem Gerät macht das der AndroidKeyStore). */
    fun softwareKey(seed: ByteArray = rnd.generateSeed(32)): SecretKey =
        SecretKeySpec(seed.copyOf(32), "AES")

    /** AAD ist der Eintragsname — verhindert Umsetzen eines Ciphertexts. */
    fun aad(name: String): ByteArray = ("maxichat-vault-v1:" + name).toByteArray(Charsets.UTF_8)
}
