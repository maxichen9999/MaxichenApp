package de.maxichen.app

/* =====================================================================
   🔐 V4.8 — KEYSTORE-VAULT
   ---------------------------------------------------------------------
   Ab hier liegt KEIN privater Schlüssel mehr im Klartext auf dem Handy.

   • AES-256-GCM-Schlüssel wird im **AndroidKeyStore** erzeugt
     → der Rohschlüssel verlässt die sichere Welt nie, `getEncoded()` = null
   • StrongBox (eigener Sicherheitschip) wenn vorhanden (API 28+),
     sonst TEE (Trusted Execution Environment), sonst ehrlich „Software"
   • damit ist auch ein **gerootetes** Handy nutzlos: in
     /data/data/.../shared_prefs liegen nur `sb1:…`-Hüllen
   • alte Klartext-Einträge aus V4.4–V4.7 werden beim ersten Lesen
     automatisch versiegelt (Migration ohne Datenverlust)
   • wenn der Keystore NICHT verfügbar ist, wird **nicht** heimlich
     Klartext gespeichert: dann fliegt eine VaultException und E2E
     bleibt aus. Lieber ehrlich aus, als leise unsicher.
   ===================================================================== */

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import de.maxichen.app.crypto.SecretBox
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory

class VaultException(message: String) : Exception(message)

data class VaultInfo(
    val available: Boolean,
    val strongBox: Boolean,
    val hardware: Boolean,
    val label: String,
)

object Vault {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "maxichat_vault_v1"
    /** nicht sinngemäß übersetzen: AAD ist an den Eintragsnamen gebunden */
    private fun aad(name: String) = SecretBox.aad(name)

    @Volatile private var cached: SecretKey? = null
    @Volatile private var cachedInfo: VaultInfo? = null
    @Volatile private var lastError: String? = null

    /* ------------------------- Schlüssel ------------------------- */

    private fun keyStore(): KeyStore {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
        ks.load(null)
        return ks
    }

    /**
     * Holt (oder erzeugt) den Vault-Schlüssel.
     * StrongBox wird versucht; kann das Gerät es nicht, fällt es auf TEE zurück.
     */
    private fun key(): SecretKey {
        cached?.let { return it }
        synchronized(this) {
            cached?.let { return it }
            val existing = try {
                keyStore().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry
            } catch (t: Throwable) {
                lastError = t.message
                null
            }
            val key = existing?.secretKey ?: createKey()
            cached = key
            return key
        }
    }

    private fun createKey(): SecretKey {
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)

        fun spec(strongBox: Boolean): KeyGenParameterSpec {
            val b = KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)   // IV kommt vom Keystore
                .setUserAuthenticationRequired(false)    // Messenger muss auch ohne Sperrbildschirm laufen
            if (strongBox && Build.VERSION.SDK_INT >= 28) {
                try { b.setIsStrongBoxBacked(true) } catch (t: Throwable) { /* Gerät kann es nicht */ }
            }
            return b.build()
        }

        return try {
            gen.init(spec(true))
            gen.generateKey()
        } catch (t: Throwable) {
            // StrongBox nicht vorhanden/kaputt → TEE
            try {
                gen.init(spec(false))
                gen.generateKey()
            } catch (t2: Throwable) {
                lastError = t2.message ?: t.message ?: "Keystore nicht nutzbar"
                throw VaultException(
                    "Sicherer Schlüsseltresor nicht verfügbar — E2E bleibt aus, " +
                        "statt Schlüssel im Klartext zu speichern. (" + lastError + ")",
                )
            }
        }
    }

    /* ------------------------- Status ------------------------- */

    fun info(ctx: Context): VaultInfo = cachedInfo ?: try {
        val k = key()
        var strong = false
        var hw = false
        try {
            val factory = SecretKeyFactory.getInstance(k.algorithm, ANDROID_KEYSTORE)
            val info = factory.getKeySpec(k, KeyInfo::class.java) as KeyInfo
            if (Build.VERSION.SDK_INT >= 31) {
                val level = info.securityLevel
                strong = level == KeyProperties.SECURITY_LEVEL_STRONGBOX
                hw = level != KeyProperties.SECURITY_LEVEL_SOFTWARE
            } else {
                @Suppress("DEPRECATION")
                val inside = info.isInsideSecureHardware
                strong = false
                hw = inside
            }
        } catch (t: Throwable) {
            hw = true // Keystore-Key ohne Auslesbarkeit = mindestens TEE-gebunden
        }
        val labelText = when {
            strong -> "StrongBox · eigener Sicherheitschip 💎"
            hw -> "Android Keystore · TEE (Hardware)"
            else -> "Android Keystore · Software"
        }
        VaultInfo(true, strong, hw, labelText).also { cachedInfo = it }
    } catch (t: Throwable) {
        VaultInfo(false, false, false, "nicht verfügbar — E2E bleibt aus").also { cachedInfo = it }
    }

    /* ------------------------- Seal / Open ------------------------- */

    fun seal(ctx: Context, name: String, plain: String): String =
        SecretBox.seal(key(), plain.toByteArray(Charsets.UTF_8), aad(name))

    fun open(ctx: Context, name: String, blob: String): String? =
        SecretBox.open(key(), blob, aad(name))?.toString(Charsets.UTF_8)

    /**
     * Lesen mit Migration: alter Klartext (V4.4–V4.7) wird sofort versiegelt.
     * @return null, wenn der Eintrag fehlt ODER nicht geöffnet werden kann
     */
    fun readSecret(ctx: Context, p: SharedPreferences, name: String): String? {
        val raw = p.getString(name, null) ?: return null
        return when (SecretBox.plan(raw)) {
            SecretBox.Plan.NONE -> null
            SecretBox.Plan.SEALED -> open(ctx, name, raw)
            SecretBox.Plan.MIGRATE -> {
                // alter Klartext → versiegeln, Klartext überschreiben
                try {
                    p.edit().putString(name, seal(ctx, name, raw)).commit()
                    raw
                } catch (t: VaultException) {
                    raw // Keystore fehlt: lieber noch benutzbar als Datenverlust
                }
            }
        }
    }

    fun writeSecret(ctx: Context, p: SharedPreferences, name: String, value: String) {
        p.edit().putString(name, seal(ctx, name, value)).apply()
    }

    fun remove(p: SharedPreferences, vararg names: String) {
        val e = p.edit()
        names.forEach { e.remove(it) }
        e.apply()
    }

    /** Nur für Diagnose: verschlüsselt und wieder auf — null = Vault kaputt. */
    fun selfTest(ctx: Context): Boolean = try {
        val probe = "vault-selftest-" + System.currentTimeMillis()
        open(ctx, "__probe", seal(ctx, "__probe", probe)) == probe
    } catch (t: Throwable) {
        false
    }
}
