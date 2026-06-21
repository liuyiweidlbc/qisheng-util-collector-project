@echo off
REM 快速修复hosts文件 - 添加8868d68.app的IP映射
REM 需要管理员权限运行

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ERROR: This script requires administrator privileges!
    echo Please right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo ==========================================
echo Quick Fix Hosts File
echo Domain: 8868d68.app
echo IP Address: 20.255.104.21
echo ==========================================
echo.

set DOMAIN=8868d68.app
set IP=20.255.104.21
set HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts

:: 备份hosts文件
echo 1. Backing up hosts file...
set BACKUP_FILE=%HOSTS_FILE%.backup.%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_FILE=%BACKUP_FILE: =0%
copy "%HOSTS_FILE%" "%BACKUP_FILE%" >nul 2>&1
if %errorLevel% equ 0 (
    echo    OK - Backup created: %BACKUP_FILE%
) else (
    echo    WARNING - Backup failed, but continuing...
)
echo.

:: 检查是否已存在该域名
echo 2. Checking existing entries...
findstr /C:"%DOMAIN%" "%HOSTS_FILE%" >nul 2>&1
if %errorLevel% equ 0 (
    echo    Found existing %DOMAIN% entry, removing...
    :: 创建临时文件，排除该域名
    findstr /V /C:"%DOMAIN%" "%HOSTS_FILE%" > "%HOSTS_FILE%.tmp"
    move /Y "%HOSTS_FILE%.tmp" "%HOSTS_FILE%" >nul
    echo    OK - Old entries removed
) else (
    echo    OK - No old entries found
)
echo.

:: 添加新条目
echo 3. Adding hosts entry...
(
echo %IP%    %DOMAIN%
)>> "%HOSTS_FILE%"
if %errorLevel% equ 0 (
    echo    OK - Added: %IP%    %DOMAIN%
) else (
    echo    ERROR - Failed to add entry
    pause
    exit /b 1
)
echo.

:: 清除DNS缓存
echo 4. Flushing DNS cache...
ipconfig /flushdns >nul 2>&1
if %errorLevel% equ 0 (
    echo    OK - DNS cache flushed
) else (
    echo    WARNING - Failed to flush DNS cache
)
echo.

:: 测试解析
echo 5. Testing DNS resolution...
nslookup %DOMAIN% >nul 2>&1
if %errorLevel% equ 0 (
    echo    OK - Resolution test completed
    echo.
    echo    Resolution result:
    nslookup %DOMAIN%
) else (
    echo    WARNING - Resolution test failed
)
echo.

echo ==========================================
echo Fix completed!
echo ==========================================
echo.
echo You can now try to access: http://%DOMAIN%
echo.
pause

