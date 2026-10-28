package de.maxichen.app

/* =====================================================================
   📱 V4.13 — die fünf Server-Aufrufe der WhatsApp-Anmeldung
   ---------------------------------------------------------------------
   Bewusst eine eigene Datei: dieser Weg hat nichts mit dem eingeloggten
   Zustand zu tun (kein Token nötig), und er soll nicht versehentlich
   mit den normalen Api4-Aufrufen vermischt werden.

   Der Code steht NIE in einer Antwort — nur der Nutzer bekommt ihn,
   per WhatsApp bzw. per Mail. Deshalb gibt es hier auch keine Methode,
   die einen Code zurückgibt.
   ===================================================================== */

import org.json.JSONObject

object Api4Signup {

    /** ① Nummer → Code per WhatsApp */
    suspend fun requestCode(phone: String): JSONObject =
        Api.post("/api/auth/request-code", JSONObject().put("phone", phone))

    /** ② Code → signupToken (30 Min gültig, an die Nummer gebunden) */
    suspend fun verifyCode(phone: String, code: String): String {
        val r = Api.post("/api/auth/verify-code", JSONObject().put("phone", phone).put("code", code))
        val t = r.optString("signupToken", "")
        if (t.isEmpty()) throw ApiError(500, "Server hat keinen Sitzungsschlüssel geschickt")
        return t
    }

    /** ③ Kontoname + Anzeigename + Bild */
    suspend fun saveProfile(signupToken: String, username: String, displayName: String, avatar: String): JSONObject =
        Api.post(
            "/api/auth/profile",
            JSONObject()
                .put("signupToken", signupToken)
                .put("username", username)
                .put("displayName", displayName)
                .put("avatar", avatar),
        )

    /** ④ E-Mail → Code per Mail */
    suspend fun requestEmailCode(signupToken: String, email: String): JSONObject =
        Api.post("/api/auth/request-email-code", JSONObject().put("signupToken", signupToken).put("email", email))

    /** ⑤ Mail-Code → fertiges Konto, Token für die App */
    suspend fun finish(signupToken: String, code: String): String {
        val r = Api.post("/api/auth/verify-email", JSONObject().put("signupToken", signupToken).put("code", code))
        val t = r.optString("token", "")
        if (t.isEmpty()) throw ApiError(500, "Server hat keinen Login-Token geschickt")
        return t
    }

    /** Diagnose für den Entwickler-Modus: läuft pair.js? ist SMTP da? */
    suspend fun health(): JSONObject = Api.get("/api/auth/signup-health")
}
