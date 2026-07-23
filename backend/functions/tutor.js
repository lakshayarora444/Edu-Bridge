// Cloudflare Pages Function. Runs at the edge, never in the student's browser.
// The API key lives only as an environment variable set in the Cloudflare dashboard
// (Pages project > Settings > Environment variables), never in this file or the repo.
//
// Route: this file's path (functions/api/tutor.js) maps automatically to POST /api/tutor
//
// Backend: Groq (OpenAI-compatible). Text uses openai/gpt-oss-120b.
// Images use qwen/qwen3.6-27b (Groq's current vision-capable model — check
// console.groq.com/docs/vision if this breaks again later, Groq rotates these).
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_BASE64_CHARS = 11 * 1024 * 1024; // ~8MB raw image, base64-encoded
const MODEL_TEXT = "openai/gpt-oss-120b";
const MODEL_VISION = "qwen/qwen3.6-27b";

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    return json({ error: "Server is missing GROQ_API_KEY. Set it in Cloudflare Pages > Settings > Environment variables." }, 500);
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

  const hasImage = Boolean(image?.data && image?.mimeType);
  const MODEL = hasImage ? MODEL_VISION : MODEL_TEXT;

  const content = [{ type: "text", text: prompt }];
  if (hasImage) {
    content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content }],
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        return json({ error: "Too many requests right now — the free tier is rate-limited. Wait a minute and try again." }, 429);
      }
      console.log("Groq error:", res.status, errBody);
      return json({ error: `Tutor service error: ${res.status} — ${errBody}` }, 502);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
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
