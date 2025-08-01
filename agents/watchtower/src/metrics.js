// metrics.js

/**
 * Emit a namespaced metric count into WATCHTOWER_METRICS KV.
 *
 * New preferred signature  → emitMetric('metric_name', { env, jobId?, traceId?, source?, count? })
 * Legacy (still supported) → emitMetric(env, 'metric_name', { jobId?, traceId?, source?, count? })
 */
export async function emitMetric(...args) {
  let env, metricName, opts

  /* --- signature detective --------------------------------------------- */
  if (typeof args[0] === 'object' && typeof args[1] === 'string') {
    /* legacy: (env, metricName, options) */
    env        = args[0]
    metricName = args[1]
    opts       = args[2] || {}
  } else {
    /* new: (metricName, { env, ...options }) */
    metricName = args[0]
    opts       = args[1] || {}
    env        = opts.env
  }

  /* --- guards ----------------------------------------------------------- */
  if (!env || typeof env !== 'object') {
    console.warn("emitMetric: 'env' object is invalid or missing")
    return
  }

  const kv = env.WATCHTOWER_METRICS
  if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
    console.warn('emitMetric: WATCHTOWER_METRICS binding is missing or malformed')
    return
  }

  try {
    const {
      jobId   = 'global',
      traceId = null,
      source  = 'watchtower',
      count   = 1,
    } = opts

    const key     = `metrics:${jobId}`
    const raw     = await kv.get(key)
    const metrics = raw ? JSON.parse(raw) : {}

    /* increment count */
    metrics[metricName] = (metrics[metricName] || 0) + count

    /* metadata */
    metrics.lastUpdated  = Date.now()
    if (traceId) metrics.lastTraceId = traceId
    metrics.source      = source

    await kv.put(key, JSON.stringify(metrics))
  } catch (err) {
    console.error(`emitMetric failed for ${metricName}:`, err.message || err)
  }
}
