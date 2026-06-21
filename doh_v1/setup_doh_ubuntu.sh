#!/bin/bash
# 阿里云 Ubuntu 一键安装 DoH（Blocky + Caddy）
# 用法: sudo ./setup_doh_ubuntu.sh [主机名或IP]
#       不传参数则自动用 本机公网IP.nip.io 或 纯IP+自签名

set -e
BLOCKY_VER="${BLOCKY_VER:-0.28}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 运行此脚本"
  exit 1
fi

# 解析参数：可选的主机名或 IP
HOST="$1"
if [ -z "$HOST" ]; then
  echo "未指定主机名，尝试检测公网 IP..."
  HOST="$(curl -s --connect-timeout 3 https://ifconfig.me/ip 2>/dev/null || curl -s --connect-timeout 3 https://icanhazip.com 2>/dev/null || true)"
  if [ -z "$HOST" ]; then
    echo "无法自动获取公网 IP。请手动指定："
    echo "  sudo $0 47.96.123.45          # 纯 IP（自签名证书）"
    echo "  sudo $0 47.96.123.45.nip.io    # nip.io 免费域名"
    exit 1
  fi
  # 若得到的是 IP，就用自签名；否则假定是域名
  if [[ "$HOST" =~ ^[0-9.]+$ ]]; then
    DOH_HOST="$HOST"
    USE_NIP=""
  else
    DOH_HOST="$HOST"
    USE_NIP="1"
  fi
else
  DOH_HOST="$HOST"
  if [[ "$HOST" =~ ^[0-9.]+$ ]]; then
    USE_NIP=""
  else
    USE_NIP="1"
  fi
fi

echo "DoH 将使用: $DOH_HOST"
echo ""

# 依赖
apt-get update -qq
apt-get install -y -qq curl wget

# Blocky
echo "[1/5] 安装 Blocky..."
mkdir -p /tmp/blocky_install
cd /tmp/blocky_install
wget -q "https://github.com/0xERR0R/blocky/releases/download/v${BLOCKY_VER}/blocky_${BLOCKY_VER}_Linux_x86_64.tar.gz" -O blocky.tar.gz
tar -xzf blocky.tar.gz
mv blocky /usr/local/bin/
chmod +x /usr/local/bin/blocky
cd -
rm -rf /tmp/blocky_install

# Blocky 配置
echo "[2/5] 配置 Blocky..."
mkdir -p /etc/blocky
cat > /etc/blocky/config.yml << 'BLOCKY'
upstream:
  default:
    - 223.5.5.5
    - 223.6.6.6
    - 1.1.1.1
port: 0
httpPort: 8080
enableDoH: true
BLOCKY

# systemd
cat > /etc/systemd/system/blocky.service << 'SVC'
[Unit]
Description=Blocky DoH
After=network.target
[Service]
Type=simple
ExecStart=/usr/local/bin/blocky --config /etc/blocky/config.yml
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload
systemctl enable --now blocky

# Caddy
echo "[3/5] 安装 Caddy..."
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
curl -sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
apt-get update -qq
apt-get install -y -qq caddy

# Caddyfile：IP 用自签名，域名用自动 HTTPS
echo "[4/5] 配置 Caddy..."
if [[ "$DOH_HOST" =~ ^[0-9.]+$ ]]; then
  cat > /etc/caddy/Caddyfile << CADDY
https://${DOH_HOST} {
  tls internal
  reverse_proxy localhost:8080
}
CADDY
else
  cat > /etc/caddy/Caddyfile << CADDY
${DOH_HOST} {
  reverse_proxy localhost:8080
}
CADDY
fi
systemctl reload caddy || systemctl start caddy

# 防火墙（若未启用 ufw 可能失败，忽略）
echo "[5/5] 开放端口（务必先放行 22 再启用 ufw，避免锁死 SSH）..."
ufw allow 22/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw --force enable 2>/dev/null || true

echo ""
echo "=========================================="
echo "  DoH 已就绪"
echo "=========================================="
echo "  DoH 地址: https://${DOH_HOST}/dns-query"
echo ""
if [[ "$DOH_HOST" =~ ^[0-9.]+$ ]]; then
  echo "  证书为自签名，客户端测试请加 -k："
  echo "  python verify_doh.py -u \"https://${DOH_HOST}/dns-query\" -k"
else
  echo "  测试: python verify_doh.py -u \"https://${DOH_HOST}/dns-query\""
fi
echo ""
echo "  阿里云安全组请放行入方向 TCP 443"
echo "=========================================="
