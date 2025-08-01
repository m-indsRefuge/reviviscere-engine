// regression-test-runner.js

async function runTests() {
  const baseUrl = "https://cortex-agent-worker.nolanaug.workers.dev";

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ FAIL: ${name}`);
      console.error(e);
      failed++;
    }
  }

  async function fetchWithOpts(path, opts) {
    const res = await fetch(baseUrl + path, opts);
    return res;
  }

  await test("GET / (health check)", async () => {
    const res = await fetchWithOpts("/", { method: "GET" });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const text = await res.text();
    if (!text.includes("live")) throw new Error("Unexpected body");
  });

  await test("GET /config (should return modelUrl)", async () => {
    const res = await fetchWithOpts("/config", { method: "GET" });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (!("modelUrl" in json)) throw new Error("Missing modelUrl in response");
  });

  await test("POST /config (set modelUrl)", async () => {
    const testUrl = "http://localhost:11434";
    const res = await fetchWithOpts("/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelUrl: testUrl })
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (!json.message || !json.message.includes(testUrl)) throw new Error("Unexpected response message");
  });

  await test("POST /ask (stream:true returns NDJSON)", async () => {
    const res = await fetchWithOpts("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Stream test", stream: true })
    });

    if (!res.ok) throw new Error(`Expected 200, got ${res.status}`);
    const ctype = res.headers.get("content-type") || "";
    if (!/ndjson|plain/i.test(ctype)) throw new Error(`Expected NDJSON, got ${ctype}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotChunk = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) gotChunk = true;
        } catch {}
      }
    }

    if (!gotChunk) throw new Error("Did not receive any valid streamed response chunks");
  });

  await test("POST /ask (non-stream, enqueues job)", async () => {
    const res = await fetchWithOpts("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello from regression test", stream: false }),
    });

    if (res.status !== 202) throw new Error(`Expected 202, got ${res.status}`);

    const json = await res.json();
    if (!json.jobId) throw new Error("Missing jobId in response");

    const pollUrl = `/ask?id=${json.jobId}`;
    let attempt = 0;
    let jobRes;

    while (attempt++ < 10) {
      const res = await fetchWithOpts(pollUrl, { method: "GET" });
      const pollJson = await res.json();
      if (pollJson.status === "completed") {
        jobRes = pollJson.result;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!jobRes || !jobRes.response) throw new Error("Async job did not complete correctly");
  });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Fatal error during tests:", err);
  process.exit(1);
});
