export class ForgeDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const { prompt } = await request.json();

    if (!prompt) {
      return new Response("Missing prompt", { status: 400 });
    }

    // Use Forge model name env var or default to codellama 7b instruct q4_K_M
    const modelName = this.env.FORGE_MODEL_NAME || "codellama:7b-instruct-q4_K_M";

    // Use dynamic URL from env var or fallback to localhost
    const ollamaUrl = this.env.FORGE_MODEL_URL || "http://localhost:11434";

    const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      return new Response("Ollama failed", { status: 500 });
    }

    const result = await ollamaRes.json();
    return new Response(result.response, { status: 200 });
  }
}
