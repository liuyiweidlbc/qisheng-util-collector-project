# 完整的DoH设置脚本 - 使用Cloudflared
# 以管理员身份运行

param(
    [string]$Domain = "8868d68.app"
)

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: 此脚本需要管理员权限！" -ForegroundColor Red
    Write-Host "请右键点击脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DoH (DNS over HTTPS) 完整设置" -ForegroundColor Cyan
Write-Host "使用 Cloudflared" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$cloudflaredDir = "C:\cloudflared"
$cloudflaredExe = "$cloudflaredDir\cloudflared.exe"
$serviceName = "cloudflared"

# 步骤1: 检查是否已安装
Write-Host "步骤1: 检查Cloudflared安装..." -ForegroundColor Yellow
$cloudflaredInstalled = $false

# 检查系统PATH中是否有cloudflared
$pathCloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($pathCloudflared) {
    $cloudflaredExe = $pathCloudflared.Source
    $cloudflaredDir = Split-Path $cloudflaredExe
    $cloudflaredInstalled = $true
    Write-Host "   找到已安装的cloudflared: $cloudflaredExe" -ForegroundColor Green
} elseif (Test-Path $cloudflaredExe) {
    $cloudflaredInstalled = $true
    Write-Host "   找到cloudflared: $cloudflaredExe" -ForegroundColor Green
} else {
    Write-Host "   未找到cloudflared，需要下载安装" -ForegroundColor Yellow
}
Write-Host ""

# 步骤2: 下载并安装cloudflared
if (-not $cloudflaredInstalled) {
    Write-Host "步骤2: 下载Cloudflared..." -ForegroundColor Yellow
    
    # 创建目录
    if (-not (Test-Path $cloudflaredDir)) {
        New-Item -ItemType Directory -Path $cloudflaredDir -Force | Out-Null
        Write-Host "   已创建目录: $cloudflaredDir" -ForegroundColor Green
    }
    
    # 确定下载URL
    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    
    Write-Host "   正在从GitHub下载..." -ForegroundColor Cyan
    Write-Host "   URL: $downloadUrl" -ForegroundColor Gray
    
    try {
        # 使用Invoke-WebRequest下载
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $downloadUrl -OutFile $cloudflaredExe -UseBasicParsing -ErrorAction Stop
        Write-Host "   OK - 下载完成" -ForegroundColor Green
        $cloudflaredInstalled = $true
    } catch {
        Write-Host "   ERROR - 下载失败: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "   请手动下载:" -ForegroundColor Yellow
        Write-Host "   1. 访问: https://github.com/cloudflare/cloudflared/releases/latest" -ForegroundColor White
        Write-Host "   2. 下载: cloudflared-windows-amd64.exe" -ForegroundColor White
        Write-Host "   3. 重命名为 cloudflared.exe 并放到: $cloudflaredDir" -ForegroundColor White
        Write-Host ""
        $manual = Read-Host "   是否已手动下载？(Y/N)"
        if ($manual -notmatch '^[Yy]') {
            exit 1
        }
        if (-not (Test-Path $cloudflaredExe)) {
            Write-Host "   ERROR - 仍然找不到cloudflared.exe" -ForegroundColor Red
            exit 1
        }
        $cloudflaredInstalled = $true
    }
    Write-Host ""
}

# 步骤3: 检查服务状态
Write-Host "步骤3: 检查Cloudflared服务状态..." -ForegroundColor Yellow
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($service) {
    Write-Host "   服务已存在" -ForegroundColor Green
    Write-Host "   当前状态: $($service.Status)" -ForegroundColor Cyan
    
    if ($service.Status -eq "Running") {
        Write-Host "   服务正在运行" -ForegroundColor Green
        Write-Host ""
        Write-Host "   是否要重新配置服务？(Y/N)" -ForegroundColor Yellow
        $reconfigure = Read-Host
        if ($reconfigure -match '^[Yy]') {
            Write-Host "   正在停止服务..." -ForegroundColor Yellow
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        } else {
            Write-Host "   跳过服务配置" -ForegroundColor Yellow
            Write-Host ""
            goto TestDNS
        }
    }
} else {
    Write-Host "   服务不存在，将创建新服务" -ForegroundColor Yellow
}
Write-Host ""

# 步骤4: 安装/重新安装服务
Write-Host "步骤4: 安装Cloudflared服务..." -ForegroundColor Yellow

# 先卸载旧服务（如果存在）
if ($service) {
    Write-Host "   正在卸载旧服务..." -ForegroundColor Yellow
    & $cloudflaredExe service uninstall -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Seconds 2
}

