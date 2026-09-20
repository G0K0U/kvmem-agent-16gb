#Requires -Version 5.1
<#
.SYNOPSIS
  Installs the compaction-replay fix into a DSH Desktop installation.

.DESCRIPTION
  Patches node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js with the
  chunked map-reduce summarizer + replay-failure self-healing for the
  "multimodal query replay failed or cancelled" bug. The target file must match
  dsh-compaction-basic 0.1.6-alpha.2 (hash-verified) before it is replaced.
  The original file is backed up beside itself as
  index.js.pre-compaction-fix-<timestamp>.bak.

  Run the matching test suite afterwards (see README.md in this folder), then
  restart DSH Desktop so the harness reloads the module.

.PARAMETER DshAppRoot
  The DSH Desktop app root, e.g.
  "C:\Users\<you>\AppData\Local\Programs\DSH Desktop Beta\resources\app"

.EXAMPLE
  .\Install.ps1 -DshAppRoot "C:\Users\me\AppData\Local\Programs\DSH Desktop Beta\resources\app"
#>
param(
    [Parameter(Mandatory = $true)][string]$DshAppRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$target = Join-Path $DshAppRoot 'node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js'
if (!(Test-Path $target)) { throw "Target not found: $target" }

$originalSha256 = 'F523795257C81D93D70AF8F946853A21AC12CCBD8949EDAFFEFD379095CE1122'
$patchedSha256  = 'C86F39AF516F8F26A2A3FF5AEEB18C0EC0CD20F4BF3E4397446B698ADFDBC78A'

$actual = (Get-FileHash -Algorithm SHA256 $target).Hash
if ($actual -eq $patchedSha256) {
    Write-Output 'Already installed: the target file is the patched version. Nothing to do.'
    return
}
if ($actual -ne $originalSha256) {
    throw ("Target file does not match dsh-compaction-basic 0.1.6-alpha.2 (hash mismatch). " +
           "This patch is version-pinned; verify your installed package version before proceeding.")
}

$backup = "$target.pre-compaction-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
Copy-Item -LiteralPath $target -Destination $backup
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'index.patched.js') -Destination $target

$copied = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
if ($copied -ne $patchedSha256) { throw ("Post-install hash mismatch (got $copied); restore from the .bak and investigate.") }

Write-Output "Installed. Backup: $backup"
Write-Output 'Restart DSH Desktop so the harness reloads the patched module.'
