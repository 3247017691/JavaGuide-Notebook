@echo off
REM === JavaGuide-Notebook HTTP push (cmd-safe, English only) ===
setlocal

REM Locate repo root relative to this script (survives Chinese/non-ASCII paths
REM that cmd's codepage would otherwise mangle into "?").
cd /d "%~dp0.."

REM --- pick a running bridge proxy port (try 7893, 7894, 7895, 7896) ---
set "PROXY_PORT="
for %%P in (7893 7894 7895 7896) do (
  netstat -ano | findstr /B /E ":%%P " | findstr "LISTENING" >nul
  if not errorlevel 1 set "PROXY_PORT=%%P" && goto :port_found
)
echo [ERROR] No SOCKS5-HTTP bridge proxy running on 7893-7896.
echo         Run in another shell: node tools\socks-http-proxy.js 7893
exit /b 1

:port_found
echo [1/4] Using local SOCKS5-HTTP bridge proxy on port %PROXY_PORT%

REM --- prepare ephemeral HOME for credentials (not persistent) ---
set "TMPHOME=%TEMP%\wb-gh-%RANDOM%"
mkdir "!TMPHOME!" 2>nul

REM token is supplied at runtime, never hardcoded (GitHub push protection / secret scanning)
 set "GH_PAT="
 set /p "GH_PAT=Paste GitHub PAT: "
if "%GH_PAT%"=="" (
  echo [ERROR] No token given.
  exit /b 1
)

(
  echo protocol=https
  echo host=github.com
  echo username=3247017691
  echo password=%GH_PAT%
) > "!TMPHOME!\.git-credentials"

echo [2/4] Credentials written to %TMPHOME% (will be cleaned after push)

REM --- ensure remote is HTTPS ---
git remote set-url origin https://github.com/3247017691/JavaGuide-Notebook.git
git remote -v

REM --- push ---
echo.
echo [3/4] Starting push (HTTP/1.1 + 500MB buffer + local proxy bridge)
echo       Expected duration: 30-40 minutes for 265MB over GFW
echo.

set "HOME=!TMPHOME!"
git -c credential.helper=store ^
    -c http.proxy=http://127.0.0.1:%PROXY_PORT% ^
    -c https.proxy=http://127.0.0.1:%PROXY_PORT% ^
    -c http.version=HTTP/1.1 ^
    -c http.postBuffer=524288000 ^
    -c core.bigFileThreshold=2g ^
    push origin main

set "PUSH_EXIT=%ERRORLEVEL%"

REM --- cleanup ---
echo.
rd /s /q "!TMPHOME!" 2>nul
echo [4/4] Credentials cleaned.

echo.
echo ===========================================
echo  push exit code: %PUSH_EXIT%
echo ===========================================
if %PUSH_EXIT% equ 0 (
  echo SUCCESS: https://github.com/3247017691/JavaGuide-Notebook
) else (
  echo FAILED (%PUSH_EXIT%). Common causes:
  echo   - GFW reset mid-upload
  echo   - SSL handshake error (schannel + HTTP/2 incompatible)
  echo   - bad token (regenerate at github.com/settings/tokens)
  echo Re-run this .bat to resume.
)

pause
endlocal
