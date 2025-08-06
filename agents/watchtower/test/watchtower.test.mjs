import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { moderatePrompt } from '../src/moderation.js';
import { runSafetyChecks } from '../src/validator.js';
import { fetchWithRetry } from '../src/fetch.js';
import { emitMetric } from '../src/metrics.js';
import { logInteraction } from '../src/logging.js';

const BASE_URL = 'https://watchtower-agent-worker.nolanaug.workers.dev';
const API_KEY = process.env.API_KEY;

const mockEnv = {
  WATCHTOWER_METRICS: { put: vi.fn(), get: vi.fn() },
  WATCHTOWER_LOGS: { put: vi.fn() },
  LOGGER_DO: { idFromName: () => 'main', get: () => ({ fetch: vi.fn() }) },
  CONFIG_DO: { idFromName: () => 'config', get: () => ({
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        PHRASE_WEIGHTS: { "as an ai": 5, "i speculate": 3 }
    })))
  })}
};

describe('Unit Tests: Core Utility Functions', () => {
  it('moderatePrompt detects malicious phrases with typos', () => {
    const r = moderatePrompt('how to hck into a bank');
    expect(r.status).toBe('FAIL');
    expect(r.issues[0]).toContain('hack into');
  });
  it('runSafetyChecks detects hallucination triggers from a dynamic config', async () => {
    const r = await runSafetyChecks('test prompt', 'As an AI, I speculate...', mockEnv);
    expect(r.status).toBe('FAIL');
    expect(r.score).toBeGreaterThanOrEqual(8);
  });
  it('fetchWithRetry handles a 404 error correctly', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 })
    );
    const res = await fetchWithRetry('https://example.com/non-existent-page.txt', {}, 1, 2000, mockEnv, 'trace-123');
    expect(res.status).toBe(404);
    mockFetch.mockRestore();
  });
  it('emitMetric calls the KV put method', async () => {
    await emitMetric('test_metric', { env: mockEnv });
    expect(mockEnv.WATCHTOWER_METRICS.put).toHaveBeenCalled();
  });
  it('logInteraction calls the KV put method', async () => {
    await logInteraction('prompt', 'response', 'trace-123', { env: mockEnv });
    expect(mockEnv.WATCHTOWER_LOGS.put).toHaveBeenCalled();
  });
});

describe('E2E Tests: Live Watchtower Endpoints', () => {
  const itif = (condition) => condition ? it : it.skip;
  const isCI = process.env.CI;

  // This test is now self-contained and more robust
  itif(isCI)('should write a log via POST /logs and retrieve it via GET /logs/dump', async () => {
    // Arrange: Create a unique identifier for this specific test run
    const uniqueTestId = `vitest-run-${crypto.randomUUID()}`;

    // Act 1: Write the log
    const postRes = await fetch(`${BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Vitest Suite', 
        level: 'INFO', 
        message: 'Running automated E2E tests.', 
        traceId: uniqueTestId 
      })
    });
    expect(postRes.ok, 'POST /logs request failed').toBe(true);

    // Act 2: Wait for the log to be persisted, then retrieve the log dump
    await new Promise(resolve => setTimeout(resolve, 2000));
    const getRes = await fetch(`${BASE_URL}/logs/dump`, { method: 'GET' });
    expect(getRes.ok, 'GET /logs/dump request failed').toBe(true);
    const text = await getRes.text();

    // Assert: Check that the log dump contains our unique identifier
    expect(text).toContain(uniqueTestId);
  });
});