# User App

Consumer-facing app for SpicyX, served at `/user/`.

## Local
- `npm ci`
- `npm run dev`
- `npm run lint`
- `npm run build`

## Workflow
- Auth starts here. Signed-out users land on the consumer sign-in screen.
- Age confirmation also starts here. Access to feed and creator discovery stays blocked until `profiles.age_confirmed_at` exists.
- This app owns creator discovery, subscriptions, wallet balance, wallet top-ups, and PPV unlocks.
- PPV is wallet-only in the intended flow. Direct PPV checkout is not part of the supported consumer journey.
- Creator onboarding starts here: claiming a handle creates the `creators` row, then the user continues in `/creator/`.
- Public creator profile pages are out of scope for the current user app contract.

## Environment
- Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_HELP_CENTER_URL`, `VITE_EXIT_URL`, `VITE_SUPPORT_EMAIL`
- Optional: `VITE_CREATOR_APP_URL` (defaults to `/creator`)
- Optional: `VITE_PUBLIC_APP_ORIGIN` (recommended: `https://fans-only-olive.vercel.app`)

## Production
- Vite base path is `/user/`.
- Route handling and headers are defined at repo-root `vercel.json`.
