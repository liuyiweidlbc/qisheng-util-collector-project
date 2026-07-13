# HTY 滚球盘口 DOM 解析说明

> 来源：浏览器 agent 实测  
> - DOM：`https://hty35.app/.../match/4711701`（2026-07-04）  
> - 策略 API：`match_id=4737374`（2026-07-04，有策略数据）  
> 关联脚本：`hty-inplay-quant-bet.user.js`

供后续扩展 Tampermonkey 功能时查阅，避免重复踩坑。

---

## 1. 页面 URL

### 脚本匹配规则

```regex
^https://[\w-]*hty[\w-]*\.(app|com)/sportEvents/inplay/football/match/\d+(\?|#|$)
```

### 示例

```
https://hty35.app/sportEvents/inplay/football/match/4711701?tab=all&type=market&simpleGameCategory=inplay
```

### 赛事 ID 提取

```javascript
window.location.href.match(/\/sportEvents\/inplay\/football\/match\/(\d+)/i)
// => matchId = "4711701"
```

### 页面就绪标志

```javascript
document.querySelector('[data-testid="SportExhaustivePage"]')
```

---

## 2. 赔率按钮 `data-testid` 格式

### 通用结构

```
oddsBtn-{bookId}|{matchId}|{market}|{side}|{lineIndex}
```

| 字段 | 含义 | 实测示例 |
|------|------|----------|
| `bookId` | 博彩公司/盘口源序号 | `1` |
| `matchId` | 赛事 ID | `4711701` |
| `market` | 玩法类型 | `ah`, `ou`, `1x2`, `cs`, … |
| `side` | 投注方向 | `h`, `a`, `ov`, `ud`, `d`, … |
| `lineIndex` | **盘口行序号**（0 为主盘，1、2…为副盘） | `0`, `1` |

### 解析代码

```javascript
function parseOddsBtnTestid(testid) {
    const body = String(testid).replace(/^oddsBtn-/i, '');
    const parts = body.split('|');
    if (parts.length < 5) return null;
    return {
        bookId: parts[0],
        matchId: parts[1],
        market: parts[2],
        side: parts[3],
        lineIndex: parts[4],  // 注意：不是 handicap 数值！
        testid: testid,
    };
}
```

### 重要：`lineIndex` ≠ 策略 `plateOnK`

- `testid` 最后一段是**行号**（第几条盘口线），不是让球/大小球数值。
- 实际盘口值（如 `0`、`-0/0.5`、`O 2.5`）在按钮 DOM 子节点中，必须从页面读取。

---

## 3. 按钮 DOM 结构

### 选择器

```javascript
document.querySelectorAll('button[data-testid^="oddsBtn-"]')
```

### 内部结构（实测）

```html
<button data-testid="oddsBtn-1|4711701|ou|ov|0" ...>
  <div data-testid="undefined-scale-container">
    <div data-testid="undefined-scale-content">
      <div> O 2.5</div>          <!-- 左侧：盘口线文字 -->
    </div>
  </div>
  <span class="font-semibold ...">3.43</span>  <!-- 右侧：赔率 -->
</button>
```

### 提取盘口线与赔率

```javascript
function extractButtonLineOdds(btn) {
    const lineRoot = btn.querySelector('[data-testid="undefined-scale-content"]');
    const lineText = lineRoot ? lineRoot.textContent.trim() : '';

    const oddsEl = btn.querySelector('span.font-semibold')
        || btn.querySelector('span.text-text-2')
        || btn.querySelector('span');
    const oddsText = oddsEl ? oddsEl.textContent.trim() : '';
    const odds = parseFloat(oddsText);

    return { lineText, oddsText, odds };
}
```

### 不要用 `btn.textContent` 解析赔率

整段 `textContent` 会把盘口和赔率拼在一起，例如：

| 错误拼接 | 正确拆分 |
|----------|----------|
| `O 2.53.43` | 盘口 `O 2.5`，赔率 `3.43` |
| `-0/0.53.12` | 盘口 `-0/0.5`，赔率 `3.12` |
| `01.49` | 盘口 `0`，赔率 `1.49` |
| `X1.21` | 盘口 `X`（平），赔率 `1.21` |

---

## 4. 实测样例表

采集自赛事 `4711701` 滚球页：

