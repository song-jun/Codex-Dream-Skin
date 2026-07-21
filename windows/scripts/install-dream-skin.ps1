[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$SkillRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-DreamSkinOperationLock
try {
  Assert-DreamSkinPort -Port $Port
  $null = Get-DreamSkinNodeRuntime
  $registeredInstalls = @(Get-DreamSkinRegisteredCodexInstalls)
  if ($registeredInstalls.Count -eq 0) {
    throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.'
  }
  # Auto-close tray + Codex in parallel before install/reinstall.
  # Tray close is a synchronous powershell kill on this process; Codex close is a separate
  # heavy operation (15s graceful close + force kill) that we hand off to a background
  # powershell so the install flow does not block on it.
  $codexCloseProc = $null
  try {
    $codexCloseProc = Start-Process -FilePath (Get-Command powershell.exe -ErrorAction Stop).Source `
      -ArgumentList @(
        '-NoProfile','-ExecutionPolicy','RemoteSigned','-File',
        (Join-Path $PSScriptRoot 'close-codex-background.ps1')
      ) `
      -PassThru -WindowStyle Hidden
  } catch {
    Write-Warning ("Could not launch background Codex closer, falling back to inline: " + $_.Exception.Message)
  }

  Stop-DreamSkinTrayProcess -KeepProcessIds @($codexCloseProc.Id)
  if (-not (Wait-DreamSkinTrayInactive -TimeoutSeconds 2)) {
    throw 'The Dream Skin tray did not release its mutex within 2 seconds. Right-click the tray icon and choose Quit, then run this script again.'
  }

  if ($null -ne $codexCloseProc) {
    # Wait for the background Codex closer; if it does not finish in 10s, continue anyway
    # (we re-check process state below and abort if Codex is still alive).
    if (-not $codexCloseProc.WaitForExit(10000)) {
      try { Stop-Process -Id $codexCloseProc.Id -Force -ErrorAction SilentlyContinue } catch {}
      Write-Warning 'Background Codex close did not finish within 10 seconds; continuing.'
    }
  } else {
    foreach ($registeredCodex in $registeredInstalls) {
      Stop-DreamSkinCodex -Codex $registeredCodex -AllowForce
    }
  }

  foreach ($registeredCodex in $registeredInstalls) {
    if ((Get-DreamSkinCodexProcesses -Codex $registeredCodex).Count -gt 0) {
      throw 'Close Codex before installing Dream Skin so config.toml cannot change during the transaction.'
    }
  }

  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $themePaths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $existingState = Read-DreamSkinState -Path $StatePath
  $savedPathCandidate = Get-DreamSkinCodexStatePathCandidate -State $existingState
  $savedCodex = Resolve-DreamSkinCodexInstallFromState -State $existingState -RegisteredInstalls $registeredInstalls
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and
    (Get-DreamSkinCodexProcesses -Codex $savedPathCandidate).Count -gt 0) {
    throw 'The saved Codex path is still running but no longer matches a registered Store package. Close it manually before installing.'
  }
  if (Test-DreamSkinTrayActive) {
    throw 'Exit the Codex Dream Skin tray before reinstalling so every shortcut can move to the new runtime safely.'
  }
  $engine = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  $null = Initialize-DreamSkinThemeStore -SkillRoot $engine.Root -StateRoot $StateRoot
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
  Install-DreamSkinBaseTheme -ConfigPath $ConfigPath -BackupPath $BackupPath

  if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $startScript = $engine.Start
    $restoreScript = $engine.Restore
    $trayScript = $engine.Tray
    $portArgument = if ($PortExplicit) { " -Port $Port" } else { '' }

    foreach ($folder in @($desktop, $startMenu)) {
      $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex Dream Skin.lnk'))
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$startScript`"$portArgument -PromptRestart"
      $shortcut.WorkingDirectory = $engine.Root
      $shortcut.Description = 'Launch the official Codex app with Codex Dream Skin'
      $shortcut.Save()
    }

    $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Dream Skin - Restore.lnk'))
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$restoreScript`"$portArgument -RestoreBaseTheme -PromptRestart"
    $restore.WorkingDirectory = $engine.Root
    $restore.Description = 'Restore the official Codex appearance and close the CDP session'
    $restore.Save()

    foreach ($folder in @($desktop, $startMenu)) {
      $tray = $shell.CreateShortcut((Join-Path $folder 'Codex Dream Skin - Tray.lnk'))
      $tray.TargetPath = $powershell
      $tray.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$trayScript`"$portArgument"
      $tray.WorkingDirectory = $engine.Root
      $tray.Description = 'Open Codex Dream Skin status and theme controls in the system tray'
      $tray.Save()
    }
    Start-Process -FilePath $powershell -ArgumentList `
      "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$trayScript`"$portArgument" `
      -WindowStyle Hidden | Out-Null
  }

  if ($NoShortcuts) {
    Write-Host "Codex Dream Skin base theme installed at $($engine.Root). Run $($engine.Start) to launch it."
  } else {
    Write-Host 'Codex Dream Skin installed. The launch shortcut asks before restarting an open Codex window.'
  }
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}
