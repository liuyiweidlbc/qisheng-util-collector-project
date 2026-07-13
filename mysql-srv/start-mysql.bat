@echo off
setlocal

set MYSQL_HOME=F:\mysql-server\mysql-8.0.46-winx64
set CONFIG_FILE=%~dp0my.ini

if not exist "%MYSQL_HOME%\bin\mysqld.exe" (
    echo ERROR: mysqld.exe not found at %MYSQL_HOME%\bin
    pause
    exit /b 1
)

if not exist "%MYSQL_HOME%\data\mysql" (
    echo ERROR: data directory not initialized. Run init-mysql.bat first.
    pause
    exit /b 1
)

cd /d "%MYSQL_HOME%\bin"
echo Starting MySQL on port 3306...
mysqld.exe --defaults-file="%CONFIG_FILE%" --console
