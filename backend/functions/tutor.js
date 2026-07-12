// This runs on Netlify's servers, never in the student's browser.
// The API key lives only here, as an environment variable you set in the Netlify dashboard.

// Set this to your real Netlify URL after your first deploy (Site settings > Environment variables).
// e.g. ALLOWED_ORIGIN=https://edubridge-yourname.netlify.app
// Left unset, origin checking is skipped — set it once you know your final URL.
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_BASE64_CHARS = 11 * 1024 * 1024; // ~8MB raw image, base64-encoded

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = event.headers?.origin || event.headers?.referer || "";
  if (allowedOrigin && !origin.startsWith(allowedOrigin)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden." }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is missing GEMINI_API_KEY. Set it in Netlify > Site settings > Environment variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad request body." }) };
  }

  const { prompt, image } = body;
  if (!prompt || typeof prompt !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing prompt." }) };
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { statusCode: 413, body: JSON.stringify({ error: "That request is too long." }) };
  }
  if (image?.data && image.data.length > MAX_IMAGE_BASE64_CHARS) {
    return { statusCode: 413, body: JSON.stringify({ error: "That image is too large." }) };
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
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      // Common case: free-tier rate limit hit. Surface a clean message instead of crashing.
      if (res.status === 429) {
        return {
          statusCode: 429,
          body: JSON.stringify({ error: "Too many requests right now — the free tier is rate-limited. Wait a minute and try again." }),
        };
      }
      return { statusCode: 502, body: JSON.stringify({ error: `Tutor service error: ${res.status}` }) };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: "No response from the tutor. Try again." }) };
    }

    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not reach the tutor service. Try again in a moment." }) };
  }
}
