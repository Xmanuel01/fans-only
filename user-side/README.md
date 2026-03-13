# User App

Consumer-facing app for SpicyX, served at `/user/`.

## Local
- `npm ci`
- `npm run dev`
- `npm run lint`
- `npm run build`

## Environment
- Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_CREATOR_APP_URL` (defaults to `/creator`)
- Optional: `VITE_PUBLIC_APP_ORIGIN` (recommended: `https://fans-only-olive.vercel.app`)

## Production
- Vite base path is `/user/`.
- Route handling and headers are defined at repo-root `vercel.json`.
