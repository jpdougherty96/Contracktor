# Deploy conTRACKtor Web

The production web presence uses two Vercel projects:

- `https://contracktor.app` serves the static marketing site from `marketing/`.
- `https://app.contracktor.app` serves the static Expo web export from the repository root.

## Build Locally

Run:

```sh
npm run build:web
```

Expected output:

```txt
dist/
```

## App Vercel Project

Build command:

```sh
npm run build:web
```

Output directory:

```txt
dist
```

Install command:

```sh
npm install
```

Environment variables:

```sh
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The root `vercel.json` contains the static export build and single-page-app rewrite. Add `app.contracktor.app` to this project before moving the apex domain.
Automatic Git deployments are disabled for this project so production app
releases remain an explicit, gated action. Deploy the app with `vercel --prod`
after the release checks pass.

## Marketing Vercel Project

Create a second Vercel project from the same repository with:

```txt
Root Directory: marketing
Framework Preset: Other
Build Command: none
Output Directory: .
```

The marketing project includes its own `vercel.json`, policy pages, `robots.txt`, sitemap, and social preview image. Add `contracktor.app` and optionally `www.contracktor.app` to this project only after the app works at `app.contracktor.app`.
Its Vercel configuration temporarily redirects legacy app bookmarks such as
`/jobs`, `/activity`, `/start-work`, and `/hours/new` to the app subdomain.

Provision `support@contracktor.app` before publishing the Privacy Policy and Terms links.

## Domains and DNS

In Vercel:

1. Add `app.contracktor.app` to the app project.
2. Verify the full app there while the existing apex remains unchanged.
3. Add `contracktor.app` to the marketing project.
4. Add `www.contracktor.app` to the marketing project if wanted.
5. Follow the exact DNS instructions Vercel provides for each project.

Typical DNS shape:

```txt
contracktor.app      A/CNAME record supplied by Vercel (marketing)
www.contracktor.app  CNAME record supplied by Vercel (marketing)
app.contracktor.app  CNAME record supplied by Vercel (app)
```

Use the exact DNS values Vercel gives for the project.

## Supabase Settings To Verify

In Supabase Auth → URL Configuration, set:

```txt
Site URL: https://app.contracktor.app
Redirect allow list: https://app.contracktor.app/**
```

Keep `https://contracktor.app/**` in the redirect allow list until the cutover and existing auth links have been verified. Keep the native `contracktor://**` entry if present.

The receipt queue worker must be deployed separately:

```sh
supabase functions deploy process-receipt-queue --project-ref TARGET_PROJECT_REF
```

## Cutover Order

1. Deploy the current app code and verify `/signup` at `app.contracktor.app`.
2. Update the Supabase Site URL and redirect allow list.
3. Verify sign-up, sign-in, confirmation, password reset, and deep-link return behavior.
4. Notify beta users that the app is moving and they will need to sign in again.
5. Deploy `marketing/` as the apex project and move `contracktor.app` to it.
6. Verify Privacy, Terms, crawler files, CTA links, and returning-user messaging.
7. Remove the old apex auth redirect only after the cutover is confirmed.

## Post-Deploy Smoke Test

On `https://app.contracktor.app`:

- Sign up or sign in.
- Create a job.
- Add a manual expense.
- Upload a receipt from the browser.
- Use web camera receipt capture if the browser supports it.
- Add hours.
- Add payment.
- Add note.
- Export invoice.
- Export job report.

If receipt parsing fails but upload works, verify the Edge Function deployment and secrets.

On `https://contracktor.app`:

- Open the landing page at desktop and mobile sizes.
- Confirm every Start free link goes to `https://app.contracktor.app/signup`.
- Confirm Sign in goes to `https://app.contracktor.app/`.
- Open `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`, and `/social-card.png`.
- Confirm Vercel Web Analytics is enabled for the marketing project.
