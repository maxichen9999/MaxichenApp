package de.maxichen.app

/* =====================================================================
   🔐 V4.5 — SECURECHAT: Doppel-Ratchet im echten Chat
   ---------------------------------------------------------------------
   Was dieses File macht (kein Fake, alles echt):
   • beim ersten Start: X25519-Identität + signierter Prekey (ECDSA P-256)
     + 20 Einmal-Prekeys erzeugen und an den Server veröffentlichen
     (der Server sieht NUR öffentliche Schlüssel)
   • pro Chat eine Ratchet-Session (in SharedPreferences gespeichert)
   • erste Nachricht = X3DH-PreKey-Init, danach reiner Doppel-Ratchet
   • Klartext wird NUR lokal gespeichert (Cache) — im Server liegt nur
     der Ciphertext-Umschlag
   Ehrlich: Gruppen-E2E (Sender-Keys) ist noch nicht drin, nur 1:1.
   ===================================================================== */

import android.content.Context
import de.maxichen.app.crypto.Crypto
import de.maxichen.app.crypto.Curve25519
import de.maxichen.app.crypto.DoubleRatchet
import de.maxichen.app.crypto.Envelope
import de.maxichen.app.crypto.MlKem768
import de.maxichen.app.crypto.Pqxdh
import de.maxichen.app.crypto.PreKeyInit
import de.maxichen.app.crypto.SenderKeyDistribution
import de.maxichen.app.crypto.SenderKeyMessage
import de.maxichen.app.crypto.SenderKeyState
import de.maxichen.app.crypto.X3DH
import org.json.JSONObject

object SecureChat {
    private const val PREFS = "maxichat_secure_v45"
    private const val OPK_COUNT = 20
    private const val CACHE_MAX = 500

    class Identity(
        val ikPriv: ByteArray, val ikPub: ByteArray,
        val signPriv: ByteArray, val signPub: ByteArray,
        val spkPriv: ByteArray, val spkPub: ByteArray, val spkSig: ByteArray, val spkId: String,
        val opks: List<Triple<String, ByteArray, ByteArray>>,   // id, priv, pub
        // 🌌 V4.9: ML-KEM-768 (FIPS 203) — null bei alten Installationen
        val pqPriv: ByteArray? = null, val pqPub: ByteArray? = null, val pqSig: ByteArray? = null,
    )

    @Volatile private var cached: Identity? = null

    /** 💾 V4.10: nach einem Restore muss die Identität neu aus dem Vault gelesen werden. */
    fun invalidateCache() { cached = null }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /* ------------------------- Identität ------------------------- */

    fun identity(ctx: Context): Identity {
        cached?.let { return it }
        val p = prefs(ctx)
        // 🔐 V4.8: private Teile liegen im Keystore-Tresor (sb1:…), alte Klartext-Einträge werden migriert
        val ikPriv = Vault.readSecret(ctx, p, "ik_priv")
        if (ikPriv == null) {
            val id = generate()
            saveIdentity(ctx, p, id)
            cached = id
            return id
        }
        fun need(name: String): String =
            Vault.readSecret(ctx, p, name) ?: throw IllegalStateException("Schlüssel '$name' nicht lesbar — Tresor neu?")

        val opksRaw = Vault.readSecret(ctx, p, "opks") ?: ""
        val opks = opksRaw.split(";").filter { it.isNotEmpty() }.map { row ->
            val f = row.split(",")
            Triple(f[0], Crypto.unb64(f[1]), Crypto.unb64(f[2]))
        }
        val id = Identity(
            ikPriv = Crypto.unb64(ikPriv),
            ikPub = Crypto.unb64(need("ik_pub")),
            signPriv = Crypto.unb64(need("sign_priv")),
            signPub = Crypto.unb64(need("sign_pub")),
            spkPriv = Crypto.unb64(need("spk_priv")),
            spkPub = Crypto.unb64(need("spk_pub")),
            spkSig = Crypto.unb64(need("spk_sig")),
            spkId = Vault.readSecret(ctx, p, "spk_id") ?: "1",
            opks = opks,
            pqPriv = Vault.readSecret(ctx, p, "pq_priv")?.let { Crypto.unb64(it) },
            pqPub = Vault.readSecret(ctx, p, "pq_pub")?.let { Crypto.unb64(it) },
            pqSig = Vault.readSecret(ctx, p, "pq_sig")?.let { Crypto.unb64(it) },
        )
        cached = id
        // V4.9: alte Installation (V4.8 oder früher) bekommt hier ihren PQ-Schlüssel
        // nachgereicht — einmalig, beim nächsten Start ist alles da.
        if (id.pqPub == null || id.pqPriv == null || id.pqSig == null) {
            val (pqEk, pqDk) = MlKem768.keygenRandom()
            val sig = Crypto.sign(Crypto.privateFromBytes(id.signPriv), pqEk)
            val neu = Identity(
                id.ikPriv, id.ikPub, id.signPriv, id.signPub,
                id.spkPriv, id.spkPub, id.spkSig, id.spkId, id.opks,
                pqPriv = pqDk, pqPub = pqEk, pqSig = sig,
            )
            saveIdentity(ctx, p, neu)
            p.edit().putBoolean("published_pq", false).commit()
            cached = neu
            return neu
        }
        return id
    }

