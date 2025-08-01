$uri = "https://metrics-ingestion-worker.nolanaug.workers.dev/ingest"
$jobId = "test-job-123"
$payload = @{
    jobId = $jobId
    traceId = "trace-abc"
    promptTokens = 100
    outputTokens = 200
    totalTokens = 300
    durationMs = 123.45
    model = "gemma:2b"
    status = "completed"
    timestamp = [int][double]::Parse((Get-Date -UFormat %s)) * 1000
}
$jsonBody = $payload | ConvertTo-Json -Depth 5
$response = Invoke-RestMethod -Uri $uri -Method Post -Body $jsonBody -ContentType "application/json"
$response
