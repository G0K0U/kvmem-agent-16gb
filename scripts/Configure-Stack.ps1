#requires -Version 7.0
param(
    [Parameter(Mandatory)][string]$DesktopRoot,
    [Parameter(Mandatory)][string]$RuntimeBin,
    [Parameter(Mandatory)][string]$ModelsDir,
    [string]$DshHome,
    [ValidateSet('iq3','qqz','heretic','bonsai')][string]$Model = 'iq3',
    [ValidateSet('bootstrap','desktop128')][string]$Profile = 'bootstrap',
    [ValidateSet('iq3','qqz','heretic')][string]$QwenModel = 'iq3',
    [string]$NinferBin, [string]$BonsaiDir,
    [switch]$Vision, [switch]$IntegrateExisting,
    [string]$NodeExe = 'node'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $DshHome) { $DshHome = Join-Path $root 'local/dsh-home' }
$DshHome = [IO.Path]::GetFullPath($DshHome)
foreach ($name in @('DesktopRoot','RuntimeBin','ModelsDir')) {
    Set-Variable -Name $name -Value (Resolve-Path -LiteralPath (Get-Variable $name -ValueOnly)).Path
}
foreach ($name in @('NinferBin','BonsaiDir')) {
    if (Get-Variable $name -ValueOnly) { Set-Variable -Name $name -Value (Resolve-Path -LiteralPath (Get-Variable $name -ValueOnly)).Path }
}
if (Get-Process -Name 'DSH Desktop Beta' -ErrorAction SilentlyContinue) { throw 'Exit DSH, including its tray process, before configuration.' }
if ((Test-Path -LiteralPath $DshHome) -and -not $IntegrateExisting) { throw 'Existing DSH home: use -IntegrateExisting to merge with a backup, or choose an empty dedicated path.' }
$cli = Join-Path $DesktopRoot 'resources/app/lib/desktop-cli.js'
foreach ($file in @($cli,(Join-Path $DesktopRoot 'DSH Desktop Beta.exe'),(Join-Path $RuntimeBin 'llama-kvmem-server.exe'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing prerequisite: $file" }
}
$catalog = Get-Content (Join-Path $root 'config/chat-models.json') -Raw | ConvertFrom-Json
$qwen = if ($Model -eq 'bonsai') { $QwenModel } else { $Model }
function Assert-Asset($entry, [string]$dir) {
    $file = Join-Path $dir $entry.file
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file" }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "SHA256 mismatch: $file" }
}
Assert-Asset $catalog.$qwen $ModelsDir
if ($Vision -or $Model -eq 'bonsai') {
    $visionAsset = Get-Content (Join-Path $root 'config/assets.json') -Raw | ConvertFrom-Json | Where-Object name -eq 'vision'
    Assert-Asset $visionAsset $ModelsDir
}
if ($Model -eq 'bonsai' -or $NinferBin -or $BonsaiDir) {
    if (-not $NinferBin -or -not $BonsaiDir) { throw 'Supply both -NinferBin and -BonsaiDir; see docs/BONSAI.md.' }
    if (-not (Test-Path (Join-Path $NinferBin 'ninfer-serve.exe'))) { throw 'Missing verified custom NInfer executable' }
    Assert-Asset $catalog.bonsai $BonsaiDir
}
New-Item -ItemType Directory -Force $DshHome,(Join-Path $root 'local/workspace') | Out-Null
$backup = Join-Path $DshHome ('backups/stack-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
New-Item -ItemType Directory -Force $backup | Out-Null
foreach ($rel in @('settings.yaml','cordis.patch.yml','profiles/desktop')) {
    $from = Join-Path $DshHome $rel
    if (Test-Path -LiteralPath $from) {
        $dest = Join-Path $backup $rel
        New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
        # Package metadata is enough to restore registration; do not copy node_modules.
        if ($rel -eq 'profiles/desktop') {
            New-Item -ItemType Directory -Force $dest | Out-Null
            Get-ChildItem -LiteralPath $from -File | Copy-Item -Destination $dest
        } else { Copy-Item -LiteralPath $from -Destination $dest }
    }
}
$opts = @{ desktopRoot=$DesktopRoot;dshHome=$DshHome;runtimeBin=$RuntimeBin;modelsDir=$ModelsDir;model=$Model;profile=$Profile;qwenModel=$QwenModel;ninferBin=$NinferBin;bonsaiDir=$BonsaiDir;vision=[bool]$Vision }
$optionsFile = Join-Path $root 'local/stack-options.json'
$opts | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $optionsFile -Encoding utf8
& $NodeExe (Join-Path $PSScriptRoot 'stack-config.mjs') $optionsFile
if ($LASTEXITCODE -ne 0) { throw "Config merge failed; backup: $backup" }
$profileDir = Join-Path $DshHome 'profiles/desktop'
if (-not (Test-Path (Join-Path $profileDir 'package.json'))) {
    New-Item -ItemType Directory -Force $profileDir | Out-Null
    @{ name='dsh-profile-desktop';private=$true;dependencies=@{};dsh=@{profile=@{bundles=@('@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app')}}} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $profileDir 'package.json') -Encoding utf8
}
$previousDshHome = $env:DSH_HOME
try {
    $env:DSH_HOME = $DshHome
    & $NodeExe $cli plugin --profile desktop add (Join-Path $root 'plugins/dsh-local-llm-controller') --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "Plugin registration failed; restore using backup: $backup" }
} finally { $env:DSH_HOME = $previousDshHome }
@{ desktopRoot=$DesktopRoot;nodeExe=$NodeExe;dshHome=$DshHome } | ConvertTo-Json | Set-Content (Join-Path $root 'local/launch.json') -Encoding utf8
Write-Host "Configured without starting a model. Backup: $backup"
Write-Host 'Next: scripts/Diagnose.ps1 -Stage before-chat; then scripts/Start.ps1.'
