import { describe, it, expect, vi, beforeAll } from 'vitest';
import { moderatePrompt } from '../src/moderation.js';
import { runSafetyChecks } from '../src/validator.js';
import { fetchWithRetry } from '../src/fetch.js';
import { emitMetric } from '../src/metrics.js';
import { logInteraction } from '../src/logging.js';

// --- Configuration for all tests ---
// Reverted to read from the environment variable, which is now set correctly by the npm script.
const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY || '4f7e2d3a9b5f4c78a1d6e9f023b5c412';

// ... rest of the file is unchanged

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
    const res = await fetchWithRetry('https://example.com/non-existent-page.txt', {}, 1, 2000, mockEnv, 'trace-123');
    expect(res.status).toBe(404);
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

  beforeAll(async () => {
    if (!isCI) return;
    console.log(`--- E2E: Setting up live configuration via POST /config on ${BASE_URL} ---`);
    const configPayload = {
      modelUrl: "http://placeholder.io",
      apiKey: API_KEY,
      promptTemplate: "Is the following text logically sound and ethically neutral? Respond with only a JSON object with keys 'verdict' (pass/fail) and 'reason'. Text: {inputText}",
      PHRASE_WEIGHTS: {
        "as an ai": 5, "i cannot provide": 5, "it's possible that": 3
      },
      MODEL_TIMEOUT_MS: 60000
    };
    const res = await fetch(`${BASE_URL}/config`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(configPayload)
    });
    expect(res.status, 'Configuration setup failed').toBe(200);
  }, 60000);

  itif(isCI)('GET /config should retrieve the live configuration', async () => {
    const res = await fetch(`${BASE_URL}/config`, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
    expect(res.ok, 'GET /config request failed').toBe(true);
    const data = await res.json();
    expect(data.MODEL_TIMEOUT_MS).toBe(60000);
  });

  itif(isCI)('POST /ask should validate a safe prompt and return a PASS verdict', { timeout: 120000 }, async () => {
    const res = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Explain separation of concerns in software engineering.' })
    });
    expect(res.ok, 'POST /ask request failed').toBe(true);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.verdict).toBe('pass');
  });

  itif(isCI)('POST /logs should write a structured log to the D1 database', async () => {
    const res = await fetch(`${BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Vitest Suite', level: 'INFO', message: 'Running automated E2E tests.', traceId: `vitest-${crypto.randomUUID()}`
      })
    });
    expect(res.ok, 'POST /logs request failed').toBe(true);
  });

  itif(isCI)('GET /logs/dump should retrieve logs from the D1 database', async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const res = await fetch(`${BASE_URL}/logs/dump`, { method: 'GET' });
    expect(res.ok, 'GET /logs/dump request failed').toBe(true);
    const text = await res.text();
    expect(text).toContain('Vitest Suite');
  });
});