#requires -Version 7.0
param(
    [ValidateSet('inventory','before-chat','before-image','chat-ready')][string]$Stage='inventory',
    [string]$OutputFile,
    [int]$Port=18200,
    [int]$ImagePort=8191
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if (-not $OutputFile) { $OutputFile=Join-Path $root 'local/diagnostic.json' }
$warnings=[Collections.Generic.List[string]]::new()
$blockers=[Collections.Generic.List[string]]::new()
$gpu=@()
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $csv=& nvidia-smi --query-gpu=index,name,driver_version,memory.total,memory.used,memory.free --format=csv,noheader,nounits
    if ($LASTEXITCODE -ne 0) { $blockers.Add('nvidia-smi failed; verify NVIDIA driver before starting.') }
    else { $gpu=@($csv | ConvertFrom-Csv -Header index,name,driver,totalMiB,usedMiB,freeMiB) }
} else { $blockers.Add('nvidia-smi not available; CUDA GPU readiness is unknown.') }
$processes=@(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(llama-server|llama-kvmem-server|ninfer-serve|ollama|ComfyUI)' -or
    ($_.Name -match '^python(w)?\.exe$' -and $_.CommandLine -match '(?i)ComfyUI|run_comfy\.py')
} | Select-Object Name,ProcessId)
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in @($Port,$ImagePort,43189) | Select-Object LocalAddress,LocalPort,OwningProcess)
$os=Get-CimInstance Win32_OperatingSystem
if ($os.FreePhysicalMemory -lt 8GB/1KB) { $warnings.Add('Less than 8 GiB RAM available; CPU encoder/KV may page or fail. Check RAM and pagefile, not only VRAM.') }
if ($Stage -in @('before-chat','before-image')) {
    if ($processes.Count) { $blockers.Add('Existing inference service detected. Stop its owning app normally; this script never terminates processes.') }
    if ($listeners | Where-Object LocalPort -in @($Port,$ImagePort)) { $blockers.Add('Model or image port already occupied.') }
    if ($gpu.Count -eq 0) { $blockers.Add('No GPU memory inventory available.') }
    foreach ($g in $gpu) {
        if ([double]$g.freeMiB -lt 12000) { $blockers.Add("GPU $($g.index.Trim()) has less than 12000 MiB free. This conservative gate is not a proof that a model fits.") }
    }
}
$health=$null
if ($Stage -eq 'chat-ready') {
    try {
        $health=Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 5
        if ($health.status -ne 'ok') { $blockers.Add('Chat service is not ready.') }
    } catch { $blockers.Add('Chat health endpoint unavailable.') }
    if ($listeners | Where-Object LocalPort -eq $ImagePort) { $blockers.Add('Image service is still listening while chat should own the GPU.') }
}
$report=@{ timestamp=[DateTimeOffset]::UtcNow.ToString('o');stage=$Stage;gpu=$gpu;ram=@{totalMiB=[math]::Round($os.TotalVisibleMemorySize/1024);freeMiB=[math]::Round($os.FreePhysicalMemory/1024)};inferenceProcesses=$processes;listeners=$listeners;warnings=@($warnings.ToArray());blockers=@($blockers.ToArray());health=$health;scope='Read-only inventory. No automatic process termination. Does not guarantee peak VRAM fit.' }
$parent=Split-Path ([IO.Path]::GetFullPath($OutputFile)) -Parent
New-Item -ItemType Directory -Force $parent | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputFile -Encoding utf8
$report | ConvertTo-Json -Depth 8 | Write-Output
if ($blockers.Count) { throw "Preflight blocked; inspect $OutputFile" }
