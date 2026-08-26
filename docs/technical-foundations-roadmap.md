# conTRACKtor technical foundations roadmap

This is the implementation order for moving conTRACKtor from a single-owner MVP foundation
to a production-grade, multi-user application. Financial truth and access control take priority
over feature speed.

## Completed foundation slice

- CI builds the production web bundle and runs both isolated Supabase integration suites.
- Start Work loads a lean active-job list instead of full financial snapshots.
- Timer defaults are resolved only for the selected job, with no first-crew-member fallback.
- The timer capability rejects non-active jobs inside the database transaction.
- TanStack Query owns the shared active-timer and Start Work job cache.
- Home prefetches Start Work data and reuses the active-timer result.
- Query data is cleared when the authenticated user changes.
- Start Work and Start Work manual entry use real Expo Router routes.
- Routed manual entry uses the navigation removal guard for unsaved changes.
- Routed screens use a shared persistent header outside scrollable content; Home remains headerless.
- A privacy-safe client crash boundary and sanitized reporting interface are in place.

## Next routed flows

Move one coherent flow at a time. Each checkpoint must pass type-checking, lint, boundary tests,
database integration tests when applicable, production web export, browser route/history checks,
and real-device verification.

1. Jobs list and `/jobs/[jobId]` dashboard routes.
2. Job create/edit and straightforward add/edit record flows.
3. Activity and Tools / Inventory.
4. Tell conTRACKtor and shopping flows.
5. Receipt capture/review last, including every unsaved-draft and financial-integrity guard.
6. Remove the legacy `Screen` union, back-screen variables, and manual history provider only after
   no screen depends on them.

Routes carry stable record IDs. Screens load authoritative records through shared query options;
they do not pass whole mutable records through navigation.

Every routed-screen checkpoint also follows these navigation rules:

- Render the shared header outside the screen's `ScrollView`; do not use CSS-style sticky positioning.
- Keep Home headerless so its reflex-zone actions remain the first content on screen.
- Let each screen own its guarded Back behavior and pass that action into the shared header.
- Verify header Back, native gestures, Android Back, and browser history against unsaved-change guards.
- Reserve the header-right slot for low-consequence context actions such as Edit or Filter.
- Reserve a fixed bottom action area for the single consequential commit on long forms, such as
  Save or Approve; ordinary actions scroll with the content.
- Remove the old in-content Back control as each screen is migrated.

## Monitoring activation gate

The reporting interface deliberately transmits no raw error message, request body, receipt text,
Tell text, customer data, address, email, financial value, token, or arbitrary metadata.

Native remote crash reporting requires:

1. A Sentry organization/project and DSN.
2. A private source-map upload token stored in EAS/Vercel secrets, never in the repository.
3. A conTRACKtor development build, because the native SDK cannot run inside Expo Go.
4. Verification that production events remain sanitized before the transport is enabled.

## Crew release gate

Do not begin manual testing of crew ownership/RLS changes against production. Before crew
implementation:

1. Create a persistent staging Supabase project.
2. Point Vercel preview deployments and development builds at staging.
3. Define authenticated business membership and user-to-job assignment.
4. Migrate ownership without weakening existing owner access.
5. Add behavioral RLS tests for owner, admin, assigned crew, unassigned crew, disabled member,
   and outside-business access.
6. Document backup, migration, verification, and rollback procedures.

## Ongoing rules

- Adopt shared query keys/options when a screen is migrated; do not big-bang every fetch at once.
- A client cache may improve speed but never authorizes a financial or access-control mutation.
- Replace source-pattern tests with behavioral coverage gradually; keep useful architectural
  boundary tests as secondary guardrails.
- Consolidate design tokens whenever a touched screen already requires visual work.
- Run accessibility and real-device performance checks at each completed user flow.
