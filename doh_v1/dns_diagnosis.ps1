# DNS诊断脚本 - Windows版本
# 使用方法: .\dns_diagnosis.ps1 8868d68.app

param(
    [string]$Domain = "8868d68.app"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DNS诊断工具 - 诊断域名: $Domain" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查hosts文件
Write-Host "1. 检查 hosts 文件..." -ForegroundColor Yellow
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    $hostsContent = Get-Content $hostsPath
    $found = $hostsContent | Select-String -Pattern $Domain
    if ($found) {
        Write-Host "   ⚠️  发现 $Domain 在 hosts 文件中:" -ForegroundColor Red
        $found | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    } else {
        Write-Host "   ✓ hosts文件中没有找到 $Domain" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  未找到 hosts 文件" -ForegroundColor Red
}
Write-Host ""

# 2. 检查DNS服务器配置
Write-Host "2. 检查DNS服务器配置..." -ForegroundColor Yellow
try {
    $adapters = Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses.Count -gt 0 }
    if ($adapters) {
        Write-Host "   网络适配器DNS配置:" -ForegroundColor Cyan
        foreach ($adapter in $adapters) {
            Write-Host "   适配器: $($adapter.InterfaceAlias)" -ForegroundColor Cyan
            foreach ($dns in $adapter.ServerAddresses) {
                Write-Host "     - $dns" -ForegroundColor Cyan
            }
        }
    } else {
        Write-Host "   ⚠️  未找到DNS服务器配置" -ForegroundColor Red
    }
} catch {
    Write-Host "   ⚠️  无法获取DNS配置: $_" -ForegroundColor Red
}
Write-Host ""

# 3. 使用不同DNS服务器测试解析
Write-Host "3. 使用不同DNS服务器测试解析..." -ForegroundColor Yellow
Write-Host ""

# 使用系统默认DNS
Write-Host "   a) 系统默认DNS:" -ForegroundColor Cyan
try {
    $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction SilentlyContinue
    if ($result) {
        $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
        if ($ip -eq "127.0.0.1") {
            Write-Host "      ⚠️  解析到 127.0.0.1 (被拦截)" -ForegroundColor Red
        } else {
            Write-Host "      ✓ $ip" -ForegroundColor Green
        }
    } else {
        Write-Host "      解析失败" -ForegroundColor Red
    }
} catch {
    Write-Host "      解析失败: $_" -ForegroundColor Red
}
Write-Host ""

# 使用nslookup测试不同DNS服务器
$dnsServers = @(
    @{Name="Google DNS"; IP="8.8.8.8"},
    @{Name="Google DNS备用"; IP="8.8.4.4"},
    @{Name="Cloudflare DNS"; IP="1.1.1.1"},
    @{Name="Cloudflare DNS备用"; IP="1.0.0.1"},
    @{Name="阿里DNS"; IP="223.5.5.5"},
    @{Name="腾讯DNS"; IP="119.29.29.29"}
)

foreach ($dns in $dnsServers) {
    Write-Host "   $($dns.Name) ($($dns.IP)):" -ForegroundColor Cyan
    try {
        $result = nslookup $Domain $dns.IP 2>&1
        $ipLine = $result | Select-String -Pattern "Address:" | Select-Object -Last 1
        if ($ipLine) {
            $ip = ($ipLine -split '\s+')[-1]
            if ($ip -eq "127.0.0.1") {
                Write-Host "      ⚠️  $ip (被拦截)" -ForegroundColor Red
            } else {
                Write-Host "      ✓ $ip" -ForegroundColor Green
            }
        } else {
            Write-Host "      解析失败" -ForegroundColor Red
        }
    } catch {
        Write-Host "      解析失败: $_" -ForegroundColor Red
    }
    Write-Host ""
}

# 4. 检查DNS缓存
Write-Host "4. 检查DNS缓存..." -ForegroundColor Yellow
try {
    $cache = Get-DnsClientCache | Where-Object { $_.Entry -like "*$Domain*" }
    if ($cache) {
        Write-Host "   发现DNS缓存条目:" -ForegroundColor Cyan
        $cache | ForEach-Object {
            Write-Host "      $($_.Entry) -> $($_.Data)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "   ✓ 未发现相关DNS缓存" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  无法检查DNS缓存" -ForegroundColor Red
}
Write-Host ""

# 5. 多次测试解析结果
Write-Host "5. 连续5次解析测试（观察是否变化）:" -ForegroundColor Yellow
for ($i = 1; $i -le 5; $i++) {
    try {
        $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction SilentlyContinue
        if ($result) {
            $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
            if ($ip -eq "127.0.0.1") {
                Write-Host "   第 $i 次: $ip (被拦截)" -ForegroundColor Red
            } else {
                Write-Host "   第 $i 次: $ip" -ForegroundColor Green
            }
        } else {
            Write-Host "   第 $i 次: 解析失败" -ForegroundColor Red
        }
    } catch {
        Write-Host "   第 $i 次: 解析失败" -ForegroundColor Red
    }
    Start-Sleep -Seconds 1
}
Write-Host ""

# 6. 检查防火墙规则
Write-Host "6. 检查Windows防火墙状态..." -ForegroundColor Yellow
try {
    $firewall = Get-NetFirewallProfile
    foreach ($profile in $firewall) {
        $status = if ($profile.Enabled) { "启用" } else { "禁用" }
        Write-Host "   $($profile.Name): $status" -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ⚠️  无法检查防火墙状态" -ForegroundColor Red
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "诊断完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "建议解决方案:" -ForegroundColor Yellow
Write-Host "1. 如果hosts文件中有该域名，请检查并删除相关条目" -ForegroundColor White
Write-Host "2. 如果使用公共DNS能正常解析，说明是本地DNS服务器的问题" -ForegroundColor White
Write-Host "3. 尝试修改网络适配器的DNS服务器为公共DNS（如8.8.8.8）" -ForegroundColor White
Write-Host "4. 清除DNS缓存: ipconfig /flushdns" -ForegroundColor White
Write-Host "5. 检查是否有安全软件在拦截该域名" -ForegroundColor White

