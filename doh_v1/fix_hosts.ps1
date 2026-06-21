# 通过hosts文件绕过DNS劫持
# 如果知道正确的IP地址，可以直接在hosts文件中指定

param(
    [string]$Domain = "8868d68.app",
    [string]$IpAddress = ""
)

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  此脚本需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Hosts文件修复工具" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"

# 备份hosts文件
Write-Host "1. 备份hosts文件..." -ForegroundColor Yellow
$backupPath = "$hostsPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $hostsPath $backupPath -Force
Write-Host "   ✓ 备份完成: $backupPath" -ForegroundColor Green
Write-Host ""

# 读取当前hosts文件
$hostsContent = Get-Content $hostsPath

# 移除旧的域名条目
Write-Host "2. 清理旧的域名条目..." -ForegroundColor Yellow
$newContent = $hostsContent | Where-Object { $_ -notmatch "^\s*[\d\.:]+\s+.*$Domain" -and $_ -notmatch "^\s*#.*$Domain" }
Write-Host "   ✓ 已清理" -ForegroundColor Green
Write-Host ""

# 如果提供了IP地址，直接使用
if ($IpAddress) {
    Write-Host "3. 添加hosts条目: $IpAddress $Domain" -ForegroundColor Yellow
    $newContent += "$IpAddress`t$Domain"
    $newContent | Set-Content $hostsPath -Force
    Write-Host "   ✓ 已添加" -ForegroundColor Green
} else {
    # 尝试通过其他方式获取IP
    Write-Host "3. 尝试获取正确的IP地址..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   方法1: 使用IPv6地址（如果可用）" -ForegroundColor Cyan
    Write-Host "   方法2: 使用VPN或代理获取真实IP" -ForegroundColor Cyan
    Write-Host "   方法3: 手动查询并输入IP" -ForegroundColor Cyan
    Write-Host ""
    
    # 尝试使用IPv6
    try {
        $ipv6Result = Resolve-DnsName -Name $Domain -Type AAAA -ErrorAction SilentlyContinue
        if ($ipv6Result) {
            $ipv6 = ($ipv6Result | Where-Object { $_.Type -eq 'AAAA' }).IPAddress
            if ($ipv6 -and $ipv6 -ne "::1") {
                Write-Host "   发现IPv6地址: $ipv6" -ForegroundColor Green
                Write-Host "   是否添加到hosts文件？(Y/N)" -ForegroundColor Yellow
                $addIpv6 = Read-Host
                if ($addIpv6 -match '^[Yy]') {
                    $newContent += "$ipv6`t$Domain"
                    $newContent | Set-Content $hostsPath -Force
                    Write-Host "   ✓ 已添加IPv6地址" -ForegroundColor Green
                }
            }
        }
    } catch {
        Write-Host "   无法获取IPv6地址" -ForegroundColor Red
    }
    
    # 提示手动输入
    Write-Host ""
    Write-Host "   如果知道正确的IP地址，请输入（留空跳过）:" -ForegroundColor Yellow
    $manualIp = Read-Host
    if ($manualIp -and $manualIp -match '^[\d\.:]+$') {
        $newContent += "$manualIp`t$Domain"
        $newContent | Set-Content $hostsPath -Force
        Write-Host "   ✓ 已添加: $manualIp" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 清除DNS缓存
Write-Host "清除DNS缓存..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "✓ 已清除" -ForegroundColor Green
Write-Host ""

# 测试
Write-Host "测试解析..." -ForegroundColor Yellow
try {
    $result = Resolve-DnsName -Name $Domain -Type A
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    Write-Host "   解析结果: $ip" -ForegroundColor Cyan
    if ($ip -eq "127.0.0.1") {
        Write-Host "   ⚠️  仍然解析到127.0.0.1，请检查hosts文件" -ForegroundColor Red
    } else {
        Write-Host "   ✓ 解析成功" -ForegroundColor Green
    }
} catch {
    Write-Host "   解析失败: $_" -ForegroundColor Red
}

