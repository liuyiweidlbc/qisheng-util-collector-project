# 运营商DNS劫持解决方案

## 问题确认

当使用 `nslookup 8868d68.app 8.8.8.8` 仍然返回 `127.0.0.1` 时，说明是**运营商层面的DNS劫持**。

运营商在骨干网层面拦截DNS查询，即使指定了公共DNS服务器，查询包也会被运营商劫持。

## 解决方案（按推荐顺序）

### 方案1：使用DNS over HTTPS (DoH) ⭐⭐⭐⭐⭐

**原理**：DoH使用HTTPS加密DNS查询，运营商无法拦截。

#### 方法A：Windows 11/10 21H2+ 原生支持

```powershell
# 以管理员身份运行
.\setup_doh.ps1
```

#### 方法B：使用Cloudflared（推荐，适用于所有Windows版本）

```powershell
# 安装并配置cloudflared
.\cloudflared_setup.ps1
```

**优点**：
- 完全绕过运营商劫持
- 加密DNS查询，保护隐私
- 不需要VPN

**缺点**：
- 需要安装额外软件（cloudflared）

### 方案2：使用VPN ⭐⭐⭐⭐

使用VPN后，所有网络流量（包括DNS）都通过VPN服务器，运营商无法拦截。

**推荐VPN**：
- 自建VPN服务器
- 商业VPN服务

### 方案3：修改hosts文件 ⭐⭐⭐

如果知道正确的IP地址，可以直接在hosts文件中指定。

```powershell
# 以管理员身份运行
.\fix_hosts.ps1 8868d68.app [IP地址]
```

**如何获取正确IP**：
1. 使用VPN后查询
2. 使用在线DNS查询工具（需要VPN访问）
3. 使用IPv6地址（如果可用）

**优点**：
- 简单直接
- 不需要额外软件

**缺点**：
- 需要知道正确的IP地址
- IP地址可能变化

### 方案4：使用代理 ⭐⭐⭐

配置HTTP/HTTPS代理，通过代理访问网站。

### 方案5：使用Tor浏览器 ⭐⭐

Tor浏览器可以绕过DNS劫持，但速度较慢。

## 快速开始

### 推荐方案：Cloudflared DoH

1. **安装cloudflared**：
   ```powershell
   .\cloudflared_setup.ps1
   ```
   选择选项2（配置为系统服务）

2. **验证**：
   ```cmd
   nslookup 8868d68.app
   ```
   应该返回正确的IP地址，而不是127.0.0.1

### 临时方案：修改hosts

如果你知道正确的IP地址（比如从第一次访问时获取的 `20.255.104.21`）：

```powershell
# 以管理员身份运行
.\fix_hosts.ps1 8868d68.app 20.255.104.21
```

## 详细步骤

### 使用Cloudflared设置DoH

1. **下载cloudflared**：
   - 访问：https://github.com/cloudflare/cloudflared/releases
   - 下载 `cloudflared-windows-amd64.exe`
   - 重命名为 `cloudflared.exe`

2. **手动安装服务**：
   ```cmd
   # 以管理员身份打开CMD
   cd C:\cloudflared
   cloudflared.exe service install
   cloudflared.exe service start
   ```

3. **修改系统DNS**：
   - 打开"网络和共享中心"
   - 更改适配器设置
   - 右键你的网络连接 → 属性
   - Internet协议版本4 → 属性
   - 使用下面的DNS服务器地址：`127.0.0.1`
   - 确定

4. **清除DNS缓存**：
   ```cmd
   ipconfig /flushdns
   ```

5. **测试**：
   ```cmd
   nslookup 8868d68.app
   ping 8868d68.app
   ```

### 手动修改hosts文件

1. **以管理员身份打开记事本**

2. **打开hosts文件**：
   ```
   C:\Windows\System32\drivers\etc\hosts
   ```

3. **添加条目**（如果知道正确IP）：
   ```
   20.255.104.21    8868d68.app
   ```

4. **保存文件**

5. **清除DNS缓存**：
   ```cmd
   ipconfig /flushdns
   ```

## 验证是否解决

```cmd
# 应该返回正确的IP，而不是127.0.0.1
nslookup 8868d68.app

# 应该能ping通
ping 8868d68.app

# 应该能访问
curl 8868d68.app
```

## 注意事项

1. **法律风险**：某些域名被拦截可能是法律要求，请谨慎处理
2. **安全风险**：被拦截的域名可能确实存在安全风险
3. **服务稳定性**：使用hosts文件时，如果IP地址变化，需要手动更新

## 故障排查

### Cloudflared服务无法启动

```cmd
# 检查服务状态
sc query cloudflared

# 查看日志
cloudflared.exe service logs
```

### 仍然解析到127.0.0.1

1. 检查hosts文件是否有该域名
2. 清除DNS缓存：`ipconfig /flushdns`
3. 重启网络适配器
4. 检查是否有其他DNS代理软件

### 无法访问网站

1. 检查防火墙设置
2. 检查代理设置
3. 尝试使用IPv6地址

