package app.mkcards

import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.DateFormat
import java.util.Date

private data class CrmInfo(val connected: Boolean, val canManage: Boolean, val userName: String)

@Composable
fun ContactsScreen(state: AppState, activity: MainActivity) {
    var query by remember { mutableStateOf("") }
    var open by remember { mutableStateOf<Contact?>(null) }
    var crm by remember { mutableStateOf<CrmInfo?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        state.loadContacts()
        crm = withContext(Dispatchers.IO) {
            runCatching { Api.call("/api/crm").let { CrmInfo(it.optBoolean("connected"), it.optBoolean("canManage"), it.optString("userName")) } }.getOrNull()
        }
    }
    open?.let { c ->
        BackHandler { open = null }
        ContactDetail(state, activity, c, crm?.connected == true) { open = null }
        return
    }
    val shown = state.contacts.filter { c ->
        query.isBlank() || listOf(c.name, c.company, c.email, c.title, c.event).joinToString(" ").contains(query.trim(), ignoreCase = true)
    }
    Column {
        Header("Contacts") {
            TextButton(onClick = { scope.launch { exportCsv(activity, state) } }) { Text("Export") }
        }
        LazyColumn(contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                OutlinedTextField(query, { query = it }, placeholder = { Text("Search contacts") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            crm?.let { info ->
                item {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White)
                        .clickable { WebActivity.open(activity, "Salesforce", "/contacts") }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(MK.salesforce), contentAlignment = Alignment.Center) {
                            Icon(MKIcons.cloud, null, tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Salesforce", fontWeight = FontWeight.SemiBold)
                            Text(
                                if (info.connected) "Connected${if (info.userName.isNotBlank()) " as ${info.userName}" else ""}"
                                else if (info.canManage) "Not connected: tap to connect" else "Your company has not connected it",
                                color = MK.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Icon(MKIcons.chevron, null, tint = Color(0xFFB4BCCD), modifier = Modifier.size(18.dp))
                    }
                }
            }
            if (state.contacts.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("No contacts yet", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text("Scan business cards and badges, or let visitors share their details on your card page.", color = MK.muted, textAlign = TextAlign.Center)
                    MKButton("Scan a card") { state.tab = Tab.Scan }
                }
            }
            items(shown, key = { it.id.toString() + it.waiting }) { c ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).clickable { open = c }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c.name, 42)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.name, fontWeight = FontWeight.SemiBold, color = MK.ink)
                        if (c.role.isNotBlank()) Text(c.role, color = MK.muted, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            if (c.waiting) "Waiting to upload" else listOf(DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(c.createdAt)), c.event).filter { it.isNotBlank() }.joinToString(" · "),
                            color = if (c.waiting) Color(0xFF8A6100) else Color(0xFF9AA3B5), fontSize = 12.sp,
                        )
                    }
                    if (c.inCrm) Icon(MKIcons.cloud, "In Salesforce", tint = MK.salesforce, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

private suspend fun exportCsv(activity: MainActivity, state: AppState) {
    val file = withContext(Dispatchers.IO) {
        runCatching {
            val r = Api.request("/api/contacts.csv")
            if (r.status != 200) error("failed")
            File(File(activity.cacheDir, "files").apply { mkdirs() }, "mkcards-contacts.csv").apply { writeText(r.body) }
        }.getOrNull()
    }
    if (file == null) { state.message = "Connect to the internet to export your contacts."; return }
    val uri = androidx.core.content.FileProvider.getUriForFile(activity, "${BuildConfig.APPLICATION_ID}.files", file)
    activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Export contacts"))
}

/** Opens the phone's own "new contact" screen filled in with the person's details. */
fun saveToPhone(activity: MainActivity, c: Contact) {
    val intent = Intent(Intent.ACTION_INSERT, ContactsContract.Contacts.CONTENT_URI).apply {
        putExtra(ContactsContract.Intents.Insert.NAME, c.name)
        putExtra(ContactsContract.Intents.Insert.COMPANY, c.company)
        putExtra(ContactsContract.Intents.Insert.JOB_TITLE, c.title)
        if (c.mobile.isNotBlank()) putExtra(ContactsContract.Intents.Insert.PHONE, c.mobile)
        if (c.phone.isNotBlank()) putExtra(if (c.mobile.isBlank()) ContactsContract.Intents.Insert.PHONE else ContactsContract.Intents.Insert.SECONDARY_PHONE, c.phone)
        if (c.email.isNotBlank()) putExtra(ContactsContract.Intents.Insert.EMAIL, c.email)
        putExtra(ContactsContract.Intents.Insert.NOTES, listOf(c.note, if (c.event.isNotBlank()) "Met at ${c.event}" else "").filter { it.isNotBlank() }.joinToString("\n"))
    }
    runCatching { activity.startActivity(intent) }.onFailure { state(activity).message = "No contacts app is installed." }
}

private fun state(activity: MainActivity) = activity.state

@Composable
private fun ContactDetail(state: AppState, activity: MainActivity, c: Contact, crmConnected: Boolean, close: () -> Unit) {
    var sent by remember { mutableStateOf(c.inCrm) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column {
        Header(c.name, back = close)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Avatar(c.name, 76, ring = true)
                Text(c.name, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                if (c.role.isNotBlank()) Text(c.role, color = MK.muted, textAlign = TextAlign.Center)
                if (c.waiting) Text("Saved on this phone; it uploads when you're back online.", color = Color(0xFF8A6100), fontSize = 13.sp)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val phone = c.mobile.ifBlank { c.phone }
                if (phone.isNotBlank()) {
                    MKButton("Call", Modifier.weight(1f)) { activity.open(Uri.parse("tel:" + phone.filter { it.isDigit() || it == '+' })) }
                    MKButton("WhatsApp", Modifier.weight(1f), light = true) { activity.open(Uri.parse("https://wa.me/" + phone.filter { it.isDigit() })) }
                }
                if (c.email.isNotBlank()) MKButton("Email", Modifier.weight(1f), light = true) { activity.open(Uri.parse("mailto:" + c.email)) }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("Mobile" to c.mobile, "Phone" to c.phone, "Email" to c.email, "Website" to c.website, "Address" to c.address,
                    "Event" to c.event, "Note" to c.note, "Source" to "${c.sourceLabel}, ${DateFormat.getDateInstance(DateFormat.LONG).format(Date(c.createdAt))}")
                    .filter { it.second.isNotBlank() }
                    .forEach { (label, value) -> Column { Text(label, color = MK.muted, fontSize = 12.sp); Text(value) } }
            }
            MKButton("Save to phone contacts", light = true) { saveToPhone(activity, c) }
            if (crmConnected && !c.waiting) {
                if (sent) Text("✓ In Salesforce", color = Color(0xFF18794E), fontWeight = FontWeight.SemiBold)
                else MKButton("Send to Salesforce") {
                    scope.launch { if (state.change("/api/contacts/${c.id}/crm") != null) { sent = true; state.message = "Sent to Salesforce" } }
                }
            }
            if (!c.waiting) TextButton(onClick = { confirmDelete = true }) { Text("Delete contact", color = Color(0xFFC2334C)) }
        }
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete ${c.name}?") },
        confirmButton = {
            TextButton(onClick = {
                confirmDelete = false
                scope.launch { if (state.change("/api/contacts/${c.id}", "DELETE") != null) { state.loadContacts(); close() } }
            }) { Text("Delete", color = Color(0xFFC2334C)) }
        },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
    )
}
