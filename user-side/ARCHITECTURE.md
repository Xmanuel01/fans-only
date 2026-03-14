# Architecture Overview

## Frontend

- Vite + React + TypeScript single-page app.
- UI state lives in `src/App.tsx`; navigation is local-state driven instead of route-driven.
- Styling in src/style.css.

## Session And Boot Flow

1. Validate required Vite env vars before rendering the app shell.
2. Fetch the current Supabase session.
3. If no session exists, show the auth prompt.
4. Once signed in, ensure a `profiles` row exists and load:
   - creator profile
   - active subscriptions
   - wallet balance
   - PPV purchases
   - feed posts
   - stories
5. Fetch `profiles.age_confirmed_at` and keep the age gate open until confirmed.

## Age Gate Flow

1. Signed-in users see a blocking age gate until `profiles.age_confirmed_at` is set.
2. Enter updates `profiles.age_confirmed_at` through the client helper and logs an `age_gate_events` entry.
3. Exit logs an `age_gate_events` exit and redirects to `VITE_EXIT_URL`.

## Supabase Integration

- Client in src/supabaseClient.ts created from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
- Consumer reads from `profiles`, `creators`, `subscriptions`, `user_wallets`, `ppv_purchases`, and `posts`.
- Recommended creators come from the `get_recommended_creators` RPC.
- Media is loaded from Supabase Storage using signed URLs.
- Wallet top-ups use `paystack-init` or `mpesa-stk-init`.
- Subscription checkout uses `paystack-init`.
- PPV unlocks use the `purchase_ppv` RPC and spend wallet balance directly.
- Feature requests go through the `feature-request` edge function.

## Consumer Workflow

1. Sign in with Google or email/password.
2. Confirm age to unlock the app.
3. Browse feed and creator recommendations.
4. Subscribe to creators through Paystack checkout.
5. Top up wallet through Paystack or M-PESA.
6. Unlock PPV posts from wallet balance.
7. Claim a creator handle from the home screen to create the `creators` row.
8. Continue creator operations in `/creator/`.

## Scope Notes

- This app intentionally owns creator onboarding.
- The creator dashboard assumes onboarding is already complete.
- Public creator profile pages are not part of the current consumer-app contract.

## Environments

- .env.local for dev, .env.staging for staging, .env.production for prod (all referenced via Vite import.meta.env).
- Secrets supplied by CI/CD; local examples live in \*.example files.

## Build & Deploy

- pm run build => dist/ static assets.
- Deploy dist/ to static host/CDN; Supabase handles backend data/auth/storage.

## Testing (current)

- pm run lint runs TypeScript type check; add unit/E2E suites next.
