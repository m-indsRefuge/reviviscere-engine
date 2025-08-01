-- d1/schema.sql

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER,
  updated_at INTEGER,
  status TEXT
);

CREATE TABLE IF NOT EXISTS agent_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  agent_name TEXT,
  state TEXT,
  updated_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  assigned_agent TEXT,
  task_description TEXT,
  status TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
