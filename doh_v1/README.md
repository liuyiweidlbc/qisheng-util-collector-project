# doh_v1 — 从这里开始

打开本目录后，**先看下面这一行**，不要在文件夹里乱翻。

---

## 你想做什么？选一个

### A. 我要在阿里云上重新部署 DoH（最常见）

**打开这个文件，从上到下做：**

📄 **[server/部署说明.md](server/部署说明.md)**

只用一个脚本：`server/setup_doh_dnsproxy_ubuntu.sh`  
做完得到：`https://你的公网IP/dns-query`

---

### B. 服务器已经好了，我要在 Windows 本机用 DoH

看：[client/README.md](client/README.md)

---

### C. 临时改 hosts / 诊断 DNS

看：[tools/README.md](tools/README.md)

---

## 目录一览（不用全读）

```text
doh_v1/
  README.md          ← 你现在在这里（入口）
  server/            ← 阿里云部署（选 A）
    部署说明.md      ← ★ 部署从这里读
    setup_doh_dnsproxy_ubuntu.sh
    verify_doh.py
  client/            ← Windows 本机客户端（选 B）
  tools/             ← 诊断 / hosts（选 C）
  archive/           ← 旧文件归档，忽略
```

| 文件夹 | 什么时候进 |
|--------|------------|
| `server/` | 装 / 重装云上的 DoH |
| `client/` | 配你自己电脑的 DNS |
| `tools/` | 排查或临时写 hosts |
| `archive/` | **永远不用打开** |

---

**不确定选哪个？** → 选 **A**，打开 [server/部署说明.md](server/部署说明.md)。
