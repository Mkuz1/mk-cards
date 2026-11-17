package app.mkcards

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

/**
 * Opens one MK Cards page (the card editor, email signature, call background, company admin, Salesforce set-up)
 * with a title bar and a Done button. It closes by itself when the page moves to an address in EXTRA_CLOSE_ON,
 * for example after a card is saved.
 */
class WebActivity : ComponentActivity() {

    companion object {
        private const val EXTRA_PATH = "path"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_CLOSE_ON = "closeOn"

        fun open(context: Context, title: String, path: String, closeOn: List<String> = emptyList()) {
            context.startActivity(
                Intent(context, WebActivity::class.java)
                    .putExtra(EXTRA_TITLE, title).putExtra(EXTRA_PATH, path).putExtra(EXTRA_CLOSE_ON, closeOn.toTypedArray()),
            )
        }
    }

    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var failedUrl: String? = null
    private val closeOn by lazy { intent.getStringArrayExtra(EXTRA_CLOSE_ON)?.toList().orEmpty() }

    private val pickPhoto = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val density = resources.displayMetrics.density
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding((16 * density).toInt(), 0, (8 * density).toInt(), 0)
            addView(TextView(context).apply {
                text = intent.getStringExtra(EXTRA_TITLE) ?: "MK Cards"
                textSize = 18f
                setTypeface(Typeface.SERIF, Typeface.BOLD)
                setTextColor(Color.parseColor("#0F2343"))
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(context).apply {
                text = "Done"
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.parseColor("#0F2343"))
                setPadding((12 * density).toInt(), (12 * density).toInt(), (12 * density).toInt(), (12 * density).toInt())
                setOnClickListener { finish() }
            })
        }
        webView = WebView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (56 * density).toInt()))
            addView(FrameLayout(context).apply { addView(webView) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            userAgentString = "$userAgentString MKCardsAndroid/${BuildConfig.VERSION_NAME}"
        }
        webView.setBackgroundColor(Color.parseColor("#EEF1F6"))
        webView.addJavascriptInterface(Bridge(), "MKNative")
        webView.webViewClient = SiteClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
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
        webView.loadUrl(Api.site + (intent.getStringExtra(EXTRA_PATH) ?: "/"))
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun isOurSite(uri: Uri) = uri.scheme == "https" && uri.host == BuildConfig.SITE_HOST

    private fun isSalesforce(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return false
        return listOf("salesforce.com", "force.com", "cloudforce.com", "salesforce-setup.com").any { host == it || host.endsWith(".$it") }
    }

    private fun reached(path: String) {
        if (closeOn.any { path.startsWith(it) }) {
            setResult(Activity.RESULT_OK)
            finish()
        }
    }

    private inner class SiteClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (isOurSite(uri) && uri.path.orEmpty().startsWith("/api/auth/sso/")) {
                // Microsoft and Google refuse app web views: sign in in the browser, which returns to the app.
                val browser = uri.buildUpon().clearQuery().apply {
                    uri.queryParameterNames.filter { it != "app" }.forEach { appendQueryParameter(it, uri.getQueryParameter(it)) }
                    appendQueryParameter("app", "android")
                }.build()
                openOutside(browser)
                finish()
                return true
            }
            if (isOurSite(uri)) {
                reached(uri.path.orEmpty())
                return false
            }
            if (isSalesforce(uri)) return false
            openOutside(uri)
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            // The site changes pages without reloading; report those moves too.
            view.evaluateJavascript(
                """(function(){ if (window.__mkPath) return; window.__mkPath = 1;
                   const report = () => MKNative.path(location.pathname);
                   const push = history.pushState; history.pushState = function(){ push.apply(this, arguments); report(); };
                   window.addEventListener('popstate', report); })();""",
                null,
            )
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            failedUrl = request.url.toString()
            view.loadUrl("file:///android_asset/offline.html")
        }
    }

    private fun openOutside(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private inner class Bridge {
        /** Tells the page it is inside the app, so it hides its own top navigation. */
        @JavascriptInterface fun hasTabBar() = true
        @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun ready() {}
        @JavascriptInterface fun path(path: String) = runOnUiThread { reached(path) }
        @JavascriptInterface fun signedOut() = runOnUiThread { finish() }

        @JavascriptInterface
        fun share(title: String, text: String, url: String) = runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, "$text\n$url")
            startActivity(Intent.createChooser(send, getString(R.string.share_chooser)))
        }

        @JavascriptInterface
        fun saveContact(vcard: String, filename: String) = runOnUiThread {
            val safeName = filename.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "contact.vcf" }
            val file = File(File(cacheDir, "contacts").apply { mkdirs() }, safeName)
            file.writeText(vcard)
            val uri = FileProvider.getUriForFile(this@WebActivity, "${BuildConfig.APPLICATION_ID}.files", file)
            try {
                startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "text/x-vcard").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this@WebActivity, R.string.no_contacts_app, Toast.LENGTH_LONG).show()
            }
        }

        /** Saves a file made by the page (QR code, signature, call background) to Downloads. */
        @JavascriptInterface
        fun saveFile(base64: String, filename: String, mime: String) {
            val safeName = filename.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "mkcards-file" }
            val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (_: IllegalArgumentException) { return }
            val saved = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                    }
                    contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?.let { uri -> contentResolver.openOutputStream(uri)?.use { it.write(bytes) } } != null
                } else false
            } catch (_: Exception) { false }
            runOnUiThread {
                if (saved) Toast.makeText(this@WebActivity, R.string.saved_to_downloads, Toast.LENGTH_SHORT).show()
                else {
                    val file = File(File(cacheDir, "files").apply { mkdirs() }, safeName)
                    file.writeBytes(bytes)
                    val uri = FileProvider.getUriForFile(this@WebActivity, "${BuildConfig.APPLICATION_ID}.files", file)
                    startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), getString(R.string.save_chooser)))
                }
            }
        }

        @JavascriptInterface fun checkForUpdate() {}

        @JavascriptInterface
        fun retry() = runOnUiThread { webView.loadUrl(failedUrl ?: Api.site) }
    }
}
