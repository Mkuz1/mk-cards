# MK Cards for iPhone

The app shows the MK Cards site full-screen and adds the share sheet, saving contacts and QR codes,
and adding cards to Apple Wallet without leaving the app.

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
