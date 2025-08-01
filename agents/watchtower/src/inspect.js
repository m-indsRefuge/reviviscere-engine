import { moderatePrompt } from './moderation.js';

export async function handleInspection(request, env) {
  try {
    const body = await request.json();
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({
        status: "FAIL",
        issues: ["Missing or invalid prompt"],
        metrics: {},
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // === Try Ollama /api/moderate first ===
    let modelUrl = env.WATCHTOWER_MODEL_URL?.trim().replace(/\/+$/, '').replace(/^https?:\/\//i, 'http://');
    const moderationUrl = `${modelUrl}/api/moderate`;

    let moderationResult;

    try {
      const moderationRes = await fetch(moderationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt })
      });

      if (!moderationRes.ok) {
        throw new Error(`Moderation API error: ${moderationRes.status}`);
      }

      moderationResult = await moderationRes.json();
    } catch (err) {
      // Fallback to local logic
      moderationResult = moderatePrompt(prompt);
    }

    const issues = [];
    const metrics = {};
    let status = "PASS";

    if (moderationResult.status === "FAIL" || moderationResult.blocked) {
      status = "FAIL";
      for (const issue of moderationResult.issues || []) {
        issues.push(issue);
      }

      // Optional: add metrics logic for local moderation
    }

    return new Response(JSON.stringify({
      status,
      issues,
      metrics,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      status: "FAIL",
      issues: ["Unhandled server error", err.message],
      metrics: {},
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
