//Input to Trigger CI/CD Pipeline
// src/index.js
import { Router } from 'itty-router';
export { CortexDO } from './cortex_do.js';
export { ConfigDO } from './config_do.js';

const router = Router();

// ADDED: Health check endpoint for monitoring
router.get('/', () => new Response(JSON.stringify({ status: "live", agent: "Cortex" }), {
  headers: { 'Content-Type': 'application/json' },
}));

// Route /config requests to the ConfigDO
router.all('/config', (request, env) => {
  const doId = env.CONFIG_DO.idFromName("singleton");
  const stub = env.CONFIG_DO.get(doId);
  return stub.fetch(request);
});

// Route all other requests to the main CortexDO
router.all('*', (request, env) => {
  const doId = env.CORTEX_DO.idFromName("singleton");
  const stub = env.CORTEX_DO.get(doId);
  return stub.fetch(request);
});

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx)
};