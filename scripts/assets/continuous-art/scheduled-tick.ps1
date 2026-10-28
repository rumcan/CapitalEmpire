param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
$env:TEMP = 'E:\ClaudeTemp'
$env:TMP = 'E:\ClaudeTemp'
$scriptFile = Join-Path $PSScriptRoot 'supervisor.mjs'
$installationFile = Join-Path (Split-Path -Parent $Config) 'installation.json'
$nodePath = if(Test-Path -LiteralPath $installationFile) { (Get-Content -LiteralPath $installationFile -Raw | ConvertFrom-Json).nodePath } else { (Get-Command node.exe).Source }
& $nodePath $scriptFile --config $Config
exit $LASTEXITCODE
