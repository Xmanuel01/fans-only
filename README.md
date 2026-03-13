# SpicyX Monorepo

Three Vite + React + TypeScript frontends deployed as one route-based application:
- `landingpage/` -> `/app/`
- `user-side/` -> `/user/`
- `creator-side/` -> `/creator/`

Primary host: `https://fans-only-olive.vercel.app` (redirects to `/app/`).

## Quick start
- Node 20+ and npm 10+ recommended.
- Install dependencies:
  - `npm ci`
  - `npm --prefix landingpage ci`
  - `npm --prefix user-side ci`
  - `npm --prefix creator-side ci`
- Run local development:
  - `npm run dev`

## Build and test
- Lint all apps: `npm run lint`
- Test all apps: `npm run test`
- Build unified static output: `npm run build`
- Unified output structure:
  - `dist/app/`
  - `dist/user/`
  - `dist/creator/`

## Deployment (single Vercel project)
- Set project root to repository root.
- Build command: `npm run build`
- Output directory: `dist`
- `vercel.json` at repo root controls redirects, rewrites, CSP, and headers.

## Environment
- User app (`user-side`) expects:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Optional: `VITE_CREATOR_APP_URL` (defaults to `/creator`)
  - Optional: `VITE_PUBLIC_APP_ORIGIN` (recommended: `https://fans-only-olive.vercel.app`)
- Creator app (`creator-side`) expects:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Optional: `VITE_CONSUMER_APP_URL` (defaults to `/user`)
  - Optional: `VITE_PUBLIC_APP_ORIGIN` (recommended: `https://fans-only-olive.vercel.app`)
  - Optional: `VITE_CREATOR_BASE_PATH` (defaults to `/creator`)

## Smoke checks
- Script: `node scripts/smoke-check.mjs <base-url>`
- Validates:
  - `/` redirects to `/app/`
  - `/app/`, `/user/`, `/creator/` return 200
  - deep links return SPA HTML
  - critical headers/CSP are present

## Security checklist (Supabase)
- Rotate anon/service keys after exposure.
- Keep `service_role` server-side only.
- Enforce RLS on all tables.
- Configure allowed auth redirect domains.
