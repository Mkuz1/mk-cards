package app.mkcards

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

object MK {
    val navy = Color(0xFF0F2343)
    val navyTop = Color(0xFF1D3D70)
    val deep = Color(0xFF0B1A33)
    val gold = Color(0xFFB0892F)
    val softGold = Color(0xFFD5B757)
    val page = Color(0xFFEEF1F6)
    val ink = Color(0xFF0D1B33)
    val muted = Color(0xFF5B6680)
    val salesforce = Color(0xFF0B6FA4)
}

@Composable
fun MKTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = MK.navy, onPrimary = Color.White, secondary = MK.gold, background = MK.page, surface = Color.White,
            onBackground = MK.ink, onSurface = MK.ink, surfaceVariant = Color(0xFFE6EAF2), secondaryContainer = Color(0xFFDDE4F2),
        ),
        content = content,
    )
}

/** Small line icons drawn from SVG paths (24×24), so no large icon library is needed. */
object MKIcons {
    private fun icon(name: String, path: String): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
            .addPath(PathParser().parsePathString(path).toNodes(), fill = SolidColor(Color.Black)).build()

    val cards = icon("cards", "M4,8h16c1.1,0 2,0.9 2,2v9c0,1.1 -0.9,2 -2,2H4c-1.1,0 -2,-0.9 -2,-2v-9c0,-1.1 0.9,-2 2,-2zM6,4h12v2H6zM8,1h8v2H8z")
    val qr = icon("qr", "M3,11h8V3H3V11zM5,5h4v4H5V5zM3,21h8v-8H3V21zM5,15h4v4H5V15zM13,3v8h8V3H13zM19,9h-4V5h4V9zM19,19h2v2h-2zM13,13h2v2h-2zM15,15h2v2h-2zM13,17h2v2h-2zM15,19h2v2h-2zM17,17h2v2h-2zM17,13h2v2h-2zM19,15h2v2h-2z")
    val scan = icon("scan", "M3,9V3h6v2H5v4H3zM15,3h6v6h-2V5h-4V3zM21,15v6h-6v-2h4v-4h2zM9,21H3v-6h2v4h4v2zM7,11h10v2H7z")
    val people = icon("people", "M9,12c2.2,0 4,-1.8 4,-4S11.2,4 9,4 5,5.8 5,8s1.8,4 4,4zM9,14c-2.7,0 -8,1.3 -8,4v2h16v-2c0,-2.7 -5.3,-4 -8,-4zM16.5,12c1.7,0 3,-1.3 3,-3s-1.3,-3 -3,-3c-0.4,0 -0.7,0.1 -1,0.2 0.6,0.8 1,1.8 1,2.8s-0.4,2 -1,2.8c0.3,0.1 0.6,0.2 1,0.2zM18.5,14.4c1.3,0.9 2,2 2,3.6v2h3v-2c0,-2 -2.6,-3.2 -5,-3.6z")
    val account = icon("account", "M12,2C6.5,2 2,6.5 2,12s4.5,10 10,10 10,-4.5 10,-10S17.5,2 12,2zM12,6c1.9,0 3.5,1.6 3.5,3.5S13.9,13 12,13 8.5,11.4 8.5,9.5 10.1,6 12,6zM12,20c-2.5,0 -4.7,-1.2 -6.2,-3.1 0.1,-2 4.1,-3.1 6.2,-3.1s6.1,1.1 6.2,3.1C16.7,18.8 14.5,20 12,20z")
    val pass = icon("pass", "M4,5h16c1.1,0 2,0.9 2,2v10c0,1.1 -0.9,2 -2,2H4c-1.1,0 -2,-0.9 -2,-2V7c0,-1.1 0.9,-2 2,-2zM4,9v2h16V9zM6,14v2h6v-2z")
    val plus = icon("plus", "M11,5h2v6h6v2h-6v6h-2v-6H5v-2h6z")
    val back = icon("back", "M15.4,4.6L8,12l7.4,7.4 1.4,-1.4L10.8,12l6,-6z")
    val chevron = icon("chevron", "M8.6,6l1.4,-1.4L17.4,12 10,19.4 8.6,18l6,-6z")
    val cloud = icon("cloud", "M19.4,10c-0.7,-3.4 -3.7,-6 -7.4,-6 -2.9,0 -5.4,1.6 -6.7,4C2.3,8.4 0,10.9 0,14c0,3.3 2.7,6 6,6h13c2.8,0 5,-2.2 5,-5 0,-2.6 -2.1,-4.8 -4.6,-5z")
    val offline = icon("offline", "M3.3,2.3L2,3.6 5.4,7C3.4,8.3 2,10.5 2,13c0,3.3 2.7,6 6,6h9.4l2.3,2.3 1.3,-1.3zM19.4,10c-0.7,-3.4 -3.7,-6 -7.4,-6 -1.3,0 -2.5,0.3 -3.6,0.9l11.5,11.5C21.2,15.9 22,14.5 22,13c0,-1.5 -1.1,-2.8 -2.6,-3z")
}

