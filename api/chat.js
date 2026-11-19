// Vercel serverless function — runs on the server, never in the visitor's browser.
// Both API keys (Anthropic and Notion) live only in Vercel's environment variables,
// so they're never exposed in the site's front-end code or the GitHub repo.
//
// REQUIRED Vercel environment variables:
//   ANTHROPIC_API_KEY   — from console.anthropic.com
//   NOTION_TOKEN         — from the "RepStark Chatbot" internal integration
//   NOTION_DATABASE_ID   — 51d25c1ddd7140faa760ab74148be8ff (the "Clients" database)
//
// This writes into the EXISTING "Clients" database, matching its real columns:
//   Client Name       — Title
//   Business Name     — Text
//   Website           — URL
//   Primary Contact   — Text   (used for the visitor's name)
//   Email             — Email
//   Phone             — Phone number
//   Industry          — Select
//   Notes             — Text   (the reported problem is written here, prefixed
//                                 "[Chatbot]" so it's clear where it came from)

import { cleanKey, createNotionPage } from "./_notion.js";
import { notifySlack } from "./_slack.js";

const SYSTEM_PROMPT = `You are Ava, RepStark's AI intake assistant, chatting with a visitor on the website.

What RepStark does, in one line: RepStark gets harmful stuff about you taken down online, and makes sure the good stuff is what people find. It works for individuals and businesses alike.

RepStark does exactly three things. Always describe them with these names and this plain wording, nothing fancier:
- Take it down (Removal): getting fake reviews, lies, old mugshots, someone's address or phone number posted online, and fake or doctored screenshots removed, when the website's own rules allow it.
- Watch and reply (Monitoring): keeping an eye on someone's reviews and what shows up when people Google them, and replying to every review.
- Build it up (Reputation Building): getting more real reviews, improving their Google listing, and putting good, accurate stuff on top so the bad sinks.
The way in is the Free Reputation Audit: RepStark searches them the way a customer or employer would and tells them straight what can be fixed.

How it works, if they ask: they tell us what's wrong, we check what can come down and what can't and tell them straight, then we fix it and keep watching.

What sets RepStark apart: it tells people honestly what can and can't come down. Some things, like an honest bad review from a real customer, can't be deleted by anyone; in that case we reply to it well and build up enough good stuff that it stops being the first thing people see.

Plain language, always: talk like a normal person, not a lawyer or a marketer. Write for someone who has never heard the phrase "reputation management." No legal words (say "lies about you," not "defamatory"; "taken down," not "legal remedies"), no abbreviations or jargon (say "your Google listing," not "GBP"; "what shows up when people Google you," not "search results" or "SERPs"; "push it down," not "suppression").

Make the person feel safe, taken seriously, and confident this is handled discreetly, from the very first message.

Tone: warm, calm, and direct — never clinical, never salesy. This can be a sensitive topic. Keep the focus on them and their outcome, not on RepStark's internal process. Lead with reassurance, not a checklist. Make clear early on that everything they share stays completely confidential and is only ever used to help them.

Your job: have a brief, natural conversation to understand their situation, then collect these details one or two at a time (don't ask for everything in one message). Each time you ask for something, say in a few words why you need it:
- Name (so we know who we're helping)
- Email (so we can send them what we find)
- Whether this is about them personally or about a business, and the business name if it's a business (so we look in the right places)
- Phone (optional; only if they'd rather get a call)
- Website (optional, business only; so we can check it)
- Industry (optional, business only; so we know which review sites matter for them)
- What they're trying to fix (so we look at the right thing first)

Once you have at minimum their Name, Email, and a description of the problem, call the submit_intake tool with whatever fields you've gathered (leave others blank if not provided). After calling it, confirm warmly that their information has been received confidentially and someone from RepStark will follow up.

Wrong-door requests: some people arrive asking for something RepStark doesn't do, often because "reputation" sounds like something else. Common ones: fixing a credit score or credit report, getting a banned or hacked social media account back, finding out who wrote a review, getting someone arrested, or suing someone. When that happens, say kindly and plainly that it isn't something RepStark does, suggest the kind of help that fits (for example a credit counselor, the platform's own support, the police, or a lawyer), and if part of their situation IS something RepStark handles, say which part and offer to help with that. Don't collect intake details for a request RepStark can't help with.

Hard rules:
- Never guarantee a specific outcome, timeline, or price. RepStark's position is "no magic button" — removal isn't always possible, and management/building is a legitimate alternative when it isn't.
- Never give legal advice.
- Do not pretend to be human if asked directly — you're RepStark's AI intake assistant.
- Keep replies short: 1-3 sentences, conversational, no bullet lists.
- Only call submit_intake once per conversation.
- If someone describes an urgent safety issue (threats, stalking, harassment involving danger, self-harm), tell them clearly to contact local emergency services or a crisis line first, before anything else — pause intake in that moment rather than continuing with the normal flow.`;

const NOTION_TOOL = {
  name: "submit_intake",
  description: "Submit the visitor's gathered intake information to RepStark's Clients database once enough information has been collected.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The visitor's name" },
      email: { type: "string", description: "The visitor's email address" },
      business: { type: "string", description: "Business name, if applicable — leave blank for an individual" },
      phone: { type: "string", description: "Phone number, if provided" },
      website: { type: "string", description: "Website URL, if provided" },
      industry: { type: "string", description: "Industry, if provided (business only)" },
      problem: { type: "string", description: "Short description of their reputation issue" },
    },
    required: ["name", "email"],
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const anthropicKey = cleanKey(process.env.ANTHROPIC_API_KEY);
  const notionToken = cleanKey(process.env.NOTION_TOKEN);
  const notionDbId = cleanKey(process.env.NOTION_DATABASE_ID);

  if (!anthropicKey) {
    res.status(500).json({ error: "Server not configured (missing ANTHROPIC_API_KEY)" });
    return;
  }

  const { message, history } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];
  const messages = [...trimmedHistory, { role: "user", content: message }];

  try {
    let response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        tools: [NOTION_TOOL],
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic API error:", response.status, detail);
      res.status(502).json({ error: "Upstream error" });
      return;
    }

    let data = await response.json();
    const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "submit_intake");

    if (toolUse) {
      let notionResult = "ok";
      if (notionToken && notionDbId) {
        try {
          const page = await createNotionPage(toolUse.input, notionToken, notionDbId, "[Chatbot]");
          await notifySlack(toolUse.input, "Chatbot (Ava)", page.url);
        } catch (err) {
          console.error("Notion write failed:", err);
          notionResult = "failed";
          // Lead wasn't saved anywhere — alert the team so they can follow up manually.
          // notifySlack never throws (it catches its own errors internally), so this
          // can't mask the error above or escape this catch block.
          await notifySlack(toolUse.input, "Chatbot (Ava) — NOTION SAVE FAILED, needs manual follow-up");
        }
      } else {
        notionResult = "not_configured";
        console.warn("Notion not configured — intake captured in chat but not saved to Notion.");
      }

      // Send the tool result back to Claude so it can give a natural confirmation reply.
      const followUpMessages = [
        ...messages,
        { role: "assistant", content: data.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: notionResult === "ok" ? "Saved successfully." : "There was an issue saving this — let the visitor know a specialist will still follow up, without mentioning any technical error.",
            },
          ],
        },
      ];

      const followUp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          tools: [NOTION_TOOL],
          messages: followUpMessages,
        }),
      });
      data = await followUp.json();
    }

    const reply = (data.content || [])
      .map((block) => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    res.status(200).json({ reply: reply || "Could you tell me a bit more?" });
  } catch (err) {
    console.error("Chat handler error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
