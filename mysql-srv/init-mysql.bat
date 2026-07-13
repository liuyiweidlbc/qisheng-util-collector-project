@echo off
setlocal

set MYSQL_HOME=F:\mysql-server\mysql-8.0.46-winx64
set CONFIG_FILE=%~dp0my.ini

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Run as administrator.
    pause
    exit /b 1
)

if not exist "%MYSQL_HOME%\bin\mysqld.exe" (
    echo ERROR: mysqld.exe not found at %MYSQL_HOME%\bin
    pause
    exit /b 1
)

if exist "%MYSQL_HOME%\data\mysql" (
    echo ERROR: data directory already initialized.
    echo Delete %MYSQL_HOME%\data first if you want to re-initialize.
    pause
    exit /b 1
)

echo Initializing MySQL data directory...
"%MYSQL_HOME%\bin\mysqld.exe" --defaults-file="%CONFIG_FILE%" --initialize-insecure
if %errorLevel% neq 0 (
    echo ERROR: initialization failed.
    pause
    exit /b 1
)

echo.
echo Done. root has no password. Run start-mysql.bat next.
pause
