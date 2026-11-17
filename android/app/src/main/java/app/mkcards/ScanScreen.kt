package app.mkcards

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Scanning: Google's document scanner for business cards (text and any QR code read on the phone), Google's code
 * scanner for badges. Online, MK Cards tidies the details; offline, the phone's own reading is used and the contact
 * waits on the phone until it can be sent.
 */
@Composable
fun ScanScreen(state: AppState, activity: MainActivity) {
    val prefs = remember { activity.getSharedPreferences("scan", Context.MODE_PRIVATE) }
    var event by remember { mutableStateOf(prefs.getString("event", "") ?: "") }
    var draft by remember { mutableStateOf<Draft?>(null) }
    var reading by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val docLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        val uri = GmsDocumentScanningResult.fromActivityResultIntent(result.data)?.pages?.firstOrNull()?.imageUri ?: return@rememberLauncherForActivityResult
        reading = true
        scope.launch {
            draft = readCard(activity, state, uri).also { it.event = event }
            reading = false
        }
    }

    fun scanCard() {
        val options = GmsDocumentScannerOptions.Builder().setGalleryImportAllowed(true).setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG).setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL).build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
            .addOnSuccessListener { docLauncher.launch(IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener { state.message = "The card scanner is not available on this phone." }
    }

    fun scanBadge() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build()
        GmsBarcodeScanning.getClient(activity, options).startScan()
            .addOnSuccessListener { code ->
                val found = QrContact.parse(code.rawValue.orEmpty()) ?: Draft()
                draft = found.copy(source = "badge", event = event)
            }
            .addOnFailureListener { state.message = "The badge scanner is not available on this phone." }
    }

    Column {
        Header("Scan")
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Photograph a business card or an event badge. The details are read for you and added to your contacts.", color = MK.muted)
            ScanOption("Business card", "Take a photo; the details are read for you", MKIcons.cards) { scanCard() }
            ScanOption("Event badge", "Point the camera at the badge's QR code", MKIcons.qr) { scanBadge() }
            ScanOption("Type it in", "Add someone by hand", MKIcons.plus) { draft = Draft(source = "manual", event = event) }
            OutlinedTextField(event, { event = it; prefs.edit().putString("event", it).apply() }, label = { Text("Event (kept for your next scans)") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
            saved?.let { Text("✓ $it", color = Color(0xFF18794E), fontWeight = FontWeight.SemiBold) }
            Text("Photos are only used to read the details and are not kept. Scanning works offline too.", color = MK.muted, fontSize = 12.sp)
        }
    }
    if (reading) Dialog(onDismissRequest = {}) {
        Column(Modifier.clip(RoundedCornerShape(20.dp)).background(Color.White).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Text("Reading the card…", modifier = Modifier.padding(top = 12.dp))
        }
    }
    draft?.let { d ->
        ReviewDialog(d, onClose = { draft = null }) { final ->
            scope.launch {
                val online = state.saveContact(final)
                saved = if (online) "${final.name} saved to your contacts" else "${final.name} saved on your phone; it uploads when you're back online"
                draft = null
            }
        }
    }
}

@Composable
private fun ScanOption(title: String, detail: String, icon: ImageVector, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(54.dp).clip(RoundedCornerShape(16.dp)).background(Brush.verticalGradient(listOf(MK.navyTop, MK.navy))), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Color.White, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, color = MK.ink)
            Text(detail, color = MK.muted, fontSize = 14.sp)
        }
        Icon(MKIcons.chevron, null, tint = Color(0xFFB4BCCD), modifier = Modifier.size(18.dp))
    }
}

/** Reads the scanned card on the phone, then asks MK Cards to tidy it; falls back to the phone's reading offline. */
private suspend fun readCard(context: Context, state: AppState, uri: Uri): Draft = withContext(Dispatchers.IO) {
    val bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: return@withContext Draft()
    val small = scale(bitmap, 1600)
    val image = InputImage.fromBitmap(small, 0)
    val text = runCatching { Tasks.await(TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(image)).text }.getOrDefault("")
    val qr = runCatching {
        Tasks.await(BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()).process(image))
            .firstOrNull()?.rawValue
    }.getOrNull()
    if (!qr.isNullOrBlank()) {
        val found = QrContact.parse(qr)
        if (found != null && (found.name.isNotBlank() || found.email.isNotBlank())) return@withContext found.copy(source = "badge")
    }
    try {
        val jpeg = ByteArrayOutputStream().also { small.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
        val body = JSONObject().put("image", "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP)).put("text", text)
        val f = Api.call("/api/scan/read", "POST", body, timeoutMs = 60_000).optJSONObject("fields") ?: JSONObject()
        val emails = f.optJSONArray("emails")
        val phones = f.optJSONArray("phones")
        val phoneList = (0 until (phones?.length() ?: 0)).map { phones!!.getJSONObject(it) }
        Draft(
            source = "scan", name = f.optString("name"), title = f.optString("title"), company = f.optString("company"),
            email = emails?.optString(0).orEmpty(),
            mobile = phoneList.firstOrNull { it.optString("label") == "mobile" }?.optString("value").orEmpty(),
            phone = phoneList.firstOrNull { it.optString("label") != "mobile" }?.optString("value").orEmpty(),
            website = f.optString("website").ifBlank { f.optString("linkedin") }, address = f.optString("address"),
            note = f.optString("department"),
        )
    } catch (e: Exception) {
        withContext(Dispatchers.Main) {
            if (e is Api.Offline) state.offline = true
            state.message = if (e is Api.Offline) "Offline: details read on your phone. Please check them." else e.message
        }
        QrContact.fromText(text)
    }
}

private fun scale(b: Bitmap, max: Int): Bitmap {
    val longest = maxOf(b.width, b.height)
    if (longest <= max) return b
    val r = max.toFloat() / longest
    return Bitmap.createScaledBitmap(b, (b.width * r).toInt(), (b.height * r).toInt(), true)
}

@Composable
fun ReviewDialog(start: Draft, onClose: () -> Unit, onSave: (Draft) -> Unit) {
    var d by remember { mutableStateOf(start.copy()) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(MK.page)) {
            Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onClose) { Text("Cancel") }
                Text(if (d.source == "manual") "New contact" else "Check the details", Modifier.weight(1f), fontWeight = FontWeight.Bold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                TextButton(onClick = { onSave(d) }, enabled = d.name.isNotBlank()) { Text("Save", fontWeight = FontWeight.Bold) }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (d.source != "manual") Text("Correct anything that was misread before saving.", color = MK.muted, fontSize = 13.sp)
                @Composable
                fun field(label: String, value: String, set: (String) -> Unit) =
                    OutlinedTextField(value, set, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), singleLine = label != "Note")
                field("Name", d.name) { d = d.copy(name = it) }
                field("Job title", d.title) { d = d.copy(title = it) }
                field("Company", d.company) { d = d.copy(company = it) }
                field("Email", d.email) { d = d.copy(email = it) }
                field("Mobile", d.mobile) { d = d.copy(mobile = it) }
                field("Phone", d.phone) { d = d.copy(phone = it) }
                field("Website", d.website) { d = d.copy(website = it) }
                field("Address", d.address) { d = d.copy(address = it) }
                field("Event", d.event) { d = d.copy(event = it) }
                field("Note", d.note) { d = d.copy(note = it) }
            }
        }
    }
}
