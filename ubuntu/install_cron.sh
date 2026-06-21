#!/bin/bash

# 安装和设置crontab任务的脚本

echo "=== CNJC爬虫Crontab安装脚本 ==="
echo ""

# 检查目标目录是否存在
TARGET_DIR="/socbet/python-crawler/jobs/cnjc_crawler_job"
if [ ! -d "$TARGET_DIR" ]; then
    echo "错误: 目标目录 $TARGET_DIR 不存在！"
    echo "请确保Python爬虫项目已正确安装。"
    exit 1
fi

echo "目标目录检查通过: $TARGET_DIR"
echo ""

# 复制脚本到目标目录
echo "正在复制脚本文件..."

# 检查cron执行脚本是否已存在
if [ -f "$TARGET_DIR/cron_cnjc.sh" ]; then
    echo "✓ cron_cnjc.sh 已存在于目标目录，跳过复制"
else
    # 复制cron执行脚本
    cp "$(dirname "$0")/cron_cnjc.sh" "$TARGET_DIR/"
    if [ $? -eq 0 ]; then
        echo "✓ cron_cnjc.sh 复制成功"
    else
        echo "✗ cron_cnjc.sh 复制失败"
        exit 1
    fi
fi

# 设置执行权限
echo "正在设置执行权限..."
chmod +x "$TARGET_DIR/cron_cnjc.sh"
if [ $? -eq 0 ]; then
    echo "✓ 执行权限设置成功"
else
    echo "✗ 执行权限设置失败"
    exit 1
fi

echo ""
echo "=== 脚本安装完成 ==="
echo ""

# 询问是否立即设置crontab
read -p "是否立即设置crontab任务？(y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "正在设置crontab任务..."
    
    # 添加cron任务
    (crontab -l 2>/dev/null; echo "50 10 * * * $TARGET_DIR/cron_cnjc.sh") | crontab -
    
    if [ $? -eq 0 ]; then
        echo "✓ Crontab任务设置成功！"
        echo ""
        echo "当前crontab任务列表:"
        crontab -l
        echo ""
        echo "任务详情: 每天10:50执行 $TARGET_DIR/cron_cnjc.sh"
    else
        echo "✗ Crontab任务设置失败！"
        exit 1
    fi
else
    echo ""
    echo "请手动运行以下命令来设置crontab任务:"
    echo "crontab -e"
    echo ""
    echo "然后添加以下行:"
    echo "50 10 * * * $TARGET_DIR/cron_cnjc.sh"
fi

echo ""
echo "=== 安装完成 ==="
echo ""
echo "重要提示:"
echo "1. 确保 $TARGET_DIR/off.sh 脚本存在且可执行"
echo "2. 确保Python虚拟环境路径正确: /socbet/python-crawler/venv/"
echo "3. 确保Python脚本路径正确: /socbet/python-crawler/source_code/match_markets/jobs/job_crawler_cnjc.py"
echo ""
echo "日志文件位置:"
echo "- Cron执行日志: $TARGET_DIR/cnjc_cron.log"
echo "- Python脚本日志: $TARGET_DIR/cnjc.log"
echo ""
echo "如需测试脚本，请运行:"
echo "$TARGET_DIR/cron_cnjc.sh"
echo ""
echo "如需查看日志，请运行:"
echo "tail -f $TARGET_DIR/cnjc_cron.log"
echo "tail -f $TARGET_DIR/cnjc.log"
