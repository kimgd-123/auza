@echo off
chcp 65001 >nul
title AUZA Environment Check
powershell -ExecutionPolicy Bypass -File "%~dp0Check-AuzaEnv.ps1"
pause
