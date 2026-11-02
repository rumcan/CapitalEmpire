$ErrorActionPreference = 'Stop'
$previewPort = 8877
$previewUrl = "http://127.0.0.1:$previewPort/"
try {
    $nodeCommand = Get-Command node -ErrorAction Stop
} catch {
    throw 'Node.js was not found. Install Node.js, then run this launcher again.'
}
$portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $previewPort)
try {
    $portProbe.Start()
} catch {
    throw "Port $previewPort is already in use. Stop the existing server before running start.ps1 again, or run node server.mjs --port NUMBER manually."
} finally {
    $portProbe.Stop()
}
$previewProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('server.mjs', '--port', "$previewPort") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
$previewReady = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    $previewProcess.Refresh()
    if ($previewProcess.HasExited) {
        throw 'The preview server exited before it was ready. Run node server.mjs --port 8877 in a terminal to see the error.'
    }
    try {
        $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -eq 200) {
            $previewReady = $true
            break
        }
    } catch {
        # Give the hidden server a moment to start.
    }
}
if (-not $previewReady) {
    Stop-Process -Id $previewProcess.Id -ErrorAction SilentlyContinue
    throw 'The preview server did not become ready. Run node server.mjs --port 8877 in a terminal to see the error.'
}
Write-Host "Bunker builder: $previewUrl"
Write-Host "Server process: $($previewProcess.Id). To stop it: Stop-Process -Id $($previewProcess.Id)"
Start-Process $previewUrl

