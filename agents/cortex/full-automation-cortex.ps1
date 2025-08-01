Write-Host "=== Starting Cortex full automation with ngrok Tunnel ==="

# Define port and model
$port = 11434
$model = "phi"

# === KILL ANY RUNNING PROCESSES ===
Write-Host "Killing any running Ollama, ngrok, and phi processes..."
Get-Process -Name "ollama" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Killing Ollama process ID $($_.Id)"
    $_ | Stop-Process -Force
}
Get-Process -Name "ngrok" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Killing ngrok process ID $($_.Id)"
    $_ | Stop-Process -Force
}
# If you have a specific phi process, add here similarly
# Example:
# Get-Process -Name "phi" -ErrorAction SilentlyContinue | ForEach-Object {
#     Write-Host "Killing phi process ID $($_.Id)"
#     $_ | Stop-Process -Force
# }

Start-Sleep -Seconds 2

# === KILL PROCESSES USING THE PORT ===
Write-Host "Checking for processes using port $port..."
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        try {
            Stop-Process -Id $procId -Force
            Write-Host ("Killed process ID " + $procId + " holding port " + $port)
        } catch {
            Write-Host ("WARNING: Failed to kill process ID " + $procId + ": " + $_.Exception.Message)
        }
    }
} else {
    Write-Host "No process found using port " + $port + "."
}

# === START OLLAMA RUN MODEL WITH CORRECT ENV ===
if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    Write-Host ("Starting Ollama run model '" + $model + "' on 0.0.0.0:" + $port + "...")
    # Set environment variable for this session only
    $env:OLLAMA_HOST = "0.0.0.0:$port"
    Start-Process -FilePath "ollama" -ArgumentList "run $model" -NoNewWindow
    Start-Sleep -Seconds 5
} else {
    Write-Host "Ollama is already running."
}

# === WARM UP MODEL ===
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

# === START NGROK ===
Write-Host ("Starting ngrok HTTP tunnel on port " + $port + "...")
$ngrokProcess = Start-Process -FilePath "ngrok" -ArgumentList ("http " + $port) -PassThru -WindowStyle Hidden
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

# === UPDATE wrangler.toml ===
if (Test-Path ".\wrangler.toml") {
    Write-Host "Updating wrangler.toml with tunnel URL..."
    $replacement = 'CORTEX_MODEL_URL = "' + $tunnelUrl + '"'
    (Get-Content ".\wrangler.toml") `
      -replace 'CORTEX_MODEL_URL\s*=\s*".*?"', $replacement |
      Set-Content ".\wrangler.toml"

    Start-Sleep -Seconds 2
    Write-Host "Verifying wrangler.toml model URL entry:"
    (Get-Content ".\wrangler.toml" | Select-String "CORTEX_MODEL_URL") | ForEach-Object {
        Write-Host $_.Line
    }
    Write-Host "wrangler.toml updated successfully."
} else {
    Write-Host "wrangler.toml not found. Skipping update."
}

# === DEPLOY TO CLOUDFLARE ===
Write-Host "Deploying Cortex Worker..."
wrangler deploy

# === UPDATE CONFIG DO ===
if ($tunnelUrl -ne "") {
    Write-Host "Updating ConfigDO with model URL..."
    $payload = @{ modelUrl = $tunnelUrl } | ConvertTo-Json -Depth 3
    Write-Host ("Sending payload to /config: " + $payload)

    try {
        $response = Invoke-RestMethod -Uri "https://cortex-agent-worker.nolanaug.workers.dev/config" `
            -Method POST `
            -Headers @{ "Content-Type" = "application/json" } `
            -Body $payload

        Write-Host "`n" + $response.message + "`n"
    } catch {
        Write-Host ("Failed to update ConfigDO: " + $_.Exception.Message)
    }
} else {
    Write-Host "Tunnel URL is empty. Skipping ConfigDO update."
}

Write-Host ("=== SYSTEM READY: Cortex is live on model '" + $model + "' via " + $tunnelUrl + " ===")
