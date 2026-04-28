export async function sendResendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("PAYOUT_NOTIFICATIONS_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn("Email delivery skipped: RESEND_API_KEY or PAYOUT_NOTIFICATIONS_FROM_EMAIL missing");
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn("Email delivery failed", response.status, body);
    return { skipped: false, ok: false, status: response.status, body };
  }

  return { skipped: false, ok: true };
}

export function buildPayoutAdminRecipients() {
  const raw = Deno.env.get("PAYOUT_ADMIN_EMAILS") ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