# 安装新服务
Write-Host "   正在安装服务..." -ForegroundColor Yellow
try {
    $installOutput = & $cloudflaredExe service install 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   OK - 服务安装成功" -ForegroundColor Green
    } else {
        Write-Host "   WARNING - 安装输出: $installOutput" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERROR - 安装失败: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 步骤5: 启动服务
Write-Host "步骤5: 启动Cloudflared服务..." -ForegroundColor Yellow
try {
    Start-Service -Name $serviceName -ErrorAction Stop
    Start-Sleep -Seconds 3
    
    $service = Get-Service -Name $serviceName
    if ($service.Status -eq "Running") {
        Write-Host "   OK - 服务已启动" -ForegroundColor Green
    } else {
        Write-Host "   WARNING - 服务状态: $($service.Status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERROR - 启动失败: $_" -ForegroundColor Red
    Write-Host "   尝试手动启动: Start-Service -Name $serviceName" -ForegroundColor Yellow
}
Write-Host ""

# 步骤6: 配置系统DNS
Write-Host "步骤6: 配置系统DNS为127.0.0.1..." -ForegroundColor Yellow

# 获取活动的网络适配器
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike "*Virtual*" -and $_.InterfaceDescription -notlike "*VMware*" -and $_.InterfaceDescription -notlike "*VirtualBox*" }

if ($adapters.Count -eq 0) {
    Write-Host "   WARNING - 未找到活动的网络适配器" -ForegroundColor Yellow
} else {
    Write-Host "   找到 $($adapters.Count) 个活动适配器:" -ForegroundColor Cyan
    $index = 1
    foreach ($adapter in $adapters) {
        Write-Host "   $index. $($adapter.Name) - $($adapter.InterfaceDescription)" -ForegroundColor Cyan
        $index++
    }
    Write-Host ""
    
    if ($adapters.Count -eq 1) {
        $selectedAdapters = $adapters
        Write-Host "   自动选择唯一适配器: $($adapters[0].Name)" -ForegroundColor Green
    } else {
        Write-Host "   请选择要配置的适配器 (输入数字，或 0 表示全部):" -ForegroundColor Yellow
        $choice = Read-Host
        if ($choice -eq "0") {
            $selectedAdapters = $adapters
        } elseif ([int]$choice -ge 1 -and [int]$choice -le $adapters.Count) {
            $selectedAdapters = @($adapters[[int]$choice - 1])
        } else {
            Write-Host "   无效选择，配置所有适配器" -ForegroundColor Yellow
            $selectedAdapters = $adapters
        }
    }
    
    foreach ($adapter in $selectedAdapters) {
        try {
            Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses "127.0.0.1" -ErrorAction Stop
            Write-Host "   OK - 已配置 $($adapter.Name)" -ForegroundColor Green
        } catch {
            Write-Host "   ERROR - 配置 $($adapter.Name) 失败: $_" -ForegroundColor Red
        }
    }
}
Write-Host ""

# 步骤7: 清除DNS缓存
Write-Host "步骤7: 清除DNS缓存..." -ForegroundColor Yellow
try {
    ipconfig /flushdns | Out-Null
    Restart-Service -Name "Dnscache" -Force -ErrorAction SilentlyContinue
    Write-Host "   OK - DNS缓存已清除" -ForegroundColor Green
} catch {
    Write-Host "   WARNING - 清除缓存时出错" -ForegroundColor Yellow
}
Write-Host ""

# 步骤8: 等待服务就绪
Write-Host "步骤8: 等待服务就绪..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Write-Host ""

# 步骤9: 测试DNS解析
:TestDNS
Write-Host "步骤9: 测试DNS解析..." -ForegroundColor Yellow
Write-Host ""

# 测试1: 使用Resolve-DnsName
Write-Host "   测试1 - Resolve-DnsName:" -ForegroundColor Cyan
try {
    $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    Write-Host "   结果: $ip" -ForegroundColor $(if ($ip -eq "127.0.0.1") { "Red" } else { "Green" })
    if ($ip -ne "127.0.0.1") {
        Write-Host "   SUCCESS - DoH工作正常！" -ForegroundColor Green
    } else {
        Write-Host "   WARNING - 仍然解析到127.0.0.1" -ForegroundColor Red
    }
} catch {
    Write-Host "   失败: $_" -ForegroundColor Red
}
Write-Host ""

# 测试2: 使用nslookup
Write-Host "   测试2 - nslookup:" -ForegroundColor Cyan
$nslookupResult = nslookup $Domain 2>&1
$nslookupResult | ForEach-Object {
    if ($_ -match "Address") {
        $addressLine = $_
        Write-Host "   $_" -ForegroundColor Cyan
        if ($addressLine -match "127\.0\.0\.1") {
            Write-Host "   WARNING - nslookup仍然显示127.0.0.1" -ForegroundColor Yellow
            Write-Host "   这可能是缓存问题，实际访问应该正常" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   $_" -ForegroundColor White
    }
}
Write-Host ""

# 测试3: 使用ping
Write-Host "   测试3 - Ping:" -ForegroundColor Cyan
$pingResult = Test-Connection -ComputerName $Domain -Count 1 -ErrorAction SilentlyContinue
if ($pingResult) {
    Write-Host "   结果: $($pingResult.IPV4Address)" -ForegroundColor $(if ($pingResult.IPV4Address -eq "127.0.0.1") { "Red" } else { "Green" })
    if ($pingResult.IPV4Address -ne "127.0.0.1") {
        Write-Host "   SUCCESS - Ping成功！" -ForegroundColor Green
    }
} else {
    Write-Host "   Ping失败或超时" -ForegroundColor Yellow
}
Write-Host ""

# 显示服务信息
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "设置完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cloudflared服务信息:" -ForegroundColor Yellow
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "   服务名称: $($service.Name)" -ForegroundColor Cyan
    Write-Host "   服务状态: $($service.Status)" -ForegroundColor Cyan
    Write-Host "   服务路径: $cloudflaredExe" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "管理命令:" -ForegroundColor Yellow
Write-Host "   启动服务: Start-Service -Name $serviceName" -ForegroundColor White
Write-Host "   停止服务: Stop-Service -Name $serviceName" -ForegroundColor White
Write-Host "   查看日志: Get-EventLog -LogName Application -Source cloudflared -Newest 10" -ForegroundColor White
Write-Host ""
Write-Host "如果仍然无法解析，请尝试:" -ForegroundColor Yellow
Write-Host "   1. 重启计算机" -ForegroundColor White
Write-Host "   2. 检查防火墙是否阻止了cloudflared" -ForegroundColor White
Write-Host "   3. 查看服务日志排查问题" -ForegroundColor White
Write-Host ""



