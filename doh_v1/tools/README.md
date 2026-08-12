# tools — 诊断与 hosts 回退

临时绕过或排查 DNS 问题时使用。正式绕过劫持优先用 [`../client/`](../client/) DoH。

## 脚本

| 文件 | 说明 |
|------|------|
| `dns_diagnosis.ps1` / `.sh` | 诊断 hosts / DNS 解析 |
| `dns_test.bat` | 快速测试 |
| `fix_hosts.ps1` | **主力**：写入 hosts（需管理员） |
| `fix_dns_issue.ps1` / `.sh` | 综合修复尝试 |

```powershell
# 管理员
.\fix_hosts.ps1 域名 IP地址
.\dns_diagnosis.ps1 域名
```
