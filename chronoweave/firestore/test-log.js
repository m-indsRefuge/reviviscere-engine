// test-log.js

import { logAgentTurn } from './agentLog.js'

// Mocked agent input/output
const testPayload = {
  sessionId: 'reviv-test-001',
  agent: 'cortex',
  input: 'How should the agents collaborate on a new objective?',
  output: 'The Cortex should issue a task plan, Forge translates it into code, Watchtower verifies, and Glia deploys it.',
}

logAgentTurn(testPayload)
  .then(() => {
    console.log('✅ Agent turn logged to Firestore successfully.')
  })
  .catch((err) => {
    console.error('❌ Error logging to Firestore:', err)
  })
