# 验证并修复hosts文件
# 以管理员身份运行

$Domain = "8868d68.app"
$CorrectIP = "20.255.104.21"
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "验证并修复hosts文件" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: 需要管理员权限！" -ForegroundColor Red
    exit 1
}

# 读取hosts文件内容
Write-Host "1. 读取hosts文件内容..." -ForegroundColor Yellow
if (Test-Path $hostsPath) {
    $hostsContent = Get-Content $hostsPath -Raw
    Write-Host "   Hosts文件路径: $hostsPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   当前hosts文件中关于 $Domain 的内容:" -ForegroundColor Cyan
    $domainLines = Get-Content $hostsPath | Select-String -Pattern $Domain
    if ($domainLines) {
        foreach ($line in $domainLines) {
            Write-Host "   $line" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   未找到 $Domain 的条目" -ForegroundColor Red
    }
} else {
    Write-Host "   ERROR: hosts文件不存在！" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 检查hosts文件中的条目格式
Write-Host "2. 检查并修复hosts条目..." -ForegroundColor Yellow
$hostsLines = Get-Content $hostsPath
$newContent = @()
$found = $false

foreach ($line in $hostsLines) {
    # 跳过包含该域名的行（无论格式如何）
    if ($line -match $Domain) {
        Write-Host "   发现旧条目: $line" -ForegroundColor Yellow
        $found = $true
        continue
    }
    $newContent += $line
}

# 添加正确格式的条目
$newEntry = "$CorrectIP`t$Domain"
$newContent += $newEntry
Write-Host "   添加新条目: $newEntry" -ForegroundColor Green

# 保存文件
try {
    $newContent | Set-Content $hostsPath -Force -Encoding ASCII
    Write-Host "   OK - hosts文件已更新" -ForegroundColor Green
} catch {
    Write-Host "   ERROR - 无法写入hosts文件: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 验证文件内容
Write-Host "3. 验证hosts文件内容..." -ForegroundColor Yellow
$verifyContent = Get-Content $hostsPath | Select-String -Pattern $Domain
if ($verifyContent) {
    Write-Host "   验证成功，找到条目:" -ForegroundColor Green
    foreach ($line in $verifyContent) {
        Write-Host "   $line" -ForegroundColor Cyan
        # 检查格式
        if ($line -match "^\s*$CorrectIP\s+$Domain") {
            Write-Host "   OK - 格式正确" -ForegroundColor Green
        } else {
            Write-Host "   WARNING - 格式可能不正确" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   ERROR - 未找到条目！" -ForegroundColor Red
}
Write-Host ""

# 清除所有DNS相关缓存
Write-Host "4. 清除DNS缓存..." -ForegroundColor Yellow
try {
    # 清除DNS客户端缓存
    ipconfig /flushdns | Out-Null
    
    # 清除NetBIOS名称缓存
    nbtstat -R | Out-Null
    
    # 如果使用nscd（通常Linux，但检查一下）
    if (Get-Service -Name "nscd" -ErrorAction SilentlyContinue) {
        Restart-Service nscd -ErrorAction SilentlyContinue
    }
    
    Write-Host "   OK - DNS缓存已清除" -ForegroundColor Green
} catch {
    Write-Host "   WARNING - 清除缓存时出错: $_" -ForegroundColor Yellow
}
Write-Host ""

# 等待一下让系统更新
Start-Sleep -Seconds 2

# 测试解析
Write-Host "5. 测试DNS解析..." -ForegroundColor Yellow
Write-Host "   使用Resolve-DnsName测试:" -ForegroundColor Cyan
try {
    $result = Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop
    $ip = ($result | Where-Object { $_.Type -eq 'A' }).IPAddress
    Write-Host "   解析结果: $ip" -ForegroundColor Cyan
    if ($ip -eq "127.0.0.1") {
        Write-Host "   WARNING - 仍然解析到127.0.0.1" -ForegroundColor Red
        Write-Host ""
        Write-Host "   可能的原因:" -ForegroundColor Yellow
        Write-Host "   1. 系统DNS缓存未完全清除，请重启计算机" -ForegroundColor White
        Write-Host "   2. 可能有其他DNS代理软件在拦截" -ForegroundColor White
        Write-Host "   3. 网络适配器的DNS设置可能有问题" -ForegroundColor White
        Write-Host "   4. hosts文件权限或格式问题" -ForegroundColor White
    } elseif ($ip -eq $CorrectIP) {
        Write-Host "   SUCCESS - 解析到正确IP: $ip" -ForegroundColor Green
    } else {
        Write-Host "   WARNING - 解析到其他IP: $ip" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERROR - 解析失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "   使用nslookup测试:" -ForegroundColor Cyan
$nslookupResult = nslookup $Domain 2>&1
$nslookupResult | ForEach-Object {
    if ($_ -match "Address") {
        Write-Host "   $_" -ForegroundColor Cyan
    } else {
        Write-Host "   $_" -ForegroundColor White
    }
}
Write-Host ""

# 检查hosts文件权限
Write-Host "6. 检查hosts文件权限..." -ForegroundColor Yellow
try {
    $acl = Get-Acl $hostsPath
    Write-Host "   文件所有者: $($acl.Owner)" -ForegroundColor Cyan
    Write-Host "   权限:" -ForegroundColor Cyan
    $acl.Access | ForEach-Object {
        Write-Host "     $($_.IdentityReference): $($_.FileSystemRights)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "   WARNING - 无法检查权限: $_" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "验证完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果仍然解析到127.0.0.1，请尝试:" -ForegroundColor Yellow
Write-Host "1. 重启计算机（最有效）" -ForegroundColor White
Write-Host "2. 禁用并重新启用网络适配器" -ForegroundColor White
Write-Host "3. 检查是否有安全软件在拦截" -ForegroundColor White
Write-Host "4. 使用ping测试: ping $Domain" -ForegroundColor White
Write-Host ""

