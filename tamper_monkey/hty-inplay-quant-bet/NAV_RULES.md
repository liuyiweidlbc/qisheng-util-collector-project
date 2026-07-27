# HTY 滚球脚本 — 导航 / 保活 / 登录门禁规则

验收清单。改导航相关代码前先对照本文件。

## 硬规则

1. **禁止列表跳转**  
   脚本不得主动打开 `/sportEvents/inplay/football`（或等价足球滚球列表 URL）。  
   合法整页出口只有比赛页：`/sportEvents/(inplay|incoming)/football/match/{id}`。

2. **唯一导航入口**  
   所有 `location.href` / `location.replace` 必须经 `performPageNavigation` / `performPageReplace`。  
   入口内必须：硬冷却、熔断、列表 URL 拦截（有目标场则改写为比赛页，否则取消）。

3. **登录门禁**  
   自动切场 / 进场只问 `shouldBlockMatchAutoNav`（`login-nav-gate`）。  
   登录弹窗 / 登录收尾锁期间禁止自动导航；列表强制回场可仅拦弹窗（`force`），但仍走唯一入口。

4. **保活**  
   - 比赛页：只做 API 保活，禁止整页跳转（尤其禁止回列表）。  
   - 非比赛页：有目标比赛 ID 则直跳比赛页；无目标则不动。  
   - `KEEPALIVE_PHASE` 仅：`idle`（空/删除）| `enter-match`。废弃 `via-football` / `returning` / `going-list`。

5. **非足球版块**  
   有上次比赛 ID → 直跳该比赛页；无目标 → **停留**，绝不进列表。

6. **心跳调度**  
   `runHeartbeatTask` 为命名任务列表按优先级执行，禁止再往函数体堆无名单逻辑。

## 页面状态

| 状态 | 进入条件 | 允许的脚本导航 |
|------|----------|----------------|
| MatchPage | URL 含 `football/match/{id}` | 仅互跳其它比赛页 |
| ListPage | 已在列表（过渡） | 只允许离开到比赛页 |
| HubPage | `/sportEvents` | 进比赛页 |
| WrongSport | 其它 sportEvents 子页 | 有 ID 则进比赛页，否则不动 |

## 心跳任务优先级（高 → 低）

1. WAF / 阻断页处理  
2. 非足球版块恢复  
3. 闲置登出弹窗  
4. 列表 / 总览页 boot 与进场  
5. 登录门禁（未登录则后续导航类任务跳过）  
6. 投注中「已提交」收尾  
7. 赛事结束 / 不可进处理  
8. 策略刷新、ruleMeet、盘口扫描、自动投注触发  

## 验收

- [ ] 打开比赛页后脚本不会跳到 `/sportEvents/inplay/football`
- [ ] 控制台无「直链足球滚球列表」类日志
- [ ] 无秒级连环跳（硬冷却约 45s；2 分钟内 >4 次熔断）
- [ ] 保活在比赛页仅 API，不 `location` 到列表
