#requires -Version 7.0
param([ValidateSet('iq3','qqz','heretic')][string]$Model='iq3', [string]$Destination, [switch]$Vision)
$ErrorActionPreference='Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $Destination) { $Destination = Join-Path $root 'downloads' }
New-Item -ItemType Directory -Force $Destination | Out-Null
$catalog = Get-Content (Join-Path $root 'config/chat-models.json') -Raw | ConvertFrom-Json
$assets = @($catalog.$Model)
if ($Vision) { $assets += Get-Content (Join-Path $root 'config/assets.json') -Raw | ConvertFrom-Json | Where-Object name -eq 'vision' }
foreach ($asset in $assets) {
    $target = Join-Path $Destination $asset.file
    if (-not (Test-Path -LiteralPath $target)) {
        & curl.exe -fL --retry 3 -C - -o ($target + '.part') $asset.url
        if ($LASTEXITCODE -ne 0) { throw 'Download incomplete; rerun to resume.' }
        if ((Get-FileHash -LiteralPath ($target + '.part')).Hash -ne $asset.sha256) { throw 'Download hash mismatch; inspect the .part file before retrying.' }
        Move-Item -LiteralPath ($target + '.part') -Destination $target
    }
    if ((Get-FileHash -LiteralPath $target).Hash -ne $asset.sha256) { throw "SHA256 mismatch: $target" }
    Write-Host "Verified $($asset.file)"
}
