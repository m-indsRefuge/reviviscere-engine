# metrics-fetcher.ps1
# Fetch all "metrics:*" KV entries from WATCHTOWER_METRICS namespace using a scoped API token

param (
    [string]$accountId = "eaf222560683a3733091c68032405220",
    [string]$namespaceId = "4390293a699345298ad5fed03ef30602",
    [string]$apiToken = "cPASWcSnrO59ii0rUzuad-RvDqemYJY4czRjzjZk",
    [string]$outputFile = "../logs/session-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').json"
)

# Setup Cloudflare API headers
$headers = @{
    Authorization = "Bearer $apiToken"
    "Content-Type" = "application/json"
}

$metrics = @()
$cursor = $null

do {
    $url = "https://api.cloudflare.com/client/v4/accounts/$accountId/storage/kv/namespaces/$namespaceId/keys?limit=1000"
    if ($cursor) {
        $url += "&cursor=$cursor"
    }

    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method GET
    } catch {
        Write-Error "❌ Failed to fetch key list: $_"
        exit 1
    }

    if (-not $response.success) {
        Write-Error "❌ Cloudflare responded with error: $($response.errors | ConvertTo-Json -Depth 5)"
        exit 1
    }

    foreach ($key in $response.result) {
        if ($key.name -like "metrics:*") {
            $valueUrl = "https://api.cloudflare.com/client/v4/accounts/$accountId/storage/kv/namespaces/$namespaceId/values/$($key.name)"
            try {
                $value = Invoke-RestMethod -Uri $valueUrl -Headers $headers -Method GET
                $metrics += [pscustomobject]@{
                    Key = $key.name
                    Value = $value
                }
            } catch {
                Write-Warning "⚠️ Could not retrieve value for $($key.name): $_"
            }
        }
    }

    $cursor = $response.result_info.cursor
} while ($cursor)

# Save to file
$metrics | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputFile -Encoding UTF8
Write-Host "✅ Fetched $($metrics.Count) metric entries. Saved to $outputFile"
