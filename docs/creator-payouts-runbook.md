# Creator Payouts Runbook

## Scope
- Live creator payout rails: `M-PESA`, `Bank`, `Card`
- Currency: `KES`
- Approval model: manual operations review before payouts are enabled

## Required Secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_CARD_SETUP_AMOUNT_MAJOR`
- `PAYOUT_QUEUE_CRON_TOKEN`
- `OPERATOR_API_TOKEN`
- `MPESA_CALLBACK_TOKEN`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_API_BASE`

`PayPal` stays in backend compatibility paths, but it is hidden from the live creator UI.

## Required Function Deploys
Run from repo root:

```powershell
npx supabase functions deploy request-creator-payout
npx supabase functions deploy request-paypal-payout
npx supabase functions deploy upsert-mpesa-payout-account
npx supabase functions deploy upsert-bank-payout-account
npx supabase functions deploy start-creator-card-payout-setup
npx supabase functions deploy complete-creator-card-payout-setup
npx supabase functions deploy process-payout-queue
npx supabase functions deploy paystack-webhook
npx supabase functions deploy paypal-webhook
npx supabase functions deploy review-creator-payout-account
```

## Required Database Deploy
```powershell
npx supabase db push
```

## Queue Scheduler
`process-payout-queue` must be called on a fixed cadence. A 1-5 minute interval is acceptable.

Example authenticated request:

```powershell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/process-payout-queue" ^
  -H "Authorization: Bearer <PAYOUT_QUEUE_CRON_TOKEN>"
```

## Paystack Webhooks
Configure Paystack to send events to:

```text
https://<project-ref>.supabase.co/functions/v1/paystack-webhook
```

Required event coverage:
- incoming revenue settlement events used by existing wallet credit flows
- outgoing transfer status events:
  - `transfer.success`
  - `transfer.failed`
  - `transfer.reversed`

## PayPal Webhooks
If PayPal remains enabled in backend compatibility mode, configure:

```text
https://<project-ref>.supabase.co/functions/v1/paypal-webhook
```

Required event coverage:
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
- `PAYMENT.PAYOUTS-ITEM.FAILED`
- `PAYMENT.PAYOUTS-ITEM.RETURNED`
- `PAYMENT.PAYOUTS-ITEM.BLOCKED`
- `PAYMENT.PAYOUTS-ITEM.DENIED`
- `PAYMENT.PAYOUTS-ITEM.CANCELED`
- `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`
- `PAYMENT.PAYOUTS-ITEM.ONHOLD`

## Manual Verification
Creators cannot self-verify payout methods. Ops must review and update the saved payout account.

Operator function endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/review-creator-payout-account
```

Example: verify a creator payout account

```powershell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/review-creator-payout-account" ^
  -H "Content-Type: application/json" ^
  -H "x-operator-token: <OPERATOR_API_TOKEN>" ^
  -d "{\"creatorId\":\"<creator-uuid>\",\"provider\":\"mpesa\",\"status\":\"verified\",\"reviewedBy\":\"<ops-user-uuid>\",\"reason\":\"KYC approved\",\"metadata\":{\"ticket\":\"OPS-123\"}}"
```

Example: reject a creator payout account

```powershell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/review-creator-payout-account" ^
  -H "Content-Type: application/json" ^
  -H "x-operator-token: <OPERATOR_API_TOKEN>" ^
  -d "{\"creatorId\":\"<creator-uuid>\",\"provider\":\"bank\",\"status\":\"rejected\",\"reason\":\"Account name mismatch\",\"metadata\":{\"ticket\":\"OPS-124\"}}"
```

Example: mark a payout account inactive

```powershell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/review-creator-payout-account" ^
  -H "Content-Type: application/json" ^
  -H "x-operator-token: <OPERATOR_API_TOKEN>" ^
  -d "{\"creatorId\":\"<creator-uuid>\",\"provider\":\"card\",\"status\":\"inactive\",\"reason\":\"Recipient disabled by ops\"}"
```

## Post-Deploy Smoke Checklist
1. Save an `M-PESA` payout method and verify it appears as `Pending review`.
2. Save a `Bank` payout method and verify it appears as `Pending review`.
3. Complete `Card` setup and verify the saved card appears as `Pending review`.
4. Use the operator endpoint to mark the saved method `Verified`.
5. Request a payout with a verified method and sufficient available balance.
6. Confirm the transfer shows `Queued` or `Submitted` in creator history.
7. Trigger or wait for the scheduler to process due queue items.
8. Confirm a Paystack success webhook moves the transfer to `Success`.
9. Confirm a Paystack failure or reversal webhook returns the amount to available balance exactly once.
10. Confirm duplicate webhooks do not create duplicate balance reversals.

## Expected Creator UX States
- `Pending review`: method saved, payouts blocked until ops review
- `Verified`: payouts enabled
- `Rejected`: creator must update the payout method
- `Inactive`: creator must re-save a valid method or contact support

## Notes
- The creator UI intentionally exposes one active payout method at a time.
- `PayPal` is hidden from the live creator payments workflow until intentionally reintroduced.
