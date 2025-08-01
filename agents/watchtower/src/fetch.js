// fetch.js

const CIRCUIT_BREAKER_THRESHOLD = 5; // Failures before circuit opens
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 1000; // 1 min cooldown before trying again

class CircuitBreaker {
  constructor() {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  canRequest() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > CIRCUIT_BREAKER_COOLDOWN_MS) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
      this.state = 'OPEN';
    }
  }
}

const circuitBreaker = new CircuitBreaker();

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Exponential backoff with jitter
function backoffDelay(attempt) {
  const baseDelay = 500; // ms
  const maxDelay = 10000; // ms
  const delay = Math.min(maxDelay, baseDelay * 2 ** attempt);
  // Jitter: +/- 50%
  return delay / 2 + Math.random() * delay / 2;
}

/**
 * Retry wrapper for fetch with backoff and circuit breaker.
 * Retries on network errors and HTTP 429, 503 status codes.
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, timeoutMs = 30000, env = null, traceId = null) {
  if (!circuitBreaker.canRequest()) {
    const msg = 'Circuit breaker is OPEN — request blocked';
    if (env) env && env.WATCHTOWER_METRICS?.put(`metrics:circuit_breaker`, JSON.stringify({
      traceId,
      status: 'circuit_open',
      timestamp: Date.now()
    }));
    throw new Error(msg);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);

      // Retryable HTTP statuses
      if ([429, 503].includes(resp.status)) {
        if (attempt === maxRetries) {
          circuitBreaker.recordFailure();
          return resp; // last try, return response as is
        }
        await wait(backoffDelay(attempt));
        continue;
      }

      // Success - reset failure count
      circuitBreaker.recordSuccess();
      return resp;

    } catch (err) {
      if (err.name === 'AbortError') {
        // Treat timeout as transient failure
        if (attempt === maxRetries) {
          circuitBreaker.recordFailure();
          throw err;
        }
        await wait(backoffDelay(attempt));
        continue;
      }

      // Network errors and other fetch errors are retried
      if (attempt === maxRetries) {
        circuitBreaker.recordFailure();
        throw err;
      }

      await wait(backoffDelay(attempt));
    }
  }
}
