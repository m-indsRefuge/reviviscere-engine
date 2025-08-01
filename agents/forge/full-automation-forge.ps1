Write-Output "Starting Forge full automation..."

# 1. Start Ollama model server for Forge
Write-Output "Starting Ollama model server for Forge (codellama)..."
$ollamaProcess = Start-Process -FilePath "ollama" -ArgumentList "run codellama:7b-instruct-q4_K_M" -NoNewWindow -PassThru

Start-Sleep -Seconds 10  # Wait for Ollama to initialize

# 2. Start ngrok if not already running
$ngrokRunning = Get-Process -Name "ngrok" -ErrorAction SilentlyContinue
if (-not $ngrokRunning) {
    Write-Output "Starting ngrok tunnel on port 11434..."
    Start-Process -FilePath "ngrok" -ArgumentList "http 11434" -WindowStyle Hidden
    Start-Sleep -Seconds 5
} else {
    Write-Output "ngrok is already running."
}

# 3. Fetch ngrok public URL
$maxRetries = 10
$publicUrl = $null
for ($i = 0; $i -lt $maxRetries; $i++) {
    try {
        $response = Invoke-RestMethod -Uri http://localhost:4040/api/tunnels
        if ($response.tunnels.Count -gt 0) {
            $publicUrl = $response.tunnels[0].public_url
            Write-Output "ngrok public URL found: $publicUrl"
            break
        }
    } catch {
        Write-Output "Waiting for ngrok API..."
        Start-Sleep -Seconds 2
    }
}

if (-not $publicUrl) {
    Write-Error "Could not retrieve ngrok public URL."
    if ($ollamaProcess) {
        $ollamaProcess | Stop-Process
    }
    exit 1
}

# 4. Update wrangler.toml with dynamic FORGE_MODEL_URL
$wranglerTomlPath = "C:\Users\Nolan\reviviscere-n3rv-engine\agents\forge\wrangler.toml"
$wranglerContent = Get-Content $wranglerTomlPath -Raw

if ($wranglerContent -match 'FORGE_MODEL_URL\s*=\s*".*"') {
    $newContent = $wranglerContent -replace 'FORGE_MODEL_URL\s*=\s*".*"', "FORGE_MODEL_URL = `"$publicUrl`""
} else {
    if ($wranglerContent -match '\[vars\]') {
        $newContent = $wranglerContent -replace '(\[vars\])', "`$1`nFORGE_MODEL_URL = `"$publicUrl`""
    } else {
        $newContent = $wranglerContent + "`n[vars]`nFORGE_MODEL_URL = `"$publicUrl`""
    }
}

$newContent | Set-Content $wranglerTomlPath
Write-Output "Updated Forge wrangler.toml with new FORGE_MODEL_URL."

# 5. Deploy to Cloudflare
Write-Output "Deploying Forge Worker..."
Invoke-Expression "wrangler deploy --cwd C:\Users\Nolan\reviviscere-n3rv-engine\agents\forge"
Write-Output "✅ Forge deployment complete."
