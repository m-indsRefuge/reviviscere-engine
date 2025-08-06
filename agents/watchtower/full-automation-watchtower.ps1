# === PATCHED: Watchtower Full Automation Script (for new Ollama versions) ===

Write-Host "=== Starting Watchtower full automation with ngrok Tunnel ==="

# Define port, model, config endpoint, and API Key
$port = 11434
$model = "gemma:2b"
$configEndpoint = "https://watchtower-agent-worker.nolanaug.workers.dev/config"
$apiKey = "4f7e2d3a9b5f4c78a1d6e9f023b5c412"

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

# === START OLLAMA SERVER (NEW METHOD) ===
if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    Write-Host "Starting Ollama server in the background..."
    $env:OLLAMA_HOST = "0.0.0.0:$port"
    # --- MODIFIED: Use 'ollama serve' to start the background server ---
    Start-Process -FilePath "ollama" -ArgumentList "serve" -NoNewWindow
} else {
    Write-Host "Ollama is already running."
}

# === WAIT FOR OLLAMA TO BE READY (NEW RESILIENT LOOP) ===
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


# === WARM UP MODEL ===
# ... (This section remains the same, but should now succeed) ...
Write-Host ("Warming up model: " + $model)
try {
    $response = Invoke-RestMethod -Uri ("http://localhost:" + $port + "/api/generate") `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body (@{
            model = $model
            prompt = "ping"
            stream = $false
        } | ConvertTo-Json -Depth 3)

    Write-Host ("Model responded: " + $response.response)
} catch {
    Write-Host ("Failed to warm up model: " + $_.Exception.Message)
    exit 1
}


# === START NGROK, DEPLOY, AND CONFIGURE ===
# ... (The rest of the script remains the same) ...
Write-Host ("Starting ngrok HTTP tunnel on port " + $port + "...")
$ngrokProcess = Start-Process -FilePath "ngrok" -ArgumentList ("http " + $port) -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

$tunnelUrl = ""
try {
    $ngrokApiResponse = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels"
    $tunnelUrl = $ngrokApiResponse.tunnels[0].public_url
    Write-Host ("Extracted tunnel URL: " + $tunnelUrl)
} catch {
    Write-Host ("Failed to extract ngrok tunnel URL: " + $_.Exception.Message)
    exit 1
}

if (Test-Path ".\wrangler.toml") {
    Write-Host "Updating wrangler.toml with tunnel URL..."
    $replacement = 'WATCHTOWER_MODEL_URL = "' + $tunnelUrl + '"'
    (Get-Content ".\wrangler.toml") `
      -replace 'WATCHTOWER_MODEL_URL\s*=\s*".*?"', $replacement |
      Set-Content ".\wrangler.toml"
}

Write-Host "Deploying Watchtower Worker..."
wrangler deploy

if ($tunnelUrl -and $apiKey) {
    Write-Host "Updating ConfigDO with new, full configuration schema..."
    $payload = @{
        modelUrl = $tunnelUrl
        apiKey   = $apiKey
        promptTemplate = "Is the following text logically sound and ethically neutral? Respond with only a JSON object with keys 'verdict' (pass/fail) and 'reason'. Text: {inputText}"
        PHRASE_WEIGHTS = @{
            "as an ai" = 5; "i cannot provide" = 5; "as a language model" = 5; "it's possible that" = 3; "based on my training data" = 3
        }
        MODEL_TIMEOUT_MS = 60000
    } | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-RestMethod -Uri $configEndpoint -Method POST -Headers @{ "Content-Type"  = "application/json"; "Authorization" = "Bearer $apiKey" } -Body $payload
        Write-Host "`n[CONFIG RESPONSE] " + ($response | ConvertTo-Json -Depth 3) + "`n"
    } catch {
        Write-Host ("Failed to update ConfigDO: " + $_.Exception.Message)
    }
}

Write-Host ("=== SYSTEM READY: Watchtower is live on model '" + $model + "' via " + $tunnelUrl + " ===")
