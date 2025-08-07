import 'dotenv/config';
import { describe, it, expect } from 'vitest';

const BASE_URL = 'https://watchtower-agent-worker.nolanaug.workers.dev';
const API_KEY = process.env.API_KEY;

describe('E2E Tests: Live Watchtower Endpoints', () => {
  const itif = (condition) => condition ? it : it.skip;
  const isCI = process.env.CI;

  // This test now uses a polling mechanism to be resilient to D1 replication delays
  itif(isCI)('should write a log and retrieve it for a specific agent', { timeout: 20000 }, async () => {
    // Arrange
    const uniqueTestId = `vitest-run-${crypto.randomUUID()}`;
    const agentName = 'Watchtower-E2E-Test';

    // Act 1: Write the log
    const postRes = await fetch(`${BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agentName,
        level: 'INFO',
        message: 'Running isolated E2E test.',
        traceId: uniqueTestId
      })
    });
    expect(postRes.ok, 'POST /logs request failed').toBe(true);

    // Act 2: Poll the dump endpoint until the log is found or we time out
    let text = '';
    let logFound = false;
    const maxWait = 15000; // 15 seconds
    const pollInterval = 1000; // 1 second
    let elapsedTime = 0;

    while (elapsedTime < maxWait) {
      const getRes = await fetch(`${BASE_URL}/logs/dump?agent=${agentName}`, { method: 'GET' });
      if (getRes.ok) {
        text = await getRes.text();
        if (text.includes(uniqueTestId)) {
          logFound = true;
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      elapsedTime += pollInterval;
    }

    // Assert
    expect(logFound, `Log with ID ${uniqueTestId} was not found in the dump after ${maxWait}ms`).toBe(true);
    expect(text).not.toContain('[Cortex]'); // Verify no contamination
  });
});