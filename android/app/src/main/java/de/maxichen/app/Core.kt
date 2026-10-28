package de.maxichen.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.datastore.core.DataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import org.webrtc.PeerConnectionFactory
import org.webrtc.PeerConnectionFactory.InitializationOptions
import java.util.concurrent.TimeUnit

/* ================= Modell ================= */

data class UserData(
    val id: String, val username: String, val displayName: String,
    val bio: String = "", val avatar: String = "", val phone: String = "",
    val email: String = "", val lastSeen: Long = 0, val online: Boolean = false,
    val bgSound: Boolean = true, val bgDefault: String = "neon-dream",
    val role: String = "user", val owner: Boolean = false, val roleLabel: String = "Benutzer"
) {
    val isOwner: Boolean get() = owner
    val isStaff: Boolean get() = owner || role in listOf("owner", "superadmin", "admin", "moderator", "mod")
    companion object {
        fun from(j: JSONObject): UserData {
            val bg = j.optJSONObject("bg")
            return UserData(
                id = j.optString("id"),
                username = j.optString("username"),
                displayName = j.optString("displayName"),
                bio = j.optString("bio"),
                avatar = j.optString("avatar"),
                phone = j.optString("phone"),
                email = j.optString("email"),
                lastSeen = j.optLong("lastSeen"),
                online = j.optBoolean("online", false),
                bgSound = !j.has("bgSound") || j.optBoolean("bgSound", true),
                bgDefault = bg?.optString("default") ?: "neon-dream",
                role = j.optString("role").ifEmpty { "user" },
                owner = j.optBoolean("owner", false),
                roleLabel = j.optString("roleLabel").ifEmpty { "Benutzer" }
            )
        }
    }
}

data class Wallpaper(val type: String = "default", val value: String = "") {
    companion object {
        fun from(j: JSONObject?): Wallpaper? {
            if (j == null) return null
            val t = j.optString("type")
            if (t.isEmpty() || t == "default") return null
            return Wallpaper(t, j.optString("value"))
        }
    }
}

data class Attach(
    val name: String = "", val url: String = "", val sticker: String = "",
    val size: Long = 0, val duration: Int = 0, val lat: Double = 0.0, val lng: Double = 0.0,
    val pollId: String = "", val viewOnce: Boolean = false
) {
    companion object {
        fun from(j: JSONObject?): Attach? {
            if (j == null) return null
            return Attach(
                name = j.optString("name"), url = j.optString("url"), sticker = j.optString("sticker"),
                size = j.optLong("size"), duration = j.optInt("duration"),
                lat = j.optDouble("lat", 0.0), lng = j.optDouble("lng", 0.0),
                pollId = j.optString("pollId"), viewOnce = j.optBoolean("viewOnce", false)
            )
        }
    }
}

data class ReplyRef(val id: String = "", val senderName: String = "", val text: String = "")
data class PinnedMsg(val id: String = "", val text: String = "", val senderName: String = "")

data class ChatSummary(
    val id: String, val type: String, val name: String, val avatar: String,
    val description: String = "", val ownerId: String = "",
    val communityId: String? = null, val members: List<String> = emptyList(),
    val count: Int = 0, val unread: Int = 0, val bg: String? = null,
    val lastText: String = "", val lastImage: Boolean = false,
    val lastSenderId: String = "", val lastSenderName: String = "",
    val lastCreatedAt: Long = 0,
    val wallpaper: Wallpaper? = null, val autoDelete: Int = 0,
    val mutedUntil: Long = 0, val archived: Boolean = false, val pinned: PinnedMsg? = null
) {
    companion object {
        fun from(j: JSONObject): ChatSummary {
            val last = j.optJSONObject("last")
            val ma = j.optJSONArray("members")
            val members = if (ma == null) emptyList() else (0 until ma.length()).map { ma.getString(it) }
            return ChatSummary(
                id = j.optString("id"), type = j.optString("type"),
                name = j.optString("name"), avatar = j.optString("avatar"),
                description = j.optString("description"), ownerId = j.optString("ownerId"),
                communityId = j.optString("communityId").takeIf { it.isNotEmpty() },
                members = members, count = j.optInt("count"),
                unread = j.optInt("unread"),
                bg = j.optString("bg").takeIf { it.isNotEmpty() },
                lastText = last?.optString("text") ?: "",
                lastImage = last?.optBoolean("image") ?: false,
                lastSenderId = last?.optString("senderId") ?: "",
                lastSenderName = last?.optString("senderName") ?: "",
                lastCreatedAt = last?.optLong("createdAt") ?: 0,
                wallpaper = Wallpaper.from(j.optJSONObject("wallpaper")),
                autoDelete = j.optInt("autoDelete"),
                mutedUntil = j.optLong("mutedUntil"),
                archived = j.optBoolean("archived", false),
                pinned = j.optJSONObject("pinned")?.let {
                    PinnedMsg(it.optString("id"), it.optString("text"), it.optString("senderName"))
                }
            )
        }
    }
}

