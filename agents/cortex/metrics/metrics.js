// metrics/metrics.js

export async function emitMetric(name, { env, traceId, data = {} }) {
  // --- ADDED: Diagnostic logging ---
  console.log("--- Inside emitMetric ---");
  console.log(`Metric Name: ${name}`);
  // This will show us all the available bindings in the env object
  console.log("Available env keys:", Object.keys(env)); 

  if (!env.CORTEX_METRICS) {
    console.error("CRITICAL: CORTEX_METRICS KV binding not found in env object. Cannot emit metric.");
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    const metricKey = `${timestamp}:${name}:${traceId}`;
    
    const metricPayload = {
      name,
      agent: "Cortex",
      timestamp,
      traceId,
      ...data,
    };

    console.log(`Attempting to write metric with key: ${metricKey}`);
    await env.CORTEX_METRICS.put(metricKey, JSON.stringify(metricPayload));
    console.log("Successfully wrote metric to KV.");

  } catch (e) {
    console.error(`Failed to emit Cortex metric to KV: ${e.message}`);
  }
}