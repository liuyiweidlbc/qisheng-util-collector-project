# 快速修复hosts文件 - PowerShell版本
# 使用方法: 以管理员身份运行 .\quick_fix_hosts.ps1

param(
    [string]$Domain = "8868d68.app",
    [string]$IpAddress = "20.255.104.21"
)

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  此脚本需要管理员权限！" -ForegroundColor Red
    Write-Host "请右键点击脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "快速修复hosts文件" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "域名: $Domain" -ForegroundColor Cyan
Write-Host "IP地址: $IpAddress" -ForegroundColor Cyan
Write-Host ""

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"

# 备份hosts文件
Write-Host "1. 备份hosts文件..." -ForegroundColor Yellow
$backupPath = "$hostsPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
try {
    Copy-Item $hostsPath $backupPath -Force
    Write-Host "   ✓ 备份完成: $backupPath" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  备份失败，但继续执行..." -ForegroundColor Yellow
}
Write-Host ""

# 读取当前hosts文件
if (Test-Path $hostsPath) {
    $hostsContent = Get-Content $hostsPath
} else {
    $hostsContent = @()
}

# 移除旧的域名条目
Write-Host "2. 清理旧的域名条目..." -ForegroundColor Yellow
$newContent = $hostsContent | Where-Object { 
    $_ -notmatch "^\s*[\d\.:]+\s+.*$Domain" -and 
    $_ -notmatch "^\s*#.*$Domain" 
}
$removedCount = ($hostsContent.Count - $newContent.Count)
if ($removedCount -gt 0) {
    Write-Host "   ✓ 已清理 $removedCount 个旧条目" -ForegroundColor Green
} else {
    Write-Host "   ✓ 未发现旧条目" -ForegroundColor Green
}
Write-Host ""

# 添加新条目
Write-Host "3. 添加hosts条目..." -ForegroundColor Yellow
$newEntry = "$IpAddress`t$Domain"
$newContent += $newEntry

try {
    $newContent | Set-Content $hostsPath -Force -Encoding UTF8
    Write-Host "   ✓ 已添加: $IpAddress    $Domain" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  添加失败: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 清除DNS缓存
Write-Host "4. 清除DNS缓存..." -ForegroundColor Yellow
try {
    ipconfig /flushdns | Out-Null
    Write-Host "   ✓ DNS缓存已清除" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  清除DNS缓存失败" -ForegroundColor Yellow
}
Write-Host ""

# 测试解析
Write-Host "5. 测试DNS解析..." -ForegroundColor Yellow
try {
    $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    Write-Host "   解析结果: $ip" -ForegroundColor Cyan
    if ($ip -eq "127.0.0.1") {
        Write-Host "   ⚠️  仍然解析到127.0.0.1" -ForegroundColor Red
        Write-Host "   请检查hosts文件内容是否正确" -ForegroundColor Yellow
    } elseif ($ip -eq $IpAddress) {
        Write-Host "   ✓ 解析成功！已指向正确IP: $ip" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  解析到其他IP: $ip" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  解析测试失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "修复完成！" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在可以尝试访问: http://$Domain" -ForegroundColor Green
Write-Host ""

