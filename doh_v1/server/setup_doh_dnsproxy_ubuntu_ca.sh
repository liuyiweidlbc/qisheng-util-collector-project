#!/bin/bash
# 阿里云 Ubuntu 一键安装 DoH — dnsproxy + Let's Encrypt CA 证书
# 用法: sudo ./setup_doh_dnsproxy_ubuntu_ca.sh <域名> [邮箱]
# 示例: sudo ./setup_doh_dnsproxy_ubuntu_ca.sh doh.example.com admin@example.com
# 说明: 需先将域名 A 记录解析到本机公网 IP，且 80 端口用于证书验证
# DoH 地址: https://<域名>/dns-query  客户端无需 -k

set -e
DNSPROXY_VER="${DNSPROXY_VER:-0.78.2}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 运行此脚本"
  exit 1
fi

DOMAIN="${1:?请提供域名，例如: sudo $0 doh.example.com [email@example.com]}"
CERTBOT_EMAIL="${2:-}"

if [ -z "$CERTBOT_EMAIL" ]; then
  echo "未提供邮箱，将使用 certbot 随机生成（续期时可能需交互）"
  CERTBOT_EXTRA="--register-unsafe-without-email"
else
  CERTBOT_EXTRA="--email $CERTBOT_EMAIL --agree-tos"
fi

echo "DoH 方案: dnsproxy + Let's Encrypt CA 证书"
echo "域名: $DOMAIN"
echo ""

# 依赖（含 certbot）
apt-get update -qq
apt-get install -y -qq curl wget certbot

ufw allow 22/tcp 2>/dev/null || true
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw --force enable 2>/dev/null || true

systemctl stop dnsproxy-doh 2>/dev/null || true

# [1/5] 申请 Let's Encrypt 证书（standalone 占用 80）
echo "[1/5] 申请 Let's Encrypt 证书（需域名已解析到本机）..."
certbot certonly --standalone -d "$DOMAIN" --non-interactive $CERTBOT_EXTRA \
  --preferred-challenges http \
  || { echo "证书申请失败，请确认: 1) 域名 A 记录指向本机 2) 80 端口可访问"; exit 1; }
# 验证完成后关闭 80（DoH 仅用 443，减少暴露面）
ufw delete allow 80/tcp 2>/dev/null || true

CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  echo "证书文件不存在: $CERT_PATH / $KEY_PATH"
  exit 1
fi

# [2/5] 安装 dnsproxy
echo "[2/5] 安装 dnsproxy..."
mkdir -p /tmp/dnsproxy_install
cd /tmp/dnsproxy_install
wget -q "https://github.com/AdguardTeam/dnsproxy/releases/download/v${DNSPROXY_VER}/dnsproxy-linux-amd64-v${DNSPROXY_VER}.tar.gz" -O dnsproxy.tar.gz
if [ ! -s dnsproxy.tar.gz ]; then
  echo "下载失败，请检查版本: https://github.com/AdguardTeam/dnsproxy/releases"
  exit 1
fi
tar -xzf dnsproxy.tar.gz
find . -name dnsproxy -type f -exec mv {} /usr/local/bin/dnsproxy \;
chmod +x /usr/local/bin/dnsproxy
cd -
rm -rf /tmp/dnsproxy_install

# [3/5] systemd 服务（使用 CA 证书路径）
echo "[3/5] 配置系统服务..."
cat > /etc/systemd/system/dnsproxy-doh.service << SVC
[Unit]
Description=dnsproxy DoH (CA cert)
After=network.target
[Service]
Type=simple
ExecStart=/usr/local/bin/dnsproxy -l 0.0.0.0 --https-port=443 --tls-crt=$CERT_PATH --tls-key=$KEY_PATH -u 223.5.5.5 -u 223.6.6.6 -u 1.1.1.1 -p 0
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
SVC

# [4/5] 连接跟踪调优：DoH 使用时会占用大量 conntrack，表满后新连接（含 SSH）会被丢弃
echo "[4/5] 配置连接跟踪与续期..."
modprobe nf_conntrack 2>/dev/null || true
if [ -d /proc/sys/net/netfilter ]; then
  cat > /etc/sysctl.d/99-dnsproxy-conntrack.conf << 'SYSCTL'
# 提高连接跟踪表上限，避免 DoH 使用占满后 SSH 等新连接被 drop
net.netfilter.nf_conntrack_max=262144
net.netfilter.nf_conntrack_tcp_timeout_established=3600
net.netfilter.nf_conntrack_tcp_timeout_time_wait=30
SYSCTL
  sysctl -p /etc/sysctl.d/99-dnsproxy-conntrack.conf 2>/dev/null || true
fi

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/restart-dnsproxy.sh << 'HOOK'
#!/bin/sh
systemctl restart dnsproxy-doh
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-dnsproxy.sh

# 续期时需临时开放 80，续完可关
cat > /usr/local/bin/certbot-renew-doh.sh << 'RENEW'
#!/bin/bash
ufw allow 80/tcp 2>/dev/null || true
certbot renew --quiet
ufw delete allow 80/tcp 2>/dev/null || true
RENEW
chmod +x /usr/local/bin/certbot-renew-doh.sh

systemctl daemon-reload
systemctl enable --now dnsproxy-doh

# [5/5] 提示
echo "[5/5] 就绪"
echo ""
echo "=========================================="
echo "  DoH 已就绪（dnsproxy + CA 证书）"
echo "=========================================="
echo "  DoH 地址: https://${DOMAIN}/dns-query"
echo "  客户端无需 -k，直接使用上述地址即可。"
echo ""
echo "  证书续期: /usr/local/bin/certbot-renew-doh.sh  可加入 cron: 0 3 * * * ..."
echo "  已写入 sysctl 调优 nf_conntrack，减轻 DoH 使用占满连接导致 SSH 不可用；阿里云安全组放行 22、443"
echo "=========================================="
