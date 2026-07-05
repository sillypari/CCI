$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$BackendPort = 8000
$FrontendPort = 5173
$BackendUrl = "http://127.0.0.1:$BackendPort"
$ApiUrl = "$BackendUrl/api"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"
$BackendScript = Join-Path $PSScriptRoot "backend-dev.cmd"
$FrontendScript = Join-Path $PSScriptRoot "frontend-dev.cmd"
$FrontendDir = Join-Path $Root "frontend"
$ViteCmd = Join-Path $FrontendDir "node_modules\.bin\vite.cmd"

function Get-CommandLineForPid {
  param([int] $ProcessId)

  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    return [string] $proc.CommandLine
  } catch {
    try {
      $proc = Get-Process -Id $ProcessId -ErrorAction Stop
      return [string] $proc.Path
    } catch {
      return ""
    }
  }
}

function Stop-ListenerIfApproved {
  param([int] $Port)

  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Sort-Object -Property OwningProcess -Unique)
  foreach ($listener in $listeners) {
    $owningPid = [int] $listener.OwningProcess
    if ($owningPid -le 0) { continue }

    $commandLine = Get-CommandLineForPid -ProcessId $owningPid
    $commandLineLower = $commandLine.ToLowerInvariant()
    $rootLower = $Root.ToLowerInvariant()
    $isThisProject = $commandLineLower.Contains($rootLower)
    $isDevServer = $commandLineLower.Contains("uvicorn") -or $commandLineLower.Contains("vite") -or $commandLineLower.Contains("app.main:app")

    if ($isThisProject -and $isDevServer) {
      Write-Host "Stopping stale Pramaan dev server PID $owningPid on port $Port."
      Stop-Process -Id $owningPid -Force -ErrorAction Stop
      continue
    }

    Write-Host ""
    Write-Host "Port $Port is already in use by PID $owningPid."
    if ($commandLine) {
      Write-Host "Command: $commandLine"
    } else {
      Write-Host "Command: unavailable"
    }
    Write-Host "This can make the frontend talk to the wrong backend."
    $answer = Read-Host "Stop this process now? Type Y to stop it, or anything else to abort"
    if ($answer -match "^[Yy]$") {
      Stop-Process -Id $owningPid -Force -ErrorAction Stop
      Write-Host "Stopped PID $owningPid."
    } else {
      throw "Port $Port is occupied. Startup aborted."
    }
  }
}

function Wait-ForPortToClear {
  param([int] $Port)

  $deadline = (Get-Date).AddSeconds(10)
  do {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Port $Port is still in use after cleanup."
}

function Start-CmdWindow {
  param(
    [string] $Title,
    [string] $ScriptPath
  )

  $quotedScript = '"' + $ScriptPath + '"'
  $arguments = '/c start "' + $Title + '" cmd /k ' + $quotedScript
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $env:ComSpec
  $psi.Arguments = $arguments
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  [System.Diagnostics.Process]::Start($psi) | Out-Null
}

function Verify-BackendContract {
  $deadline = (Get-Date).AddSeconds(45)
  do {
    try {
      $schema = Invoke-RestMethod -Uri "$BackendUrl/openapi.json" -TimeoutSec 4
      $params = @($schema.paths."/api/graph".get.parameters | ForEach-Object { $_.name })
      if (($params -contains "focus_type") -and ($params -contains "hops") -and ($params -contains "rank_by")) {
        $graph = Invoke-RestMethod -Uri "$ApiUrl/graph?limit=1&scan_limit=1" -TimeoutSec 10
        $layoutNames = @($graph.view.layouts.PSObject.Properties.Name)
        if (($layoutNames -contains "force") -and ($layoutNames -contains "concentric") -and ($layoutNames -contains "sankey")) {
          return
        }
      }
    } catch {
      Start-Sleep -Seconds 1
      continue
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  throw "Backend is reachable, but it is not serving the current Communication Map layout contract."
}

Write-Host "==================================================="
Write-Host "       Starting Pramaan IPDR Engine (Hackathon)"
Write-Host "==================================================="
Write-Host ""

Write-Host "[1/4] Checking required ports..."
Stop-ListenerIfApproved -Port $BackendPort
Stop-ListenerIfApproved -Port $FrontendPort
Wait-ForPortToClear -Port $BackendPort
Wait-ForPortToClear -Port $FrontendPort

if (-not (Test-Path -LiteralPath $ViteCmd)) {
  throw "Frontend dependencies are missing. Run npm install inside $FrontendDir first."
}

Write-Host "[2/4] Starting backend on $BackendUrl..."
Start-CmdWindow -Title "Pramaan Backend" -ScriptPath $BackendScript

Write-Host "[3/4] Verifying backend graph API contract..."
Verify-BackendContract

Write-Host "[4/4] Starting frontend on $FrontendUrl..."
Start-CmdWindow -Title "Pramaan Frontend" -ScriptPath $FrontendScript

Write-Host ""
Write-Host "Startup complete."
Write-Host "Backend API: $BackendUrl"
Write-Host "Frontend UI: $FrontendUrl"
Write-Host "Frontend API target: $ApiUrl"
Write-Host ""
Write-Host "Keep the backend and frontend windows open while testing."
Write-Host "==================================================="