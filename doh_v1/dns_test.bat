@echo off
REM 快速DNS测试脚本 - Windows批处理版本
REM 使用方法: dns_test.bat 8868d68.app

setlocal enabledelayedexpansion

set DOMAIN=%1
if "%DOMAIN%"=="" set DOMAIN=8868d68.app

echo ==========================================
echo DNS快速测试工具
echo 测试域名: %DOMAIN%
echo ==========================================
echo.

echo 1. 使用系统默认DNS解析:
nslookup %DOMAIN%
echo.

echo 2. 使用Google DNS (8.8.8.8) 解析:
nslookup %DOMAIN% 8.8.8.8
echo.

echo 3. 使用Cloudflare DNS (1.1.1.1) 解析:
nslookup %DOMAIN% 1.1.1.1
echo.

echo 4. 使用阿里DNS (223.5.5.5) 解析:
nslookup %DOMAIN% 223.5.5.5
echo.

echo 5. 清除DNS缓存并重新测试:
ipconfig /flushdns
echo DNS缓存已清除
echo.
nslookup %DOMAIN%
echo.

echo ==========================================
echo 测试完成
echo ==========================================
pause

