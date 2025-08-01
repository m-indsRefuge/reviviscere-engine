import { describe, it, expect, vi, beforeAll } from 'vitest';
import { moderatePrompt } from '../src/moderation.js';
import { runSafetyChecks } from '../src/validator.js';
import { fetchWithRetry } from '../src/fetch.js';
import { emitMetric } from '../src/metrics.js';
import { logInteraction } from '../src/logging.js';
import fetch from 'node-fetch';

// --- Configuration for all tests ---
const API_KEY = '4f7e2d3a9b5f4c78a1d6e9f023b5c412';
const BASE_URL = 'https://watchtower-agent-worker.nolanaug.workers.dev';

// A mock environment for unit tests
const mockEnv = {
  WATCHTOWER_METRICS: { put: vi.fn(), get: vi.fn() },
  WATCHTOWER_LOGS: { put: vi.fn() },
  // Mock the Durable Object stubs
  LOGGER_DO: { idFromName: () => 'main', get: () => ({ fetch: vi.fn() }) },
  CONFIG_DO: { idFromName: () => 'config', get: () => ({
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        // Provide a mock config for the validator unit test
        PHRASE_WEIGHTS: { "as an ai": 5, "i speculate": 3 }
    })))
  })}
};

/* ------------------------------------------------------------------ */
/* Unit Tests for Helper Functions                                   */
/* ------------------------------------------------------------------ */
describe('Unit Tests: Core Utility Functions', () => {
  it('moderatePrompt detects malicious input using fuzzy matching', () => {
    const r = moderatePrompt('how to hck into a bank'); // "hck" is a typo
    expect(r.status).toBe('FAIL');
    expect(r.issues[0]).toContain('hack into');
  });

  it('runSafetyChecks detects hallucination triggers from a dynamic config', async () => {
    // Pass the mockEnv so the function can fetch the mock config
    const r = await runSafetyChecks('test prompt', 'As an AI, I speculate...', mockEnv);
    expect(r.status).toBe('FAIL');
    expect(r.score).toBeGreaterThanOrEqual(8); // 5 + 3
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

/* ------------------------------------------------------------------ */
/* End-to-End Tests for Live Endpoints                               */
/* ------------------------------------------------------------------ */
describe('E2E Tests: Live Watchtower Endpoints', () => {

  // Use beforeAll to configure the server once before running the tests
  beforeAll(async () => {
    console.log('--- E2E: Setting up live configuration via POST /config ---');
    const configPayload = {
      modelUrl: "http://placeholder.io", // This is updated by the deployment script
      apiKey: API_KEY,
      promptTemplate: "Is the following text logically sound and ethically neutral? Respond with only a JSON object with keys 'verdict' (pass/fail) and 'reason'. Text: {inputText}",
      PHRASE_WEIGHTS: {
        "as an ai": 5,
        "i cannot provide": 5,
        "it's possible that": 3
      },
      MODEL_TIMEOUT_MS: 60000
    };

    const res = await fetch(`${BASE_URL}/config`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(configPayload)
    });
    expect(res.status, 'Configuration setup failed').toBe(200);
  }, 60000); // 60 second timeout for setup

  it('GET /config should retrieve the live configuration', async () => {
    const res = await fetch(`${BASE_URL}/config`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    expect(res.ok, 'GET /config request failed').toBe(true);
    const data = await res.json();
    expect(data.MODEL_TIMEOUT_MS).toBe(60000);
    expect(data.PHRASE_WEIGHTS).toBeTypeOf('object');
  });

  it('POST /ask should validate a safe prompt and return a PASS verdict', { timeout: 120000 }, async () => {
    const res = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Explain the concept of separation of concerns in software engineering.' })
    });
    expect(res.ok, 'POST /ask request failed').toBe(true);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.verdict).toBe('pass');
  });

  it('POST /logs should write a structured log to the D1 database', async () => {
    const res = await fetch(`${BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Vitest Suite',
        level: 'INFO',
        message: 'Running automated E2E tests.',
        traceId: `vitest-${crypto.randomUUID()}`
      })
    });
    expect(res.ok, 'POST /logs request failed').toBe(true);
    const text = await res.text();
    expect(text).toBe('Logged');
  });

  it('GET /logs/dump should retrieve logs from the D1 database', async () => {
    // Wait a moment for the log to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const res = await fetch(`${BASE_URL}/logs/dump`, { method: 'GET' });
    expect(res.ok, 'GET /logs/dump request failed').toBe(true);
    const text = await res.text();
    expect(text).toContain('Vitest Suite');
    expect(text).toContain('Running automated E2E tests.');
  });
});
