package de.maxichen.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import de.maxichen.app.ui.AppLockScreen
import de.maxichen.app.ui.LockState
import de.maxichen.app.ui.MainScreen3
import de.maxichen.app.ui.AccountStore
import de.maxichen.app.ui.V2Theme
import de.maxichen.app.ui.AuthScreen2
import de.maxichen.app.ui.DemoMode
import de.maxichen.app.ui.MaxiTheme
import de.maxichen.app.ui.DemoScreen
import de.maxichen.app.ui.OnboardingScreen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LockState.init(this)
        SecureScreen.attach(this)
        SecureScreen.onCaptured = {
            Hub.toast("📸", "Screenshot erkannt", "Der Chat wurde informiert.")
            val chatId = Hub.activeChatId.value
            if (!chatId.isNullOrEmpty()) HubScope.launch { Api4.reportScreenshot(chatId) }
        }
        if (android.os.Build.VERSION.SDK_INT >= 34) SecureScreen.registerCaptureDetection(this)
        requestPermissionsSafely()
        setContent {
            V2Theme(dark = true) {
                LoveChatRoot(openExtra = intent?.getStringExtra("openChat") ?: "")
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val chat = intent.getStringExtra("openChat")
        if (!chat.isNullOrEmpty()) Hub.chatIdToOpen = chat
    }

    override fun onRestart() {
        super.onRestart()
        AppInBg.inBackground = false
        LockState.onForeground()
    }

    override fun onStop() {
        super.onStop()
        AppInBg.inBackground = true
        LockState.onBackground()
    }

    private fun requestPermissionsSafely() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }
}

@Composable
fun LoveChatRoot(openExtra: String) {
    val user = Hub.user.collectAsState().value
    val ctx = LocalContext.current
    var booted by remember { mutableStateOf(false) }
    LaunchedEffect(true) { booted = true }

    // Token vorhanden? → automatisch anmelden
    // 🎨 V4.11: Theme laden, BEVOR gezeichnet wird
    LaunchedEffect(Unit) { MaxiTheme.attach(ctx) }

    LaunchedEffect(booted) {
        if (booted && Hub.token.isNotEmpty() && Hub.user.value == null) {
            val ok = Hub.enterApp()
            if (!ok) Hub.reset()
        }
    }

    // WebRTC initialisieren (EglBase für Video-Rendering)
    LaunchedEffect(Unit) { CallManager.init(ctx) }

    // 👥 V4.4: gespeicherte Multi-Accounts aus dem DataStore laden
    LaunchedEffect(Hub.accountsRaw) { if (Hub.accountsRaw.isNotEmpty()) AccountStore.load(Hub.accountsRaw) }
    LaunchedEffect(user?.id) {
        if (user != null && Hub.token.isNotEmpty()) {
            AccountStore.remember(
                user.id, user.username, user.displayName, user.avatar, user.phone.ifEmpty { "" }, Hub.token,
            )
        }
    }

    Hub.logoutAction = {
        Hub.reset()
        Hub.saveToken("")
        try {
            ctx.stopService(Intent(ctx, ConnectService::class.java))
        } catch (e: Exception) {}
    }

    // Service starten, sobald angemeldet
    LaunchedEffect(user?.id) {
        if (user != null) {
            try {
                val i = Intent(ctx, ConnectService::class.java)
                ContextCompat.startForegroundService(ctx, i)
            } catch (e: Exception) {}
        }
    }

    // 👀 V4.9.1: Demo-Modus (kein Konto, kein Server) hat Vorrang
    if (DemoMode.active) {
        DemoScreen()
        return
    }

    // 🌸 V4.9.1: Onboarding nur beim allerersten Start
    var onboarded by remember { mutableStateOf(true) }
    LaunchedEffect(booted) {
        onboarded = ctx.getSharedPreferences("maxichat_ui", android.content.Context.MODE_PRIVATE)
            .getBoolean("onboarded_v491", false)
    }
    if (!onboarded) {
        OnboardingScreen(
            onDone = {
                ctx.getSharedPreferences("maxichat_ui", android.content.Context.MODE_PRIVATE)
                    .edit().putBoolean("onboarded_v491", true).apply()
                onboarded = true
            },
            onDemo = {
                ctx.getSharedPreferences("maxichat_ui", android.content.Context.MODE_PRIVATE)
                    .edit().putBoolean("onboarded_v491", true).apply()
                onboarded = true
                DemoMode.active = true
            },
        )
        return
    }

    if (user == null) {
        // 📱 V4.13: Anmeldung wie bei WhatsApp (Nummer → WhatsApp-Code → Profil → Mail-Code).
        // Wer schon ein Konto hat, kommt über den kleinen Link unten zum klassischen Login.
        var klassisch by remember { mutableStateOf(false) }
        if (klassisch) {
            AuthScreen2(onSuccess = {
                HubScope.launch {
                    val ok = Hub.enterApp()
                    if (!ok) Hub.reset()
                }
            })
        } else {
            de.maxichen.app.ui.WhatsAppOnboarding(
                onDone = { token ->
                    HubScope.launch {
                        try { Hub.adoptToken(token) } catch (e: Throwable) {}
                        val ok = Hub.enterApp()
                        if (!ok) Hub.reset()
                    }
                },
                onDemo = {
                    DemoMode.active = true
                    HubScope.launch { Hub.enterApp() }
                },
            )
        }
    } else if (LockState.enabled() && !LockState.unlocked) {
        AppLockScreen(onUnlocked = { })
    } else {
        MainScreen3(openExtra = openExtra)
    }
}