    private fun generate(): Identity {
        val (ikPriv, ikPub) = Curve25519.pair()
        val (spkPriv, spkPub) = Curve25519.pair()
        val signKp = Crypto.newSigningKeyPair()
        val signPriv = Crypto.privateToBytes(signKp.private)
        val signPub = Crypto.publicToBytes(signKp.public)
        val sig = Crypto.sign(signKp.private, spkPub)
        val opks = (1..OPK_COUNT).map { i ->
            val (pr, pu) = Curve25519.pair()
            Triple(i.toString(), pr, pu)
        }
        // V4.9: Gitterschlüssel (ML-KEM-768) + Signatur mit demselben Prüfschlüssel
        val (pqEk, pqDk) = MlKem768.keygenRandom()
        val pqSig = Crypto.sign(signKp.private, pqEk)
        return Identity(
            ikPriv = ikPriv, ikPub = ikPub,
            signPriv = signPriv, signPub = signPub,
            spkPriv = spkPriv, spkPub = spkPub, spkSig = sig, spkId = "1",
            opks = opks,
            pqPriv = pqDk, pqPub = pqEk, pqSig = pqSig,
        )
    }

    /** Alles rund um die Identität — komplett versiegelt (auch die öffentlichen Teile, ist billiger als Sonderfälle). */
    private fun saveIdentity(ctx: Context, p: android.content.SharedPreferences, id: Identity) {
        val e = p.edit()
        Vault.seal(ctx, "ik_priv", Crypto.b64(id.ikPriv)).let { e.putString("ik_priv", it) }
        Vault.seal(ctx, "ik_pub", Crypto.b64(id.ikPub)).let { e.putString("ik_pub", it) }
        Vault.seal(ctx, "sign_priv", Crypto.b64(id.signPriv)).let { e.putString("sign_priv", it) }
        Vault.seal(ctx, "sign_pub", Crypto.b64(id.signPub)).let { e.putString("sign_pub", it) }
        Vault.seal(ctx, "spk_priv", Crypto.b64(id.spkPriv)).let { e.putString("spk_priv", it) }
        Vault.seal(ctx, "spk_pub", Crypto.b64(id.spkPub)).let { e.putString("spk_pub", it) }
        Vault.seal(ctx, "spk_sig", Crypto.b64(id.spkSig)).let { e.putString("spk_sig", it) }
        Vault.seal(ctx, "spk_id", id.spkId).let { e.putString("spk_id", it) }
        Vault.seal(ctx, "opks", id.opks.joinToString(";") { it.first + "," + Crypto.b64(it.second) + "," + Crypto.b64(it.third) })
            .let { e.putString("opks", it) }
        id.pqPriv?.let { Vault.seal(ctx, "pq_priv", Crypto.b64(it)).let { v -> e.putString("pq_priv", v) } }
        id.pqPub?.let { Vault.seal(ctx, "pq_pub", Crypto.b64(it)).let { v -> e.putString("pq_pub", v) } }
        id.pqSig?.let { Vault.seal(ctx, "pq_sig", Crypto.b64(it)).let { v -> e.putString("pq_sig", v) } }
        e.commit()   // muss stehen, bevor die erste Nachricht rausgeht
    }

