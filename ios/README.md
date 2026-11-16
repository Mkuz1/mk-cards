# MK Cards for iPhone

A native SwiftUI app: its own welcome and sign-in screens (Sign in with Apple, Microsoft, Google, username),
a tab bar (Cards, Share, Scan, Contacts, Account), a native Share screen (QR, Apple Wallet, NFC tags), and a native
business-card and badge scanner. The Cards, Contacts and Account tabs show the MK Cards pages, so they are always
current. See [APP_STORE.md](APP_STORE.md) for publishing.

Sign in with Apple and NFC need a paid developer account with those capabilities on the App ID; sideloaded builds
signed with a free Apple ID skip them.

## Get the app

Every push to `main` that changes this folder builds an unsigned IPA on GitHub
(Actions → "iOS app"). Download it from the run's Artifacts or from the `ios-build` branch.

Install it with [Sideloadly](https://sideloadly.io) or [AltStore](https://altstore.io): they sign the IPA with
your Apple ID while installing. With a paid Apple Developer account the app stays installed for a year.

## Build on a Mac

```bash
brew install xcodegen
xcodegen generate
open MKCards.xcodeproj
```

The site address is `MK_SITE_URL` in `project.yml`.
