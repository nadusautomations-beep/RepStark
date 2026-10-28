# RepStark

Marketing website for **RepStark**, an online reputation management service for local businesses — removing what can legitimately be removed, managing what can't, and building a stronger online presence through reviews, monitoring, and response management.

**Live checklist:** the site is fully built but intentionally unpublished until real contact details and a domain are added (see the notice at the top of `index.html`).

## Stack

- **Frontend** — static HTML/CSS/JS (`index.html`, `privacy.html`, `terms.html`), no build step or framework.
- **Lead capture — all roads lead to one Notion database** (the "Clients" database), via two Vercel serverless functions that share `api/_notion.js`:
  - **`api/chat.js`** — powers an on-site chat assistant ("Ava") that uses the **Anthropic API** (Claude) to hold a short, natural intake conversation, then writes the lead to Notion (tagged `[Chatbot]` in Notes).
  - **`api/submit-audit.js`** — receives the free-audit form and writes the same lead shape to Notion (tagged `[Audit Form]` in Notes).
  - Both also post a real-time notification to Slack via `api/_slack.js`, if `SLACK_WEBHOOK_URL` is configured (optional — leads still save to Notion either way).
  - API keys are read from Vercel environment variables and never exposed to the browser or committed to the repo.
- **Ad-concept pipeline** — **`api/generate-ads.js`**, run by **Vercel Cron** (`vercel.json`) Mon/Wed/Fri. Picks a random Slot/Track/Platform/Structure/Voice combination, has Claude write the concept (hook, caption, first comment, visual notes, full script, production notes), and writes it into the Notion **Content Calendar** database with Status = "Needs Review" — so it's waiting in Maliha's Review Queue without anyone generating it by hand. Independent of Muse.
- **SEO** — structured data (`ProfessionalService`, `FAQPage`), `sitemap.xml`, and `robots.txt`.

## Project structure

```
index.html          Landing page (hero, services, process, pricing/CTA, FAQ, audit form)
privacy.html         Privacy policy
terms.html           Terms of service
api/chat.js          Vercel serverless function — Ava chat → Notion + Slack
api/submit-audit.js  Vercel serverless function — audit form → Notion + Slack
api/generate-ads.js  Vercel Cron job — generates one ad concept into the Notion Content Calendar (Mon/Wed/Fri)
api/_notion.js        Shared Notion "Clients" database writer (not its own route)
api/_slack.js          Shared Slack lead notifier (not its own route)
assets/              Logo and brand marks
vercel.json           Vercel Cron schedule for api/generate-ads.js
sitemap.xml
robots.txt
```

## Configuration

Visible contact details (phone, email) are controlled from a single config block at the top of `index.html`:

```js
window.REPSTARK_CONFIG = {
  phoneDisplay: "",
  phoneHref: "",
  email: ""
};
```

An empty field simply hides the corresponding element instead of rendering placeholder or fake info. The audit form itself always posts to `/api/submit-audit` — no config needed there.

### Environment variables (for `api/chat.js` and `api/submit-audit.js`)

| Variable             | Required? | Purpose                                   |
|-----------------------|-----------|--------------------------------------------|
| `ANTHROPIC_API_KEY`   | Yes (chat only) | Powers the chat assistant (`api/chat.js`) |
| `NOTION_TOKEN`        | Yes       | Writes captured leads to Notion            |
| `NOTION_DATABASE_ID`  | Yes       | Target Notion database for intake records  |
| `SLACK_WEBHOOK_URL`   | No        | Posts a real-time lead notification to Slack. Create at [api.slack.com/apps](https://api.slack.com/apps) → your app → **Incoming Webhooks** → add a webhook for the target channel (e.g. `#leads`). |

### Environment variables (for `api/generate-ads.js`)

| Variable                       | Required? | Purpose                                                      |
|---------------------------------|-----------|---------------------------------------------------------------|
| `ANTHROPIC_API_KEY`             | Yes       | Same key as the chat assistant — writes the ad concept        |
| `NOTION_TOKEN`                  | Yes       | Same integration token as above — **must also be shared with the Content Calendar database** in Notion (Content Calendar → `•••` → Connections → add the same integration used for the Clients database) |
| `CONTENT_CALENDAR_DATABASE_ID`  | Yes       | The Content Calendar database ID (REPSTARK HQ → Marketing → Content Calendar) |
| `CRON_SECRET`                   | No        | If set, only Vercel's own Cron trigger (or a request carrying `Authorization: Bearer <value>`) can run this route. Recommended once this is live, to stop anyone else from spending your Anthropic credits by hitting the URL directly. |

Runs automatically via Vercel Cron Mon/Wed/Fri (see `vercel.json`) — no manual trigger needed. Vercel Cron schedules run in UTC; adjust the `schedule` field in `vercel.json` if you want a different day/time.

## Deployment

Designed to deploy as a static site with a serverless API route on **Vercel** — drop the repo in, set the environment variables above, and it's live.