data class Msg(
    val id: String, val senderId: String, val text: String,
    val image: String?, val createdAt: Long,
    val reactions: Map<String, String>, val readBy: List<String>,
    val kind: String = "text", val attachment: Attach? = null, val replyTo: ReplyRef? = null,
    val editedAt: Long = 0, val deleted: Boolean = false, val pinned: Boolean = false,
    val bot: Boolean = false, val forwarded: Boolean = false, val scheduled: Boolean = false,
    /** V4.5: kompletter Doppel-Ratchet-Umschlag (nur Ciphertext) */
    val enc: String? = null,
    /** V4.6: Gruppen-Nachricht mit Sender Keys (Signatur + Ciphertext) */
    val group: String? = null,
) {
    companion object {
        fun from(j: JSONObject): Msg {
            val rj = j.optJSONObject("reactions") ?: JSONObject()
            val reactions = HashMap<String, String>()
            rj.keys().forEach { reactions[it] = rj.getString(it) }
            val ra = j.optJSONArray("readBy")
            val readBy = if (ra == null) emptyList() else (0 until ra.length()).map { ra.getString(it) }
            return Msg(
                id = j.optString("id"), senderId = j.optString("senderId"),
                text = j.optString("text"),
                image = j.optString("image").takeIf { it.isNotEmpty() },
                createdAt = j.optLong("createdAt"),
                reactions = reactions, readBy = readBy,
                kind = j.optString("kind").ifEmpty { if (j.optString("image").isNotEmpty()) "photo" else "text" },
                attachment = Attach.from(j.optJSONObject("attachment")),
                replyTo = j.optJSONObject("replyTo")?.let {
                    ReplyRef(it.optString("id"), it.optString("senderName"), it.optString("text"))
                },
                editedAt = j.optLong("editedAt"),
                deleted = j.optBoolean("deleted", false),
                pinned = j.optBoolean("pinned", false),
                bot = j.optBoolean("bot", false),
                forwarded = j.optBoolean("forwarded", false),
                enc = j.optJSONObject("enc")?.optString("ratchet")?.takeIf { it.isNotEmpty() },
                group = j.optJSONObject("enc")?.optString("group")?.takeIf { it.isNotEmpty() },
                scheduled = j.optBoolean("scheduled", false)
            )
        }
    }
}

data class ChatDetails(
    val id: String, val type: String, val name: String, val avatar: String,
    val description: String, val ownerId: String, val adminIds: List<String>,
    val communityId: String?, val members: List<UserData>, val groups: List<GroupLite>,
    val wallpaper: Wallpaper? = null, val autoDelete: Int = 0
) {
    companion object {
        fun from(j: JSONObject): ChatDetails {
            val c = j.optJSONObject("chat") ?: j
            val ma = j.optJSONArray("members")
            val members = if (ma == null) emptyList() else (0 until ma.length()).map { UserData.from(ma.getJSONObject(it)) }
            val ga = j.optJSONArray("groups")
            val groups = if (ga == null) emptyList() else (0 until ga.length()).map {
                val g = ga.getJSONObject(it)
                GroupLite(g.optString("id"), g.optString("name"), g.optString("avatar"), g.optInt("count"))
            }
            val aa = c.optJSONArray("adminIds")
            val adminIds = if (aa == null) emptyList() else (0 until aa.length()).map { aa.getString(it) }
            return ChatDetails(
                id = c.optString("id"), type = c.optString("type"),
                name = c.optString("name"), avatar = c.optString("avatar"),
                description = c.optString("description"), ownerId = c.optString("ownerId"),
                adminIds = adminIds,
                communityId = c.optString("communityId").takeIf { it.isNotEmpty() },
                members = members, groups = groups,
                wallpaper = Wallpaper.from(c.optJSONObject("wallpaper")),
                autoDelete = c.optInt("autoDelete")
            )
        }
    }
}

