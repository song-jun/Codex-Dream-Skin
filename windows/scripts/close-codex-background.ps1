# close-codex-background.ps1
# 后台关闭所有已注册的 Codex 进程，被 install-dream-skin.ps1 用 Start-Process 启动并行执行
# 独立进程运行，避免阻塞主安装流程的预关闭阶段
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'common-windows.ps1')
. (Join-Path $here 'theme-windows.ps1')

$registeredInstalls = @(Get-DreamSkinRegisteredCodexInstalls)
foreach ($c in $registeredInstalls) {
  try {
    Stop-DreamSkinCodex -Codex $c -AllowForce
  } catch {
    Write-Host "codex close failed for $($c.Executable): $($_.Exception.Message)"
  }
}
