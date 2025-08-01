export class LoggerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // --- Log Ingestion (POST /logs) ---
    if (request.method === 'POST' && url.pathname === '/logs') {
      try {
        const { agent, level, message, traceId } = await request.json();
        const timestamp = new Date().toISOString();

        if (!agent || !level || !message) {
          return new Response(JSON.stringify({ error: 'Missing required log fields: agent, level, message' }), { status: 400 });
        }

        const stmt = this.env.DB.prepare(
          'INSERT INTO logs (id, timestamp, agent, level, message, traceId) VALUES (?, ?, ?, ?, ?, ?)'
        );
        await stmt.bind(crypto.randomUUID(), timestamp, agent, level, message, traceId || null).run();

        return new Response('Logged', { status: 200 });
      } catch (e) {
        console.error('D1 Logging Error:', e);
        return new Response('Failed to log to D1', { status: 500 });
      }
    }

    // --- Log Dump (GET /logs/dump) ---
    // +++ CORRECTED: The check now uses the full path +++
    if (request.method === 'GET' && url.pathname === '/logs/dump') {
      try {
        const { results } = await this.env.DB.prepare(
          'SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100'
        ).all();

        const formattedLogs = results.map(log =>
          `[${log.timestamp}] [${log.agent}] [${log.level}] ${log.traceId ? `[${log.traceId}] ` : ''}${log.message}`
        ).join('\n');

        return new Response(formattedLogs, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      } catch (e) {
        console.error('D1 Dump Error:', e);
        return new Response('Failed to retrieve logs from D1', { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
}