#!/bin/bash

# 调试cron脚本执行问题的脚本

echo "=== CNJC爬虫Cron脚本调试工具 ==="
echo ""

# 设置变量
TARGET_DIR="/socbet/python-crawler/jobs/cnjc_crawler_job"
LOG_FILE="$TARGET_DIR/cnjc_cron.log"
PYTHON_LOG="$TARGET_DIR/cnjc.log"

echo "目标目录: $TARGET_DIR"
echo "Cron日志: $LOG_FILE"
echo "Python日志: $PYTHON_LOG"
echo ""

# 检查目录和文件
echo "=== 检查目录和文件 ==="
if [ -d "$TARGET_DIR" ]; then
    echo "✓ 目标目录存在"
    ls -la "$TARGET_DIR/"
else
    echo "✗ 目标目录不存在"
    exit 1
fi

echo ""

# 检查脚本权限
echo "=== 检查脚本权限 ==="
if [ -x "$TARGET_DIR/cron_cnjc.sh" ]; then
    echo "✓ cron_cnjc.sh 可执行"
else
    echo "✗ cron_cnjc.sh 不可执行"
    echo "正在设置执行权限..."
    chmod +x "$TARGET_DIR/cron_cnjc.sh"
fi

if [ -x "$TARGET_DIR/off.sh" ]; then
    echo "✓ off.sh 可执行"
else
    echo "✗ off.sh 不可执行"
fi

echo ""

# 检查Python环境
echo "=== 检查Python环境 ==="
if [ -d "/socbet/python-crawler/venv" ]; then
    echo "✓ Python虚拟环境存在"
    echo "虚拟环境路径: /socbet/python-crawler/venv"
else
    echo "✗ Python虚拟环境不存在"
fi

if [ -f "/socbet/python-crawler/source_code/match_markets/jobs/job_crawler_cnjc.py" ]; then
    echo "✓ Python脚本存在"
else
    echo "✗ Python脚本不存在"
fi

echo ""

# 检查日志文件
echo "=== 检查日志文件 ==="
if [ -f "$LOG_FILE" ]; then
    echo "✓ Cron日志文件存在"
    echo "最后10行日志:"
    tail -10 "$LOG_FILE"
else
    echo "✗ Cron日志文件不存在"
fi

echo ""

if [ -f "$PYTHON_LOG" ]; then
    echo "✓ Python日志文件存在"
    echo "最后10行日志:"
    tail -10 "$PYTHON_LOG"
else
    echo "✗ Python日志文件不存在"
fi

echo ""

# 检查系统资源
echo "=== 检查系统资源 ==="
echo "内存使用:"
free -h

echo ""
echo "磁盘空间:"
df -h

echo ""
echo "进程状态:"
ps -ef | grep "cnjc" | grep -v grep

echo ""

# 测试脚本执行
echo "=== 测试脚本执行 ==="
echo "注意: 这将实际执行脚本，请确保没有重要进程在运行"
read -p "是否继续测试脚本执行？(y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "正在执行脚本..."
    
    # 在后台执行脚本并监控
    cd "$TARGET_DIR"
    timeout 30s ./cron_cnjc.sh &
    SCRIPT_PID=$!
    
    echo "脚本PID: $SCRIPT_PID"
    echo "等待5秒..."
    sleep 5
    
    # 检查进程状态
    if ps -p $SCRIPT_PID > /dev/null 2>&1; then
        echo "✓ 脚本仍在运行"
        echo "正在停止脚本..."
        kill $SCRIPT_PID
        sleep 2
    else
        echo "✗ 脚本已结束"
    fi
    
    echo ""
    echo "执行后的日志:"
    if [ -f "$LOG_FILE" ]; then
        tail -20 "$LOG_FILE"
    fi
else
    echo "跳过脚本执行测试"
fi

echo ""
echo "=== 调试完成 ==="
echo ""
echo "建议:"
echo "1. 检查系统内存是否充足"
echo "2. 检查磁盘空间是否足够"
echo "3. 检查Python虚拟环境是否正确"
echo "4. 检查脚本中的路径是否正确"
echo "5. 查看系统日志: journalctl -f"




