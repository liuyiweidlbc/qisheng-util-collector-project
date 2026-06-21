#!/bin/bash
# 阿里云 Ubuntu 一键安装 DoH — 仅 dnsproxy（单二进制 + 自签名，无需 Caddy）
# 用法: sudo ./setup_doh_dnsproxy_ubuntu.sh
# DoH 地址: https://你的公网IP/dns-query  客户端需 -k 或信任自签名证书

set -e
DNSPROXY_VER="${DNSPROXY_VER:-0.78.2}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 运行此脚本"
  exit 1
fi

echo "DoH 方案: dnsproxy（单组件，内置 DoH+TLS）"
echo ""

# 依赖
apt-get update -qq
apt-get install -y -qq curl wget

# 下载 dnsproxy（Linux amd64 包名: dnsproxy-linux-amd64-vX.Y.Z.tar.gz）
echo "[1/5] 安装 dnsproxy..."
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

# 自签名证书（10 年）
echo "[2/5] 生成自签名证书..."
mkdir -p /etc/dnsproxy
openssl req -x509 -newkey rsa:2048 -keyout /etc/dnsproxy/key.pem -out /etc/dnsproxy/cert.pem -days 3650 -nodes -subj "/CN=localhost"

# systemd
echo "[3/5] 配置系统服务..."
cat > /etc/systemd/system/dnsproxy-doh.service << 'SVC'
[Unit]
Description=dnsproxy DoH
After=network.target
[Service]
Type=simple
ExecStart=/usr/local/bin/dnsproxy -l 0.0.0.0 --https-port=443 --tls-crt=/etc/dnsproxy/cert.pem --tls-key=/etc/dnsproxy/key.pem -u 223.5.5.5 -u 223.6.6.6 -u 1.1.1.1 -p 0
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload
systemctl enable --now dnsproxy-doh

# 连接跟踪调优：DoH 使用时会占用大量 conntrack，表满后新连接（含 SSH）会被丢弃
echo "[4/5] 配置连接跟踪..."
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

echo "[5/5] 开放端口..."
ufw allow 22/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw --force enable 2>/dev/null || true

PUBLIC_IP="$(curl -s --connect-timeout 3 https://ifconfig.me/ip 2>/dev/null || curl -s --connect-timeout 3 https://icanhazip.com 2>/dev/null || echo '你的公网IP')"
echo ""
echo "=========================================="
echo "  DoH 已就绪（dnsproxy 单组件）"
echo "=========================================="
echo "  DoH 地址: https://${PUBLIC_IP}/dns-query"
echo "  自签名证书，客户端测试请加 -k："
echo "  python verify_doh.py -u \"https://${PUBLIC_IP}/dns-query\" -k"
echo ""
echo "  已写入 sysctl 调优 nf_conntrack，减轻 DoH 使用占满连接导致 SSH 不可用"
echo "  阿里云安全组请放行入方向 TCP 443"
echo "=========================================="
