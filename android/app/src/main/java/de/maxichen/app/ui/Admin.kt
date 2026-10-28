package de.maxichen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch
import org.json.JSONObject

/* =====================================================================
   🏛 TEAM-ZENTRALE V4.2
   🔒 NUR OWNER `maxichen` DARF SPERREN.
   ===================================================================== */

const val RANK_OWNER = 100

data class AdminUser(
    val id: String, val username: String, val displayName: String, val avatar: String,
    val role: String, val roleLabel: String, val owner: Boolean, val online: Boolean,
    val warnings: Int, val createdAt: Long, val lastSeen: Long,
    val banType: String, val banReason: String, val muteUntil: Long,
    val groups: List<Pair<String, String>>,
) {
    val isTargetOwner: Boolean get() = owner || username == "maxichen"
    companion object {
        fun from(j: JSONObject): AdminUser {
            val ban = j.optJSONObject("ban")
            val mute = j.optJSONObject("mute")
            val ga = j.optJSONArray("groups")
            val groups = if (ga == null) emptyList() else (0 until ga.length()).map {
                val g = ga.getJSONObject(it)
                g.optString("id") to g.optString("name")
            }
            return AdminUser(
                j.optString("id"), j.optString("username"), j.optString("displayName"),
                j.optString("avatar").ifEmpty { "💗" }, j.optString("role"),
                j.optString("roleLabel"), j.optBoolean("owner"), j.optBoolean("online"),
                j.optInt("warnings"), j.optLong("createdAt"), j.optLong("lastSeen"),
                ban?.optString("type") ?: "", ban?.optString("reason") ?: "",
                mute?.optLong("until") ?: 0L, groups,
            )
        }
    }
}

data class AppealRow(
    val id: String, val userId: String, val username: String, val displayName: String,
    val avatar: String, val text: String, val status: String, val createdAt: Long,
    val banType: String, val banReason: String,
) {
    companion object {
        fun from(j: JSONObject): AppealRow {
            val u = j.optJSONObject("user")
            val ban = u?.optJSONObject("ban")
            return AppealRow(
                j.optString("id"), j.optString("userId"),
                u?.optString("username") ?: "?", u?.optString("displayName") ?: "Unbekannt",
                u?.optString("avatar") ?: "💗",
                j.optString("text").ifEmpty { j.optString("message") },
                j.optString("status", "open"), j.optLong("createdAt"),
                ban?.optString("type") ?: "", ban?.optString("reason") ?: "",
            )
        }
    }
}

data class LogRow(
    val id: String, val action: String, val byName: String, val targetName: String,
    val reason: String, val at: Long,
) {
    companion object {
        fun from(j: JSONObject): LogRow = LogRow(
            j.optString("id"), j.optString("action"), j.optString("byName").ifEmpty { "System" },
            j.optString("targetName"), j.optString("reason"), j.optLong("at"),
        )
    }
}

object AdminApi {
    suspend fun overview(): JSONObject = Api.get("/api/admin/overview")

    suspend fun users(q: String, filter: String): List<AdminUser> {
        var path = "/api/admin/users?filter=" + filter
        if (q.isNotBlank()) path += "&q=" + java.net.URLEncoder.encode(q, "UTF-8")
        val a = Api.get(path).optJSONArray("users") ?: return emptyList()
        return (0 until a.length()).map { AdminUser.from(a.getJSONObject(it)) }
    }

    suspend fun action(userId: String, action: String, body: JSONObject): String {
        val o = JSONObject().put("action", action)
        body.keys().forEach { k -> o.put(k, body.get(k)) }
        return Api.post("/api/admin/users/$userId/action", o).optString("message")
    }

    suspend fun appeals(): List<AppealRow> {
        val a = Api.get("/api/admin/appeals").optJSONArray("appeals") ?: return emptyList()
        return (0 until a.length()).map { AppealRow.from(a.getJSONObject(it)) }
    }

    suspend fun resolveAppeal(id: String, decision: String, note: String): String =
        Api.post("/api/admin/appeals/$id/resolve", JSONObject().put("decision", decision).put("note", note))
            .optString("message")

