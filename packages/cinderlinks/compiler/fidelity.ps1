<#
.SYNOPSIS
  Fidelity's fractal compiler: reads distilled files as code (the owner, 2026-11-10: "create a fractal powershell we can use to build fractal code
  compiler that can read distilled files as code").

.DESCRIPTION
  A distilled file is a fractal of holons: a part, its requirements, the files it stands on, the checks that prove it, and its sub-parts. This
  compiler reads three distilled formats into one holon tree and compiles it the fractal way: every holon compiles itself with the same function
  (Invoke-Holon), then its children, and hands its fragments up to its parent; the root writes the program.

    .md / .fd.md  a BRS in the Fidelity distilled language:
                    ## id Title         a part (### a sub-part, #### deeper; any depth)
                    R: text             a requirement (plain or figurative)
                    File: name          a file the part writes
                    Check: text         a text that file must contain (belongs to the File: line above it)
                    ````lang file=name  the part's code for that file, up to the closing fence (3 or more backticks)
                  A part with no code compiles to a stub that carries its requirements, so nothing is dropped silently.
    .txt          a Fidelity matrix distillation (id, rung, purpose, functions @ file:line): compiled to a code skeleton, one module per source
                  file, every function a stub that names its requirement and where its body lives in the original.
    .json         a Fidelity distillation map (fidelity/distill.py): compiled to the same skeleton.

  Commands:
    fidelity.ps1 parse   <distilled>              the holon tree as JSON
    fidelity.ps1 tree    <distilled> [-Depth n]   the tree, one line per holon
    fidelity.ps1 compile <distilled> -Out <dir>   compile; then the checks run
    fidelity.ps1 check   <distilled> -Out <dir>   the checks alone, against a compiled folder
    fidelity.ps1 run     <distilled or dir> [-Matrix]
                         a distillation file, run in one step:
                           a BRS with code (.fd.md)     compiled to a cache folder, checked, and run as its own Windows window
                           a BRS without code, a matrix (.txt) or a map (.json)
                                                        the distillation itself runs: the Fidelity Player opens on it (tree, search,
                                                        part cards); -Matrix opens it straight into the Fidelity Matrix player
                         a compiled folder: run its launch.cmd, or its index.html in its own Edge window
    fidelity.ps1 <distilled>                      the same as run
#>
param(
  [Parameter(Position = 0)] [string] $Command,
  [Parameter(Position = 1)] [string] $Path,
  [string] $Out,
  [int] $Depth = 3,
  [switch] $Matrix,
  [string] $Player = (Join-Path $PSScriptRoot '..\player'),
  [int] $Port = 5241,
  [int] $DevPort = 5260
)
$ErrorActionPreference = 'Stop'
# (a file or folder alone on the command line means run it)
if ($Command -and $Command -notin 'parse', 'tree', 'compile', 'check', 'run') { $Path = $Command; $Command = 'run' }
if (-not $Command) { Get-Help $PSCommandPath; return }
# (.NET's file calls resolve relative paths from the process's folder, not PowerShell's location: make both absolute first)
if ($Path) { $Path = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path) }
if ($Out) { $Out = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out) }

# ------------------------------------------------------------------ the holon: the same shape at every rung
function New-Holon([string] $Id, [int] $Rung, [string] $Title) {
  [pscustomobject]@{ id = $Id; rung = $Rung; title = $Title; purpose = ''; requires = [System.Collections.Generic.List[string]]::new()
    files = [System.Collections.Generic.List[string]]::new(); checks = [System.Collections.Generic.List[object]]::new()
    code = [System.Collections.Generic.List[object]]::new(); functions = [System.Collections.Generic.List[object]]::new()
    links = [System.Collections.Generic.List[string]]::new(); from = ''
    children = [System.Collections.Generic.List[object]]::new() }
}

