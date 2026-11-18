package app.mkcards

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private fun hexColour(hex: String, fallback: Color = MK.navy): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(fallback)

// ---------- barcodes (drawn on the phone, so passes work offline) ----------

private val ZXING = mapOf(
    "qr" to BarcodeFormat.QR_CODE, "pdf417" to BarcodeFormat.PDF_417, "aztec" to BarcodeFormat.AZTEC,
    "code128" to BarcodeFormat.CODE_128, "ean13" to BarcodeFormat.EAN_13, "code39" to BarcodeFormat.CODE_39,
)

fun barcodeBitmap(format: String, value: String): Bitmap? {
    val f = ZXING[format] ?: return null
    if (value.isBlank()) return null
    return runCatching {
        val text = when (format) {
            "code39" -> value.uppercase()
            else -> value
        }
        val square = format == "qr" || format == "aztec"
        val w = if (square) 600 else 900
        val h = if (square) 600 else if (format == "pdf417") 300 else 260
        val m = MultiFormatWriter().encode(text, f, w, h, mapOf(EncodeHintType.MARGIN to 0, EncodeHintType.CHARACTER_SET to "UTF-8"))
        val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.RGB_565)
        val row = IntArray(m.width)
        for (y in 0 until m.height) {
            for (x in 0 until m.width) row[x] = if (m[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
            bmp.setPixels(row, 0, m.width, 0, y, m.width, 1)
        }
        bmp
    }.getOrNull()
}

@Composable
fun BarcodeBox(pass: Pass, big: Boolean = false) {
    val square = pass.barcodeFormat == "qr" || pass.barcodeFormat == "aztec"
    val bmp = remember(pass.barcodeFormat, pass.barcodeValue) { barcodeBitmap(pass.barcodeFormat, pass.barcodeValue) }
    Column(Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White).padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (bmp != null) {
            Image(bmp.asImageBitmap(), "Barcode", filterQuality = FilterQuality.None, contentScale = ContentScale.FillBounds,
                modifier = if (square) Modifier.size(if (big) 210.dp else 130.dp) else Modifier.width(if (big) 290.dp else 220.dp).height(if (big) 90.dp else 64.dp))
        } else {
            Text(if (pass.barcodeValue.isBlank()) "Barcode appears here" else "This value does not fit this kind of code",
                color = MK.muted, fontSize = 12.sp, modifier = Modifier.padding(16.dp))
        }
        val under = pass.barcodeText.ifBlank { if (square) "" else pass.barcodeValue }
        if (under.isNotBlank()) Text(under, color = Color.Black, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

// ---------- pictures (kept on the phone so passes show offline) ----------

private fun decodeDataUrl(ref: String): Bitmap? {
    val comma = ref.indexOf(',')
    if (!ref.startsWith("data:") || comma < 0) return null
    val bytes = runCatching { Base64.decode(ref.substring(comma + 1), Base64.DEFAULT) }.getOrNull() ?: return null
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}

@Composable
fun PassPicture(ref: String, modifier: Modifier, crop: Boolean = false) {
    val context = LocalContext.current
    val bmp by produceState<Bitmap?>(null, ref) {
        value = withContext(Dispatchers.IO) {
            decodeDataUrl(ref) ?: run {
                if (!ref.startsWith("/media/")) return@run null
                val file = File(File(context.cacheDir, "pass-images").apply { mkdirs() }, ref.replace('/', '_'))
                if (!file.exists()) runCatching { file.writeBytes(URL(Api.site + ref).readBytes()) }
                if (file.exists()) BitmapFactory.decodeFile(file.absolutePath) else null
            }
        }
    }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), null, modifier, contentScale = if (crop) ContentScale.Crop else ContentScale.Fit)
    else Box(modifier)
}

/** Fits or fills a picked picture to the wallet's size and returns it as a PNG data: URL. */
private fun pictureDataUrl(source: Bitmap, kind: String): String {
    val (w, h, fill) = when (kind) {
        "logo" -> Triple(480, 150, false)
        "photo" -> Triple(270, 330, true)
        else -> Triple(750, 246, true)
    }
    val scale = if (fill) maxOf(w.toFloat() / source.width, h.toFloat() / source.height)
    else minOf(w.toFloat() / source.width, h.toFloat() / source.height, 1f)
    val dw = (source.width * scale).toInt().coerceAtLeast(1)
    val dh = (source.height * scale).toInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(source, dw, dh, true)
    val out = if (fill) Bitmap.createBitmap(scaled, (dw - w).coerceAtLeast(0) / 2, (dh - h).coerceAtLeast(0) / 2, minOf(w, dw), minOf(h, dh)) else scaled
    val buffer = ByteArrayOutputStream()
    out.compress(Bitmap.CompressFormat.PNG, 100, buffer)
    return "data:image/png;base64," + Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP)
}