    /** Einmal pro Installation: Keys zum Server (nur öffentliche Teile). */
    suspend fun publish(ctx: Context): Boolean {
        val id = identity(ctx)
        val p = prefs(ctx)
        if (p.getBoolean("published_v2", false) && p.getBoolean("published_pq", false)) return true
        Api4.publishE2EKeys(
            identityKey = Crypto.b64(id.ikPub),
            signedPrekey = Crypto.b64(id.spkPub),
            prekeySignature = Crypto.b64(id.spkSig),
            signingKey = Crypto.b64(id.signPub),
            oneTimePrekeys = id.opks.map { it.first to Crypto.b64(it.third) },
            pqPrekey = id.pqPub?.let { Crypto.b64(it) },
            pqSignature = id.pqSig?.let { Crypto.b64(it) },
        )
        p.edit()
            .putBoolean("published_v2", true)
            .putBoolean("published_pq", id.pqPub != null)
            .apply()
        return true
    }

    /* ------------------------- Schalter ------------------------- */

    fun isOn(ctx: Context, chatId: String): Boolean = prefs(ctx).getBoolean("on_$chatId", false)
    fun setOn(ctx: Context, chatId: String, on: Boolean) {
        prefs(ctx).edit().putBoolean("on_$chatId", on).apply()
        if (!on) prefs(ctx).edit().remove("sess_$chatId").remove("peer_$chatId").apply()
    }

    /* ------------------- 🌌 V4.9: PQXDH-Handshake ------------------- */

    /**
     * "pq" = quantensicher (X25519 + ML-KEM-768), "classic" = nur X25519.
     * Die UI zeigt das ehrlich an, statt überall "E2E 🔐" zu drucken.
     */
    fun pqState(ctx: Context, chatId: String): String = prefs(ctx).getString("pqst_$chatId", "?") ?: "?"

    private fun b64OrNull(j: JSONObject, name: String): String? {
        if (j.isNull(name)) return null
        val v = j.optString(name, "")
        return v.takeIf { it.isNotEmpty() }
    }

    private fun otpOf(j: JSONObject): ByteArray? =
        j.optJSONObject("oneTimePrekey")?.optString("key", "")?.takeIf { it.isNotEmpty() }?.let { Crypto.unb64(it) }

    private fun otpIdOf(j: JSONObject): String =
        j.optJSONObject("oneTimePrekey")?.optString("id", "") ?: ""

    private fun x3dhBundle(j: JSONObject) = X3DH.PeerBundle(
        identityKey = Crypto.unb64(j.getString("identityKey")),
        signedPrekey = Crypto.unb64(j.getString("signedPrekey")),
        prekeySignature = Crypto.unb64(j.getString("prekeySignature")),
        signingKey = Crypto.unb64(j.optString("signingKey", "")),
        signedPrekeyId = "1",
        oneTimePrekey = otpOf(j),
        oneTimePrekeyId = otpIdOf(j),
    )

    private fun pqBundle(j: JSONObject) = Pqxdh.PeerBundle(
        identityKey = Crypto.unb64(j.getString("identityKey")),
        signedPrekey = Crypto.unb64(j.getString("signedPrekey")),
        prekeySignature = Crypto.unb64(j.getString("prekeySignature")),
        signingKey = Crypto.unb64(j.optString("signingKey", "")),
        signedPrekeyId = "1",
        oneTimePrekey = otpOf(j),
        oneTimePrekeyId = otpIdOf(j),
        pqPrekey = b64OrNull(j, "pqPrekey")?.let { Crypto.unb64(it) },
        pqSignature = b64OrNull(j, "pqSignature")?.let { Crypto.unb64(it) },
    )

