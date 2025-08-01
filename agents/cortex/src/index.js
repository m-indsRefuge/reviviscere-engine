// src/index.js

import { CortexDO } from './cortex_do.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/config')) {
      return env.CONFIG_DO.fetch(request);
    } else if (path.startsWith('/ask')) {
      return env.CORTEX_DO.fetch(request);
    }

    return new Response("Cortex server is live", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  },
};

// Durable Object binding for /config
export class ConfigDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      let config = await this.state.storage.get('config') || {};
      return new Response(JSON.export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/config') {
      const id = env.CONFIG_DO.idFromName("singleton");
      const obj = env.CONFIG_DO.get(id);
      return withCors(await obj.fetch(request));
    }

    if (url.pathname === '/cortex' && request.method === 'POST') {
      const id = env.CORTEX_DO_V3.idFromName("singleton");
      const obj = env.CORTEX_DO_V3.get(id);
      return withCors(await obj.fetch(request));
    }

    if (url.pathname === '/prompt' && request.method === 'POST') {
      const response = await handlePromptRequest(request, env);
      return withCors(response);
    }

    if (url.pathname === '/stream' && request.method === 'POST') {
      const response = await handleStreamRequest(request, env);
      return withCors(response);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return withCors(new Response('Cortex Worker is live!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }));
    }

    return withCors(new Response('Not Found', { status: 404 }));
  }
};

// === CORS Helpers ===
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response) {
  const newHeaders = new Headers(response.headers);
  const cors = corsHeaders();
  for (const [key, value] of Object.entries(cors)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// === Response Validation Middleware ===
function validateAndNormalizeResponse(rawResponse) {
  const schemaDefaults = {
    model: "unknown-model",
    created_at: new Date().toISOString(),
    response: "",
    done: false,
    done_reason: "unknown",
  };

  const res = { ...schemaDefaults, ...rawResponse };

  if (typeof res.response !== "string" || res.response.trim() === "") {
    res.response = "Error: Empty or invalid response from model.";
  }

  res.done = Boolean(res.done);

  const validDoneReasons = ["stop", "timeout"];
  if (!validDoneReasons.includes(res.done_reason)) {
    res.done_reason += " [Warning: Unusual done_reason]";
    console.warn(`Unusual done_reason detected: ${res.done_reason}`);
  }

  if (typeof res.model !== "string") res.model = "unknown-model";
  if (isNaN(Date.parse(res.created_at))) res.created_at = new Date().toISOString();

  return res;
}

// === /prompt handler ===
async function handlePromptRequest(request, env) {
  try {
    const { prompt, stream = false, max_tokens } = await request.json();
    const modelUrl = env.CORTEX_MODEL_URL || 'http://localhost:11434';

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(JSON.stringify({
        model: 'phi',
        created_at: new Date().toISOString(),
        response: '⚠️ Empty prompt received. Please provide a valid input.',
        done: true,
        done_reason: 'stop'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const bodyPayload = {
      model: 'phi',
      prompt,
      stream,
    };

    if (max_tokens) {
      bodyPayload.num_predict = max_tokens;
    }

    const res = await fetch(`${modelUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    const rawText = await res.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ error: "Parse error", raw: rawText }), { status: 500 });
    }

    json = validateAndNormalizeResponse(json);

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500 });
  }
}

// === /stream handler ===
async function handleStreamRequest(request, env) {
  try {
    const { prompt } = await request.json();

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response("⚠️ Empty prompt received. Please provide a valid input.", { status: 400 });
    }

    const modelUrl = env.CORTEX_MODEL_URL || 'http://localhost:11434';

    const res = await fetch(`${modelUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'phi',
        prompt,
        stream: true
      }),
    });

    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (err) {
    return new Response(`Stream error: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// === Durable Object: ConfigDO ===
export class ConfigDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'POST') {
      const data = await request.json();
      await this.state.storage.put('modelUrl', data.modelUrl);
      return new Response(JSON.stringify({ message: `Model URL set to ${data.modelUrl}` }), { status: 200 });
    }

    if (request.method === 'GET') {
      const modelUrl = await this.state.storage.get('modelUrl');
      return new Response(JSON.stringify({ modelUrl }), { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  }
}

// === Durable Object: CortexDO ===
export class CortexDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    return new Response('CortexDO received a request.', { status: 200 });
  }
}


stringify(config), { status: 200 });
    }

    if (request.method === 'POST') {
      const data = await request.json();
      await this.state.storage.put('config', data);
      return new Response(JSON.stringify({ message: `Updated config: ${JSON.stringify(data)}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }
}
