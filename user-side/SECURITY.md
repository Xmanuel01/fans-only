# Security Policy

## Reporting

- Email security@yourdomain.com with a clear description and reproduction steps.
- Please do not open public issues for vulnerabilities.

## Handling

- We triage within 2 business days.
- Fixes are prioritized by severity and deployed to staging before production.

## Practices in this repo

- No secrets committed; use .env.* via CI. Regenerate Supabase keys after any exposure and rotate GitHub repo secrets.
- Pre-commit runs formatting to reduce diff noise; add lint/type checks as we grow.
- Dependencies monitored via npm audit in CI (add Dependabot when repo is on Git).

## Hardening TODO

- Add CSP/helmet headers at hosting layer.
- Add SAST/DAST to CI.
- Add RLS policy tests and migrations for Supabase tables; enforce RLS on all tables.
