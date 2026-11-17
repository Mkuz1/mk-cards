package app.mkcards

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import org.json.JSONArray
import org.json.JSONObject
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.net.ServerSocket
import kotlin.concurrent.thread

/**
 * Draws the real app screens with demo data, for the Google Play listing. A small local server stands in for
 * MK Cards. Run with: ./gradlew testDebugUnitTest --tests '*StoreScreenshots*'  (pictures go to build/store-screens).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-xxhdpi")
class StoreScreenshots {
    companion object {
        private lateinit var server: ServerSocket
        private val now = System.currentTimeMillis()

        private val me = JSONObject().apply {
            put("user", JSONObject().put("username", "mkdemo").put("email", "alex.morgan@example.com").put("hasPassword", true)
                .put("identities", JSONArray().put(JSONObject().put("provider", "microsoft").put("email", "alex.morgan@northwind.example")))
                .put("org", JSONObject().put("name", "Northwind Trading").put("role", "owner")))
            put("cards", JSONArray()
                .put(card("c1", "", "Work", "#2a5ba8", 248, 63))
                .put(card("c2", "events", "Events", "#1fa97a", 131, 37)))
            put("wallet", JSONObject().put("apple", true).put("google", true))
            put("sso", JSONObject().put("google", true).put("microsoft", true))
        }

        private fun card(id: String, slug: String, label: String, accent: String, views: Int, saves: Int) = JSONObject()
            .put("id", id).put("slug", slug).put("active", true).put("views", views).put("saves", saves)
            .put("card", JSONObject().put("name", "Alex Morgan").put("title", "Head of Partnerships").put("company", "Northwind Trading")
                .put("label", label).put("accent", accent))

        private fun person(id: Int, name: String, title: String, company: String, email: String, mobile: String, source: String, event: String, daysAgo: Int, crm: Boolean) =
            JSONObject().put("id", id).put("name", name).put("title", title).put("company", company).put("email", email).put("mobile", mobile)
                .put("source", source).put("event", event).put("createdAt", now - daysAgo * 86_400_000L)
                .put("note", if (id == 1) "Interested in a fleet partnership. Follow up next week." else "")
                .apply { if (crm) put("crm", JSONObject().put("id", "00Q$id")) }

        private val contacts = JSONArray()
            .put(person(1, "Layla Haddad", "Procurement Manager", "Gulf Logistics", "layla.haddad@example.com", "+971 52 555 0199", "scan", "GITEX 2026", 0, true))
            .put(person(2, "Omar Farouk", "Operations Director", "Desert Rose Hotels", "omar.farouk@example.com", "+971 55 210 3344", "badge", "GITEX 2026", 0, true))
            .put(person(3, "Priya Nair", "Head of IT", "Marina Health", "priya.nair@example.com", "+971 56 778 9012", "form", "", 2, true))
            .put(person(4, "James Whitfield", "Regional Sales Lead", "Atlas Freight", "james.whitfield@example.com", "+44 20 7946 0958", "scan", "", 3, false))
            .put(person(5, "Sara Al Mansoori", "Partnerships Manager", "Falcon Ventures", "sara.almansoori@example.com", "+971 50 987 6543", "badge", "Arabian Travel Market", 6, false))
            .put(person(6, "Daniel Kim", "Founder", "Bluewave Studio", "daniel@example.com", "+82 10 5555 0101", "form", "", 9, false))

        private val stats = JSONObject().apply {
            val series = JSONArray()
            val views = listOf(3, 5, 4, 8, 6, 9, 7, 12, 10, 8, 14, 11, 9, 13, 16, 12, 10, 15, 18, 14, 12, 17, 20, 16, 13, 19, 22, 18, 21, 24)
            views.forEachIndexed { i, v -> series.put(JSONObject().put("day", "d$i").put("view", v).put("save", v / 4)) }
            put("series", series)
            put("total", JSONObject().put("view", 248).put("save", 63).put("whatsapp", 21).put("call", 14).put("email", 9))
        }

        @BeforeClass @JvmStatic
        fun start() {
            server = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
            thread(isDaemon = true) {
                while (!server.isClosed) {
                    val socket = runCatching { server.accept() }.getOrNull() ?: break
                    thread(isDaemon = true) {
                        socket.use { sock ->
                            val reader = sock.getInputStream().bufferedReader()
                            val path = reader.readLine()?.split(" ")?.getOrNull(1)?.substringBefore('?') ?: "/"
                            var line = reader.readLine()
                            var length = 0
                            while (!line.isNullOrEmpty()) {
                                if (line.lowercase().startsWith("content-length:")) length = line.substringAfter(':').trim().toInt()
                                line = reader.readLine()
                            }
                            if (length > 0) CharArray(length).also { reader.read(it) }
                            val body = when {
                                path == "/api/me" -> me.toString()
                                path == "/api/contacts" -> JSONObject().put("contacts", contacts).toString()
                                path.endsWith("/stats") -> stats.toString()
                                path == "/api/crm" -> JSONObject().put("connected", true).put("canManage", true).put("userName", "alex@northwind.example").toString()
                                else -> "{}"
                            }.toByteArray()
                            val head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
                            sock.getOutputStream().apply { write(head.toByteArray()); write(body); flush() }
                        }
                    }
                }
            }
            Api.site = "http://127.0.0.1:${server.localPort}"
        }

        @AfterClass @JvmStatic
        fun stop() = server.close()
    }

    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private val out = File("build/store-screens").apply { mkdirs() }

    private fun shot(name: String) {
        rule.waitForIdle()
        Thread.sleep(400)
        rule.waitForIdle()
        rule.runOnUiThread {
            val view = rule.activity.window.decorView
            val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bmp))
            File(out, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    private fun waitSignedIn() {
        rule.waitUntil(20_000) { rule.activity.state.phase == Phase.SignedIn && rule.activity.state.contacts.isNotEmpty() }
        rule.runOnUiThread { rule.activity.state.offline = false; rule.activity.state.message = null }
    }

    @Test
    fun capture() {
        waitSignedIn()
        val state = rule.activity.state
        shot("02-cards")
        rule.onNodeWithText("248 views").performClick()
        rule.waitUntil(10_000) { runCatching { rule.onNodeWithText("Calls & messages").assertExists() }.isSuccess }
        shot("03-card-detail")
        rule.activity.onBackPressedDispatcher.let { rule.runOnUiThread { it.onBackPressed() } }
        rule.runOnUiThread { state.tab = Tab.Share; state.shareCardId = "c1" }
        shot("01-share")
        rule.runOnUiThread { state.tab = Tab.Scan }
        shot("04-scan")
        rule.runOnUiThread { state.tab = Tab.Contacts }
        rule.waitUntil(10_000) { runCatching { rule.onNodeWithText("Layla Haddad").assertExists() }.isSuccess }
        rule.runOnUiThread { state.offline = false }
        shot("05-contacts")
        rule.onNodeWithText("Layla Haddad").performClick()
        shot("06-contact")
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed(); state.tab = Tab.Account }
        shot("07-account")
        rule.runOnUiThread { state.phase = Phase.SignedOut }
        shot("08-welcome")
    }
}
