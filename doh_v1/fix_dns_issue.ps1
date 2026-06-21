# DNS问题修复脚本 - Windows版本
# 使用方法: .\fix_dns_issue.ps1 8868d68.app

param(
    [string]$Domain = "8868d68.app"
)

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  此脚本需要管理员权限！" -ForegroundColor Red
    Write-Host "请以管理员身份运行PowerShell，然后执行此脚本" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "或者右键点击脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DNS问题修复工具 - Windows版本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 备份hosts文件
Write-Host "1. 备份 hosts 文件..." -ForegroundColor Yellow
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    $backupPath = "$hostsPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item $hostsPath $backupPath -Force
    Write-Host "   ✓ 备份完成: $backupPath" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  hosts文件不存在" -ForegroundColor Red
}
Write-Host ""

# 2. 检查并清理hosts文件中的问题域名
Write-Host "2. 检查hosts文件中的 $Domain ..." -ForegroundColor Yellow
if (Test-Path $hostsPath) {
    $hostsContent = Get-Content $hostsPath
    $found = $hostsContent | Select-String -Pattern $Domain
    if ($found) {
        Write-Host "   发现 $Domain 在hosts文件中，准备清理..." -ForegroundColor Yellow
        $newContent = $hostsContent | Where-Object { $_ -notmatch $Domain }
        $newContent | Set-Content $hostsPath -Force
        Write-Host "   ✓ 已清理" -ForegroundColor Green
    } else {
        Write-Host "   ✓ hosts文件中没有该域名" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  hosts文件不存在" -ForegroundColor Red
}
Write-Host ""

# 3. 清除DNS缓存
Write-Host "3. 清除DNS缓存..." -ForegroundColor Yellow
try {
    ipconfig /flushdns | Out-Null
    Write-Host "   ✓ DNS缓存已清除" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  清除DNS缓存失败: $_" -ForegroundColor Red
}
Write-Host ""

# 4. 显示当前DNS配置并提供修改选项
Write-Host "4. 检查DNS服务器配置..." -ForegroundColor Yellow
try {
    $adapters = Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses.Count -gt 0 }
    if ($adapters) {
        Write-Host "   当前DNS配置:" -ForegroundColor Cyan
        foreach ($adapter in $adapters) {
            Write-Host "   适配器: $($adapter.InterfaceAlias)" -ForegroundColor Cyan
            foreach ($dns in $adapter.ServerAddresses) {
                Write-Host "     - $dns" -ForegroundColor Cyan
            }
        }
        Write-Host ""
        Write-Host "   是否要修改DNS服务器为公共DNS？(Y/N)" -ForegroundColor Yellow
        $response = Read-Host
        if ($response -match '^[Yy]') {
            Write-Host "   请选择要修改的网络适配器:" -ForegroundColor Yellow
            $adapterList = $adapters | ForEach-Object { $_.InterfaceAlias } | Select-Object -Unique
            $index = 1
            foreach ($adapterName in $adapterList) {
                Write-Host "   $index. $adapterName" -ForegroundColor Cyan
                $index++
            }
            Write-Host "   0. 修改所有适配器" -ForegroundColor Cyan
            Write-Host ""
            $choice = Read-Host "请输入选项 (0-$($adapterList.Count))"
            
            $dnsServers = @("8.8.8.8", "8.8.4.4")
            
            if ($choice -eq "0") {
                # 修改所有适配器
                foreach ($adapterName in $adapterList) {
                    Set-DnsClientServerAddress -InterfaceAlias $adapterName -ServerAddresses $dnsServers
                    Write-Host "   ✓ 已修改 $adapterName 的DNS服务器" -ForegroundColor Green
                }
            } elseif ($choice -ge 1 -and $choice -le $adapterList.Count) {
                $selectedAdapter = $adapterList[$choice - 1]
                Set-DnsClientServerAddress -InterfaceAlias $selectedAdapter -ServerAddresses $dnsServers
                Write-Host "   ✓ 已修改 $selectedAdapter 的DNS服务器" -ForegroundColor Green
            } else {
                Write-Host "   跳过DNS服务器修改" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   跳过DNS服务器修改" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  未找到DNS服务器配置" -ForegroundColor Red
    }
} catch {
    Write-Host "   ⚠️  无法修改DNS配置: $_" -ForegroundColor Red
    Write-Host "   提示: 可以手动在网络设置中修改DNS服务器" -ForegroundColor Yellow
}
Write-Host ""

# 5. 测试解析
Write-Host "5. 测试DNS解析..." -ForegroundColor Yellow
Write-Host "   解析 $Domain :" -ForegroundColor Cyan
try {
    $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction SilentlyContinue
    if ($result) {
        $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
        if ($ip -eq "127.0.0.1") {
            Write-Host "   ⚠️  仍然解析到 127.0.0.1" -ForegroundColor Red
            Write-Host "   可能的原因:" -ForegroundColor Yellow
            Write-Host "   - DNS服务器本身在拦截该域名" -ForegroundColor White
            Write-Host "   - 网络设备（路由器/防火墙）在拦截" -ForegroundColor White
            Write-Host "   - 运营商DNS在拦截" -ForegroundColor White
            Write-Host "   - 安全软件在拦截" -ForegroundColor White
            Write-Host ""
            Write-Host "   建议:" -ForegroundColor Yellow
            Write-Host "   - 尝试使用VPN或代理" -ForegroundColor White
            Write-Host "   - 联系网络管理员" -ForegroundColor White
            Write-Host "   - 检查安全软件设置" -ForegroundColor White
        } else {
            Write-Host "   ✓ 解析结果: $ip" -ForegroundColor Green
        }
    } else {
        Write-Host "   ⚠️  解析失败" -ForegroundColor Red
    }
} catch {
    Write-Host "   ⚠️  解析失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "修复完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

