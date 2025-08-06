export default {
  async scheduled(controller, env, ctx) {
    console.log("Cortex Metrics Aggregator running...");

    // We will need a new KV Namespace to store the aggregated results.
    if (!env.CORTEX_AGGREGATES) {
      console.error("CORTEX_AGGREGATES KV binding not found.");
      return;
    }
    if (!env.CORTEX_METRICS) {
      console.error("CORTEX_METRICS KV binding not found.");
      return;
    }

    let cursor = null;
    let allKeys = [];

    // List all keys in the raw metrics namespace
    do {
      const listResult = await env.CORTEX_METRICS.list({ cursor });
      allKeys = allKeys.concat(listResult.keys);
      cursor = listResult.list_complete ? null : listResult.cursor;
    } while (cursor);

    if (allKeys.length === 0) {
      console.log("No new Cortex metrics to aggregate.");
      return;
    }

    // Basic aggregation logic
    let successCount = 0;
    let errorCount = 0;
    const metricNames = new Set();

    for (const key of allKeys) {
      if (key.name.includes(':plan_generated_success:')) {
        successCount++;
        metricNames.add('plan_generated_success');
      }
      if (key.name.includes(':model_error:') || key.name.includes(':plan_parse_error:')) {
        errorCount++;
        metricNames.add('error');
      }
    }

    const summary = {
      lastRun: new Date().toISOString(),
      totalMetricsProcessed: allKeys.length,
      successCount,
      errorCount,
      metricTypes: [...metricNames],
    };

    // Store the aggregated summary
    await env.CORTEX_AGGREGATES.put("summary", JSON.stringify(summary));
    console.log(`Cortex metrics aggregation complete. Processed ${allKeys.length} metrics.`);
  },
};