// --- NLP & Math Helper Functions for Cosine Similarity ---
function tokenize(text) { return text.toLowerCase().match(/\b\w+\b/g) || []; }
function createVector(tokens) {
  const vector = new Map();
  for (const token of tokens) { vector.set(token, (vector.get(token) || 0) + 1); }
  return vector;
}
function cosineSimilarity(vecA, vecB) {
  const intersection = new Set([...vecA.keys()].filter(x => vecB.has(x)));
  let dotProduct = 0;
  for (const token of intersection) { dotProduct += vecA.get(token) * vecB.get(token); }
  const magA = Math.sqrt([...vecA.values()].reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt([...vecB.values()].reduce((sum, val) => sum + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

// --- Main Validator Function ---
export async function runSafetyChecks(prompt, response, env) {
  const issues = [];
  let score = 0;
  // +++ CORRECTED: Declare similarity at the top-level scope +++
  let similarity = 0;

  // --- 1. Fetch configuration from Durable Object ---
  let phraseWeights = {};
  try {
    const configStub = env.CONFIG_DO.get(env.CONFIG_DO.idFromName('config'));
    const configRes = await configStub.fetch('https://config/config');
    if (configRes.ok) {
      const config = await configRes.json();
      phraseWeights = config.PHRASE_WEIGHTS || {};
    }
  } catch (e) {
    console.error("Failed to fetch PHRASE_WEIGHTS from ConfigDO:", e.message);
  }

  // --- 2. Basic Checks ---
  if (!prompt || prompt.trim().length === 0) {
    issues.push("Empty prompt detected.");
    score += 5;
  }

  if (!response || response.trim().length === 0) {
    issues.push("Empty response detected.");
    score += 5;
  } else {
    const normalized = response.toLowerCase();

    // --- 3. Check against phrase weights from config ---
    for (const [phrase, weight] of Object.entries(phraseWeights)) {
      if (normalized.includes(phrase.toLowerCase())) {
        issues.push(`Detected phrase: "${phrase}" (weight: ${weight})`);
        score += weight;
      }
    }

    // --- 4. Cosine Similarity Check for Drift/Parroting ---
    const promptTokens = tokenize(prompt);
    const responseTokens = tokenize(response);
    similarity = cosineSimilarity(createVector(promptTokens), createVector(responseTokens));

    if (similarity > 0.9 && promptTokens.length > 5) {
      issues.push(`High prompt similarity detected (score: ${similarity.toFixed(2)}), may be parroting.`);
      score += 2;
    } else if (similarity < 0.2 && promptTokens.length > 5) {
      issues.push(`Low prompt similarity detected (score: ${similarity.toFixed(2)}), may be topic drift.`);
      score += 3;
    }

    // --- 5. Additional Heuristics ---
    if (normalized.includes("according to some sources") && !normalized.includes("reliable source")) {
      issues.push("Unsubstantiated claim without reliable attribution.");
      score += 4;
    }
  }

  // --- 6. Determine final status ---
  let status;
  if (score >= 7) { status = "FAIL"; }
  else if (score >= 3) { status = "WARN"; }
  else { status = "PASS"; }

  return {
    status,
    score,
    similarity: similarity.toFixed(4),
    issues,
    timestamp: new Date().toISOString(),
  };
}
