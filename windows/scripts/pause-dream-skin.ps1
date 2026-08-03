[CmdletBinding()]
param([int]$TimeoutMs = 8000)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-DreamSkinOperationLock
try {
  $stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $null = Initialize-DreamSkinThemeStore -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $stateRoot
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  $removal = Invoke-DreamSkinLiveRemove -StateRoot $stateRoot -TimeoutMs $TimeoutMs
  $result = [pscustomobject]@{
    action = 'pause'
    paused = $true
    attempted = [bool]$removal.Attempted
    removed = [bool]$removal.Removed
    message = "$($removal.Message)"
  }
  $result | ConvertTo-Json -Compress
  if ($removal.Attempted -and -not $removal.Removed) { exit 1 }
} finally {
  if ($null -ne $operationLock) { Exit-DreamSkinOperationLock -Mutex $operationLock }
}
