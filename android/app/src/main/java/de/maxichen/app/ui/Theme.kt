package de.maxichen.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.maxichen.app.Hub
import de.maxichen.app.ToastItem
import kotlinx.coroutines.delay

/* =====================================================================
   🌸 BASIS-THEME
   ===================================================================== */

@Composable
fun V2Theme(dark: Boolean = true, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = V3.neon, secondary = V3.lila, tertiary = V3.blue,
            background = Color(0xFF1A0A2E), surface = Color(0xFF241338),
            onPrimary = V3.ink, onBackground = V3.text, onSurface = V3.text,
        ),
        typography = androidx.compose.material3.Typography(
            bodyLarge = TextStyle(fontFamily = Outfit, fontSize = 14.sp),
            bodyMedium = TextStyle(fontFamily = Outfit, fontSize = 13.sp),
        ),
        content = content,
    )
}

/* =====================================================================
   ⌨️ EINGABEFELD
   ===================================================================== */

@Composable
fun V2TextField(
    value: String, onChange: (String) -> Unit, placeholder: String,
    modifier: Modifier = Modifier, password: Boolean = false,
    minHeight: Int = 52, keyboard: KeyboardType = KeyboardType.Text, singleLine: Boolean = true,
    leading: String = "",
) {
    Box(
        modifier.fillMaxWidth().heightIn(min = minHeight.dp).clip(RoundedCornerShape(16.dp))
            .background(V3.glass).border(1.dp, V3.glassBorder, RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (leading.isNotEmpty()) { Text(leading, fontSize = 15.sp); Spacer(Modifier.width(8.dp)) }
            Box(Modifier.weight(1f)) {
                if (value.isEmpty()) {
                    Text(placeholder, fontFamily = Outfit, fontSize = 13.sp, color = V3.muted.copy(alpha = 0.85f), maxLines = 1)
                }
                BasicTextField(
                    value = value, onValueChange = onChange,
                    singleLine = singleLine, maxLines = if (singleLine) 1 else 5,
                    textStyle = TextStyle(fontFamily = Outfit, fontSize = 13.5.sp, color = V3.text),
                    cursorBrush = SolidColor(V3.neon),
                    visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(keyboardType = keyboard),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/* =====================================================================
   💬 TOASTS
   ===================================================================== */

@Composable
fun ToastLayer() {
    val toasts by Hub.toasts.collectAsState()
    Column(
        Modifier.fillMaxSize().padding(horizontal = 14.dp),
        verticalArrangement = Arrangement.Top, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(50.dp))
        toasts.takeLast(3).forEach { t -> ToastCard(t) }
    }
}

@Composable
private fun ToastCard(t: ToastItem) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(t.id) {
        visible = true
        delay(2600)
        visible = false
        delay(220)
        Hub.popToast(t.id)
    }
    AnimatedVisibility(visible, enter = fadeIn() + slideInVertically { -it / 2 }, exit = fadeOut() + slideOutVertically { -it / 2 }) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(18.dp))
                .background(Color(0xF2241338))
                .border(1.dp, V3.neon.copy(alpha = 0.35f), RoundedCornerShape(18.dp))
                .clickable { Hub.popToast(t.id) }.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(t.icon, fontSize = 18.sp)
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(t.title, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = V3.text, maxLines = 1)
                if (t.sub.isNotEmpty()) Text(t.sub, fontFamily = Outfit, fontSize = 10.5.sp, color = V3.muted, maxLines = 2)
            }
        }
    }
}

/* =====================================================================
   ⏳ SPINNER · LEERZUSTAND
   ===================================================================== */

@Composable
fun Spinner(color: Color = V3.neon) {
    androidx.compose.material3.CircularProgressIndicator(
        modifier = Modifier.size(20.dp), color = color, strokeWidth = 2.dp,
    )
}

@Composable
fun EmptyState(icon: String, title: String, sub: String = "") {
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(icon, fontSize = 46.sp)
        Spacer(Modifier.height(10.dp))
        Text(title, fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = V3.text)
        if (sub.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(sub, fontFamily = Outfit, fontSize = 11.5.sp, color = V3.muted)
        }
    }
}

@Composable
fun Dot(online: Boolean) {
    Box(Modifier.size(8.dp).clip(CircleShape).background(if (online) V3.green else V3.muted.copy(alpha = 0.4f)))
}
