// src/logging.js

// This helper function inserts a log entry into the shared D1 database.
export async function logToD1(env, agentName, level, message, traceId, metadata = {}) {
  // Ensure the database binding exists before proceeding
  if (!env.DB) {
    console.error("D1 Database (DB) binding not found. Cannot log.");
    return;
  }

  try {
    // CORRECTED: Changed "agent_name" to "agent" to match the actual DB schema
    const stmt = env.DB.prepare(
      `INSERT INTO logs (id, timestamp, agent, level, message, trace_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    
    await stmt.bind(
      crypto.randomUUID(),      // id
      new Date().toISOString(),   // timestamp
      agentName,                // agent
      level.toUpperCase(),      // level
      message,                  // message
      traceId,                  // trace_id
      JSON.stringify(metadata)  // metadata
    ).run();

  } catch (e) {
    console.error(`Failed to write log to D1 database: ${e.message}`);
  }
}