@echo off
setlocal
set "CPM_ROOT=%~dp0.."
set "CLI_JS=%CPM_ROOT%\lib\cli.js"

if defined CHEVRON_EXECUTABLE if exist "%CHEVRON_EXECUTABLE%" (
  set ELECTRON_RUN_AS_NODE=1
  "%CHEVRON_EXECUTABLE%" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if defined ELECTRON_PATH if exist "%ELECTRON_PATH%" (
  set ELECTRON_RUN_AS_NODE=1
  "%ELECTRON_PATH%" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

REM Packaged: resources\app\cpm\bin → ..\..\..\Chevron.exe
if exist "%~dp0..\..\..\Chevron.exe" (
  set ELECTRON_RUN_AS_NODE=1
  "%~dp0..\..\..\Chevron.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%~dp0..\..\..\chevron.exe" (
  set ELECTRON_RUN_AS_NODE=1
  "%~dp0..\..\..\chevron.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

echo cpm: warning: product Electron binary not found; using host node >&2
node "%CLI_JS%" %*
exit /b %ERRORLEVEL%
