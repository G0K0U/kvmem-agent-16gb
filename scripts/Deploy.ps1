param(
    [switch]$SkipDownload,
    [string]$DesktopRoot,
    [string]$NodeExe = 'node',
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dl = Join-Path $root 'downloads'

Write-Host "== [1/5] Downloads (runtime, desktop installer, model; SHA256-pinned) =="
if (-not $SkipDownload) { & (Join-Path $PSScriptRoot 'Download.ps1') -Models }
$assets = Get-Content (Join-Path $root 'config/assets.json') -Raw | ConvertFrom-Json
foreach ($a in $assets | Where-Object { $_.name -in @('model','vision') }) {
    if (-not (Test-Path -LiteralPath (Join-Path $dl $a.file) -PathType Leaf)) {
        throw "Model file missing: $($a.file). Run scripts/Download.ps1 -Models first."
    }
}

Write-Host "== [2/5] KVMem runtime =="
$zip = Get-ChildItem $dl -Filter 'kvmem-*.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $zip) { throw 'KVMem runtime zip not found in downloads. Run scripts/Download.ps1 first.' }
$runtimeRoot = Join-Path $root 'runtime'
$server = Get-ChildItem $runtimeRoot -Recurse -Filter 'llama-kvmem-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $server) {
    Write-Host "Extracting $($zip.Name) ..."
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $runtimeRoot -Force
    $server = Get-ChildItem $runtimeRoot -Recurse -Filter 'llama-kvmem-server.exe' | Select-Object -First 1
}
if (-not $server) { throw 'llama-kvmem-server.exe not found after extraction.' }
$runtimeBin = $server.DirectoryName
Write-Host "Runtime bin: $runtimeBin"

Write-Host "== [3/5] DSH Desktop install =="
function Test-DesktopRoot([string]$p) {
    ($p -and (Test-Path -LiteralPath (Join-Path $p 'DSH Desktop Beta.exe') -PathType Leaf) -and
             (Test-Path -LiteralPath (Join-Path $p 'resources/app/lib/desktop-cli.js') -PathType Leaf))
}
$droot = $null
foreach ($candidate in @(
    @{ src = 'parameter';    path = $DesktopRoot },
    @{ src = 'launch.json';  path = if (Test-Path (Join-Path $root 'local/launch.json')) { (Get-Content (Join-Path $root 'local/launch.json') -Raw | ConvertFrom-Json).desktopRoot } else { $null } },
    @{ src = 'registry';     path = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'DSH Desktop*' -and $_.InstallLocation } |
        Select-Object -First 1 -ExpandProperty InstallLocation) },
    @{ src = 'common paths'; path = @(
        "$env:LOCALAPPDATA\Programs\DSH Desktop Beta",
        "$env:ProgramFiles\DSH Desktop Beta",
        "${env:ProgramFiles(x86)}\DSH Desktop Beta") | Where-Object { Test-DesktopRoot $_ } | Select-Object -First 1 }
)) {
    if (Test-DesktopRoot $candidate.path) { $droot = $candidate.path; Write-Host "DSH Desktop found ($($candidate.src)): $droot"; break }
}
if (-not $droot) {
    $shortcut = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs","$env:ProgramData\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter 'DSH*.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($shortcut) {
        $sh = New-Object -ComObject WScript.Shell
        $target = $sh.CreateShortcut($shortcut.FullName).TargetPath
        $guess = Split-Path $target -Parent
        if (Test-DesktopRoot $guess) { $droot = $guess; Write-Host "DSH Desktop found (start menu shortcut): $droot" }
    }
}
if (-not $droot) {
    throw ("DSH Desktop install not found. Run the installer in downloads\ once, then re-run this script. " +
           "If it is installed to a custom location, pass it: .\scripts\Deploy.ps1 -DesktopRoot 'C:\Path\To\DSH Desktop Beta'")
}

Write-Host "== [4/5] Configure (dedicated home + panel plugin) =="
if (Test-Path (Join-Path $root 'local/dsh-home/settings.yaml')) {
    Write-Host 'Already configured - keeping existing local/dsh-home (your panel edits are preserved).'
} else {
    & (Join-Path $PSScriptRoot 'Configure.ps1') -DesktopRoot $droot -RuntimeBin $runtimeBin -ModelsDir $dl -NodeExe $NodeExe
}

if ($NoStart) { Write-Host 'Deployed. Start later with scripts/Start.ps1.'; return }

Write-Host "== [5/5] Start & health =="
& (Join-Path $PSScriptRoot 'Start.ps1')
$deadline = (Get-Date).AddSeconds(360); $ok = $false
while ((Get-Date) -lt $deadline) {
    try { $h = Invoke-RestMethod 'http://127.0.0.1:18200/health' -TimeoutSec 4; if ($h.status -eq 'ok') { $ok = $true; break } } catch { }
    Start-Sleep -Seconds 5
}
if (-not $ok) { throw 'Model API did not become healthy within 360s. Open the Local LLM Controller card in DSH settings and check its log; first load can be slow on some disks.' }
Write-Host 'Model API is healthy.'
Invoke-RestMethod 'http://127.0.0.1:18200/v1/models' -TimeoutSec 10 | ConvertTo-Json -Depth 6
Write-Host 'Open DSH Desktop and select the 64K / MTP2 preset to start.'
