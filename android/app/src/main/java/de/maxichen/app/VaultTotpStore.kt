package de.maxichen.app

/* =====================================================================
   🔢 V4.12 — TOTP-Secret im Tresor
   ---------------------------------------------------------------------
   Wohin gehört das 2FA-Secret? NICHT in die Server-DB (dann liest der
   Server mit) und NICHT in die normalen SharedPreferences (dann liest
   jeder Root-Explorer mit). Sondern:

     · der Server hat seine Kopie (sonst kann er keinen Code prüfen)
     · die App hat ihre eigene Kopie im Vault (StrongBox/TEE + AES-GCM)

   Wozu die App-Kopie, wenn der Server das Secret schon hat? Damit die
   App den Code selbst rechnen kann, wenn du offline bist — und damit du
   im Zweifel nachprüfen kannst, dass dein Secret dasselbe ist.

   WICHTIG: hier wird nur gespeichert. Gerechnet wird in `crypto/Totp`.
   ===================================================================== */

import android.content.Context
import de.maxichen.app.crypto.Totp

object VaultTotpStore {

    private const val PREFS = "maxichat_secure_v45"
    private const val K_SECRET = "totp_secret"
    private const val K_LABEL = "totp_label"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Secret ablegen (Base32, so wie es der Server schickt). */
    fun save(ctx: Context, secret: String, label: String = "MaxiChat") {
        val clean = secret.replace(" ", "").uppercase()
        Vault.writeSecret(ctx, prefs(ctx), K_SECRET, clean)
        Vault.writeSecret(ctx, prefs(ctx), K_LABEL, label)
    }

    fun secret(ctx: Context): String? =
        Vault.readSecret(ctx, prefs(ctx), K_SECRET)?.takeIf { it.isNotEmpty() }

    fun label(ctx: Context): String =
        Vault.readSecret(ctx, prefs(ctx), K_LABEL) ?: "MaxiChat"

    fun clear(ctx: Context) {
        Vault.remove(prefs(ctx), K_SECRET, K_LABEL)
    }

    /**
     * Aktueller Code aus dem Tresor — ohne Server, ohne Netz.
     * @return null, wenn kein Secret liegt (dann gibt es auch keinen Code)
     */
    fun currentCode(ctx: Context, nowMillis: Long = System.currentTimeMillis()): String? {
        val s = secret(ctx) ?: return null
        return totpFromBase32(s, nowMillis)
    }

    /** für Tests / Vorschau: rechnet aus einem mitgegebenen Secret */
    fun totpFromBase32(base32: String, nowMillis: Long): String? {
        val key = try { Totp.base32Decode(base32) } catch (t: Throwable) { return null }
        if (key.isEmpty()) return null
        return Totp.totp(key, nowMillis / 1000)
    }

    /** Sekunden bis zum nächsten Code (für den Ring in der UI). */
    fun secondsLeft(nowMillis: Long = System.currentTimeMillis()): Int =
        Totp.secondsRemaining(nowMillis / 1000)

    /** otpauth-Link zum Abtippen/Teilen — ohne Server-Roundtrip. */
    fun otpauth(ctx: Context, account: String = "konto"): String? {
        val s = secret(ctx) ?: return null
        val key = try { Totp.base32Decode(s) } catch (t: Throwable) { return null }
        if (key.isEmpty()) return null
        return Totp.otpauthUrl(Totp.Config(secret = key, issuer = "MaxiChat", account = account))
    }

    /** Passt ein eingegebener Code zum gespeicherten Secret? (Offline-Prüfung) */
    fun verifyLocally(ctx: Context, code: String, nowMillis: Long = System.currentTimeMillis()): Boolean {
        val s = secret(ctx) ?: return false
        val key = try { Totp.base32Decode(s) } catch (t: Throwable) { return false }
        return Totp.verify(key, code.trim(), nowMillis / 1000, window = 1)
    }
}
