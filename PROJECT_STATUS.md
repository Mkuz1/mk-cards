# MK Cards: project status

_Source of truth for this app's claude.ai chat. As of 2026-11-27._

Digital business cards: register, make a card at `mkcards.pages.dev/username`, share by link or QR, save contacts and send yours back.

## Current state

| | |
|---|---|
| Versions | Web app **2.7.1**; Android **2.1.1**; iPhone **2.1.1** |
| Platforms | Web, Android (`com.mkcards.mk`), iPhone (`app.mkcards`) |
| Downloads | GitHub release **v2.1.1** in this repo (2026-11-26): `MK-Cards-2.1.1-android.apk` (signed with `~/keys/mk-cards-play-upload.jks`, not the older MKCARDS key) and unsigned `MK-Cards-2.1.1-iphone.ipa` |
| Website / app | **https://mkcards.pages.dev** (Pages proxy) in front of Worker `mkcards` (https://mkcards.mk-uz02.workers.dev); data in a Durable Object |
| Deploy | `worker.yml` auto-deploys `web/` on push to main (Workers token, set 2026-11-26) |
| App Store / Play | Not live |

## Rules specific to this app

- Bump `VERSION` in `web/public/sw.js` and `APP_VERSION` in `app.js` on every web change, or returning visitors keep the cached page.
- The app shell must NOT get a canonical tag or app JSON-LD: the Worker rewrites OG tags per shared card.

## Recent changes

- 2026-11-26: Worker auto-deploy (PR #2); koussa.net invite (PR #1); SEO (PR #3); landing page shows Android and iPhone downloads, iOS version 2.1.1 to match Android (PR #4); web 2.7.1 (PR #5); 2.7.0 redesigned landing page and styling.

## Open items

- **Requested 2026-11-26, in progress:** make the iPhone/iPad app match the Android app 100% (interface and features), and add in-app update notices on Android and iOS when a new GitHub release is published.

## Rules for every MK app (decided in the MK APPS project)

- **This file is the hand-off to the app's own Claude chat.** That chat reads it from GitHub through Project knowledge. Every change to this app (code, release, store, website, decision) must also update this file in the same PR or commit.
- **Nothing local-only.** Every asset, store file and site file lives in the app's GitHub repo. Signing keys and passwords are the only exception and are never committed (they stay in `~/keys` on the Mac).
- **Websites deploy themselves** to Cloudflare Pages from GitHub Actions on push (secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are set on the repo). No manual or terminal deploys.
- **Every app site invites visitors to https://www.koussa.net** (the MK Apps showcase, source in `Mkuz1/MK-APPS`, served by Cloudflare project `mkuzapps`). Keep that card when editing the site, and update the app's row in `MK-APPS/build.py` when platforms, versions or store links change.
- **SEO and share previews (done 2026-11-26):** keep the OG + Twitter tags with an absolute 1200x630 image under 300 KB, canonical, favicon.ico + 192/512 icons + 180 px touch icon, web manifest, robots.txt, sitemap.xml and SoftwareApplication JSON-LD. When replacing a share image, give it a new file name so WhatsApp refreshes its cache.
- **Store badges only for what is really live.** Re-check the App Store / Play page before adding a badge.
- **Mohamad merges pull requests himself** (Claude Code's auto mode on the Mac blocks `gh pr merge`).

---
_Last updated 2026-11-27. Update this file with every change to the app._
