$baseUrl = "https://watchtower-agent-worker.nolanaug.workers.dev"

Write-Host "Testing GET /config..."
try {
    $responseGet = Invoke-RestMethod -Uri "$baseUrl/config" -Method GET
    Write-Host "GET /config succeeded. Model URL: $($responseGet.modelUrl)"
} catch {
    Write-Host "GET /config failed:"
    Write-Host $_.Exception.Message
}

Write-Host "`nTesting POST /config with valid modelUrl..."
$bodyValid = @{ modelUrl = "http://test-model-url.com" } | ConvertTo-Json
try {
    $responsePostValid = Invoke-RestMethod -Uri "$baseUrl/config" -Method POST -Body $bodyValid -ContentType "application/json"
    Write-Host "POST /config succeeded: $($responsePostValid.message)"
} catch {
    Write-Host "POST /config failed:"
    Write-Host $_.Exception.Message
}

Write-Host "`nTesting POST /config with invalid modelUrl (empty string)..."
$bodyInvalid = @{ modelUrl = "" } | ConvertTo-Json

try {
    $responsePostInvalid = Invoke-RestMethod -Uri "$baseUrl/config" -Method POST -Body $bodyInvalid -ContentType "application/json"
    Write-Host "POST /config unexpected success:"
    Write-Host ($responsePostInvalid | ConvertTo-Json)
} catch {
    $errorResponse = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($errorResponse)
    $responseBody = $reader.ReadToEnd() | ConvertFrom-Json
    Write-Host "POST /config failed as expected with error:"
    Write-Host ($responseBody.error | ConvertTo-Json)
}
