package app.mkcards

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.tech.Ndef
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The native MK Cards app: welcome and sign-in screens, then Cards, Share, Scan, Contacts and Account tabs.
 * It keeps the latest cards and contacts on the phone so it works offline.
 */
class MainActivity : ComponentActivity() {

    lateinit var state: AppState
    private lateinit var updateManager: AppUpdateManager
    var nfcWaiting by mutableStateOf(false)
        private set
    private var lastRefresh = 0L

    private val updateFlow = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) {}
    private val installListener = InstallStateUpdatedListener { s ->
        if (s.installStatus() == InstallStatus.DOWNLOADED) {
            state.message = "An update is ready. Restart MK Cards to finish."
            updateManager.completeUpdate()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        state = AppState(applicationContext)
        setContent { MKTheme { AppRoot(state, this) } }
        updateManager = AppUpdateManagerFactory.create(this)
        updateManager.registerListener(installListener)
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        // Back from the editor or another page: show what changed (at most every few seconds).
        if (System.currentTimeMillis() - lastRefresh > 3000) {
            lastRefresh = System.currentTimeMillis()
            lifecycleScope.launch { state.refresh() }
        }
        checkForUpdate()
    }

    override fun onPause() {
        stopNfc()
        super.onPause()
    }

    override fun onDestroy() {
        updateManager.unregisterListener(installListener)
        super.onDestroy()
    }

    /** mkcards://auth (back from signing in in the browser) or a link to the site. */
    private fun handle(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "mkcards" && data.host == "auth") {
            val next = data.getQueryParameter("next")?.takeIf { it.startsWith("/") && !it.startsWith("//") } ?: "/"
            val error = data.getQueryParameter("error")
            val code = data.getQueryParameter("code")
            lifecycleScope.launch {
                when {
                    error != null -> state.message = error
                    code != null -> state.handoff(code, next)
                    else -> {
                        state.refresh()
                        if (next != "/" && !next.startsWith("/account")) WebActivity.open(this@MainActivity, "MK Cards", next)
                        else state.message = "Connected."
                    }
                }
            }
        } else if (data.scheme == "https" && data.host == BuildConfig.SITE_HOST) {
            WebActivity.open(this, "MK Cards", data.path ?: "/")
        }
    }

    /** Signs in, or connects an account, with Microsoft or Google in the phone's browser. */
    fun browserSignIn(provider: String, ticket: String? = null) {
        val q = if (ticket != null) "mode=link&ticket=${Uri.encode(ticket)}&app=android" else "app=android"
        open(Uri.parse("${Api.site}/api/auth/sso/$provider/start?$q"))
    }

    fun open(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    fun share(text: String, link: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "$text\n$link")
        startActivity(Intent.createChooser(send, getString(R.string.share_chooser)))
    }

    // ---------- writing NFC tags ----------

    /** Waits for a tag and writes the card's address to it. */
    fun writeNfc(link: String) {
        val adapter = NfcAdapter.getDefaultAdapter(this)
        if (adapter == null) { state.message = "This phone has no NFC."; return }
        if (!adapter.isEnabled) { state.message = "Turn on NFC in Settings first."; return }
        nfcWaiting = true
        val message = NdefMessage(arrayOf(NdefRecord.createUri(link)))
        adapter.enableReaderMode(this, { tag ->
            val result = runCatching {
                val ndef = Ndef.get(tag) ?: error("This tag cannot hold a link.")
                ndef.connect()
                try {
                    if (!ndef.isWritable) error("This tag is locked.")
                    if (ndef.maxSize < message.toByteArray().size) error("This tag is too small.")
                    ndef.writeNdefMessage(message)
                } finally { runCatching { ndef.close() } }
            }
            runOnUiThread {
                state.message = result.fold({ "Tag written. Tapping it now opens your card." }, { it.message ?: "Writing failed. Try again." })
                stopNfc()
            }
        }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK, null)
    }

    fun stopNfc() {
        if (!nfcWaiting) return
        nfcWaiting = false
        NfcAdapter.getDefaultAdapter(this)?.disableReaderMode(this)
    }

    // ---------- Google Play updates ----------

    private fun checkForUpdate() {
        updateManager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                updateManager.startUpdateFlowForResult(info, { sender, _, fill, mask, values, _, _ ->
                    updateFlow.launch(IntentSenderRequest.Builder(sender).setFillInIntent(fill).setFlags(values, mask).build())
                }, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(), 0)
            }
        }
    }

    /** Gets the Google Wallet address for a card and opens it. */
    fun addToGoogleWallet(cardId: String) {
        lifecycleScope.launch {
            val link = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching { Api.request("/api/cards/$cardId/wallet/google").location }.getOrNull()
            }
            if (link != null && link.startsWith("https://pay.google.com")) open(Uri.parse(link))
            else state.message = if (state.offline) "Connect to the internet to add the card to Google Wallet." else "Google Wallet is not available right now."
        }
    }

    @Suppress("unused")
    private fun json(vararg pairs: Pair<String, Any>) = JSONObject().apply { pairs.forEach { put(it.first, it.second) } }
}