    suspend fun logs(): List<LogRow> {
        val a = Api.get("/api/admin/logs?limit=150").optJSONArray("logs") ?: return emptyList()
        return (0 until a.length()).map { LogRow.from(a.getJSONObject(it)) }
    }
}

/* =====================================================================
   🏛 HAUPTSCREEN
   ===================================================================== */

@Composable
fun AdminScreen2(onBack: () -> Unit) {
    val me by Hub.user.collectAsState()
    // 👑 Owner = DB-Rolle + Username (niemals Telefon/E-Mail)
    val iAmOwner = me?.isOwner == true && me?.username == "maxichen"

    var tab by remember { mutableIntStateOf(0) }
    var users by remember { mutableStateOf<List<AdminUser>>(emptyList()) }
    var appeals by remember { mutableStateOf<List<AppealRow>>(emptyList()) }
    var logs by remember { mutableStateOf<List<LogRow>>(emptyList()) }
    var reports by remember { mutableStateOf<List<ReportRow>>(emptyList()) }
    var stats by remember { mutableStateOf<JSONObject?>(null) }
    var q by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }
    var loading by remember { mutableStateOf(true) }
    var selected by remember { mutableStateOf<AdminUser?>(null) }
    var showHowTo by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun loadAll() {
        loading = true
        try { stats = AdminApi.overview() } catch (e: Exception) {}
        try { users = AdminApi.users(q, filter) } catch (e: Exception) {}
        try { appeals = AdminApi.appeals() } catch (e: Exception) {}
        try { logs = AdminApi.logs() } catch (e: Exception) {}
        try { reports = Api4.adminReports() } catch (e: Exception) {}
        loading = false
    }
    LaunchedEffect(Unit) { loadAll() }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(V3.glass).clickable { onBack() },
                contentAlignment = Alignment.Center) { Text("←", fontSize = 17.sp, color = V3.text) }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Team-Zentrale 🏛", fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 19.sp, color = V3.text)
                    Spacer(Modifier.width(5.dp))
                    if (iAmOwner) Text("👑", fontSize = 14.sp)
                }
                Muted3(
                    if (iAmOwner) "Owner maxichen · Sperren & Rollen frei" else "nur Leserechte (Sperren: nur Owner)",
                    10, 1,
                )
            }
            Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(V3.glass)
                .clickable { scope.launch { loadAll() } }, contentAlignment = Alignment.Center) {
                Text("⟳", fontSize = 15.sp, color = V3.muted)
            }
        }

        Spacer(Modifier.height(8.dp))
        if (!iAmOwner) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(RoundedCornerShape(14.dp))
                    .background(Color(0x33FFD166))
                    .border(1.dp, V3.gold.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
                    .clickable { showHowTo = !showHowTo }.padding(horizontal = 11.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("🔒", fontSize = 14.sp)
                Spacer(Modifier.width(7.dp))
                Column(Modifier.weight(1f)) {
                    Text("Sperren kann nur Owner @maxichen", fontFamily = Outfit, fontWeight = FontWeight.Bold,
                        fontSize = 11.sp, color = V3.gold)
                    Muted3("Du darfst ansehen, Reports lesen und Gruppen verwalten.", 9.5, 2)
                }
                Text(if (showHowTo) "▲" else "▼", fontSize = 10.sp, color = V3.gold)
            }
            if (showHowTo) {
                GlassCard3(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
                    Muted3("• WARN, MUTE, TEMPBAN, FUTUREBAN, PERMABAN, GROUPBAN, UNBAN → nur Owner 👑", 9.5, 4)
                    Muted3("• Owner ist unantastbar · Owner kann sich nicht selbst sperren", 9.5, 3)
                    Muted3("• Einsprüche entscheidet ausschließlich der Owner", 9.5, 2)
                    Muted3("• Jede Aktion landet im Protokoll 📜", 9.5, 2)
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            ChipFilter("📊 Übersicht", tab == 0) { tab = 0 }
            ChipFilter("👥 Nutzer", tab == 1) { tab = 1 }
            ChipFilter("📬 Einsprüche" + if (appeals.count { it.status == "open" } > 0) " " + appeals.count { it.status == "open" } else "", tab == 2) { tab = 2 }
            ChipFilter("📜 Protokoll", tab == 3) { tab = 3 }
            ChipFilter("🚩 Reports", tab == 4) { tab = 4 }
        }
        Spacer(Modifier.height(8.dp))

        if (loading) {
            Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { Spinner() }
        } else when (tab) {
            0 -> OverviewTab(stats, users, appeals, logs, reports)
            1 -> UsersTab(
                users, q, filter, iAmOwner,
                onQuery = { q = it },
                onFilter = { filter = it; scope.launch { users = AdminApi.users(q, it) } },
                onSearch = { scope.launch { users = AdminApi.users(q, filter) } },
                onPick = { u ->
                    if (iAmOwner) selected = u
                    else Hub.toast("🔒", "Nur Owner", "@maxichen kann Sperren setzen")
                },
            )
            2 -> AppealsTab(appeals, iAmOwner) { a, decision, note ->
                if (!iAmOwner) { Hub.toast("🔒", "Nur Owner", "Entscheidungen trifft @maxichen"); return@AppealsTab }
                scope.launch {
                    try {
                        val msg = AdminApi.resolveAppeal(a.id, decision, note)
                        Hub.toast("✅", "Entschieden", msg)
                        appeals = AdminApi.appeals()
                        users = AdminApi.users(q, filter)
                    } catch (e: ApiError) {
                        if (e.reason == "owner_only") Hub.toast("🔒", "Nur Owner", e.msg)
                        else Hub.toast("💔", "Fehler", e.msg)
                    }
                }
            }
            3 -> LogsTab(logs)
            else -> ReportsTab(reports, iAmOwner) { r ->
                if (!iAmOwner) { Hub.toast("🔒", "Nur Owner", "Sperren nur @maxichen"); return@ReportsTab }
                scope.launch {
                    try {
                        Api4.resolveReport(r.id)
                        reports = Api4.adminReports()
                        Hub.toast("✅", "Report erledigt")
                    } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }

    selected?.let { u ->
        ActionSheet(
            user = u,
            iAmOwner = iAmOwner,
            onDismiss = { selected = null },
            onDone = { msg ->
                selected = null
                Hub.toast("👑", "Erledigt", msg)
                scope.launch {
                    users = AdminApi.users(q, filter)
                    logs = AdminApi.logs()
                    try { stats = AdminApi.overview() } catch (e: Exception) {}
                }
            },
            onError = { msg -> Hub.toast("💔", "Fehler", msg) },
        )
    }
}

/* =====================================================================
   📊 ÜBERSICHT
   ===================================================================== */

@Composable
fun OverviewTab(
    stats: JSONObject?, users: List<AdminUser>, appeals: List<AppealRow>,
    logs: List<LogRow>, reports: List<ReportRow>,
) {
    val s = stats?.optJSONObject("stats")
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item {
            GlassCard3(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(V3.primaryBrush), contentAlignment = Alignment.Center) {
                        Text("👑", fontSize = 19.sp)
                    }
                    Spacer(Modifier.width(9.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Owner: @maxichen", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.text)
                        Muted3("MaxiChat · by Maxichen · 910maxi", 9.5, 1)
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                StatTile("👥", (s?.optInt("users") ?: 0).toString(), "Nutzer", V3.blue, Modifier.weight(1f))
                StatTile("🟢", (s?.optInt("online") ?: 0).toString(), "online", V3.green, Modifier.weight(1f))
                StatTile("🚫", (s?.optInt("activeBans") ?: 0).toString(), "Sperren", V3.danger, Modifier.weight(1f))
                StatTile("🔇", (s?.optInt("muted") ?: 0).toString(), "stumm", V3.gold, Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                StatTile("📬", appeals.count { it.status == "open" }.toString(), "Einsprüche", V3.lila, Modifier.weight(1f))
                StatTile("💬", (s?.optInt("messages") ?: 0).toString(), "Nachrichten", V3.neon, Modifier.weight(1f))
                StatTile("🗂", (s?.optInt("chats") ?: 0).toString(), "Chats", V3.blue, Modifier.weight(1f))
                StatTile("🚩", reports.count { it.status == "open" }.toString(), "Reports", V3.danger, Modifier.weight(1f))
            }
        }
        item {
            GlassCard3(Modifier.fillMaxWidth()) {
                Text("Rollen", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text)
                Spacer(Modifier.height(5.dp))
                val rc = s?.optJSONObject("roleCounts")
                if (rc != null) {
                    rc.keys().forEach { k ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(roleLabelFor(k), fontFamily = Outfit, fontSize = 10.5.sp, color = V3.muted, modifier = Modifier.weight(1f))
                            Chip3(rc.optInt(k).toString(), if (k == "owner") V3.gold else V3.lila)
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Muted3("Sperren & Rollen: ausschließlich Owner @maxichen 👑", 9, 2)
            }
        }
        item {
            GlassCard3(Modifier.fillMaxWidth()) {
                Text("Letzte Aktionen 📜", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text)
                Spacer(Modifier.height(4.dp))
                if (logs.isEmpty()) Muted3("Noch nichts passiert", 10, 1)
                else logs.take(6).forEach { l ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Chip3(logIcon(l.action) + " " + l.action, logColor(l.action))
                        Spacer(Modifier.width(6.dp))
                        Text(l.targetName.ifEmpty { "—" }, fontFamily = Outfit, fontSize = 10.5.sp,
                            color = V3.text, maxLines = 1, modifier = Modifier.weight(1f))
                        Muted3(timeAgo(l.at), 8.5, 1)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
    }
}

@Composable
fun StatTile(icon: String, value: String, label: String, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(16.dp)).background(V3.glass)
            .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(16.dp)).padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(icon, fontSize = 14.sp)
        Text(value, fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = color)
        Text(label, fontFamily = Outfit, fontSize = 8.sp, color = V3.muted, maxLines = 1)
    }
}

/* =====================================================================
   👥 NUTZER
   ===================================================================== */

@Composable
fun UsersTab(
    users: List<AdminUser>, q: String, filter: String, iAmOwner: Boolean,
    onQuery: (String) -> Unit, onFilter: (String) -> Unit, onSearch: () -> Unit,
    onPick: (AdminUser) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { V2TextField(q, onQuery, "Nutzer suchen…", minHeight = 44, leading = "🔍") }
            Spacer(Modifier.width(5.dp))
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(V3.primaryBrush).clickable { onSearch() },
                contentAlignment = Alignment.Center) { Text("➤", fontSize = 14.sp, color = V3.ink) }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("all" to "Alle", "banned" to "Gesperrt", "muted" to "Stumm", "staff" to "Team", "warned" to "Verwarnt")
                .forEach { (k, l) -> ChipFilter(l, filter == k) { onFilter(k) } }
        }
        Spacer(Modifier.height(6.dp))
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp)) {
            items(users.size) { i ->
                val u = users[i]
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(V3.glass)
                        .border(
                            1.dp,
                            if (u.banType.isNotEmpty()) V3.danger.copy(alpha = 0.4f) else V3.glassBorder,
                            RoundedCornerShape(15.dp),
                        )
                        .clickable { onPick(u) }.padding(9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar3(u.avatar, 38, online = u.online)
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(u.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold,
                                fontSize = 12.5.sp, color = V3.text, maxLines = 1)
                            if (u.isTargetOwner) { Spacer(Modifier.width(3.dp)); Text("👑", fontSize = 10.sp) }
                        }
                        Muted3("@" + u.username + " · " + u.roleLabel, 9, 1)
                        if (u.banType.isNotEmpty()) {
                            Spacer(Modifier.height(2.dp))
                            Chip3(banLabel(u.banType), V3.danger)
                        } else if (u.muteUntil > System.currentTimeMillis()) {
                            Spacer(Modifier.height(2.dp))
                            Chip3("stumm bis " + fmtDate(u.muteUntil), V3.gold)
                        }
                    }
                    if (iAmOwner) Text("›", fontSize = 18.sp, color = V3.muted)
                    else Text("🔒", fontSize = 12.sp, color = V3.muted)
                }
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

/* =====================================================================
   📬 EINSPRÜCHE
   ===================================================================== */

@Composable
fun AppealsTab(appeals: List<AppealRow>, iAmOwner: Boolean, onDecide: (AppealRow, String, String) -> Unit) {
    var note by remember { mutableStateOf("") }
    if (appeals.isEmpty()) {
        EmptyState("📬", "Keine Einsprüche", "Alles ruhig 💗")
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(appeals.size) { idx ->
            val a = appeals[idx]
            GlassCard3(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar3(a.avatar, 32)
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(a.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text)
                        Muted3("@" + a.username + " · " + timeAgo(a.createdAt), 9, 1)
                    }
                    Chip3(
                        when (a.status) { "open" -> "offen"; "accepted" -> "angenommen"; "denied" -> "abgelehnt"; else -> a.status },
                        when (a.status) { "open" -> V3.gold; "accepted" -> V3.green; else -> V3.muted },
                    )
                }
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0x22FFFFFF)).padding(8.dp),
                ) {
                    Text(a.text.ifEmpty { "(kein Text)" }, fontFamily = Outfit, fontSize = 11.sp, color = V3.text)
                }
                if (a.banType.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Muted3("Sperre: " + banLabel(a.banType) + " · " + a.banReason.ifEmpty { "kein Grund" }, 9, 2)
                }
                Spacer(Modifier.height(8.dp))
                if (a.status == "open") {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.weight(1f)) {
                            V2TextField(note, { note = it }, "Notiz (optional)", minHeight = 40)
                        }
                        Spacer(Modifier.width(5.dp))
                        Box(
                            Modifier.size(40.dp).clip(RoundedCornerShape(13.dp))
                                .background(if (iAmOwner) Color(0x33AAFF7E) else Color(0x22FFFFFF))
                                .clickable { onDecide(a, "accept", note) }, contentAlignment = Alignment.Center,
                        ) { Text(if (iAmOwner) "✅" else "🔒", fontSize = 14.sp) }
                        Spacer(Modifier.width(4.dp))
                        Box(
                            Modifier.size(40.dp).clip(RoundedCornerShape(13.dp))
                                .background(if (iAmOwner) Color(0x33FF5C7A) else Color(0x22FFFFFF))
                                .clickable { onDecide(a, "deny", note) }, contentAlignment = Alignment.Center,
                        ) { Text(if (iAmOwner) "✕" else "🔒", fontSize = 14.sp) }
                    }
                    if (!iAmOwner) {
                        Spacer(Modifier.height(4.dp))
                        Muted3("Entscheidungen trifft nur Owner @maxichen 👑", 9, 1)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
    }
}

