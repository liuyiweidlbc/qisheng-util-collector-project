#!/bin/bash

# DNS问题修复脚本
# 用于修复DNS解析被重定向到127.0.0.1的问题

DOMAIN="${1:-8868d68.app}"

echo "=========================================="
echo "DNS问题修复工具"
echo "=========================================="
echo ""

# 1. 备份hosts文件
echo "1. 备份 /etc/hosts 文件..."
if [ -f /etc/hosts ]; then
    sudo cp /etc/hosts /etc/hosts.backup.$(date +%Y%m%d_%H%M%S)
    echo "   ✓ 备份完成"
else
    echo "   ⚠️  hosts文件不存在"
fi
echo ""

# 2. 检查并清理hosts文件中的问题域名
echo "2. 检查hosts文件中的 $DOMAIN ..."
if grep -q "$DOMAIN" /etc/hosts 2>/dev/null; then
    echo "   发现 $DOMAIN 在hosts文件中，准备清理..."
    sudo sed -i "/$DOMAIN/d" /etc/hosts
    echo "   ✓ 已清理"
else
    echo "   ✓ hosts文件中没有该域名"
fi
echo ""

# 3. 修改DNS服务器为公共DNS
echo "3. 修改DNS服务器配置..."
if [ -f /etc/resolv.conf ]; then
    # 备份resolv.conf
    sudo cp /etc/resolv.conf /etc/resolv.conf.backup.$(date +%Y%m%d_%H%M%S)
    
    echo "   当前DNS配置:"
    cat /etc/resolv.conf | grep "^nameserver"
    echo ""
    echo "   是否要修改为公共DNS服务器？(y/n)"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        # 创建新的resolv.conf
        sudo tee /etc/resolv.conf > /dev/null <<EOF
# DNS服务器配置 - 由修复脚本生成
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
EOF
        echo "   ✓ 已修改为公共DNS服务器"
    else
        echo "   跳过DNS服务器修改"
    fi
else
    echo "   ⚠️  未找到 /etc/resolv.conf"
fi
echo ""

# 4. 清除DNS缓存
echo "4. 清除DNS缓存..."
if command -v systemd-resolve &> /dev/null; then
    sudo systemd-resolve --flush-caches
    echo "   ✓ 已清除systemd-resolve缓存"
elif command -v resolvectl &> /dev/null; then
    sudo resolvectl flush-caches
    echo "   ✓ 已清除resolvectl缓存"
fi

if systemctl is-active --quiet nscd; then
    sudo systemctl restart nscd
    echo "   ✓ 已重启nscd服务"
fi

if systemctl is-active --quiet dnsmasq; then
    sudo systemctl restart dnsmasq
    echo "   ✓ 已重启dnsmasq服务"
fi
echo ""

# 5. 测试解析
echo "5. 测试DNS解析..."
echo "   解析 $DOMAIN:"
RESULT=$(dig +short $DOMAIN A 2>/dev/null | head -1)
if [ "$RESULT" = "127.0.0.1" ]; then
    echo "   ⚠️  仍然解析到 127.0.0.1"
    echo "   可能的原因:"
    echo "   - DNS服务器本身在拦截该域名"
    echo "   - 网络设备（路由器/防火墙）在拦截"
    echo "   - 运营商DNS在拦截"
    echo ""
    echo "   建议:"
    echo "   - 尝试使用VPN或代理"
    echo "   - 联系网络管理员"
    echo "   - 使用其他DNS服务器（如1.1.1.1）"
else
    echo "   ✓ 解析结果: $RESULT"
fi
echo ""

echo "=========================================="
echo "修复完成"
echo "=========================================="

