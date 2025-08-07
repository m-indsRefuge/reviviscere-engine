import { logInteraction } from './logging.js';
import { emitMetric } from './metrics.js';
import { fetchWithRetry } from './fetch.js';

export class WatchtowerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async #getValidationVerdict(inputText, traceId) {
    const OLLAMA_ENDPOINT = this.env.WATCHTOWER_MODEL_URL;
    if (!OLLAMA_ENDPOINT) {
      await this.#log('CONFIG_ERROR', 'WATCHTOWER_MODEL_URL is not configured', traceId);
      return { verdict: 'fail', reason: 'WATCHTOWER_MODEL_URL is not configured in the environment.' };
    }

    let timeoutMs = 60000;
    let promptTemplate = `Is the following text logically sound and ethically neutral? Respond with only a JSON object with keys "verdict" (pass/fail) and "reason". Text: "{inputText}"`;

    try {
        const configStub = this.env.CONFIG_DO.get(this.env.CONFIG_DO.idFromName('config'));
        const configRes = await configStub.fetch(new Request('https://config/config'));
        if (configRes.ok) {
            const config = await configRes.json();
            timeoutMs = config.MODEL_TIMEOUT_MS || timeoutMs;
            promptTemplate = config.promptTemplate || promptTemplate;
        }
    } catch (e) {
        await this.#log('CONFIG_FETCH_FAIL', `Could not fetch live config: ${e.message}`, traceId);
    }

    const MODEL_NAME = 'gemma:2b';
    const prompt = promptTemplate.replace('{inputText}', inputText);
    let response; // Declare response here to access it in the catch block

    try {
      response = await fetchWithRetry(
        `${OLLAMA_ENDPOINT}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL_NAME, prompt: prompt, stream: false }),
        },
        1, timeoutMs, this.env, traceId
      );

      if (!response.ok) {
        const errorText = await response.text();
        await this.#log('VALIDATION_MODEL_ERROR', `Ollama API error: ${response.status} ${errorText}`, traceId);
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return JSON.parse(data.response);
    } catch (error) {
      // +++ NEW: Detailed logging for debugging +++
      let responseBody = '[Could not read response body]';
      if (response) {
          try {
              responseBody = await response.text();
          } catch {}
      }
      await this.#log('VALIDATION_FETCH_FAIL', `Error: ${error.message}. Response Body: ${responseBody.substring(0, 500)}`, traceId);
      return { verdict: 'fail', reason: `Failed to get verdict from validation model: ${error.message}` };
    }
  }

  // ... rest of the file is unchanged ...
  async #log(tag, msg, traceId) {
    const loggerStub = this.env.LOGGER_DO.get(this.env.LOGGER_DO.idFromName('main'));
    try {
      await loggerStub.fetch('https://watchtower-agent-worker.nolanaug.workers.dev/logs', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            agent: 'WatchtowerDO',
            level: tag.includes('FAIL') || tag.includes('ERROR') ? 'ERROR' : 'INFO',
            message: msg,
            traceId: traceId
        }),
      });
    } catch (e) {
        console.error("Failed to write to LoggerDO", e.message);
    }
  }

  async fetch(request) {
    const traceId = request.headers.get('X-Trace-Id') || crypto.randomUUID();
    const startTime = Date.now();
    try {
      const body = await request.clone().json();
      const { prompt: textToValidate } = body;
      if (typeof textToValidate !== 'string' || textToValidate.trim().length === 0) {
        await this.#log('PROMPT_VALIDATION', 'Prompt missing', traceId);
        return new Response(JSON.stringify({ status: 'error', error: 'Prompt is required' }), { status: 400 });
      }
      await this.#log('VALIDATION_START', `Starting validation for prompt.`, traceId);
      const result = await this.#getValidationVerdict(textToValidate, traceId);
      const duration = Date.now() - startTime;
      if (result.verdict === 'fail') {
          await this.#log('VALIDATION_FAIL', `Validation failed: ${result.reason}`, traceId);
      } else {
          await this.#log('VALIDATION_SUCCESS', `Validation passed.`, traceId);
      }
      await emitMetric('request_ok', { env: this.env, traceId });
      return new Response(JSON.stringify({
        status: 'success',
        ...result,
        duration_ms: duration,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const msg = err?.message || 'Unknown error';
      await this.#log('UNHANDLED_EXCEPTION', msg, traceId);
      return new Response(JSON.stringify({ status: 'error', error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
