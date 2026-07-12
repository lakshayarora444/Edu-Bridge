// Cloudflare Pages Function. Runs at the edge, never in the student's browser.
// The API key lives only as an environment variable set in the Cloudflare dashboard
// (Pages project > Settings > Environment variables), never in this file or the repo.
//
// Route: this file's path (functions/api/tutor.js) maps automatically to POST /api/tutor

const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_BASE64_CHARS = 11 * 1024 * 1024; // ~8MB raw image, base64-encoded

export async function onRequestPost(context) {
  const { request, env } = context;

  const allowedOrigin = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.replace(/\/$/, "") : "";
  const rawOrigin = request.headers.get("origin") || request.headers.get("referer") || "";
  const origin = rawOrigin.replace(/\/$/, "");
  if (allowedOrigin && origin && !origin.startsWith(allowedOrigin)) {
    return json({ error: "Forbidden." }, 403);
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "Server is missing GEMINI_API_KEY. Set it in Cloudflare Pages > Settings > Environment variables." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request body." }, 400);
  }

  const { prompt, image } = body;
  if (!prompt || typeof prompt !== "string") {
    return json({ error: "Missing prompt." }, 400);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: "That request is too long." }, 413);
  }
  if (image?.data && image.data.length > MAX_IMAGE_BASE64_CHARS) {
    return json({ error: "That image is too large." }, 413);
  }

  const parts = [{ text: prompt }];
  if (image?.data && image?.mimeType) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      }
    );

    if (!res.ok) {
      if (res.status === 429) {
        return json({ error: "Too many requests right now — the free tier is rate-limited. Wait a minute and try again." }, 429);
      }
      return json({ error: `Tutor service error: ${res.status}` }, 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    if (!text) {
      return json({ error: "No response from the tutor. Try again." }, 502);
    }

    return json({ text }, 200);
  } catch (e) {
    return json({ error: "Could not reach the tutor service. Try again in a moment." }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
