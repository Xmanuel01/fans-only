# OnlyFans-like Frontend

## Quick start

- Node 20+, npm 10+
- Install deps: \
  pm install\
- Local env: copy \.env.local.example\ to \.env.local\ and fill Supabase keys
- Run dev server: \
  pm run dev\
- Type check: \
  pm run lint\
- Format check: \
  pm run format\

## Project structure

- \src/App.tsx\: UI + navigation + age gate
- \src/style.css\: global styles
- \src/supabaseClient.ts\: Supabase client + age-gate helpers

## Tooling

- Vite + React + TypeScript
- Prettier for formatting
- Husky + lint-staged for pre-commit checks

## Environment files

- \.env.local\ (dev)
- \.env.staging\
- \.env.production\
  Use the \*.example templates and keep real secrets out of git.
