// test-d1.js
import fetch from 'node-fetch'; // If Node.js version <18; else global fetch works

const BASE_URL = 'https://chronoweave-worker.nolanaug.workers.dev';

async function testCreateSession(sessionId) {
  const res = await fetch(`${BASE_URL}/session/create?id=${sessionId}`);
  const text = await res.text();
  console.log('Create session:', text);
}

async function testGetSession(sessionId) {
  const res = await fetch(`${BASE_URL}/session/get?id=${sessionId}`);
  if (res.ok) {
    const json = await res.json();
    console.log('Get session:', json);
  } else {
    console.error('Failed to get session:', res.status, await res.text());
  }
}

async function testUpdateAgentState(sessionId, agentName, state) {
  // Assuming you have an endpoint for updating agent state, if not you can add it
  const url = `${BASE_URL}/agent/update?sessionId=${sessionId}&agentName=${agentName}&state=${state}`;
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  console.log('Update agent state:', text);
}

async function runTests() {
  const sessionId = 'test-session-001';
  const agentName = 'cortex';
  const state = 'active';

  await testCreateSession(sessionId);
  await testGetSession(sessionId);

  // Uncomment the below after adding the endpoint for updateAgentState
  // await testUpdateAgentState(sessionId, agentName, state);
}

runTests().catch(console.error);
