package app.mkcards

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Opens the app as a phone would and checks the first screens draw without crashing. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LaunchTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun opensWithoutCrashing() {
        rule.waitForIdle()
        // Signed out (no session in the test): the welcome screen shows.
        rule.waitUntil(15_000) { rule.activity.state.phase != Phase.Loading }
        rule.onNodeWithText("Log in with username").assertExists()
    }

    @Test
    fun signedInScreensDraw() {
        rule.waitUntil(15_000) { rule.activity.state.phase != Phase.Loading }
        val state = rule.activity.state
        rule.runOnUiThread {
            state.me = Me(
                User("demo", "demo@example.com", true, emptyList(), "Northwind", "owner"),
                listOf(CardEntry("c1", "", "Alex Morgan", "Head of Partnerships", "Northwind", "Work", "#2a5ba8", true, 9, 5)),
                appleWallet = false, googleWallet = true, googleSignIn = true, microsoftSignIn = false,
            )
            state.contacts = listOf(Contact(1, "Layla Haddad", "Procurement Manager", "Gulf Logistics", "l@example.com", "", "+971 52 555 0199",
                "", "", "", "GITEX", "scan", 0, false, ""))
            state.phase = Phase.SignedIn
        }
        for (tab in Tab.values()) {
            rule.runOnUiThread { state.tab = tab }
            rule.waitForIdle()
        }
        rule.runOnUiThread { state.tab = Tab.Cards }
        rule.onNodeWithText("Alex Morgan").assertExists()
    }
}
