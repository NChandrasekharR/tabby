# Tabby

A bill splitter built like a receipt. Who had what — who owes what.

- **Itemize** each line and mark it *Shared* (split across everyone) or *Assigned* (tap who had it).
- Tax + tip distribute proportionally to each person's subtotal.
- Or switch to **Even split** and divide one total evenly.
- The result prints as a per-person receipt you can copy into any chat.
- Installable **PWA** with offline support; your bill auto-saves to the browser.

## Tech

- [Vite](https://vite.dev) + React
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (manifest + service worker)
- State persisted to `localStorage` (key `tabby.v1`)

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # serve the production build
```

## Deploy

Connected to [Vercel](https://vercel.com) — pushes to `main` deploy automatically.
Build command: `npm run build`, output directory: `dist`.
