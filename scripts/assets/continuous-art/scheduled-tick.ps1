param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
$env:TEMP = 'E:\ClaudeTemp'
$env:TMP = 'E:\ClaudeTemp'
$launcherDir = Join-Path (Split-Path -Parent $Config) 'launcher'
New-Item -ItemType Directory -Force -Path $launcherDir | Out-Null
$launcherLog = Join-Path $launcherDir (([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))+'.log')
try {
  $scriptFile = Join-Path $PSScriptRoot 'supervisor.mjs'
  $installationFile = Join-Path (Split-Path -Parent $Config) 'installation.json'
  $nodePath = if(Test-Path -LiteralPath $installationFile) { (Get-Content -LiteralPath $installationFile -Raw | ConvertFrom-Json).nodePath } else { (Get-Command node.exe).Source }
  & $nodePath $scriptFile --config $Config *> $launcherLog
  $result = $LASTEXITCODE
  if($result -ne 0) { [ordered]@{atUtc=[DateTime]::UtcNow.ToString('o');exitCode=$result;log=$launcherLog;message='Supervisor or module/config startup failed; inspect launcher log.'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $launcherDir 'last-error.json') }
  exit $result
} catch {
  $_ | Out-String | Add-Content -LiteralPath $launcherLog
  [ordered]@{atUtc=[DateTime]::UtcNow.ToString('o');exitCode=1;log=$launcherLog;message=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $launcherDir 'last-error.json')
  exit 1
}
