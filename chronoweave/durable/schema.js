// chronoweave/durable/schema.js

export function createDefaultSession(sessionId) {
  return {
    sessionId,
    turns: [],
    activeAgent: null,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10-minute TTL
  }
}
