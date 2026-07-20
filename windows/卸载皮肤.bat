@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Codex Dream Skin  -  卸载并恢复官方外观
echo ============================================================
echo.
echo 即将：关闭 Codex - 移除皮肤与调试通道 - 恢复官方外观 - 删除快捷方式 - 重开 Codex
echo.
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\restore-dream-skin.ps1" -RestoreBaseTheme -Uninstall -PromptRestart
if not errorlevel 1 goto ok
echo.
echo 首选方式未成功（可能没有配置备份），改用「仅移除皮肤与快捷方式」...
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\restore-dream-skin.ps1" -Uninstall -PromptRestart
if errorlevel 1 (
  echo.
  echo [失败] 卸载未完成。请手动关闭 Codex 后再次双击本脚本。
  pause
  exit /b 1
)
:ok
echo.
echo [成功] 已卸载，Codex 已恢复官方外观。
echo.
pause
