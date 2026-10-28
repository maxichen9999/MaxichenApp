package de.maxichen.app

/* =====================================================================
   🔑 V4.12 — PIN im Vault ablegen
   ---------------------------------------------------------------------
   Die PIN selbst rechnet `PinLock` (pure Kotlin, getestet). Hier steht
   nur, WO sie liegt: im versiegelten Vault, nie im Klartext.
   Fehlversuche und Sperrzeit liegen daneben — auch versiegelt.
   ===================================================================== */

import android.content.Context
import de.maxichen.app.crypto.PinLock

object PinLockStore {

    private const val PREFS = "maxichat_secure_v45"
    private const val K_PIN = "lock_pin"
    private const val K_FAILS = "lock_fails"
    private const val K_LAST = "lock_last"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun exists(ctx: Context): Boolean =
        !Vault.readSecret(ctx, prefs(ctx), K_PIN).isNullOrBlank()

    fun set(ctx: Context, pin: String): String? {
        PinLock.validate(pin)?.let { return it }
        Vault.writeSecret(ctx, prefs(ctx), K_PIN, PinLock.encode(PinLock.store(pin)))
        resetFails(ctx)
        return null
    }

    fun remove(ctx: Context) {
        Vault.remove(prefs(ctx), K_PIN, K_FAILS, K_LAST)
    }

    /** @return null bei Erfolg, sonst eine Meldung */
    fun verify(ctx: Context, pin: String): String? {
        val p = prefs(ctx)
        val stored = PinLock.decode(Vault.readSecret(ctx, p, K_PIN)) ?: return "Keine PIN gesetzt"
        val fails = Vault.readSecret(ctx, p, K_FAILS)?.toIntOrNull() ?: 0
        val last = Vault.readSecret(ctx, p, K_LAST)?.toLongOrNull() ?: 0L

        val wait = PinLock.lockoutRemaining(fails, last, System.currentTimeMillis())
        if (wait > 0) return "Zu viele Fehlversuche — noch ${PinLock.lockoutText(wait)} warten"

        return if (PinLock.verify(pin, stored)) {
            resetFails(ctx)
            null
        } else {
            val n = fails + 1
            Vault.writeSecret(ctx, p, K_FAILS, n.toString())
            Vault.writeSecret(ctx, p, K_LAST, System.currentTimeMillis().toString())
            val next = PinLock.lockoutRemaining(n, System.currentTimeMillis(), System.currentTimeMillis())
            if (next > 0) "Falsch — ${PinLock.lockoutText(next)} gesperrt" else "Falsch, noch ${3 - n} Versuche"
        }
    }

    fun failCount(ctx: Context): Int =
        Vault.readSecret(ctx, prefs(ctx), K_FAILS)?.toIntOrNull() ?: 0

    private fun resetFails(ctx: Context) {
        val p = prefs(ctx)
        Vault.writeSecret(ctx, p, K_FAILS, "0")
        Vault.writeSecret(ctx, p, K_LAST, "0")
    }
}
