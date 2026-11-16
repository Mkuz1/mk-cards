package app.mkcards

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import java.io.File

/**
 * Shows the MK Cards site in a full-screen WebView and adds what a web page cannot do on Android:
 * Google Play in-app updates, the system share sheet, saving a contact or QR code, and photo picking.
 * Accounts and cards live on the site; this app keeps only the login cookie.
 * The page talks to this class through the `MKNative` JavaScript object.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var updateManager: AppUpdateManager

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var failedUrl: String? = null

    // Update state is remembered so it can be shown again after the page reloads.
    private var pageReady = false
    private var updateState: String? = null
    private var updateInfo: AppUpdateInfo? = null

    private val pickPhoto = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    private val updateFlow = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) {
        // Nothing to do: progress arrives through installListener.
    }

    private val installListener = InstallStateUpdatedListener { state ->
        if (state.installStatus() == InstallStatus.DOWNLOADED) showUpdateState("downloaded")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        val root = FrameLayout(this).apply {
            addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        setContentView(root)

        // Keep the page clear of the status bar, navigation bar and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(false)
            userAgentString = "$userAgentString MKCardsAndroid/${BuildConfig.VERSION_NAME}"
        }
        webView.setBackgroundColor(getColor(R.color.window_bg))
        webView.addJavascriptInterface(Bridge(), "MKNative")
        webView.webViewClient = SiteClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                pickPhoto.launch("image/*")
                return true
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        updateManager = AppUpdateManagerFactory.create(this)
        updateManager.registerListener(installListener)

        webView.loadUrl(startUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.let { if (isOurSite(it)) webView.loadUrl(it.toString()) }
    }

    override fun onResume() {
        super.onResume()
        checkForUpdate(manual = false)
    }

    override fun onPause() {
        // Write the login cookie to disk so people stay signed in if Android closes the app.
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        updateManager.unregisterListener(installListener)
        webView.destroy()
        super.onDestroy()
    }

    private fun startUrl(intent: Intent?): String {
        val link = intent?.data
        return if (link != null && isOurSite(link)) link.toString() else BuildConfig.SITE_URL + "/"
    }

    private fun isOurSite(uri: Uri) = uri.scheme == "https" && uri.host == BuildConfig.SITE_HOST

    // ---------- Google Play in-app updates ----------

    private fun checkForUpdate(manual: Boolean) {
        updateManager.appUpdateInfo
            .addOnSuccessListener { info ->
                when {
                    info.installStatus() == InstallStatus.DOWNLOADED -> showUpdateState("downloaded")
                    info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                        info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) -> {
                        updateInfo = info
                        // Offer once per launch unless the person asked; repeating it on every resume would nag.
                        if (manual || updateState == null) showUpdateState("available")
                    }
                    manual -> tellPage("current")
                }
            }
            .addOnFailureListener { if (manual) tellPage("unknown") }
    }

    private fun startUpdate() {
        val info = updateInfo ?: return
        updateManager.startUpdateFlowForResult(
            info,
            { intentSender, _, fillInIntent, flagsMask, flagsValues, _, _ ->
                updateFlow.launch(
                    IntentSenderRequest.Builder(intentSender)
                        .setFillInIntent(fillInIntent)
                        .setFlags(flagsValues, flagsMask)
                        .build(),
                )
            },
            AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
            0,
        )
    }

    private fun showUpdateState(state: String) {
        updateState = state
        tellPage(state)
    }

    private fun tellPage(state: String) {
        if (pageReady) webView.evaluateJavascript("window.MKCards && window.MKCards.nativeUpdate('$state')", null)
    }

    // ---------- page loading ----------

    private inner class SiteClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (isOurSite(uri)) return false
            // Everything else (other sites, tel:, mailto:) belongs to another app.
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this@MainActivity, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            pageReady = false
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            failedUrl = request.url.toString()
            view.loadUrl("file:///android_asset/offline.html")
        }
    }

    // ---------- bridge called from the page ----------

    private inner class Bridge {
        /** The page has loaded and can receive update notices. */
        @JavascriptInterface
        fun ready() = runOnUiThread {
            pageReady = true
            updateState?.let { tellPage(it) }
        }

        @JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun share(title: String, text: String, url: String) = runOnUiThread {
            val send = Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_SUBJECT, title)
                .putExtra(Intent.EXTRA_TEXT, "$text\n$url")
            startActivity(Intent.createChooser(send, getString(R.string.share_chooser)))
        }

        /** Hands a vCard to the phone's contacts app. */
        @JavascriptInterface
        fun saveContact(vcard: String, filename: String) = runOnUiThread {
            val safeName = filename.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "contact.vcf" }
            val file = File(File(cacheDir, "contacts").apply { mkdirs() }, safeName)
            file.writeText(vcard)
            val uri = FileProvider.getUriForFile(this@MainActivity, "${BuildConfig.APPLICATION_ID}.files", file)
            val view = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "text/x-vcard")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            try {
                startActivity(view)
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this@MainActivity, R.string.no_contacts_app, Toast.LENGTH_LONG).show()
            }
        }

        /** Saves a file made by the page (a QR code image) to the phone's Downloads folder. */
        @JavascriptInterface
        fun saveFile(base64: String, filename: String, mime: String) {
            val safeName = filename.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "mkcards-qr.png" }
            val bytes = try {
                Base64.decode(base64, Base64.DEFAULT)
            } catch (_: IllegalArgumentException) {
                return
            }
            val saved = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    uri?.let { contentResolver.openOutputStream(it)?.use { out -> out.write(bytes) } } != null
                } else {
                    false
                }
            } catch (_: Exception) {
                false
            }
            runOnUiThread {
                if (saved) {
                    Toast.makeText(this@MainActivity, R.string.saved_to_downloads, Toast.LENGTH_SHORT).show()
                } else {
                    // Older Android versions: hand the file to the share sheet instead (save to Drive, Files, etc.).
                    val file = File(File(cacheDir, "files").apply { mkdirs() }, safeName)
                    file.writeBytes(bytes)
                    val uri = FileProvider.getUriForFile(this@MainActivity, "${BuildConfig.APPLICATION_ID}.files", file)
                    val send = Intent(Intent.ACTION_SEND).setType(mime)
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivity(Intent.createChooser(send, getString(R.string.save_chooser)))
                }
            }
        }

        @JavascriptInterface
        fun checkForUpdate() = runOnUiThread { this@MainActivity.checkForUpdate(manual = true) }

        @JavascriptInterface
        fun startUpdate() = runOnUiThread { this@MainActivity.startUpdate() }

        /** Restarts the app to finish installing a downloaded update. */
        @JavascriptInterface
        fun completeUpdate() = runOnUiThread { updateManager.completeUpdate() }

        /** Used by the offline page. */
        @JavascriptInterface
        fun retry() = runOnUiThread { webView.loadUrl(failedUrl ?: (BuildConfig.SITE_URL + "/")) }
    }
}
