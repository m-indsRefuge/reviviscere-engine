import 'dotenv/config'; // Loads environment variables from a .env file
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { CortexDO } from '@/cortex_do.js';

// Import the real modules that we intend to spy on
import * as logging from '@/logging.js';
import * as metrics from '@metrics/metrics.js';

// A mock environment that simulates the Cloudflare bindings needed by CortexDO
const mockEnv = {
  CORTEX_MODEL_NAME: 'test-model',
  CONFIG_DO: {
    idFromName: () => 'config',
    get: () => ({
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        modelUrl: 'http://mock-ollama-server.local'
      })))
    })
  },
  CORTEX_METRICS: {
    put: vi.fn()
  },
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn()
      }))
    }))
  }
};

describe('Unit Tests: CortexDO Class', () => {

  beforeEach(() => {
    vi.spyOn(logging, 'logToD1').mockImplementation(() => {});
    vi.spyOn(metrics, 'emitMetric').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully generate and parse a plan for a valid prompt', async () => {
    // Arrange
    const cortex = new CortexDO(null, mockEnv);
    const mockPlan = ["Step 1: Analyze the problem.", "Step 2: Propose a solution."];
    const mockOllamaResponse = {
      response: `Here is the plan.
      \`\`\`json
      {
        "plan": ${JSON.stringify(mockPlan)}
      }
      \`\`\``
    };
    
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockOllamaResponse))
    );

    // Act
    const response = await cortex.generatePlan("Create a plan.", "trace-123");
    const result = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(result.status).toBe('success');
    expect(result.plan).toEqual(mockPlan);
    expect(logging.logToD1).toHaveBeenCalledWith(mockEnv, 'Cortex', 'INFO', 'Successfully generated plan.', 'trace-123', expect.any(Object));
    expect(metrics.emitMetric).toHaveBeenCalledWith('plan_generated_success', expect.any(Object));
  });
});


// ===================================================================================
// E2E TESTS
// ===================================================================================

describe('E2E Tests: Live Cortex Endpoints', () => {
  const itif = (condition) => condition ? it : it.skip;
  const isCI = process.env.CI;
  
  const BASE_URL = 'https://cortex-agent-worker.nolanaug.workers.dev';
  const API_KEY = process.env.API_KEY;

  beforeAll(async () => {
    if (!isCI) return; // Only run setup in a CI environment
    
    console.log(`--- E2E: Setting up live configuration via POST /config on ${BASE_URL} ---`);
    const configPayload = {
        modelUrl: "http://mock-ollama-for-e2e.local", // This is a placeholder for E2E tests
        apiKey: API_KEY,
        promptTemplate: "This is a test template for E2E.",
        MODEL_TIMEOUT_MS: 30000
    };

    const res = await fetch(`${BASE_URL}/config`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(configPayload)
    });
    expect(res.status, 'E2E configuration setup failed').toBe(200);
  }, 60000);

  itif(isCI)('GET /config should retrieve the live configuration', async () => {
    const res = await fetch(`${BASE_URL}/config`, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
    expect(res.ok, 'GET /config request failed').toBe(true);
    const data = await res.json();
    expect(data.MODEL_TIMEOUT_MS).toBe(30000);
  });
  
  itif(isCI)('POST /ask (sync) should return 400 for a request without a prompt', async () => {
    const res = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync: true }) // Missing 'prompt' key
    });
    expect(res.status, 'Expected 400 for malformed sync request').toBe(400);
  });
  
  itif(isCI)('POST /ask (async) should accept a job and return a job ID', { timeout: 60000 }, async () => {
    const res = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'E2E test prompt for async job.' })
    });
    expect(res.status, 'POST /ask request failed').toBe(202);
    const data = await res.json();
    expect(data.jobId).toBeDefined();
  });
});