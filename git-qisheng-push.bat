@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

cd /d "%~dp0"

set PROJECT_NAME=all_util_project
set GIT_REMOTE_URL=https://github.com/liuyiweidlbc/qisheng-util-collector-project.git
set GIT_REMOTE=origin
set GIT_BRANCH=master
set GIT_PUSH_OK=0

echo ========================================
echo   %PROJECT_NAME% 单独推送 Git（不构建、不上传）
echo ========================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo 错误：当前目录不是 Git 仓库，无法推送。
    pause
    exit /b 1
)

for /f "delims=" %%u in ('git remote get-url %GIT_REMOTE% 2^>nul') do set CURRENT_ORIGIN=%%u
if not defined CURRENT_ORIGIN (
    git remote add %GIT_REMOTE% %GIT_REMOTE_URL%
    echo 已添加 remote %GIT_REMOTE% -> %GIT_REMOTE_URL%
) else if /i not "!CURRENT_ORIGIN!"=="%GIT_REMOTE_URL%" (
    git remote set-url %GIT_REMOTE% %GIT_REMOTE_URL%
    echo 已将 %GIT_REMOTE% 设置为 %GIT_REMOTE_URL%
)
echo.

echo 推送到 %GIT_REMOTE% (%GIT_BRANCH%)...
call :git_push_retry
if "!GIT_PUSH_OK!"=="1" (
    echo.
    echo Git 推送成功！
    echo.
    pause
    endlocal
    exit /b 0
)

echo.
echo Git 推送失败！可稍后重试本脚本。
echo   git -c http.proxy= -c https.proxy= push -u %GIT_REMOTE% %GIT_BRANCH%
echo.
pause
endlocal
exit /b 1

:git_push_retry
set "GIT_HTTP_PROXY="
set "GIT_HTTPS_PROXY="
set "ALL_PROXY="

echo   尝试 1/3: 直连...
git -c http.proxy= -c https.proxy= push -u %GIT_REMOTE% %GIT_BRANCH%
if not errorlevel 1 (
    set GIT_PUSH_OK=1
    goto :eof
)

set GLOBAL_HTTP_PROXY=
for /f "delims=" %%p in ('git config --global --get http.proxy 2^>nul') do set GLOBAL_HTTP_PROXY=%%p
if defined GLOBAL_HTTP_PROXY (
    echo   尝试 2/3: 全局代理 !GLOBAL_HTTP_PROXY! ...
    git -c http.proxy=!GLOBAL_HTTP_PROXY! -c https.proxy=!GLOBAL_HTTP_PROXY! push -u %GIT_REMOTE% %GIT_BRANCH%
    if not errorlevel 1 (
        set GIT_PUSH_OK=1
        goto :eof
    )
) else (
    echo   跳过代理重试（未配置 git config --global http.proxy）
)

set "GIT_HTTP_PROXY="
set "GIT_HTTPS_PROXY="
set "ALL_PROXY="
echo   尝试 3/3: 直连重试（等待 3 秒）...
timeout /t 3 /nobreak >nul
git -c http.proxy= -c https.proxy= push -u %GIT_REMOTE% %GIT_BRANCH%
if not errorlevel 1 set GIT_PUSH_OK=1
goto :eof
