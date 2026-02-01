# Architecture Overview

## Frontend

- Vite + React + TypeScript single-page app.
- UI state in src/App.tsx; uses local state for navigation and age gate.
- Styling in src/style.css.

## Age Gate Flow

1. On load: check localStorage flag and Supabase profiles.age_confirmed_at.
2. If not confirmed: modal blocks UI until user accepts or exits.
3. Confirm: set localStorage + call markAgeConfirmed() (Supabase update).
4. Exit: call logAgeExit() then redirect away.

## Supabase Integration

- Client in src/supabaseClient.ts created from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
- Helper functions: get session, fetch age confirmation, mark confirmation, log exits.
- Future: add content tables, RLS, payments integration.

## Environments

- .env.local for dev, .env.staging for staging, .env.production for prod (all referenced via Vite import.meta.env).
- Secrets supplied by CI/CD; local examples live in \*.example files.

## Build & Deploy

- pm run build => dist/ static assets.
- Deploy dist/ to static host/CDN; Supabase handles backend data/auth/storage.

## Testing (current)

- pm run lint runs TypeScript type check; add unit/E2E suites next.
