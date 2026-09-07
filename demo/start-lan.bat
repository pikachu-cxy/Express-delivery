@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  极速外卖 Demo · 局域网分享
echo  --------------------------------
echo  本机访问:  http://127.0.0.1:8765/
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%b in ("%%a") do (
    echo  局域网访问: http://%%b:8765/
  )
)

echo.
echo  请让同一 WiFi / 局域网下的同伴用手机或电脑打开上面的地址。
echo  若打不开，请在 Windows 防火墙中放行 TCP 8765 端口。
echo  按 Ctrl+C 可停止服务。
echo.

python -m http.server 8765 --bind 0.0.0.0