data class GroupLite(val id: String, val name: String, val avatar: String, val count: Int)
data class ChannelLite(val id: String, val name: String, val avatar: String, val description: String, val count: Int)
data class SearchResults(val users: List<UserData>, val channels: List<ChannelLite>)
data class ToastItem(val id: Long, val icon: String, val title: String, val sub: String)

/* ================= API ================= */

class ApiError(val code: Int, val msg: String, val reason: String = "") : Exception(msg)

object Api {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonType: MediaType = "application/json; charset=utf-8".toMediaType()

    private fun newReq(method: String, path: String, body: JSONObject?): Request {
        val url = Hub.serverUrl.trimEnd('/') + path
        val rb = body?.toString()?.toByteArray()?.toRequestBody(jsonType)
        return Request.Builder().url(url).method(method, rb).header("Authorization", "Bearer ${Hub.token}").build()
    }

    private suspend fun call(method: String, path: String, body: JSONObject?): JSONObject = withContext(Dispatchers.IO) {
        val resp: Response = client.newCall(newReq(method, path, body)).execute()
        val text = resp.body?.string() ?: "{}"
        if (!resp.isSuccessful) {
            var msg = "Fehler ${resp.code}"
            var reason = ""
            try {
                val e = JSONObject(text)
                msg = e.optString("error").ifEmpty { msg }
                reason = e.optString("code")
            } catch (ex: Exception) {}
            throw ApiError(resp.code, msg, reason)
        }
        try { JSONObject(text) } catch (e: Exception) { JSONObject() }
    }

    suspend fun get(path: String): JSONObject = call("GET", path, null)
    suspend fun post(path: String, body: JSONObject? = null): JSONObject = call("POST", path, body)
    suspend fun put(path: String, body: JSONObject? = null): JSONObject = call("PUT", path, body)
    suspend fun patch(path: String, body: JSONObject? = null): JSONObject = call("PATCH", path, body)
    suspend fun delete(path: String): JSONObject = call("DELETE", path, null)
    suspend fun deleteBody(path: String, body: JSONObject? = null): JSONObject = call("DELETE", path, body)
}

object ApiCall {
    private fun j(vararg pairs: Pair<String, Any?>): JSONObject {
        val o = JSONObject()
        for ((k, v) in pairs) if (v != null) o.put(k, v)
        return o
    }

    suspend fun register(username: String, displayName: String, password: String, phone: String, email: String, avatar: String) {
        val r = Api.post("/api/register", j("username" to username, "displayName" to displayName, "password" to password, "phone" to phone, "email" to email, "avatar" to avatar))
        Hub.saveToken(r.getString("token"))
    }

    suspend fun login(login: String, password: String) {
        val r = Api.post("/api/login", j("login" to login, "password" to password))
        Hub.saveToken(r.getString("token"))
    }

    suspend fun loginWithTotp(login: String, password: String, totp: String) {
        val r = Api.post("/api/login", j("login" to login, "password" to password, "totp" to totp))
        Hub.saveToken(r.getString("token"))
    }

    suspend fun appeal(username: String, password: String, text: String): String =
        Api.post("/api/appeal", j("username" to username, "password" to password, "text" to text)).optString("message")

    suspend fun logout() {
        try { Api.post("/api/logout") } catch (e: Exception) {}
    }

    suspend fun me(): Pair<UserData, List<ChatSummary>> {
        val r = Api.get("/api/me")
        val u = UserData.from(r.getJSONObject("user"))
        val arr = r.optJSONArray("chats")
        val chats = if (arr == null) emptyList() else (0 until arr.length()).map { ChatSummary.from(arr.getJSONObject(it)) }
            .sortedByDescending { it.lastCreatedAt }
        return u to chats
    }

    suspend fun updateMe(fields: Map<String, Any?>): UserData {
        val r = Api.put("/api/me", j(*fields.map { it.toPair() }.toTypedArray()))
        return UserData.from(r.getJSONObject("user"))
    }

