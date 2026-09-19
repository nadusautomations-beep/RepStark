// Shared Notion "Clients" database writer.
// Used by both api/chat.js (Ava, the chat assistant) and api/submit-audit.js
// (the free-audit form) so every lead lands in the same database, tagged by
// source in the Notes field.
//
// Files prefixed with "_" are not treated as their own routes by Vercel.

// Strip anything outside printable ASCII — what an HTTP header/env var is
// allowed to contain — so a stray invisible/smart-quote character copied
// into a Vercel env var doesn't crash the request with a ByteString error.
export function cleanKey(s) {
  return (s || "").replace(/[^\x21-\x7E]/g, "");
}

export async function createNotionPage(fields, notionToken, databaseId, notePrefix) {
  // "Client Name" is the title column. Use the business name if given, otherwise the person's name.
  const titleText = fields.business || fields.name || "Unknown";

  const properties = {
    "Client Name": { title: [{ text: { content: titleText } }] },
    "Primary Contact": { rich_text: [{ text: { content: fields.name || "" } }] },
  };
  if (fields.email) properties["Email"] = { email: fields.email };
  if (fields.phone) properties["Phone"] = { phone_number: fields.phone };
  if (fields.business) properties["Business Name"] = { rich_text: [{ text: { content: fields.business } }] };
  if (fields.website) properties["Website"] = { url: fields.website };
  if (fields.industry) properties["Industry"] = { select: { name: fields.industry } };
  if (fields.problem) properties["Notes"] = { rich_text: [{ text: { content: `${notePrefix} ${fields.problem}` } }] };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Notion API error (${res.status}): ${detail}`);
  }
  return res.json();
}
