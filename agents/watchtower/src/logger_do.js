export class LoggerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    console.log(`LoggerDO received request: ${request.method} ${request.url}`);

    const url = new URL(request.url);

    // --- Log Ingestion (POST /logs) ---
    if (request.method === 'POST' && url.pathname === '/logs') {
      try {
        // CHANGED: Added 'metadata' to the destructured properties
        const { agent, level, message, traceId, metadata } = await request.json();
        const timestamp = new Date().toISOString();

        if (!agent || !level || !message) {
          return new Response(JSON.stringify({ error: 'Missing required log fields: agent, level, message' }), { status: 400 });
        }

        // CHANGED: Added 'metadata' column to the INSERT statement
        const stmt = this.env.DB.prepare(
          'INSERT INTO logs (id, timestamp, agent, level, message, trace_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        
        // CHANGED: Added 'metadata' to the bind call
        await stmt.bind(crypto.randomUUID(), timestamp, agent, level, message, traceId || null, metadata || null).run();
        
        console.log(`LoggerDO successfully INSERTED log for agent: ${agent}`);
        return new Response('Logged', { status: 200 });
      } catch (e) {
        console.error('D1 Logging Error:', e);
        return new Response('Failed to log to D1', { status: 500 });
      }
    }

    // --- Log Dump (GET /logs/dump) ---
    if (request.method === 'GET' && url.pathname === '/logs/dump') {
      try {
        const agent = url.searchParams.get('agent');
        
        console.log(`LoggerDO received DUMP request for agent: ${agent}`);

        if (!agent) {
          return new Response(JSON.stringify({ error: 'Missing required query parameter: agent' }), { status: 400 });
        }
        
        const stmt = this.env.DB.prepare(
          'SELECT * FROM logs WHERE agent = ? ORDER BY timestamp DESC LIMIT 100'
        );
        const { results } = await stmt.bind(agent).all();

        console.log(`LoggerDO FOUND ${results.length} logs for agent: ${agent}`);

        // CHANGED: Added optional 'metadata' to the formatted output string
        const formattedLogs = results.map(log =>
          `[${log.timestamp}] [${log.agent}] [${log.level}] ${log.trace_id ? `[${log.trace_id}] ` : ''}${log.message}${log.metadata ? ` [METADATA: ${log.metadata}]` : ''}`
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