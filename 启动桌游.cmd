@echo off
setlocal
cd /d "%~dp0"
set "SHUMOXIA_NODE=node"
where node.exe >nul 2>&1
if errorlevel 1 set "SHUMOXIA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
echo Open http://127.0.0.1:8787 in your browser. Keep this window open.
"%SHUMOXIA_NODE%" --env-file-if-exists=.env server\http.mjs
pause
