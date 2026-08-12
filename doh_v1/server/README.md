# server — 阿里云自建 DoH

**部署请直接打开：[部署说明.md](部署说明.md)**（逐步照做，含上传、安全组、验证）。

| 文件 | 用途 |
|------|------|
| `setup_doh_dnsproxy_ubuntu.sh` | **推荐**：纯 IP + 自签名，一条命令 |
| `verify_doh.py` | 本机验证 DoH 是否通 |
| `setup_doh_dnsproxy_ubuntu_ca.sh` | 进阶：域名 + Let's Encrypt |
| `DoH_CA证书安装说明.md` | CA 方案补充说明 |
| `setup_doh_ubuntu.sh` | 进阶：Blocky + Caddy（另一套） |
