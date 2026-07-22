// Cloudflare Pages Function. Runs at the edge, never in the student's browser.
// The API key lives only as an environment variable set in the Cloudflare dashboard
// (Pages project > Settings > Environment variables), never in this file or the repo.
//
// Route: this file's path (functions/api/tutor.js) maps automatically to POST /api/tutor
//
// Backend: Groq (OpenAI-compatible), model meta-llama/llama-4-scout-17b-16e-instruct.
// Switched from Gemini because this Google Cloud project was capped at 5 RPM / 20 RPD
// even after identity verification. Groq's free tier is 30 RPM / 1,000 RPD, no card,
// no verification wall.

const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_BASE64_CHARS = 11 * 1024 * 1024; // ~8MB raw image, base64-encoded
const MODEL = "openai/gpt-oss-120b";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Origin checking removed — it broke multiple deploys for a protection that's
  // trivially bypassed by any non-browser caller anyway. Real defense against abuse
  // is: no billing attached to this API key (worst case is "rate limited", not a bill),
  // and the input-size caps below.

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

  const content = [{ type: "text", text: prompt }];
  if (image?.data && image?.mimeType) {
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
      if (res.status === 429) {
        return json({ error: "Too many requests right now — the free tier is rate-limited. Wait a minute and try again." }, 429);
      }
      const errBody = await res.text().catch(() => "");
      return json({ error: `Tutor service error: ${res.status}` }, 502);
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
