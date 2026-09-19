$ErrorActionPreference = 'Stop'
Invoke-RestMethod 'http://127.0.0.1:18200/health' -TimeoutSec 10 | ConvertTo-Json
Invoke-RestMethod 'http://127.0.0.1:18200/v1/models' -TimeoutSec 10 | ConvertTo-Json -Depth 6
