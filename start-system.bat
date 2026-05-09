@echo off
cd /d "%~dp0"
echo Starting Personal Account Vault...
echo.
echo Open this address in your browser:
echo http://localhost:4173
echo.

set "NODE_EXE="
where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE_EXE=node"
) else if exist "%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe"
)

if "%NODE_EXE%"=="" (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org, then run this file again.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" server.js
pause
