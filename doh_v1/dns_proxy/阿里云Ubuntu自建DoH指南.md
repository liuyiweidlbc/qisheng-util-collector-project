# 阿里云 Ubuntu 自建 DoH — 极简版

在阿里云 ECS 的 Ubuntu 上一条命令跑起 DoH，客户端用 `https://你的地址/dns-query` 即可。

---

## 方案对比（除 Blocky 外）

| 方案 | 组件 | 特点 | 脚本 |
|------|------|------|------|
| **Blocky + Caddy** | 2 个（DoH + HTTPS 反代） | 支持 nip.io/域名自动证书，配置灵活 | `setup_doh_ubuntu.sh` |
| **dnsproxy** | **1 个**（内置 DoH+TLS） | 单二进制搞定，无需 Caddy；证书需自签名或自备 | `setup_doh_dnsproxy_ubuntu.sh` |
| **AdGuard Home** | 1 个 + Web 管理 | DoH/DoT/DoQ、广告过滤、统计；443 需自配证书或反代 | 官方安装脚本 |

- **想最简单**：用 **dnsproxy**，一条脚本只装一个程序，自签名证书，客户端用 `-k` 即可。
- **想要域名 + 自动 HTTPS**：用 **Blocky + Caddy**，传 `47.x.x.x.nip.io` 或自有域名。
- **想要 Web 管理、过滤、统计**：用 AdGuard Home，再在前面套 Caddy/Nginx 做 443。

---

## 三步完成

### 1. 登录 ECS

SSH 登录你的 Ubuntu（22.04/20.04）。

### 2. 上传并执行脚本

任选其一，把对应脚本传到服务器后执行。

**方式 A：dnsproxy（单组件，最简单）**

```bash
chmod +x setup_doh_dnsproxy_ubuntu.sh
sudo ./setup_doh_dnsproxy_ubuntu.sh
```

**方式 B：Blocky + Caddy（支持域名 / nip.io 自动证书）**

```bash
chmod +x setup_doh_ubuntu.sh
sudo ./setup_doh_ubuntu.sh
```

**dnsproxy 脚本**无需参数，装完即用，DoH 为 `https://公网IP/dns-query`（自签名，客户端加 `-k`）。

**Blocky 脚本**不传参数时会自动检测公网 IP（纯 IP + 自签名）；也可手动指定：

```bash
# 纯 IP（自签名证书，客户端需 -k）
sudo ./setup_doh_ubuntu.sh 47.96.123.45

# 免费 nip.io 域名（自动申请 Let's Encrypt）
sudo ./setup_doh_ubuntu.sh 47.96.123.45.nip.io

# 自有域名
sudo ./setup_doh_ubuntu.sh doh.yourdomain.com
```

### 3. 放行 443

在**阿里云控制台 → ECS → 安全组**中，添加入方向规则：**TCP 443**。

脚本结束时会打印你的 DoH 地址，例如：

```
DoH 地址: https://47.96.123.45.nip.io/dns-query
```

---

## 验证

在本机（Windows）项目目录下：

```bash
# 有域名 / nip.io
python verify_doh.py -u "https://你的地址/dns-query"

# 纯 IP 自签名
python verify_doh.py -u "https://47.96.123.45/dns-query" -k

# 纯 IP 自签名
python verify_doh.py -u "https://dns.socbetooo.xyz/dns-query" -k
```

能返回解析结果即表示 DoH 正常。若出现 **400 Bad Request**，多为自建 DoH（如 dnsproxy）仅支持 POST，请安装 `dnspython` 后重试：`pip install dnspython`。

---

## 常见问题

**没有域名可以吗？**  
可以。不传参数或传 `你的公网IP` 即用自签名；传 `你的公网IP.nip.io` 即用免费域名 + 自动证书。

**不用证书可以吗？**  
DoH 必须走 HTTPS，所以必须有证书。脚本会用 Caddy 自签名或 Let's Encrypt，无需你买证书。

**脚本做了什么？**  
- **dnsproxy**：只装 dnsproxy，自签名证书，监听 443，上游 223.5.5.5 / 1.1.1.1。  
- **Blocky**：装 Blocky + Caddy，Blocky 提供 DoH，Caddy 做 HTTPS；改上游可编辑 `/etc/blocky/config.yml` 后 `sudo systemctl restart blocky`。

**自建 DoH 后 SSH 连不上了？**  
多半是脚本里执行了 `ufw enable` 却未先放行 22。用阿里云 **VNC/Workbench 远程连接** 登录到实例，执行：`sudo ufw allow 22/tcp`，再 `sudo ufw reload`，即可恢复 SSH。当前脚本已改为先放行 22 再启用 ufw。

---

## 不想自建？可考虑「伪自建」

若懒得折腾服务器，可用托管型 DoH，体验接近自建、零维护：

| 类型       | 代表服务              | 易用 | 性能/隐私 | 特点                     | 适合人群           |
|------------|-----------------------|------|-----------|--------------------------|--------------------|
| **伪自建** | NextDNS / Control D   | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐   | 零维护，全球 Anycast 加速 | 懒得折腾服务器的用户 |

- **NextDNS**：可自定义过滤列表、日志策略，有免费额度。  
- **Control D**：类似能力，按需选套餐。  

两者都提供 DoH 端点，在客户端填其提供的 `https://.../dns-query` 即可，无需自己搭 ECS。

---

## 手动步骤（可选）

若不想用脚本，可打开 `setup_doh_ubuntu.sh` 或 `setup_doh_dnsproxy_ubuntu.sh` 查看命令自行执行。  
- **dnsproxy**：单进程 `dnsproxy -l 0.0.0.0 --https-port=443 --tls-crt=... --tls-key=... -u 223.5.5.5 -p 0`。  
- **Blocky**：Blocky 监听 8080 提供 DoH，Caddy 在 443 反代到 8080。
