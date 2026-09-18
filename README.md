# RepStark

Marketing website for **RepStark**, an online reputation management service for local businesses — removing what can legitimately be removed, managing what can't, and building a stronger online presence through reviews, monitoring, and response management.

**Live checklist:** the site is fully built but intentionally unpublished until real contact details and a domain are added (see the notice at the top of `index.html`).

## Stack

- **Frontend** — static HTML/CSS/JS (`index.html`, `privacy.html`, `terms.html`), no build step or framework.
- **AI intake chat** (`api/chat.js`) — a Vercel serverless function that powers an on-site chat assistant ("Ava"):
  - Uses the **Anthropic API** (Claude) to hold a short, natural intake conversation with visitors.
  - Once enough details are gathered, calls a tool that writes the lead into a **Notion** database (client name, contact info, industry, and a description of the issue).
  - API keys are read from Vercel environment variables and never exposed to the browser or committed to the repo.
- **SEO** — structured data (`ProfessionalService`, `FAQPage`), `sitemap.xml`, and `robots.txt`.

## Project structure

```
index.html      Landing page (hero, services, process, pricing/CTA, FAQ)
privacy.html     Privacy policy
terms.html       Terms of service
api/chat.js      Vercel serverless function — chat + Notion intake
assets/          Logo and brand marks
sitemap.xml
robots.txt
```

## Configuration

All visible contact details (phone, email, form endpoint) are controlled from a single config block at the top of `index.html`:

```js
window.REPSTARK_CONFIG = {
  phoneDisplay: "",
  phoneHref: "",
  email: "",
  formEndpoint: ""
};
```

An empty field simply hides the corresponding element instead of rendering placeholder or fake info.

### Required environment variables (for `api/chat.js`)

| Variable             | Purpose                                   |
|-----------------------|--------------------------------------------|
| `ANTHROPIC_API_KEY`   | Powers the chat assistant                  |
| `NOTION_TOKEN`        | Writes captured leads to Notion            |
| `NOTION_DATABASE_ID`  | Target Notion database for intake records  |

## Deployment

Designed to deploy as a static site with a serverless API route on **Vercel** — drop the repo in, set the environment variables above, and it's live.
