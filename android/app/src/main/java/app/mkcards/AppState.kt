package app.mkcards

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

enum class Phase { Loading, SignedOut, SignedIn }
enum class Tab { Cards, Share, Passes, Scan, Contacts, Account }

/**
 * The app's state. Lists come from the server when online and from the phone's saved copy when offline;
 * contacts saved offline wait in a queue and are sent when the connection returns.
 */
class AppState(context: Context) {
    private val store = LocalStore(context)

    var phase by mutableStateOf(Phase.Loading)
    var me by mutableStateOf<Me?>(null)
    var contacts by mutableStateOf<List<Contact>>(emptyList())
    var offline by mutableStateOf(false)
    var message by mutableStateOf<String?>(null)
    var tab by mutableStateOf(Tab.Cards)
    var shareCardId by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)

    val pendingCount: Int get() = contacts.count { it.waiting }

    suspend fun refresh() = withContext(Dispatchers.IO) {
        try {
            val reply = Api.call("/api/me")
            store.save("me", reply.toString())
            val value = Me.parse(reply)
            withContext(Dispatchers.Main) {
                me = value
                offline = false
                phase = if (value.user == null) Phase.SignedOut else Phase.SignedIn
            }
            if (value.user != null) {
                flushPending()
                loadContacts()
            }
        } catch (e: Api.Offline) {
            val saved = store.load("me")?.let { runCatching { Me.parse(JSONObject(it)) }.getOrNull() }
            withContext(Dispatchers.Main) {
                offline = true
                if (saved?.user != null && Api.hasSession()) {
                    me = saved
                    phase = Phase.SignedIn
                    contacts = savedContacts()
                } else if (phase == Phase.Loading) {
                    phase = Phase.SignedOut
                }
            }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) { if (phase == Phase.Loading) phase = Phase.SignedOut }
        }
    }

    private fun savedContacts(): List<Contact> {
        val list = store.load("contacts")?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        val pending = store.pending()
        return (0 until pending.length()).map { Contact.parse(pending.getJSONObject(it), waiting = true) } +
            (0 until list.length()).map { Contact.parse(list.getJSONObject(it)) }
    }

    suspend fun loadContacts() = withContext(Dispatchers.IO) {
        try {
            val list = Api.call("/api/contacts").optJSONArray("contacts") ?: JSONArray()
            store.save("contacts", list.toString())
            withContext(Dispatchers.Main) { contacts = savedContacts(); offline = false }
        } catch (e: Api.Offline) {
            withContext(Dispatchers.Main) { contacts = savedContacts(); offline = true }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) { contacts = savedContacts() }
        }
    }

    /** Sends contacts that were saved while offline. */
    suspend fun flushPending() = withContext(Dispatchers.IO) {
        val pending = store.pending()
        if (pending.length() == 0) return@withContext
        val left = JSONArray()
        var sent = 0
        for (i in 0 until pending.length()) {
            val item = pending.getJSONObject(i)
            try {
                Api.call("/api/contacts", "POST", JSONObject(item.toString()).apply { remove("localId"); remove("createdAt") })
                sent++
            } catch (e: Api.Offline) {
                left.put(item)
            } catch (e: Exception) {
                // The server refused it (for example a missing name): keep it so nothing is lost silently.
                left.put(item)
            }
        }
        store.setPending(left)
        if (sent > 0) withContext(Dispatchers.Main) { message = "$sent contact${if (sent == 1) "" else "s"} saved while offline uploaded." }
    }

    /** Saves a contact; when offline it is kept on the phone and sent later. Returns true when it reached the server. */
    suspend fun saveContact(draft: Draft): Boolean = withContext(Dispatchers.IO) {
        try {
            Api.call("/api/contacts", "POST", draft.toJson())
            loadContacts()
            true
        } catch (e: Api.Offline) {
            val pending = store.pending()
            pending.put(draft.toJson().put("localId", System.currentTimeMillis()).put("createdAt", System.currentTimeMillis()))
            store.setPending(pending)
            withContext(Dispatchers.Main) { contacts = savedContacts(); offline = true }
            false
        }
    }

    suspend fun stats(cardId: String): Stats? = withContext(Dispatchers.IO) {
        try {
            val o = Api.call("/api/cards/$cardId/stats")
            store.save("stats-$cardId", o.toString())
            Stats.parse(o)
        } catch (e: Exception) {
            store.load("stats-$cardId")?.let { runCatching { Stats.parse(JSONObject(it)) }.getOrNull() }
        }
    }

    /** Runs a change on the server and reports problems as a message. */
    suspend fun change(path: String, method: String = "POST", json: JSONObject = JSONObject()): JSONObject? = withContext(Dispatchers.IO) {
        try {
            Api.call(path, method, json)
        } catch (e: Exception) {
            withContext(Dispatchers.Main) { message = e.message }
            null
        }
    }

    suspend fun logIn(login: String, password: String): String? = withContext(Dispatchers.IO) {
        try {
            Api.call("/api/auth/login", "POST", JSONObject().put("login", login).put("password", password))
            refresh()
            null
        } catch (e: Exception) {
            e.message
        }
    }

    suspend fun register(username: String, email: String, password: String): String? = withContext(Dispatchers.IO) {
        try {
            Api.call("/api/auth/register", "POST", JSONObject().put("username", username).put("email", email).put("password", password))
            refresh()
            null
        } catch (e: Exception) {
            e.message
        }
    }

    /** Swaps the one-time code from a browser sign-in for a session. */
    suspend fun handoff(code: String, next: String) = withContext(Dispatchers.IO) {
        try {
            val r = Api.request("/api/auth/handoff?code=${java.net.URLEncoder.encode(code, "UTF-8")}&next=${java.net.URLEncoder.encode(next, "UTF-8")}")
            if (r.location?.contains("/login") == true) withContext(Dispatchers.Main) { message = "That sign-in has expired. Please try again." }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) { message = e.message }
        }
        refresh()
    }

    suspend fun signOut() = withContext(Dispatchers.IO) {
        runCatching { Api.request("/api/auth/logout", "POST") }
        forget()
    }

    suspend fun forget() = withContext(Dispatchers.IO) {
        Api.clearSession()
        store.clear()
        withContext(Dispatchers.Main) {
            me = null
            contacts = emptyList()
            tab = Tab.Cards
            phase = Phase.SignedOut
        }
        refresh()
    }
}
