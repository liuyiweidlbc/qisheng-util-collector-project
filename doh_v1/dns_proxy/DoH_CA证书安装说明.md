# DoH — dnsproxy + CA 证书安装说明

使用 **Let's Encrypt** 为 dnsproxy 申请 CA 签发的证书，客户端无需 `-k`，直接使用 `https://域名/dns-query`。

---

## 用法

```bash
sudo ./setup_doh_dnsproxy_ubuntu_ca.sh <域名> [邮箱]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| 域名 | 是 | 用于 DoH 访问的域名，须已解析到本机公网 IP |
| 邮箱 | 否 | Let's Encrypt 通知/续期用；不填则使用随机账号（续期可能需交互） |

### 示例

```bash
chmod +x setup_doh_dnsproxy_ubuntu_ca.sh

# 指定域名 + 邮箱（推荐）
sudo ./setup_doh_dnsproxy_ubuntu_ca.sh doh.example.com admin@example.com

# 仅指定域名
sudo ./setup_doh_dnsproxy_ubuntu_ca.sh doh.example.com
```

---

## 前提条件

1. **域名解析**：将所用域名的 **A 记录** 指到本机公网 IP。
2. **80 端口**：申请证书时需公网能访问本机 80；阿里云安全组放行 **TCP 80**、**TCP 443**。脚本在证书验证完成后会关闭 80（DoH 仅用 443）。
3. **无占用 80 的服务**：若本机已有 nginx/apache 等占 80，请先改端口或停用，否则 certbot 无法用 standalone 验证。

---

## 脚本做了什么

1. 安装 certbot，用 standalone 申请 Let's Encrypt 证书，申请完后关闭 80。
2. 安装 dnsproxy，并配置 systemd 使用 Let's Encrypt 证书路径。
3. **连接跟踪（conntrack）调优**：提高 `nf_conntrack_max`、缩短 TIME_WAIT 等，避免 **DoH 使用过程中** 连接跟踪表被占满导致新连接（含 SSH）被内核丢弃。
4. 配置续期钩子与续期脚本 `certbot-renew-doh.sh`（续期时需临时开 80）。

---

## 安装完成后

- **DoH 地址**：`https://<你填的域名>/dns-query`
- **客户端**：无需 `-k`，直接使用上述地址即可。
- **证书续期**：使用 `/usr/local/bin/certbot-renew-doh.sh`（会临时开 80、续期、再关 80）。可加入 cron：`0 3 * * * /usr/local/bin/certbot-renew-doh.sh`
- **若 DoH 使用后 SSH 连不上**：多为 Linux 连接跟踪表满（`nf_conntrack: table full`）。脚本已写入 `/etc/sysctl.d/99-dnsproxy-conntrack.conf` 做调优；已装过的机器可手动执行：`sysctl -p /etc/sysctl.d/99-dnsproxy-conntrack.conf`，或重跑本脚本。

---

## 与自签版对比

| 项目 | 自签版 `setup_doh_dnsproxy_ubuntu.sh` | CA 证书版 `setup_doh_dnsproxy_ubuntu_ca.sh` |
|------|----------------------------------------|---------------------------------------------|
| 证书 | 脚本内生成自签名 | Let's Encrypt |
| 参数 | 无需参数 | 必须传域名，可选邮箱 |
| 前置 | 无 | 域名解析到本机、80 可访问 |
| 客户端 | 需 `-k` 或信任自签 | 无需 `-k` |
| DoH 地址 | `https://公网IP/dns-query` | `https://域名/dns-query` |
