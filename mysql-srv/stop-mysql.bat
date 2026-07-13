@echo off
setlocal

set MYSQL_HOME=F:\mysql-server\mysql-8.0.46-winx64

if not exist "%MYSQL_HOME%\bin\mysqladmin.exe" (
    echo ERROR: mysqladmin.exe not found at %MYSQL_HOME%\bin
    pause
    exit /b 1
)

cd /d "%MYSQL_HOME%\bin"
echo Shutting down MySQL...
mysqladmin.exe -u root shutdown
if %errorLevel% neq 0 (
    echo Shutdown failed. Try: mysqladmin.exe -u root -p shutdown
    pause
    exit /b 1
)

echo MySQL stopped.
pause
