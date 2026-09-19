// Shared Slack notifier — posts a short message to the #leads channel
// whenever api/chat.js or api/submit-audit.js captures a new lead.
//
// REQUIRED Vercel environment variable:
//   SLACK_WEBHOOK_URL — an Incoming Webhook URL for the target channel,
//   created at api.slack.com/apps ("Incoming Webhooks" feature). Optional:
//   if unset, this is a no-op — leads still get saved to Notion either way.
//
// Files prefixed with "_" are not treated as their own routes by Vercel.

export async function notifySlack(fields, source, notionUrl) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const lines = [
    `*New lead — ${source}*`,
    `*Name:* ${fields.name || "—"}`,
    fields.business && `*Business:* ${fields.business}`,
    `*Email:* ${fields.email || "—"}`,
    fields.phone && `*Phone:* ${fields.phone}`,
    fields.industry && `*Industry:* ${fields.industry}`,
    fields.problem && `*Problem:* ${fields.problem}`,
    notionUrl && `<${notionUrl}|View in Notion>`,
  ].filter(Boolean);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
  } catch (err) {
    // Slack going down should never break lead capture — Notion already has it.
    console.error("Slack notification failed:", err);
  }
}
