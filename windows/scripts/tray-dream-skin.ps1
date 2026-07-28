[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName Microsoft.VisualBasic
  . (Join-Path $PSScriptRoot 'common-windows.ps1')
  . (Join-Path $PSScriptRoot 'theme-windows.ps1')

  Assert-DreamSkinPort -Port $Port
  $SkillRoot = Split-Path -Parent $PSScriptRoot
  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  $trayIconPath = Join-Path $SkillRoot 'assets\dream-skin.ico'

  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
  $acquired = $false
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
      # Another tray instance is already running (e.g. started by the installer).
      # Show a modal message box so the user has visible feedback even though the
      # console window is hidden / flashes briefly.
      [void][System.Windows.Forms.MessageBox]::Show(
        'Codex Dream Skin tray is already running.' + [Environment]::NewLine +
        'Check the system tray area (bottom-right). You may need to expand the overflow area (^).',
        'Codex Dream Skin',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      )
      exit 0
    }

  $notify = [System.Windows.Forms.NotifyIcon]::new()
  $notify.Icon = [System.Drawing.Icon]::new($trayIconPath)
  $notify.Text = 'Codex Dream Skin'
  $notify.Visible = $true
  $menu = [System.Windows.Forms.ContextMenuStrip]::new()
  $notify.ContextMenuStrip = $menu

  function Show-DreamSkinTrayError {
    param([string]$Message)
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      'Codex Dream Skin',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  }

  function Show-DreamSkinNotification {
    param(
      [Parameter(Mandatory = $true)][int]$DurationMs,
      [Parameter(Mandatory = $true)][string]$Title,
      [Parameter(Mandatory = $true)][string]$Message,
      [System.Windows.Forms.ToolTipIcon]$Icon = [System.Windows.Forms.ToolTipIcon]::Info
    )

    if ($null -ne $script:DreamSkinNotificationForm) {
      try { $script:DreamSkinNotificationForm.Close() } catch {}
      try { $script:DreamSkinNotificationForm.Dispose() } catch {}
      $script:DreamSkinNotificationForm = $null
    }

    $form = [System.Windows.Forms.Form]::new()
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.ShowInTaskbar = $false
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.TopMost = $true
    $form.BackColor = [System.Drawing.Color]::FromArgb(24, 27, 36)
    $form.ClientSize = [System.Drawing.Size]::new(360, 92)
    $workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $form.Location = [System.Drawing.Point]::new(
      $workingArea.Right - $form.Width - 16,
      $workingArea.Bottom - $form.Height - 16
    )

    $trayImage = $null
    try {
      $trayImage = $notify.Icon.ToBitmap()
    } catch {
      # Windows PowerShell can fail on PNG-compressed ICO frames; decode the embedded PNG directly.
      $iconBytes = [System.IO.File]::ReadAllBytes($trayIconPath)
      $pngLength = [BitConverter]::ToInt32($iconBytes, 14)
      $pngOffset = [BitConverter]::ToInt32($iconBytes, 18)
      if ($pngOffset -lt 22 -or $pngLength -le 0 -or $pngOffset + $pngLength -gt $iconBytes.Length) {
        throw 'The Dream Skin tray icon contains an invalid image frame.'
      }
      $pngStream = [System.IO.MemoryStream]::new($iconBytes, $pngOffset, $pngLength, $false)
      $pngSource = $null
      try {
        $pngSource = [System.Drawing.Bitmap]::new($pngStream)
        $trayImage = [System.Drawing.Bitmap]::new($pngSource)
      } finally {
        if ($null -ne $pngSource) { $pngSource.Dispose() }
        $pngStream.Dispose()
      }
    }
    $trayPicture = [System.Windows.Forms.PictureBox]::new()
    $trayPicture.Location = [System.Drawing.Point]::new(14, 10)
    $trayPicture.Size = [System.Drawing.Size]::new(22, 22)
    $trayPicture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    $trayPicture.Image = $trayImage

    $titleLabel = [System.Windows.Forms.Label]::new()
    $titleLabel.AutoSize = $false
    $titleLabel.Location = [System.Drawing.Point]::new(46, 9)
    $titleLabel.Size = [System.Drawing.Size]::new(296, 24)
    $titleLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $titleLabel.ForeColor = [System.Drawing.Color]::White
    $titleLabel.Font = [System.Drawing.Font]::new('Segoe UI', 10, [System.Drawing.FontStyle]::Regular)
    $titleLabel.Text = $Title

    $messageIcon = $null
    if ($Icon -eq [System.Windows.Forms.ToolTipIcon]::Info) {
      $messageIcon = [System.Drawing.SystemIcons]::Information.ToBitmap()
    } elseif ($Icon -eq [System.Windows.Forms.ToolTipIcon]::Warning) {
      $messageIcon = [System.Drawing.SystemIcons]::Warning.ToBitmap()
    } elseif ($Icon -eq [System.Windows.Forms.ToolTipIcon]::Error) {
      $messageIcon = [System.Drawing.SystemIcons]::Error.ToBitmap()
    }
    $messagePicture = $null
    if ($null -ne $messageIcon) {
      $messagePicture = [System.Windows.Forms.PictureBox]::new()
      $messagePicture.Location = [System.Drawing.Point]::new(17, 47)
      $messagePicture.Size = [System.Drawing.Size]::new(18, 18)
      $messagePicture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
      $messagePicture.Image = $messageIcon
    }

    $messageLabel = [System.Windows.Forms.Label]::new()
    $messageLabel.AutoSize = $false
    $messageLabel.Location = [System.Drawing.Point]::new(46, 37)
    $messageLabel.Size = [System.Drawing.Size]::new(296, 38)
    $messageLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $messageLabel.ForeColor = [System.Drawing.Color]::FromArgb(230, 234, 242)
    $messageLabel.Font = [System.Drawing.Font]::new('Segoe UI', 9, [System.Drawing.FontStyle]::Regular)
    $messageLabel.Text = $Message

    $form.Controls.Add($trayPicture)
    $form.Controls.Add($titleLabel)
    if ($null -ne $messagePicture) { $form.Controls.Add($messagePicture) }
    $form.Controls.Add($messageLabel)

    $timer = [System.Windows.Forms.Timer]::new()
    $timer.Interval = [Math]::Max(1000, $DurationMs)
    $timer.add_Tick({
      $timer.Stop()
      $timer.Dispose()
      if (-not $form.IsDisposed) { $form.Close() }
    }.GetNewClosure())
    $form.add_FormClosed({
      if ($script:DreamSkinNotificationForm -eq $form) {
        $script:DreamSkinNotificationForm = $null
      }
    }.GetNewClosure())
    $script:DreamSkinNotificationForm = $form
    $form.Show()
    $timer.Start()
  }

  function Start-DreamSkinPowerShell {
    param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
    $scriptToken = ConvertTo-DreamSkinProcessArgument -Value $Script
    $argumentLine = '-NoProfile -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    Start-Process -FilePath $powershell -ArgumentList $argumentLine | Out-Null
  }

  function Add-DreamSkinTrayItem {
    param(
      [Parameter(Mandatory = $true)]
      [AllowEmptyCollection()]
      [System.Windows.Forms.ToolStripItemCollection]$Items,
      [Parameter(Mandatory = $true)][string]$Text,
      [AllowNull()][scriptblock]$Action,
      [bool]$Enabled = $true
    )
    $item = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
    $item.Enabled = $Enabled
    if ($null -ne $Action) {
      $item.add_Click({
        try { & $Action } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
      }.GetNewClosure())
    }
    [void]$Items.Add($item)
    return $item
  }

  function Rebuild-DreamSkinTrayMenu {
    $menu.Items.Clear()
    $paused = Test-DreamSkinPaused -StateRoot $StateRoot
    $state = $null
    try { $state = Read-DreamSkinState -Path $paths.State } catch {}
    $active = $null
    try { $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
    $status = if ($paused) { '状态：已暂停' } elseif ($state) { '状态：运行中' } else { '状态：未运行' }
    if ($null -ne $active -and $null -ne $active.Theme -and $active.Theme.name) {
      $status += " · $($active.Theme.name)"
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text $status -Action $null -Enabled $false
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '应用或重新应用' -Action {
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
      $begin = $null
      if ($null -ne $session) {
        $begin = Show-DreamSkinOperationUi -Session $session -Phase begin -Kind apply -TimeoutMs 3000
      }
      Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
      # start-dream-skin is async; close the in-window loading so it does not stick for 180s.
      if ($null -ne $session -and $null -ne $begin -and $begin.Ok) {
        $null = Show-DreamSkinOperationUi -Session $session -Phase finish -Token $begin.Token `
          -UiState success -Message '已开始应用皮肤' -TimeoutMs 1500
      }
      Show-DreamSkinNotification -DurationMs 1800 -Title 'Codex Dream Skin' `
        -Message '正在应用皮肤…' -Icon ([System.Windows.Forms.ToolTipIcon]::Info)
    }
    # Match macOS menubar: pause = mark + live remove; resume = clear pause + re-apply.
    if ($paused) {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '继续显示皮肤' -Action {
        # Match macOS: clear pause + apply path; show in-window loading when CDP is up.
        Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
        $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
        $begin = $null
        if ($null -ne $session) {
          $begin = Show-DreamSkinOperationUi -Session $session -Phase begin -Kind apply -TimeoutMs 3000
        }
        Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
        if ($null -ne $session -and $null -ne $begin -and $begin.Ok) {
          $null = Show-DreamSkinOperationUi -Session $session -Phase finish -Token $begin.Token `
            -UiState success -Message '已开始重新应用皮肤' -TimeoutMs 1500
        }
        Show-DreamSkinNotification -DurationMs 1800 -Title 'Codex Dream Skin' `
          -Message '正在重新应用皮肤…' -Icon ([System.Windows.Forms.ToolTipIcon]::Info)
      }
    } else {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '暂停皮肤' -Action {
        # Match macOS pause: marker + live remove with in-window loading / result.
        Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
        $removal = Invoke-DreamSkinLiveRemove -StateRoot $StateRoot
        $icon = if ($removal.Removed) {
          [System.Windows.Forms.ToolTipIcon]::Info
        } else {
          [System.Windows.Forms.ToolTipIcon]::Warning
        }
        Show-DreamSkinNotification -DurationMs 2800 -Title 'Codex Dream Skin' `
          -Message $removal.Message -Icon $icon
        if (-not $removal.Removed -and $removal.Attempted) {
          Show-DreamSkinTrayError -Message $removal.Message
        }
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '更换背景图' -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = '选择 Codex Dream Skin 背景图'
      $dialog.Filter = 'Image files|*.png;*.jpg;*.jpeg;*.webp|All files|*.*'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $null = Set-DreamSkinActiveTheme -ImagePath $dialog.FileName -Theme $null -StateRoot $StateRoot
          Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          Show-DreamSkinNotification -DurationMs 1800 -Title 'Codex Dream Skin' `
            -Message '背景图已更新。' -Icon ([System.Windows.Forms.ToolTipIcon]::Info)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '保存当前主题' -Action {
      $name = [Microsoft.VisualBasic.Interaction]::InputBox('输入主题名称：', '保存 Codex Dream Skin 主题', '')
      if ($name.Trim()) {
        $saved = Save-DreamSkinCurrentTheme -Name $name -StateRoot $StateRoot
        Show-DreamSkinNotification -DurationMs 1800 -Title 'Codex Dream Skin' `
          -Message "已保存：$($saved.Theme.name)" -Icon ([System.Windows.Forms.ToolTipIcon]::Info)
      }
    }

    $savedMenu = [System.Windows.Forms.ToolStripMenuItem]::new('已保存主题')
    $savedThemes = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
    if ($savedThemes.Count -eq 0) {
      $empty = [System.Windows.Forms.ToolStripMenuItem]::new('暂无已保存主题')
      $empty.Enabled = $false
      [void]$savedMenu.DropDownItems.Add($empty)
    } else {
      foreach ($saved in $savedThemes) {
        $savedPath = $saved.Path
        $savedName = $saved.Name
        $savedAction = {
          $null = Use-DreamSkinSavedTheme -ThemeDirectory $savedPath -StateRoot $StateRoot
          Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          Show-DreamSkinNotification -DurationMs 1800 -Title 'Codex Dream Skin' `
            -Message "已应用：$savedName" -Icon ([System.Windows.Forms.ToolTipIcon]::Info)
        }.GetNewClosure()
        $null = Add-DreamSkinTrayItem -Items $savedMenu.DropDownItems -Text $savedName -Action $savedAction
      }
      [void]$savedMenu.DropDownItems.Add([System.Windows.Forms.ToolStripSeparator]::new())
      $deleteMenu = [System.Windows.Forms.ToolStripMenuItem]::new('删除已保存主题')
      foreach ($saved in $savedThemes) {
        $deletePath = $saved.Path
        $deleteName = $saved.Name
        $deleteAction = {
          $confirmation = [System.Windows.Forms.MessageBox]::Show(
            ('确定删除已保存主题 [' + $deleteName + ']？此操作不可撤销。'),
            '删除 Codex Dream Skin 主题',
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Warning,
            [System.Windows.Forms.MessageBoxDefaultButton]::Button2
          )
          if ($confirmation -ne [System.Windows.Forms.DialogResult]::Yes) { return }
          Remove-DreamSkinSavedTheme -ThemeDirectory $deletePath -StateRoot $StateRoot | Out-Null
          Show-DreamSkinNotification -DurationMs 1800 -Title 'Codex Dream Skin' `
            -Message "已删除：${deleteName}" -Icon ([System.Windows.Forms.ToolTipIcon]::Info)
        }.GetNewClosure()
        $null = Add-DreamSkinTrayItem -Items $deleteMenu.DropDownItems -Text $deleteName -Action $deleteAction
      }
      [void]$savedMenu.DropDownItems.Add($deleteMenu)
    }
    [void]$menu.Items.Add($savedMenu)

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开图片文件夹' -Action {
      Start-Process -FilePath explorer.exe -ArgumentList @($paths.Images) | Out-Null
    }
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '完全恢复 Codex' -Action {
      Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart'
      )
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '退出托盘' -Action {
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }

  $menu.add_Opening({ Rebuild-DreamSkinTrayMenu })
  $notify.add_DoubleClick({
    try {
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
    } catch {
      Show-DreamSkinTrayError -Message $_.Exception.Message
    }
  })
  [System.Windows.Forms.Application]::Run()
  } finally {
    if ($null -ne $notify) { $notify.Dispose() }
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
  }
} catch {
  $logDir = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $null = New-Item -ItemType Directory -Path $logDir -Force
  $logPath = Join-Path $logDir 'tray-error.log'
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "[$timestamp] $($_.Exception | Out-String)" | Out-File -FilePath $logPath -Append -Encoding utf8
  $msg = "Codex Dream Skin tray failed to start.`r`n`r`n$($_.Exception.Message)`r`n`r`nLog: $logPath"
  [void][System.Windows.Forms.MessageBox]::Show(
    $msg,
    'Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
}
