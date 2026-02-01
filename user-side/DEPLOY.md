# Deploy

## Build

- Ensure env vars set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- Install: npm install
- Type check + build: npm run build

## Staging

- Use \.env.staging\ values in CI/CD secrets
- Run npm run build
- Deploy \dist/\ to staging host (Vercel/Netlify/static bucket)

## Production

- Promote from staging
- Inject prod secrets via CI (never commit .env.production)
- Cache static assets with a CDN; set immutable headers for hashed files

## Smoke tests

- Age gate renders and blocks content until confirmed
- Supabase call returns age_confirmed true for signed-in user
- Main pages load (home/explore/membership)

## Rollback

- Keep previous build artifact; redeploy last-good dist if smoke fails
