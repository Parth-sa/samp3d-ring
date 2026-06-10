@echo off
echo ========================================
echo    Ring GLB Merger - Command Line Tool
echo ========================================
echo.

if "%1"=="" (
    echo Usage:
    echo   merge-ring.bat [ring.glb] [diamond.glb] [prnc.glb] [output.glb]
    echo.
    echo Example:
    echo   merge-ring.bat "C:\path\to\Ring_501410_JV_PRN_100.glb" ^
    echo               "C:\path\to\RND.glb" ^
    echo               "C:\path\to\PRNC.glb" ^
    echo               "C:\path\to\final_ring.glb"
    echo.
    echo Or run with Node.js directly:
    echo   node glb-ring-merger.js "ring.glb" "diamond.glb" "prnc.glb" "output.glb"
    echo.
    pause
    exit /b 1
)

if "%4"=="" (
    echo Error: Missing arguments!
    echo Required: ring.glb diamond.glb prnc.glb output.glb
    echo.
    echo Usage:
    echo   merge-ring.bat [ring.glb] [diamond.glb] [prnc.glb] [output.glb]
    pause
    exit /b 1
)

echo Running merger...
echo   Ring: %1
echo   Diamond: %2
echo   PRNC: %3
echo   Output: %4
echo.

node glb-ring-merger.js "%1" "%2" "%3" "%4"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo    SUCCESS!
    echo ========================================
    echo Output saved to: %4
    echo.
    echo You can now open %4 in the web viewer!
    echo.
) else (
    echo.
    echo ========================================
    echo    FAILED!
    echo ========================================
    echo Check the error messages above.
)

pause