# ------------------------------------------------------------------ readers: three distilled formats, one holon tree
function Read-Brs([string] $File) {
  $lines = [System.IO.File]::ReadAllLines($File)
  $title = ($lines | Where-Object { $_ -match '^# ' } | Select-Object -First 1) -replace '^#\s*', ''
  $root = New-Holon 'app' 1 $title
  $stack = [System.Collections.Generic.List[object]]::new(); $stack.Add($root)
  $cur = $root; $fence = $null; $fenceFile = $null; $fenceLang = $null; $buf = $null
  foreach ($l in $lines) {
    if ($fence) {                                            # inside a code block: everything up to the matching fence is code
      if ($l.Trim() -eq $fence) { $cur.code.Add([pscustomobject]@{ file = $fenceFile; lang = $fenceLang; text = ($buf -join "`n") }); $fence = $null; continue }
      $buf.Add($l); continue
    }
    if ($l -match '^(`{3,})(\w*)\s+file=(\S+)\s*$') { $fence = $Matches[1]; $fenceLang = $Matches[2]; $fenceFile = $Matches[3]; $buf = [System.Collections.Generic.List[string]]::new(); continue }
    if ($l -match '^(#{2,6})\s+([\w.-]+)\s+(.*)$') {
      $rung = $Matches[1].Length
      while ($stack.Count -gt 1 -and $stack[$stack.Count - 1].rung -ge $rung) { $stack.RemoveAt($stack.Count - 1) }
      $parent = $stack[$stack.Count - 1]
      $id = if ($parent.id -eq 'app') { $Matches[2] } else { "$($parent.id).$($Matches[2])" }
      $cur = New-Holon $id $rung $Matches[3].Trim(); $parent.children.Add($cur); $stack.Add($cur); continue
    }
    if ($l -match '^From:\s*(.*)$') { $root.from = $Matches[1].Trim(); continue }      # where the original lives (for Link:)
    if ($l -match '^Link:\s*(.*)$') { $cur.links.Add($Matches[1].Trim()); continue }   # a file or folder that is not text: taken from the original
    if ($l -match '^R:\s*(.*)$') { $cur.requires.Add($Matches[1]); continue }
    if ($l -match '^File:\s*(.*)$') { $cur.files.Add($Matches[1].Trim()); continue }
    if ($l -match '^Check:\s*(.*)$') { $cur.checks.Add([pscustomobject]@{ file = ($cur.files | Select-Object -Last 1); text = $Matches[1].Trim() }); continue }
    if ($l.Trim() -and -not $cur.purpose -and $l -notmatch '^(#|-|Format)') { $cur.purpose = $l.Trim() }
  }
  $root
}

function Read-Matrix([string] $File) {
  $root = New-Holon 'matrix' 0 ([System.IO.Path]::GetFileName($File)); $by = @{}
  foreach ($l in [System.IO.File]::ReadLines($File)) {
    if (-not $l.Trim() -or $l.StartsWith('#')) { continue }
    $c = $l.Split("`t"); $id = $c[0]; if ($by.ContainsKey($id)) { continue }
    $rung = if ($c.Count -gt 1 -and $c[1] -match '^r(\d+)$') { [int]$Matches[1] } else { $id.Split('.').Count }
    $h = New-Holon $id $rung ($id.Split('.')[-1]); if ($c.Count -gt 2) { $h.purpose = $c[2]; if ($c[2]) { $h.requires.Add($c[2]) } }
    if ($c.Count -gt 3 -and $c[3]) { foreach ($f in $c[3].Split(';')) { $f = $f.Trim(); if ($f -match '^(.+?) @ (.+):(\d+)$') { $h.functions.Add([pscustomobject]@{ name = $Matches[1]; file = $Matches[2]; line = [int]$Matches[3] }) } } }
    $parent = $null; $key = $id                               # the parent is the nearest id already read that is a dotted prefix of this one
    while ($key.Contains('.') -and -not $parent) { $key = $key.Substring(0, $key.LastIndexOf('.')); $parent = $by[$key] }
    if (-not $parent) { $parent = $root }; $parent.children.Add($h); $by[$id] = $h
  }
  $root
}

function Read-Map([string] $File) {
  $m = Get-Content -Raw $File | ConvertFrom-Json -Depth 200
  function Convert-Node($n) {
    $h = New-Holon $n.id ([int]$n.rung) ($n.title ?? $n.id); $h.purpose = $n.purpose ?? ''
    foreach ($r in @($n.requires)) { if ($r) { $h.requires.Add($r) } }
    foreach ($d in @($n.dynamics)) { if ($d -and $d.at -match '^(.+):(\d+)$') { $h.functions.Add([pscustomobject]@{ name = $d.name; file = $Matches[1]; line = [int]$Matches[2]; does = $d.does }) } }
    foreach ($c in @($n.children)) { if ($c) { $h.children.Add((Convert-Node $c)) } }
    $h
  }
  Convert-Node $m.root
}

function Read-Distilled([string] $File) {
  switch -Regex ($File) { '\.md$' { return Read-Brs $File } '\.txt$' { return Read-Matrix $File } '\.json$' { return Read-Map $File } default { throw "not a distilled file: $File" } }
}

# ------------------------------------------------------------------ the fractal compile: one function, every rung
function Invoke-Holon($h, $ctx) {
  # 1. the holon's own code: its fragments for the files it stands on, in the order the distilled file gives them
  foreach ($c in $h.code) { if (-not $ctx.files.Contains($c.file)) { $ctx.files[$c.file] = [System.Collections.Generic.List[string]]::new() }; $ctx.files[$c.file].Add($c.text); $ctx.compiled++ }
  # 2. a file it stands on with no code anywhere in the holon: a stub that carries its requirements, never a silent gap
  foreach ($f in $h.files) {
    if (-not ($h.code | Where-Object file -eq $f)) {
      $ctx.stubs.Add([pscustomobject]@{ holon = $h.id; file = $f; requires = @($h.requires) })
    }
  }
  # 3. what is not text (pictures, libraries): linked from the original
  foreach ($k in $h.links) { $ctx.links.Add($k) }
  # 4. a distilled source file (matrix or map): its functions compile to stubs in a skeleton module
  foreach ($fn in $h.functions) {
    if (-not $ctx.skeleton.Contains($fn.file)) { $ctx.skeleton[$fn.file] = [System.Collections.Generic.List[object]]::new() }
    $ctx.skeleton[$fn.file].Add([pscustomobject]@{ name = $fn.name; line = $fn.line; holon = $h.id; requires = ($fn.does ?? $h.purpose) })
  }
  $ctx.holons++
  # 5. the children, the same way (the fractal)
  foreach ($c in $h.children) { Invoke-Holon $c $ctx }
}

function Write-Program($root, [string] $OutDir) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $ctx = [pscustomobject]@{ files = [ordered]@{}; stubs = [System.Collections.Generic.List[object]]::new(); skeleton = [ordered]@{}; links = [System.Collections.Generic.List[string]]::new(); compiled = 0; holons = 0 }
  Invoke-Holon $root $ctx
  New-Item -ItemType Directory -Force $OutDir | Out-Null
  $written = 0; $bytes = 0
  # the links: folders as junctions (nothing copied), single files copied, both from the original (From:)
  foreach ($k in $ctx.links) {
    $src = Join-Path $root.from $k; $dst = Join-Path $OutDir $k
    if (Test-Path $dst) { continue }
    New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
    if (Test-Path $src -PathType Container) { New-Item -ItemType Junction -Path $dst -Target (Resolve-Path $src).Path | Out-Null }
    elseif (Test-Path $src) { Copy-Item $src $dst }
    else { Write-Warning "Link: $k is not in the original ($src)" }
  }
  foreach ($f in $ctx.files.Keys) { $p = Join-Path $OutDir $f; New-Item -ItemType Directory -Force (Split-Path $p) | Out-Null; $t = ($ctx.files[$f] -join "`n"); [System.IO.File]::WriteAllText($p, $t); $written++; $bytes += [Text.Encoding]::UTF8.GetByteCount($t) }
  foreach ($s in $ctx.stubs) {
    $p = Join-Path $OutDir $s.file
    if (-not (Test-Path $p)) {
      $note = "distilled: part '$($s.holon)' has requirements but no code yet:`n" + (($s.requires | ForEach-Object { " - $_" }) -join "`n")
      [System.IO.File]::WriteAllText($p, ((Get-CommentFor $s.file $note) + "`n")); $written++
    }
  }
  # the skeleton: one module per original source file, a stub per function, named and placed as in the original
  foreach ($src in $ctx.skeleton.Keys) {
    $p = Join-Path $OutDir (Join-Path 'skeleton' $src); New-Item -ItemType Directory -Force (Split-Path $p) | Out-Null
    $ext = [IO.Path]::GetExtension($src)
    $sb = [System.Text.StringBuilder]::new(); [void]$sb.AppendLine("// Compiled by fidelity.ps1 from a distillation: the shape of $src, its bodies left in the original.")
    # (a function is listed by its file's holon and by its own: keep its own, whose requirement is the function's, not the file's)
    $fns = $ctx.skeleton[$src] | Group-Object line | ForEach-Object { $own = $_.Group | Where-Object { $_.holon.EndsWith('.' + $_.name.Split('::')[-1]) } | Select-Object -First 1; if ($own) { $own } else { $_.Group[0] } } | Sort-Object line
    foreach ($fn in $fns) {
      $name = $fn.name.Split('::')[-1] -replace '[^\w$]', '_'
      if ($fn.requires) { [void]$sb.AppendLine("/** $($fn.requires -replace '\*/', '* /') */") }
      if ($ext -in '.ts', '.tsx', '.js', '.mjs') { [void]$sb.AppendLine("export function $name(...args) { throw new Error('distilled: the body of $($fn.name) is in the original, $($src):$($fn.line)'); }") }
      else { [void]$sb.AppendLine("// $($fn.name)   (body: $($src):$($fn.line))") }
    }
    [System.IO.File]::WriteAllText($p, $sb.ToString()); $written++; $bytes += $sb.Length
  }
  [pscustomobject]@{ holons = $ctx.holons; fragments = $ctx.compiled; files = $written; stubs = $ctx.stubs.Count; skeletonModules = $ctx.skeleton.Count; links = $ctx.links.Count; bytes = $bytes; ms = $sw.ElapsedMilliseconds }
}

