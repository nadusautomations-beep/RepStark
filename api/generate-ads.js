// Vercel Cron job — runs Mon/Wed/Fri (see vercel.json) and drops one new ad
// concept into the Notion "Content Calendar" database with Status =
// "Needs Review", so Maliha always has something waiting in her Review Queue
// without anyone generating it by hand.
//
// REQUIRED Vercel environment variables (in addition to the ones api/chat.js
// already uses):
//   CONTENT_CALENDAR_DATABASE_ID — the Content Calendar database ID
//
// OPTIONAL:
//   CRON_SECRET — if set, this route only runs when called with
//                  "Authorization: Bearer <CRON_SECRET>" (Vercel sends this
//                  automatically for scheduled Cron Jobs once the env var
//                  exists — see vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
//                  Without it, the route still works, it's just unauthenticated.

import { cleanKey } from "./_notion.js";

const SLOTS = ["Story–Individual", "Story–Business", "Education", "Case Card", "Hook Video", "Review Explainer", "Prestige"];
const TRACKS = ["Business", "Individual"];
const PLATFORMS = ["Google", "Instagram", "TikTok", "X", "Reddit", "YouTube", "Facebook", "LinkedIn", "Multi"];
const STRUCTURES = ["Win-first twist", "Secondhand discovery", "Other-person POV", "Mid-scene open", "Object-led", "Compressed day", "Search-as-scene", "Direct warning", "Myth vs reality", "Count/list", "Google question", "Quiet prestige"];
const VOICES = ["Aria", "Helio", "Melody", "None"];

const SYSTEM_PROMPT = `You write one social/ad content concept at a time for RepStark, an online reputation management service for both individuals and businesses. You are generating a concept for a human marketer (Maliha) to review before anything posts — never assume it will go out unedited.

Hard rules (violating any of these means the concept gets rejected):
- Never guarantee a specific outcome, timeline, or price. RepStark's position is "no magic button" — removal isn't always possible; management/building is a legitimate alternative when it isn't.
- No legal framing or legal advice.
- No hype or fear-mongering appeals.
- The only call to action is the free reputation audit at repstark.com.
- The caption itself must be completely hashtag-free. Hashtags go only in "first_comment".
  - Individual track hashtags: #ReputationManagement #OnlineReputation
  - Business track hashtags: #ReputationManagement #LocalBusiness #SmallBusiness
- If the concept references a case/example, it must be a plausible, clearly fictional illustrative scenario — never a real person or business — and the script must literally say "Illustrative example" somewhere in the voiceover/text.
- Never blend the Business and Individual tracks in one concept — pick exactly one "track" and stay inside it.
- If the slot implies video (Hook Video, Case Card, Story–Individual, Story–Business), visual_notes must specify full-frame video, no crop.
- Tone: direct and honest, never salesy or clinical. No emojis in the caption.

You will be told which Slot, Track, Platform, Structure, and Voice to use — do not change them. Write hook, caption, first_comment, visual_notes, script, production_notes, and a one-line guideline_check confirming you followed the hard rules above.`;

const AD_TOOL = {
  name: "create_ad_concept",
  description: "Submit one finished ad/content concept for the Content Calendar.",
  input_schema: {
    type: "object",
    properties: {
      post_title: { type: "string", description: "Short internal label, e.g. 'Hook Video: Business — search result anxiety'" },
      hook: { type: "string", description: "The first line / first frame, verbatim" },
      caption: { type: "string", description: "The final caption, completely hashtag-free" },
      first_comment: { type: "string", description: "Hashtags for the first comment only" },
      visual_notes: { type: "string", description: "Setting, lead character, key beats, framing" },
      script: { type: "string", description: "The full script or slide/card text" },
      production_notes: { type: "string", description: "Notes for whoever produces this (length, shots, pacing, on-screen text)" },
      guideline_check: { type: "string", description: "One line confirming no guarantees, no prices, no legal framing, no hype/fear, CTA is the free audit only, hashtags only in first comment, and (if applicable) case content is a labeled illustrative example" },
    },
    required: ["post_title", "hook", "caption", "first_comment", "visual_notes", "script", "production_notes", "guideline_check"],
  },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function callClaude(anthropicKey, userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools: [AD_TOOL],
      tool_choice: { type: "tool", name: "create_ad_concept" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${detail}`);
  }
  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "create_ad_concept");
  if (!toolUse) throw new Error("Claude did not return a concept");
  return toolUse.input;
}

async function createCalendarPage(concept, picks, notionToken, databaseId) {
  const heading = (text) => ({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: text } }] } });
  const paragraph = (text) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text || "" } }] } });

  const body = JSON.stringify({
    parent: { database_id: databaseId },
    properties: {
      "Post": { title: [{ text: { content: concept.post_title } }] },
      "Date": { date: { start: todayISODate() } },
      "Slot": { select: { name: picks.slot } },
      "Track": { select: { name: picks.track } },
      "Platform": { select: { name: picks.platform } },
      "Structure": { select: { name: picks.structure } },
      "Voice": { select: { name: picks.voice } },
      "Hook": { rich_text: [{ text: { content: concept.hook } }] },
      "Caption": { rich_text: [{ text: { content: concept.caption } }] },
      "First comment": { rich_text: [{ text: { content: concept.first_comment } }] },
      "Visual notes": { rich_text: [{ text: { content: concept.visual_notes } }] },
      "Source": { select: { name: "Fresh" } },
      "Status": { status: { name: "Needs Review" } },
    },
    children: [
      heading("Script"),
      paragraph(concept.script),
      heading("Production notes"),
      paragraph(concept.production_notes),
      heading("Guideline check"),
      paragraph(concept.guideline_check),
    ],
  });

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Notion API error (${res.status}): ${detail}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  const cronSecret = cleanKey(process.env.CRON_SECRET);
  if (cronSecret) {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const anthropicKey = cleanKey(process.env.ANTHROPIC_API_KEY);
  const notionToken = cleanKey(process.env.NOTION_TOKEN);
  const databaseId = cleanKey(process.env.CONTENT_CALENDAR_DATABASE_ID);

  if (!anthropicKey || !notionToken || !databaseId) {
    res.status(500).json({ error: "Server not configured (missing ANTHROPIC_API_KEY, NOTION_TOKEN, or CONTENT_CALENDAR_DATABASE_ID)" });
    return;
  }

  const picks = {
    track: pick(TRACKS),
    slot: pick(SLOTS),
    platform: pick(PLATFORMS),
    structure: pick(STRUCTURES),
    voice: pick(VOICES),
  };

  const userPrompt = `Generate one ad concept with these fixed choices:
- Slot: ${picks.slot}
- Track: ${picks.track}
- Platform: ${picks.platform}
- Structure: ${picks.structure}
- Voice: ${picks.voice}

Call create_ad_concept with the finished concept.`;

  try {
    const concept = await callClaude(anthropicKey, userPrompt);
    const page = await createCalendarPage(concept, picks, notionToken, databaseId);
    res.status(200).json({ ok: true, page: page.url, picks });
  } catch (err) {
    console.error("generate-ads failed:", err);
    res.status(500).json({ error: "Generation failed", detail: String(err.message || err) });
  }
}
