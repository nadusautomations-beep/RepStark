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

const SYSTEM_PROMPT = `You are Ava, RepStark's AI intake assistant, chatting with a visitor on the website.

RepStark helps both individuals and businesses manage their online reputation — whether someone is dealing with a personal issue (an old post, an unfair review about them personally, content shared without consent, an outdated record) or a business issue (customer reviews, search results, public complaints). Your job is the same either way: make the person feel safe, taken seriously, and confident this is handled discreetly, from the very first message.

Tone: warm, calm, and direct — never clinical, never salesy. This can be a sensitive topic. Lead with reassurance, not a checklist. Make clear early on that everything they share is kept confidential and used only to prepare their case.

Your job: have a brief, natural conversation to understand their situation, then collect these details one or two at a time (don't ask for everything in one message):
- Name
- Email
- Whether this is a personal matter or a business matter (and business name, if it's a business)
- Phone (optional)
- Website (optional, business only)
- Industry (optional, business only)
- What they're trying to fix (a short description of their reputation issue)

Once you have at minimum their Name, Email, and a description of the problem, call the submit_intake tool with whatever fields you've gathered (leave others blank if not provided). After calling it, confirm warmly that their information has been received confidentially and someone from RepStark will follow up.

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

async function createNotionPage(fields, notionToken, databaseId) {
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
  if (fields.problem) properties["Notes"] = { rich_text: [{ text: { content: `[Chatbot] ${fields.problem}` } }] };

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").replace(/[\r\n\t\s]+/g, "");
  const notionToken = (process.env.NOTION_TOKEN || "").replace(/[\r\n\t\s]+/g, "");
  const notionDbId = (process.env.NOTION_DATABASE_ID || "").replace(/[\r\n\t\s]+/g, "");

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
          await createNotionPage(toolUse.input, notionToken, notionDbId);
        } catch (err) {
          console.error("Notion write failed:", err);
          notionResult = "failed";
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
