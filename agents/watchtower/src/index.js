import { Router } from 'itty-router';
import { WatchtowerDO } from './watchtower_do.js';
import { ConfigDO } from './config_do.js';
import { LoggerDO } from './logger_do.js';
import { handleInspection } from './inspect.js';
import { logInteraction } from './logging.js';

// Create a new router instance
const router = Router();

// --- Helper Functions --------------------------------------------------

function withCorsHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { ...response, headers });
}

async function checkApiKey(request, env) {
  let authHeader = request.headers.get('Authorization');
  let incomingKey = authHeader?.replace(/^Bearer\s+/i, '').trim() || null;

  if (!incomingKey && request.method === 'POST') {
    try {
      const { apiKey } = await request.clone().json();
      incomingKey = apiKey || null;
    } catch {
      console.log('[DEBUG] Could not parse request body for API key fallback.');
    }
  }

  return incomingKey === env.API_KEY;
}

// --- Middleware --------------------------------------------------------

const withAuth = async (request, env) => {
  const authorized = await checkApiKey(request, env);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
};

// --- Route Definitions -------------------------------------------------

router.options('*', () => new Response(null, { status: 204 }));

router.post('/ask', withAuth, (request, env) => {
  const id = env.WATCHTOWER_DO.idFromName('watchtower');
  const stub = env.WATCHTOWER_DO.get(id);
  return stub.fetch(request);
});

router.all('/config', (request, env) => {
  const id = env.CONFIG_DO.idFromName('config');
  const stub = env.CONFIG_DO.get(id);
  return stub.fetch(request);
});

router.all('/logs/*', (request, env) => {
  const id = env.LOGGER_DO.idFromName('logger');
  const stub = env.LOGGER_DO.get(id);
  return stub.fetch(request);
});

// --- ADDED: Route to view metrics from KV store ---
router.get('/metrics', withAuth, async (request, env) => {
  try {
    const kvList = await env.WATCHTOWER_METRICS.list();
    const keys = kvList.keys.map(k => k.name); // Extract just the names
    return new Response(JSON.stringify(keys), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Failed to get metrics from KV:', e.message);
    return new Response(JSON.stringify({ error: 'Could not retrieve metrics.' }), { status: 500 });
  }
});

router.all('/inspect', (request, env) => {
  return handleInspection(request, env);
});

// Fallback for any other route
router.all('*', () => new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));

// --- Worker Entrypoint -------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    return router
      .handle(request, env, ctx)
      .catch(err => {
        console.error('Router error:', err);
        return new Response('Internal Server Error', { status: 500 });
      })
      .then(response => withCorsHeaders(response));
  },

  async scheduled(event, env, ctx) {
    const id = env.WATCHTOWER_DO.idFromName('watchtower');
    const stub = env.WATCHTOWER_DO.get(id);
    await stub.fetch(new Request('https://watchtower-agent-worker.nolanaug.workers.dev/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'warm', stream: false, auth: env.API_KEY })
    }));
  },

  async log(request, env, ctx) {
    await logInteraction(request, env);
  }
};

// Expose your DO classes for Wrangler bindings
export { WatchtowerDO, ConfigDO, LoggerDO };// Re-validating CI pipeline

