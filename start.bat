@echo off
title Internet Merger — Multi-Link Download Accelerator
cd /d "%~dp0"
echo =========================================================
echo   Starting Internet Merger Launcher...
echo =========================================================
python run.py %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo An error occurred while running Internet Merger.
    pause
)
