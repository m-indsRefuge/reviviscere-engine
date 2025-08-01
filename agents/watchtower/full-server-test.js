import { moderatePrompt } from './src/moderation.js';
import { emitMetric } from './src/metrics.js';
import { logInteraction } from './src/logging.js';
import { runSafetyChecks } from './src/validator.js';

const WATCHTOWER_BASE = 'https://watchtower-agent-worker.nolanaug.workers.dev';
const API_KEY = '4f7e2d3a9b5f4c78a1d6e9f023b5c412';

async function testAsk() {
  console.log('Testing /ask endpoint...');
  const res = await fetch(`${WATCHTOWER_BASE}/ask`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Trace-Id': 'test-ask'
    },
    body: JSON.stringify({
      prompt: 'Explain backpropagation in neural networks.',
      stream: false
    }),
  });
  const data = await res.json();
  console.log('/ask status:', res.status);
  console.log('/ask response snippet:', JSON.stringify(data).slice(0, 200));
  if (!res.ok) throw new Error('/ask failed');
}

async function testStream() {
  console.log('Testing /stream endpoint...');
  const res = await fetch(`${WATCHTOWER_BASE}/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Trace-Id': 'test-stream'
    },
    body: JSON.stringify({
      prompt: 'List key components of a transformer model.',
      stream: true
    }),
  });

  const contentType = res.headers.get("content-type");
  if (!res.ok || contentType !== "text/event-stream") {
    const txt = await res.text();
    console.error('Stream test error:', txt);
    throw new Error(`/stream failed (status: ${res.status}, content-type: ${contentType})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let partial = '';
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    partial += decoder.decode(value, { stream: true });
    const lines = partial.split('\n');
    partial = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.response) {
          fullResponse += json.response;
        }
      } catch {}
    }
  }

  if (partial.trim()) {
    try {
      const json = JSON.parse(partial);
      if (json.response) fullResponse += json.response;
    } catch {}
  }

  console.log('/stream response snippet:', fullResponse.slice(0, 200));
}

async function testConfig() {
  console.log('Testing /config GET...');
  let res = await fetch(`${WATCHTOWER_BASE}/config`, { method: 'GET' });
  let data = await res.json();
  console.log('/config GET status:', res.status);
  console.log('/config GET response:', data);

  console.log('Testing /config POST...');
  res = await fetch(`${WATCHTOWER_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelUrl: 'https://example-model-url.com' })
  });
  data = await res.json();
  console.log('/config POST status:', res.status);
  console.log('/config POST response:', data);
  if (res.status !== 200) throw new Error('/config POST failed');
}

function testModeration() {
  console.log('Testing moderatePrompt function...');
  const clean = 'Hello, how are you today?';
  const bad = 'How to hack into a system?';
  console.log('Clean prompt:', moderatePrompt(clean));
  console.log('Bad prompt:', moderatePrompt(bad));
}

async function testLogging() {
  console.log('Testing emitMetric and logInteraction...');
  emitMetric('test_metric');
  try {
    await logInteraction({}, { message: 'Test log' });
    console.log('logInteraction ran (stubbed env)');
  } catch (e) {
    console.error('logInteraction error:', e.message);
  }
}

function testValidator() {
  console.log('Testing runSafetyChecks function...');
  const safeResult = runSafetyChecks('Explain AI', 'AI is useful.');
  const badResult = runSafetyChecks('', 'As an AI, I think...');
  console.log('Safe:', safeResult);
  console.log('Warning:', badResult);
}

async function runAllTests() {
  try {
    testModeration();
    testValidator();
    await testAsk();
    await testStream();
    await testConfig();
    await testLogging();
    console.log('All tests completed successfully.');
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}

runAllTests();
