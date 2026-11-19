@echo off
title Sistema No Grau - DEMONSTRACAO
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado neste computador.
  echo  Baixe a versao LTS em https://nodejs.org e instale. Depois abra este arquivo de novo.
  echo.
  pause
  exit /b
)
start "" http://localhost:3001
node demo.js
pause
