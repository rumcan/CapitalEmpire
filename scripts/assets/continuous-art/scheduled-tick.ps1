param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
$env:TEMP = 'E:\ClaudeTemp'
$env:TMP = 'E:\ClaudeTemp'
$scriptFile = Join-Path $PSScriptRoot 'supervisor.mjs'
& node $scriptFile --config $Config
exit $LASTEXITCODE
