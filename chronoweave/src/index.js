import { D1Client } from '../d1/index.js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const d1 = new D1Client(env)

    // ───── SESSION: D1 ─────
    if (url.pathname === '/session/create') {
      const sessionId = url.searchParams.get('id') || 'default-session'
      await d1.createSession(sessionId)
      return new Response(`Session ${sessionId} created`, { status: 200 })
    }

    if (url.pathname === '/session/get') {
      const sessionId = url.searchParams.get('id') || 'default-session'
      const session = await d1.getSession(sessionId)
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ───── KV ─────
    if (url.pathname === '/kv/set') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const key = url.searchParams.get('key')
      if (!key) {
        return new Response(JSON.stringify({ error: 'Missing key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const value = await request.text()
      await env.CHRONOWEAVE_KV.put(key, value)
      return new Response(`Stored key "${key}" with value "${value}"`, { status: 200 })
    }

    if (url.pathname === '/kv/get') {
      const key = url.searchParams.get('key')
      if (!key) {
        return new Response(JSON.stringify({ error: 'Missing key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const value = await env.CHRONOWEAVE_KV.get(key)
      if (value === null) {
        return new Response(JSON.stringify({ error: `Key "${key}" not found` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(value, { status: 200 })
    }

    // ───── R2 Upload ─────
    if (url.pathname === '/r2/upload') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const key = url.searchParams.get('key')
      if (!key) {
        return new Response(JSON.stringify({ error: 'Missing key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const value = await request.arrayBuffer()
      await env.CHRONOWEAVE_R2.put(key, value)
      return new Response(`Stored file with key "${key}"`, { status: 200 })
    }

    // ───── R2 Download ─────
    if (url.pathname === '/r2/get') {
      const key = url.searchParams.get('key')
      if (!key) {
        return new Response(JSON.stringify({ error: 'Missing key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const object = await env.CHRONOWEAVE_R2.get(key)
      if (!object) {
        return new Response(JSON.stringify({ error: `File with key "${key}" not found` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream'
        }
      })
    }

    // ───── Fallback ─────
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
