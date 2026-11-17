package app.mkcards

import org.json.JSONArray
import org.json.JSONObject

private fun JSONObject.str(key: String): String = if (isNull(key)) "" else optString(key, "")

data class CardEntry(
    val id: String, val slug: String, val name: String, val title: String, val company: String, val label: String,
    val accent: String, val active: Boolean, val views: Int, val saves: Int,
) {
    val displayName: String get() = label.ifBlank { if (slug.isEmpty()) "Main card" else slug.replaceFirstChar { it.uppercase() } }
    val role: String get() = listOf(title, company).filter { it.isNotBlank() }.joinToString(" · ")
}

data class Identity(val provider: String, val email: String)

data class User(
    val username: String, val email: String, val hasPassword: Boolean, val identities: List<Identity>,
    val orgName: String?, val orgRole: String?,
) {
    val isAdmin: Boolean get() = orgRole == "admin" || orgRole == "owner"
}

data class Me(
    val user: User?, val cards: List<CardEntry>, val appleWallet: Boolean, val googleWallet: Boolean,
    val googleSignIn: Boolean, val microsoftSignIn: Boolean,
) {
    companion object {
        fun parse(o: JSONObject): Me {
            val u = o.optJSONObject("user")
            val user = u?.let {
                val org = it.optJSONObject("org")
                val ids = it.optJSONArray("identities") ?: JSONArray()
                User(
                    it.str("username"), it.str("email"), it.optBoolean("hasPassword", true),
                    (0 until ids.length()).map { i -> ids.getJSONObject(i).let { x -> Identity(x.str("provider"), x.str("email")) } },
                    org?.str("name"), org?.str("role"),
                )
            }
            val list = o.optJSONArray("cards") ?: JSONArray()
            val cards = (0 until list.length()).map { i ->
                val e = list.getJSONObject(i)
                val c = e.optJSONObject("card") ?: JSONObject()
                CardEntry(
                    e.str("id"), e.str("slug"), c.str("name"), c.str("title"), c.str("company"), c.str("label"),
                    c.str("accent"), e.optBoolean("active", true), e.optInt("views"), e.optInt("saves"),
                )
            }
            val wallet = o.optJSONObject("wallet") ?: JSONObject()
            val sso = o.optJSONObject("sso") ?: JSONObject()
            return Me(user, cards, wallet.optBoolean("apple"), wallet.optBoolean("google"), sso.optBoolean("google"), sso.optBoolean("microsoft"))
        }
    }
}

data class Contact(
    val id: Long, val name: String, val title: String, val company: String, val email: String, val phone: String,
    val mobile: String, val website: String, val address: String, val note: String, val event: String,
    val source: String, val createdAt: Long, val inCrm: Boolean, val crmError: String, val waiting: Boolean = false,
) {
    val role: String get() = listOf(title, company).filter { it.isNotBlank() }.joinToString(" · ")
    val sourceLabel: String
        get() = when (source) {
            "scan" -> "Scanned card"
            "badge" -> "Scanned badge"
            "manual" -> "Added by hand"
            else -> "Shared on your card"
        }

    companion object {
        fun parse(o: JSONObject, waiting: Boolean = false) = Contact(
            o.optLong("id", -o.optLong("localId", 0)), o.str("name"), o.str("title"), o.str("company"), o.str("email"), o.str("phone"),
            o.str("mobile"), o.str("website"), o.str("address"), o.str("note"), o.str("event"), o.str("source"),
            o.optLong("createdAt", System.currentTimeMillis()), o.optJSONObject("crm") != null, o.str("crmError"), waiting,
        )
    }
}

/** A contact being checked before it is saved. */
data class Draft(
    var source: String = "scan", var name: String = "", var title: String = "", var company: String = "",
    var email: String = "", var mobile: String = "", var phone: String = "", var website: String = "",
    var address: String = "", var event: String = "", var note: String = "",
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("source", source); put("name", name.trim()); put("title", title.trim()); put("company", company.trim())
        put("email", email.trim()); put("mobile", mobile.trim()); put("phone", phone.trim()); put("website", website.trim())
        put("address", address.trim()); put("event", event.trim()); put("note", note.trim())
    }
}

