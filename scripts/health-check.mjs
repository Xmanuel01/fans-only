import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const envChecks = [
  {
    label: "user-side/.env",
    path: "user-side/.env",
    required: [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "VITE_HELP_CENTER_URL",
      "VITE_EXIT_URL",
      "VITE_SUPPORT_EMAIL",
    ],
    optional: [
      "VITE_CREATOR_APP_URL",
      "VITE_PUBLIC_APP_ORIGIN",
      "VITE_MPESA_STK_ENABLED",
      "VITE_RELEASE_NOTES_URL",
      "VITE_APP_DOWNLOAD_URL",
      "VITE_GIFT_CREATOR_ID",
      "VITE_GIFT_AMOUNT_MAJOR",
      "VITE_FEATURE_REQUESTS_ENABLED",
    ],
  },
  {
    label: "creator-side/.env",
    path: "creator-side/.env",
    required: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    optional: ["VITE_CONSUMER_APP_URL", "VITE_PUBLIC_APP_ORIGIN", "VITE_CREATOR_BASE_PATH"],
  },
  {
    label: "landingpage/.env",
    path: "landingpage/.env",
    required: [],
    optional: [],
  },
];

const supabaseEnvCandidates = ["supabase/.env", "supabase/.env.local"];
const supabaseRequired = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_CARD_SETUP_AMOUNT_MAJOR",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_PASSKEY",
  "MPESA_SHORTCODE",
  "MPESA_CALLBACK_TOKEN",
  "PAYOUT_QUEUE_CRON_TOKEN",
  "OPERATOR_API_TOKEN",
];
const supabaseOptional = [
  "MPESA_CALLBACK_URL",
  "MPESA_ENV",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "PAYPAL_API_BASE",
  "PAYOUT_QUEUE_CRON_TOKEN",
  "OPERATOR_API_TOKEN",
];

const requiredMigrations = [
  "20260204000001_payments_and_content.sql",
  "20260217120000_mpesa_payouts.sql",
  "20260217133000_payout_retries_and_kyc.sql",
  "20260225140000_wallet_ppv.sql",
  "20260225141000_recommendations_v2.sql",
  "20260225170000_payout_multi_provider.sql",
  "20260315120000_creator_payout_verification_audit.sql",
  "20260315183000_creator_card_payout_support.sql",
  "20260323083000_payment_webhook_hardening.sql",
  "20260323100000_creator_payout_ops_hardening.sql",
  "20260626120000_post_engagement_realtime.sql",
  "20260627100000_creator_media_bucket_limits.sql",
];

const requiredFunctions = [
  "paystack-init",
  "paystack-webhook",
  "mpesa-stk-init",
  "mpesa-stk-callback",
  "request-creator-payout",
  "process-payout-queue",
  "review-creator-payout-account",
  "upsert-mpesa-payout-account",
  "upsert-bank-payout-account",
  "start-creator-card-payout-setup",
  "complete-creator-card-payout-setup",
];

const requiredUserLegalPages = [
  "acceptable-use-policy.html",
  "cookies.html",
  "privacy.html",
  "terms.html",
  "usc2257.html",
];

const requiredCreatorLegalPages = [
  "acceptable-use-policy.html",
  "cookies.html",
  "privacy.html",
  "terms.html",
  "usc2257.html",
];

function parseEnv(content) {
  const map = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    map.set(key, value);
  }
  return map;
}

function readProcessEnv(keys) {
  const map = new Map();
  keys.forEach((key) => {
    const value = process.env[key];
    if (value) {
      map.set(key, value);
    }
  });
  return map;
}

function mergeProcessEnv(map, keys) {
  const next = new Map(map);
  keys.forEach((key) => {
    const value = process.env[key];
    if (value) {
      next.set(key, value);
    }
  });
  return next;
}

function checkEnvFile(entry) {
  const fullPath = path.join(root, entry.path);
  const keys = [...entry.required, ...entry.optional];
  if (!fs.existsSync(fullPath)) {
    const envMap = readProcessEnv(keys);
    const missing = entry.required.filter((key) => !envMap.get(key));
    if (!missing.length) {
      return { status: "ok", missing: [], file: entry.path, source: "environment", values: envMap };
    }
    return entry.required.length
      ? { status: "missing", missing: entry.required, file: entry.path, source: "file", values: envMap }
      : { status: "ok", missing: [], file: entry.path, source: "not required", values: envMap };
  }
  const map = mergeProcessEnv(parseEnv(fs.readFileSync(fullPath, "utf8")), keys);
  const missing = entry.required.filter((key) => !map.get(key));
  return {
    status: missing.length ? "incomplete" : "ok",
    missing,
    file: entry.path,
    source: "file/environment",
    values: map,
  };
}

