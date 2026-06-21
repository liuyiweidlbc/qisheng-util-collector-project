#!/bin/bash

# 每8小时重启w500服务的脚本
# 用于配合cron任务实现定时重启

# 设置日志文件
LOG_FILE="/var/log/w500_restart.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 记录开始时间
echo "[$TIMESTAMP] 开始重启w500服务..." >> $LOG_FILE

# 重启supervisor中的data_flaskapi服务
echo "[$TIMESTAMP] 正在重启data_flaskapi服务..." >> $LOG_FILE
supervisorctl restart data_flaskapi

# 检查服务状态
sleep 5
STATUS=$(supervisorctl status data_flaskapi)
echo "[$TIMESTAMP] 服务状态: $STATUS" >> $LOG_FILE

# 如果服务启动失败，尝试重新加载配置并重启
if [[ $STATUS == *"FATAL"* ]] || [[ $STATUS == *"STOPPED"* ]]; then
    echo "[$TIMESTAMP] 服务启动失败，尝试重新加载配置..." >> $LOG_FILE
    supervisorctl reread
    supervisorctl update
    supervisorctl restart data_flaskapi
    sleep 5
    NEW_STATUS=$(supervisorctl status data_flaskapi)
    echo "[$TIMESTAMP] 重新启动后状态: $NEW_STATUS" >> $LOG_FILE
fi

echo "[$TIMESTAMP] w500服务重启完成" >> $LOG_FILE
echo "----------------------------------------" >> $LOG_FILE
