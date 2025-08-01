export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/metrics-test') {
      return testMetricsWrite(env);
    }
    return new Response('Not Found', { status: 404 });
  },
};

async function testMetricsWrite(env) {
  const traceId = crypto.randomUUID();
  const metricsKV = env.WATCHTOWER_METRICS;
  const logKV = env.WATCHTOWER_LOGS;

  try {
    await logKV.put(`log:${traceId}`, JSON.stringify({
      level: 'info',
      type: 'metrics_test_start',
      timestamp: Date.now(),
    }));

    const testKey = `metrics:test:${traceId}`;
    const testValue = JSON.stringify({
      message: 'test metrics write',
      timestamp: Date.now(),
    });

    await metricsKV.put(testKey, testValue);

    await logKV.put(`log:${traceId}`, JSON.stringify({
      level: 'info',
      type: 'metrics_test_success',
      testKey,
      timestamp: Date.now(),
    }));

    return new Response(JSON.stringify({
      status: 'success',
      testKey,
      testValue,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    await logKV.put(`log:${traceId}`, JSON.stringify({
      level: 'error',
      type: 'metrics_test_failure',
      message: err.stack || err.message,
      timestamp: Date.now(),
    }));

    return new Response(JSON.stringify({
      status: 'failure',
      error: err.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
