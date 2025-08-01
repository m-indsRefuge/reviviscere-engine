export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // POST /ingest - store metric data
    if (url.pathname === "/ingest" && request.method === "POST") {
      try {
        const data = await request.json();

        const jobId = data.jobId || `job:${crypto.randomUUID()}`;
        const metricsKey = `metrics:${jobId}`;

        // Store the full metrics data under its job-specific key
        await env.WATCHTOWER_METRICS.put(metricsKey, JSON.stringify(data));

        // Optional aggregate logic - this aggregates the latest job for the model
        const aggKey = `aggregate:${data.model || "unknown"}`;
        await env.METRICS_AGGREGATES.put(aggKey, JSON.stringify({
          lastJobId: jobId,
          lastTimestamp: Date.now(),
          lastStatus: data.status || "unknown"
        }));

        return new Response(JSON.stringify({ status: "ok", key: metricsKey }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ status: "error", message: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GET /fetch?key= - retrieve metric data by key
    if (url.pathname === "/fetch" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) {
        return new Response(JSON.stringify({ status: "error", message: "Missing 'key' query param" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const value = await env.WATCHTOWER_METRICS.get(key);
      if (!value) {
        return new Response(JSON.stringify({ status: "error", message: `Key '${key}' not found` }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(value, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default 404 response for other endpoints/methods
    return new Response(JSON.stringify({
      status: "not_found",
      message: "Use POST /ingest to store metric data or GET /fetch?key= to retrieve it"
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};
