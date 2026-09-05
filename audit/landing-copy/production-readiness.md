# conTRACKtor production-readiness report

Checked September 1, 2026.

## Decision

**Not ready to deploy to the public domains yet.**

The revised landing page itself is ready for deployment. The remaining blockers are the app-domain cutover, installed web-app metadata, authentication configuration, and live end-to-end verification.

No production deployment or DNS change was performed during this pass.

## Completed

- Applied the approved copy to the canonical `marketing/index.html` page.
- Made every FAQ item closed by default.
- Kept production Privacy and Terms links at `/privacy` and `/terms`.
- Updated title, description, Open Graph, and Twitter metadata.
- Updated and regenerated the 1200 × 630 social card.
- Verified the page at 1440 × 1000 and 390 × 844.
- Verified no horizontal overflow at either viewport.
- Verified all twelve sections appear once in the DOM.
- Verified all seven Start free links resolve to `https://app.contracktor.app/signup`.
- Verified both Sign in links resolve to `https://app.contracktor.app/`.
- Verified all FAQ items initially start closed and an answer opens when selected.
- Verified calculator behavior with a second set of values:
  - $100/hour
  - 2 missed hours/week
  - $50 unbilled materials/month
  - Result: $10,600/year
- Verified local production-root routes:
  - `/privacy/` — 200
  - `/terms/` — 200
  - `/social-card.png` — 200
  - `/robots.txt` — 200
  - `/sitemap.xml` — 200
- Ran the full automated test suite: **74 passed, 0 failed**.
- Ran Expo lint: **passed**.
- Ran the static web export: **passed**.
- Verified every local Supabase migration is present remotely through `20260901044000`.
- Verified the four required Supabase Edge Functions are active:
  - `extract-receipt`
  - `process-receipt-queue`
  - `tell-contracktor`
  - `process-tell-queue`

## Production blockers

### 1. `app.contracktor.app` does not resolve

The landing page's signup and sign-in links intentionally target the app subdomain. The subdomain currently has no working DNS result, so every primary conversion link would fail if the marketing page went live now.

Required:

1. Add `app.contracktor.app` to the app's Vercel project.
2. Add the DNS value Vercel supplies.
3. Deploy the current static Expo export.
4. Verify `/`, `/signup`, sign-in, confirmation, password reset, and deep-link return behavior.

### 2. The app build does not contain installed web-app metadata

The current static export has no web-app manifest link, no manifest file, and no Apple Home Screen metadata. The current production HTML lacks those items too.

Because the intended interim mobile experience is “add conTRACKtor to the Home Screen and use it like an app,” this should be made explicit and tested before launch.

Required minimum:

- `manifest.webmanifest` with the conTRACKtor name, `/` start URL, app scope, standalone display, theme/background colors, and icons
- `<link rel="manifest">`
- Apple mobile-web-app capability, title, status-bar, and touch-icon metadata
- 192 px, 512 px, and Apple touch icons
- rebuild and verify installation on iPhone and Android

A service worker is only required if offline behavior is promised; offline support is not currently part of the landing-page claim.

### 3. Supabase Auth production URLs need verification

Before moving the app:

- Set the Supabase Site URL to `https://app.contracktor.app`.
- Allow `https://app.contracktor.app/**` as an auth redirect.
- Retain the apex redirect temporarily until the cutover flow is verified.
- Retain the native `contracktor://**` redirect if present.

Then test new-account confirmation, sign-in, password reset, and return-to-app links.

### 4. The public domains still serve the old topology

Current external behavior during this check:

- `contracktor.app` returns a 308 redirect to `www.contracktor.app`.
- `www.contracktor.app` returns the existing Expo application.
- `app.contracktor.app` does not resolve.

Do not move the apex to marketing until the app is confirmed working at the app subdomain.

### 5. Policy contact path must be operational

The Privacy Policy and Terms use `support@contracktor.app`. Confirm that mailbox or forwarding address works before the policy pages are published publicly.

### 6. A live smoke test is still required

After the app subdomain is deployed, verify on a real phone and desktop:

- landing page → Start free → signup
- confirmation and password reset links
- sign-in and signed-in return behavior
- Home Screen installation and relaunch directly into the app
- create a job
- capture and process a receipt
- use Tell conTRACKtor and approve/undo the result
- start and stop a timer
- add hours, expense, payment, and note
- build and export an invoice
- Privacy and Terms from the public marketing site

## Safe cutover order

1. Add installed web-app metadata and rebuild the app.
2. Deploy the app to `app.contracktor.app`.
3. Update and verify Supabase Auth URLs.
4. Complete the live app smoke test.
5. Deploy `marketing/` to the marketing Vercel project.
6. Point `contracktor.app` and `www.contracktor.app` to marketing.
7. Recheck every CTA, policy route, crawler file, social card, phone viewport, and installed-app launch.

## Evidence

- Final desktop capture: `audit/landing-copy/final-desktop.png`
- Final mobile capture: `audit/landing-copy/final-mobile.png`
- Copy audit: `audit/landing-copy/copy-audit.md`
- Deployment runbook: `docs/deploy-web.md`