    suspend fun search(q: String): SearchResults {
        val r = Api.get("/api/search?q=" + java.net.URLEncoder.encode(q, "UTF-8"))
        val ua = r.optJSONArray("users")
        val users = if (ua == null) emptyList() else (0 until ua.length()).map { UserData.from(ua.getJSONObject(it)) }
        val ca = r.optJSONArray("channels")
        val channels = if (ca == null) emptyList() else (0 until ca.length()).map {
            val c = ca.getJSONObject(it)
            ChannelLite(c.optString("id"), c.optString("name"), c.optString("avatar"), c.optString("description"), c.optInt("count"))
        }
        return SearchResults(users, channels)
    }

    suspend fun createChat(type: String, userId: String? = null, name: String? = null, description: String = "", avatar: String = "", memberIds: List<String> = emptyList()): ChatSummary {
        val o = j("type" to type, "userId" to userId, "name" to name, "description" to description.ifEmpty { null }, "avatar" to avatar.ifEmpty { null })
        if (memberIds.isNotEmpty()) o.put("memberIds", org.json.JSONArray().apply { memberIds.forEach { put(it) } })
        val r = Api.post("/api/chats", o)
        return ChatSummary.from(r.getJSONObject("summary"))
    }

    suspend fun chatDetails(id: String): ChatDetails = ChatDetails.from(Api.get("/api/chats/$id"))

    suspend fun messages(chatId: String): List<Msg> {
        val r = Api.get("/api/chats/$chatId/messages")
        val arr = r.optJSONArray("messages")
        return if (arr == null) emptyList() else (0 until arr.length()).map { Msg.from(arr.getJSONObject(it)) }
    }

    suspend fun sendMessage(
        chatId: String, text: String, image: String?,
        kind: String = if (image != null) "photo" else "text",
        attachment: JSONObject? = null, replyTo: String? = null
    ): Msg {
        val body = j("text" to text.ifEmpty { null }, "image" to image, "kind" to kind, "replyTo" to replyTo)
        if (attachment != null) body.put("attachment", attachment)
        val r = Api.post("/api/chats/$chatId/messages", body)
        return Msg.from(r.getJSONObject("message"))
    }

    suspend fun read(chatId: String) { try { Api.post("/api/chats/$chatId/read") } catch (e: Exception) {} }
    suspend fun reaction(chatId: String, mid: String, emoji: String) {
        Api.post("/api/chats/$chatId/messages/$mid/reaction", j("emoji" to emoji))
    }
    suspend fun addMember(chatId: String, userId: String): ChatSummary {
        val r = Api.post("/api/chats/$chatId/members", j("userId" to userId))
        return ChatSummary.from(r.getJSONObject("summary"))
    }
    suspend fun leave(chatId: String) { Api.post("/api/chats/$chatId/leave") }
    suspend fun deleteChat(chatId: String) { Api.delete("/api/chats/$chatId") }
    suspend fun joinChannel(chatId: String): ChatSummary {
        val r = Api.post("/api/chats/$chatId/join")
        return ChatSummary.from(r.getJSONObject("summary"))
    }
    suspend fun communityGroup(chatId: String, name: String, description: String): ChatSummary {
        val r = Api.post("/api/chats/$chatId/groups", j("name" to name, "description" to description.ifEmpty { null }))
        return ChatSummary.from(r.getJSONObject("summary"))
    }
    suspend fun setBackground(chatId: String, theme: String?) {
        Api.put("/api/chats/$chatId/background", j("theme" to theme))
    }
}

/* ================= Hub (Zustand + DataStore) ================= */

val HubScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

val KeyToken = stringPreferencesKey("token")
val KeyServer = stringPreferencesKey("serverUrl")
val KeyFav = stringSetPreferencesKey("favorites")
val KeyAiKey = stringPreferencesKey("aiKey")
val KeyAiUrl = stringPreferencesKey("aiUrl")
/* 🧊 V4.4 */
val KeyAccounts = stringPreferencesKey("accounts_v44")
val KeyChatStyle = stringPreferencesKey("chat_style_v44")
val KeySecureChats = stringSetPreferencesKey("secure_chats_v44")

object Hub {
    private var ds: DataStore<Preferences>? = null
    var dataStore: Flow<Preferences> = flowOf(emptyPreferences())

    var token: String = ""
        private set
    var serverUrl: String = "https://maxichen.de"
        private set
    var favorites: Set<String> = emptySet()
        private set
    var aiKey: String = ""
        private set
    var aiUrl: String = "https://api.openai.com/v1"
        private set

