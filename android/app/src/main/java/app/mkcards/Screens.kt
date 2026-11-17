package app.mkcards

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun AppRoot(state: AppState, activity: MainActivity) {
    when (state.phase) {
        Phase.Loading -> Box(Modifier.fillMaxSize().background(MK.deep), contentAlignment = Alignment.Center) {
            Image(painterResource(R.mipmap.ic_launcher), null, Modifier.size(96.dp))
        }
        Phase.SignedOut -> WelcomeScreen(state, activity)
        Phase.SignedIn -> MainTabs(state, activity)
    }
}

// ---------- welcome and sign-in ----------

@Composable
fun WelcomeScreen(state: AppState, activity: MainActivity) {
    var dialog by remember { mutableStateOf<String?>(null) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(state.message) { state.message?.let { snack.showSnackbar(it); state.message = null } }
    Scaffold(snackbarHost = { SnackbarHost(snack) }, containerColor = MK.deep) { pad ->
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF1C3866), MK.deep, Color(0xFF07122A)))).padding(pad)) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(56.dp))
                Image(painterResource(R.mipmap.ic_launcher), null, Modifier.size(92.dp))
                Text("MK Cards", color = Color.White, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 40.sp, modifier = Modifier.padding(top = 20.dp))
                Box(Modifier.padding(vertical = 14.dp).width(46.dp).height(2.dp).background(MK.softGold))
                Text("Your business card, always with you.\nShare it with a QR code, a link, NFC or Google Wallet.",
                    color = Color.White.copy(alpha = 0.8f), textAlign = TextAlign.Center, fontSize = 16.sp)
                Spacer(Modifier.height(48.dp))
                Column(Modifier.widthIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (state.me?.microsoftSignIn == true) MKButton("Continue with Microsoft", light = true) { activity.browserSignIn("microsoft") }
                    if (state.me?.googleSignIn == true) MKButton("Continue with Google", light = true) { activity.browserSignIn("google") }
                    MKButton("Log in with username") { dialog = "login" }
                    TextButton(onClick = { dialog = "register" }, modifier = Modifier.fillMaxWidth()) {
                        Text("New here? ", color = Color.White.copy(alpha = 0.7f)); Text("Create an account", color = MK.softGold, fontWeight = FontWeight.Bold)
                    }
                    TextButton(onClick = { activity.open(android.net.Uri.parse("${Api.site}/privacy")) }, modifier = Modifier.fillMaxWidth()) {
                        Text("Privacy", color = Color.White.copy(alpha = 0.55f), fontSize = 13.sp)
                    }
                }
            }
        }
    }
    when (dialog) {
        "login" -> LoginDialog(state) { dialog = null }
        "register" -> RegisterDialog(state) { dialog = null }
    }
}

