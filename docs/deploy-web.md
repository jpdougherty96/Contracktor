# Deploy conTRACKtor Web

The web app is a static Expo export. The recommended Phase 1 hosting path is Vercel with the custom domain `contracktor.app`.

## Build Locally

Run:

```sh
npm run build:web
```

Expected output:

```txt
dist/
```

## Required Vercel Settings

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

The repo includes `vercel.json` with the static export build and a single-page-app rewrite to `index.html`.

## Domain

In Vercel:

1. Create/import the project from GitHub.
2. Set the production branch.
3. Add `contracktor.app` in Project Settings -> Domains.
4. Add `www.contracktor.app` too if you want the `www` version.
5. Follow Vercel's DNS instructions at your domain registrar.

Typical DNS shape:

```txt
contracktor.app      A/CNAME record supplied by Vercel
www.contracktor.app  CNAME record supplied by Vercel
```

Use the exact DNS values Vercel gives for the project.

## Supabase Settings To Verify

In Supabase Auth URL settings, add:

```txt
https://contracktor.app
https://www.contracktor.app
```

If email confirmations or password reset redirects are enabled later, configure their redirect URLs there too.

The receipt parser Edge Function must be deployed separately:

```sh
supabase functions deploy extract-receipt --project-ref spdhsfkiejdrctclbudv
```

## Post-Deploy Smoke Test

On `https://contracktor.app`:

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
