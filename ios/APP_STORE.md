# Publishing MK Cards on the App Store

The app is native SwiftUI around the MK Cards pages, built to pass App Review's "minimum functionality" rule (4.2):

| Native feature | Framework |
|---|---|
| Welcome, log-in and sign-up screens | SwiftUI |
| Sign in with Apple (required by rule 4.8 because Google/Microsoft sign-in is offered) | AuthenticationServices |
| Microsoft / Google sign-in in Apple's secure browser sheet | ASWebAuthenticationSession |
| Tab bar: Cards, Share, Scan, Contacts, Account | SwiftUI TabView |
| Share screen: full-size QR (screen brightened), share sheet, copy link | SwiftUI, Core Image |
| Add to Apple Wallet | PassKit |
| Write the card's link to NFC tags | Core NFC |
| Business-card scanner with edge detection, on-device text and QR reading | VisionKit, Vision |
| Live badge QR scanner | VisionKit DataScanner |
| Save contacts to iPhone Contacts | ContactsUI |
| Pull to refresh, haptics, offline screen | UIKit |

## One-time setup (Apple Developer portal)

1. **Identifiers › App IDs › `app.mkcards`** (create it if missing): turn on **Sign In with Apple** and **NFC Tag Reading**.
2. In Xcode: open the project (`xcodegen generate && open MKCards.xcodeproj`), choose your team under Signing & Capabilities.
   The entitlements file already asks for both capabilities.
3. **App Store Connect › My Apps › +**: bundle ID `app.mkcards`, name "MK Cards", primary category Business.
4. Product › Archive › Distribute App › App Store Connect.

## App Store Connect answers

- **Age rating:** 4+. **Encryption:** the Info.plist already says no non-exempt encryption.
- **Privacy policy URL:** https://mkcards.pages.dev/privacy
- **App Privacy:** Data linked to the user, not used for tracking: Name, Email address, Phone number, Photos (card photo),
  Contacts (people the user scans or saves), all for App Functionality. Product interaction (card views and taps,
  not linked to the person viewing) for Analytics. This matches `PrivacyInfo.xcprivacy`.
- **Account deletion:** Account tab › Delete account (rule 5.1.1(v)).
- **Sign-in for review:** create a demo account on the site with one card and a few contacts, and give its username
  and password in "App Review Information". Note that Microsoft/Google sign-in needs a company account and is optional.
- **Payments:** the app sells nothing. Do not add links to buy plans inside the app; company plans are sold on the website.
  If you later sell plans to individuals in the app, use In-App Purchase.

## Review notes to paste

> MK Cards creates digital business cards. Use the demo account below. Native features: Share tab (QR code, Apple
> Wallet pass, NFC tag writing), Scan tab (VisionKit document camera reads business cards on the device; live QR
> scanner reads event badges), Contacts saved to the iPhone address book, Sign in with Apple.

## Screenshots

App Store needs 6.9" iPhone screenshots (1320 × 2868). Take them on an iPhone 16 Pro Max simulator: Welcome, Share,
Scan (document camera), Contacts, a card page.
