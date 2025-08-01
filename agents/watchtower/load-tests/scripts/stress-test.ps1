# stress-test.ps1
# Usage: Run this script from load-tests/scripts directory
# It reads ../config/scenarios.json and executes the scenarios against Watchtower

param (
    [string]$baseUrl = "https://watchtower-agent-worker.nolanaug.workers.dev"
)

# Load scenarios
$configPath = Join-Path $PSScriptRoot "..\config\scenarios.json"
if (-Not (Test-Path $configPath)) {
    Write-Error "scenarios.json not found at $configPath"
    exit 1
}
$scenariosJson = Get-Content $configPath -Raw | ConvertFrom-Json

function Invoke-ScenarioRequest {
    param (
        [string]$method,
        [string]$url,
        [hashtable]$body = $null
    )

    try {
        if ($method -eq "POST") {
            $response = Invoke-RestMethod -Uri $url -Method POST -Body ($body | ConvertTo-Json -Depth 5) -ContentType 'application/json'
        }
        else {
            $response = Invoke-RestMethod -Uri $url -Method GET
        }
        return @{ success = $true; response = $response }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

foreach ($scenario in $scenariosJson.scenarios) {
    Write-Host "Starting scenario: $($scenario.name)" -ForegroundColor Cyan
    $endTime = (Get-Date).AddSeconds($scenario.durationSeconds)

    $tasks = @()
    for ($i = 1; $i -le $scenario.concurrency; $i++) {
        $tasks += [powershell]::Create().AddScript({
            param($baseUrl, $scenario, $endTime)
            while ((Get-Date) -lt $endTime) {
                $url = $baseUrl.TrimEnd('/') + $scenario.endpoint
                if ($scenario.requestType -eq "GET" -and $scenario.queryParams) {
                    $query = ($scenario.queryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
                    $url += "?" + $query
                }
                $result = Invoke-ScenarioRequest -method $scenario.requestType -url $url -body $scenario.payload
                if ($result.success) {
                    Write-Host "[SUCCESS][$($scenario.name)] $($scenario.requestType) $url" -ForegroundColor Green
                } else {
                    Write-Host "[FAILURE][$($scenario.name)] $($scenario.requestType) $url : $($result.error)" -ForegroundColor Red
                }
                Start-Sleep -Milliseconds $scenario.requestIntervalMs
            }
        }).AddArgument($baseUrl).AddArgument($scenario).AddArgument($endTime)
    }

    # Start all tasks in parallel
    $jobs = @()
    foreach ($task in $tasks) {
        $jobs += $task.BeginInvoke()
    }

    # Wait for all to complete
    foreach ($job in $jobs) {
        $job.AsyncWaitHandle.WaitOne()
    }

    Write-Host "Completed scenario: $($scenario.name)" -ForegroundColor Cyan
}

Write-Host "All scenarios completed."
