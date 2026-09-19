// Vercel serverless function — receives the free-audit form and writes it
// into the same Notion "Clients" database Ava (the chat assistant) uses, so
// every lead lands in one place. Entries are prefixed "[Audit Form]" in
// Notes so it's clear which channel they came in from.
//
// REQUIRED Vercel environment variables:
//   NOTION_TOKEN         — from the "RepStark Chatbot" internal integration
//   NOTION_DATABASE_ID   — the "Clients" database

import { cleanKey, createNotionPage } from "./_notion.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const notionToken = cleanKey(process.env.NOTION_TOKEN);
  const notionDbId = cleanKey(process.env.NOTION_DATABASE_ID);

  if (!notionToken || !notionDbId) {
    res.status(500).json({ error: "Server not configured (missing NOTION_TOKEN/NOTION_DATABASE_ID)" });
    return;
  }

  const body = req.body || {};

  // Honeypot field — bots fill it in, real visitors leave it blank.
  if (body._gotcha) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = (body["Name"] || "").trim();
  const email = (body["Email"] || "").trim();
  if (!name || !email) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const problem = [
    body["Biggest Challenge"] && body["Biggest Challenge"].trim(),
    body["Problem or Search URL"] && `URL: ${body["Problem or Search URL"].trim()}`,
  ].filter(Boolean).join(" — ");

  const fields = {
    name,
    email,
    business: (body["Business Name"] || "").trim(),
    phone: (body["Phone"] || "").trim(),
    website: (body["Website"] || "").trim(),
    industry: (body["Industry"] || "").trim(),
    problem,
  };

  try {
    await createNotionPage(fields, notionToken, notionDbId, "[Audit Form]");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Audit form → Notion write failed:", err);
    res.status(502).json({ error: "Could not save submission" });
  }
}
