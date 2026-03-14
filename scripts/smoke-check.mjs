const baseArg = process.argv[2];

if (!baseArg) {
  console.error("Usage: node scripts/smoke-check.mjs <base-url>");
  process.exit(1);
}

const base = baseArg.replace(/\/+$/, "");

const checks = [];

const pushCheck = (ok, message) => {
  checks.push({ ok, message });
  const prefix = ok ? "[ok]" : "[fail]";
  console.log(`${prefix} ${message}`);
};

const assertStatus = async (pathname, expectedStatus, init = {}) => {
  const res = await fetch(`${base}${pathname}`, init);
  pushCheck(
    res.status === expectedStatus,
    `${pathname} status ${res.status} (expected ${expectedStatus})`
  );
  return res;
};

const assertHtml200 = async (pathname) => {
  const res = await fetch(`${base}${pathname}`);
  const contentType = res.headers.get("content-type") ?? "";
  pushCheck(res.status === 200, `${pathname} status ${res.status} (expected 200)`);
  pushCheck(
    contentType.includes("text/html"),
    `${pathname} content-type ${contentType || "missing"} includes text/html`
  );
  return res;
};

const assertHeaderIncludes = (res, header, expectedPart, pathname) => {
  const value = res.headers.get(header) ?? "";
  pushCheck(
    value.includes(expectedPart),
    `${pathname} header ${header} includes "${expectedPart}"`
  );
};

async function main() {
  const rootRes = await assertStatus("/", 308, { redirect: "manual" });
  const location = rootRes.headers.get("location") ?? "";
  pushCheck(location === "/app/", `/ redirect location is "${location}" (expected "/app/")`);

  const appRes = await assertHtml200("/app/");
  const userRes = await assertHtml200("/user/");
  const creatorRes = await assertHtml200("/creator/");

  await assertHtml200("/app/deep-link-check");
  await assertHtml200("/user/deep-link-check");
  await assertHtml200("/creator/deep-link-check");
  await assertHtml200("/creator/my/chats");
  await assertHtml200("/creator/my/settings");
  await assertHtml200("/creator/my/payments/add_card");

  assertHeaderIncludes(appRes, "strict-transport-security", "max-age=63072000", "/app/");
  assertHeaderIncludes(appRes, "content-security-policy", "connect-src 'self'", "/app/");
  assertHeaderIncludes(userRes, "content-security-policy", "https://*.supabase.co", "/user/");
  assertHeaderIncludes(creatorRes, "content-security-policy", "https://*.supabase.co", "/creator/");

  const failed = checks.filter((check) => !check.ok).length;
  if (failed > 0) {
    console.error(`[smoke-check] Failed checks: ${failed}/${checks.length}`);
    process.exit(1);
  }

  console.log(`[smoke-check] All checks passed: ${checks.length}`);
}

main().catch((error) => {
  console.error("[smoke-check] Unexpected error:", error);
  process.exit(1);
});
