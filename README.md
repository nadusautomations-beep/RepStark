# RepStark

Marketing website for **RepStark**, an online reputation management service for local businesses — removing what can legitimately be removed, managing what can't, and building a stronger online presence through reviews, monitoring, and response management.

**Live checklist:** the site is fully built but intentionally unpublished until real contact details and a domain are added (see the notice at the top of `index.html`).

## Stack

- **Frontend** — static HTML/CSS/JS (`index.html`, `privacy.html`, `terms.html`), no build step or framework.
- **Lead capture — all roads lead to one Notion database** (the "Clients" database), via two Vercel serverless functions that share `api/_notion.js`:
  - **`api/chat.js`** — powers an on-site chat assistant ("Ava") that uses the **Anthropic API** (Claude) to hold a short, natural intake conversation, then writes the lead to Notion (tagged `[Chatbot]` in Notes).
  - **`api/submit-audit.js`** — receives the free-audit form and writes the same lead shape to Notion (tagged `[Audit Form]` in Notes).
  - API keys are read from Vercel environment variables and never exposed to the browser or committed to the repo.
- **SEO** — structured data (`ProfessionalService`, `FAQPage`), `sitemap.xml`, and `robots.txt`.

## Project structure

```
index.html          Landing page (hero, services, process, pricing/CTA, FAQ, audit form)
privacy.html         Privacy policy
terms.html           Terms of service
api/chat.js          Vercel serverless function — Ava chat → Notion
api/submit-audit.js  Vercel serverless function — audit form → Notion
api/_notion.js        Shared Notion "Clients" database writer (not its own route)
assets/              Logo and brand marks
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

### Required environment variables (for `api/chat.js` and `api/submit-audit.js`)

| Variable             | Purpose                                   |
|-----------------------|--------------------------------------------|
| `ANTHROPIC_API_KEY`   | Powers the chat assistant (`api/chat.js` only) |
| `NOTION_TOKEN`        | Writes captured leads to Notion            |
| `NOTION_DATABASE_ID`  | Target Notion database for intake records  |

## Deployment

Designed to deploy as a static site with a serverless API route on **Vercel** — drop the repo in, set the environment variables above, and it's live.
