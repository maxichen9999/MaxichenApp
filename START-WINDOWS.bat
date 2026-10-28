@echo off
title LoveChat starten
color 0D
cd /d "%~dp0"

echo.
echo   LoveChat wird gestartet ...
echo.

if not exist "server\node_modules" (
  echo   Erster Start: Pakete werden installiert ^(einmalig, braucht Internet^) ...
  echo.
  call npm install --no-audit --no-fund
  echo.
)

echo   Server laeuft gleich auf http://localhost:7777
echo   Fenster offen lassen. Zum Beenden: Strg + C
echo.
node server.js

echo.
echo   Der Server ist beendet.
pause
