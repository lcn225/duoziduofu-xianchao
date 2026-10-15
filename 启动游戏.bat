@echo off
title Duozi Duofu - Dev Server
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Duozi Duofu  ^|  多子多福：开创仙朝
echo  ==================================================
echo.
echo    The browser will open at  http://localhost:2025
echo    Close this window to stop the game.
echo.

if not exist "node_modules" (
    echo  [!] node_modules not found - running "npm install" first...
    echo      This can take a few minutes on the first run.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [X] npm install FAILED. Check your network and Node version.
        echo.
        pause
        exit /b 1
    )
)

call npm run dev

echo.
echo  Server stopped.
pause
