# DoH (DNS over HTTPS) 手动设置指南

## 方案：使用 Cloudflared

Cloudflared 是 Cloudflare 提供的工具，可以在本地创建一个 DoH 代理，绕过运营商的 DNS 劫持。

## 快速设置（使用脚本）

```powershell
# 以管理员身份运行PowerShell
.\setup_doh_complete.ps1
```

## 手动设置步骤

### 步骤1: 下载 Cloudflared

1. 访问：https://github.com/cloudflare/cloudflared/releases/latest
2. 下载：`cloudflared-windows-amd64.exe`
3. 创建目录：`C:\cloudflared`
4. 将下载的文件重命名为 `cloudflared.exe` 并放到 `C:\cloudflared\`

或者使用PowerShell下载：

```powershell
# 以管理员身份运行
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$out = "C:\cloudflared\cloudflared.exe"
New-Item -ItemType Directory -Path "C:\cloudflared" -Force
Invoke-WebRequest -Uri $url -OutFile $out
```

### 步骤2: 安装为Windows服务

```powershell
# 以管理员身份运行PowerShell
cd C:\cloudflared
.\cloudflared.exe service install
```

### 步骤3: 启动服务

```powershell
Start-Service cloudflared
```

### 步骤4: 配置系统DNS

将系统DNS设置为 `127.0.0.1`（cloudflared监听在此地址）

**方法A: 使用PowerShell**

```powershell
# 查看网络适配器
Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }

# 设置DNS（替换"以太网"为你的适配器名称）
Set-DnsClientServerAddress -InterfaceAlias "以太网" -ServerAddresses "127.0.0.1"
```

**方法B: 使用图形界面**

1. 打开"网络和共享中心"
2. 点击"更改适配器设置"
3. 右键点击你的网络连接 → "属性"
4. 选择"Internet协议版本4 (TCP/IPv4)" → "属性"
5. 选择"使用下面的DNS服务器地址"
6. 输入：`127.0.0.1`
7. 点击"确定"

### 步骤5: 清除DNS缓存

```cmd
ipconfig /flushdns
```

### 步骤6: 测试

```cmd
# 应该返回正确的IP，而不是127.0.0.1
nslookup 8868d68.app

# 或者
ping 8868d68.app
```

## 验证服务状态

```powershell
# 检查服务状态
Get-Service cloudflared

# 查看服务日志
Get-EventLog -LogName Application -Source cloudflared -Newest 10
```

## 管理服务

```powershell
# 启动服务
Start-Service cloudflared

# 停止服务
Stop-Service cloudflared

# 重启服务
Restart-Service cloudflared

# 卸载服务
cd C:\cloudflared
.\cloudflared.exe service uninstall
```

## 故障排查

### 问题1: 服务无法启动

```powershell
# 检查服务状态
Get-Service cloudflared

# 查看详细错误
Get-EventLog -LogName Application -Source cloudflared -Newest 20
```

### 问题2: 仍然解析到127.0.0.1

1. 确认服务正在运行：`Get-Service cloudflared`
2. 确认DNS已设置为127.0.0.1：`Get-DnsClientServerAddress`
3. 清除DNS缓存：`ipconfig /flushdns`
4. 重启DNS客户端服务：`Restart-Service Dnscache`
5. 如果还不行，重启计算机

### 问题3: 无法下载cloudflared

如果GitHub访问有问题，可以：
1. 使用VPN下载
2. 从其他镜像站点下载
3. 使用代理下载

### 问题4: 防火墙阻止

确保Windows防火墙允许cloudflared访问网络：
1. 打开"Windows Defender 防火墙"
2. 点击"允许应用通过防火墙"
3. 找到cloudflared并允许

## 高级配置

### 使用自定义DoH服务器

编辑服务配置（需要修改注册表或配置文件）：

```powershell
# Cloudflared默认使用Cloudflare的DoH
# 如果需要使用其他DoH服务器，可以修改配置
```

### 查看详细日志

```powershell
# 实时查看日志
Get-EventLog -LogName Application -Source cloudflared -Newest 50 | Format-List
```

## 优势

- ✅ 完全绕过运营商DNS劫持
- ✅ 加密DNS查询，保护隐私
- ✅ 自动运行，无需手动操作
- ✅ 适用于所有应用程序
- ✅ 不需要VPN

## 注意事项

- 需要管理员权限安装服务
- 首次设置后建议重启计算机
- 如果cloudflared服务停止，DNS解析会失败，需要重启服务



