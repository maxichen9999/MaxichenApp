package de.maxichen.app

/* =====================================================================
   💾 V4.10 — Backup-Dienst: der Teil, der die Lücke schließt
   ---------------------------------------------------------------------
   V4.8 hat den Schlüssel in den Keystore gesteckt -> nicht exportierbar
   -> nach Gerätewechsel sind alte Nachrichten weg. Das war Absicht.

   Hier wird genau dafür eine Tür gebaut, und sie hat drei Regeln:

     1. Die Geheimnisse gehen NIE an den Server. Alles passiert auf dem
        Gerät: Vault aufmachen -> Backup-Passwort -> Datei.
     2. Die Datei prüft sich selbst: nach dem Schreiben wird sie sofort
        wieder geöffnet und mit dem Original verglichen. Ist sie kaputt,
        erfährst du es JETZT und nicht in zwei Jahren.
     3. Beim Zurückspielen werden die Einträge wieder in den Vault
        versiegelt — mit dem Keystore DIESES Geräts. Das Backup enthält
        also nie wieder Klartext auf der Platte.

   ⚠️ Ehrlich: die Datei ist nur so stark wie das Passwort. Wer Datei
   und Passwort hat, hat die Identität. Deshalb gibt es eine Bewertung
   und eine Warnung — aber keine Lüge.
   ===================================================================== */

import android.content.Context
import de.maxichen.app.crypto.Backup
import de.maxichen.app.crypto.BackupPayload
import de.maxichen.app.crypto.SecretBox

object BackupService {

    private const val PREFS = "maxichat_secure_v45"

    data class ExportResult(
        val bytes: ByteArray,
        val secrets: Int,
        val chats: Int,
        val fingerprint: String,
        val sha256: String,
        val selfCheckOk: Boolean,
    )

    data class RestoreResult(
        val secrets: Int,
        val chats: Int,
        val account: String,
        val exportedAt: Long,
    )

    class BackupServiceException(message: String) : Exception(message)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Sammelt alle versiegelten Einträge aus dem Vault, entschlüsselt sie kurz
     * im RAM und packt sie in einen Backup-Container.
     *
     * @param includeMessages auch den lokalen Klartext-Cache (plain_<chatId>) mitnehmen
     */
    fun export(
        ctx: Context,
        password: CharArray,
        includeMessages: Boolean,
        accountId: String,
        username: String,
        displayName: String,
    ): ExportResult {
        if (Backup.passwordScore(password) == 0) {
            throw BackupServiceException("Passwort zu schwach — mindestens 8 Zeichen")
        }
        val p = prefs(ctx)
        val secrets = ArrayList<BackupPayload.Secret>()
        val cache = LinkedHashMap<String, String>()

        for ((k, v) in p.all) {
            if (v !is String) continue
            if (!SecretBox.isSealed(v)) continue           // nur echte Vault-Einträge
            val isCache = k.startsWith("plain_")
            if (isCache && !includeMessages) continue
            val plain = try { Vault.open(ctx, k, v) } catch (t: Throwable) { null } ?: continue
            if (isCache) cache[k.removePrefix("plain_")] = plain
            else secrets += BackupPayload.Secret(k, plain)
        }

        if (secrets.isEmpty()) {
            throw BackupServiceException("Der Tresor ist leer — es gibt nichts zu sichern")
        }

        val payload = BackupPayload.Payload(
            exportedAt = System.currentTimeMillis(),
            accountId = accountId,
            username = username,
            displayName = displayName,
            secrets = secrets,
            messageCache = cache,
        ).toJson().toByteArray(Charsets.UTF_8)

        val file = Backup.seal(payload, password)

        // 🔍 Selbstprüfung: sofort wieder öffnen und vergleichen.
        //    Eine Datei, die sich nicht öffnen lässt, ist schlimmer als keine.
        val selfCheck = Backup.open(file, password)

        return ExportResult(
            bytes = file,
            secrets = secrets.size,
            chats = cache.size,
            fingerprint = Backup.fingerprint(file),
            sha256 = Backup.sha256(file),
            selfCheckOk = selfCheck != null && selfCheck.contentEquals(payload),
        )
    }

    /** Header lesen, ohne Passwort — für „Datei ausgewählt, was ist das?" */
    fun inspect(bytes: ByteArray): Backup.Header? = Backup.peek(bytes)

    /**
     * Spielt ein Backup zurück. Die Einträge werden SOFORT wieder in den
     * Vault dieses Geräts versiegelt — nie im Klartext gespeichert.
     */
    fun restore(ctx: Context, bytes: ByteArray, password: CharArray): RestoreResult {
        val raw = Backup.open(bytes, password)
            ?: throw BackupServiceException("Falsches Passwort oder beschädigte Datei 🛑")
        val json = String(raw, Charsets.UTF_8)
        if (!json.contains(BackupPayload.FORMAT)) {
            throw BackupServiceException("Das ist kein MaxiChat-Backup")
        }
        val obj = org.json.JSONObject(json)
        val acc = obj.optJSONObject("account")
        val p = prefs(ctx)
        var restored = 0

        val arr = obj.optJSONArray("secrets") ?: org.json.JSONArray()
        for (i in 0 until arr.length()) {
            val s = arr.getJSONObject(i)
            val name = s.optString("name")
            val value = s.optString("value")
            if (name.isEmpty()) continue
            try {
                Vault.writeSecret(ctx, p, name, value)   // versiegelt mit DIESEM Gerät
                restored++
            } catch (t: Throwable) {
                throw BackupServiceException("Tresor dieses Geräts antwortet nicht — Abbruch bei Eintrag $name")
            }
        }
        p.edit().commit()

        val cache = obj.optJSONObject("messageCache") ?: org.json.JSONObject()
        var chats = 0
        for (key in cache.keys()) {
            try {
                Vault.writeSecret(ctx, p, "plain_$key", cache.optString(key, "{}"))
                chats++
            } catch (t: Throwable) { /* einzelner Cache-Eintrag darf fehlen */ }
        }
        p.edit().commit()

        // neue Schlüssel müssen erneut veröffentlicht werden
        p.edit().putBoolean("published_v2", false).putBoolean("published_pq", false).commit()
        SecureChat.invalidateCache()

        return RestoreResult(
            secrets = restored,
            chats = chats,
            account = acc?.optString("displayName") ?: "",
            exportedAt = obj.optLong("exportedAt", 0),
        )
    }

    /** Dateiname im Schema maxichat-backup-2026-10-24-15h30.mcbk */
    fun fileName(): String {
        val d = java.util.Calendar.getInstance()
        fun two(v: Int) = if (v < 10) "0$v" else "$v"
        return "maxichat-backup-" + d.get(java.util.Calendar.YEAR) + "-" +
            two(d.get(java.util.Calendar.MONTH) + 1) + "-" + two(d.get(java.util.Calendar.DAY_OF_MONTH)) + "-" +
            two(d.get(java.util.Calendar.HOUR_OF_DAY)) + "h" + two(d.get(java.util.Calendar.MINUTE)) + ".mcbk"
    }

    fun humanSize(bytes: Int): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
}
