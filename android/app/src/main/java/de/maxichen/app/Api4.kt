package de.maxichen.app

import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject

/* =====================================================================
   📦 V4-MODELLE
   ===================================================================== */

data class PollOption(val index: Int, val label: String, val votes: Int, val percent: Int, val mine: Boolean)

data class PollData(
    val id: String, val chatId: String, val question: String, val options: List<PollOption>,
    val multiple: Boolean, val anonymous: Boolean, val closed: Boolean,
    val createdAt: Long, val closesAt: Long, val totalVotes: Int,
    val voted: Boolean, val createdBy: String,
) {
    companion object {
        fun from(j: JSONObject): PollData {
            val oa = j.optJSONArray("options")
            val opts = if (oa == null) emptyList() else (0 until oa.length()).map { i ->
                val o = oa.getJSONObject(i)
                PollOption(o.optInt("index"), o.optString("label"), o.optInt("votes"), o.optInt("percent"), o.optBoolean("mine"))
            }
            return PollData(
                j.optString("id"), j.optString("chatId"), j.optString("question"), opts,
                j.optBoolean("multiple"), j.optBoolean("anonymous"), j.optBoolean("closed"),
                j.optLong("createdAt"), j.optLong("closesAt"), j.optInt("totalVotes"),
                j.optBoolean("voted"), j.optString("createdBy"),
            )
        }
    }
}

data class MomentItem(
    val id: String, val userId: String, val kind: String, val text: String, val data: String,
    val bg: String, val createdAt: Long, val expiresAt: Long, val viewers: Int,
    val reactions: Map<String, String>, val seen: Boolean, val mine: Boolean,
) {
    companion object {
        fun from(j: JSONObject): MomentItem {
            val rj = j.optJSONObject("reactions") ?: JSONObject()
            val map = HashMap<String, String>()
            rj.keys().forEach { map[it] = rj.optString(it) }
            return MomentItem(
                j.optString("id"), j.optString("userId"), j.optString("kind"), j.optString("text"),
                j.optString("data"), j.optString("bg").ifEmpty { "pink-dream" },
                j.optLong("createdAt"), j.optLong("expiresAt"), j.optInt("viewers"),
                map, j.optBoolean("seen"), j.optBoolean("mine"),
            )
        }
    }
}

data class MomentGroup(val userId: String, val user: UserData, val moments: List<MomentItem>, val mine: Boolean, val allSeen: Boolean) {
    companion object {
        fun from(j: JSONObject): MomentGroup {
            val ma = j.optJSONArray("moments")
            val list = if (ma == null) emptyList() else (0 until ma.length()).map { MomentItem.from(ma.getJSONObject(it)) }
            val u = j.optJSONObject("user")
            return MomentGroup(
                j.optString("userId"),
                if (u != null) UserData.from(u) else UserData("", "?", "Unbekannt"),
                list, j.optBoolean("mine"), j.optBoolean("allSeen"),
            )
        }
    }
}

data class ScheduledMsg(
    val id: String, val chatId: String, val chatName: String, val text: String,
    val kind: String, val at: Long, val createdAt: Long,
)

data class SearchHit(
    val chatId: String, val chatName: String, val messageId: String, val text: String,
    val kind: String, val senderName: String, val createdAt: Long,
)

data class ReportRow(
    val id: String, val byName: String, val targetName: String, val targetId: String,
    val reason: String, val text: String, val status: String, val createdAt: Long,
)

data class BlockedUser(val id: String, val username: String, val displayName: String, val avatar: String)

data class SessionRow(val id: String, val current: Boolean, val device: String, val lastSeen: Long, val createdAt: Long)

/* =====================================================================
   📊 POLL-CACHE (live über WebSocket aktualisiert)
   ===================================================================== */

object PollHub {
    private val _byId = MutableStateFlow<Map<String, PollData>>(emptyMap())
    val byId = _byId

    fun upsert(p: PollData) { _byId.value = _byId.value + (p.id to p) }
    fun setAll(list: List<PollData>) { _byId.value = _byId.value + list.associateBy { it.id } }
    fun get(id: String): PollData? = _byId.value[id]
    fun forChat(chatId: String): Map<String, PollData> = _byId.value.filterValues { it.chatId == chatId }
}

