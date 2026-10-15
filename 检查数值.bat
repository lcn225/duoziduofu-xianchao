@echo off
title Duozi Duofu - Verify Harmony
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Duozi Duofu  ^|  harmony assertions
echo  ==================================================
echo.
echo    Checks every number in the cultivation design
echo    (harmony / gates / tier caps). No browser needed.
echo.

call npm run verify

echo.
pause
