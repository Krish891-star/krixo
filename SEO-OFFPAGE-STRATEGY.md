# KriXo — off-page and authority strategy

## Current verified state

- `[VERIFIED]` `https://krixo.netlify.app/` returns 200 and redirects HTTP to HTTPS with a 301.
- `[VERIFIED]` Live headers include HSTS, CSP and referrer policy; the live sitemap is stale. This is a deployment gap, not a source-code gap: the rebuilt local `dist/sitemap.xml` has 48 URLs after Workspaces/Formats were removed by request.
- `[VERIFIED]` Search results for "Krixo" are dominated by an unrelated `krixo.io` cybersecurity brand; KriXo's tool site did not appear in the observed brand results.
- `[NOT VERIFIED]` Backlink counts, referring domains, citation quality and GSC/GA data: no access available.

## Priority order

### 1. Fix the authority foundation first

1. Move to a custom domain (for example a `krixo.tools`-style domain) and make it the only canonical host. Update `.env` `APP_URL`, `dns`, Netlify domain settings and the sitemap generator together.
2. Keep `https://krixo.netlify.app/` as a 301 redirect to the custom domain; do not run two indexable copies.
3. Deploy the rebuilt `dist` so the live sitemap has all 58 URLs and all tool pages stop 404-ing.
4. Use consistent brand text: "KriXo Tools — free PDF and image tools in your browser". The unrelated security brand should not be confused with KriXo in citations.

### 2. Earn links with genuinely linkable assets

Build one asset per gap competitors leave open:

- **Portal requirement checker** — a tool plus dated, cited requirement pages for photo/signature/KB uploads. This is the strongest link magnet because it solves a repeated form-rejection problem.
- **KB vs KiB explainer** — a short, technical, source-backed page that explains why a 100 KB form may mean 100,000 bytes. Competitors already rank here; KriXo can earn citations with precision rather than volume claims.
- **Browser-local privacy audit** — show the Network tab verification steps and a written statement of exactly which tools are local. Link it from every tool footer.
- **Format limitation matrix** — state honestly which inputs/outputs work, which become still images, and which need a different tool. Webmasters link to tables that settle arguments.

Do not publish "Free PDF tools" listicles; the category is saturated and low-link-value.

### 3. Outreach targets (local, verifiable, no paid links)

| Target type | Why it fits | Approach |
|---|---|---|
| Government/exam/form help forums | Users repeatedly ask why photo/signature uploads fail | Answer with the checker and a dated requirement note; no spam |
| Webmaster/dev communities | KB vs KiB, image format and browser-local processing questions | Share the explainer and format matrix |
| Privacy-focused software directories | KriXo already processes in browser where implemented | Submit only after the privacy audit page is live |
| Education/small-business productivity blogs | Practical JPG→PDF, merge, compress tasks | Offer the specific guide, not a generic homepage link |
| Existing `.io` brand confusion pages | Brand term ambiguity | Use consistent "KriXo Tools" naming; request correction where KriXo is misrepresented |

All outreach should be relationship-based and transparent. Do not buy links, use PBNs or add paid "sponsored" placements without disclosure.

## Citations and trust signals

- Add an `Organization` JSON-LD block with a real logo, sameAs profiles and consistent name (already emitted by `seo.js`, but profile URLs should be filled with real accounts only).
- Publish a named maintainer/contact, privacy page and last-reviewed dates.
- Keep HTTPS, HSTS and CSP headers; they support trust but are not ranking shortcuts.
- Link from real profiles (GitHub, product directories, community accounts) only when the profile contains genuine activity.

## What not to do

- Do not claim first-mover status for exact-KB or no-upload tools; competitors are already active.
- Do not use search-volume or backlink numbers without data.
- Do not chase the head terms before the long-tail requirement/KB pages earn relevance.
- Do not deploy local code and assume the live site changed; Netlify deployment is a separate step.

## Success measures (once data is available)

1. Live sitemap URL count = 48 and 0 tool-page 404s.
2. GSC: indexed tool pages, impressions for exact-KB/px/checker queries, brand queries for "KriXo Tools".
3. Referring domains to guides/checker, not just the homepage.
4. Crawl console: 0 broken internal links, 0 duplicate canonicals, 0 noindex pages in the sitemap.