/* =====================================================================
   📜 PROTOKOLL · 🚩 REPORTS
   ===================================================================== */

@Composable
fun LogsTab(logs: List<LogRow>) {
    if (logs.isEmpty()) { EmptyState("📜", "Protokoll leer", "Noch keine Aktionen"); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)) {
        items(logs.size) { i ->
            val l = logs[i]
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(V3.glass)
                    .border(1.dp, V3.glassBorder, RoundedCornerShape(13.dp)).padding(9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(28.dp).clip(CircleShape).background(logColor(l.action).copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center) { Text(logIcon(l.action), fontSize = 12.sp) }
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        l.action + " · " + l.byName + " → " + l.targetName.ifEmpty { "—" },
                        fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, color = V3.text, maxLines = 1,
                    )
                    if (l.reason.isNotEmpty()) Muted3(l.reason, 9, 1)
                }
                Muted3(fmtDate(l.at), 8, 1)
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
    }
}

@Composable
fun ReportsTab(reports: List<ReportRow>, iAmOwner: Boolean, onResolve: (ReportRow) -> Unit) {
    if (reports.isEmpty()) { EmptyState("🚩", "Keine Reports", "Niemand hat gemeldet 💗"); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp)) {
        items(reports.size) { i ->
            val r = reports[i]
            GlassCard3(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("🚩", fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.targetName + " · " + r.reason, fontFamily = Outfit, fontWeight = FontWeight.Bold,
                            fontSize = 11.5.sp, color = V3.text, maxLines = 1)
                        Muted3("von " + r.byName + " · " + timeAgo(r.createdAt), 9, 1)
                    }
                    Chip3(if (r.status == "open") "offen" else "erledigt", if (r.status == "open") V3.gold else V3.green)
                }
                if (r.text.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Muted3(r.text, 10, 3)
                }
                if (r.status == "open") {
                    Spacer(Modifier.height(6.dp))
                    GhostButton3(if (iAmOwner) "Erledigt ✓" else "🔒 Nur Owner entscheidet") { onResolve(r) }
                }
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
    }
}