    /* 🧊 V4.4 — Multi-Account & Chat-Style als JSON im DataStore */
    var accountsRaw: String = ""
        private set
    var chatStyleRaw: String = ""
        private set
    var secureChats: Set<String> = emptySet()
        private set
    val aiModel = "gpt-4o-mini"

    var chatIdToOpen: String? = null
    var logoutAction: (() -> Unit)? = null

    var dsContext: Context? = null
    private var editScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun init(ctx: Context) {
        val appCtx = ctx.applicationContext
        val source = androidx.datastore.preferences.core.PreferenceDataStoreFactory
            .create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)) { appCtx.preferencesDataStoreFile("lovechat") }
        ds = source
        dataStore = source.data
    }

    suspend fun loadPrefs() {
        try {
            val p = dataStore.first()
            token = p[KeyToken] ?: ""
            serverUrl = p[KeyServer] ?: "https://maxichen.de"
            favorites = p[KeyFav] ?: emptySet()
            aiKey = p[KeyAiKey] ?: ""
            aiUrl = p[KeyAiUrl] ?: "https://api.openai.com/v1"
            accountsRaw = p[KeyAccounts] ?: ""
            chatStyleRaw = p[KeyChatStyle] ?: ""
            secureChats = p[KeySecureChats] ?: emptySet()
        } catch (e: Exception) {}
    }

    private fun edit(block: (androidx.datastore.preferences.core.MutablePreferences) -> Unit) {
        editScope.launch {
            try {
                ds?.updateData { prefs ->
                    val mutable = prefs.toMutablePreferences()
                    block(mutable)
                    mutable
                }
            } catch (e: Exception) {}
        }
    }

    fun saveToken(v: String) { token = v; edit { it[KeyToken] = v } }

    /**
     * 📱 V4.13: Token aus der WhatsApp-Anmeldung übernehmen.
     * Der Server hat ihn gerade frisch ausgestellt — wir legen ihn ab, damit
     * enterApp() gleich danach /api/me damit fragen kann.
     */
    fun adoptToken(v: String) {
        if (v.isBlank()) return
        saveToken(v)   // Api liest Hub.token bei jeder Anfrage
    }

    /* ---- V4.4 Persistenz ---- */
    fun saveAccountsRaw(v: String) { accountsRaw = v; edit { it[KeyAccounts] = v } }
    fun saveChatStyleRaw(v: String) { chatStyleRaw = v; edit { it[KeyChatStyle] = v } }
    fun setSecureChat(chatId: String, on: Boolean) {
        val s = secureChats.toMutableSet()
        if (on) s.add(chatId) else s.remove(chatId)
        secureChats = s
        edit { it[KeySecureChats] = s }
    }
    fun setServerUrl(v: String) { serverUrl = v.trim().trimEnd('/'); edit { it[KeyServer] = serverUrl } }
    fun toggleFavorite(chatId: String) {
        val s = favorites.toMutableSet()
        if (s.contains(chatId)) s.remove(chatId) else s.add(chatId)
        favorites = s
        edit { it[KeyFav] = s }
    }
    fun isFavorite(chatId: String) = favorites.contains(chatId)
    fun setAiSettings(key: String, url: String) {
        aiKey = key.trim()
        aiUrl = url.trim().trimEnd('/')
        edit { it[KeyAiKey] = aiKey; it[KeyAiUrl] = aiUrl }
    }

    private val _user = MutableStateFlow<UserData?>(null)
    val user: StateFlow<UserData?> = _user
    private val _chats = MutableStateFlow<List<ChatSummary>>(emptyList())
    val chats: StateFlow<List<ChatSummary>> = _chats
    private val _online = MutableStateFlow<Set<String>>(emptySet())
    val online: StateFlow<Set<String>> = _online
    private val _activeChatId = MutableStateFlow<String?>(null)
    val activeChatId: StateFlow<String?> = _activeChatId
    private val _messages = MutableStateFlow<Map<String, List<Msg>>>(emptyMap())
    val messages: StateFlow<Map<String, List<Msg>>> = _messages
    private val _details = MutableStateFlow<Map<String, ChatDetails>>(emptyMap())
    val details: StateFlow<Map<String, ChatDetails>> = _details
    private val _typing = MutableStateFlow<Map<String, String>>(emptyMap())
    val typing: StateFlow<Map<String, String>> = _typing
    private val _toasts = MutableStateFlow<List<ToastItem>>(emptyList())
    val toasts: StateFlow<List<ToastItem>> = _toasts

    fun setUser(u: UserData?) { _user.value = u }
    fun setChats(c: List<ChatSummary>) { _chats.value = c }
    fun upsertChat(c: ChatSummary) { _chats.value = (_chats.value.filter { it.id != c.id } + c) }
    fun removeChat(id: String) { _chats.value = _chats.value.filter { it.id != id } }
    fun setUnread(id: String, n: Int) { _chats.value = _chats.value.map { if (it.id == id) it.copy(unread = n) else it } }
    fun setOnline(s: Set<String>) { _online.value = s }
    fun setActiveChat(id: String?) { _activeChatId.value = id }
    fun setMessages(chatId: String, list: List<Msg>) { _messages.value = _messages.value + (chatId to list) }
    fun appendMessage(chatId: String, m: Msg) {
        val list = _messages.value[chatId] ?: emptyList()
        if (list.any { it.id == m.id }) return
        _messages.value = _messages.value + (chatId to (list + m))
    }
    fun setDetails(chatId: String, d: ChatDetails) { _details.value = _details.value + (chatId to d) }
    fun setTyping(chatId: String, name: String?) {
        _typing.value = if (name == null) _typing.value - chatId else _typing.value + (chatId to name)
    }
    fun toast(icon: String, title: String, sub: String = "") {
        _toasts.value = _toasts.value + ToastItem(System.nanoTime(), icon, title, sub)
    }
    fun popToast(id: Long) { _toasts.value = _toasts.value.filterNot { it.id == id } }

    fun reset() {
        _user.value = null; _chats.value = emptyList(); _online.value = emptySet()
        _activeChatId.value = null; _messages.value = emptyMap(); _details.value = emptyMap()
        _typing.value = emptyMap()
    }

    suspend fun enterApp(): Boolean {
        return try {
            val (u, chats) = ApiCall.me()
            _user.value = u
            _chats.value = chats
            true
        } catch (e: Exception) {
            saveToken("")
            _user.value = null
            false
        }
    }

    private fun senderNameFor(chat: ChatSummary, m: Msg): String {
        if (chat.type == "private") return if (m.senderId == _user.value?.id) "Du" else chat.name
        return _details.value[chat.id]?.members?.find { it.id == m.senderId }?.displayName ?: ""
    }

    private fun chatIcon(t: String) = when (t) {
        "group" -> "👥"; "community" -> "🏰"; "channel" -> "📢"; else -> "💬"
    }

    fun handleWsEvent(type: String, d: JSONObject) {
        when (type) {
            "hello" -> {
                val a = d.optJSONArray("online")
                _online.value = if (a == null) emptySet() else (0 until a.length()).map { a.getString(it) }.toSet()
            }
            "connected" -> {
                HubScope.launch { try { val (u, chats) = ApiCall.me(); _user.value = u; _chats.value = chats } catch (e: Exception) {} }
            }
            "message:new" -> {
                val chatId = d.optString("chatId")
                if (chatId.isEmpty()) return
                val m = Msg.from(d.getJSONObject("message"))
                appendMessage(chatId, m)
                val chat = _chats.value.find { it.id == chatId } ?: return
                val sn = senderNameFor(chat, m)
                val preview = if (m.image != null) "📷 Foto" else m.text
                upsertChat(chat.copy(
                    lastText = preview, lastImage = m.image != null,
                    lastSenderId = m.senderId, lastSenderName = sn,
                    lastCreatedAt = m.createdAt,
                    unread = if (chatId == _activeChatId.value) 0 else chat.unread + 1
                ))
                if (chatId != _activeChatId.value) {
                    val icon = chatIcon(chat.type)
                    val title = if (chat.type == "private") chat.name
                        else if (sn.isNotEmpty()) "${chat.name} · $sn" else chat.name
                    val text = if (m.image != null) "📷 Foto" else m.text
                    toast(icon, title, text)
                    if (AppInBg.inBackground) Notifier.notify(icon, title, text, chatId)
                }
            }
            "chat:updated" -> {
                val s = d.optJSONObject("summary")
                if (s != null) upsertChat(ChatSummary.from(s))
            }
            "chat:created" -> {
                val s = d.optJSONObject("summary")
                if (s != null) {
                    upsertChat(ChatSummary.from(s))
                    if (s.optString("id") != _activeChatId.value) toast(chatIcon(s.optString("type")), "Neuer Chat", s.optString("name"))
                }
            }
            "chat:deleted" -> {
                val id = d.optString("chatId")
                removeChat(id)
                if (_activeChatId.value == id) _activeChatId.value = null
            }
            "messages:read" -> {
                val chatId = d.optString("chatId")
                val upTo = d.optLong("upTo")
                val uid = d.optString("userId")
                val list = _messages.value[chatId] ?: return
                val me = _user.value?.id
                val updated = list.map {
                    if (it.senderId == me && it.createdAt <= upTo && !it.readBy.contains(uid)) it.copy(readBy = it.readBy + uid) else it
                }
                _messages.value = _messages.value + (chatId to updated)
            }
            "reaction:new" -> {
                val chatId = d.optString("chatId")
                val list = _messages.value[chatId] ?: return
                val m = Msg.from(d.getJSONObject("message"))
                _messages.value = _messages.value + (chatId to list.map { if (it.id == m.id) m else it })
            }
            "member:added" -> {
                val name = d.optString("name")
                if (name.isNotEmpty()) toast("👋", "Neues Mitglied", name)
            }
            "presence" -> {
                val uid = d.optString("userId")
                val s = _online.value.toMutableSet()
                if (d.optBoolean("online", false)) s.add(uid) else s.remove(uid)
                _online.value = s
            }
            "typing" -> {
                val chatId = d.optString("chatId")
                val name = d.optString("name")
                _typing.value = _typing.value + (chatId to name)
                HubScope.launch { delay(3000); if (_typing.value[chatId] == name) _typing.value = _typing.value - chatId }
            }
            "profile:updated" -> {
                val u = d.optJSONObject("user") ?: return
                val id = u.optString("id")
                _chats.value = _chats.value.map {
                    if (it.type == "private" && it.members.contains(id)) it.copy(name = u.optString("displayName"), avatar = u.optString("avatar").ifEmpty { "💗" }) else it
                }
            }
            "signal" -> {
                // erst das 1:1-Telefon, dann das Mesh (Kinds sind getrennt: "mesh-*")
                CallManager.onSignal(d.optString("chatId"), d.optString("from"), d.optJSONObject("data"))
                CallMesh.onSignal(d.optString("from"), d.optJSONObject("data"))
            }
            "call:peer-joined" -> {
                val p = d.optJSONObject("peer")
                val id = p?.optString("userId") ?: ""
                if (id.isNotEmpty()) {
                    CallMesh.onPeerJoined(d.optString("chatId"), CallMesh.MeshPeer(id, p?.optString("name") ?: ""))
                }
            }
            "call:peer-left" -> CallMesh.onPeerLeft(d.optString("userId"))
            "message:updated", "message:edited" -> {
                val chatId = d.optString("chatId")
                val m = Msg.from(d.optJSONObject("message") ?: return)
                val list = _messages.value[chatId] ?: return
                _messages.value = _messages.value + (chatId to list.map { if (it.id == m.id) m else it })
            }
            "message:deleted" -> {
                val chatId = d.optString("chatId")
                val mid = d.optString("messageId")
                val list = _messages.value[chatId] ?: return
                _messages.value = _messages.value + (chatId to list.map { if (it.id == mid) it.copy(deleted = true, text = "") else it })
            }
            "poll:update" -> {
                val p = d.optJSONObject("poll") ?: return
                PollHub.upsert(PollData.from(p))
            }
            "chat:wallpaper" -> {
                val chatId = d.optString("chatId")
                val w = Wallpaper.from(d.optJSONObject("wallpaper"))
                _chats.value = _chats.value.map { if (it.id == chatId) it.copy(wallpaper = w) else it }
            }
            "moment:reaction" -> {
                toast(d.optString("emoji", "💗"), "Reaktion auf deinen Moment", (d.optJSONObject("from")?.optString("displayName") ?: ""))
            }
            "member:removed" -> {
                val cid = d.optString("chatId")
                if (d.optString("userId") == _user.value?.id) { removeChat(cid); toast("👋", "Chat verlassen", "") }
            }
            "mod:kick" -> {
                val reason = d.optString("reason", "Du wurdest abgemeldet.")
                toast("🚫", "Abgemeldet", reason)
                logoutAction?.invoke()
            }
        }
    }
}

