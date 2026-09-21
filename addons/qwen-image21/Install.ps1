param(
    [Parameter(Mandatory)][string]$PythonExe,
    [Parameter(Mandatory)][string]$WeightsDir,
    [string]$DesktopRoot,
    [string]$DshHome,
    [string]$ImageRoot,
    [string]$NodeExe = 'node'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $DshHome) { $DshHome = Join-Path $repo 'local/dsh-home' }
if (-not $ImageRoot) { $ImageRoot = Join-Path $repo 'local/qwen-image21' }
if (-not $DesktopRoot) {
    $DesktopRoot = (Get-Content (Join-Path $repo 'local/launch.json') -Raw | ConvertFrom-Json).desktopRoot
}
$DshHome = [IO.Path]::GetFullPath($DshHome)
$ImageRoot = [IO.Path]::GetFullPath($ImageRoot)
$DesktopRoot = (Resolve-Path -LiteralPath $DesktopRoot).Path
$PythonExe = (Resolve-Path -LiteralPath $PythonExe).Path
$WeightsDir = (Resolve-Path -LiteralPath $WeightsDir).Path
if (Get-Process -Name 'DSH Desktop Beta' -ErrorAction SilentlyContinue) { throw 'Fully exit DSH before installing; no running instance is stopped by this script.' }
$cli = Join-Path $DesktopRoot 'resources/app/lib/desktop-cli.js'
foreach ($file in @($cli, (Join-Path $DshHome 'settings.yaml'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing prerequisite: $file" }
}
foreach ($command in @('git','pnpm',$NodeExe)) { Get-Command $command -ErrorAction Stop | Out-Null }
& $PythonExe -s -c 'import torch, gguf, safetensors, aiohttp, scipy, transformers, sentencepiece; assert torch.cuda.is_available(), "CUDA Python is required"'
if ($LASTEXITCODE -ne 0) { throw 'Use a working ComfyUI CUDA Python environment, not a bare Python installation.' }
$manifest = Get-Content (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
$folders = @('diffusion_models','text_encoders','vae')
# Verify all source weights before installing or changing DSH configuration.
for ($i=0; $i -lt $manifest.models.Count; $i++) {
    $item = $manifest.models[$i]
    $source = Join-Path $WeightsDir $item.file
    if (-not (Test-Path -LiteralPath $source)) { $source = Join-Path (Join-Path $WeightsDir $folders[$i]) $item.file }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing weight: $($item.file)" }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $item.sha256) { throw "SHA256 mismatch: $source" }
    $targetDir = Join-Path (Join-Path $ImageRoot 'models') $folders[$i]
    New-Item -ItemType Directory -Force $targetDir | Out-Null
    $target = Join-Path $targetDir $item.file
    if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($target)) {
        if (Test-Path -LiteralPath $target) {
            if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.sha256) { throw "Existing destination differs; inspect it before retrying: $target" }
        } else { Copy-Item -LiteralPath $source -Destination $target }
    }
}
function Get-PinnedCheckout([string]$Url, [string]$Commit, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Destination)) {
        & git clone --no-checkout $Url $Destination
        if ($LASTEXITCODE -ne 0) { throw "Clone failed: $Url" }
        & git -C $Destination checkout --detach $Commit
        if ($LASTEXITCODE -ne 0) { throw "Pinned checkout failed: $Commit" }
    } else {
        $head = & git -C $Destination rev-parse HEAD
        if ($LASTEXITCODE -ne 0 -or $head -ne $Commit) { throw "Existing checkout is not the pinned revision: $Destination" }
        $changes = & git -C $Destination status --porcelain --untracked-files=no
        if ($changes) { throw "Existing checkout has modifications; keep it and choose a fresh ImageRoot: $Destination" }
    }
}
Get-PinnedCheckout 'https://github.com/Comfy-Org/ComfyUI.git' $manifest.comfyCommit (Join-Path $ImageRoot 'ComfyUI')
Get-PinnedCheckout 'https://github.com/leejet/ComfyUI-GGUF.git' $manifest.ggufCommit (Join-Path $ImageRoot 'ComfyUI/custom_nodes/ComfyUI-GGUF')
$plugin = Join-Path $ImageRoot 'dsh-image-gen'
Get-PinnedCheckout 'https://github.com/shanliuling/dsh-image-gen.git' $manifest.pluginCommit $plugin
# The existing ComfyUI environment supplies torch and its dependencies. Install
# only the newer pinned UI/runtime additions in the isolated overlay.
& $PythonExe -s -m pip install --target (Join-Path $ImageRoot 'deps') --no-deps `
    'comfy-aimdo==0.5.5' 'comfy-kitchen==0.2.35' 'comfyui-frontend-package==1.53.6' `
    'comfyui-workflow-templates==0.11.66' 'comfyui-embedded-docs==0.5.12'
if ($LASTEXITCODE -ne 0) { throw 'Isolated Python dependency installation failed' }
New-Item -ItemType Directory -Force (Join-Path $ImageRoot 'prompts') | Out-Null
foreach ($entry in $manifest.prompts.PSObject.Properties) {
    $target = Join-Path (Join-Path $ImageRoot 'prompts') $entry.Name
    Invoke-WebRequest "https://raw.githubusercontent.com/QwenLM/Qwen-Image-2.1/$($manifest.promptCommit)/prompt_rewrite/prompts/$($entry.Name)" -OutFile $target
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.Value) { throw "Prompt template hash mismatch: $($entry.Name)" }
}
foreach ($dir in @('src','tests')) {
    Copy-Item -Path (Join-Path $PSScriptRoot "image-plugin-overlay/$dir/*") -Destination (Join-Path $plugin $dir) -Force
}
Push-Location $plugin
try {
    & pnpm install --frozen-lockfile --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Image plugin dependencies failed' }
    & pnpm run build
    if ($LASTEXITCODE -ne 0) { throw 'Image plugin build failed' }
} finally { Pop-Location }
$previousDshHome = $env:DSH_HOME
$settingsFile = Join-Path $DshHome 'settings.yaml'
Copy-Item -LiteralPath $settingsFile -Destination ($settingsFile + '.before-image21-registration-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
try {
    $env:DSH_HOME = $DshHome
    & $NodeExe $cli plugin --profile desktop add (Join-Path $repo 'plugins/dsh-local-llm-controller') --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Controller installation failed' }
    & $NodeExe $cli plugin --profile desktop add $plugin --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Image plugin installation failed' }
} finally { $env:DSH_HOME = $previousDshHome }
& $NodeExe (Join-Path $PSScriptRoot 'Configure.mjs') $DshHome $DesktopRoot $ImageRoot $PythonExe
if ($LASTEXITCODE -ne 0) { throw 'Image configuration failed' }
Write-Host 'Installed. Start the existing KVMem + DSH stack normally. Do not start a second ComfyUI on port 8191.'
