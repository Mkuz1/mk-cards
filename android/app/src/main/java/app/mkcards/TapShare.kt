package app.mkcards

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.cardemulation.HostApduService
import android.os.Bundle

/**
 * "Share by tapping phones". While it is on, this phone answers NFC readers like an NFC Forum Type 4 tag that holds
 * the card's link, so another phone (Android, or an iPhone with its screen on) opens the card when the two touch.
 * Only the public card link is shared; nothing is ever written or read back.
 */
object TapShare {
    private const val PREFS = "tap_share"

    fun isOn(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false)
    fun link(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("link", null)

    fun setLink(context: Context, link: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("link", link).apply()
    }

    /** Turns sharing on or off. Off also disables the service, so the phone stops answering readers at all. */
    fun set(context: Context, on: Boolean, link: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("on", on).putString("link", link).apply()
        context.packageManager.setComponentEnabledSetting(
            ComponentName(context, CardTapService::class.java),
            if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
    }

    /** The answer to one reader command (ISO 7816-4 APDU), following the NFC Forum Type 4 Tag rules. */
    class Tag(private val ndef: ByteArray) {
        private var selected: ByteArray? = null
        private var appSelected = false

        private val cc = byteArrayOf(
            0x00, 0x0F, // capability container length
            0x20, // mapping version 2.0
            0x00, 0x3B, // largest read
            0x00, 0x34, // largest write
            0x04, 0x06, // NDEF file control: type and length
            0xE1.toByte(), 0x04, // NDEF file id
            0x7F, 0xFF.toByte(), // largest NDEF file
            0x00, // read access: anyone
            0xFF.toByte(), // write access: none
        )
        private val file: ByteArray = byteArrayOf((ndef.size shr 8).toByte(), ndef.size.toByte()) + ndef

        fun answer(apdu: ByteArray): ByteArray {
            if (apdu.size < 4) return NOT_SUPPORTED
            val ins = apdu[1].toInt() and 0xFF
            val p1 = apdu[2].toInt() and 0xFF
            val p2 = apdu[3].toInt() and 0xFF
            return when (ins) {
                0xA4 -> { // SELECT
                    val lc = if (apdu.size > 4) apdu[4].toInt() and 0xFF else 0
                    val data = if (apdu.size >= 5 + lc) apdu.copyOfRange(5, 5 + lc) else ByteArray(0)
                    when {
                        p1 == 0x04 && data.contentEquals(AID) -> { appSelected = true; selected = null; OK }
                        p1 == 0x00 && appSelected && data.contentEquals(byteArrayOf(0xE1.toByte(), 0x03)) -> { selected = cc; OK }
                        p1 == 0x00 && appSelected && data.contentEquals(byteArrayOf(0xE1.toByte(), 0x04)) -> { selected = file; OK }
                        else -> NOT_FOUND
                    }
                }
                0xB0 -> { // READ BINARY
                    val f = selected ?: return NOT_FOUND
                    val offset = (p1 shl 8) or p2
                    val le = if (apdu.size > 4) (apdu[4].toInt() and 0xFF).let { if (it == 0) 256 else it } else 256
                    if (offset > f.size) return WRONG_PARAMS
                    f.copyOfRange(offset, minOf(f.size, offset + le)) + OK
                }
                else -> NOT_SUPPORTED
            }
        }

        companion object {
            val AID = byteArrayOf(0xD2.toByte(), 0x76, 0x00, 0x00, 0x85.toByte(), 0x01, 0x01)
            val OK = byteArrayOf(0x90.toByte(), 0x00)
            val NOT_FOUND = byteArrayOf(0x6A, 0x82.toByte())
            val WRONG_PARAMS = byteArrayOf(0x6B, 0x00)
            val NOT_SUPPORTED = byteArrayOf(0x6D, 0x00)

            fun forLink(link: String) = Tag(NdefMessage(arrayOf(NdefRecord.createUri(link))).toByteArray())
        }
    }
}

class CardTapService : HostApduService() {
    private var tag: TapShare.Tag? = null

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        val link = TapShare.link(this)
        if (!TapShare.isOn(this) || link.isNullOrBlank()) return TapShare.Tag.NOT_FOUND
        // A new reader session starts with SELECT of the NDEF application.
        if (tag == null || (commandApdu.size > 1 && commandApdu[1] == 0xA4.toByte() && commandApdu.getOrNull(2) == 0x04.toByte())) {
            tag = TapShare.Tag.forLink(link)
        }
        return tag!!.answer(commandApdu)
    }

    override fun onDeactivated(reason: Int) {
        tag = null
    }
}
