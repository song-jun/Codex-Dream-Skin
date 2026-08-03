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
  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $StatePath = Join-Path $StateRoot 'state.json'
  Ensure-DreamSkinManagedDirectory -Path $StateRoot -Root $StateRoot
  $existingState = Read-DreamSkinState -Path $StatePath
  if ($null -ne $existingState) {
    $injectorStopped = Stop-DreamSkinRecordedInjector -State $existingState
    if (-not $injectorStopped) {
      $staleStatePath = Archive-DreamSkinStateFile -Path $StatePath
      Write-Warning "Archived stale Dream Skin state at $staleStatePath"
    }
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
    # Wait for the background Codex closer; if it does not finish in 15s, continue anyway
    # (we re-check process state below and abort if Codex is still alive).
    if (-not $codexCloseProc.WaitForExit(15000)) {
      try { Stop-Process -Id $codexCloseProc.Id -Force -ErrorAction SilentlyContinue } catch {}
      Write-Warning 'Background Codex close did not finish within 15 seconds; continuing.'
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

  $themePaths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
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
    $desktopFolder = Join-Path $desktop 'Codex Skin'
    $null = New-Item -ItemType Directory -Path $desktopFolder -Force
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $startScript = $engine.Start
    $restoreScript = $engine.Restore
    $trayScript = $engine.Tray
    $portArgument = if ($PortExplicit) { " -Port $Port" } else { '' }

    $startShortcut = $shell.CreateShortcut((Join-Path $desktopFolder 'Codex Dream Skin.lnk'))
    $startShortcut.TargetPath = $powershell
    $startShortcut.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$startScript`"$portArgument -PromptRestart"
    $startShortcut.WorkingDirectory = $engine.Root
    $startShortcut.Description = 'Launch the official Codex app with Codex Dream Skin'
    $startShortcut.Save()

    $startMenuShortcut = $shell.CreateShortcut((Join-Path $startMenu 'Codex Dream Skin.lnk'))
    $startMenuShortcut.TargetPath = $powershell
    $startMenuShortcut.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$startScript`"$portArgument -PromptRestart"
    $startMenuShortcut.WorkingDirectory = $engine.Root
    $startMenuShortcut.Description = 'Launch the official Codex app with Codex Dream Skin'
    $startMenuShortcut.Save()

    $restore = $shell.CreateShortcut((Join-Path $desktopFolder 'Codex Dream Skin - Restore.lnk'))
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$restoreScript`"$portArgument -RestoreBaseTheme -PromptRestart"
    $restore.WorkingDirectory = $engine.Root
    $restore.Description = 'Restore the official Codex appearance and close the CDP session'
    $restore.Save()

    $tray = $shell.CreateShortcut((Join-Path $desktopFolder 'Codex Dream Skin - Tray.lnk'))
    $tray.TargetPath = $powershell
    $tray.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$trayScript`"$portArgument"
    $tray.WorkingDirectory = $engine.Root
    $tray.Description = 'Open Codex Dream Skin status and theme controls in the system tray'
    $tray.Save()

    $startMenuTray = $shell.CreateShortcut((Join-Path $startMenu 'Codex Dream Skin - Tray.lnk'))
    $startMenuTray.TargetPath = $powershell
    $startMenuTray.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$trayScript`"$portArgument"
    $startMenuTray.WorkingDirectory = $engine.Root
    $startMenuTray.Description = 'Open Codex Dream Skin status and theme controls in the system tray'
    $startMenuTray.Save()
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
