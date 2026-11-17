package app.mkcards

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talks to the MK Cards server. The sign-in cookie lives in the WebView cookie store, so native screens and the
 * pages opened in [WebActivity] share one session. Every call runs off the main thread.
 */
object Api {
    // The server address. Tests point it at a local stand-in.
    var site: String = BuildConfig.SITE_URL

    /** The public address of card pages, as printed in links and QR codes. */
    val publicSite: String = BuildConfig.SITE_URL

    class Offline : Exception("You're offline. Check your connection and try again.")
    class Failed(val status: Int, message: String) : Exception(message)

    data class Reply(val status: Int, val body: String, val location: String?)

    fun request(path: String, method: String = "GET", json: JSONObject? = null, timeoutMs: Int = 20_000): Reply {
        val url = URL(if (path.startsWith("http")) path else site + path)
        val c = url.openConnection() as HttpURLConnection
        try {
            c.instanceFollowRedirects = false
            c.connectTimeout = 12_000
            c.readTimeout = timeoutMs
            c.requestMethod = method
            c.setRequestProperty("Accept", "application/json")
            c.setRequestProperty("User-Agent", "MKCardsAndroid/${BuildConfig.VERSION_NAME}")
            CookieManager.getInstance().getCookie(site)?.let { c.setRequestProperty("Cookie", it) }
            if (json != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(json.toString().toByteArray()) }
            }
            val status = c.responseCode
            val cookies = CookieManager.getInstance()
            c.headerFields.filterKeys { it != null && it.equals("Set-Cookie", ignoreCase = true) }.values.flatten()
                .forEach { cookies.setCookie(site, it) }
            cookies.flush()
            val stream = if (status >= 400) c.errorStream else c.inputStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return Reply(status, body, c.getHeaderField("Location"))
        } catch (e: IOException) {
            throw Offline()
        } finally {
            c.disconnect()
        }
    }

    /** A JSON call that throws [Failed] with the server's message when it does not succeed. */
    fun call(path: String, method: String = "GET", json: JSONObject? = null, timeoutMs: Int = 20_000): JSONObject {
        val r = request(path, method, json, timeoutMs)
        if (r.status !in 200..299) {
            val message = runCatching { JSONObject(r.body).optString("error") }.getOrNull().orEmpty()
            throw Failed(r.status, message.ifBlank { "Something went wrong. Please try again." })
        }
        return if (r.body.isBlank()) JSONObject() else runCatching { JSONObject(r.body) }.getOrDefault(JSONObject())
    }

    fun hasSession(): Boolean = CookieManager.getInstance().getCookie(site)?.contains("mk_session=") == true

    fun clearSession() {
        val cookies = CookieManager.getInstance()
        cookies.setCookie(site, "mk_session=; Max-Age=0; Path=/")
        cookies.flush()
    }
}

/** What the app keeps on the phone so it works offline: the last copy of each list, and contacts not yet sent. */
class LocalStore(context: Context) {
    private val dir = File(context.filesDir, "offline").apply { mkdirs() }

    fun save(name: String, value: String) = File(dir, "$name.json").writeText(value)
    fun load(name: String): String? = File(dir, "$name.json").takeIf { it.exists() }?.readText()

    fun pending(): JSONArray = load("pending")?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
    fun setPending(list: JSONArray) = save("pending", list.toString())

    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }
}