/* =====================================================================
   🔌 API V3 + V4
   ===================================================================== */

object Api4 {

    private fun j(vararg pairs: Pair<String, Any?>): JSONObject {
        val o = JSONObject()
        for ((k, v) in pairs) if (v != null) o.put(k, v)
        return o
    }

    /* ---------------- App-Hintergrund ---------------- */

    suspend fun appBackground(): String {
        val b = Api.get("/api/app-background").optJSONObject("background") ?: return "preset|pink-dream"
        return b.optString("type", "preset") + "|" + b.optString("value", "pink-dream")
    }

    suspend fun setAppBackground(type: String, value: String): String {
        val r = Api.post("/api/app-background", j("type" to type, "value" to value))
        val b = r.optJSONObject("background")
        return (b?.optString("type") ?: type) + "|" + (b?.optString("value") ?: value)
    }

    /* ---------------- Chat-Wallpaper ---------------- */

    suspend fun setWallpaper(chatId: String, type: String, value: String, personal: Boolean = false) {
        Api.post("/api/chats/$chatId/wallpaper", j("type" to type, "value" to value, "personal" to personal))
    }

    suspend fun setAutoDelete(chatId: String, hours: Int) {
        Api.post("/api/chats/$chatId/auto-delete", j("hours" to hours))
    }

    /* ---------------- Nachrichten ---------------- */

    suspend fun editMessage(chatId: String, mid: String, text: String): Msg =
        Msg.from(Api.patch("/api/chats/$chatId/messages/$mid", j("text" to text)).optJSONObject("message") ?: JSONObject())

    suspend fun deleteMessage(chatId: String, mid: String) {
        Api.delete("/api/chats/$chatId/messages/$mid")
    }

    suspend fun pinMessage(chatId: String, mid: String): Boolean =
        Api.post("/api/chats/$chatId/messages/$mid/pin").optBoolean("pinned")

    suspend fun forwardMessage(chatId: String, mid: String, targetChatId: String) {
        Api.post("/api/chats/$chatId/messages/$mid/forward", j("toChatId" to targetChatId))
    }

    suspend fun markUnread(chatId: String, mid: String) {
        Api.post("/api/chats/$chatId/messages/$mid/unread")
    }

    suspend fun muteChat(chatId: String, minutes: Int): Long =
        Api.post("/api/chats/$chatId/mute", j("minutes" to minutes)).optLong("mutedUntil")

    suspend fun archiveChat(chatId: String, archived: Boolean): Boolean =
        Api.post("/api/chats/$chatId/archive", j("archived" to archived)).optBoolean("archived")

    /* ---------------- Suche ---------------- */

    suspend fun searchMessages(q: String, chatId: String? = null): List<SearchHit> {
        var path = "/api/search/messages?q=" + java.net.URLEncoder.encode(q, "UTF-8")
        if (!chatId.isNullOrEmpty()) path += "&chatId=" + java.net.URLEncoder.encode(chatId, "UTF-8")
        val ra = Api.get(path).optJSONArray("results") ?: return emptyList()
        return (0 until ra.length()).map { i ->
            val r = ra.getJSONObject(i)
            SearchHit(
                r.optString("chatId"), r.optString("chatName"), r.optString("messageId"),
                r.optString("text"), r.optString("kind"), r.optString("senderName"), r.optLong("createdAt"),
            )
        }
    }

    /* ---------------- Momente ---------------- */

    suspend fun moments(): List<MomentGroup> {
        val ga = Api.get("/api/moments").optJSONArray("groups") ?: return emptyList()
        return (0 until ga.length()).map { MomentGroup.from(ga.getJSONObject(it)) }
    }

    suspend fun postMoment(kind: String, text: String, data: String, bg: String, privacy: String): MomentItem =
        MomentItem.from(
            Api.post("/api/moments", j("kind" to kind, "text" to text, "data" to data, "bg" to bg, "privacy" to privacy))
                .getJSONObject("moment"),
        )

