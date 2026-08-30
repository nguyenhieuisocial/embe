[CmdletBinding()]
param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
& (Join-Path $ProjectRoot "scripts\provision-local-integrations.ps1") -ProjectRoot $ProjectRoot -RotateOnly | Out-Null
& (Join-Path $ProjectRoot "scripts\rotate-babybuddy-memos-pats.ps1") -ProjectRoot $ProjectRoot | Out-Null
[ordered]@{ status = "ready"; checked = 2 } | ConvertTo-Json -Compress
