# Creator App

Creator-facing dashboard for SpicyX, served at `/creator/`.

## Local
- `npm ci`
- `npm run dev`
- `npm run lint`
- `npm run build`

## Workflow
- This app does not own onboarding.
- Users must already be signed in, age-confirmed, and have a `creators` row before they can access the dashboard.
- If age confirmation is missing, the app sends the user back to `/user/`.
- If the creator profile is missing, the app sends the user back to `/user/` to claim a handle first.
- Supported dashboard flows are:
  - create post/story
  - view payout balances and request payouts
  - configure payout account
  - update subscription pricing
- Public creator profile pages are out of scope for the current creator-app contract.

## Routes
- `/creator/posts/create`
- `/creator/my/payments`
- `/creator/my/banking`
- `/creator/my/settings/subscription`

## Environment
- Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_CONSUMER_APP_URL` (defaults to `/user`)
- Optional: `VITE_PUBLIC_APP_ORIGIN` (recommended: `https://fans-only-olive.vercel.app`)
- Optional: `VITE_CREATOR_BASE_PATH` (defaults to `/creator`)

## Production
- Vite base path is `/creator/`.
- Route handling and headers are defined at repo-root `vercel.json`.