| data-testid | 盘口线 (lineText) | 赔率 (odds) | 说明 |
|-------------|-------------------|-------------|------|
| `oddsBtn-1\|4711701\|ah\|h\|0` | `0` | `1.49` | 让球主盘 |
| `oddsBtn-1\|4711701\|ah\|h\|1` | `-0/0.5` | `3.12` | 让球副盘（半球） |
| `oddsBtn-1\|4711701\|ah\|a\|0` | `0` | `2.53` | 让球客主盘 |
| `oddsBtn-1\|4711701\|ah\|a\|1` | `+0/0.5` | `1.31` | 让球客副盘 |
| `oddsBtn-1\|4711701\|ou\|ov\|0` | `O 2.5` | `3.43` | 大小球大 2.5 |
| `oddsBtn-1\|4711701\|ou\|ov\|1` | `O 2.5/3` | `4.57` | 大小球大 2.5/3 |
| `oddsBtn-1\|4711701\|ou\|ud\|0` | `U 2.5` | `1.23` | 大小球小 2.5 |
| `oddsBtn-1\|4711701\|ou\|ud\|1` | `U 2.5/3` | `1.11` | 大小球小 2.5/3 |
| `oddsBtn-1\|4711701\|1x2\|h\|0` | `1` | `5.30` | 独赢主胜 |
| `oddsBtn-1\|4711701\|1x2\|d\|0` | `X` | `1.21` | 独赢平局 |
| `oddsBtn-1\|4711701\|1x2\|a\|0` | `2` | `9.40` | 独赢客胜 |
| `oddsBtn-1\|4711701\|h-ou\|ov\|0` | `1.5` | `3.94` | 主队大小 |
| `oddsBtn-1\|4711701\|a-ou\|ov\|0` | `1.5` | `4.57` | 客队大小 |

### 其他 market 类型（同页存在，策略暂未对接）

| market | 示例 testid | 备注 |
|--------|-------------|------|
| `cs` | `oddsBtn-1\|4711701\|cs\|1-2\|5` | 波胆 |
| `nog` | `oddsBtn-1\|4711701\|nog\|2\|0` | 下一进球 |
| `tg_2nd` | `oddsBtn-1\|4711701\|tg_2nd\|0-1\|0` | 下半场总进球 |

---

## 5. 策略 API 字段对照

### 接口

```
GET http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/trigger?match_id={matchId}
```

### 响应结构

```json
{
  "code": "200",
  "msg": "Success",
  "data": {
    "data": [ /* 策略列表 */ ],
    "trigger": "0",
    "ruleMap": {}
  }
}
```

### 真实示例：赛事 `4737374`（有策略数据）

**请求**

```
GET http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/trigger?match_id=4737374
```

**响应**（2026-07-04 实测，节选）

```json
{
  "code": "200",
  "msg": "Success",
  "data": {
    "data": [
      {
        "recHash": "bElWNWZKRXVPN242U2h0STZOcll0UT09",
        "matchId": "4737374",
        "kickoffTime": "2026-07-04 09:30:00",
        "market": "aou",
        "plateOn": "ov",
        "plateOnK": "0.5",
        "plateOddsHit": 5.0,
        "plateAmount": 5.0,
        "plateAmountRate": 0.05,
        "hitMarketInplay": null,
        "invalidMarketInplay": null,
        "plateOddsTrend": null,
        "plateOddsThreshold": null,
        "ruleMeet": "0",
        "ruleMeetScore": null,
        "ruleMeetIgnore": "0",
        "ruleMeetInvalid": "0",
        "ruleMemo": null,
        "hitOddsFlag": "0",
        "invalidFlag": "0",
        "createdTime": "2026-07-04T09:00:59",
        "updatedTime": "2026-07-04T09:00:59"
      },
      {
        "recHash": "ZTRJKzdIcEgvQVg2bkZWenJUejl5QT09",
        "matchId": "4737374",
        "kickoffTime": "2026-07-04 09:30:00",
        "market": "aou",
        "plateOn": "ov",
        "plateOnK": "0.5",
        "plateOddsHit": 3.0,
        "plateAmount": 5.0,
        "plateAmountRate": 0.05,
        "hitMarketInplay": null,
        "invalidMarketInplay": null,
        "plateOddsTrend": null,
        "plateOddsThreshold": null,
        "ruleMeet": "0",
        "ruleMeetScore": null,
        "ruleMeetIgnore": "0",
        "ruleMeetInvalid": "0",
        "ruleMemo": null,
        "hitOddsFlag": "0",
        "invalidFlag": "0",
        "createdTime": "2026-07-04T08:56:46",
        "updatedTime": "2026-07-04T08:56:46"
      }
    ],
    "trigger": "0",
    "ruleMap": {}
  }
}
```

**策略解读**

| # | 人类可读 | 触发条件 |
|---|----------|----------|
| 1 | 亚洲大小 大 0.5 · 赔率≥5.0 · 额5.0 · 5.0% | `aou` + `ov` + `plateOnK=0.5` + 页面赔率 ≥ 5.0 |
| 2 | 亚洲大小 大 0.5 · 赔率≥3.0 · 额5.0 · 5.0% | 同上，阈值 3.0（两条策略盘口相同、阈值不同） |

**对应滚球页**（`https://hty35.app/sportEvents/inplay/football/match/4737374`）

