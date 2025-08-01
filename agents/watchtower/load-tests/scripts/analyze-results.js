// analyze-results.js
// Usage: node analyze-results.js ../logs/session-2025-07-10_XX-XX-XX.json

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error('Usage: node analyze-results.js <metrics_json_file>');
  process.exit(1);
}

const filePath = process.argv[2];
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const rawData = fs.readFileSync(filePath, 'utf-8');
const metrics = JSON.parse(rawData);

if (!Array.isArray(metrics)) {
  console.error('Invalid metrics format, expected an array');
  process.exit(1);
}

let totalJobs = 0;
let completedJobs = 0;
let erroredJobs = 0;
let totalDuration = 0;
let durations = [];
let promptTokensSum = 0;
let outputTokensSum = 0;

metrics.forEach(entry => {
  try {
    const value = typeof entry.Value === 'string' ? JSON.parse(entry.Value) : entry.Value;
    totalJobs++;
    if (value.status === 'completed') {
      completedJobs++;
      const durMs = value.durationMs || 0;
      totalDuration += durMs;
      durations.push(durMs);
      promptTokensSum += value.promptTokens || 0;
      outputTokensSum += value.outputTokens || 0;
    } else if (value.status === 'error') {
      erroredJobs++;
    }
  } catch (e) {
    console.warn(`Skipping invalid entry for key ${entry.Key}`);
  }
});

const avgDuration = totalDuration / completedJobs || 0;
const minDuration = Math.min(...durations);
const maxDuration = Math.max(...durations);

console.log('=== Watchtower Metrics Summary ===');
console.log(`Total Jobs:         ${totalJobs}`);
console.log(`Completed Jobs:     ${completedJobs}`);
console.log(`Errored Jobs:       ${erroredJobs}`);
console.log(`Average Duration:   ${avgDuration.toFixed(2)} ms`);
console.log(`Min Duration:       ${minDuration.toFixed(2)} ms`);
console.log(`Max Duration:       ${maxDuration.toFixed(2)} ms`);
console.log(`Total Prompt Tokens:${promptTokensSum}`);
console.log(`Total Output Tokens:${outputTokensSum}`);

const throughput = completedJobs / (totalDuration / 1000); // jobs per second
console.log(`Throughput:         ${throughput.toFixed(2)} jobs/sec`);
