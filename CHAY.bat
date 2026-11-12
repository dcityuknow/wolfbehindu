@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Download the LTS version at https://nodejs.org and run again. & pause & exit /b 1)
node scripts\run.mjs
pause
