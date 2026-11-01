@echo off
setlocal
cd /d "%~dp0"
set "SHUMOXIA_NODE=node"
where node.exe >nul 2>&1
if errorlevel 1 set "SHUMOXIA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "HOST=0.0.0.0"
echo LAN mode. Use http://YOUR-LAN-IP:8787 on another device on the same network.
echo Phone microphone recording needs HTTPS. Text play works over LAN HTTP.
"%SHUMOXIA_NODE%" --env-file-if-exists=.env server\http.mjs
pause
