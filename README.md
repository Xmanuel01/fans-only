# Fans Only (monorepo)

Two Vite + React + TypeScript frontends that mirror an OnlyFans-style experience:
- `user-side/`: consumer-facing app with Supabase-backed age gate.
- `creator-side/`: creator dashboard/management UI (static UX prototype).

## Quick start
- Node 20+ and npm 10+ recommended.
- Install: `npm install` inside each app directory (`user-side/`, `creator-side/`).
- Run dev server: `npm run dev`.
- Type check: `npm run lint` (user-side) or `npm run build` (creator-side also runs `tsc`).
- Build static assets: `npm run build` -> `dist/`.

## Environment
- `user-side/` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` via Vite.
- Copy the provided `.env.local.example`, `.env.staging.example`, or `.env.production.example` to the matching file and fill values; keep real secrets out of git.

## Project notes
- Supabase client lives in `user-side/src/supabaseClient.ts` and currently records age confirmations and exits.
- UI state and navigation live primarily in `user-side/src/App.tsx` and `creator-side/src/pages/*`.
- Husky + lint-staged are configured on the user side for formatting.

## Deploying
- Both apps output static bundles suitable for any CDN/static host (e.g., Vercel, Netlify, S3 + CloudFront).
- Ensure Supabase env vars are configured in the host environment before serving the user app.

## CI
- GitHub Actions workflow at `.github/workflows/ci.yml` runs `npm ci && npm run lint && npm run build` for `user-side/` and `npm ci && npm run build` for `creator-side/`.
- Add repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so the user build uses real Supabase values; otherwise fallback placeholders are used.

## Security hardening checklist (Supabase)
- **Rotate** Supabase project keys (anon & service) in the dashboard; update GitHub repo secrets accordingly. Replace any local `.env.*` with non-sensitive values (examples in `user-side/.env*.example`).
- **Enable RLS** on all tables (`profiles`, `age_gate_events`, future content tables) with policies that scope rows to `auth.uid()`.
- **Keep `service_role` server-side only** (e.g., edge functions) and never in client bundles.
- **Auth settings:** require email confirmation, configure allowed redirect domains, and enable secret-scanning alerts.
