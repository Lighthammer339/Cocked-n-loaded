@echo off
cd /d "%~dp0"
set CF=cloudflared
where cloudflared >nul 2>nul || set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"

echo Starting game server...
start "BALLISTIC server" python server.py
timeout /t 2 >nul

echo.
echo ================================================================
echo  Look below for a line like:
echo     https://something-something.trycloudflare.com
echo  Open it yourself and send it to your friends.
echo  Keep THIS window and the server window open while playing.
echo ================================================================
echo.
%CF% tunnel --url http://localhost:8080
pause
