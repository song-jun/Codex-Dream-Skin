@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Codex Dream Skin  -  安装并启动皮肤
echo ============================================================
echo(
echo 提示：安装前请先完全退出 Codex，并退出右下角托盘里的 Dream Skin。
echo(
echo [1/2] 安装皮肤引擎、快捷方式与托盘...
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\install-dream-skin.ps1"
if errorlevel 1 (
  echo(
  echo [失败] 安装未完成。常见原因：Codex 仍开着、托盘还在运行。
  echo        请关闭 Codex 与托盘后再次双击本脚本。
  pause
  exit /b 1
)
echo(
echo [2/2] 启动 Codex 并注入皮肤...
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\start-dream-skin.ps1" -RestartExisting
if errorlevel 1 (
  echo(
  echo [失败] 启动失败。可查看 %%LOCALAPPDATA%%\CodexDreamSkin\injector-error.log。
  pause
  exit /b 1
)
echo(
echo [成功] 皮肤已启动，Codex 窗口应已带着皮肤打开。
echo       右下角托盘可：切换已保存主题 / 换背景图 / 暂停 / 完整恢复。
echo(
pause
