// chronoweave/firestore/agentLog.js

import { db } from './index.js'

export async function logAgentTurn({ sessionId, agent, input, output }) {
  const ref = db.collection('agent_logs').doc()
  await ref.set({
    sessionId,
    agent,
    input,
    output,
    timestamp: Date.now()
  })
}

export async function getSessionHistory(sessionId) {
  const snapshot = await db
    .collection('agent_logs')
    .where('sessionId', '==', sessionId)
    .orderBy('timestamp', 'asc')
    .get()

  return snapshot.docs.map(doc => doc.data())
}
