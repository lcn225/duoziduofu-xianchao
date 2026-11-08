@echo off
title Duozi Duofu - Dev Server
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Duozi Duofu  ^|  Xianchao
echo  ==================================================
echo.
echo    The browser will open at  http://localhost:2025
echo    Close this window to stop the game.
echo.

rem --- Stop a previous dev server that still holds port 2025 -------------
rem  Without this, "vite --strictPort" just exits with "Port 2025 is
rem  already in use", which looks like a crash in this window.
rem  Only processes named node.exe are killed - anything else is left alone.
rem  NOTE: no "-p tcp" here on purpose. "-p tcp" lists IPv4 only, and vite
rem  binds "localhost" to [::1] on Windows, so the old server would be
rem  invisible and this whole block would silently do nothing.
set "PORT=2025"
set "STOPPED="
set "WARNED="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    for /f "tokens=1" %%b in ('tasklist /fi "PID eq %%a" /nh') do (
        if /i "%%b"=="node.exe" (
            rem  One process can show up twice - once on 0.0.0.0, once on
            rem  [::] - so the second taskkill is expected to fail; only
            rem  report the successes.
            taskkill /f /pid %%a >nul 2>&1
            if not errorlevel 1 (
                echo  [i] Stopped previous dev server on port %PORT% ^(PID %%a^).
                set "STOPPED=1"
            )
        ) else (
            if not defined WARNED (
                echo  [!] Port %PORT% is held by "%%b" ^(PID %%a^) - not touching it.
                set "WARNED=1"
            )
        )
    )
)
if defined STOPPED (
    echo      Its old window will say "Server stopped" - you can close it.
    rem  Give Windows a moment to actually release the socket.
    ping -n 4 127.0.0.1 >nul
)

rem  Last check: if the port is still taken, letting vite run only prints a
rem  cryptic "Port 2025 is already in use" and exits - stop here with a hint.
set "STILL="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do set "STILL=%%a"
if defined STILL (
    echo.
    echo  [X] Port %PORT% is still in use by PID %STILL%. Not starting the server.
    echo      Close the program that holds it ^(or run this file as administrator^),
    echo      then run this file again.
    echo.
    pause
    exit /b 1
)
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