策略要求 `aou ov 0.5`，页面 `market` 为 `ou`（脚本已做 `aou` ↔ `ou` 映射）。  
实测该场**无** `O 0.5` 盘口线，最小大球线为：

| testid | lineText | odds |
|--------|----------|------|
| `oddsBtn-1\|4737374\|ou\|ov\|9` | `O 1/1.5` | `1.22` |
| `oddsBtn-1\|4737374\|ou\|ov\|6` | `O 1.5` | `1.36` |
| `oddsBtn-1\|4737374\|ou\|ov\|4` | `O 1.5/2` | `1.45` |
| … | … | … |

→ 当前**不会命中**，属正常（盘口未开出 0.5 线）。若后续出现 `O 0.5` 且赔率 ≥ 阈值，脚本应能匹配。

该场独赢页面用 `ad`（非 `1x2`）：

| testid | odds |
|--------|------|
| `oddsBtn-1\|4737374\|ad\|h\|0` | `1.20` |
| `oddsBtn-1\|4737374\|ad\|a\|0` | `4.33` |

### 单条策略完整字段

| 字段 | 类型/示例 | 含义 | 脚本是否使用 |
|------|-----------|------|--------------|
| `recHash` | string | 记录唯一标识 | 否 |
| `matchId` | `"4737374"` | 赛事 ID | 是（URL + API） |
| `kickoffTime` | `"2026-07-04 09:30:00"` | 开球时间 | 面板展示 |
| `market` | `"aou"` | 玩法 | 是 |
| `plateOn` | `"ov"` | 方向 | 是 |
| `plateOnK` | `"0.5"` | 盘口线 | 是（对 `lineText`） |
| `plateOddsHit` | `5.0` | 触发赔率下限 | 是 |
| `plateAmount` | `5.0` | 策略金额 | 否（测试固定 0.3） |
| `plateAmountRate` | `0.05` | 金额比例 | 面板展示 |
| `hitMarketInplay` | null | 滚球命中盘口 | 否 |
| `invalidMarketInplay` | null | 滚球失效盘口 | 否 |
| `plateOddsTrend` | null | 赔率趋势 | 否 |
| `plateOddsThreshold` | null | 赔率阈值扩展 | 否 |
| `ruleMeet` | `"0"` | 规则满足 | 否 |
| `ruleMeetScore` | null | 规则得分 | 否 |
| `ruleMeetIgnore` | `"0"` | 忽略标记 | 否 |
| `ruleMeetInvalid` | `"0"` | 失效标记 | 否 |
| `ruleMemo` | null | 备注 | 否 |
| `hitOddsFlag` | `"0"` | 赔率命中标记 | 否 |
| `invalidFlag` | `"0"` | 失效标记 | 否 |
| `createdTime` | ISO8601 | 创建时间 | 否 |
| `updatedTime` | ISO8601 | 更新时间 | 否 |

**顶层字段**

| 字段 | 示例 | 含义 |
|------|------|------|
| `trigger` | `"0"` | 服务端触发状态（`"1"`=已触发）；脚本以本地盘口+赔率匹配为准 |
| `ruleMap` | `{}` | 规则映射，当前为空 |

### 单条策略字段（核心映射）

| 策略字段 | 含义 | 页面映射 |
|----------|------|----------|
| `market` | 玩法 | 对应 `testid` 第 3 段，见下表 |
| `plateOn` | 方向 | 对应 `testid` 第 4 段 |
| `plateOnK` | 盘口线数值 | 对应按钮 `lineText`（非 `lineIndex`） |
| `plateOddsHit` | 触发赔率下限 | 对比 `span` 中的赔率数值 |
| `plateAmount` | 策略金额 | 测试阶段暂不使用 |
| `plateAmountRate` | 金额比例 | 展示用 |
| `kickoffTime` | 开球时间 | 展示用 |

### `market` 对照

| 策略 `market` | 页面 `market` | 中文 |
|---------------|---------------|------|
| `ah` | `ah` | 让球 |
| `ou` | `ou` | 大小 |
| `aou` | `ou` | 亚洲大小（页面显示为 `ou`） |
| `1x2` | `1x2` 或 `ad` | 独赢 |
| `ad` | `ad` 或 `1x2` | 独赢（页面可能直接用 `ad`） |

### `plateOn` 对照

| 策略 `plateOn` | 页面 `side` | 中文 |
|----------------|-------------|------|
| `h` | `h` | 主 |
| `a` | `a` | 客 |
| `d` | `d` | 平 |
| `ov` | `ov` | 大 |
| `ud` | `ud` | 小 |

---

## 6. 匹配规则（当前脚本实现）

### 三步匹配

1. **testid**：`matchId` + `market` + `side`
2. **盘口线**：`plateOnK` ↔ 按钮 `lineText`
3. **赔率**：页面赔率 ≥ `plateOddsHit`