// ---------- the pass as it looks in the wallet ----------

@Composable
fun PassFace(pass: Pass, big: Boolean = false, withBarcode: Boolean = true, hints: PassTemplate? = null) {
    val fg = hexColour(pass.fg, Color.White)
    val label = hexColour(pass.labelColour, Color.White)
    val pad = if (big) 20.dp else 16.dp

    @Composable
    fun Field(f: PassField, hint: String, large: Boolean = false, end: Boolean = false, modifier: Modifier = Modifier) {
        if (f.value.isBlank() && hint.isBlank()) return
        Column(modifier, horizontalAlignment = if (end) Alignment.End else Alignment.Start) {
            Text(f.label.uppercase(), color = label, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, maxLines = 1)
            Text(f.value.ifBlank { hint }, color = fg.copy(alpha = if (f.value.isBlank()) 0.5f else 1f),
                fontSize = if (large) 24.sp else 15.sp, fontWeight = if (large) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = if (end) TextAlign.End else TextAlign.Start)
        }
    }

    Column(
        Modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp))
            .background(hexColour(pass.bg)).padding(horizontal = pad, vertical = pad),
        verticalArrangement = Arrangement.spacedBy(if (big) 16.dp else 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (pass.logo.isNotBlank()) {
                PassPicture(pass.logo, Modifier.height(30.dp).width(96.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(pass.org.ifBlank { pass.title }, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Field(pass.header, hints?.header?.sample.orEmpty(), end = true)
        }
        when {
            pass.kind == "transit" -> Row(verticalAlignment = Alignment.CenterVertically) {
                Field(pass.primary, hints?.primary?.sample.orEmpty(), large = true, modifier = Modifier.weight(1f))
                Text("→", color = label, fontSize = 24.sp)
                Field(pass.to, hints?.to?.sample.orEmpty(), large = true, end = true, modifier = Modifier.weight(1f))
            }
            pass.showsBanner && pass.banner.isNotBlank() -> Box(Modifier.fillMaxWidth().padding(horizontal = 0.dp).heightIn(min = 90.dp)) {
                PassPicture(pass.banner, Modifier.matchParentSize(), crop = true)
                Box(Modifier.padding(vertical = 14.dp, horizontal = 4.dp)) { Field(pass.primary, hints?.primary?.sample.orEmpty(), large = true) }
            }
            else -> Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { Field(pass.primary, hints?.primary?.sample.orEmpty(), large = true) }
                if (pass.showsPhoto && pass.photo.isNotBlank()) PassPicture(pass.photo, Modifier.width(64.dp).height(78.dp).clip(RoundedCornerShape(6.dp)), crop = true)
            }
        }
        pass.front.take(4).chunked(2).forEachIndexed { row, pair ->
            Row {
                Field(pair[0], hints?.front?.getOrNull(row * 2)?.sample.orEmpty(), modifier = Modifier.weight(1f))
                if (pair.size > 1) Field(pair[1], hints?.front?.getOrNull(row * 2 + 1)?.sample.orEmpty(), end = true, modifier = Modifier.weight(1f))
            }
        }
        if (withBarcode && pass.barcodeFormat != "none") Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { BarcodeBox(pass, big) }
    }
}

// ---------- screens ----------

@Composable
fun PassesScreen(state: AppState, activity: MainActivity) {
    val context = LocalContext.current
    val templates = remember { runCatching { PassTemplates.load(context) }.getOrNull() }
    var open by remember { mutableStateOf<String?>(null) }
    var picking by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Pair<Pass, PassTemplate?>?>(null) }
    val passes = state.me?.passes.orEmpty()

    editing?.let { (pass, template) ->
        BackHandler { editing = null }
        PassEditor(state, activity, pass, template, templates) { saved -> editing = null; if (saved != null) open = saved }
        return
    }
    if (picking && templates != null) {
        BackHandler { picking = false }
        TemplatePicker(templates, close = { picking = false }) { t -> picking = false; editing = t.makePass() to t }
        return
    }
    passes.firstOrNull { it.id == open }?.let { pass ->
        BackHandler { open = null }
        PassDetail(state, activity, pass, close = { open = null },
            edit = { editing = pass to templates?.templates?.firstOrNull { it.id == pass.template } })
        return
    }
    Column {
        Header("Passes") {
            IconButton(onClick = { if (state.offline) state.message = "Adding a pass needs a connection." else picking = true }) { Icon(MKIcons.plus, "Add pass", tint = MK.navy) }
        }
        LazyColumn(contentPadding = PaddingValues(20.dp, 4.dp, 20.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Text("Student and staff IDs, travel passes, tickets, memberships and loyalty cards, on your phone and in Google Wallet.", color = MK.muted, fontSize = 14.sp)
            }
            items(passes, key = { it.id }) { p -> Box(Modifier.clickable { open = p.id }) { PassFace(p, withBarcode = false) } }
            item {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, Color(0xFFB4BCCD), RoundedCornerShape(16.dp))
                        .clickable { if (state.offline) state.message = "Adding a pass needs a connection." else picking = true }.padding(vertical = 26.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(MKIcons.plus, null, tint = MK.navy, modifier = Modifier.size(30.dp))
                    Text(if (passes.isEmpty()) "Add your first pass" else "Add a pass", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("Pick a template or design your own", color = MK.muted, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
private fun TemplatePicker(data: PassTemplates, close: () -> Unit, pick: (PassTemplate) -> Unit) {
    Column {
        Header("Choose a template", back = close)
        LazyColumn(contentPadding = PaddingValues(20.dp, 0.dp, 20.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            data.groups.forEach { group ->
                val list = data.templates.filter { it.group == group }
                if (list.isEmpty()) return@forEach
                item(key = "g-$group") { Text(group.uppercase(), color = MK.gold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp, modifier = Modifier.padding(top = 12.dp)) }
                items(list, key = { it.id }) { t ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White).clickable { pick(t) }.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(46.dp).clip(RoundedCornerShape(11.dp)).background(hexColour(t.bg)), contentAlignment = Alignment.Center) {
                            Text(t.name.take(1), color = hexColour(t.label, Color.White), fontWeight = FontWeight.Bold, fontSize = 20.sp, fontFamily = FontFamily.Serif)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                            Text(t.kindName, color = MK.muted, fontSize = 13.sp)
                        }
                        Icon(MKIcons.chevron, null, tint = Color(0xFFB4BCCD), modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun PassDetail(state: AppState, activity: MainActivity, pass: Pass, close: () -> Unit, edit: () -> Unit) {
    val scope = rememberCoroutineScope()
    var confirm by remember { mutableStateOf(false) }
    // A bright screen makes the barcode easier to scan at gates and tills.
    DisposableEffect(Unit) {
        val window = activity.window
        val before = window.attributes.screenBrightness
        window.attributes = window.attributes.apply { screenBrightness = 1f }
        onDispose { window.attributes = window.attributes.apply { screenBrightness = before } }
    }
    Column {
        Header(pass.title, back = close)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            PassFace(pass, big = true)
            if (state.me?.googleWallet == true) MKButton("Add to Google Wallet") { activity.addPassToGoogleWallet(pass.id) }
            val details = pass.back.filter { it.value.isNotBlank() } + if (pass.notes.isNotBlank()) listOf(PassField("Notes", pass.notes)) else emptyList()
            if (details.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("DETAILS", color = MK.gold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp)
                details.forEach { f ->
                    Column { Text(f.label, color = MK.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold); Text(f.value, fontSize = 15.sp) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MKButton("Edit", Modifier.weight(1f), light = true, enabled = !state.offline) { edit() }
                MKButton("Delete", Modifier.weight(1f), light = true, enabled = !state.offline) { confirm = true }
            }
            Text("A personal copy for convenience, not an official document.", color = MK.muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text("Delete this pass?") },
        text = { Text("A copy already in Google Wallet stays there until you remove it in Wallet.") },
        confirmButton = {
            TextButton(onClick = {
                confirm = false
                scope.launch {
                    if (state.change("/api/passes/${pass.id}", "DELETE") != null) { state.refresh(); close() }
                }
            }) { Text("Delete", color = Color(0xFFC2334C)) }
        },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Keep") } },
    )
}

@Composable
private fun Choice(label: String, options: List<Pair<String, String>>, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        Text(label, color = MK.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Text(options.firstOrNull { it.first == value }?.second ?: value, color = MK.ink, modifier = Modifier.weight(1f), maxLines = 1)
                Text("▾", color = MK.muted)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (v, l) -> DropdownMenuItem(text = { Text(l) }, onClick = { open = false; onChange(v) }) }
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title.uppercase(), color = MK.gold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp)
        content()
    }
}

@Composable
private fun PairRow(f: PassField, hint: String, labelText: String = "Label", valueText: String = "Value", onRemove: (() -> Unit)? = null, onChange: (PassField) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(f.label, { onChange(f.copy(label = it.take(30))) }, Modifier.weight(0.42f), label = { Text(labelText) }, singleLine = true)
        OutlinedTextField(f.value, { onChange(f.copy(value = it.take(80))) }, Modifier.weight(0.58f), label = { Text(valueText) },
            placeholder = { if (hint.isNotBlank()) Text(hint, color = MK.muted) }, singleLine = true)
        if (onRemove != null) TextButton(onClick = onRemove, contentPadding = PaddingValues(0.dp), modifier = Modifier.width(36.dp)) { Text("✕", color = MK.muted) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PassEditor(state: AppState, activity: MainActivity, start: Pass, template: PassTemplate?, data: PassTemplates?, done: (String?) -> Unit) {
    var pass by remember { mutableStateOf(start) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pictureKind by remember { mutableStateOf("logo") }
    var pickingDate by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val isNew = start.id.isEmpty()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val url = withContext(Dispatchers.IO) {
                runCatching {
                    val bmp = activity.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it) }
                    pictureDataUrl(bmp, pictureKind)
                }.getOrNull()
            }
            if (url == null) state.message = "That picture could not be used."
            else pass = when (pictureKind) { "logo" -> pass.copy(logo = url); "photo" -> pass.copy(photo = url); else -> pass.copy(banner = url) }
        }
    }
    fun scanBarcode() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(
            Barcode.FORMAT_QR_CODE, Barcode.FORMAT_PDF417, Barcode.FORMAT_AZTEC, Barcode.FORMAT_CODE_128, Barcode.FORMAT_EAN_13, Barcode.FORMAT_CODE_39,
        ).build()
        GmsBarcodeScanning.getClient(activity, options).startScan().addOnSuccessListener { code ->
            val format = when (code.format) {
                Barcode.FORMAT_PDF417 -> "pdf417"; Barcode.FORMAT_AZTEC -> "aztec"; Barcode.FORMAT_CODE_128 -> "code128"
                Barcode.FORMAT_EAN_13 -> "ean13"; Barcode.FORMAT_CODE_39 -> "code39"; else -> "qr"
            }
            pass = pass.copy(barcodeValue = code.rawValue.orEmpty(), barcodeFormat = format)
        }.addOnFailureListener { state.message = "The scanner could not start. Type the number printed under the barcode instead." }
    }
    fun save() {
        saving = true
        error = null
        scope.launch {
            val reply = withContext(Dispatchers.IO) {
                runCatching {
                    val body = JSONObject().put("pass", pass.toJson())
                    if (isNew) Api.call("/api/passes", "POST", body) else Api.call("/api/passes/${pass.id}", "PUT", body)
                }
            }
            saving = false
            reply.onSuccess { r ->
                state.refresh()
                done(r.optJSONObject("pass")?.optString("id") ?: pass.id)
            }.onFailure { error = it.message }
        }
    }

    Column {
        Header(if (isNew) template?.name ?: "New pass" else "Edit pass", back = { done(null) }) {
            TextButton(onClick = { save() }, enabled = !saving) { Text(if (isNew) "Create" else "Save", fontWeight = FontWeight.Bold, color = MK.navy) }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            PassFace(pass, hints = template)
            Section("Type and name") {
                Choice("Layout", PassOptions.kinds, pass.kind) { pass = pass.copy(kind = it) }
                if (pass.kind == "transit") Choice("Travelling by", PassOptions.transits, pass.transit) { pass = pass.copy(transit = it) }
                OutlinedTextField(pass.org, { pass = pass.copy(org = it.take(40)) }, Modifier.fillMaxWidth(), label = { Text("Organisation (top of the pass)") },
                    placeholder = { Text(template?.org ?: "", color = MK.muted) }, singleLine = true)
                OutlinedTextField(pass.title, { pass = pass.copy(title = it.take(40)) }, Modifier.fillMaxWidth(), label = { Text("Pass name") }, singleLine = true)
            }
            Section("On the front") {
                Text("Top corner", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                PairRow(pass.header, template?.header?.sample.orEmpty()) { pass = pass.copy(header = it) }
                if (pass.kind == "transit") {
                    Text("From and to", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    PairRow(pass.primary, template?.primary?.sample.orEmpty(), "City", "Code") { pass = pass.copy(primary = it) }
                    PairRow(pass.to, template?.to?.sample.orEmpty(), "City", "Code") { pass = pass.copy(to = it) }
                } else {
                    Text("Main line", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    PairRow(pass.primary, template?.primary?.sample.orEmpty()) { pass = pass.copy(primary = it) }
                }
                Text("More fields (empty ones are hidden)", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                pass.front.forEachIndexed { i, f ->
                    PairRow(f, template?.front?.getOrNull(i)?.sample.orEmpty(), onRemove = { pass = pass.copy(front = pass.front.filterIndexed { j, _ -> j != i }) }) { nf ->
                        pass = pass.copy(front = pass.front.mapIndexed { j, x -> if (j == i) nf else x })
                    }
                }
                if (pass.front.size < 4) TextButton(onClick = { pass = pass.copy(front = pass.front + PassField()) }) { Text("+ Add a field") }
            }
            Section("Barcode") {
                Choice("Kind", PassOptions.barcodes, pass.barcodeFormat) { pass = pass.copy(barcodeFormat = it) }
                if (pass.barcodeFormat != "none") {
                    OutlinedTextField(pass.barcodeValue, { pass = pass.copy(barcodeValue = it.take(500)) }, Modifier.fillMaxWidth(),
                        label = { Text(if (pass.barcodeFormat == "ean13") "12 or 13 digits" else "What the code holds") }, singleLine = true)
                    OutlinedTextField(pass.barcodeText, { pass = pass.copy(barcodeText = it.take(40)) }, Modifier.fillMaxWidth(),
                        label = { Text("Text under the code (optional)") }, singleLine = true)
                    MKButton("Scan the barcode on my card", light = true) { scanBarcode() }
                }
            }
            Section("Colours") {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    data?.palettes?.forEach { p ->
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(hexColour(p.bg))
                            .border(if (pass.bg == p.bg) 2.5.dp else 1.dp, if (pass.bg == p.bg) MK.navy else Color(0x22000000), RoundedCornerShape(10.dp))
                            .clickable { pass = pass.copy(bg = p.bg, fg = p.fg, labelColour = p.label) }, contentAlignment = Alignment.Center) {
                            Text("Aa", color = hexColour(p.label, Color.White), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Background" to pass.bg, "Text" to pass.fg, "Labels" to pass.labelColour).forEachIndexed { i, (name, value) ->
                        OutlinedTextField(value, { v ->
                            val clean = ("#" + v.removePrefix("#").filter { it.isLetterOrDigit() }.take(6)).lowercase()
                            pass = when (i) { 0 -> pass.copy(bg = clean); 1 -> pass.copy(fg = clean); else -> pass.copy(labelColour = clean) }
                        }, Modifier.weight(1f), label = { Text(name) }, singleLine = true,
                            leadingIcon = { Box(Modifier.size(18.dp).clip(RoundedCornerShape(4.dp)).background(hexColour(value, Color.Transparent)).border(1.dp, Color(0x22000000), RoundedCornerShape(4.dp))) })
                    }
                }
            }
            Section("Pictures") {
                val rows = listOf("logo" to "Logo") + (if (pass.showsPhoto) listOf("photo" to "Photo") else emptyList()) + (if (pass.showsBanner) listOf("banner" to "Banner") else emptyList())
                rows.forEach { (kind, title) ->
                    val ref = when (kind) { "logo" -> pass.logo; "photo" -> pass.photo; else -> pass.banner }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.width(56.dp).height(40.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFEEF1F6))) {
                            if (ref.isNotBlank()) PassPicture(ref, Modifier.matchParentSize(), crop = kind != "logo")
                        }
                        Spacer(Modifier.width(12.dp))
                        Text(title, Modifier.weight(1f))
                        TextButton(onClick = {
                            pictureKind = kind
                            picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }) { Text(if (ref.isBlank()) "Add" else "Change") }
                        if (ref.isNotBlank()) TextButton(onClick = {
                            pass = when (kind) { "logo" -> pass.copy(logo = ""); "photo" -> pass.copy(photo = ""); else -> pass.copy(banner = "") }
                        }) { Text("Remove", color = Color(0xFFC2334C)) }
                    }
                }
            }
            Section("Valid until") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(pass.expires.ifBlank { "No end date" }, Modifier.weight(1f))
                    TextButton(onClick = { pickingDate = true }) { Text("Choose") }
                    if (pass.expires.isNotBlank()) TextButton(onClick = { pass = pass.copy(expires = "") }) { Text("Clear") }
                }
                Text("Google Wallet shows the pass as expired after this day.", color = MK.muted, fontSize = 12.sp)
            }
            Section("On the back") {
                pass.back.forEachIndexed { i, f ->
                    PairRow(f, "", onRemove = { pass = pass.copy(back = pass.back.filterIndexed { j, _ -> j != i }) }) { nf ->
                        pass = pass.copy(back = pass.back.mapIndexed { j, x -> if (j == i) nf else x })
                    }
                }
                if (pass.back.size < 12) TextButton(onClick = { pass = pass.copy(back = pass.back + PassField()) }) { Text("+ Add a detail") }
                OutlinedTextField(pass.notes, { pass = pass.copy(notes = it.take(600)) }, Modifier.fillMaxWidth(), label = { Text("Notes") }, minLines = 2)
            }
            error?.let { Text(it, color = Color(0xFFC2334C)) }
            MKButton(if (saving) "Saving…" else if (isNew) "Create pass" else "Save changes", enabled = !saving) { save() }
            Text("Passes you make are personal copies for convenience, not official documents.", color = MK.muted, fontSize = 12.sp,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(bottom = 20.dp))
        }
    }
    if (pickingDate) {
        val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val picked = rememberDatePickerState(initialSelectedDateMillis = runCatching { day.parse(pass.expires)?.time }.getOrNull())
        DatePickerDialog(
            onDismissRequest = { pickingDate = false },
            confirmButton = { TextButton(onClick = { picked.selectedDateMillis?.let { pass = pass.copy(expires = day.format(java.util.Date(it))) }; pickingDate = false }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { pickingDate = false }) { Text("Cancel") } },
        ) { DatePicker(picked) }
    }
}
