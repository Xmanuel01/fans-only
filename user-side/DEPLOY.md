# Deploy (Route-based)

User app is served at `/user/` under the main domain.

## Required env
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Build expectations
- Vite base path: `/user/`
- Output is merged into root `dist/user/` by the monorepo build.

## Smoke checks
- `GET /user/` returns 200.
- Deep links under `/user/*` return SPA HTML (not 404).
- Supabase requests are not blocked by CSP.
