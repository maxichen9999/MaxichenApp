package de.maxichen.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * ✨ LoveAI — KI-Chat mit OpenAI-kompatibler API.
 * Key + Server-URL + Modell speichert die Nutzerin in den Einstellungen (DataStore).
 */
object AiService {
    data class AiMsg(val role: String, val text: String) // "user" | "assistant"

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    private const val SYSTEM_PROMPT =
        "Du bist LoveAI ✨, die süße KI-Assistentin von LoveChat (App von maxi⁹¹⁰). " +
        "Sei herzlich, kawaii, nett und ein bisschen verspielt. Antworte kompakt auf Deutsch. " +
        "Verwende gerne 1-2 Emojis, aber keine langen Texte. Du kannst Hilfe bei Hausaufgaben, " +
        "Ideen, Texten, Übersetzungen und einfach zum Quatschen geben."

    suspend fun chat(history: List<AiMsg>): String = withContext(Dispatchers.IO) {
        if (Hub.aiKey.isEmpty()) throw AiApiError("Kein API-Key hinterlegt 💔")
        val msgs = JSONArray()
        msgs.put(JSONObject().put("role", "system").put("content", SYSTEM_PROMPT))
        history.takeLast(14).forEach {
            msgs.put(JSONObject().put("role", it.role).put("content", it.text))
        }
        val body = JSONObject()
            .put("model", Hub.aiModel)
            .put("messages", msgs)
            .put("max_tokens", 500)
        val req = Request.Builder()
            .url(Hub.aiUrl.trimEnd('/') + "/chat/completions")
            .header("Authorization", "Bearer " + Hub.aiKey)
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) {
                val e = try { JSONObject(text).optJSONObject("error")?.optString("message") } catch (e: Exception) { null }
                throw AiApiError(e ?: "API-Fehler ${resp.code}")
            }
            val j = JSONObject(text)
            j.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content").trim()
        }
    }
}

class AiApiError(msg: String) : Exception(msg)
