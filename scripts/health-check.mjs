import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const envChecks = [
  {
    label: "user-side/.env",
    path: "user-side/.env",
    required: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    optional: [
      "VITE_CREATOR_APP_URL",
      "VITE_EXIT_URL",
      "VITE_SUPPORT_EMAIL",
      "VITE_MPESA_STK_ENABLED",
    ],
  },
  {
    label: "creator-side/.env",
    path: "creator-side/.env",
    required: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    optional: ["VITE_CONSUMER_APP_URL", "VITE_CREATOR_BASE_PATH"],
  },
  {
    label: "landingpage/.env",
    path: "landingpage/.env",
    required: [],
    optional: [],
  },
];

const supabaseEnvCandidates = ["supabase/.env", "supabase/.env.local", "supabase/.env.example"];
const supabaseRequired = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const supabaseOptional = [
  "PAYSTACK_SECRET_KEY",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_PASSKEY",
  "MPESA_SHORTCODE",
  "MPESA_CALLBACK_URL",
  "MPESA_ENV",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "PAYPAL_API_BASE",
  "PAYOUT_QUEUE_CRON_TOKEN",
];

const requiredMigrations = [
  "20260204T000001_payments_and_content.sql",
  "20260217T120000_mpesa_payouts.sql",
  "20260217T133000_payout_retries_and_kyc.sql",
  "20260225T140000_wallet_ppv.sql",
  "20260225T141000_recommendations_v2.sql",
  "20260225T170000_payout_multi_provider.sql",
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

function checkEnvFile(entry) {
  const fullPath = path.join(root, entry.path);
  if (!fs.existsSync(fullPath)) {
    return { status: "missing", missing: entry.required, file: entry.path, values: new Map() };
  }
  const map = parseEnv(fs.readFileSync(fullPath, "utf8"));
  const missing = entry.required.filter((key) => !map.get(key));
  return { status: missing.length ? "incomplete" : "ok", missing, file: entry.path, values: map };
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
  console.log(`- ${result.file}: OK`);
}

function checkSupabaseEnv() {
  const existing = supabaseEnvCandidates.find((file) => fs.existsSync(path.join(root, file)));
  if (!existing) {
    return { status: "missing", file: "supabase/.env", missing: supabaseRequired };
  }
  const map = parseEnv(fs.readFileSync(path.join(root, existing), "utf8"));
  const missing = supabaseRequired.filter((key) => !map.get(key));
  return { status: missing.length ? "incomplete" : "ok", file: existing, missing, values: map };
}

function main() {
  console.log("Health checklist (local)");

  printSection("Frontend envs");
  envChecks.forEach((entry) => printEnvResult(checkEnvFile(entry)));

  printSection("Supabase env");
  const supa = checkSupabaseEnv();
  if (supa.status === "missing") {
    console.log(`- ${supa.file}: MISSING`);
    console.log(`  required missing: ${supa.missing.join(", ")}`);
  } else if (supa.status === "incomplete") {
    console.log(`- ${supa.file}: INCOMPLETE`);
    console.log(`  required missing: ${supa.missing.join(", ")}`);
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
  } else if (migrationCheck.status === "incomplete") {
    console.log("- supabase/migrations: INCOMPLETE");
    console.log(`  required missing: ${migrationCheck.missing.join(", ")}`);
  } else {
    console.log("- supabase/migrations: OK");
  }

  printSection("Next steps");
  console.log("- Run `supabase db push` after verifying envs.");
  console.log("- Deploy updated Supabase functions.");
}

main();
