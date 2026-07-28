@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Codex Dream Skin  -  安装并启动皮肤
echo ============================================================
echo(
echo 提示：脚本会自动关闭 Codex 与右下角托盘，然后安装皮肤并启动。
echo(
echo [1/3] 自动关闭 Codex 与托盘...
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\install-dream-skin.ps1"
if errorlevel 1 (
  echo(
  echo [失败] 安装未完成。请查看上方错误信息。
  pause
  exit /b 1
)
echo(
echo [2/3] 启动 Codex 并注入皮肤...
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\start-dream-skin.ps1" -RestartExisting
if errorlevel 1 (
  echo(
  echo [失败] 启动失败。可查看 %%LOCALAPPDATA%%\CodexDreamSkin\injector-error.log。
  pause
  exit /b 1
)
echo(
echo [3/3] 皮肤已启动，Codex 窗口应已带着皮肤打开；右下角托盘可切换已保存主题 / 换背景图 / 暂停 / 完整恢复。
echo(
pause
