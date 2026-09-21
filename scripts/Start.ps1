$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $root 'local/launch.json') -Raw | ConvertFrom-Json
foreach ($port in @(18200,43189)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is occupied. Close the existing instance first." }
}
if (Get-Process -Name 'DSH Desktop Beta' -ErrorAction SilentlyContinue) { throw 'Close the existing DSH Desktop Beta instance first (Electron single-instance app).' }
& (Join-Path $PSScriptRoot 'Diagnose.ps1') -Stage before-chat
$env:DSH_HOME = if ($config.dshHome) { $config.dshHome } else { Join-Path $root 'local/dsh-home' }
$env:QQZ_LOCAL_API_KEY = 'local-only'
Start-Process -FilePath (Join-Path $config.desktopRoot 'DSH Desktop Beta.exe') -ArgumentList '--disable-gpu' -WorkingDirectory (Join-Path $root 'local/workspace') -WindowStyle Hidden
Write-Host 'DSH launched. The controller owns the model process; initial loading may take a few minutes.'
