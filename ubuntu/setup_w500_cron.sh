#!/bin/bash

# 设置w500服务每6小时重启一次的cron任务

echo "正在设置w500服务每6小时重启一次的cron任务..."

# 确保重启脚本有执行权限
chmod +x /socbet/python-server/socbeta-data-w500-crawler/restart_w500_service.sh

# 添加cron任务 - 每6小时执行一次 (0点, 6点, 12点, 18点)
# 格式: 分钟 小时 日 月 星期 命令
echo "添加cron任务: 每6小时重启w500服务 (0点, 6点, 12点, 18点)"

# 方法1: 使用简单的supervisorctl命令（推荐）
(crontab -l 2>/dev/null; echo "0 0,6,12,18 * * * /usr/bin/supervisorctl restart data_flaskapi") | crontab -

# 方法2: 使用自定义脚本（如果需要更复杂的逻辑）
# (crontab -l 2>/dev/null; echo "0 0,6,12,18 * * * /socbet/python-server/socbeta-data-w500-crawler/restart_w500_service.sh") | crontab -

echo "Cron任务已添加完成！"
echo "任务详情: 每天0点、6点、12点、18点执行重启脚本"
echo ""

echo "查看当前cron任务列表:"
crontab -l

echo ""
echo "注意事项:"
echo "1. 重启脚本位置: /socbet/python-server/socbeta-data-w500-crawler/restart_w500_service.sh"
echo "2. 日志文件位置: /var/log/w500_restart.log"
echo "3. 确保supervisor服务正在运行: systemctl status supervisor"
echo "4. 如需手动重启服务: supervisorctl restart data_flaskapi"
echo "5. 查看服务状态: supervisorctl status data_flaskapi"
echo ""

echo "如需删除此任务，请运行: crontab -e 然后删除对应行"
echo "或者运行: crontab -r 删除所有cron任务"
