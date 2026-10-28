param(
  [ValidateSet('Install','Start','Stop','Status')][string]$Action='Status',
  [string]$Config='E:/ClaudeTemp/continuous-art/config.json',
  [string]$TaskName='CapitalEmpire continuous golf artwork'
)
$ErrorActionPreference='Stop'
$settings=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$stateRoot=[IO.Path]::GetFullPath($settings.stateDir)
$stopFile=Join-Path $stateRoot 'STOP.json'
if($Action -eq 'Install') {
  $names=@('queue.mjs','supervisor.mjs','scheduled-tick.ps1','manage-task.ps1')
  $hashes=@($names | ForEach-Object { [ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()} })
  $hashText=($hashes | ConvertTo-Json -Compress)
  $algorithm=[Security.Cryptography.SHA256]::Create()
  $revision=([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashText)))).Replace('-','').ToLowerInvariant()
  $program=Join-Path $stateRoot ('program/'+$revision)
  New-Item -ItemType Directory -Force -Path $program | Out-Null
  foreach($name in $names) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $program $name) -Force }
  [ordered]@{schema=1;revision=$revision;copiedAtUtc=[DateTime]::UtcNow.ToString('o');source=$PSScriptRoot;files=$hashes} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $program 'deployment.json')
  $modules=Join-Path $program 'node_modules'
  if(!(Test-Path -LiteralPath $modules)) { New-Item -ItemType Junction -Path $modules -Target (Join-Path $settings.repoRoot 'node_modules') | Out-Null }
  $node=(Get-Command node.exe).Source
  [ordered]@{schema=1;program=$program;revision=$revision;nodePath=$node;config=[IO.Path]::GetFullPath($Config);taskName=$TaskName} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'installation.json')
  $wrapper=Join-Path $program 'scheduled-tick.ps1'
  $shell=(Get-Command powershell.exe).Source
  $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$wrapper+'" -Config "'+[IO.Path]::GetFullPath($Config)+'"'
  $taskAction=New-ScheduledTaskAction -Execute $shell -Argument $arguments -WorkingDirectory $program
  $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $taskSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $taskSettings -Description 'Owner-requested built-in imagegen worker. Durable UTC five-hour quota backoff, exact dedicated thread, true alpha, live-list refresh.' -Force | Out-Null
  Write-Output ('Installed immutable program '+$program)
}
if($Action -eq 'Start') {
  if(Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
  Enable-ScheduledTask -TaskName $TaskName | Out-Null
  Start-ScheduledTask -TaskName $TaskName
}
if($Action -eq 'Stop') {
  [ordered]@{stoppedAtUtc=[DateTime]::UtcNow.ToString('o');reason='Explicit user/operator stop'} | ConvertTo-Json | Set-Content -LiteralPath $stopFile
  Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  $lockFile=Join-Path $stateRoot 'worker.lock.json'
  if(Test-Path -LiteralPath $lockFile) {
    $ownedLock=Get-Content -LiteralPath $lockFile -Raw | ConvertFrom-Json
    $workerStateFile=Join-Path $stateRoot 'state.json'
    $workerState=if(Test-Path -LiteralPath $workerStateFile) { Get-Content -LiteralPath $workerStateFile -Raw | ConvertFrom-Json } else { $null }
    foreach($ownedPid in @($ownedLock.workerPid,$ownedLock.pid)) {
      if(!$ownedPid) { continue }
      $processInfo=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$ownedPid)
      if(!$processInfo) { continue }
      $isSupervisor=$processInfo.CommandLine -match 'continuous-art[/\\].*supervisor\.mjs|continuous-art[/\\]supervisor\.mjs'
      $isWorker=$processInfo.Name -eq 'codex.exe' -and ($processInfo.CommandLine.Contains($settings.worktree) -or ($workerState.threadId -and $processInfo.CommandLine.Contains($workerState.threadId)))
      if($isSupervisor -or $isWorker) { & taskkill.exe /PID ([string]$ownedPid) /T /F | Out-Null }
    }
  }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Select-Object TaskName,State,Actions,Triggers
Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue | Select-Object LastRunTime,LastTaskResult,NextRunTime
$stateFile=Join-Path $stateRoot 'state.json'
if(Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw }
