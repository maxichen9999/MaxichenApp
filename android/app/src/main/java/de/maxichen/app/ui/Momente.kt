package de.maxichen.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.*
import kotlinx.coroutines.launch

/* =====================================================================
   🌸 MOMENTE (24 h)
   ===================================================================== */

@Composable
fun MomenteScreen() {
    var groups by remember { mutableStateOf<List<MomentGroup>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showCreate by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<MomentGroup?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try { groups = Api4.moments() } catch (e: Exception) { }
        loading = false
    }
    LaunchedEffect(Unit) { reload() }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(44.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Title3("Momente 🌸", 23)
                Muted3("24 Stunden · dann weg ✨", 11, 1)
            }
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(V3.primaryBrush).clickable { showCreate = true },
                contentAlignment = Alignment.Center,
            ) { Text("＋", fontSize = 20.sp, color = V3.ink) }
        }
        Spacer(Modifier.height(12.dp))

        if (loading) {
            Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { Spinner() }
        } else if (groups.isEmpty()) {
            EmptyState("🌸", "Noch keine Momente", "Teile den ersten ✨")
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(groups.size) { i ->
                    val g = groups[i]
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(V3.glass)
                            .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp))
                            .clickable { viewing = g; scope.launch { g.moments.forEach { Api4.viewMoment(it.id) } } }
                            .padding(9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier.size(52.dp).clip(CircleShape)
                                .background(Brush.linearGradient(listOf(V3.neon, V3.lila)))
                                .padding(2.dp),
                        ) {
                            Box(Modifier.fillMaxSize().clip(CircleShape).background(Color(0xFF241338)), contentAlignment = Alignment.Center) {
                                Text(g.user.avatar.ifEmpty { g.user.displayName.take(1) }, fontSize = 20.sp)
                            }
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(g.user.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp, color = V3.text, maxLines = 1)
                                if (g.mine) { Spacer(Modifier.width(4.dp)); Chip3("ich", V3.neon) }
                                if (g.allSeen && !g.mine) { Spacer(Modifier.width(4.dp)); Chip3("gesehen", V3.muted) }
                            }
                            val last = g.moments.lastOrNull()
                            Muted3(
                                (last?.text?.take(34) ?: "Moment") + " · " + timeAgo(last?.createdAt ?: 0) +
                                    " · " + g.moments.size + " ✨", 10, 1,
                            )
                        }
                        Text("›", fontSize = 20.sp, color = V3.muted)
                    }
                }
                item { Spacer(Modifier.height(96.dp)) }
            }
        }
    }

    if (showCreate) MomentCreateSheet(onDismiss = { showCreate = false }) { scope.launch { reload() } }
    viewing?.let { g ->
        MomentViewer(g, onClose = { viewing = null }, onChanged = { scope.launch { reload() } })
    }
}

/* ---------------- Viewer ---------------- */

@Composable
fun MomentViewer(group: MomentGroup, onClose: () -> Unit, onChanged: () -> Unit) {
    var idx by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    var reactions by remember { mutableStateOf(group.moments.firstOrNull()?.reactions ?: emptyMap()) }
    val m = group.moments.getOrNull(idx)

    LaunchedEffect(idx) { reactions = group.moments.getOrNull(idx)?.reactions ?: emptyMap() }

    Box(Modifier.fillMaxSize().background(Color(0xF20B0418))) {
        if (m == null) { onClose(); return@Box }
        val p = presetById(m.bg) ?: APP_PRESETS.first()
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(p.colors)))
        Box(Modifier.fillMaxSize().background(Color(0x55000000)))

        // Fortschrittsbalken
        Row(Modifier.fillMaxWidth().padding(top = 48.dp, start = 12.dp, end = 12.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            group.moments.forEachIndexed { i, _ ->
                Box(
                    Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(50))
                        .background(if (i <= idx) V3.text else Color(0x44FFFFFF)),
                )
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 58.dp, start = 14.dp, end = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar3(group.user.avatar.ifEmpty { group.user.displayName.take(1) }, 36)
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(group.user.displayName, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = V3.text)
                Muted3(timeAgo(m.createdAt) + " · " + m.viewers + " 👀", 9, 1)
            }
            Box(Modifier.size(30.dp).clip(CircleShape).background(Color(0x33FFFFFF)).clickable { onClose() },
                contentAlignment = Alignment.Center) { Text("✕", fontSize = 13.sp, color = V3.text) }
        }

        // Inhalt
        Column(
            Modifier.fillMaxSize().padding(horizontal = 22.dp),
            verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (m.kind == "photo" || m.kind == "video") {
                val bmp = remember(m.id) { DecodeBase64(m.data.ifEmpty { m.text }) }
                if (bmp != null) {
                    Image(bitmap = bmp.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).clip(RoundedCornerShape(20.dp)))
                } else {
                    Text("🖼", fontSize = 60.sp)
                }
            }
            if (m.kind != "photo" && m.kind != "video" && m.text.isNotEmpty()) {
                Text(m.text, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = V3.text,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }

        // Reaktionen + Navigation
        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 20.dp, vertical = 34.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            listOf("💗", "😂", "🔥", "😮").forEach { e ->
                val mine = reactions.values.contains(e)
                Box(
                    Modifier.padding(horizontal = 4.dp).clip(CircleShape)
                        .background(if (mine) Color(0x66FF7EDB) else Color(0x33FFFFFF))
                        .clickable {
                            scope.launch {
                                try {
                                    reactions = Api4.reactMoment(m.id, e)
                                    onChanged()
                                } catch (ex: ApiError) { Hub.toast("💔", "Fehler", ex.msg) }
                            }
                        }.padding(horizontal = 12.dp, vertical = 7.dp),
                ) { Text(e + " " + reactions.values.count { it == e }, fontFamily = Outfit, fontSize = 12.sp, color = V3.text) }
            }
        }

        Row(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f).fillMaxHeight().clickable {
                if (idx > 0) idx-- else onClose()
            })
            Box(Modifier.weight(1f).fillMaxHeight().clickable {
                if (idx < group.moments.size - 1) idx++ else onClose()
            })
        }

        if (group.mine) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(end = 18.dp, bottom = 92.dp)
                    .size(40.dp).clip(CircleShape).background(Color(0x44FF5C7A)).clickable {
                        scope.launch {
                            try { Api4.deleteMoment(m.id); onChanged(); onClose() }
                            catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { Text("🗑", fontSize = 15.sp) }
        }
    }
}