function Get-CommentFor([string] $File, [string] $Text) {
  switch -Regex ($File) { '\.(js|ts|css)$' { "/* $Text */" } '\.(html|md)$' { "<!-- $Text -->" } '\.(cmd|bat)$' { ($Text -split "`n" | ForEach-Object { "rem $_" }) -join "`r`n" } default { ($Text -split "`n" | ForEach-Object { "# $_" }) -join "`n" } }
}

function Test-Program($root, [string] $OutDir) {
  $pass = 0; $fail = [System.Collections.Generic.List[string]]::new()
  function Visit($h) {
    foreach ($c in $h.checks) {
      $p = Join-Path $OutDir $c.file
      if ((Test-Path $p) -and ([System.IO.File]::ReadAllText($p)).Contains($c.text)) { $script:pass++ } else { $fail.Add("$($h.id): $($c.file) lacks '$($c.text)'") }
    }
    foreach ($k in $h.children) { Visit $k }
  }
  $script:pass = 0; Visit $root
  [pscustomobject]@{ passed = $script:pass; failed = $fail.Count; failures = $fail }
}

function Show-Tree($h, [int] $max, [string] $pad = '') {
  $tag = @(); if ($h.code.Count) { $tag += "$($h.code.Count) code" }; if ($h.requires.Count) { $tag += "$($h.requires.Count) R" }; if ($h.functions.Count) { $tag += "$($h.functions.Count) fn" }
  "{0}{1}  {2}  ({3})" -f $pad, $h.id, $h.title, ($tag -join ', ')
  if ($max -gt 0) { foreach ($c in $h.children) { Show-Tree $c ($max - 1) ($pad + '  ') } }
}

# ------------------------------------------------------------------ running: a compiled folder, a distilled program, or a distillation itself
$Edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"

