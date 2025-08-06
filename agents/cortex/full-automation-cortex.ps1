Write-Host "=== Starting Cortex full automation with ngrok Tunnel ==="

# Define port, model, config endpoint, and API Key
$port = 11434
$model = "llama3.2"
$configEndpoint = "https://cortex-agent-worker.nolanaug.workers.dev/config"
$apiKey = "8a1b9c2d3e4f5a6b7c8d9e0f1a2b3c4d"

# === KILL ANY RUNNING PROCESSES AND STOP SERVICE ===
Write-Host "Stopping Ollama service and killing any running processes..."
$serviceName = "Ollama"
$processNames = @("ollama", "ngrok")

# Gracefully stop the Ollama service first
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    try {
        Write-Host "Found and stopping the Ollama service..."
        Stop-Service -Name $serviceName -Force -ErrorAction Stop
        Write-Host "Ollama service stopped."
    } catch {
        Write-Host "WARNING: Failed to stop the Ollama service. It might already be stopped or require admin rights."
    }
}

# Kill any remaining processes by name
Get-Process -Name $processNames -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Killing lingering process: $($_.Name) (ID: $($_.Id))"
    $_ | Stop-Process -Force
}

# Final check for processes holding the port
Start-Sleep -Seconds 2
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        try {
            Stop-Process -Id $procId -Force
            Write-Host ("Killed process ID " + $procId + " holding port " + $port)
        } catch {
            Write-Host ("WARNING: Failed to kill process ID ${procId}: $($_.Exception.Message)")
        }
    }
} else {
    Write-Host "Confirmed that port $port is free."
}

# == START OLLAMA SERVER ===
if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    Write-Host "Starting Ollama server in the background..."
    $env:OLLAMA_HOST = "0.0.0.0:$port"
    Start-Process -FilePath "ollama" -ArgumentList "serve" -NoNewWindow
} else {
    Write-Host "Ollama is already running."
}

# === WAIT FOR OLLAMA TO BE READY ===
Write-Host "Waiting for Ollama API to become available..."
$maxWaitSeconds = 60
$waitTime = 0
$ollamaReady = $false
while ($waitTime -lt $maxWaitSeconds) {
    try {
        Invoke-RestMethod -Uri "http://localhost:$port" -Method GET -TimeoutSec 2
        Write-Host "Ollama API is ready."
        $ollamaReady = $true
        break
    } catch {
        Start-Sleep -Seconds 2
        $waitTime += 2
        Write-Host "." -NoNewline
    }
}
if (-not $ollamaReady) {
    Write-Host "`nOllama server did not start within $maxWaitSeconds seconds. Aborting."
    exit 1
}

# === WARM UP MODEL (Corrected Block) ===
Write-Host ("Warming up model with a real prompt: " + $model)
$warmupPrompt = @"
SYSTEM: You are Cortex, a specialized planning agent.

Your job is to:
1. Understand the user’s request.
2. Write a clear, one-sentence summary of the plan.
3. Provide a list of step-by-step actions in a JSON object, formatted inside a markdown code block.

Your JSON must follow this format:
- The object must contain **one key**: "plan"
- The value must be an **array of strings**, where each string is **one action step**.
- **Do not add numbering or bullet points inside the strings**.

---

USER REQUEST: "Create a 2-step plan to greet a user."

YOUR RESPONSE:
"@

try {
    # CORRECTED: The multi-line hashtable is enclosed in parentheses before being converted to JSON.
    $warmupBody = (@{
        model = $model
        prompt = $warmupPrompt
        stream = $false
        options = @{
            num_ctx = 2048
        }
    } | ConvertTo-Json)
    
    # Send the warm-up prompt to fully load the model and its logic
    $response = Invoke-RestMethod -Uri ("http://localhost:" + $port + "/api/generate") -Method POST -Headers @{ "Content-Type" = "application/json" } -Body $warmupBody
    
    Write-Host ("Model warm-up successful. Response received.")
} catch {
    Write-Host ("Failed to warm up model: " + $_.Exception.Message)
    exit 1
}

# === START NGROK ===
Write-Host ("Starting ngrok HTTP tunnel on port " + $port + "...")
Start-Process -FilePath "ngrok" -ArgumentList ("http " + $port) -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

# === EXTRACT TUNNEL URL ===
$tunnelUrl = ""
try {
    $ngrokApiResponse = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels"
    $tunnelUrl = $ngrokApiResponse.tunnels[0].public_url
    Write-Host ("Extracted tunnel URL: " + $tunnelUrl)
} catch {
    Write-Host ("Failed to extract ngrok tunnel URL: " + $_.Exception.Message)
    exit 1
}

# === UPDATE WRANGLER.TOML ===
if (Test-Path ".\wrangler.toml") {
    Write-Host "Updating wrangler.toml with tunnel URL..."
    $replacement = 'CORTEX_MODEL_URL = "' + $tunnelUrl + '"'
    (Get-Content ".\wrangler.toml") -replace 'CORTEX_MODEL_URL\s*=\s*".*?"', $replacement | Set-Content ".\wrangler.toml"
}

# === DEPLOY TO CLOUDFLARE ===
Write-Host "Deploying Cortex Worker..."
'Y' | wrangler deploy

# === UPDATE CONFIG DO ===
if ($tunnelUrl) {
    Write-Host "Updating CortexDO with full configuration..."
    $payload = @{
        modelUrl = $tunnelUrl
        apiKey   = $apiKey
        promptTemplate = "Based on the user's request, create a step-by-step plan. The plan should be a numbered list inside a JSON object with a single key 'plan'. Request: {inputText}"
        MODEL_TIMEOUT_MS = 180000
    } | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-RestMethod -Uri $configEndpoint -Method POST -Headers @{ "Content-Type"  = "application/json"; "Authorization" = "Bearer $apiKey" } -Body $payload
        Write-Host "`n[CONFIG RESPONSE] " + ($response | ConvertTo-Json -Depth 3) + "`n"
    } catch {
        Write-Host ("Failed to update CortexDO: " + $_.Exception.Message)
    }
}

Write-Host ("=== SYSTEM READY: Cortex is live on model '" + $model + "' via " + $tunnelUrl + " ===")