/* =====================================================================
   👑 AKTIONEN (nur Owner)
   ===================================================================== */

@Composable
fun ActionSheet(
    user: AdminUser, iAmOwner: Boolean, onDismiss: () -> Unit,
    onDone: (String) -> Unit, onError: (String) -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    var duration by remember { mutableStateOf("1d") }
    var showGroupPick by remember { mutableStateOf(false) }
    var showRole by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val targetOwner = user.isTargetOwner

    fun run(action: String, extra: JSONObject = JSONObject()) {
        if (!iAmOwner) { Hub.toast("🔒", "Nur Owner", "@maxichen darf sperren"); return }
        if (targetOwner) { Hub.toast("👑", "Owner ist unantastbar", "Diese Person kann nicht gesperrt werden"); return }
        val body = JSONObject().put("reason", reason.trim()).put("duration", duration)
        extra.keys().forEach { k -> body.put(k, extra.get(k)) }
        scope.launch {
            try { onDone(AdminApi.action(user.id, action, body)) }
            catch (e: ApiError) {
                if (e.reason == "owner_only") Hub.toast("🔒", "Nur Owner", e.msg) else onError(e.msg)
            }
        }
    }

    SheetScaffold("@" + user.username + (if (targetOwner) " 👑" else ""), onDismiss) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar3(user.avatar, 44, online = user.online)
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(user.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = V3.text)
                Muted3(user.roleLabel + " · " + user.id, 9, 1)
            }
            if (user.warnings > 0) Chip3("⚠️ " + user.warnings, V3.gold)
        }

        if (targetOwner) {
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(Color(0x33FFD166))
                    .padding(9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("👑", fontSize = 15.sp)
                Spacer(Modifier.width(7.dp))
                Muted3("Der Owner ist unantastbar. Kein Ban, kein Mute, keine Rollenänderung.", 9.5, 3)
            }
        }

        Spacer(Modifier.height(8.dp))
        V2TextField(reason, { reason = it }, "Grund (wird im Protokoll gespeichert)", minHeight = 44, singleLine = false)
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("1h" to "1 Std", "1d" to "1 Tag", "7d" to "7 Tage", "30d" to "30 Tage", "perm" to "∞")
                .forEach { (k, l) -> ChipFilter(l, duration == k) { duration = k } }
        }

        Spacer(Modifier.height(10.dp))
        Text(
            if (iAmOwner) "Aktionen 👑" else "Aktionen 🔒 (nur Owner)",
            fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, color = V3.text,
        )
        Spacer(Modifier.height(5.dp))

        val dis = !iAmOwner || targetOwner
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ActionTile("⚠️", "Warnen", V3.gold, dis, Modifier.weight(1f)) { run("warn") }
                ActionTile("🔇", "Stumm", V3.lila, dis, Modifier.weight(1f)) { run("mute") }
                ActionTile("⏳", "Tempban", V3.danger, dis, Modifier.weight(1f)) { run("tempban") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ActionTile("📅", "Futureban", V3.blue, dis, Modifier.weight(1f)) { run("futureban") }
                ActionTile("⛔", "Permaban", V3.danger, dis, Modifier.weight(1f)) { run("permaban") }
                ActionTile("🕊", "Unban", V3.green, dis, Modifier.weight(1f)) { run("unban") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ActionTile("🚪", "Groupban", V3.gold, dis, Modifier.weight(1f)) { showGroupPick = !showGroupPick }
                ActionTile("🎖", "Rolle", V3.lila, dis, Modifier.weight(1f)) { showRole = !showRole }
                Spacer(Modifier.weight(1f))
            }
        }

        if (showGroupPick && !dis) {
            Spacer(Modifier.height(6.dp))
            Text("Chat wählen 🚪", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, color = V3.muted)
            if (user.groups.isEmpty()) Muted3("Diese Person ist in keiner Gruppe", 9.5, 1)
            user.groups.forEach { (gid, gname) ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 1.dp).clip(RoundedCornerShape(11.dp))
                        .background(V3.glass).clickable {
                            run("groupban", JSONObject().put("chatId", gid))
                        }.padding(horizontal = 9.dp, vertical = 7.dp),
                ) { Text(gname, fontFamily = Outfit, fontSize = 11.sp, color = V3.text) }
            }
        }

        if (showRole && !dis) {
            Spacer(Modifier.height(6.dp))
            Text("Rolle setzen 🎖 (nur Owner)", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, color = V3.muted)
            Spacer(Modifier.height(3.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("superadmin" to "Superadmin", "admin" to "Admin", "moderator" to "Moderator", "user" to "Nutzer")
                    .forEach { (k, l) ->
                        ChipFilter(l, false) { run("role", JSONObject().put("role", k)) }
                    }
            }
        }

        Spacer(Modifier.height(10.dp))
        GhostButton3("Schließen") { onDismiss() }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun ActionTile(icon: String, label: String, color: Color, disabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp))
            .background(if (disabled) Color(0x10FFFFFF) else color.copy(alpha = 0.16f))
            .border(1.dp, if (disabled) V3.glassBorder else color.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
            .clickable(enabled = !disabled) { onClick() }.padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(if (disabled) "🔒" else icon, fontSize = 15.sp)
        Spacer(Modifier.height(2.dp))
        Text(label, fontFamily = Outfit, fontSize = 9.sp, fontWeight = FontWeight.Bold,
            color = if (disabled) V3.muted else color, maxLines = 1)
    }
}