/* ---------------- Erstellen ---------------- */

@Composable
fun MomentCreateSheet(onDismiss: () -> Unit, onCreated: () -> Unit) {
    var text by remember { mutableStateOf("") }
    var bg by remember { mutableStateOf("pink-dream") }
    var photo by remember { mutableStateOf<String?>(null) }
    var privacy by remember { mutableStateOf("all") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val d = compressToDataUrl(ctx, uri, 1080, 1_400_000)
            if (d == null) Hub.toast("💔", "Bild zu groß", "") else photo = d
        }
    }

    SheetScaffold("🌸 Moment teilen", onDismiss) {
        Column(Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
            Box(
                Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(18.dp))
                    .background(
                        photo?.let { Brush.verticalGradient(listOf(Color(0x22FFFFFF), Color(0x22FFFFFF))) }
                            ?: Brush.verticalGradient((presetById(bg) ?: APP_PRESETS.first()).colors),
                    )
                    .border(1.dp, V3.glassBorder, RoundedCornerShape(18.dp))
                    .clickable { pick.launch("image/*") },
                contentAlignment = Alignment.Center,
            ) {
                val bmp = remember(photo) { photo?.let { DecodeBase64(it) } }
                if (bmp != null) {
                    Image(bitmap = bmp.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(18.dp)))
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (text.isEmpty()) "📷 Tippen für Foto" else text, fontFamily = Outfit,
                            fontWeight = FontWeight.Bold, fontSize = 15.sp, color = V3.text,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Spacer(Modifier.height(4.dp))
                        Muted3("Foto · Text · Farbverlauf", 9, 1)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            V2TextField(text, { text = it }, "Was denkst du gerade? 💭", minHeight = 48)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                ChipFilter("👀 Alle", privacy == "all") { privacy = "all" }
                ChipFilter("💗 Freunde", privacy == "friends") { privacy = "friends" }
                ChipFilter("🔒 Nur ich", privacy == "private") { privacy = "private" }
                if (photo != null) ChipFilter("✕ Foto weg", false) { photo = null }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                APP_PRESETS.take(6).forEach { p ->
                    Box(
                        Modifier.weight(1f).height(30.dp).clip(RoundedCornerShape(9.dp))
                            .background(Brush.verticalGradient(p.colors))
                            .border(if (bg == p.id) 2.dp else 1.dp, if (bg == p.id) V3.neon else V3.glassBorder, RoundedCornerShape(9.dp))
                            .clickable { bg = p.id; photo = null },
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            NeonButton3(if (busy) "Poste…" else "Moment posten 🌸", loading = busy) {
                if (text.trim().isEmpty() && photo == null) { Hub.toast("⚠️", "Leer", "Text oder Foto fehlt"); return@NeonButton3 }
                busy = true
                scope.launch {
                    try {
                        Api4.postMoment(if (photo != null) "photo" else "text", text.trim(), photo ?: "", bg, privacy)
                        Hub.toast("🌸", "Moment online", "24 Stunden sichtbar")
                        onCreated()
                        onDismiss()
                    } catch (e: ApiError) { Hub.toast("💔", "Fehler", e.msg) }
                    busy = false
                }
            }
        }
    }
}
