# Payment Sandbox Checklist

Run this checklist before adding live API credentials.

## Repo checks
- Run `npm test` from the repo root.
- Confirm `Payment readiness smoke check passed.` appears in the output.
- Confirm both `user-side` and `creator-side` typechecks pass.

## User payment flows
- Paystack wallet top-up:
  - Start a KES top-up from the wallet page.
  - Complete the provider flow once.
  - Verify exactly one `payments` row is marked `succeeded`.
  - Verify exactly one `user_wallet_ledger` `credit_topup` row exists for that payment.
  - Verify wallet available balance increases once.
- Paystack webhook replay:
  - Re-send the same `charge.success` payload.
  - Verify wallet balance does not change again.
  - Verify creator balance does not change again.
  - Verify no duplicate tip row is created.
- M-PESA STK success:
  - Start a KES top-up with a valid sandbox phone number.
  - Complete the callback flow.
  - Verify one wallet credit and one successful payment state transition.
- M-PESA STK failure:
  - Simulate a failed callback.
  - Verify the payment is marked canceled and wallet balance is unchanged.
- Wallet subscription:
  - Ensure the wallet has enough KES balance.
  - Subscribe once and verify one wallet debit, one subscription activation, and one creator credit.
  - Repeat the same subscribe action while already active and verify no second debit occurs.
- Wallet PPV:
  - Unlock a PPV post once and verify one wallet debit, one `ppv_purchases` row, and one creator credit.
  - Retry the same unlock and verify no second debit occurs.

## Creator payout flows
- Payout rail setup:
  - Save one verified M-PESA payout destination.
  - Save one verified bank payout destination.
  - Save one verified card-backed payout destination.
  - Confirm PayPal is not used in the live KES flow.
- Payout request:
  - Request a payout below available balance and verify one queued/submitted transfer is created.
  - Retry the same request with the same idempotency key and verify the original transfer is returned.
  - Request more than available balance and verify it is rejected.
- Payout settlement:
  - Simulate a payout success webhook/event and verify pending decreases without restoring available.
  - Simulate a payout failure or reversal and verify available is restored exactly once.

## Operational checks
- Verify all required sandbox env vars are present before invoking payment functions.
- Verify notification failures are logged but do not reopen webhook replay risk after money movement has been committed.
- Verify unsupported direct Paystack subscription and PPV checkout requests fail immediately with clear errors.