data class Stats(val totals: Map<String, Int>, val days: List<Triple<String, Int, Int>>) {
    companion object {
        fun parse(o: JSONObject): Stats {
            val t = o.optJSONObject("total") ?: JSONObject()
            val totals = t.keys().asSequence().associateWith { t.optInt(it) }
            val s = o.optJSONArray("series") ?: JSONArray()
            val days = (0 until s.length()).map { i -> s.getJSONObject(i).let { Triple(it.str("day"), it.optInt("view"), it.optInt("save")) } }
            return Stats(totals, days)
        }
    }
}

/** Contact details from a QR code: a vCard, a MECARD or a link. */
object QrContact {
    private fun unescape(s: String) = s.replace("\\n", "\n").replace("\\,", ",").replace("\u005C;", ";").trim()

    fun parse(value: String): Draft? {
        val v = value.trim()
        if (v.uppercase().startsWith("BEGIN:VCARD")) return vCard(v)
        if (v.uppercase().startsWith("MECARD:")) return meCard(v)
        if (v.startsWith("http://") || v.startsWith("https://")) return Draft(website = v)
        return if (v.isNotEmpty()) Draft(note = v.take(400)) else null
    }

    private fun vCard(text: String): Draft {
        val d = Draft()
        text.replace("\r\n ", "").replace("\n ", "").lines().forEach { line ->
            val colon = line.indexOf(':')
            if (colon < 0) return@forEach
            val head = line.substring(0, colon).uppercase()
            val value = unescape(line.substring(colon + 1))
            var key = head.substringBefore(';')
            if (key.startsWith("ITEM") && key.contains('.')) key = key.substringAfter('.')
            when (key) {
                "FN" -> d.name = value
                "N" -> if (d.name.isEmpty()) d.name = value.split(';').take(2).reversed().joinToString(" ").trim()
                "ORG" -> d.company = value.substringBefore(';')
                "TITLE" -> d.title = value
                "EMAIL" -> if (d.email.isEmpty()) d.email = value
                "TEL" -> if (head.contains("CELL") && d.mobile.isEmpty()) d.mobile = value else if (d.phone.isEmpty()) d.phone = value
                "URL" -> if (d.website.isEmpty() && !value.contains("wa.me")) d.website = value
                "ADR" -> if (d.address.isEmpty()) d.address = value.split(';').filter { it.isNotBlank() }.joinToString(", ")
                "NOTE" -> d.note = value
            }
        }
        return d
    }

    private fun meCard(text: String): Draft {
        val d = Draft()
        text.drop(7).split(';').forEach { part ->
            val colon = part.indexOf(':')
            if (colon < 0) return@forEach
            val value = unescape(part.substring(colon + 1))
            when (part.substring(0, colon).uppercase()) {
                "N" -> d.name = if (value.contains(',')) value.split(',').reversed().joinToString(" ").trim() else value
                "TEL" -> if (d.phone.isEmpty()) d.phone = value
                "EMAIL" -> d.email = value
                "URL" -> d.website = value
                "ADR" -> d.address = value
                "ORG" -> d.company = value
                "NOTE" -> d.note = value
            }
        }
        return d
    }

    /** A rough reading of a card's text, used when MK Cards cannot be reached. */
    fun fromText(text: String): Draft {
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val phones = lines.filter { l -> l.count { it.isDigit() } >= 7 && !l.contains('@') }
        return Draft(
            source = "scan",
            email = lines.firstOrNull { it.contains('@') && it.contains('.') }.orEmpty(),
            mobile = phones.getOrNull(0).orEmpty(),
            phone = phones.getOrNull(1).orEmpty(),
            website = lines.firstOrNull { it.lowercase().startsWith("www.") || it.lowercase().startsWith("http") }.orEmpty(),
            name = lines.firstOrNull { l -> l.split(' ').size in 2..4 && l.none { it.isDigit() } && !l.contains('@') }.orEmpty(),
        )
    }
}
