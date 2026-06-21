# all_util_project

Socbeta / 奇胜 辅助工具与采集脚本合集：Tampermonkey 浏览器脚本、SQL 工具、DNS/DoH 配置、Ubuntu cron 与数据映射生成脚本等。

## 目录说明

| 目录 | 说明 |
|------|------|
| `tamper_monkey/` | 浏览器 Tampermonkey 脚本（500、Titan、Flashscore 等站点采集/标注） |
| `dbs/` | 数据库查询、表结构、映射更新 SQL |
| `data/` | 采集样本 JSON 与 `gen_*_map_sql.py` 等映射 SQL 生成脚本 |
| `doh_v1/` | DNS 劫持诊断与 DoH 配置脚本（Windows / Ubuntu） |
| `ubuntu/` | 服务器 cron 与服务重启脚本 |
| `supervisor/` | Supervisor 配置 |

## 常用脚本

- `gen_winter_homework_excel.py` — 生成寒假作业计划 Excel（输出 `winter_homework_plan.xlsx`，已 gitignore）
- `data/gen_500_map_sql.py` / `data/gen_titan_map_sql.py` — 从 JSON 生成比赛映射 SQL

## 推送

```bat
构建推送.bat
```
