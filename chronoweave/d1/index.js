// chronoweave/d1/index.js

export class D1Client {
  constructor(env) {
    this.db = env.D1
  }

  async createSession(sessionId) {
    const now = Date.now()
    const query = `
      INSERT INTO sessions (session_id, created_at, updated_at, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET updated_at=excluded.updated_at
    `
    await this.db.prepare(query).bind(sessionId, now, now, 'active').run()
  }

  async getSession(sessionId) {
    const query = `SELECT * FROM sessions WHERE session_id = ?`
    return await this.db.prepare(query).bind(sessionId).first()
  }

  async updateAgentState(sessionId, agentName, state) {
    const now = Date.now()
    const query = `
      INSERT INTO agent_states (session_id, agent_name, state, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, agent_name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
    `
    await this.db.prepare(query).bind(sessionId, agentName, state, now).run()
  }
}
