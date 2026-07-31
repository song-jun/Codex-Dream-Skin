[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('status', 'use-theme', 'save-theme', 'set-image', 'update-theme', 'start', 'pause', 'resume', 'restore')][string]$Action,
  [string]$ThemeId,
  [string]$ThemeName,
  [string]$ImagePath,
  [string]$ThemeJson,
  [string]$ScriptsRoot
)

$ErrorActionPreference = 'Stop'
# PowerShell 5.1 inherits the active console code page. Electron decodes the
# bridge stream as UTF-8, so make the machine-readable boundary explicit.
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$installedScripts = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine\scripts'
if (-not $ScriptsRoot) {
  $ScriptsRoot = if (Test-Path -LiteralPath (Join-Path $installedScripts 'common-windows.ps1')) {
    $installedScripts
  } else {
    Join-Path $repoRoot 'windows\scripts'
  }
}
$ScriptsRoot = [System.IO.Path]::GetFullPath($ScriptsRoot)
$common = Join-Path $ScriptsRoot 'common-windows.ps1'
$themeScript = Join-Path $ScriptsRoot 'theme-windows.ps1'
if (-not (Test-Path -LiteralPath $common) -or -not (Test-Path -LiteralPath $themeScript)) {
  throw "Dream Skin runtime scripts are missing: $ScriptsRoot"
}
. $common
. $themeScript

$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$paths = Get-DreamSkinThemePaths -StateRoot $stateRoot
$skillRoot = Split-Path -Parent $ScriptsRoot
$null = Initialize-DreamSkinThemeStore -SkillRoot $skillRoot -StateRoot $stateRoot

function Get-ThemeSnapshot {
  param([Parameter(Mandatory = $true)][string]$Directory)
  $loaded = Read-DreamSkinTheme -ThemeDirectory $Directory -SkipImageMetadata
  return [pscustomobject]@{
    id = if ($loaded.Theme.id) { "$($loaded.Theme.id)" } else { [System.IO.Path]::GetFileName($Directory) }
    name = if ($loaded.Theme.name) { "$($loaded.Theme.name)" } else { [System.IO.Path]::GetFileName($Directory) }
    imagePath = $loaded.ImagePath
    path = $loaded.Directory
    theme = $loaded.Theme
  }
}

function Get-Snapshot {
  $state = $null
  try { $state = Read-DreamSkinState -Path $paths.State } catch { $state = $null }
  $active = Get-ThemeSnapshot -Directory $paths.Active
  $saved = @(
    foreach ($entry in Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata) {
      try { Get-ThemeSnapshot -Directory $entry.Path } catch {}
    }
  )
  $paused = Test-DreamSkinPaused -StateRoot $stateRoot
  $codexRunning = $false
  try {
    $codex = Get-DreamSkinCodexInstall
    $codexRunning = (Get-DreamSkinCodexProcesses -Codex $codex).Count -gt 0
  } catch {}
  $session = if ($paused) { 'paused' } elseif ($null -ne $state) { 'active' } else { 'off' }
  return [pscustomobject]@{
    platform = 'windows'
    session = $session
    codexRunning = $codexRunning
    injectorAlive = ($null -ne $state)
    port = if ($state -and $state.port) { [int]$state.port } else { 9335 }
    active = $active
    themes = $saved
    stateUpdatedAt = if ($state) { "$($state.createdAt)" } else { $null }
  }
}

