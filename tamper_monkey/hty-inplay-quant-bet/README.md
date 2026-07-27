# hty-inplay-quant-bet 源码

开发与构建：

```bash
cd tamper_monkey/hty-inplay-quant-bet
npm install
npm run build
```

输出：`../hty-inplay-quant-bet.user.js`（Tampermonkey 仍加载该路径）

## 结构

| 路径 | 说明 |
|------|------|
| `NAV_RULES.md` | 导航/保活硬规则 |
| `header.meta.js` | Userscript 元数据 |
| `early/document-start.js` | document-start 非足球拉回 |
| `src/storage-keys.js` | sessionStorage key |
| `src/config.js` | 版本与冷却常量 |
| `src/keepalive.js` | keepalive phase |
| `src/nav-policy.js` | 禁列表 / 硬冷却 / 熔断 |
| `src/login-nav-gate.js` | 登录门禁 |
| `src/nav-picker.js` | 选场纯逻辑 |
| `src/scheduler.js` | 心跳任务 runner |
| `src/app-body.inc.js` | 主业务体（源文件，勿从产物反抽） |
| `src/app.js` | prepare 生成：bootApp + imports |
| `src/main.js` | 入口 |
| `build.mjs` | esbuild IIFE + 拼接 header/early |

修改业务请改 `src/app-body.inc.js` 与各小模块，然后 `npm run build`。
