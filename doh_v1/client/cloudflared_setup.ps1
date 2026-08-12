# 使用Cloudflared设置DoH代理 - 适用于所有Windows版本
# Cloudflared会在本地创建一个DNS代理，使用DoH查询

param(
    [string]$Domain = "8868d68.app"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Cloudflared DoH 代理设置" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否已安装cloudflared
$cloudflaredPath = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflaredPath) {
    Write-Host "Cloudflared未安装，正在下载..." -ForegroundColor Yellow
    
    # 创建临时目录
    $tempDir = "$env:TEMP\cloudflared"
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir | Out-Null
    }
    
    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    $exePath = "$tempDir\cloudflared.exe"
    
    Write-Host "正在从GitHub下载..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $exePath -UseBasicParsing
        Write-Host "✓ 下载完成" -ForegroundColor Green
        
        # 复制到系统路径或当前目录
        $installPath = "$env:USERPROFILE\cloudflared\cloudflared.exe"
        $installDir = Split-Path $installPath
        if (-not (Test-Path $installDir)) {
            New-Item -ItemType Directory -Path $installDir | Out-Null
        }
        Copy-Item $exePath $installPath -Force
        Write-Host "✓ 已安装到: $installPath" -ForegroundColor Green
        
        $cloudflaredPath = $installPath
    } catch {
        Write-Host "⚠️  下载失败: $_" -ForegroundColor Red
        Write-Host "请手动下载: $downloadUrl" -ForegroundColor Yellow
        Write-Host "或访问: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" -ForegroundColor Yellow
        exit 1
    }
} else {
    $cloudflaredPath = $cloudflaredPath.Source
    Write-Host "✓ 找到cloudflared: $cloudflaredPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "Cloudflared DoH代理配置选项:" -ForegroundColor Yellow
Write-Host "1. 启动本地DNS代理 (端口5353)" -ForegroundColor Cyan
Write-Host "2. 配置为系统服务（需要管理员权限）" -ForegroundColor Cyan
Write-Host "3. 仅测试DoH解析" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "请选择 (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "启动本地DNS代理..." -ForegroundColor Yellow
        Write-Host "代理将监听 127.0.0.1:5353" -ForegroundColor Cyan
        Write-Host "请修改系统DNS为 127.0.0.1" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "按Ctrl+C停止代理" -ForegroundColor Yellow
        Write-Host ""
        
        & $cloudflaredPath proxy-dns --port 5353
    }
    "2" {
        # 检查管理员权限
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if (-not $isAdmin) {
            Write-Host "⚠️  需要管理员权限来安装服务" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "配置为系统服务..." -ForegroundColor Yellow
        
        # 创建服务配置目录
        $serviceDir = "C:\cloudflared"
        if (-not (Test-Path $serviceDir)) {
            New-Item -ItemType Directory -Path $serviceDir | Out-Null
        }
        
        # 复制cloudflared到服务目录
        Copy-Item $cloudflaredPath "$serviceDir\cloudflared.exe" -Force
        
        # 创建配置文件
        $configPath = "$serviceDir\config.yml"
        @"
proxy-dns: true
proxy-dns-port: 5353
proxy-dns-address: 127.0.0.1
"@ | Out-File -FilePath $configPath -Encoding UTF8
        
        # 安装为Windows服务
        Write-Host "正在安装服务..." -ForegroundColor Yellow
        & $cloudflaredPath service install
        
        # 启动服务
        Start-Service cloudflared
        Write-Host "✓ 服务已启动" -ForegroundColor Green
        
        # 修改系统DNS
        Write-Host ""
        Write-Host "修改系统DNS为 127.0.0.1..." -ForegroundColor Yellow
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
        foreach ($adapter in $adapters) {
            Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses "127.0.0.1"
            Write-Host "✓ 已修改 $($adapter.Name)" -ForegroundColor Green
        }
        
        Write-Host ""
        Write-Host "✓ 配置完成！" -ForegroundColor Green
        Write-Host "Cloudflared服务正在运行，所有DNS查询将通过DoH" -ForegroundColor Cyan
    }
    "3" {
        Write-Host ""
        Write-Host "测试DoH解析..." -ForegroundColor Yellow
        Write-Host "使用cloudflared直接查询..." -ForegroundColor Cyan
        Write-Host ""
        
        & $cloudflaredPath proxy-dns --port 5353 &
        $cloudflaredPid = $!
        Start-Sleep -Seconds 2
        
        try {
            $result = Resolve-DnsName -Name $Domain -Server 127.0.0.1 -Port 5353 -Type A
            $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
            if ($ip -eq "127.0.0.1") {
                Write-Host "   ⚠️  仍然解析到 127.0.0.1" -ForegroundColor Red
            } else {
                Write-Host "   ✓ DoH解析成功: $ip" -ForegroundColor Green
            }
        } catch {
            Write-Host "   解析失败: $_" -ForegroundColor Red
        } finally {
            Stop-Process -Id $cloudflaredPid -Force -ErrorAction SilentlyContinue
        }
    }
    default {
        Write-Host "无效选择" -ForegroundColor Red
    }
}

