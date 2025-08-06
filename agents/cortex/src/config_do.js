// src/config_do.js
export class ConfigDO {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method === 'POST') {
      const data = await request.json();
      await this.state.storage.put('config', data);
      return new Response(JSON.stringify({ message: `Cortex config updated.` }), { status: 200 });
    }
    if (request.method === 'GET') {
      const config = await this.state.storage.get('config') || {};
      return new Response(JSON.stringify(config), { status: 200 });
    }
    return new Response('Method Not Allowed', { status: 405 });
  }
}