/** A big navy button with a gold edge, or a white one. */
@Composable
fun MKButton(text: String, modifier: Modifier = Modifier, light: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    // Buttons that share a row get less padding, and their label stays on one line.
    val pad = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)
    if (light) {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White, contentColor = MK.ink), contentPadding = pad) {
            Text(text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
        }
    } else {
        Button(onClick = onClick, enabled = enabled, modifier = modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MK.navy, contentColor = Color.White), contentPadding = pad) {
            Text(text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
        }
    }
}

fun initials(name: String): String =
    name.trim().split(Regex("\\s+")).take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("").ifEmpty { "MK" }

fun accentColor(hex: String): Color = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(MK.navy)

@Composable
fun Avatar(name: String, size: Int = 44, ring: Boolean = false) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Brush.verticalGradient(listOf(MK.navyTop, MK.navy)))
            .then(if (ring) Modifier.border(1.5.dp, MK.softGold, CircleShape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials(name), color = Color.White, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = (size * 0.36).sp)
    }
}

/** The card in its own colours, like the card page. */
@Composable
fun CardTile(card: CardEntry, modifier: Modifier = Modifier) {
    val accent = accentColor(card.accent)
    Row(
        modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(accent.copy(alpha = 0.95f), MK.deep)))
            .border(1.dp, MK.softGold.copy(alpha = 0.35f), RoundedCornerShape(22.dp))
            .padding(18.dp).alpha(if (card.active) 1f else 0.7f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(54.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f)).border(1.5.dp, MK.softGold, CircleShape),
            contentAlignment = Alignment.Center) {
            Text(initials(card.name), color = Color.White, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 19.sp)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            if (card.company.isNotBlank()) Text(card.company.uppercase(), color = MK.softGold, fontSize = 10.5.sp, letterSpacing = 1.8.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(card.name, color = Color.White, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 20.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (card.title.isNotBlank()) Text(card.title, color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(card.displayName.uppercase(), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 4.dp))
            if (!card.active) Text("OFF", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color(0xCCC2334C)).padding(horizontal = 8.dp, vertical = 4.dp))
        }
    }
}

/** A square QR code picture. */
fun qrBitmap(text: String, size: Int = 720): Bitmap {
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 0, EncodeHintType.CHARACTER_SET to "UTF-8"))
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    for (x in 0 until size) for (y in 0 until size) bmp.setPixel(x, y, if (matrix[x, y]) 0xFF0D1326.toInt() else 0xFFFFFFFF.toInt())
    return bmp
}

/** Shown at the top of screens while there is no connection. */
@Composable
fun OfflineBanner(state: AppState) {
    if (!state.offline) return
    Row(Modifier.fillMaxWidth().background(Color(0xFFFFF4D6)).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.material3.Icon(MKIcons.offline, null, tint = Color(0xFF8A6100), modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            if (state.pendingCount > 0) "Offline: showing saved data. ${state.pendingCount} contact${if (state.pendingCount == 1) "" else "s"} waiting to upload."
            else "Offline: showing your saved cards and contacts.",
            color = Color(0xFF6B4B00), fontSize = 13.sp,
        )
    }
}