function checkMigrations() {
  const dir = path.join(root, "supabase", "migrations");
  if (!fs.existsSync(dir)) {
    return { status: "missing", missing: requiredMigrations, existing: [] };
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const missing = requiredMigrations.filter((name) => !files.includes(name));
  return { status: missing.length ? "incomplete" : "ok", missing, existing: files };
}

function checkFunctionDirs() {
  const dir = path.join(root, "supabase", "functions");
  if (!fs.existsSync(dir)) {
    return { status: "missing", missing: requiredFunctions };
  }
  const existing = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const missing = requiredFunctions.filter((name) => !existing.includes(name));
  return { status: missing.length ? "incomplete" : "ok", missing, existing };
}

function checkRequiredFiles(baseDir, files) {
  const fullDir = path.join(root, baseDir);
  if (!fs.existsSync(fullDir)) {
    return { status: "missing", missing: files };
  }
  const missing = files.filter((file) => !fs.existsSync(path.join(fullDir, file)));
  return { status: missing.length ? "incomplete" : "ok", missing };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printEnvResult(result) {
  if (result.status === "missing") {
    console.log(`- ${result.file}: MISSING`);
    if (result.missing.length) {
      console.log(`  required missing: ${result.missing.join(", ")}`);
    }
    return;
  }
  if (result.status === "incomplete") {
    console.log(`- ${result.file}: INCOMPLETE`);
    console.log(`  required missing: ${result.missing.join(", ")}`);
    return;
  }
  console.log(`- ${result.file}: OK${result.source ? ` (${result.source})` : ""}`);
}

function checkSupabaseEnv() {
  const keys = [...supabaseRequired, ...supabaseOptional];
  const existing = supabaseEnvCandidates.find((file) => fs.existsSync(path.join(root, file)));
  if (!existing) {
    const envMap = readProcessEnv(keys);
    const missing = supabaseRequired.filter((key) => !envMap.get(key));
    return missing.length
      ? { status: "missing", file: "supabase/.env or environment", missing, values: envMap }
      : { status: "ok", file: "environment", missing: [], values: envMap };
  }
  const map = mergeProcessEnv(parseEnv(fs.readFileSync(path.join(root, existing), "utf8")), keys);
  const missing = supabaseRequired.filter((key) => !map.get(key));
  return { status: missing.length ? "incomplete" : "ok", file: existing, missing, values: map };
}

function main() {
  let hasFailure = false;
  console.log("Health checklist (local)");

  printSection("Frontend envs");
  envChecks.forEach((entry) => {
    const result = checkEnvFile(entry);
    printEnvResult(result);
    if (result.status !== "ok") hasFailure = true;
  });

  printSection("Supabase env");
  const supa = checkSupabaseEnv();
  if (supa.status === "missing") {
    console.log(`- ${supa.file}: MISSING`);
    console.log(`  required missing: ${supa.missing.join(", ")}`);
    hasFailure = true;
  } else if (supa.status === "incomplete") {
    console.log(`- ${supa.file}: INCOMPLETE`);
    console.log(`  required missing: ${supa.missing.join(", ")}`);
    hasFailure = true;
  } else {
    console.log(`- ${supa.file}: OK`);
  }

  printSection("Supabase optional env hints");
  if (supa.values) {
    const missingOptional = supabaseOptional.filter((key) => !supa.values.get(key));
    if (missingOptional.length) {
      console.log(`- optional missing: ${missingOptional.join(", ")}`);
    } else {
      console.log("- optional: all set");
    }
  } else {
    console.log("- optional: not checked (missing supabase env file)");
  }

  printSection("Migrations");
  const migrationCheck = checkMigrations();
  if (migrationCheck.status === "missing") {
    console.log("- supabase/migrations: MISSING");
    console.log(`  required missing: ${migrationCheck.missing.join(", ")}`);
    hasFailure = true;
  } else if (migrationCheck.status === "incomplete") {
    console.log("- supabase/migrations: INCOMPLETE");
    console.log(`  required missing: ${migrationCheck.missing.join(", ")}`);
    hasFailure = true;
  } else {
    console.log("- supabase/migrations: OK");
  }

  printSection("Supabase functions");
  const functionCheck = checkFunctionDirs();
  if (functionCheck.status === "missing") {
    console.log("- supabase/functions: MISSING");
    console.log(`  required missing: ${functionCheck.missing.join(", ")}`);
    hasFailure = true;
  } else if (functionCheck.status === "incomplete") {
    console.log("- supabase/functions: INCOMPLETE");
    console.log(`  required missing: ${functionCheck.missing.join(", ")}`);
    hasFailure = true;
  } else {
    console.log("- supabase/functions: OK");
  }

  printSection("Legal assets");
  const userLegalCheck = checkRequiredFiles("user-side/public/pages", requiredUserLegalPages);
  const creatorLegalCheck = checkRequiredFiles("creator-side/public/pages", requiredCreatorLegalPages);
  if (userLegalCheck.status !== "ok") {
    console.log("- user-side/public/pages: INCOMPLETE");
    console.log(`  required missing: ${userLegalCheck.missing.join(", ")}`);
    hasFailure = true;
  } else {
    console.log("- user-side/public/pages: OK");
  }
  if (creatorLegalCheck.status !== "ok") {
    console.log("- creator-side/public/pages: INCOMPLETE");
    console.log(`  required missing: ${creatorLegalCheck.missing.join(", ")}`);
    hasFailure = true;
  } else {
    console.log("- creator-side/public/pages: OK");
  }

  printSection("Next steps");
  console.log("- Run `supabase db push` after verifying envs.");
  console.log("- Deploy updated Supabase functions.");

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main();
