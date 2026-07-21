@echo off
REM Prefer cpm apm shim (Phase 1); fall back to classic apm.
if exist "%~dp0\..\app\cpm\bin\apm.cmd" (
  "%~dp0\..\app\cpm\bin\apm.cmd" %*
) else (
  "%~dp0\..\app\apm\bin\apm.cmd" %*
)