object AppInBg {
    var inBackground: Boolean = true
}

/* ================= WebSocket ================= */

object Ws {
    private val client = OkHttpClient.Builder().pingInterval(25, TimeUnit.SECONDS).build()
    private var ws: WebSocket? = null
    private var retry = 0
    var connected = false
        private set
    var onEvent: ((String, JSONObject) -> Unit)? = null
    private val handler = Handler(Looper.getMainLooper())

    fun connect() {
        if (ws != null || Hub.token.isEmpty()) return
        val u = Hub.serverUrl.trimEnd('/')
        val host = u.substringAfter("://")
        val proto = if (u.startsWith("https")) "wss" else "ws"
        val url = "$proto://$host/ws?token=" + java.net.URLEncoder.encode(Hub.token, "UTF-8")
        val req = Request.Builder().url(url).build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true; retry = 0
                onEvent?.invoke("connected", JSONObject())
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val j = JSONObject(text)
                    onEvent?.invoke(j.optString("type"), j)
                } catch (e: Exception) {}
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                connected = false
                if (ws === webSocket) ws = null
                scheduleReconnect()
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                if (ws === webSocket) ws = null
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        handler.removeCallbacksAndMessages(null)
        if (Hub.token.isEmpty()) return
        val delayMs = minOf(30000L, 1000L * (1L shl minOf(retry, 5)))
        retry++
        handler.postDelayed({ if (ws == null && Hub.token.isNotEmpty()) connect() }, delayMs)
    }

    fun send(type: String, extra: JSONObject = JSONObject()) {
        val j = extra.put("type", type)
        ws?.send(j.toString())
    }

    fun sendSignal(chatId: String, to: String, data: JSONObject) {
        send("signal", JSONObject().put("chatId", chatId).put("to", to).put("data", data))
    }

    fun disconnect() {
        handler.removeCallbacksAndMessages(null)
        try { ws?.close(1000, null) } catch (e: Exception) {}
        ws = null
        connected = false
        retry = 0
    }
}

