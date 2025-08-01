$localUrl = "http://127.0.0.1:8787"
$prompt = "Hello Cortex, test prompt"
$MaxRetries = 10
$DelaySeconds = 2

Write-Output "=== Starting local test of Cortex worker ==="

# Enqueue job
$body = @{ prompt = $prompt } | ConvertTo-Json
Write-Output "Sending prompt to /ask..."
$response = Invoke-RestMethod -Uri "$localUrl/ask" -Method POST -ContentType "application/json" -Body $body
$jobId = $response.jobId
Write-Output "Job enqueued with ID: $jobId"

# Poll for job completion
for ($i = 1; $i -le $MaxRetries; $i++) {
    Write-Output "Polling for job result (Attempt $i)..."
    try {
        $status = Invoke-RestMethod -Uri "$localUrl/ask?id=$jobId" -Method GET -ContentType "application/json"
        if ($status.status -eq "completed") {
            Write-Output "=== Job completed! ==="
            Write-Output "Result: $($status.result.text)"
            break
        } elseif ($status.status -eq "error") {
            Write-Error "Job failed with error: $($status.result)"
            break
        } else {
            Write-Output "Job status: $($status.status). Waiting before next poll..."
        }
    } catch {
        Write-Warning "Job not yet found. Retrying..."
    }
    Start-Sleep -Seconds $DelaySeconds
}

if ($i -gt $MaxRetries) {
    Write-Error "Failed to retrieve job status after $MaxRetries attempts."
}

Write-Output "=== Local test complete ==="
