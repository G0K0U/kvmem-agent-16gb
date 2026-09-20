#Requires -Version 5.1
<#
.SYNOPSIS
  Restores the most recent pre-compaction-fix backup of dsh-compaction-basic.
#>
param(
    [Parameter(Mandatory = $true)][string]$DshAppRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$lib = Join-Path $DshAppRoot 'node_modules\@deepseek-ai\dsh-compaction-basic\lib'
$target = Join-Path $lib 'index.js'
$bak = Get-ChildItem -LiteralPath $lib -Filter 'index.js.pre-compaction-fix-*.bak' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$bak) { throw "No pre-compaction-fix backup found in $lib" }

Copy-Item -LiteralPath $bak.FullName -Destination $target -Force
Write-Output "Restored $($bak.Name) -> index.js"
Write-Output 'Restart DSH Desktop so the harness reloads the restored module.'