/* ---------------- Helfer ---------------- */

fun banLabel(type: String): String = when (type) {
    "perm" -> "PERMABAN"
    "temp" -> "TEMPBAN"
    "future" -> "FUTUREBAN"
    "mute" -> "MUTE"
    "groupban" -> "GROUPBAN"
    else -> type.uppercase()
}

fun roleLabelFor(role: String): String = when (role) {
    "owner" -> "Owner 👑"
    "superadmin" -> "Superadmin"
    "admin" -> "Admin"
    "moderator" -> "Moderator"
    else -> "Benutzer"
}

fun logIcon(action: String): String = when (action.uppercase()) {
    "WARN" -> "⚠️"
    "MUTE" -> "🔇"
    "TEMPBAN" -> "⏳"
    "FUTUREBAN" -> "📅"
    "PERMABAN" -> "⛔"
    "UNBAN" -> "🕊"
    "GROUPBAN" -> "🚪"
    "ROLE" -> "🎖"
    "APPEAL" -> "📬"
    "RESOLVE" -> "✅"
    else -> "📜"
}

fun logColor(action: String): Color = when (action.uppercase()) {
    "WARN" -> V3.gold
    "MUTE" -> V3.lila
    "TEMPBAN", "PERMABAN" -> V3.danger
    "FUTUREBAN" -> V3.blue
    "UNBAN" -> V3.green
    "GROUPBAN" -> V3.gold
    "ROLE" -> V3.lila
    else -> V3.muted
}
