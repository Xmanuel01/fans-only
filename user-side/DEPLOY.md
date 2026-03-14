# Deploy (Route-based)

User app is served at `/user/` under the main domain.

## Required env
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_HELP_CENTER_URL`
- `VITE_EXIT_URL`
- `VITE_SUPPORT_EMAIL`

## Recommended env
- `VITE_PUBLIC_APP_ORIGIN=https://fans-only-olive.vercel.app` (forces auth callbacks to primary domain)

## Build expectations
- Vite base path: `/user/`
- Output is merged into root `dist/user/` by the monorepo build.

## Smoke checks
- `GET /user/` returns 200.
- Deep links under `/user/*` return SPA HTML (not 404).
- Supabase requests are not blocked by CSP.
