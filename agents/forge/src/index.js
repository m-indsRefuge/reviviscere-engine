import { ForgeDO } from './forge_do.js'; // Durable Object class

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Optional: Log environment variables using Wrangler's env
    console.log('FORGE_MODEL_NAME:', env.FORGE_MODEL_NAME);
    console.log('PORT:', env.PORT);

    if (url.pathname === "/ask" && request.method === "POST") {
      const id = url.searchParams.get("id") || "default";
      const objId = env.FORGE_DO.idFromName(id);
      const stub = env.FORGE_DO.get(objId);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// Export Durable Object for Wrangler to recognize
export { ForgeDO };
