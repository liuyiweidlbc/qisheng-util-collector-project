# 检查DoH服务状态
# 无需管理员权限

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DoH服务状态检查" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查cloudflared服务
Write-Host "1. 检查Cloudflared服务..." -ForegroundColor Yellow
$service = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue

if ($service) {
    Write-Host "   服务状态: $($service.Status)" -ForegroundColor $(if ($service.Status -eq "Running") { "Green" } else { "Red" })
    Write-Host "   服务名称: $($service.Name)" -ForegroundColor Cyan
    Write-Host "   显示名称: $($service.DisplayName)" -ForegroundColor Cyan
    
    if ($service.Status -ne "Running") {
        Write-Host "   WARNING - 服务未运行！" -ForegroundColor Red
        Write-Host "   请以管理员身份运行: Start-Service cloudflared" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ERROR - 未找到cloudflared服务" -ForegroundColor Red
    Write-Host "   请运行 setup_doh_complete.ps1 进行安装" -ForegroundColor Yellow
}
Write-Host ""

# 检查DNS配置
Write-Host "2. 检查DNS配置..." -ForegroundColor Yellow
$adapters = Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses.Count -gt 0 }
if ($adapters) {
    foreach ($adapter in $adapters) {
        Write-Host "   适配器: $($adapter.InterfaceAlias)" -ForegroundColor Cyan
        foreach ($dns in $adapter.ServerAddresses) {
            $color = if ($dns -eq "127.0.0.1") { "Green" } else { "Yellow" }
            Write-Host "     DNS: $dns" -ForegroundColor $color
        }
        if ($adapter.ServerAddresses -notcontains "127.0.0.1") {
            Write-Host "     WARNING - 未配置为127.0.0.1" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   未找到DNS配置" -ForegroundColor Yellow
}
Write-Host ""

# 测试DNS解析
Write-Host "3. 测试DNS解析..." -ForegroundColor Yellow
$testDomain = "8868d68.app"
try {
    $result = Resolve-DnsName -Name $testDomain -Type A -ErrorAction Stop
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    Write-Host "   测试域名: $testDomain" -ForegroundColor Cyan
    Write-Host "   解析结果: $ip" -ForegroundColor $(if ($ip -eq "127.0.0.1") { "Red" } else { "Green" })
    
    if ($ip -eq "127.0.0.1") {
        Write-Host "   ERROR - 仍然解析到127.0.0.1" -ForegroundColor Red
        Write-Host "   可能的原因:" -ForegroundColor Yellow
        Write-Host "   - cloudflared服务未运行" -ForegroundColor White
        Write-Host "   - DNS未配置为127.0.0.1" -ForegroundColor White
        Write-Host "   - DNS缓存未清除" -ForegroundColor White
    } else {
        Write-Host "   SUCCESS - DoH工作正常！" -ForegroundColor Green
    }
} catch {
    Write-Host "   解析失败: $_" -ForegroundColor Red
}
Write-Host ""

# 检查cloudflared进程
Write-Host "4. 检查cloudflared进程..." -ForegroundColor Yellow
$process = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "   进程ID: $($process.Id)" -ForegroundColor Cyan
    Write-Host "   进程路径: $($process.Path)" -ForegroundColor Cyan
    Write-Host "   内存使用: $([math]::Round($process.WorkingSet64/1MB, 2)) MB" -ForegroundColor Cyan
} else {
    Write-Host "   未找到cloudflared进程" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "检查完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan



