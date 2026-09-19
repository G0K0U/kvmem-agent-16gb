param(
    [Parameter(Mandatory)][string]$DesktopRoot,
    [Parameter(Mandatory)][string]$RuntimeBin,
    [Parameter(Mandatory)][string]$ModelsDir,
    [string]$NodeExe = 'node',
    [switch]$GenerateOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$homeDir = Join-Path $root 'local/dsh-home'
$cli = Join-Path $DesktopRoot 'resources/app/lib/desktop-cli.js'
foreach ($file in @($cli,(Join-Path $DesktopRoot 'DSH Desktop Beta.exe'),(Join-Path $RuntimeBin 'llama-kvmem-server.exe'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing file: $file" }
}
$template = Get-Content (Join-Path $root 'config/settings.template.json') -Raw | ConvertFrom-Json
foreach ($name in @($template.'local-llm'.config.slots.a.file,$template.'local-llm'.config.slots.a.mmproj)) {
    if (-not (Test-Path -LiteralPath (Join-Path $ModelsDir $name) -PathType Leaf)) { throw "Missing model: $name" }
}
if (Test-Path -LiteralPath $homeDir) { throw 'Dedicated home already exists. Back it up and use the panel to change settings; this script never overwrites it.' }
New-Item -ItemType Directory -Force $homeDir,(Join-Path $root 'local/workspace') | Out-Null
$template.'local-llm'.config.llamaDir = (Resolve-Path -LiteralPath $RuntimeBin).Path
$template.'local-llm'.config.slots.a.dir = (Resolve-Path -LiteralPath $ModelsDir).Path
$utf8 = New-Object System.Text.UTF8Encoding $false
# JSON is valid YAML; DSH reads this file as YAML.
[IO.File]::WriteAllText((Join-Path $homeDir 'settings.yaml'),($template | ConvertTo-Json -Depth 30),$utf8)
[IO.File]::WriteAllText((Join-Path $homeDir 'cordis.patch.yml'),"- id: tool-subagent`n  disabled: true`n- id: tool-subagent-fork`n  disabled: true`n",$utf8)
$launch = @{desktopRoot=(Resolve-Path -LiteralPath $DesktopRoot).Path;nodeExe=$NodeExe}
[IO.File]::WriteAllText((Join-Path $root 'local/launch.json'),($launch | ConvertTo-Json),$utf8)
$profileDir = Join-Path $homeDir 'profiles/desktop'
New-Item -ItemType Directory -Force $profileDir | Out-Null
$profile = @{name='dsh-profile-desktop';private=$true;dependencies=@{};dsh=@{profile=@{bundles=@('@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app')}}}
[IO.File]::WriteAllText((Join-Path $profileDir 'package.json'),($profile | ConvertTo-Json -Depth 8),$utf8)
if ($GenerateOnly) { Write-Host 'Generated configuration only; plugin installation still required.'; return }
$previousHome = $env:DSH_HOME
try {
    $env:DSH_HOME = $homeDir
    & $NodeExe $cli plugin --profile desktop add (Join-Path $root 'plugins/dsh-local-llm-controller') --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed; inspect the output before starting DSH.' }
} finally { $env:DSH_HOME = $previousHome }
Write-Host 'Configured. Close other DSH/model instances, then run scripts/Start.ps1.'
