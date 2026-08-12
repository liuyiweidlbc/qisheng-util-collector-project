# 强制修复DNS解析问题
# 以管理员身份运行

$Domain = "8868d68.app"
$CorrectIP = "20.255.104.21"
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "强制修复DNS解析" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: 需要管理员权限！" -ForegroundColor Red
    exit 1
}

# 1. 确保hosts文件格式正确
Write-Host "1. 修复hosts文件格式..." -ForegroundColor Yellow
$hostsLines = Get-Content $hostsPath
$newContent = @()
$found = $false

foreach ($line in $hostsLines) {
    $trimmed = $line.Trim()
    # 跳过注释和空行
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
        $newContent += $line
        continue
    }
    # 跳过包含该域名的所有行
    if ($trimmed -match $Domain) {
        Write-Host "   移除旧条目: $line" -ForegroundColor Yellow
        $found = $true
        continue
    }
    $newContent += $line
}

# 添加正确格式的条目（使用制表符）
$newEntry = "$CorrectIP`t$Domain"
$newContent += $newEntry
$newContent | Set-Content $hostsPath -Force -Encoding ASCII
Write-Host "   已添加: $newEntry" -ForegroundColor Green
Write-Host ""

# 2. 清除所有DNS缓存
Write-Host "2. 清除DNS缓存..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "   DNS客户端缓存已清除" -ForegroundColor Green

# 清除NetBIOS缓存
nbtstat -R | Out-Null
Write-Host "   NetBIOS缓存已清除" -ForegroundColor Green

# 停止并重启DNS客户端服务
try {
    $dnsClient = Get-Service -Name "Dnscache" -ErrorAction SilentlyContinue
    if ($dnsClient) {
        Restart-Service -Name "Dnscache" -Force -ErrorAction SilentlyContinue
        Write-Host "   DNS客户端服务已重启" -ForegroundColor Green
    }
} catch {
    Write-Host "   无法重启DNS服务（可能不需要）" -ForegroundColor Yellow
}
Write-Host ""

# 3. 等待系统更新
Write-Host "3. 等待系统更新缓存..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Write-Host ""

# 4. 测试解析
Write-Host "4. 测试解析..." -ForegroundColor Yellow

# 方法1: 使用Resolve-DnsName
Write-Host "   方法1 - Resolve-DnsName:" -ForegroundColor Cyan
try {
    $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    Write-Host "   结果: $ip" -ForegroundColor $(if ($ip -eq $CorrectIP) { "Green" } elseif ($ip -eq "127.0.0.1") { "Red" } else { "Yellow" })
} catch {
    Write-Host "   失败: $_" -ForegroundColor Red
}

# 方法2: 使用ping（这会直接使用hosts文件）
Write-Host "   方法2 - Ping测试:" -ForegroundColor Cyan
$pingResult = Test-Connection -ComputerName $Domain -Count 1 -ErrorAction SilentlyContinue
if ($pingResult) {
    Write-Host "   结果: $($pingResult.IPV4Address)" -ForegroundColor $(if ($pingResult.IPV4Address -eq $CorrectIP) { "Green" } else { "Yellow" })
} else {
    Write-Host "   Ping失败" -ForegroundColor Red
}

# 方法3: 直接读取hosts文件解析
Write-Host "   方法3 - 直接读取hosts文件:" -ForegroundColor Cyan
$hostsEntry = Get-Content $hostsPath | Select-String -Pattern "^[^#]*$Domain" | Select-Object -First 1
if ($hostsEntry) {
    $hostsIP = ($hostsEntry -split '\s+')[0]
    Write-Host "   hosts文件中的IP: $hostsIP" -ForegroundColor Cyan
}

Write-Host ""

# 5. 如果仍然失败，提供解决方案
Write-Host "5. 诊断信息..." -ForegroundColor Yellow
$currentResult = Resolve-DnsName -Name $Domain -Type A -ErrorAction SilentlyContinue
$currentIP = ($currentResult | Where-Object { $_.Type -eq 'A' }).IPAddress

if ($currentIP -eq "127.0.0.1") {
    Write-Host "   WARNING: 仍然解析到127.0.0.1" -ForegroundColor Red
    Write-Host ""
    Write-Host "   建议的解决方案:" -ForegroundColor Yellow
    Write-Host "   1. 重启计算机（最有效的方法）" -ForegroundColor White
    Write-Host "   2. 禁用并重新启用网络适配器" -ForegroundColor White
    Write-Host "   3. 使用ping命令测试（ping会优先使用hosts文件）" -ForegroundColor White
    Write-Host "   4. 检查是否有安全软件在拦截DNS" -ForegroundColor White
    Write-Host ""
    Write-Host "   临时解决方案 - 使用IP地址直接访问:" -ForegroundColor Yellow
    Write-Host "   http://$CorrectIP" -ForegroundColor Cyan
    Write-Host "   或在浏览器中直接输入IP地址" -ForegroundColor White
} elseif ($currentIP -eq $CorrectIP) {
    Write-Host "   SUCCESS: 解析成功！" -ForegroundColor Green
    Write-Host "   现在可以访问: http://$Domain" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

