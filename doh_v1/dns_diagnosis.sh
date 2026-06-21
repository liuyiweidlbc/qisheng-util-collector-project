#!/bin/bash

# DNS诊断脚本 - 用于诊断DNS解析问题
# 使用方法: ./dns_diagnosis.sh 8868d68.app

DOMAIN="${1:-8868d68.app}"

echo "=========================================="
echo "DNS诊断工具 - 诊断域名: $DOMAIN"
echo "=========================================="
echo ""

# 1. 检查hosts文件
echo "1. 检查 /etc/hosts 文件..."
if grep -q "$DOMAIN" /etc/hosts 2>/dev/null; then
    echo "   ⚠️  发现 $DOMAIN 在 /etc/hosts 中:"
    grep "$DOMAIN" /etc/hosts
else
    echo "   ✓ hosts文件中没有找到 $DOMAIN"
fi
echo ""

# 2. 检查DNS服务器配置
echo "2. 检查DNS服务器配置..."
if [ -f /etc/resolv.conf ]; then
    echo "   DNS服务器列表:"
    grep "^nameserver" /etc/resolv.conf | awk '{print "   - " $2}'
else
    echo "   ⚠️  未找到 /etc/resolv.conf"
fi
echo ""

# 3. 使用不同DNS服务器测试解析
echo "3. 使用不同DNS服务器测试解析..."
echo ""

# 使用系统默认DNS
echo "   a) 系统默认DNS:"
dig +short $DOMAIN A 2>/dev/null | head -1 || echo "     解析失败"
echo ""

# 使用Google DNS
echo "   b) Google DNS (8.8.8.8):"
dig @8.8.8.8 +short $DOMAIN A 2>/dev/null | head -1 || echo "     解析失败"
echo ""

# 使用Cloudflare DNS
echo "   c) Cloudflare DNS (1.1.1.1):"
dig @1.1.1.1 +short $DOMAIN A 2>/dev/null | head -1 || echo "     解析失败"
echo ""

# 使用阿里DNS
echo "   d) 阿里DNS (223.5.5.5):"
dig @223.5.5.5 +short $DOMAIN A 2>/dev/null | head -1 || echo "     解析失败"
echo ""

# 4. 检查DNS缓存
echo "4. 检查DNS缓存..."
if command -v systemd-resolve &> /dev/null; then
    echo "   使用 systemd-resolve 查询缓存:"
    systemd-resolve --status | grep -A 5 "DNS Servers" || echo "   无缓存信息"
elif command -v resolvectl &> /dev/null; then
    echo "   使用 resolvectl 查询缓存:"
    resolvectl status | grep -A 5 "DNS Servers" || echo "   无缓存信息"
else
    echo "   未找到systemd-resolve或resolvectl命令"
fi
echo ""

# 5. 清除DNS缓存（如果可能）
echo "5. DNS缓存清理建议:"
echo "   如果使用systemd-resolve: sudo systemd-resolve --flush-caches"
echo "   如果使用nscd: sudo systemd restart nscd"
echo "   如果使用dnsmasq: sudo systemctl restart dnsmasq"
echo ""

# 6. 多次测试解析结果
echo "6. 连续5次解析测试（观察是否变化）:"
for i in {1..5}; do
    RESULT=$(dig +short $DOMAIN A 2>/dev/null | head -1)
    echo "   第 $i 次: $RESULT"
    sleep 1
done
echo ""

# 7. 检查是否有DNS拦截软件
echo "7. 检查可能的DNS拦截软件:"
if systemctl list-units --type=service | grep -qi "dnsmasq\|unbound\|bind"; then
    echo "   发现DNS相关服务:"
    systemctl list-units --type=service | grep -i "dnsmasq\|unbound\|bind"
else
    echo "   未发现常见的DNS拦截服务"
fi
echo ""

# 8. 检查防火墙规则
echo "8. 检查iptables规则（DNS相关）:"
if command -v iptables &> /dev/null; then
    iptables -L -n | grep -i "53\|dns" | head -5 || echo "   未发现明显的DNS拦截规则"
else
    echo "   未安装iptables"
fi
echo ""

echo "=========================================="
echo "诊断完成"
echo "=========================================="
echo ""
echo "建议解决方案:"
echo "1. 如果hosts文件中有该域名，请检查并删除相关条目"
echo "2. 如果使用公共DNS（如8.8.8.8）能正常解析，说明是本地DNS服务器的问题"
echo "3. 尝试修改 /etc/resolv.conf 使用公共DNS服务器"
echo "4. 清除DNS缓存后重试"
echo "5. 检查是否有安全软件或防火墙在拦截该域名"

