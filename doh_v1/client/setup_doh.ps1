# 设置DNS over HTTPS (DoH) - Windows 10/11
# 需要Windows 11或Windows 10 21H2及以上版本

param(
    [string]$Domain = "8868d68.app"
)

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  此脚本需要管理员权限！" -ForegroundColor Red
    Write-Host "请以管理员身份运行PowerShell" -ForegroundColor Yellow
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DNS over HTTPS (DoH) 设置工具" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查Windows版本
$osVersion = [System.Environment]::OSVersion.Version
$buildNumber = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").ReleaseId

Write-Host "Windows版本信息:" -ForegroundColor Yellow
Write-Host "  版本: $($osVersion.Major).$($osVersion.Minor)" -ForegroundColor Cyan
Write-Host "  构建: $buildNumber" -ForegroundColor Cyan
Write-Host ""

# Windows 11或Windows 10 21H2+支持DoH
$supportsDoH = $false
if ($osVersion.Major -eq 10) {
    $buildNumberInt = [int]$buildNumber
    if ($buildNumberInt -ge 19041) {  # Windows 10 2004+
        $supportsDoH = $true
    }
} elseif ($osVersion.Major -eq 11) {
    $supportsDoH = $true
}

if (-not $supportsDoH) {
    Write-Host "⚠️  你的Windows版本可能不支持原生DoH" -ForegroundColor Red
    Write-Host "建议使用第三方DoH客户端（如cloudflared）" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "是否继续尝试设置？(Y/N)" -ForegroundColor Yellow
    $continue = Read-Host
    if ($continue -notmatch '^[Yy]') {
        exit 0
    }
}

# 获取网络适配器
Write-Host "可用的网络适配器:" -ForegroundColor Yellow
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
$index = 1
$adapterMap = @{}
foreach ($adapter in $adapters) {
    Write-Host "   $index. $($adapter.Name) - $($adapter.InterfaceDescription)" -ForegroundColor Cyan
    $adapterMap[$index] = $adapter.Name
    $index++
}
Write-Host "   0. 所有适配器" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "请选择要配置的适配器 (0-$($adapters.Count))"

if ($choice -eq "0") {
    $selectedAdapters = $adapters
} elseif ($choice -ge 1 -and $choice -le $adapters.Count) {
    $selectedAdapters = @($adapters[$choice - 1])
} else {
    Write-Host "无效选择" -ForegroundColor Red
    exit 1
}

# DoH服务器列表
$dohServers = @(
    @{Name="Cloudflare"; Template="https://cloudflare-dns.com/dns-query"},
    @{Name="Google"; Template="https://dns.google/dns-query"},
    @{Name="Quad9"; Template="https://dns.quad9.net/dns-query"},
    @{Name="阿里DNS"; Template="https://dns.alidns.com/dns-query"}
)

Write-Host ""
Write-Host "可用的DoH服务器:" -ForegroundColor Yellow
$dohIndex = 1
foreach ($doh in $dohServers) {
    Write-Host "   $dohIndex. $($doh.Name) - $($doh.Template)" -ForegroundColor Cyan
    $dohIndex++
}
Write-Host ""

$dohChoice = Read-Host "请选择DoH服务器 (1-$($dohServers.Count))"
if ($dohChoice -ge 1 -and $dohChoice -le $dohServers.Count) {
    $selectedDoh = $dohServers[$dohChoice - 1]
} else {
    Write-Host "使用默认: Cloudflare" -ForegroundColor Yellow
    $selectedDoh = $dohServers[0]
}

# 设置DoH
Write-Host ""
Write-Host "正在配置DoH..." -ForegroundColor Yellow

foreach ($adapter in $selectedAdapters) {
    try {
        # 首先设置DNS服务器地址
        $dnsAddress = switch ($selectedDoh.Name) {
            "Cloudflare" { @("1.1.1.1", "1.0.0.1") }
            "Google" { @("8.8.8.8", "8.8.4.4") }
            "Quad9" { @("9.9.9.9", "149.112.112.112") }
            "阿里DNS" { @("223.5.5.5", "223.6.6.6") }
            default { @("1.1.1.1", "1.0.0.1") }
        }
        
        Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses $dnsAddress
        Write-Host "   ✓ 已设置 $($adapter.Name) 的DNS服务器" -ForegroundColor Green
        
        # 设置DoH模板（Windows 11/10 21H2+）
        try {
            Set-DnsClientDohServerAddress -InterfaceAlias $adapter.Name -ServerAddress $dnsAddress[0] -DohTemplate $selectedDoh.Template -AllowFallbackToUdp $true
            Write-Host "   ✓ 已启用DoH: $($selectedDoh.Template)" -ForegroundColor Green
        } catch {
            Write-Host "   ⚠️  无法设置DoH模板，可能需要更新Windows或使用第三方工具" -ForegroundColor Yellow
            Write-Host "   错误: $_" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ⚠️  配置 $($adapter.Name) 失败: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "配置完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "测试DNS解析:" -ForegroundColor Yellow
Start-Sleep -Seconds 2
ipconfig /flushdns | Out-Null

try {
    $result = Resolve-DnsName -Name $Domain -Type A
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    if ($ip -eq "127.0.0.1") {
        Write-Host "   ⚠️  仍然解析到 127.0.0.1" -ForegroundColor Red
        Write-Host "   建议使用第三方DoH客户端（见cloudflared_setup.ps1）" -ForegroundColor Yellow
    } else {
        Write-Host "   ✓ 解析成功: $ip" -ForegroundColor Green
    }
} catch {
    Write-Host "   解析失败: $_" -ForegroundColor Red
}