    suspend fun viewMoment(id: String) { try { Api.post("/api/moments/$id/view") } catch (e: Exception) {} }

    suspend fun reactMoment(id: String, emoji: String): Map<String, String> {
        val r = Api.post("/api/moments/$id/react", j("emoji" to emoji)).optJSONObject("reactions") ?: return emptyMap()
        val m = HashMap<String, String>()
        r.keys().forEach { m[it] = r.optString(it) }
        return m
    }

    suspend fun deleteMoment(id: String) { Api.delete("/api/moments/$id") }

    /* ---------------- Umfragen ---------------- */

    suspend fun createPoll(chatId: String, question: String, options: List<String>, multiple: Boolean, anonymous: Boolean): PollData =
        PollData.from(
            Api.post(
                "/api/chats/$chatId/polls",
                j(
                    "question" to question,
                    "options" to JSONArray().apply { options.forEach { put(it) } },
                    "multiple" to multiple, "anonymous" to anonymous,
                ),
            ).getJSONObject("poll"),
        )

    suspend fun chatPolls(chatId: String): List<PollData> {
        val pa = Api.get("/api/chats/$chatId/polls").optJSONArray("polls") ?: return emptyList()
        return (0 until pa.length()).map { PollData.from(pa.getJSONObject(it)) }
    }

    suspend fun vote(chatId: String, pollId: String, option: Int): PollData =
        PollData.from(Api.post("/api/chats/$chatId/polls/$pollId/vote", j("option" to option)).getJSONObject("poll"))

    suspend fun closePoll(chatId: String, pollId: String) {
        Api.post("/api/chats/$chatId/polls/$pollId/close")
    }

    /* ---------------- Geplante Nachrichten ---------------- */

    suspend fun scheduleMessage(chatId: String, text: String, at: Long, kind: String = "text"): Long {
        Api.post("/api/chats/$chatId/messages/schedule", j("text" to text, "at" to at, "kind" to kind))
        return at
    }

    suspend fun scheduled(): List<ScheduledMsg> {
        val sa = Api.get("/api/scheduled").optJSONArray("scheduled") ?: return emptyList()
        return (0 until sa.length()).map { i ->
            val s = sa.getJSONObject(i)
            ScheduledMsg(
                s.optString("id"), s.optString("chatId"), s.optString("chatName"),
                s.optString("text"), s.optString("kind"), s.optLong("at"), s.optLong("createdAt"),
            )
        }
    }

    suspend fun cancelScheduled(id: String) { Api.delete("/api/scheduled/$id") }

    /* ---------------- Blocken / Melden ---------------- */

    suspend fun blocks(): List<BlockedUser> {
        val ba = Api.get("/api/blocks").optJSONArray("blocks") ?: return emptyList()
        return (0 until ba.length()).map { i ->
            val b = ba.getJSONObject(i)
            BlockedUser(b.optString("id"), b.optString("username"), b.optString("displayName"), b.optString("avatar").ifEmpty { "💗" })
        }
    }

    suspend fun block(userId: String): String = Api.post("/api/users/$userId/block").optString("message")
    suspend fun unblock(userId: String): String = Api.delete("/api/users/$userId/block").optString("message")

    suspend fun report(targetId: String, reason: String, text: String, chatId: String = "", messageId: String = "") {
        Api.post("/api/report", j("targetId" to targetId, "reason" to reason, "text" to text, "chatId" to chatId, "messageId" to messageId))
    }

    suspend fun adminReports(): List<ReportRow> {
        val ra = Api.get("/api/admin/reports").optJSONArray("reports") ?: return emptyList()
        return (0 until ra.length()).map { i ->
            val r = ra.getJSONObject(i)
            ReportRow(
                r.optString("id"), r.optString("byName"), r.optString("targetName"), r.optString("targetId"),
                r.optString("reason"), r.optString("text"), r.optString("status"), r.optLong("at"),
            )
        }
    }

    suspend fun resolveReport(id: String) { Api.post("/api/admin/reports/$id/resolve") }

    /* ---------------- 2FA · Sessions · Export · Konto ---------------- */

    /* ---------------- V4.5: E2E / Doppel-Ratchet ---------------- */

