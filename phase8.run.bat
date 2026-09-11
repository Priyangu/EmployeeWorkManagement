@echo OFF
setlocal EnableDelayedExpansion

REM ============================================================================
REM Phase 8 — fast path: assume DB + seed + client already ready.
REM Starts API + web only. If you haven't run phase8.full.bat yet, skip this
REM and run phase8.full.bat instead (it does the DB/migrate/seed step).
REM ============================================================================

set ROOT_DIR=%~dp0
set WORK_DIR=%ROOT_DIR:~0,-1%
set API_DIR=%WORK_DIR%\apps\api
set WEB_DIR=%WORK_DIR%\apps\web

echo.
echo ============================================================
echo Phase 8 — fast start (API + web only)
echo ============================================================
echo.

REM --- Quick pre-flight checks ----------------------------------------------------------------
echo [pre] Checking DB container...
call :run docker compose ps -q db >nul 2>&1
if !errorlevel! neq 0 (
    echo   DB container not running. Use phase8.full.bat instead (it brings DB up).
    echo   Or:  cd "%WORK_DIR%" && docker compose up -d db
    exit /b 1
)

echo [pre] Checking API client present...
if not exist "%API_DIR%\node_modules\@prisma\client" (
    echo   Prisma client missing. Re-run phase8.full.bat, or run manually:
    echo     cd "%API_DIR%" && pnpm prisma generate
    exit /b 1
)

echo [pre] Checking web node_modules present...
if not exist "%WEB_DIR%\node_modules" (
    echo   Web node_modules missing. Run: cd "%WORK_DIR%" && pnpm install
    exit /b 1
)

echo [pre] Killing any previous API/watch process on port 3001 (if leftover)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R "LISTENING" ^| findstr ":3001 "') do (
    taskkill //F //PID %%a >nul 2>&1
)

REM --- Start API + web -------------------------------------------------------------------------
echo.
echo Starting API (port 3001) and web (port 3000)...
echo   API window : http://localhost:3001
echo   WEB window : http://localhost:3000
echo.

start "" cmd /c "cd /d "%API_DIR%" && echo. && echo === @ewm/api dev === && pnpm dev"
start "" cmd /c "cd /d "%WEB_DIR%" && echo. && echo === @ewm/web dev === && pnpm dev"

echo.
echo ============================================================
echo Bootstrap complete.
echo   API  : http://localhost:3001
echo   WEB  : http://localhost:3000
echo ============================================================
goto :eof


REM -----------------------------------------------------------------------------
REM Helper routines
REM -----------------------------------------------------------------------------
:run
setlocal
set "CMD=%~1"
echo     RUN: %CMD%
%CMD%
set "RC=!errorlevel!"
endlocal & exit /b !RC!

endlocal
