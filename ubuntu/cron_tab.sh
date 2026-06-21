#!/bin/bash

# 设置cron任务，每天10:50执行爬虫脚本
# 使用crontab -e 命令编辑cron任务

# 添加cron任务到当前用户的crontab
# 格式: 分钟 小时 日 月 星期 命令
# 50 10 * * * 表示每天10:50执行

# 方法1: 使用专门的cron执行脚本（推荐）
echo "正在添加cron任务..."
(crontab -l 2>/dev/null; echo "50 10 * * * /socbet/python-crawler/jobs/cnjc_crawler_job/cron_cnjc.sh") | crontab -

# 方法2: 直接添加cron任务（简单但可能有问题）
# (crontab -l 2>/dev/null; echo "50 10 * * * /socbet/python-crawler/jobs/cnjc_crawler_job/on.sh") | crontab -

# 方法3: 带环境变量和日志记录的cron任务
# (crontab -l 2>/dev/null; echo "50 10 * * * cd /socbet/python-crawler/jobs/cnjc_crawler_job && /usr/bin/python3 /socbet/python-crawler/jobs/cnjc_crawler_job/on.sh >> /var/log/cnjc_crawler.log 2>&1") | crontab -

# 方法4: 使用完整环境变量的cron任务
# (crontab -l 2>/dev/null; echo "SHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOME=/home/your_username\n50 10 * * * cd /socbet/python-crawler/jobs/cnjc_crawler_job && /socbet/python-crawler/jobs/cnjc_crawler_job/on.sh >> /var/log/cnjc_crawler.log 2>&1") | crontab -

echo "Cron任务已添加完成！"
echo "任务详情: 每天10:50执行 /socbet/python-crawler/jobs/cnjc_crawler_job/cron_cnjc.sh"
echo ""
echo "查看当前cron任务列表:"
crontab -l

echo ""
echo "注意事项:"
echo "1. cron任务会在系统重启后自动恢复执行"
echo "2. 确保脚本具有执行权限: chmod +x /socbet/python-crawler/jobs/cnjc_crawler_job/cron_cnjc.sh"
echo "3. 如需查看cron日志，请检查:"
echo "   - cron执行日志: /socbet/python-crawler/jobs/cnjc_crawler_job/cnjc_cron.log"
echo "   - Python脚本日志: /socbet/python-crawler/jobs/cnjc_crawler_job/cnjc.log"
echo "   - 系统cron日志: /var/log/cron 或 /var/log/syslog"
echo "4. 如需删除此任务，请运行: crontab -e 然后删除对应行"
echo ""
echo "如果crontab执行失败，请尝试以下解决方案："
echo "1. 检查脚本权限: chmod +x /socbet/python-crawler/jobs/cnjc_crawler_job/cron_cnjc.sh"
echo "2. 检查脚本是否依赖特定环境变量"
echo "3. 在脚本开头添加: #!/bin/bash 和 set -e"
echo "4. 使用绝对路径执行Python和相关命令"
echo "5. 添加日志记录以便调试: >> /var/log/cnjc_crawler.log 2>&1"
echo ""
echo "新脚本特性:"
echo "- 自动停止现有进程"
echo "- 进程锁机制防止重复执行"
echo "- 详细的执行日志记录"
echo "- 虚拟环境自动激活"
echo "- 错误处理和状态检查"
