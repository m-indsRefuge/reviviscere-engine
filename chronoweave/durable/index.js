// chronoweave/durable/index.js

import { getDurableObjectNamespace } from './schema.js'

export class SessionMemoryDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(request) {
    const url = new URL(request.url)
    const { pathname } = url

    if (request.method === 'POST' && pathname === '/update') {
      const body = await request.json()
      const { sessionId, agent, input, output } = body

      const sessionState = await this.state.storage.get(sessionId) || {
        sessionId,
        turns: [],
        activeAgent: null,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 min TTL
      }

      sessionState.turns.push({
        agent,
        input,
        output,
        timestamp: Date.now()
      })

      sessionState.activeAgent = agent

      await this.state.storage.put(sessionId, sessionState)

      return new Response(JSON.stringify({ success: true, sessionState }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not Found', { status: 404 })
  }
}
