// --- Helper function for Input Normalization ---
function normalizeInput(input) {
  return input.toLowerCase().replace(/(.)\1+/g, '$1');
}

// --- Helper function for Fuzzy Matching (Levenshtein Distance) ---
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
  for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

// --- Main Moderation Function ---
export function moderatePrompt(prompt) {
  const issues = [];
  const normalizedPrompt = normalizeInput(prompt);
  const promptWords = normalizedPrompt.split(/\s+/);

  const profanityList = ["fuck", "shit", "damn", "bitch", "asshole", "cunt", "dick", "pussy", "crap", "faggot", "nigger"];
  const blacklist = [
    "how to build a virus",
    "take down systems",
    "hack into",
    "steal passwords",
    "make a bomb",
    "explosives instructions",
    "terrorist attack",
  ];

  // 1. Fuzzy check for single-word profanity
  for (const word of promptWords) {
    for (const profaneWord of profanityList) {
      if (levenshteinDistance(word, profaneWord) <= 1) {
        issues.push(`Potential profanity detected near: "${word}"`);
        break;
      }
    }
  }

  // 2. Check for blacklisted phrases (now with more robust fuzzy matching)
  for (const phrase of blacklist) {
    // Fast path: check for exact match first
    if (normalizedPrompt.includes(phrase)) {
      issues.push(`Blacklisted phrase detected: "${phrase}"`);
      continue;
    }

    // Slow path: fuzzy check for phrases with typos
    const phraseWords = phrase.split(' ');
    let allWordsFoundFuzzily = true;
    for (const phraseWord of phraseWords) {
      let foundMatchForWord = false;
      for (const promptWord of promptWords) {
        // Allow for a single typo in each word of the phrase
        if (levenshteinDistance(promptWord, phraseWord) <= 1) {
          foundMatchForWord = true;
          break;
        }
      }
      if (!foundMatchForWord) {
        allWordsFoundFuzzily = false;
        break;
      }
    }

    if (allWordsFoundFuzzily) {
      issues.push(`Potential blacklisted phrase detected: "${phrase}"`);
    }
  }

  const uniqueIssues = [...new Set(issues)];

  return {
    status: uniqueIssues.length > 0 ? "FAIL" : "PASS",
    issues: uniqueIssues,
    timestamp: new Date().toISOString(),
  };
}
