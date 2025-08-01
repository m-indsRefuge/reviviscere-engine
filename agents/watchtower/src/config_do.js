export class ConfigDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  #validateConfig(config) {
    const errors = [];
    // --- MODIFIED: Added MODEL_TIMEOUT_MS to the required keys ---
    const requiredKeys = ['modelUrl', 'apiKey', 'promptTemplate', 'PHRASE_WEIGHTS', 'MODEL_TIMEOUT_MS'];

    for (const key of requiredKeys) {
      if (!config.hasOwnProperty(key)) {
        errors.push(`Missing required key: '${key}'.`);
      }
    }
    
    // Return early if any required keys are missing entirely
    if (errors.length > 0) {
        return { isValid: false, error: errors.join(' ') };
    }

    // --- Specific Type Validations ---

    // String validations
    for (const key of ['modelUrl', 'apiKey', 'promptTemplate']) {
        if (typeof config[key] !== 'string' || config[key].trim() === '') {
            errors.push(`'${key}' must be a non-empty string.`);
        }
    }

    // promptTemplate must include placeholder
    if (config.promptTemplate && !config.promptTemplate.includes('{inputText}')) {
      errors.push("The 'promptTemplate' must include the placeholder '{inputText}'.");
    }

    // PHRASE_WEIGHTS object validation
    const weights = config.PHRASE_WEIGHTS;
    if (typeof weights !== 'object' || weights === null || Array.isArray(weights)) {
        errors.push(`'PHRASE_WEIGHTS' must be an object.`);
    } else {
        for (const value of Object.values(weights)) {
            if (typeof value !== 'number') {
                errors.push(`All values in 'PHRASE_WEIGHTS' must be numbers.`);
                break;
            }
        }
    }
    
    // --- NEW: Validation for MODEL_TIMEOUT_MS ---
    if (typeof config.MODEL_TIMEOUT_MS !== 'number' || config.MODEL_TIMEOUT_MS <= 0) {
        errors.push(`'MODEL_TIMEOUT_MS' must be a positive number (in milliseconds).`);
    }

    if (errors.length > 0) {
      return { isValid: false, error: [...new Set(errors)].join(' ') };
    }

    return { isValid: true };
  }

  async fetch(request) {
    // For GET requests, return the currently stored config
    if (request.method === 'GET') {
      const config = await this.state.storage.get('config') || {};
      return new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // For POST requests, validate and then update the config
    if (request.method === 'POST') {
      const authorized = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() === this.env.API_KEY;
      if (!authorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      try {
        const newConfig = await request.json();

        const validation = this.#validateConfig(newConfig);
        if (!validation.isValid) {
          return new Response(JSON.stringify({ error: validation.error }), { status: 400 });
        }

        await this.state.storage.put('config', newConfig);
        return new Response(JSON.stringify({ status: 'success', config: newConfig }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });
  }
}