switch ($Action) {
  'status' {
    $result = Get-Snapshot
  }
  'use-theme' {
    if (-not $ThemeId -or $ThemeId -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Theme id is invalid.' }
    $candidate = @(Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata |
      Where-Object { "$($_.Id)" -ceq $ThemeId })
    if ($candidate.Count -ne 1) { throw 'The requested saved theme was not found.' }
    $null = Use-DreamSkinSavedTheme -ThemeDirectory $candidate[0].Path -StateRoot $stateRoot
    $result = [pscustomobject]@{ ok = $true; action = $Action; snapshot = Get-Snapshot }
  }
  'save-theme' {
    if (-not $ThemeName) { throw 'Theme name is required.' }
    $saved = Save-DreamSkinCurrentTheme -Name $ThemeName -StateRoot $stateRoot
    $result = [pscustomobject]@{ ok = $true; action = $Action; savedTheme = (Get-ThemeSnapshot -Directory $saved.Directory); snapshot = Get-Snapshot }
  }
  'set-image' {
    if (-not $ImagePath) { throw 'Image path is required.' }
    $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata
    $theme = $active.Theme | ConvertTo-Json -Depth 12 | ConvertFrom-Json
    $null = Set-DreamSkinActiveTheme -ImagePath $ImagePath -Theme $theme -StateRoot $stateRoot
    $result = [pscustomobject]@{ ok = $true; action = $Action; snapshot = Get-Snapshot }
  }
  'update-theme' {
    if (-not $ThemeJson) { throw 'Theme JSON is required.' }
    try { $patch = $ThemeJson | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Theme JSON is invalid.' }
    if ($null -eq $patch.art) { throw 'Theme art settings are missing.' }
    $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata
    $theme = $active.Theme | ConvertTo-Json -Depth 12 | ConvertFrom-Json
    if (-not $theme.art) { $theme | Add-Member -NotePropertyName art -NotePropertyValue ([pscustomobject]@{}) -Force }
    if ($null -ne $patch.art.maskOpacity) {
      $opacity = 0.0
      if (-not [double]::TryParse("$($patch.art.maskOpacity)", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$opacity) -or $opacity -lt 0 -or $opacity -gt 1) { throw 'Mask opacity must be between 0 and 1.' }
      $theme.art | Add-Member -NotePropertyName maskOpacity -NotePropertyValue $opacity -Force
    }
    foreach ($mode in @('Light', 'Dark')) {
      $property = "maskOpacity$mode"
      $value = $patch.art.$property
      if ($null -ne $value) {
        $opacity = 0.0
        if (-not [double]::TryParse("$value", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$opacity) -or $opacity -lt 0 -or $opacity -gt 1) { throw 'Mask opacity must be between 0 and 1.' }
        $theme.art | Add-Member -NotePropertyName $property -NotePropertyValue $opacity -Force
      }
    }
    if ($null -ne $patch.art.caretColor) {
      $caretColor = "$($patch.art.caretColor)".Trim()
      if ($caretColor -notmatch '^(#[\da-f]{3,8}|(rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$') { throw 'Caret color is invalid.' }
      $theme.art | Add-Member -NotePropertyName caretColor -NotePropertyValue $caretColor -Force
    }
    foreach ($mode in @('Light', 'Dark')) {
      $property = "caretColor$mode"
      $value = $patch.art.$property
      if ($null -ne $value) {
        $caretColor = "$value".Trim()
        if ($caretColor -notmatch '^(#[\da-f]{3,8}|(rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$') { throw 'Caret color is invalid.' }
        $theme.art | Add-Member -NotePropertyName $property -NotePropertyValue $caretColor -Force
      }
    }
    Write-DreamSkinTheme -ThemeDirectory $paths.Active -Theme $theme
    $result = [pscustomobject]@{ ok = $true; action = $Action; snapshot = Get-Snapshot }
  }
  'start' {
    & (Join-Path $ScriptsRoot 'start-dream-skin.ps1') -RestartExisting | Out-Null
    $result = [pscustomobject]@{ ok = $true; action = $Action; snapshot = Get-Snapshot }
  }
  'pause' {
    $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
    $removal = Invoke-DreamSkinLiveRemove -StateRoot $stateRoot
    $result = [pscustomobject]@{ ok = [bool]$removal.Removed; action = $Action; message = "$($removal.Message)"; snapshot = Get-Snapshot }
  }
  'resume' {
    $null = Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot
    & (Join-Path $ScriptsRoot 'start-dream-skin.ps1') -RestartExisting | Out-Null
    $result = [pscustomobject]@{ ok = $true; action = $Action; snapshot = Get-Snapshot }
  }
  'restore' {
    & (Join-Path $ScriptsRoot 'restore-dream-skin.ps1') -RestoreBaseTheme -ForceRestart | Out-Null
    $result = [pscustomobject]@{ ok = $true; action = $Action; snapshot = Get-Snapshot }
  }
}

$result | ConvertTo-Json -Depth 12 -Compress
