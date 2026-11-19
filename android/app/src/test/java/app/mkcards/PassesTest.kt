package app.mkcards

import android.nfc.NdefMessage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-xxhdpi")
class PassesTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private val student = Pass(
        id = "p1", template = "student-id", org = "City University", title = "Student ID",
        header = PassField("Year", "2026–27"), primary = PassField("Student", "Sara Haddad"),
        front = listOf(PassField("Student no.", "20261458"), PassField("Faculty", "Engineering")),
        barcodeFormat = "qr", barcodeValue = "STU-20261458",
    )

    private fun shot(name: String) {
        rule.waitForIdle()
        Thread.sleep(300)
        rule.waitForIdle()
        rule.runOnUiThread {
            val view = rule.activity.window.decorView
            val bmp = android.graphics.Bitmap.createBitmap(view.width, view.height, android.graphics.Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bmp))
            java.io.File("build/pass-screens").apply { mkdirs() }.let { dir ->
                java.io.File(dir, "$name.png").outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
        }
    }

    private fun signIn() {
        rule.waitUntil(15_000) { rule.activity.state.phase != Phase.Loading }
        rule.runOnUiThread {
            rule.activity.state.me = Me(User("demo", "demo@example.com", true, emptyList(), null, null), emptyList(),
                appleWallet = false, googleWallet = true, googleSignIn = false, microsoftSignIn = false, passes = listOf(student))
            rule.activity.state.phase = Phase.SignedIn
            rule.activity.state.tab = Tab.Passes
        }
        rule.waitForIdle()
    }

    @Test
    fun passesListDetailAndEditor() {
        signIn()
        shot("1-list")
        rule.onNodeWithText("Sara Haddad").assertExists().performClick()
        rule.waitForIdle()
        shot("2-detail")
        rule.onNodeWithContentDescription("Add to Google Wallet").assertExists()
        rule.activity.onBackPressedDispatcher.let { d -> rule.runOnUiThread { d.onBackPressed() } }
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Add pass").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Choose a template").assertExists()
        shot("3-templates")
        rule.onNodeWithText("Student ID").performClick()
        rule.waitForIdle()
        rule.onAllNodesWithText("Create")[0].assertExists()
        rule.onNodeWithText("Main line").assertExists()
        shot("4-editor")
    }

    @Test
    fun everyBarcodeKindDraws() {
        assertNotNull(barcodeBitmap("qr", "STU-20261458"))
        assertNotNull(barcodeBitmap("pdf417", "TRN-ABC123"))
        assertNotNull(barcodeBitmap("aztec", "TRN-ABC123"))
        assertNotNull(barcodeBitmap("code128", "7781 2290"))
        assertNotNull(barcodeBitmap("ean13", "590123412345"))
        assertNotNull(barcodeBitmap("code39", "mk-2026"))
        assertEquals(null, barcodeBitmap("ean13", "12345"))
    }

    @Test
    fun templatesLoad() {
        val t = PassTemplates.load(rule.activity)
        assertEquals(23, t.templates.size)
        assertEquals("transit", t.templates.first { it.id == "boarding-pass" }.makePass().kind)
    }

    /** Reads the emulated tag the way a phone's NFC reader does and gets the card link back. */
    @Test
    fun tapShareAnswersLikeANdefTag() {
        val link = "https://mkcards.pages.dev/sara-haddad"
        val tag = TapShare.Tag.forLink(link)
        val ok = byteArrayOf(0x90.toByte(), 0x00)
        fun cmd(vararg b: Int) = ByteArray(b.size) { b[it].toByte() }
        assertArrayEquals(ok, tag.answer(cmd(0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00)))
        assertArrayEquals(ok, tag.answer(cmd(0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x03)))
        val cc = tag.answer(cmd(0x00, 0xB0, 0x00, 0x00, 0x0F))
        assertEquals(17, cc.size)
        assertEquals(0xE1, cc[9].toInt() and 0xFF)
        assertArrayEquals(ok, tag.answer(cmd(0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x04)))
        val lenReply = tag.answer(cmd(0x00, 0xB0, 0x00, 0x00, 0x02))
        val len = ((lenReply[0].toInt() and 0xFF) shl 8) or (lenReply[1].toInt() and 0xFF)
        val body = ByteArray(len)
        var read = 0
        while (read < len) {
            val chunk = minOf(0x3B, len - read)
            val off = read + 2
            val r = tag.answer(cmd(0x00, 0xB0, off shr 8, off and 0xFF, chunk))
            System.arraycopy(r, 0, body, read, r.size - 2)
            read += r.size - 2
        }
        assertEquals(link, NdefMessage(body).records[0].toUri().toString())
        // Unknown files are refused.
        assertArrayEquals(byteArrayOf(0x6A, 0x82.toByte()), tag.answer(cmd(0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x05)))
    }
}