    suspend fun publishE2EKeys(
        identityKey: String, signedPrekey: String, prekeySignature: String,
        signingKey: String, oneTimePrekeys: List<Pair<String, String>>,
        /** V4.9: ML-KEM-768-Prekey (1184 Byte, base64) + Signatur */
        pqPrekey: String? = null, pqSignature: String? = null,
    ) {
        val arr = JSONArray()
        oneTimePrekeys.forEach { (id, key) -> arr.put(JSONObject().put("id", id).put("key", key)) }
        val body = JSONObject()
            .put("identityKey", identityKey)
            .put("signedPrekey", signedPrekey)
            .put("prekeySignature", prekeySignature)
            .put("signingKey", signingKey)
            .put("oneTimePrekeys", arr)
        if (pqPrekey != null && pqSignature != null) {
            body.put("pqPrekey", pqPrekey).put("pqSignature", pqSignature)
        }
        Api.post("/api/e2e/keys", body)
    }

    /** V4.9: Wer kann schon Post-Quantum? (nur öffentliche Fakten) */
    suspend fun pqReadiness(): JSONObject = Api.get("/api/e2e/pq-readiness")

    /* ---------------- ✅ V4.12: Verified Badges ---------------- */

    suspend fun badgeKey(): JSONObject = Api.get("/api/badges/key")

    /** eigener Haken; null wenn keiner (oder blockiert wegen fehlendem 2FA) */
    suspend fun myBadge(): Pair<String?, String> {
        val r = Api.get("/api/badges/me")
        return (if (r.isNull("badge")) null else r.optString("badge")) to r.optString("role", "user")
    }

    /** alle Haken in einem Request (für Chat-Listen) */
    suspend fun allBadges(): Map<String, String> {
        val r = Api.get("/api/badges")
        val o = r.optJSONObject("badges") ?: return emptyMap()
        val out = HashMap<String, String>()
        for (k in o.keys()) out[k] = o.optString(k, "")
        return out
    }

    suspend fun badgeFor(userId: String): String? {
        val r = Api.get("/api/badges/" + userId)
        return if (r.isNull("badge")) null else r.optString("badge")
    }

    /* ---------------- 🔢 V4.12: 2FA ---------------- */

    suspend fun totpStatus(): JSONObject = Api.get("/api/auth/2fa")

    /** liefert secret, secretPretty, otpauth */
    suspend fun totpSetup(): JSONObject = Api.post("/api/auth/2fa/setup", JSONObject())

    /** @return Recovery-Codes (nur bei Erfolg) */
    suspend fun totpEnable(code: String): List<String> {
        val r = Api.post("/api/auth/2fa/enable", JSONObject().put("code", code))
        val a = r.optJSONArray("recoveryCodes") ?: return emptyList()
        return (0 until a.length()).map { a.getString(it) }
    }

    suspend fun totpDisable(password: String, code: String) {
        Api.post("/api/auth/2fa/disable", JSONObject().put("password", password).put("code", code))
    }

    suspend fun e2eBundle(userId: String): JSONObject =
        Api.get("/api/e2e/keys/" + userId).getJSONObject("bundle")

    /* ---------------- V4.6: Sender Keys (Gruppen-E2E) ---------------- */

    suspend fun sendSenderKeyEnvelope(chatId: String, to: String, keyId: String, envelope: String) {
        Api.post(
            "/api/chats/" + chatId + "/e2e/senderkey",
            JSONObject().put("to", to).put("keyId", keyId).put("envelope", envelope),
        )
    }

