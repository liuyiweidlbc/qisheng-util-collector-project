# DNS问题诊断和修复工具

## 问题描述

访问某个外部网站时，DNS解析会被重定向到 `127.0.0.1`，导致无法正常访问。第一次访问能正常解析，第二次开始就被拦截。

## Windows 10 使用方法

### 方法1：使用PowerShell脚本（推荐）

1. **诊断问题**：
   ```powershell
   # 以管理员身份打开PowerShell
   .\dns_diagnosis.ps1 8868d68.app
   ```

2. **修复问题**：
   ```powershell
   # 以管理员身份运行
   .\fix_dns_issue.ps1 8868d68.app
   ```

### 方法2：使用批处理脚本（简单快速）

```cmd
# 双击运行或在CMD中执行
dns_test.bat 8868d68.app
```

### 方法3：手动命令

#### 使用nslookup测试不同DNS服务器

```cmd
# 系统默认DNS
nslookup 8868d68.app

# Google DNS
nslookup 8868d68.app 8.8.8.8

# Cloudflare DNS
nslookup 8868d68.app 1.1.1.1

# 阿里DNS
nslookup 8868d68.app 223.5.5.5
```

#### 使用PowerShell的Resolve-DnsName

```powershell
# 系统默认DNS
Resolve-DnsName 8868d68.app

# 指定DNS服务器（需要先安装DnsClient模块）
Resolve-DnsName -Name 8868d68.app -Server 8.8.8.8
```

#### 清除DNS缓存

```cmd
ipconfig /flushdns
```

#### 检查hosts文件

```cmd
# 查看hosts文件内容
notepad C:\Windows\System32\drivers\etc\hosts

# 或者用PowerShell
Get-Content C:\Windows\System32\drivers\etc\hosts | Select-String "8868d68"
```

#### 修改DNS服务器（需要管理员权限）

**方法A：通过PowerShell**
```powershell
# 查看当前DNS配置
Get-DnsClientServerAddress

# 修改DNS服务器（替换"以太网"为你的网络适配器名称）
Set-DnsClientServerAddress -InterfaceAlias "以太网" -ServerAddresses 8.8.8.8,8.8.4.4
```

**方法B：通过图形界面**
1. 打开"网络和共享中心"
2. 点击"更改适配器设置"
3. 右键点击你的网络连接 → "属性"
4. 选择"Internet协议版本4 (TCP/IPv4)" → "属性"
5. 选择"使用下面的DNS服务器地址"
6. 输入：
   - 首选DNS服务器：`8.8.8.8`
   - 备用DNS服务器：`8.8.4.4`
7. 点击"确定"

## 常见DNS服务器列表

- **Google DNS**: 8.8.8.8, 8.8.4.4
- **Cloudflare DNS**: 1.1.1.1, 1.0.0.1
- **阿里DNS**: 223.5.5.5, 223.6.6.6
- **腾讯DNS**: 119.29.29.29, 182.254.116.116
- **114DNS**: 114.114.114.114, 114.114.115.115

## 问题排查步骤

1. **检查hosts文件**：看是否有该域名的条目指向127.0.0.1
2. **测试不同DNS服务器**：如果公共DNS能解析，说明是本地DNS的问题
3. **清除DNS缓存**：`ipconfig /flushdns`
4. **检查安全软件**：某些安全软件会拦截可疑域名
5. **检查网络设备**：路由器或防火墙可能在进行DNS拦截

## 注意事项

- 修改DNS配置需要管理员权限
- 某些域名被拦截可能是安全策略，请谨慎处理
- 如果所有DNS服务器都返回127.0.0.1，可能是网络层面的拦截

