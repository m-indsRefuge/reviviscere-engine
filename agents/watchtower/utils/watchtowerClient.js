// utils/watchtowerClient.js

const WATCHTOWER_URL = 'https://watchtower-agent-worker.nolanaug.workers.dev/ask'

/**
 * Send a prompt to Watchtower for validation or processing.
 * Supports both streaming and non-streaming modes, with full tracing and auth.
 *
 * @param {Object} config
 * @param {string} config.prompt     - The full prompt string.
 * @param {boolean} [config.stream=false] - Whether to stream NDJSON response.
 * @param {Object} [config.metadata={}]   - Optional metadata (agent, taskId, traceId, etc).
 * @param {string} config.auth       - Auth token (used in header and body).
 * @param {Function} [config.onChunk] - Callback for stream mode; receives each parsed NDJSON chunk.
 * @returns {Promise<string|undefined>} - Full response string if non‑streaming; undefined for stream.
 */
export async function callWatchtower({
  prompt,
  stream = false,
  metadata = {},
  auth,
  onChunk
}) {
  if (!auth) throw new Error('Missing Watchtower auth token.')
  if (!prompt || typeof prompt !== 'string') throw new Error('Prompt must be a string.')

  // Ensure we have a traceId
  const traceId = metadata.traceId || crypto.randomUUID()
  metadata.traceId = traceId

  // Build the JSON body
  const body = JSON.stringify({
    prompt,
    stream,
    metadata,
    auth,
  })

  // Set headers for both body‑auth and header‑auth, plus tracing
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${auth}`,
    'X-Trace-Id':    traceId
  }

  const res = await fetch(WATCHTOWER_URL, {
    method: 'POST',
    headers,
    body,
  })

  // Enhanced error handling: try JSON first, then fallback to text
  if (!res.ok) {
    let msg
    try {
      const errJson = await res.json()
      msg = errJson.error || errJson.message || JSON.stringify(errJson)
    } catch {
      msg = await res.text()
    }
    throw new Error(`Watchtower ${res.status}: ${msg}`)
  }

  // Non‑streaming mode: return full response
  if (!stream) {
    const { response } = await res.json()
    return response
  }

  // Streaming mode: parse NDJSON chunks
  const reader = res.body?.getReader?.()
  if (!reader) throw new Error('Stream reader not available')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // hold partial line

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (typeof onChunk === 'function') onChunk(parsed)
      } catch {
        console.warn('Watchtower NDJSON parse error:', line)
      }
    }
  }

  // Final flush of any remaining partial
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer)
      if (typeof onChunk === 'function') onChunk(parsed)
    } catch {
      console.warn('Watchtower final chunk parse error:', buffer)
    }
  }
}