    suspend fun pullSenderKeys(chatId: String): List<Triple<String, String, String>> {
        val res = Api.get("/api/chats/" + chatId + "/e2e/senderkeys")
        val arr = res.optJSONArray("senderKeys") ?: JSONArray()
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Triple(o.optString("fromId"), o.optString("keyId"), o.optString("envelope"))
        }
    }

    suspend fun senderKeyStatus(chatId: String): Pair<List<String>, String> {
        val res = Api.get("/api/chats/" + chatId + "/e2e/senderkey-status")
        val arr = res.optJSONArray("ready") ?: JSONArray()
        return (0 until arr.length()).map { arr.optString(it) } to res.optString("mode")
    }

    suspend fun sendGroupE2E(chatId: String, senderKeyMessage: String): Msg {
        val enc = JSONObject()
            .put("v", 3).put("iv", "group").put("ct", "group").put("tag", "gcm16")
            .put("group", senderKeyMessage)
        val res = Api.post("/api/chats/" + chatId + "/e2e/messages", JSONObject().put("enc", enc))
        return Msg.from(res.getJSONObject("message"))
    }

    suspend fun sendE2E(chatId: String, ratchet: String, iv: String, ct: String): Msg {
        val enc = JSONObject()
            .put("v", 2).put("iv", iv).put("ct", ct).put("tag", "gcm16").put("ratchet", ratchet)
        val res = Api.post("/api/chats/" + chatId + "/e2e/messages", JSONObject().put("enc", enc))
        return Msg.from(res.getJSONObject("message"))
    }

    suspend fun twoFaStatus(): Boolean = Api.get("/api/2fa").optBoolean("enabled")

    suspend fun twoFaSetup(): String = Api.post("/api/2fa/setup").optString("secret")

    suspend fun twoFaEnable(code: String) { Api.post("/api/2fa/enable", j("code" to code)) }

    suspend fun twoFaDisable(code: String) { Api.post("/api/2fa/disable", j("code" to code)) }

    suspend fun sessions(): List<SessionRow> {
        val sa = Api.get("/api/sessions").optJSONArray("sessions") ?: return emptyList()
        return (0 until sa.length()).map { i ->
            val s = sa.getJSONObject(i)
            SessionRow(s.optString("id"), s.optBoolean("current"), s.optString("device"), s.optLong("lastSeen"), s.optLong("createdAt"))
        }
    }

    suspend fun kickSession(id: String) { Api.delete("/api/sessions/$id") }
    suspend fun kickAllSessions(): String = Api.delete("/api/sessions").optString("message")

    suspend fun exportData(): String = Api.get("/api/export").toString(2)

    suspend fun deleteAccount(password: String) { Api.deleteBody("/api/me", j("password" to password)) }

    suspend fun deactivateAccount(password: String, days: Int): String =
        Api.post("/api/me/deactivate", j("password" to password, "days" to days)).optString("message")

    suspend fun reactivate(password: String): String =
        Api.post("/api/me/reactivate", j("password" to password)).optString("message")

    /* ---------------- KI ---------------- */

    suspend fun aiSummary(chatId: String): String =
        Api.post("/api/ai/summary", j("chatId" to chatId)).optString("summary")

    suspend fun aiSuggest(chatId: String): List<String> {
        val sa = Api.post("/api/ai/suggest", j("chatId" to chatId)).optJSONArray("suggestions") ?: return emptyList()
        return (0 until sa.length()).map { sa.getString(it) }
    }

    suspend fun aiTranslate(text: String, to: String = "de"): String =
        Api.post("/api/ai/translate", j("text" to text, "to" to to)).optString("translation")

    /* ---------------- LoveBot ---------------- */

    suspend fun lovebotInfo(): JSONObject = Api.get("/api/lovebot")

    suspend fun lovebotConfig(map: Map<String, Boolean>) {
        val o = JSONObject()
        map.forEach { (k, v) -> o.put(k, v) }
        Api.post("/api/lovebot/config", o)
    }

    suspend fun lovebotInChat(chatId: String, add: Boolean) {
        Api.post("/api/chats/$chatId/lovebot", j("action" to if (add) "add" else "remove"))
    }

    suspend fun adminV4(): JSONObject = Api.get("/api/admin/v4")

    /* =============================================================
       🧊 V4.4 — Multi-Account · 2FA · Sicherheit · Extras
       ============================================================= */

    data class AccountLite(
        val id: String, val username: String, val displayName: String, val avatar: String,
        val phone: String, val verified: Boolean, val active: Boolean,
    ) {
        companion object {
            fun from(o: JSONObject) = AccountLite(
                o.optString("id"), o.optString("username"), o.optString("displayName"),
                o.optString("avatar"), o.optString("phone"),
                o.optBoolean("phoneVerified"), o.optBoolean("active"),
            )
        }
    }

    suspend fun accounts(): Pair<List<AccountLite>, Int> {
        val r = Api.get("/api/accounts")
        val a = r.optJSONArray("accounts")
        val list = if (a == null) emptyList() else (0 until a.length()).map { AccountLite.from(a.getJSONObject(it)) }
        return list to r.optInt("max", 5)
    }

    suspend fun phoneAvailable(phone: String): JSONObject =
        Api.get("/api/accounts/phone-available?phone=" + java.net.URLEncoder.encode(phone, "UTF-8"))

    /** true = SMS raus. wirft ApiError(code="phone_exists") wenn vergeben */
    suspend fun requestSms(phone: String): JSONObject =
        Api.post("/api/accounts/sms/request", j("phone" to phone))

    suspend fun verifySms(phone: String, code: String): String =
        Api.post("/api/accounts/sms/verify", j("phone" to phone, "code" to code)).optString("ticket")

    suspend fun addAccount(ticket: String, phone: String, username: String, displayName: String, password: String): JSONObject =
        Api.post("/api/accounts/add", j("ticket" to ticket, "phone" to phone, "username" to username,
            "displayName" to displayName, "password" to password))

    suspend fun switchAccount(userId: String): String =
        Api.post("/api/accounts/switch", j("userId" to userId)).optString("token")

    suspend fun unlinkAccount(userId: String) = Api.delete("/api/accounts/$userId/link")

    /* ---------------- 2FA (Authenticator-App) ---------------- */

    data class TwoFaStatus(val enabled: Boolean, val pending: Boolean, val secret: String = "", val otpauth: String = "")

    suspend fun twoFa(): TwoFaStatus {
        val r = Api.get("/api/2fa")
        return TwoFaStatus(r.optBoolean("enabled"), r.optBoolean("pending"))
    }

    /** Setup starten (bestehendes twoFaSetup() liefert nur das Secret) */
    suspend fun twoFaStart(): TwoFaStatus {
        val r = Api.post("/api/2fa/setup")
        return TwoFaStatus(false, true, r.optString("secret"), r.optString("otpauth"))
    }

    /* ---------------- Screenshot / Schutz ---------------- */

    suspend fun screenshotProtect(chatId: String, enabled: Boolean): Boolean =
        Api.post("/api/chats/$chatId/screenshot-protect", j("enabled" to enabled)).optBoolean("enabled", enabled)

    suspend fun reportScreenshot(chatId: String) {
        try { Api.post("/api/security/screenshot", j("chatId" to chatId)) } catch (e: Exception) {}
    }

    /* ---------------- Extras ---------------- */

    suspend fun transcribe(chatId: String, msgId: String): String {
        val r = Api.post("/api/chats/$chatId/messages/$msgId/transcribe")
        return r.optJSONObject("transcript")?.optString("text") ?: r.optString("text")
    }

    suspend fun startLiveLocation(chatId: String, lat: Double, lng: Double, minutes: Int = 60) {
        Api.post("/api/chats/$chatId/location/live", j("lat" to lat, "lng" to lng, "minutes" to minutes))
    }

    suspend fun stopLiveLocation(chatId: String) {
        try { Api.post("/api/chats/$chatId/location/stop") } catch (e: Exception) {}
    }

    suspend fun joinGroupCall(chatId: String): JSONObject = Api.post("/api/calls/$chatId/join")

    suspend fun leaveGroupCall(chatId: String) {
        try { Api.post("/api/calls/$chatId/leave") } catch (e: Exception) {}
    }

    suspend fun invite(): Pair<String, String> {
        val r = Api.post("/api/invite")
        return r.optString("code") to r.optString("link")
    }

    suspend fun exportEncrypted(password: String): JSONObject =
        Api.post("/api/export/encrypted", j("password" to password))

    suspend fun themes(): List<String> {
        val r = Api.get("/api/themes")
        val a = r.optJSONArray("themes")
        return if (a == null) emptyList() else (0 until a.length()).map { a.getString(it) }
    }
}
