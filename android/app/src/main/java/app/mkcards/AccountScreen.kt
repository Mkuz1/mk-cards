package app.mkcards

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun AccountScreen(state: AppState, activity: MainActivity) {
    val user = state.me?.user ?: return
    val main = state.me?.cards?.firstOrNull { it.slug.isEmpty() } ?: state.me?.cards?.firstOrNull()
    var dialog by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column {
        Header("Account")
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(main?.name ?: user.username, 60, ring = true)
                Spacer(Modifier.width(14.dp))
                Column {
                    Text(main?.name ?: user.username, fontWeight = FontWeight.Bold, fontSize = 19.sp)
                    Text("@${user.username}", color = MK.muted)
                    Text(user.email, color = MK.muted, fontSize = 13.sp)
                }
            }
            Section("Company") {
                if (user.orgName != null) {
                    ActionRow(user.orgName, detail = if (user.isAdmin) (if (user.orgRole == "owner") "Owner: manage people, sign-in and Salesforce" else "Administrator") else "Member") {
                        if (user.isAdmin) WebActivity.open(activity, "Company admin", "/admin")
                    }
                } else ActionRow("Set up a company workspace") { WebActivity.open(activity, "Company workspace", "/admin") }
            }
            Section("Sign-in") {
                ActionRow(if (user.hasPassword) "Change password" else "Add a password", detail = if (user.hasPassword) "Password set" else "No password yet") { dialog = "password" }
                listOf("microsoft" to state.me?.microsoftSignIn, "google" to state.me?.googleSignIn, "apple" to false).forEach { (p, available) ->
                    val linked = user.identities.firstOrNull { it.provider == p }
                    if (linked != null || available == true) {
                        val name = mapOf("microsoft" to "Microsoft", "google" to "Google", "apple" to "Apple")[p] ?: p
                        ActionRow(name, detail = if (linked != null) "Connected${if (linked.email.isNotBlank()) ": ${linked.email}" else ""} · tap to disconnect" else "Not connected · tap to connect") {
                            scope.launch {
                                if (linked != null) {
                                    if (state.change("/api/me/identities/$p", "DELETE") != null) state.refresh()
                                } else {
                                    state.change("/api/auth/ticket", json = JSONObject().put("mode", "link"))?.optString("ticket")?.let { activity.browserSignIn(p, it) }
                                }
                            }
                        }
                    }
                }
            }
            if (main != null) Section("Tools") {
                ActionRow("Email signature") { WebActivity.open(activity, "Email signature", "/signature/${main.id}") }
                ActionRow("Video-call background") { WebActivity.open(activity, "Call background", "/background/${main.id}") }
            }
            Section("Support") {
                ActionRow("Help and support") { activity.open(Uri.parse("${Api.site}/support")) }
                ActionRow("Privacy policy") { activity.open(Uri.parse("${Api.site}/privacy")) }
                ActionRow("Version", detail = BuildConfig.VERSION_NAME) {}
            }
            Section("") {
                ActionRow("Log out") { dialog = "logout" }
                ActionRow("Delete account", color = Color(0xFFC2334C)) { dialog = "delete" }
            }
            Spacer(Modifier.padding(8.dp))
        }
    }
    when (dialog) {
        "password" -> PasswordDialog(state, user.hasPassword) { dialog = null }
        "delete" -> DeleteDialog(state, user) { dialog = null }
        "logout" -> AlertDialog(onDismissRequest = { dialog = null }, title = { Text("Log out of MK Cards?") },
            confirmButton = { TextButton(onClick = { dialog = null; scope.launch { state.signOut() } }) { Text("Log out", color = Color(0xFFC2334C)) } },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } })
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        if (title.isNotEmpty()) Text(title.uppercase(), color = MK.gold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp,
            modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White)) { content() }
    }
}

@Composable
private fun PasswordDialog(state: AppState, hasPassword: Boolean, close: () -> Unit) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = close,
        title = { Text(if (hasPassword) "Change password" else "Add a password") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val pw = KeyboardOptions(keyboardType = KeyboardType.Password)
                if (hasPassword) OutlinedTextField(current, { current = it }, label = { Text("Current password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = pw)
                OutlinedTextField(next, { next = it }, label = { Text("New password (8+)") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = pw)
                OutlinedTextField(again, { again = it }, label = { Text("New password again") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = pw)
                error?.let { Text(it, color = Color(0xFFC2334C), fontSize = 14.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = next.length >= 8, onClick = {
                if (next != again) { error = "The two new passwords do not match."; return@TextButton }
                scope.launch {
                    val ok = state.change("/api/me/password", json = JSONObject().put("current", current).put("next", next))
                    if (ok != null) { state.message = "Password saved"; state.refresh(); close() } else error = state.message.also { state.message = null }
                }
            }) { Text("Save", fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

@Composable
private fun DeleteDialog(state: AppState, user: User, close: () -> Unit) {
    var value by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Delete your account?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Your account, cards, links, QR codes, contacts and statistics are removed for good.")
                OutlinedTextField(value, { value = it }, label = { Text(if (user.hasPassword) "Password" else "Type your username (${user.username})") }, singleLine = true,
                    visualTransformation = if (user.hasPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
                error?.let { Text(it, color = Color(0xFFC2334C), fontSize = 14.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = value.isNotEmpty(), onClick = {
                scope.launch {
                    val body = if (user.hasPassword) JSONObject().put("password", value) else JSONObject().put("confirm", value)
                    if (state.change("/api/me", "DELETE", body) != null) { close(); state.forget() } else error = state.message.also { state.message = null }
                }
            }) { Text("Delete my account", color = Color(0xFFC2334C)) }
        },
        dismissButton = { TextButton(onClick = close) { Text("Keep my account") } },
    )
}