@Composable
private fun LoginDialog(state: AppState, close: () -> Unit) {
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Log in", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(login, { login = it }, label = { Text("Username or email") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                error?.let { Text(it, color = Color(0xFFC2334C), fontSize = 14.sp) }
                Text("Passwords are never reset by email. Ask your company administrator, or use Microsoft or Google if you connected them.",
                    fontSize = 12.sp, color = MK.muted)
            }
        },
        confirmButton = {
            TextButton(enabled = login.isNotBlank() && password.isNotEmpty() && !working, onClick = {
                working = true
                scope.launch { error = state.logIn(login.trim(), password); working = false; if (error == null) close() }
            }) { if (working) CircularProgressIndicator(Modifier.size(18.dp)) else Text("Log in", fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

@Composable
private fun RegisterDialog(state: AppState, close: () -> Unit) {
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val host = android.net.Uri.parse(Api.site).host
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Create account", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(username, { v -> username = v.lowercase().filter { it.isLetterOrDigit() || it == '-' || it == '_' } },
                    label = { Text("Username") }, singleLine = true, supportingText = { Text("$host/${username.ifEmpty { "username" }}") })
                OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedTextField(password, { password = it }, label = { Text("Password (8+ characters)") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                error?.let { Text(it, color = Color(0xFFC2334C), fontSize = 14.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = username.length >= 3 && email.isNotBlank() && password.length >= 8 && !working, onClick = {
                working = true
                scope.launch {
                    error = state.register(username, email.trim(), password); working = false
                    if (error == null) close()
                }
            }) { if (working) CircularProgressIndicator(Modifier.size(18.dp)) else Text("Create", fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

// ---------- tabs ----------

@Composable
fun MainTabs(state: AppState, activity: MainActivity) {
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(state.message) { state.message?.let { snack.showSnackbar(it); state.message = null } }
    Scaffold(
        snackbarHost = { SnackbarHost(snack) },
        containerColor = MK.page,
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                listOf(Tab.Cards to MKIcons.cards, Tab.Share to MKIcons.qr, Tab.Scan to MKIcons.scan, Tab.Contacts to MKIcons.people, Tab.Account to MKIcons.account)
                    .forEach { (tab, icon) ->
                        NavigationBarItem(selected = state.tab == tab, onClick = { state.tab = tab }, icon = { Icon(icon, null) },
                            label = { Text(tab.name) },
                            colors = NavigationBarItemDefaults.colors(selectedIconColor = MK.navy, selectedTextColor = MK.navy, indicatorColor = Color(0xFFDDE4F2)))
                    }
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad)) {
            OfflineBanner(state)
            when (state.tab) {
                Tab.Cards -> CardsScreen(state, activity)
                Tab.Share -> ShareScreen(state, activity)
                Tab.Scan -> ScanScreen(state, activity)
                Tab.Contacts -> ContactsScreen(state, activity)
                Tab.Account -> AccountScreen(state, activity)
            }
        }
    }
    if (activity.nfcWaiting) {
        AlertDialog(onDismissRequest = { activity.stopNfc() }, title = { Text("Ready to write") },
            text = { Text("Hold an NFC tag to the back of your phone.") },
            confirmButton = { TextButton(onClick = { activity.stopNfc() }) { Text("Cancel") } })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Header(title: String, back: (() -> Unit)? = null, actions: @Composable () -> Unit = {}) {
    TopAppBar(
        title = { Text(title, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = if (back == null) 28.sp else 20.sp) },
        navigationIcon = { if (back != null) IconButton(onClick = back) { Icon(MKIcons.back, "Back") } },
        actions = { actions() },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MK.page, titleContentColor = MK.ink),
    )
}

// ---------- cards ----------

@Composable
fun CardsScreen(state: AppState, activity: MainActivity) {
    var open by remember { mutableStateOf<String?>(null) }
    val selected = state.me?.cards?.firstOrNull { it.id == open }
    if (selected != null) {
        BackHandler { open = null }
        CardDetail(state, activity, selected) { open = null }
        return
    }
    val cards = state.me?.cards.orEmpty()
    Column {
        Header("My Cards") {
            if (cards.size < 10) IconButton(onClick = { WebActivity.open(activity, "New card", "/new", listOf("/share/")) }) { Icon(MKIcons.plus, "New card", tint = MK.navy) }
        }
        LazyColumn(contentPadding = PaddingValues(20.dp, 4.dp, 20.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            if (cards.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(top = 60.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Create your first card", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text("Make a card for each audience: work, clients, events.", color = MK.muted, textAlign = TextAlign.Center)
                    MKButton("Create a card") { WebActivity.open(activity, "New card", "/new", listOf("/share/")) }
                }
            }
            items(cards, key = { it.id }) { card ->
                Column(Modifier.clickable { open = card.id }) {
                    CardTile(card)
                    Row(Modifier.padding(start = 6.dp, top = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("${card.views} views", color = MK.muted, fontSize = 13.sp)
                        Text("${card.saves} contact saves", color = MK.muted, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CardDetail(state: AppState, activity: MainActivity, card: CardEntry, close: () -> Unit) {
    var stats by remember(card.id) { mutableStateOf<Stats?>(null) }
    var confirm by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(card.id) { stats = state.stats(card.id) }
    val link = "${Api.site}/${state.me?.user?.username}${if (card.slug.isEmpty()) "" else "/" + card.slug}"
    Column {
        Header(card.displayName, back = close)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CardTile(card)
            Text(link.removePrefix("https://"), color = MK.muted, fontSize = 13.sp)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("LAST 30 DAYS", color = MK.gold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp)
                val s = stats
                if (s == null) CircularProgressIndicator(Modifier.size(24.dp)) else {
                    Row {
                        StatBox(s.totals["view"] ?: 0, "Views", Modifier.weight(1f))
                        StatBox(s.totals["save"] ?: 0, "Saves", Modifier.weight(1f))
                        StatBox((s.totals["whatsapp"] ?: 0) + (s.totals["call"] ?: 0) + (s.totals["email"] ?: 0), "Calls & messages", Modifier.weight(1f))
                    }
                    BarChart(s)
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White)) {
                ActionRow("Edit card") { WebActivity.open(activity, "Edit card", "/edit/${card.id}", listOf("/share/")) }
                ActionRow("Share and QR code") { state.shareCardId = card.id; state.tab = Tab.Share }
                ActionRow("Preview card page") { WebActivity.open(activity, card.name, link.removePrefix(Api.site)) }
                ActionRow("Email signature") { WebActivity.open(activity, "Email signature", "/signature/${card.id}") }
                ActionRow("Video-call background") { WebActivity.open(activity, "Call background", "/background/${card.id}") }
            }
            MKButton(if (card.active) "Turn this card off" else "Turn this card back on", light = true) { confirm = true }
        }
    }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text(if (card.active) "Turn this card off?" else "Turn this card back on?") },
        text = { Text(if (card.active) "Visitors will see a short notice instead of your details." else "Visitors will see the card again.") },
        confirmButton = {
            TextButton(onClick = {
                confirm = false
                scope.launch {
                    state.change("/api/cards/${card.id}/status", json = org.json.JSONObject().put("active", !card.active).put("message", ""))
                    state.refresh()
                }
            }) { Text(if (card.active) "Turn off" else "Turn on") }
        },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } },
    )
}

@Composable
private fun StatBox(value: Int, label: String, modifier: Modifier) {
    Column(modifier) {
        Text("$value", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 26.sp, color = MK.ink)
        Text(label, color = MK.muted, fontSize = 12.sp, maxLines = 1)
    }
}

@Composable
private fun BarChart(s: Stats) {
    val max = (s.days.maxOfOrNull { it.second } ?: 0).coerceAtLeast(1)
    Canvas(Modifier.fillMaxWidth().height(110.dp)) {
        val w = size.width / s.days.size.coerceAtLeast(1)
        s.days.forEachIndexed { i, (_, view, save) ->
            val vh = size.height * view / max
            drawRect(MK.navy.copy(alpha = 0.75f), Offset(i * w + 1, size.height - vh), Size(w - 2, vh))
            if (save > 0) {
                val sh = size.height * save / max
                drawRect(MK.gold, Offset(i * w + w * 0.25f, size.height - sh), Size(w * 0.5f, sh))
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("■ Views", color = MK.navy, fontSize = 12.sp)
        Text("■ Contact saves", color = MK.gold, fontSize = 12.sp)
    }
}

@Composable
fun ActionRow(title: String, detail: String? = null, color: Color = MK.ink, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 15.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = color, fontSize = 16.sp)
            detail?.let { Text(it, color = MK.muted, fontSize = 12.sp) }
        }
        Icon(MKIcons.chevron, null, tint = Color(0xFFB4BCCD), modifier = Modifier.size(18.dp))
    }
}

// ---------- share ----------

@Composable
fun ShareScreen(state: AppState, activity: MainActivity) {
    val cards = state.me?.cards.orEmpty()
    Column {
        Header("Share")
        if (cards.isEmpty()) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Your QR code appears here once you have a card.", color = MK.muted)
                MKButton("Create a card") { WebActivity.open(activity, "New card", "/new", listOf("/share/")) }
            }
            return
        }
        val card = cards.firstOrNull { it.id == state.shareCardId } ?: cards.first()
        val link = "${Api.site}/${state.me?.user?.username}${if (card.slug.isEmpty()) "" else "/" + card.slug}"
        val qr = remember(link) { qrBitmap(link) }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (cards.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                cards.forEach { c -> FilterChip(selected = c.id == card.id, onClick = { state.shareCardId = c.id }, label = { Text(c.displayName) }) }
            }
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Brush.linearGradient(listOf(accentColor(card.accent), MK.deep))).padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (card.company.isNotBlank()) Text(card.company.uppercase(), color = MK.softGold, fontSize = 12.sp, letterSpacing = 2.4.sp, fontWeight = FontWeight.SemiBold)
                Text(card.name, color = Color.White, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 26.sp, textAlign = TextAlign.Center)
                if (card.title.isNotBlank()) Text(card.title, color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp, textAlign = TextAlign.Center)
                Box(Modifier.padding(vertical = 12.dp).width(40.dp).height(2.dp).background(MK.softGold))
                Box(Modifier.clip(RoundedCornerShape(18.dp)).background(Color.White).padding(14.dp)) {
                    Image(qr.asImageBitmap(), "QR code for ${card.name}", Modifier.size(220.dp), filterQuality = FilterQuality.None)
                }
                Text(link.removePrefix("https://"), color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
            }
            MKButton("Share my card") { activity.share("Here is my card: ${card.name}", link) }
            MKButton("Copy link", light = true) {
                val cm = activity.getSystemService(android.content.ClipboardManager::class.java)
                cm.setPrimaryClip(android.content.ClipData.newPlainText("MK Cards", link))
                state.message = "Link copied"
            }
            if (state.me?.googleWallet == true) MKButton("Add to Google Wallet") { activity.addToGoogleWallet(card.id) }
            if (android.nfc.NfcAdapter.getDefaultAdapter(activity) != null) MKButton("Write to an NFC tag", light = true) { activity.writeNfc(link) }
            Text("Anyone can scan the code with their phone camera to open your card and save your contact. It works without internet on your side.",
                color = MK.muted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp))
        }
    }
}
