$uri = "https://cortex-agent-worker.nolanaug.workers.dev/prompt"
$body = @{ prompt = "Explain AI in software engineering."; stream = $true } | ConvertTo-Json

$request = [System.Net.HttpWebRequest]::Create($uri)
$request.Method = "POST"
$request.ContentType = "application/json"
$request.Timeout = 300000  # 5 minutes, adjust if needed

# Write JSON body to request stream
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$request.ContentLength = $bytes.Length
$reqStream = $request.GetRequestStream()
$reqStream.Write($bytes, 0, $bytes.Length)
$reqStream.Close()

try {
    $response = $request.GetResponse()
    $respStream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($respStream)

    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        if ($line -and $line.Trim() -ne "") {
            # Attempt to parse JSON line and extract "response" key for clean output
            try {
                $obj = $line | ConvertFrom-Json
                if ($obj.response) {
                    Write-Host $obj.response.Trim()
                } else {
                    # fallback: print the raw line if no response key found
                    Write-Host $line
                }
            } catch {
                # if parsing fails, print raw line
                Write-Host $line
            }
        }
    }

    $reader.Close()
    $respStream.Close()
    $response.Close()
}
catch {
    Write-Error "Streaming request error: $_"
}
