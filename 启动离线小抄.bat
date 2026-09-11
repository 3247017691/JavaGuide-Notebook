@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem 端口：默认 3000，可用环境变量 PORT 覆盖
if "%PORT%"=="" set "PORT=3000"

if not exist node_modules (
  echo 首次运行：安装依赖...
  call npm install
)

echo 检查端口 %PORT% ...
set "KILLED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  echo   端口 %PORT% 被 PID %%p 占用，正在关闭...
  taskkill /f /pid %%p >nul 2>&1
  if not errorlevel 1 set "KILLED=1"
)
if defined KILLED (
  rem 等端口真正释放，免得紧接着 listen 报 EADDRINUSE
  ping -n 2 127.0.0.1 >nul
  echo   已释放端口 %PORT%
) else (
  echo   端口 %PORT% 空闲
)

start "" http://localhost:%PORT%
echo 启动学习报告册（Ctrl+C 停止）...
node server.js
echo.
echo 服务已停止（退出码 %ERRORLEVEL%）。
pause