    /**
     * Startet die Sitzung. Kann die Gegenstelle PQXDH, wird es benutzt.
     * Kann sie es nicht (alte App), fällt es auf X3DH zurück — aber der
     * Zustand wird als "classic" gespeichert, damit niemand Quantenschutz
     * angezeigt bekommt, der nicht existiert. Kein stilles Versprechen.
     */
    internal fun startSession(
        ctx: Context, id: Identity, bundleJson: JSONObject, associatedData: ByteArray, stamp: String,
    ): Pair<DoubleRatchet, PreKeyInit> {
        val pqb = pqBundle(bundleJson)
        if (pqb.signingKey.isEmpty()) throw IllegalStateException("Gegenstelle hat keinen Prüfschlüssel — bitte App dort aktualisieren")
        if (pqb.supportsPq) {
            val r = Pqxdh.initiate(id.ikPriv, id.ikPub, id.signPub, pqb, associatedData)
            prefs(ctx).edit().putString("pqst_$stamp", "pq").apply()
            return r
        }
        val xb = x3dhBundle(bundleJson)
        if (!X3DH.verifyPrekey(xb)) throw IllegalStateException("Signatur des Prekeys ist ungültig 🛑")
        val r = X3DH.initiate(id.ikPriv, id.ikPub, id.signPub, xb, associatedData)
        prefs(ctx).edit().putString("pqst_$stamp", "classic").apply()
        return r
    }

    /** Antwortseite: der Umschlag sagt, ob PQ mit drin ist. */
    internal fun answerSession(
        ctx: Context, id: Identity, init: PreKeyInit, associatedData: ByteArray, stamp: String,
    ): DoubleRatchet {
        val opk = id.opks.find { it.first == init.oneTimePrekeyId }?.second
        if (init.pqCiphertext != null) {
            val pqPriv = id.pqPriv ?: throw IllegalStateException("PQ-Umschlag, aber kein eigener PQ-Schlüssel")
            val s = Pqxdh.respond(id.ikPriv, id.spkPriv, id.spkPub, opk, pqPriv, init, associatedData)
            prefs(ctx).edit().putString("pqst_$stamp", "pq").apply()
            return s
        }
        val s = X3DH.respond(id.ikPriv, id.spkPriv, id.spkPub, opk, init, associatedData)
        prefs(ctx).edit().putString("pqst_$stamp", "classic").apply()
        return s
    }

    /* ------------------------- Senden ------------------------- */

    /**
     * Verschlüsselt und schickt. Erste Nachricht trägt die PreKey-Init.
     * @throws IllegalStateException wenn der Partner keine Keys hat
     */
    suspend fun send(ctx: Context, chatId: String, peerId: String, text: String): Msg {
        val id = identity(ctx)
        publish(ctx)
        val p = prefs(ctx)
        // 🔐 V4.8: Ratchet-Session + Peer liegen versiegelt
        var session = Vault.readSecret(ctx, p, "sess_$chatId")?.let { DoubleRatchet.deserialize(it) }
        val knownPeer = Vault.readSecret(ctx, p, "peer_$chatId")

        if (session == null || knownPeer != peerId) {
            val bundleJson = Api4.e2eBundle(peerId)
            // 🌌 V4.9: PQXDH (X25519 + ML-KEM-768), Fallback ehrlich als "classic" markiert
            val (newSession, init) = startSession(ctx, id, bundleJson, chatId.toByteArray(), chatId)
            session = newSession
            val env = newSession.encrypt(text.toByteArray(Charsets.UTF_8)).copy(init = init)
            return post(ctx, chatId, peerId, session, env, text)
        }

        val env = session.encrypt(text.toByteArray(Charsets.UTF_8))
        return post(ctx, chatId, peerId, session, env, text)
    }

