import { describe, it, expect, vi } from 'vitest';
import { moderatePrompt } from '../src/moderation.js';
import { runSafetyChecks } from '../src/validator.js';
import { fetchWithRetry } from '../src/fetch.js';
import { emitMetric } from '../src/metrics.js';
import { logInteraction } from '../src/logging.js';

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