export class CortexDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;

    if (pathname === '/ask' && method === 'POST') {
      const body = await request.clone().json();
      const stream = body.stream ?? false;
      const sync = body.sync ?? false;

      if (stream === false && sync === true) {
        return this.runJobImmediate(body.prompt);
      }

      return this.enqueueJob(body.prompt);
    }

    if (pathname === '/ask' && method === 'GET') {
      return this.getJobStatus(url);
    }

    if (pathname === '/stream' && method === 'POST') {
      return this.handleStream(request);
    }

    if (pathname === '/config' && method === 'POST') {
      try {
        const data = await request.json();
        if (!data.modelUrl) {
          return new Response('Missing modelUrl in body', { status: 400 });
        }
        await this.state.storage.put('modelUrl', data.modelUrl);
        return new Response(JSON.stringify({ message: `Model URL set to ${data.modelUrl}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response('Invalid JSON body', { status: 400 });
      }
    }

    if (pathname === '/config' && method === 'GET') {
      let modelUrl = await this.state.storage.get('modelUrl');
      if (!modelUrl && this.env.CORTEX_MODEL_URL) {
        modelUrl = this.env.CORTEX_MODEL_URL;
        await this.state.storage.put('modelUrl', modelUrl);
      }

      return new Response(JSON.stringify({ modelUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async enqueueJob(prompt) {
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing or invalid prompt' }), { status: 400 });
    }

    const jobId = crypto.randomUUID();
    const job = { prompt, status: 'pending', result: null };

    await this.state.storage.put(jobId, job);
    this.runJobAsync(jobId, prompt);

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
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(job), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async runJobImmediate(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid prompt' }), { status: 400 });
    }

    try {
      const modelUrl = await this.getModelUrl();

      const response = await fetch(`${modelUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.env.CORTEX_MODEL_NAME || 'phi',
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: errorText }), { status: response.status });
      }

      const result = await response.json();
      return new Response(JSON.stringify({ status: 'success', response: result.response || '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  async runJobAsync(jobId, prompt) {
    try {
      await this.state.storage.put(jobId, { prompt, status: 'processing', result: null });

      const modelUrl = await this.getModelUrl();

      const response = await fetch(`${modelUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.env.CORTEX_MODEL_NAME || 'phi',
          prompt,
          stream: false,
        }),
      });

      const result = response.ok ? await response.json() : { response: `Error: ${response.status}` };

      await this.state.storage.put(jobId, {
        prompt,
        status: response.ok ? 'completed' : 'error',
        result,
      });
    } catch (err) {
      await this.state.storage.put(jobId, {
        prompt,
        status: 'error',
        result: { response: err.message },
      });
    }
  }

  async handleStream(request) {
    try {
      const { prompt } = await request.json();
      if (!prompt) {
        return new Response('Missing prompt', { status: 400 });
      }

      const modelUrl = await this.getModelUrl();

      const response = await fetch(`${modelUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.env.CORTEX_MODEL_NAME || 'phi',
          prompt,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        return new Response(`Model error: ${response.status}`, { status: 502 });
      }

      return new Response(response.body, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    } catch (err) {
      return new Response(`Streaming error: ${err.message}`, { status: 500 });
    }
  }

  async getModelUrl() {
    let modelUrl = await this.state.storage.get('modelUrl');
    if (!modelUrl && this.env.CORTEX_MODEL_URL) {
      modelUrl = this.env.CORTEX_MODEL_URL;
      await this.state.storage.put('modelUrl', modelUrl);
    }
    return modelUrl.replace(/^https?:\/\//i, 'http://').replace(/\/$/, '');
  }
}
