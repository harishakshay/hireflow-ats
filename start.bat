@echo off
title HireFlow - localhost:8001
cd /d "%~dp0"
echo Starting HireFlow at http://localhost:8001  (close this window to stop)
start "" http://localhost:8001
php -S localhost:8001
pause
