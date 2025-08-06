import { logToD1 } from './logging.js';
import { emitMetric } from '../metrics/metrics.js';

export class CortexDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async #getConfig() {
    try {
      const configStub = this.env.CONFIG_DO.get(this.env.CONFIG_DO.idFromName("singleton"));
      const response = await configStub.fetch("https://config/config");
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error(`CortexDO failed to fetch config: ${e.message}`);
    }
    return {
      modelUrl: this.env.CORTEX_MODEL_URL,
      promptTemplate: `User Request: "{inputText}"`
    };
  }

  createPrompt(inputText) {
    return `SYSTEM: You are Cortex, a specialized planning agent.

Your job is to:
1. Understand the users request.
2. Write a clear, one-sentence summary of the plan.
3. Provide a list of step-by-step actions in a JSON object, formatted inside a markdown code block.

Your JSON must follow this format:
- The object must contain **one key**: "plan"
- The value must be an **array of strings**, where each string is **one action step**.
- **Do not add numbering or bullet points inside the strings**.

---

EXAMPLE:
USER REQUEST: Create a Python script that reads a CSV file and finds the average value in the "age" column.

YOUR RESPONSE:
This plan outlines the steps to create a Python script that computes the average of the "age" column from a CSV file.

Here is the plan in JSON format:
\`\`\`json
{
  "plan": [
    "Import the pandas library.",
    "Create a function that takes a file path as input.",
    "Use pandas.read_csv() to load the CSV file.",
    "Extract the 'age' column from the DataFrame.",
    "Call .mean() on the 'age' column to get the average.",
    "Return or print the result.",
    "Add error handling for file loading and missing column."
  ]
}
\`\`\`

---

USER REQUEST: "${inputText}"

YOUR RESPONSE:
`;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;
    
    if (pathname === '/ask' && method === 'POST') {
      const body = await request.clone().json();
      if (body.sync === true) {
        return this.runJobImmediate(body.prompt);
      }
      return this.enqueueJob(body.prompt);
    }

    if (pathname === '/ask' && method === 'GET') {
      return this.getJobStatus(url);
    }

    return new Response('Not Found', { status: 404 });
  }

  async runJobImmediate(prompt) {
    const traceId = crypto.randomUUID();
    await logToD1(this.env, 'Cortex', 'INFO', `Received synchronous prompt for planning.`, traceId, { prompt });
    return this.generatePlan(prompt, traceId);
  }

  async generatePlan(prompt, traceId) {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] [${traceId}] generatePlan started.`);

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid prompt' }), { status: 400 });
    }

    try {
      const config = await this.#getConfig();
      const modelUrl = config.modelUrl;
      const cortexPrompt = this.createPrompt(prompt);

      if (!modelUrl) {
          throw new Error("Model URL is not configured.");
      }
      
      console.log(`[${new Date().toISOString()}] [${traceId}] Sending request to Ollama at ${modelUrl}...`);
      
      const response = await fetch(`${modelUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.env.CORTEX_MODEL_NAME || 'llama3.2', // Updated fallback model name
          prompt: cortexPrompt,
          stream: false,
          options: {
            num_ctx: 2048,
            num_predict: 512
          }
        }),
      });

      console.log(`[${new Date().toISOString()}] [${traceId}] Received response from Ollama. Status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${new Date().toISOString()}] [${traceId}] Ollama API Error: ${errorText}`);
        await logToD1(this.env, 'Cortex', 'ERROR', `Model API error: ${response.status}`, traceId, { error: errorText });
        await emitMetric('model_error', { env: this.env, traceId, data: { status: response.status, prompt } });
        return new Response(JSON.stringify({ error: `Model API Error: ${errorText}` }), { status: response.status });
      }

      const result = await response.json();
      console.log(`[${new Date().toISOString()}] [${traceId}] Parsing Ollama JSON response...`);
      
      try {
        const rawResponse = result.response;
        const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);

        if (!jsonMatch || !jsonMatch[1]) {
          throw new Error("No valid JSON code block found in the model's response.");
        }
        
        const extractedJson = jsonMatch[1];
        const planJson = JSON.parse(extractedJson);
        const duration = Date.now() - startTime;
        
        console.log(`[${new Date().toISOString()}] [${traceId}] Successfully parsed plan. Total duration: ${duration}ms.`);
        await logToD1(this.env, 'Cortex', 'INFO', 'Successfully generated plan.', traceId, { plan: planJson.plan });
        await emitMetric('plan_generated_success', { env: this.env, traceId, data: { duration, prompt } });
        
        return new Response(JSON.stringify({ status: 'success', plan: planJson.plan || [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] [${traceId}] Failed to parse JSON from model response. Error: ${parseError.message}`);
        await logToD1(this.env, 'Cortex', 'ERROR', 'Failed to parse plan from model response.', traceId, { rawResponse: result.response, error: parseError.message });
        await emitMetric('plan_parse_error', { env: this.env, traceId, data: { prompt, rawResponse: result.response } });
        return new Response(JSON.stringify({ 
            status: 'error', 
            error: 'Failed to parse the plan from the model response.',
            rawResponse: result.response 
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

    } catch (err) {
      console.error(`[${new Date().toISOString()}] [${traceId}] Unhandled exception in generatePlan: ${err.message}`);
      await logToD1(this.env, 'Cortex', 'ERROR', `An unexpected error occurred: ${err.message}`, traceId);
      await emitMetric('unhandled_exception', { env: this.env, traceId, data: { error: err.message, prompt } });
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  async enqueueJob(prompt) {
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing or invalid prompt' }), { status: 400 });
    }
    const jobId = crypto.randomUUID();
    const traceId = crypto.randomUUID();
    const job = { prompt, status: 'pending', result: null, traceId };
    await this.state.storage.put(jobId, job);
    await logToD1(this.env, 'Cortex', 'INFO', `Enqueued new planning job.`, traceId, { prompt, jobId });
    this.state.waitUntil(this.runJobAsync(jobId, prompt, traceId));
    return new Response(JSON.stringify({ jobId }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getJobStatus(url) {
    const jobId = url.searchParams.get('id');
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'Missing job ID' }), { status: 400 });
    }
    const job = await this.state.storage.get(jobId);
    return job
      ? new Response(JSON.stringify(job), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
  }

  async runJobAsync(jobId, prompt, traceId) {
    try {
      await this.state.storage.put(jobId, { prompt, status: 'processing', result: null, traceId });
      const planResponse = await this.generatePlan(prompt, traceId);
      const status = planResponse.ok ? 'completed' : 'error';
      const result = await planResponse.json();
      if(planResponse.ok) {
        await logToD1(this.env, 'Cortex', 'INFO', 'Async job completed successfully.', traceId, { jobId });
      } else {
        await logToD1(this.env, 'Cortex', 'ERROR', `Async job failed.`, traceId, { jobId, error: result });
      }
      await this.state.storage.put(jobId, { prompt, status, result, traceId });
    } catch (err) {
      await logToD1(this.env, 'CORTEX', 'ERROR', `Async job exception: ${err.message}`, traceId, { jobId });
      await this.state.storage.put(jobId, { prompt, status: 'error', result: { error: err.message }, traceId });
    }
  }
}