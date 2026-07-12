# EduBridge — deploy notes

This project is set up for **Cloudflare Pages**, not Netlify (Netlify's free tier moved to a
credit system in 2026 that runs out fast under an iterative build/debug process).

## What runs where
- `frontend/` — the React app (Vite). This is what gets built and served.
- `frontend/functions/api/tutor.js` — the ACTUAL serverless function Cloudflare runs.
  Cloudflare requires functions to live inside the project's configured root directory,
  so this is the live copy.
- `backend/functions/tutor.js` — reference copy of the same logic in Netlify's function
  format. Not used in the Cloudflare deploy. Keep it only if you want a record of the
  Netlify version, or delete it — it does nothing on its own.
- `netlify.toml.reference-only` — old Netlify config, renamed so Cloudflare doesn't try
  to read it. Safe to delete.

## Deploy steps (Cloudflare Pages)
1. Push this repo to GitHub as-is (folder structure matters — don't flatten it).
2. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → pick this repo.
3. Build settings:
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Before or right after first deploy: Settings → Environment variables → add:
   - `GEMINI_API_KEY` = your key from aistudio.google.com/apikey
   - `ALLOWED_ORIGIN` = your live `*.pages.dev` URL (add this AFTER your first deploy gives you the URL, then redeploy)
5. Deploy. Test the "Study guide" tab first — it's the simplest round trip to verify the function works.
