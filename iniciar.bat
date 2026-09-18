@echo off
title AeroSIATA - Calidad del Aire Valle de Aburra
echo ======================================================
echo    🌫️ Iniciando AeroSIATA - Monitor de Calidad del Aire
echo ======================================================
echo.
start http://localhost:8080
node server.js
pause
