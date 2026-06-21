#!/bin/bash

# 设置错误时退出
set -e

# 设置日志文件
LOG_FILE="/socbet/python-crawler/jobs/cnjc_crawler_job/cnjc_cron.log"
LOCK_FILE="/socbet/python-crawler/jobs/cnjc_crawler_job/cnjc_cron.lock"

# 记录开始时间
echo "$(date '+%Y-%m-%d %H:%M:%S') - Cron任务开始执行" >> $LOG_FILE

# 检查是否已有进程在运行
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 进程 $PID 仍在运行，跳过本次执行" >> $LOG_FILE
        exit 0
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 锁文件存在但进程已结束，清理锁文件" >> $LOG_FILE
        rm -f "$LOCK_FILE"
    fi
fi

# 停止现有进程
echo "$(date '+%Y-%m-%d %H:%M:%S') - 停止现有进程..." >> $LOG_FILE
./off.sh >> $LOG_FILE 2>&1

# 等待进程完全停止
sleep 2

# 检查进程是否已停止
RUNNING_PROCESSES=$(ps -ef | grep ".py" | grep "job" | grep "crawler" | grep "cnjc" | grep -v grep | wc -l)
if [ $RUNNING_PROCESSES -gt 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 仍有 $RUNNING_PROCESSES 个进程在运行，强制停止" >> $LOG_FILE
    ps -ef | grep ".py" | grep "job" | grep "crawler" | grep "cnjc" | grep -v grep | awk '{print $2}' | xargs kill -9 >> $LOG_FILE 2>&1
    sleep 1
fi

# 激活虚拟环境并启动新进程
echo "$(date '+%Y-%m-%d %H:%M:%S') - 激活虚拟环境并启动新进程..." >> $LOG_FILE

# 切换到工作目录
cd /socbet/python-crawler/jobs/cnjc_crawler_job

# 激活虚拟环境
source /socbet/python-crawler/venv/bin/activate

# 启动Python脚本
nohup python -u /socbet/python-crawler/source_code/match_markets/jobs/job_crawler_cnjc.py > /socbet/python-crawler/jobs/cnjc_crawler_job/cnjc.log 2>&1 &

# 获取新进程PID
NEW_PID=$!
echo $NEW_PID > "$LOCK_FILE"

# 等待一下确保进程启动
sleep 2

# 检查进程是否成功启动
if ps -p $NEW_PID > /dev/null 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 进程成功启动，PID: $NEW_PID" >> $LOG_FILE
    
    # 显示运行中的进程
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 当前运行中的进程:" >> $LOG_FILE
    ps -ef | grep ".py" | grep "job" | grep "crawler" | grep "cnjc" | grep -v grep >> $LOG_FILE 2>&1
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Cron任务执行完成" >> $LOG_FILE
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 进程启动失败！" >> $LOG_FILE
    rm -f "$LOCK_FILE"
    exit 1
fi