    private suspend fun post(
        ctx: Context, chatId: String, peerId: String,
        session: DoubleRatchet, env: Envelope, plaintext: String,
    ): Msg {
        val m = Api4.sendE2E(
            chatId = chatId,
            ratchet = env.serialize(),
            iv = Crypto.b64(env.iv),
            ct = Crypto.b64(env.ciphertext),
        )
        val sp = prefs(ctx)
        Vault.writeSecret(ctx, sp, "sess_$chatId", session.serialize())
        Vault.writeSecret(ctx, sp, "peer_$chatId", peerId)
        cachePut(ctx, chatId, m.id, plaintext)
        return m
    }

    /* ------------------------- Empfangen ------------------------- */

    /** Entschlüsselt alle E2E-Nachrichten, die noch keinen Klartext haben. */
    suspend fun decryptAll(ctx: Context, chatId: String, msgs: List<Msg>, meId: String): Map<String, String> {
        val out = HashMap<String, String>()
        for (m in msgs) {
            val enc = m.enc ?: continue
            // eigener Klartext kommt aus dem lokalen Cache
            val cached = cacheGet(ctx, chatId, m.id)
            if (cached != null) {
                out[m.id] = cached
                continue
            }
            if (m.senderId == meId) continue

            val env = Envelope.parse(enc) ?: continue
            var session = Vault.readSecret(ctx, prefs(ctx), "sess_$chatId")?.let { DoubleRatchet.deserialize(it) }
            try {
                if (session == null) {
                    val init = env.init ?: continue
                    session = answerSession(ctx, identity(ctx), init, chatId.toByteArray(), chatId)
                }
                val pt = String(session.decrypt(env), Charsets.UTF_8)
                Vault.writeSecret(ctx, prefs(ctx), "sess_$chatId", session.serialize())
                cachePut(ctx, chatId, m.id, pt)
                out[m.id] = pt
            } catch (t: Throwable) {
                // Nachricht gehört zu einer älteren/anderen Session → nicht kaputt rendern
                out[m.id] = "🔐 (nicht entschlüsselbar)"
            }
        }
        return out
    }

    /* ------------------------- lokaler Klartext-Cache ------------------------- */

    private fun cacheKey(chatId: String) = "plain_$chatId"

    fun cacheText(ctx: Context, chatId: String, msgId: String, text: String) = cachePut(ctx, chatId, msgId, text)

    private fun cachePut(ctx: Context, chatId: String, msgId: String, text: String) {
        val p = prefs(ctx)
        // 🔐 V4.8: auch der lokale Klartext-Cache ist versiegelt
        val raw = Vault.readSecret(ctx, p, cacheKey(chatId)) ?: "{}"
        val o = try { JSONObject(raw) } catch (e: Exception) { JSONObject() }
        o.put(msgId, text)
        if (o.length() > CACHE_MAX) {
            val keys = o.keys().asSequence().toList()
            keys.take(o.length() - CACHE_MAX).forEach { o.remove(it) }
        }
        Vault.writeSecret(ctx, p, cacheKey(chatId), o.toString())
    }

    fun cachedText(ctx: Context, chatId: String, msgId: String): String? = cacheGet(ctx, chatId, msgId)

    private fun cacheGet(ctx: Context, chatId: String, msgId: String): String? {
        val raw = Vault.readSecret(ctx, prefs(ctx), cacheKey(chatId)) ?: "{}"
        return try {
            val o = JSONObject(raw)
            if (o.has(msgId)) o.getString(msgId) else null
        } catch (e: Exception) {
            null
        }
    }
}

/* =====================================================================
   👥 V4.6 — GRUPPEN-E2E mit Sender Keys
   ---------------------------------------------------------------------
   Ablauf in der App:
   1) eigener Sender-Key anlegen (einmal pro Chat + Mitgliederstand)
   2) SKDM (Chain-Key) an JEDES Mitglied verschlüsselt verteilen —
      über dessen 1:1-X3DH-Session; der Server sieht nur den Umschlag
   3) Nachricht: EIN Ciphertext + Signatur für die ganze Gruppe
   4) Empfangen: Signatur VOR Entschlüsselung prüfen → Fälschung fliegt auf
   5) ändert sich die Mitgliederliste → neuer Sender-Key (Forward Secrecy)
   ===================================================================== */

