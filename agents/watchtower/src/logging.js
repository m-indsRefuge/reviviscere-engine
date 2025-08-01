// logging.js
// Unified signature: (prompt, response, traceId, { env })
export async function logInteraction(prompt, response, traceId, { env } = {}) {
  /* --- safety guards ---------------------------------------------------- */
  if (!env || typeof env !== 'object') {
    console.warn("logInteraction: 'env' object is invalid or missing")
    return
  }

  const kv = env.WATCHTOWER_LOGS
  if (!kv || typeof kv.put !== 'function') {
    console.warn('logInteraction: WATCHTOWER_LOGS binding missing or malformed')
    return
  }

  /* --- persist log entry ------------------------------------------------ */
  try {
    const jobId   = traceId || 'global'
    const source  = 'watchtower'
    const logKey  = `log:${jobId}:${crypto.randomUUID()}`

    const logEntry = {
      prompt,
      response,
      timestamp: new Date().toISOString(),
      traceId: jobId,
      source,
    }

    await kv.put(logKey, JSON.stringify(logEntry))

    /* --- optional metric ------------------------------------------------ */
    if (env.WATCHTOWER_METRICS && typeof env.WATCHTOWER_METRICS.put === 'function') {
      const { emitMetric } = await import('./metrics.js')
      await emitMetric('log_written', { env })          // simple heartbeat metric
    }
  } catch (err) {
    console.error('logInteraction failed:', err.message || err)
  }
}
