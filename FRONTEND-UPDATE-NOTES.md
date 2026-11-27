# KriXo homepage refresh

This update changes the homepage presentation and homepage navigation only.

- Kept the existing KriXo logo asset (`public/assets/krixo-logo.png`).
- Kept the existing tool manifest, all tool pages, processing modules, workspace pages, API/server code, and package configuration unchanged.
- Replaced the homepage layout with a task-first guided layout, popular tool shortcuts, searchable all-tools section, existing tool helper flow, and a simple 3-step explanation.
- Updated the shared header navigation labels. Tool pages continue using the same shared header and footer.
- Added homepage-scoped responsive CSS. Existing tool workspace styles were not intentionally changed.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Configure your own environment values using `.env.example` if you use the server/API features.
4. Run `npm run build` to regenerate `dist` from the updated `public` source.
5. For local development, use `npm run dev`.

The `dist` directory included in this source archive is the previous generated build. Run `npm run build` before deploying; Netlify is already configured to run that build command and publish `dist`.
