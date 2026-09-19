param([switch]$Models)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $root 'downloads'
New-Item -ItemType Directory -Force $dest | Out-Null
$assets = Get-Content (Join-Path $root 'config/assets.json') -Raw | ConvertFrom-Json
foreach ($a in $assets) {
    if ($a.name -in @('model','vision') -and -not $Models) { continue }
    $file = Join-Path $dest $a.file
    if (-not (Test-Path -LiteralPath $file)) {
        & curl.exe -fL --retry 3 -o "$file.part" $a.url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($a.name)" }
        if ((Get-FileHash -LiteralPath "$file.part" -Algorithm SHA256).Hash -ne $a.sha256) { throw "SHA256 mismatch: $($a.name)" }
        Move-Item -LiteralPath "$file.part" -Destination $file
    }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $a.sha256) { throw "SHA256 mismatch: $($a.name)" }
    Write-Host "Verified: $($a.file)"
}