/* ================= Notifications ================= */

object Notifier {
    private const val CHANNEL = "lovechat_msgs"
    private const val CALL_CHANNEL = "lovechat_calls"
    private const val ID = 42
    private const val CALL_ID = 43
    private lateinit var app: Context

    fun init(context: Context) {
        app = context.applicationContext
        val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val ch = NotificationChannel(CHANNEL, "LoveChat Nachrichten", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "Benachrichtigungen für neue Nachrichten 💗"
        nm.createNotificationChannel(ch)
        val cc = NotificationChannel(CALL_CHANNEL, "LoveChat Anrufe", NotificationManager.IMPORTANCE_HIGH)
        cc.description = "Eingehende Anrufe 📞"
        cc.enableVibration(true)
        nm.createNotificationChannel(cc)
    }

    fun notify(icon: String, title: String, text: String, chatId: String? = null) {
        try {
            val intent = Intent(app, MainActivity::class.java).apply {
                putExtra("openChat", chatId ?: "")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val pi = PendingIntent.getActivity(app, 1000, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(app, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            (app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID, n)
        } catch (e: Exception) {}
    }

    fun callNotify(title: String, text: String) {
        try {
            val n = NotificationCompat.Builder(app, CALL_CHANNEL)
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            (app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(CALL_ID, n)
        } catch (e: Exception) {}
    }

    fun stop() {
        try {
            val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(ID)
        } catch (e: Exception) {}
    }
}

/* ================= Foreground-Service ================= */

class ConnectService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Ws.onEvent = { type, data -> Hub.handleWsEvent(type, data) }
        startForegroundCompat()
        Ws.connect()
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val ch = NotificationChannel("lovechat_service", "LoveChat verbunden", NotificationManager.IMPORTANCE_MIN)
        nm.createNotificationChannel(ch)
        val n = NotificationCompat.Builder(this, "lovechat_service")
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("LoveChat")
            .setContentText("Verbunden 💗")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, n)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        Ws.disconnect()
        Ws.onEvent = null
        super.onDestroy()
    }
}

/* ================= App ================= */

class LoveChatApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Hub.init(this)
        Notifier.init(this)
        CallManager.init(this)
        try {
            val opts = InitializationOptions.builder(this)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
            PeerConnectionFactory.initialize(opts)
        } catch (e: Exception) {}
        runBlocking { Hub.loadPrefs() }
    }
}