### 盘口线规范化

```javascript
// 去掉大小球前缀 O/U
"O 2.5"  → "2.5"
"U 2.5/3" → "2.5/3"

// 让球分盘保留符号
"-0/0.5" → "-0/0.5"
"+0/0.5" → "+0/0.5"
"0"      → "0"
```

### 特殊规则

| 玩法 | `plateOnK` 为空时 | 有 `plateOnK` 时 |
|------|-------------------|------------------|
| `1x2` / `ad` | 只匹配 `side`，忽略 lineText | 同样只匹配 `side` |
| `ah` / `ou` / `aou` | 只匹配 `lineIndex === 0`（主盘） | 规范化后精确或数值近似匹配 |

### 已验证的匹配用例

| 策略 | 页面按钮 | 结果 |
|------|----------|------|
| `ah h 0` | `ah\|h\|0` line=`0` | ✅ |
| `ah h -0/0.5` | `ah\|h\|1` line=`-0/0.5` | ✅ |
| `ou ov 2.5` | `ou\|ov\|0` line=`O 2.5` | ✅ |
| `aou ov 2.5/3` | `ou\|ov\|1` line=`O 2.5/3` | ✅ |
| `aou ov 0.5`（4737374） | 页面无 `O 0.5` 线 | ⏳ 盘口未开出 |
| `1x2 h` | `1x2\|h\|0` line=`1` | ✅ |
| `ad h` | `ad\|h\|0`（4737374） | ✅ |

### 尚未覆盖的别名（待补充）

- 策略 `-0.5` vs 页面 `-0/0.5`（语义相近但格式不同，当前**不**自动等价）
- 策略 `ou` vs 页面 `h-ou` / `a-ou`（主客队大小，需单独对接）

---

## 7. 盘口区域容器

滚球页各玩法区块容器（可用于滚动定位）：

| 玩法 | 容器 testid |
|------|-------------|
| 让球 | `MarketTableColTwoContainer-ah` |
| 大小 | `MarketTableColTwoContainer-ou` |
| 独赢 | `ExhaustiveMarketCardWrapper-1x2`（早盘有，滚球需再确认） |

### 视图切换

若当前为「阵容」视图，需切到「经典」或「快速」：

```javascript
[data-testid="lineUp"]   // 阵容（aria-pressed="true" 时为当前）
[data-testid="classic"]  // 经典
[data-testid="quick"]    // 快速
```

---

## 8. 投注单相关 DOM

| 元素 | testid |
|------|--------|
| 投注单根节点 | `SportCart` 或 `overlay-container-cart-overlay-task-id` |
| 金额输入区 | `SportCartBetInput` |
| 投注按钮 | `sport-cart-bet-button` 或 `sport-cart-submit-bet-btn` |
| 浮动投注单按钮 | `sport-cart-float-btn` |

数字键盘：在投注单内找 `button`，`textContent` 为 `0`–`9` 及 `.`。

---

## 9. 防重复下单（脚本现状）

| 机制 | 范围 | 时长 |
|------|------|------|
| `placing` 锁 | 单次流程互斥 | 进行中 |
| `attemptedThisPage` | 本页 `testid` | 页面生命周期 |
| `sessionStorage` | `testid\|金额` | 90 秒 |
| `betDone` | 本页自动下注 | 成功后停止 |

去重 key 依赖 `data-testid`；若 `testid` 前缀序号变化但盘口相同，可能绕过去重。

---

## 10. 后续扩展建议

1. **新增玩法**：先抓该 `market` 的 `testid` 样例和 `lineText` 格式，再补 `marketsMatch`。
2. **盘口别名**：在 `canonicalPlateLine` / `strategyLineMatches` 中集中维护，不要散落在业务逻辑里。
3. **多 bookId**：当前默认 `bookId=1`；若页面出现 `oddsBtn-2|...`，需确认是否过滤或优先。
4. **滚球 vs 早盘**：早盘 URL 为 `/sportEvents/early/...`，DOM 结构可能相近但需单独实测。
5. **策略为空**：API 返回 `data: []` 时不会触发自动下注，属正常行为。
6. **测试赛事**：`4737374` 有策略数据，可用于联调；`4711701` 策略为空，仅适合测 DOM。

---

## 11. 快速调试片段

在赛事页控制台粘贴，可 dump 当前所有赔率按钮：

```javascript
[...document.querySelectorAll('button[data-testid^="oddsBtn-"]')].map(b => ({
  testid: b.dataset.testid,
  line: b.querySelector('[data-testid="undefined-scale-content"]')?.textContent?.trim(),
  odds: b.querySelector('span.font-semibold')?.textContent?.trim(),
  disabled: b.disabled,
}))
```
