# Landing page integration — implementation brief

Status: code implemented locally on September 1, 2026. Vercel, DNS, Supabase dashboard, beta-user notice, support mailbox, and legal-review steps remain manual. Sequencing matters — see Cutover at the end.

Target: `contracktor.app` serves a static marketing page, `app.contracktor.app`
serves this Expo web export. Marketing lives at `marketing/` in this repo.

---

## 1. Marketing deployment

- Page file: `marketing/index.html` (move from `brand/landing/index.html`).
- Second Vercel project, same Git repo, **Root Directory = `marketing`**,
  Framework Preset = Other, **no build command**, output = the directory itself.
- The root `vercel.json` does NOT apply to that project — Vercel reads
  `vercel.json` from the project's root directory. Add `marketing/vercel.json`
  only if headers are needed.
- CI: `.github/workflows/quality.yml` currently runs the full Expo pipeline on
  every push. Add `paths-ignore: ['marketing/**', 'brand/**', 'docs/**']` to the
  `push` and `pull_request` triggers so a copy tweak doesn't run a web build.

---

## 2. `/signup` route

Today `vercel.json` rewrites unmatched paths to `index.html`, so
`app.contracktor.app/signup` boots expo-router and lands on `+not-found`.

- Create `app/(tabs)/signup.tsx`. The `(tabs)` group is not part of the URL —
  `app/(tabs)/jobs.tsx` already serves `/jobs` — so this yields `/signup`.
- Register it in `app/(tabs)/_layout.tsx`: `<Stack.Screen name="signup" />`.
- It renders `AuthScreen` with signup preselected, wrapped in
  `RoutedScreenFrame`. It must NOT go through `AuthenticatedRoute`.
- If a session already exists (`useEntitlements().session`), `<Redirect href="/" />`.
- The static export will emit `dist/signup.html`, which Vercel serves directly.

### `AuthScreen` change

`src/screens/AuthScreen.tsx` hardcodes `useState<AuthMode>('login')`.

- Export the `AuthMode` type.
- Add optional `initialMode?: AuthMode` to `AuthScreenProps`.
- `useState<AuthMode>(initialMode ?? 'login')`.

Nothing else changes. The duplicate-signup path already works correctly and
should not be touched.

---

## 3. Audience cookies

New file: `src/lib/audienceCookies.ts`. **Web only** — every function must no-op
when `Platform.OS !== 'web'`.

```
markKnownUser()      // ct_known=1
markSessionActive()  // ct_session=1
clearSessionCookie() // expire ct_session
```

Rules, all of which matter:

- **Domain.** Derive from `window.location.hostname`. If it ends with
  `contracktor.app`, set `Domain=.contracktor.app` so the apex and the subdomain
  both see it. Otherwise **omit Domain entirely** — setting `.localhost` or a
  Vercel preview host silently fails and the cookie never appears.
- **Not HttpOnly.** The marketing page's JavaScript has to read these. That is
  safe *because* they carry no token, id or email — only `1`. Do not "harden"
  this later by making them HttpOnly; it breaks the feature and protects nothing.
- Attributes: `Path=/; SameSite=Lax`, plus `Secure` when `location.protocol` is
  `https:`.
- `ct_known`: `Max-Age` ~2 years. Never cleared.
- `ct_session`: `Max-Age` ~30 days, rewritten on every load that has a session,
  cleared on sign out and on a load with no session. A plain session cookie is
  wrong here — the Supabase session outlives the browser window, so the user
  would look "returning" when they are actually signed in.

### Where to call it

One place covers sign-in, sign-up, token refresh, sign-out and expiry:
`EntitlementsContext`, in the effect that reacts to `session`.

- session present → `markKnownUser()` and `markSessionActive()`
- session null → `clearSessionCookie()`

Also call `clearSessionCookie()` inside `signOut()` in `src/lib/auth.ts` as a
belt-and-braces measure, before or after the Supabase call.

**These cookies are a UX hint, never authentication.** The app stays the only
authority. A stale cookie costs the user one extra tap; that is the intended
failure mode and no code should treat them as proof of anything.

---

## 4. Preserve the destination through sign-in

`src/components/AuthenticatedRoute.tsx` currently does `<Redirect href="/" />`
and forgets where the user was going. Share a link to `/jobs/abc123`, sign in,
land on Home. This is a live bug today, independent of the domain move.

- Capture the attempted path (`usePathname()` plus any params) and redirect to
  `/?returnTo=<encodeURIComponent(path)>`.
- In `app/(tabs)/index.tsx`, once a session exists and the screen resolves to
  `home`, read `returnTo` and `router.replace()` to it, then drop the param.
- **Validate before navigating.** Accept only a path starting with a single `/`
  — reject `//host`, anything containing `:`, and anything with a scheme. Client
  side or not, do not build an open redirect.
- Password recovery is out of scope for this: that redirect originates from an
  email and will not carry `returnTo`.

---

## 5. Supabase dashboard (no code)

Auth → URL Configuration:

- **Site URL** → `https://app.contracktor.app`
- **Redirect allow list** → add `https://app.contracktor.app/**`, and **keep**
  `https://contracktor.app/**` until the cutover is confirmed. Both may be
  listed at once, so there is no broken window.
- Keep the native scheme entry if one exists (`contracktor://**`).

Doing this *after* DNS moves breaks every password-reset and confirmation link,
because they would land on the marketing page, which has no auth handling.

---

## 6. Crawlers

- App: add `<meta name="robots" content="noindex" />` via `app/+html.tsx`, or
  Google will index the login screen.
- Marketing: OG and Twitter tags, canonical, and a `robots.txt` that allows
  indexing. None exist today on either host.

---

## 7. Known limitation to leave alone for now

The signed-in quick-action bar links Capture receipt and Tell conTRACKtor to the
app home screen, because neither is a route — both are state on
`app/(tabs)/index.tsx`. Start work and Your jobs deep-link properly. Routing
those two is the natural next slice of the technical-foundations roadmap; do not
fake it with `legacyScreen` params from an external site.

---

## Cutover order

Sequenced so authentication is never broken:

1. `/signup` route + `AuthScreen.initialMode`
2. `audienceCookies.ts` + the `EntitlementsContext` and `signOut` calls
3. `AuthenticatedRoute` returnTo fix
4. Both domains in the Supabase allow list
5. Add `app.contracktor.app` to the existing Vercel project; verify the app
   fully works there while `contracktor.app` still serves it
6. Email beta users: the app is moving, and they will be signed out once
   (sessions live in origin-scoped `localStorage` and do not follow a subdomain)
7. New Vercel project for `marketing/`; point `contracktor.app` at it
8. Remove `contracktor.app` from the Supabase allow list

Step 6 is not optional. Every existing beta user's bookmark and any home-screen
PWA icon will open the marketing page, and they will not have `ct_known` yet, so
they will see the first-time-visitor version of it. Consider a temporary
"Looking for the app? It moved to app.contracktor.app" line on the marketing
page for the first month.