function Start-Folder([string] $Dir) {
  $pkg = Join-Path $Dir 'package.json'
  if ((Test-Path $pkg) -and ((Get-Content -Raw $pkg | ConvertFrom-Json).scripts.dev)) {
    # a web project: its own dev server (npm run dev) on a free port, then its own window
    $port = $DevPort; while (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { $port++ }
    Start-Process cmd.exe -ArgumentList "/c npm run dev -- --port $port --strictPort --host 127.0.0.1 > `"$Dir\dev-server.log`" 2>&1" -WorkingDirectory $Dir -WindowStyle Hidden
    $ok = $false; for ($k = 0; $k -lt 240 -and -not $ok; $k++) { try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/" -TimeoutSec 2 | Out-Null; $ok = $true } catch { Start-Sleep -Milliseconds 500 } }
    if (-not $ok) { throw "the dev server did not answer on $port (see $Dir\dev-server.log)" }
    Start-Process $Edge -ArgumentList "--app=http://127.0.0.1:$port/", '--new-window', "--user-data-dir=`"$env:TEMP\fidelity-run-web`"", '--window-size=1600,900'
    return "running $Dir as a web project: dev server http://127.0.0.1:$port/ (log: dev-server.log), in its own window"
  }
  if (Test-Path (Join-Path $Dir 'launch.cmd')) { Start-Process cmd.exe -ArgumentList "/c `"$(Join-Path $Dir 'launch.cmd')`"" -WorkingDirectory $Dir -WindowStyle Hidden; "running $Dir\launch.cmd" }
  elseif (Test-Path (Join-Path $Dir 'index.html')) {
    Start-Process $Edge -ArgumentList "--app=`"file:///$($Dir -replace '\\','/')/index.html`"", '--new-window', "--user-data-dir=`"$env:TEMP\fidelity-run`""; "running $Dir\index.html in its own window"
  } else { throw "nothing to run in $Dir (no launch.cmd or index.html)" }
}

# a compiled folder holds junctions into the original (art, libraries): remove each LINK with rmdir (never what it points to), then the rest
function Clear-Compiled([string] $Dir) {
  if (-not (Test-Path $Dir)) { return }
  Get-ChildItem $Dir -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue | Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object { cmd /c rmdir "$($_.FullName)" | Out-Null }
  if (Get-ChildItem $Dir -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue) { throw "a link is still in ${Dir}: not deleting it" }
  Remove-Item $Dir -Recurse -Force
}

function Test-HasCode($h) { if ($h.code.Count) { return $true }; foreach ($c in $h.children) { if (Test-HasCode $c) { return $true } }; $false }

# the holon tree as the map the Fidelity Player reads (id, rung, title, purpose, requires, dynamics, children), written by hand: fast at any size
function Write-MapJson($root, [string] $File) {
  $esc = { param($s) if ($null -eq $s) { '""' } else { '"' + ([string]$s).Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", '\n').Replace("`t", '\t') + '"' } }
  $sb = [System.Text.StringBuilder]::new(); $n = 0; $fns = 0; $req = 0; $files = [System.Collections.Generic.HashSet[string]]::new()
  function Emit($h) {
    $script:n++; $script:fns += $h.functions.Count; $script:req += $h.requires.Count
    [void]$sb.Append('{"id":').Append((& $esc $h.id)).Append(',"rung":').Append($h.rung).Append(',"title":').Append((& $esc $h.title)).Append(',"purpose":').Append((& $esc $h.purpose))
    [void]$sb.Append(',"requires":[').Append((($h.requires | ForEach-Object { & $esc $_ }) -join ',')).Append(']')
    $fl = @($h.files) + @($h.functions | ForEach-Object { $_.file } | Select-Object -Unique) | Where-Object { $_ } | Select-Object -Unique
    foreach ($f in $fl) { [void]$files.Add($f) }
    if ($h.rung -ge 3 -and $fl) { [void]$sb.Append(',"files":[').Append((($fl | ForEach-Object { & $esc $_ }) -join ',')).Append(']') }
    [void]$sb.Append(',"dynamics":[').Append((($h.functions | ForEach-Object { '{"name":' + (& $esc $_.name) + ',"at":' + (& $esc "$($_.file):$($_.line)") + '}' }) -join ',')).Append(']')
    [void]$sb.Append(',"children":['); $first = $true
    foreach ($c in $h.children) { if (-not $first) { [void]$sb.Append(',') }; $first = $false; Emit $c }
    [void]$sb.Append(']}')
  }
  $script:n = 0; $script:fns = 0; $script:req = 0
  [void]$sb.Append('{"root":'); Emit $root
  [void]$sb.Append(',"stats":{"nodes":').Append($script:n).Append(',"functions":').Append($script:fns).Append(',"requirement_lines":').Append($script:req).Append(',"source_files":').Append($files.Count).Append(',"llm_tokens":0}}')
  [System.IO.File]::WriteAllText($File, $sb.ToString())
}

function Start-Player([string] $MapFile, [switch] $MatrixView) {
  $server = Join-Path (Resolve-Path $Player).Path 'server.js'
  if (-not (Test-Path $server)) { throw "the Fidelity Player is not at $Player (give -Player <folder with server.js>)" }
  # one Player at a time on its port: a Player already serving there is replaced
  Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"; if ($p.CommandLine -match 'server\.js') { Stop-Process -Id $_.OwningProcess -Force } }
  Start-Process node -ArgumentList "`"$server`"", "`"$MapFile`"", $Port -WindowStyle Hidden
  for ($k = 0; $k -lt 60; $k++) { try { Invoke-RestMethod "http://127.0.0.1:$Port/api/stats" -TimeoutSec 1 | Out-Null; break } catch { Start-Sleep -Milliseconds 250 } }
  $page = if ($MatrixView) { 'matrix.html' } else { '' }
  Start-Process $Edge -ArgumentList "--app=http://127.0.0.1:$Port/$page", '--new-window', "--user-data-dir=`"$env:TEMP\fidelity-player`"", '--window-size=1280,800'
  "the distillation is running in the Fidelity {0} (http://127.0.0.1:{1}/{2}); it stops a minute after its window closes" -f ($(if ($MatrixView) { 'Matrix player' } else { 'Player' }), $Port, $page)
}

function Invoke-Run([string] $Target) {
  if (Test-Path $Target -PathType Container) { return Start-Folder $Target }
  $t = [System.Diagnostics.Stopwatch]::StartNew()
  $name = [IO.Path]::GetFileNameWithoutExtension($Target) -replace '\.fd$', ''
  # (the run cache: E:\ClaudeTemp on this PC, whose C: drive is kept free; the user's temp folder elsewhere)
  $cacheRoot = if (Test-Path 'E:\ClaudeTemp') { 'E:\ClaudeTemp\fidelity-run' } else { Join-Path $env:TEMP 'fidelity-run' }
  $cache = Join-Path $cacheRoot $name
  if ($Target -match '\.md$') {
    $root = Read-Brs $Target
    if (Test-HasCode $root) {
      # a distilled program: compile, check, run
      Clear-Compiled $cache
      $r = Write-Program $root $cache; $c = Test-Program $root $cache
      "compiled {0}: {1} holons -> {2} files in {3} ms; checks {4} passed, {5} failed" -f (Split-Path $Target -Leaf), $r.holons, $r.files, $t.ElapsedMilliseconds, $c.passed, $c.failed
      $c.failures | ForEach-Object { "  FAIL $_" }
      if ($c.failed) { throw 'the checks failed: not running it' }
      return Start-Folder $cache
    }
  }
  # a distillation with no code (a requirements-only BRS, a matrix, a map): the distillation itself runs, in the Fidelity Player
  New-Item -ItemType Directory -Force $cache | Out-Null
  $map = Join-Path $cache 'map.json'
  if ($Target -match '\.json$') { Copy-Item $Target $map -Force }
  else { $root = Read-Distilled $Target; Write-MapJson $root $map }
  "read {0} and wrote its map in {1} ms" -f (Split-Path $Target -Leaf), $t.ElapsedMilliseconds
  Start-Player $map -MatrixView:$Matrix
}

# ------------------------------------------------------------------ commands
switch ($Command) {
  'parse'   { Read-Distilled $Path | ConvertTo-Json -Depth 100 }
  'tree'    { Show-Tree (Read-Distilled $Path) $Depth }
  'compile' {
    if (-not $Out) { throw 'compile needs -Out <dir>' }
    $t = [System.Diagnostics.Stopwatch]::StartNew(); $root = Read-Distilled $Path; $read = $t.ElapsedMilliseconds
    $r = Write-Program $root $Out; $c = Test-Program $root $Out
    "read {0} ({1} ms)  ->  {2} holons compiled the fractal way  ->  {3} files ({4:N0} bytes) in {5} ms" -f (Split-Path $Path -Leaf), $read, $r.holons, $r.files, $r.bytes, $r.ms
    "  code fragments {0}, stubs for parts without code {1}, skeleton modules {2}" -f $r.fragments, $r.stubs, $r.skeletonModules
    "  checks: {0} passed, {1} failed" -f $c.passed, $c.failed
    $c.failures | ForEach-Object { "  FAIL $_" }
    if ($c.failed) { exit 1 }
  }
  'check'   { $c = Test-Program (Read-Distilled $Path) $Out; "checks: {0} passed, {1} failed" -f $c.passed, $c.failed; $c.failures | ForEach-Object { "  FAIL $_" } }
  'run'     { Invoke-Run $Path }
}