object GroupE2E {
    private const val PREFS = "maxichat_secure_v45"
    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun ownKey(chatId: String) = "skown_$chatId"
    private fun peerKey(chatId: String, from: String) = "skpeer_${chatId}_$from"
    private fun peerSession(peerId: String) = "psess_$peerId"
    private fun skdmSent(chatId: String, to: String) = "skdm_${chatId}_$to"

    /* ---------- 1) eigener Sender-Key (mit Rotation bei Mitgliederwechsel) ---------- */

    /**
     * Holt den eigenen Sender-Key. Ändert sich die Mitgliederliste, wird ein
     * NEUER erzeugt — wer die Gruppe verlässt, kann danach nicht mehr mitlesen.
     * @return null, wenn rotiert wurde (dann muss neu verteilt werden)
     */
    fun ownState(ctx: Context, chatId: String, memberIds: List<String>): SenderKeyState {
        val p = prefs(ctx)
        val fingerprint = memberIds.sorted().joinToString(",")
        val storedFp = p.getString("skmembers_$chatId", "")
        val existing = Vault.readSecret(ctx, p, ownKey(chatId))?.let { SenderKeyState.deserialize(it) }

        if (existing != null && storedFp == fingerprint) return existing

        // neu oder rotiert
        val (fresh, _) = SenderKeyState.create()
        val edit = p.edit()
            .putString(ownKey(chatId), Vault.seal(ctx, ownKey(chatId), fresh.serialize()))
            .putString("skmembers_$chatId", fingerprint)
        // alte Verteil-Marker weg → wird allen neu geschickt
        p.all.keys.filter { it.startsWith("skdm_${chatId}_") }.forEach { edit.remove(it) }
        edit.apply()
        return fresh
    }

    fun saveOwn(ctx: Context, chatId: String, st: SenderKeyState) {
        Vault.writeSecret(ctx, prefs(ctx), ownKey(chatId), st.serialize())
    }

    /* ---------- 2) SKDM verteilen (immer verschlüsselt, pro Person) ---------- */

    /**
     * Verteilt den eigenen Sender-Key an alle, die ihn noch nicht haben.
     * Verschlüsselt wird mit der 1:1-Doppel-Ratchet-Session zu dieser Person.
     * @return Anzahl der erfolgreich belieferten Mitglieder
     */
    suspend fun distribute(ctx: Context, chatId: String, memberIds: List<String>, meId: String): Int {
        val p = prefs(ctx)
        val st = ownState(ctx, chatId, memberIds)
        val id = SecureChat.identity(ctx)
        SecureChat.publish(ctx)
        val dist = SenderKeyDistribution(st.keyId, st.chainKey.copyOf(), st.signingPub, st.iteration)
        var sent = 0

        for (member in memberIds) {
            if (member == meId) continue
            if (p.getString(skdmSent(chatId, member), null) == st.keyId) continue
            val boxed = try { sealForPeer(ctx, id, member, dist) } catch (e: Exception) { null } ?: continue
            try {
                Api4.sendSenderKeyEnvelope(chatId, member, st.keyId, boxed)
                p.edit().putString(skdmSent(chatId, member), st.keyId).apply()
                sent++
            } catch (e: Exception) { /* nächster Versuch beim nächsten Senden */ }
        }
        return sent
    }

    /** SKDM in einen 1:1-Ratchet-Umschlag packen. */
    private suspend fun sealForPeer(
        ctx: Context, id: SecureChat.Identity, peerId: String, dist: SenderKeyDistribution,
    ): String {
        val p = prefs(ctx)
        var session = Vault.readSecret(ctx, p, peerSession(peerId))?.let { DoubleRatchet.deserialize(it) }
        val body = dist.encode().toByteArray(Charsets.UTF_8)
        val namespace = "skdm".toByteArray()

        if (session == null) {
            val bundleJson = Api4.e2eBundle(peerId)
            // 🌌 V4.9: auch die Gruppen-Schlüsselverteilung läuft über PQXDH
            val (s, init) = SecureChat.startSession(ctx, id, bundleJson, namespace, "peer_$peerId")
            val env = s.encrypt(body).copy(init = init)
            Vault.writeSecret(ctx, p, peerSession(peerId), s.serialize())
            return "skdm-env1|" + env.serialize()
        }
        val env = session.encrypt(body)
        Vault.writeSecret(ctx, p, peerSession(peerId), session.serialize())
        return "skdm-env1|" + env.serialize()
    }

    /* ---------- 3) fremde Sender-Keys abholen ---------- */

    /** Holt offene SKDMs vom Server, öffnet sie und merkt sich die Ketten. */
    suspend fun pull(ctx: Context, chatId: String): Int {
        val list = try { Api4.pullSenderKeys(chatId) } catch (e: Exception) { return 0 }
        val p = prefs(ctx)
        val id = SecureChat.identity(ctx)
        val namespace = "skdm".toByteArray()
        var count = 0

        for ((fromId, _, envelope) in list) {
            if (!envelope.startsWith("skdm-env1|")) continue
            try {
                var session = Vault.readSecret(ctx, p, peerSession(fromId))?.let { DoubleRatchet.deserialize(it) }
                val env = Envelope.parse(envelope.removePrefix("skdm-env1|")) ?: continue
                if (session == null) {
                    val init = env.init ?: continue
                    session = SecureChat.answerSession(ctx, id, init, namespace, "peer_$fromId")
                }
                val body = String(session.decrypt(env), Charsets.UTF_8)
                Vault.writeSecret(ctx, p, peerSession(fromId), session.serialize())
                val dist = SenderKeyDistribution.parse(body) ?: continue
                Vault.writeSecret(ctx, p, peerKey(chatId, fromId), SenderKeyState.fromDistribution(dist, chatId.toByteArray()).serialize())
                count++
            } catch (e: Exception) {
                // kaputte/fremde SKDM überspringen — nächster Versuch beim nächsten Öffnen
            }
        }
        return count
    }

    /* ---------- 4) Senden ---------- */

    suspend fun send(ctx: Context, chatId: String, memberIds: List<String>, meId: String, text: String): Msg {
        SecureChat.publish(ctx)
        distribute(ctx, chatId, memberIds, meId)
        val st = ownState(ctx, chatId, memberIds)
        val msg = st.encrypt(text.toByteArray(Charsets.UTF_8), chatId.toByteArray())
        saveOwn(ctx, chatId, st)
        val m = Api4.sendGroupE2E(chatId, msg.encode())
        SecureChat.cacheText(ctx, chatId, m.id, text)
        return m
    }

    /* ---------- 5) Empfangen ---------- */

    suspend fun decryptAll(ctx: Context, chatId: String, msgs: List<Msg>, meId: String): Map<String, String> {
        pull(ctx, chatId)   // erst neue Sender-Keys einsammeln
        val out = HashMap<String, String>()
        val p = prefs(ctx)
        val namespace = chatId.toByteArray()

        for (m in msgs) {
            val wire = m.group ?: continue
            val cached = SecureChat.cachedText(ctx, chatId, m.id)
            if (cached != null) {
                out[m.id] = cached
                continue
            }
            if (m.senderId == meId) continue

            val raw = Vault.readSecret(ctx, p, peerKey(chatId, m.senderId))
            if (raw == null) {
                out[m.id] = "🔐 Sender-Key fehlt (wird beim nächsten Öffnen nachgeliefert)"
                continue
            }
            val st = SenderKeyState.deserialize(raw) ?: continue
            val msg = SenderKeyMessage.parse(wire) ?: continue
            try {
                val pt = String(st.decrypt(msg, namespace), Charsets.UTF_8)
                Vault.writeSecret(ctx, p, peerKey(chatId, m.senderId), st.serialize())
                SecureChat.cacheText(ctx, chatId, m.id, pt)
                out[m.id] = pt
            } catch (e: Exception) {
                out[m.id] = "🛑 " + (e.message ?: "Nachricht nicht vertrauenswürdig")
            }
        }
        return out
    }
}
