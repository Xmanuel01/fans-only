import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const checks = [
  {
    file: 'supabase/functions/paystack-init/index.ts',
    patterns: [
      'KES is the only supported checkout currency',
      'Direct subscription checkout is disabled. Use wallet balance to subscribe.',
      'Direct PPV checkout is disabled. Use wallet balance to unlock PPV posts.',
      'Wallet top ups cannot target a creator or post',
    ],
  },
  {
    file: 'supabase/functions/paystack-webhook/index.ts',
    patterns: [
      'Non-critical Paystack webhook follow-up failed',
      'already_processed: true',
      'wallet_topup_succeeded notification',
    ],
  },
  {
    file: 'supabase/functions/mpesa-stk-callback/index.ts',
    patterns: [
      'Non-critical M-PESA callback follow-up failed',
      'already_processed: true',
      'wallet_topup_failed notification',
    ],
  },
  {
    file: 'supabase/migrations/20260412110000_kes_payment_launch_hardening.sql',
    patterns: [
      "check (provider in ('paystack', 'mpesa', 'wallet'))",
      'subscriptions_payment_unique_idx',
      'ppv_purchases_payment_unique_idx',
    ],
  },
  {
    file: 'supabase/migrations/20260217120000_mpesa_payouts.sql',
    patterns: [
      'tips_payment_unique_idx',
      'provider_webhook_events',
    ],
  },
  {
    file: 'supabase/migrations/20260323083000_payment_webhook_hardening.sql',
    patterns: [
      'user_wallet_ledger_credit_topup_payment_unique_idx',
      'creator_balance_ledger_credit_payment_unique_idx',
    ],
  },
  {
    file: 'user-side/src/App.tsx',
    patterns: [
      'PAYMENT_RETURN_CACHE_KEY',
      'persistPaymentReturnReference',
      'alreadyProcessed',
    ],
  },
]

const failures = []

for (const check of checks) {
  const fullPath = path.join(root, check.file)
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing file: ${check.file}`)
    continue
  }

  const content = fs.readFileSync(fullPath, 'utf8')
  for (const pattern of check.patterns) {
    if (!content.includes(pattern)) {
      failures.push(`Missing pattern in ${check.file}: ${pattern}`)
    }
  }
}

if (failures.length) {
  console.error('Payment readiness smoke check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Payment readiness smoke check passed.')
