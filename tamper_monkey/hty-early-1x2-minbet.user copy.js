// ==UserScript==
// @name         HTY早盘独赢最小投注
// @namespace    https://smartodds.xyz/
// @version      1.8.11
// @description  HTY早盘赛事页：策略赛事列表 + 点击切换策略详情 + 测试赛事自动下注
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/early\/football\/match\/\d+(\?|#|$)/
// @run-at       window-load
// @grant        GM_xmlhttpRequest
// @connect      alert.socbeta.xyz
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'tm-hty-1x2-minbet-panel';
    const STYLE_ID = 'tm-hty-1x2-minbet-style';
    const TARGET_MATCH_ID = '4733925';
    const ALERT_MATCHES_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/matches/active';
    const ALERT_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/trigger';
    const STRATEGY_POLL_MS = 30000;
    const TARGET_MARKET = '1x2';
    const TARGET_SIDE = 'h';
    const MIN_STAKE = 0.3;
    const DEDUP_MS = 90 * 1000;
    const STORAGE_KEY = 'tm_hty_1x2_recent_bets';
    const POLL_MS = 8000;
    const MAX_POLLS = 30;
    const TRACE_MATCH_BASE = 'http://qisheng1.xyz/match/trace?match_id=';
    const PAGE_READY_SEL = '[data-testid="SportExhaustivePage"]';

    const SIDE_LABEL = { h: '主胜' };

    const MARKET_LABEL = {
        aou: '亚洲大小',
        hou: '主进球',
        ah: '让球',
        ou: '大小',
        btts: '两队进球',
        '1x2': '独赢',
        ad: '独赢',
    };
    const PLATE_ON_LABEL = {
        ov: '大',
        ud: '小',
        h: '主',
        d: '平',
        a: '客',
        y: '是',
        n: '否',
    };

    function getMatchIdFromUrl() {
        const m = window.location.href.match(/\/sportEvents\/early\/football\/match\/(\d+)/i);
        return m ? m[1] : '';
    }

    let matchId = getMatchIdFromUrl();
    if (!matchId) return;

    function isAutoBetEnabled() {
        return matchId === TARGET_MATCH_ID;
    }

    function getHomeBtnRe() {
        return new RegExp(
            '^oddsBtn-\\d+\\|' + matchId + '\\|' + TARGET_MARKET + '\\|' + TARGET_SIDE + '\\|0$',
            'i'
        );
    }

    const recentBets = loadRecentBets();
    let targetOption = null;
    let placing = false;
    let pollTimer = null;
    let pollCount = 0;
    let betDone = false;
    let started = false;
    let panelReady = false;
    let panelCollapsed = false;
    let betResult = 'pending';
    let betStep = '等待页面加载';
    let lastPanelKey = '';
    let activeMatches = [];
    let strategyList = [];
    let strategyTrigger = '';
    let selectedMatchId = matchId;
    let matchesStatus = 'loading';
    let matchesError = '';
    let strategyStatus = 'loading';
    let strategyError = '';
    let strategyTimer = null;
    let routeWatchTimer = null;
    let lastWatchedUrl = window.location.href;
    let lastMatchesListKey = '';
    let lastStrategyListKey = '';
    const strategyCache = {};
    const attemptedThisPage = new Set();

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function humanDelay(minMs, maxMs) {
        return sleep(rand(minMs, maxMs));
    }

    function loadRecentBets() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function saveRecentBets() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(recentBets));
        } catch (e) { /* ignore */ }
    }

    function pruneRecentBets() {
        const now = Date.now();
        const next = recentBets.filter(function (item) {
            return now - item.ts < DEDUP_MS;
        });
        if (next.length !== recentBets.length) {
            recentBets.length = 0;
            next.forEach(function (item) { recentBets.push(item); });
            saveRecentBets();
        }
    }

    function betKey(testid, amount) {
        return String(testid) + '|' + String(amount);
    }

    function isRecentlyPlaced(testid, amount) {
        pruneRecentBets();
        const key = betKey(testid, amount);
        const now = Date.now();
        return recentBets.some(function (item) {
            return item.key === key && now - item.ts < DEDUP_MS;
        });
    }

    function markPlaced(testid, amount) {
        pruneRecentBets();
        recentBets.push({ key: betKey(testid, amount), ts: Date.now() });
        saveRecentBets();
    }

    function remainingCooldown(testid, amount) {
        pruneRecentBets();
        const key = betKey(testid, amount);
        const now = Date.now();
        const hit = recentBets.find(function (item) {
            return item.key === key && now - item.ts < DEDUP_MS;
        });
        if (!hit) return 0;
        return Math.ceil((DEDUP_MS - (now - hit.ts)) / 1000);
    }

    function waitFor(getter, timeoutMs, intervalMs) {
        const timeout = timeoutMs || 15000;
        const interval = intervalMs || 300;
        const start = Date.now();
        return new Promise(function (resolve, reject) {
            function tick() {
                let value = null;
                try {
                    value = getter();
                } catch (e) { /* ignore */ }
                if (value) {
                    resolve(value);
                    return;
                }
                if (Date.now() - start >= timeout) {
                    reject(new Error('等待超时'));
                    return;
                }
                setTimeout(tick, interval);
            }
            tick();
        });
    }

    function safeClick(el) {
        if (!el || el.disabled) return false;
        el.click();
        return true;
    }

    async function humanScrollTo(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const inView = rect.top >= 80 && rect.bottom <= window.innerHeight - 80;
        if (!inView) {
            el.scrollIntoView({ block: 'center', behavior: 'auto' });
            await humanDelay(300, 700);
        } else {
            await humanDelay(150, 400);
        }
    }

    function getSportCartRoot() {
        return document.querySelector('[data-testid="SportCart"]')
            || document.querySelector('[data-testid="overlay-container-cart-overlay-task-id"]');
    }

    function isCartOpen() {
        const root = getSportCartRoot();
        return isElementVisible(root);
    }

    function findKeypadButton(cart, key) {
        if (!cart) return null;
        const buttons = cart.querySelectorAll('button');
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if ((btn.textContent || '').trim() === key && !btn.disabled) return btn;
        }
        return null;
    }

    async function focusBetInput(cart) {
        const inputArea = (cart && cart.querySelector('[data-testid="SportCartBetInput"]'))
            || document.querySelector('[data-testid="SportCartBetInput"]');
        if (inputArea) safeClick(inputArea);
        await humanDelay(200, 450);
    }

    async function enterAmountViaKeypad(amount) {
        const cart = getSportCartRoot();
        if (!cart) throw new Error('投注单未打开');

        await focusBetInput(cart);

        const text = String(amount);
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const btn = findKeypadButton(cart, ch);
            if (!btn) throw new Error('键盘缺少按键 ' + ch);
            setBetStep('点击键盘 ' + ch);
            safeClick(btn);
            await humanDelay(180, 380);
        }
    }

    function findBetActionButton() {
        return document.querySelector('[data-testid="sport-cart-bet-button"]')
            || document.querySelector('[data-testid="sport-cart-submit-bet-btn"]');
    }

    function buttonText(btn) {
        return (btn && btn.textContent ? btn.textContent : '').trim();
    }

    function isAcceptChangesBtn(btn) {
        const t = buttonText(btn).toLowerCase();
        return t.indexOf('accept') >= 0 || t.indexOf('接受') >= 0 || t.indexOf('变更') >= 0;
    }

    function isInsufficientBalanceText(text) {
        return /insufficient|余额不足|余额|deposit|充值/i.test(text || '');
    }

    async function submitBetSlip() {
        for (let attempt = 0; attempt < 4; attempt++) {
            const btn = await waitFor(findBetActionButton, 10000, 300);
            if (!btn) throw new Error('找不到投注按钮');
            const text = buttonText(btn);

            if (isAcceptChangesBtn(btn)) {
                setBetStep('接受赔率变动');
                safeClick(btn);
                await humanDelay(500, 900);
                await enterAmountViaKeypad(MIN_STAKE);
                continue;
            }

            if (btn.disabled) throw new Error('投注按钮不可用');
            if (isInsufficientBalanceText(text)) throw new Error(text);

            setBetStep('点击投注按钮提交');
            safeClick(btn);
            await humanDelay(400, 800);
            return true;
        }
        throw new Error('提交未完成');
    }

    async function openBetDrawer() {
        if (isCartOpen()) return true;

        const floatBtn = document.querySelector('[data-testid="sport-cart-float-btn"]');
        if (floatBtn && isElementVisible(floatBtn)) {
            safeClick(floatBtn);
            await humanDelay(500, 900);
            if (isCartOpen()) return true;
        }

        const option = findHomeWinOption();
        if (option) {
            safeClick(option.button);
            await humanDelay(600, 1100);
        }

        return isCartOpen();
    }

    async function ensureMarketView() {
        const lineup = document.querySelector('[data-testid="lineUp"]');
        const classic = document.querySelector('[data-testid="classic"]');
        const quick = document.querySelector('[data-testid="quick"]');

        if (lineup && lineup.getAttribute('aria-pressed') === 'true') {
            if (classic) {
                safeClick(classic);
                await humanDelay(500, 900);
            } else if (quick) {
                safeClick(quick);
                await humanDelay(500, 900);
            }
        }

        const wrapper = document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-1x2"]');
        if (wrapper) {
            wrapper.scrollIntoView({ block: 'center', behavior: 'auto' });
            await humanDelay(300, 600);
        }
    }

    function parseOddsText(text) {
        const raw = String(text || '').trim();
        if (!raw) return '';
        if (/^X/i.test(raw)) return raw.replace(/^X/i, '');
        if (/^1\d+\.\d+$/.test(raw)) return raw.slice(1);
        if (/^2\d+\.\d+$/.test(raw)) return raw.slice(1);
        const m = raw.match(/(\d+\.\d+|\d+)/);
        return m ? m[1] : raw;
    }

    function findHomeWinOption() {
        const buttons = document.querySelectorAll('button[data-testid^="oddsBtn-"]');
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const testid = btn.dataset.testid || '';
            if (!getHomeBtnRe().test(testid) || btn.disabled) continue;
            return {
                testid: testid,
                side: TARGET_SIDE,
                label: SIDE_LABEL[TARGET_SIDE],
                odds: parseOddsText(btn.textContent),
                button: btn,
            };
        }
        return null;
    }

    async function waitForHomeMarket(timeoutMs) {
        const deadline = Date.now() + (timeoutMs || 60000);
        while (Date.now() < deadline) {
            await ensureMarketView();
            const option = findHomeWinOption();
            if (option) return option;
            await sleep(500);
        }
        return null;
    }

    function isPageReady() {
        return !!document.querySelector(PAGE_READY_SEL);
    }

    function matchPageUrl() {
        return earlyMatchUrl(matchId);
    }

    function isElementVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (!rect.width && !rect.height) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    }

    function isLoggedIn() {
        if (/\/login/i.test(window.location.pathname)) return false;

        const positiveSelectors = [
            '[data-testid="balance-text"]',
            '[data-testid="liquid-glass-button-user-now-balance-btn"]',
            '[data-testid="sport-cart-float-btn"]',
            '[data-testid="HeaderUserBalance"]',
        ];
        for (let i = 0; i < positiveSelectors.length; i++) {
            const el = document.querySelector(positiveSelectors[i]);
            if (isElementVisible(el)) return true;
        }

        const loginBtn = document.querySelector('[data-testid="liquid-glass-button-login-btn"]');
        const registerBtn = document.querySelector('[data-testid="liquid-glass-button-register-btn"]');
        if (isElementVisible(loginBtn) || isElementVisible(registerBtn)) return false;

        if (document.querySelector(PAGE_READY_SEL) && findHomeWinOption()) return true;

        return false;
    }

    function stopPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function setBetStep(text) {
        betStep = text || '';
        renderPanel(true);
    }

    function setBetResult(result, detail) {
        betResult = result || 'pending';
        if (detail) betStep = detail;
        renderPanel(true);
    }

    function resultLabel() {
        if (betResult === 'success') return '投注成功';
        if (betResult === 'failed') return '投注失败';
        if (betResult === 'placing') return '投注中';
        if (betResult === 'skipped') return '已跳过';
        if (betResult === 'stopped') return '已停止';
        if (!isLoggedIn()) return '等待登录';
        if (targetOption && shouldAutoBet()) return '即将投注';
        if (targetOption) return '等待时机';
        return '等待盘口';
    }

    function resultKind() {
        if (betResult === 'success') return 'ok';
        if (betResult === 'failed') return 'err';
        if (betResult === 'placing') return 'ing';
        if (betResult === 'skipped' || betResult === 'stopped') return 'warn';
        if (!isLoggedIn()) return 'info';
        if (targetOption && shouldAutoBet()) return 'ready';
        return 'info';
    }

    function upcomingText() {
        if (!isAutoBetEnabled()) return '自动下注仅测试赛事 ' + TARGET_MATCH_ID;
        if (!targetOption) return '尚未找到独赢主胜盘口';
        return targetOption.label + ' · 赔率 ' + (targetOption.odds || '—') + ' · 金额 ' + MIN_STAKE;
    }

    const MATCH_PHASE_LABEL = {
        NOT_STARTED: '未开始',
        IN_PLAY: '进行中',
        FINISHED: '已结束',
        ENDED: '已结束',
        POSTPONED: '延期',
        CANCELLED: '取消',
    };
    const MATCH_STATUS = {
        NOT_STARTED: 0,
        IN_PLAY: 1,
        ENDED: 3,
    };

    function phaseFromMatchStatus(status) {
        if (status == null || status === '') return '';
        const n = Number(status);
        if (n === MATCH_STATUS.NOT_STARTED) return 'NOT_STARTED';
        if (n === MATCH_STATUS.IN_PLAY) return 'IN_PLAY';
        if (n === MATCH_STATUS.ENDED) return 'ENDED';
        return '';
    }

    function parseKickoffMs(kickoffTime) {
        const raw = String(kickoffTime || '').trim();
        if (!raw) return 0;
        let t = Date.parse(raw.replace(' ', 'T'));
        if (!isNaN(t)) return t;
        t = Date.parse(raw.replace(/-/g, '/'));
        return isNaN(t) ? 0 : t;
    }

    function isKickoffReached(item, earlyMs) {
        const ms = parseKickoffMs(item && item.kickoffTime);
        if (!ms) return false;
        return Date.now() >= ms - (earlyMs != null ? earlyMs : 0);
    }

    function resolveMatchPhase(item) {
        if (!item) return '';
        const fromStatus = phaseFromMatchStatus(item.status);
        if (fromStatus === 'IN_PLAY') return 'IN_PLAY';
        if (fromStatus === 'NOT_STARTED') {
            return isKickoffReached(item, 60000) ? 'IN_PLAY' : 'NOT_STARTED';
        }
        const mp = String(item.matchPhase || '').toUpperCase();
        if (mp === 'IN_PLAY') return 'IN_PLAY';
        if (mp === 'NOT_STARTED') {
            return isKickoffReached(item, 60000) ? 'IN_PLAY' : 'NOT_STARTED';
        }
        if (isKickoffReached(item, 60000)) return 'IN_PLAY';
        return mp || 'NOT_STARTED';
    }

    function earlyMatchUrl(id) {
        return window.location.origin + '/sportEvents/early/football/match/' + id + '?type=market';
    }

    function inplayMatchUrl(id, forceRefresh) {
        let url = window.location.origin + '/sportEvents/inplay/football/match/' + id + '?type=market';
        if (forceRefresh) url += '&_tm=' + Date.now();
        return url;
    }

    function isMatchInPlay(item) {
        return resolveMatchPhase(item) === 'IN_PLAY';
    }

    function traceMatchUrl(id) {
        return TRACE_MATCH_BASE + encodeURIComponent(id);
    }

    function formatKickoffShort(kick) {
        if (!kick) return '';
        const m = String(kick).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        if (m) return m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
        return String(kick);
    }

    function shortTournamentName(name) {
        const raw = String(name || '').trim();
        if (!raw) return '';
        const normalized = raw.replace(/（/g, '(').replace(/）/g, ')');
        const wcHosts = normalized.match(/^(\d{4})?世界杯\s*\(([^)]+)\)\s*$/);
        if (wcHosts) {
            const hosts = wcHosts[2] || '';
            if (/加拿大|墨西哥|美国|美加墨/.test(hosts)) {
                return (wcHosts[1] || '2026') + '美加墨';
            }
            return (wcHosts[1] || '') + '世界杯';
        }
        return normalized.replace(/世界杯\s*\([^)]+\)/, '世界杯');
    }

    function formatActiveMatchItem(item) {
        const home = item.homeName || '—';
        const away = item.awayName || '—';
        const kick = formatKickoffShort(item.kickoffTime);
        const phase = MATCH_PHASE_LABEL[resolveMatchPhase(item)] || resolveMatchPhase(item) || '—';
        const rules = item.ruleCount != null ? item.ruleCount + '条策略' : '';
        const tour = shortTournamentName(item.tournamentName);
        const parts = [];
        if (kick) parts.push(kick);
        if (tour) parts.push(tour);
        parts.push(home + 'vs' + away);
        parts.push(phase);
        if (rules) parts.push(rules);
        return parts.join('  ');
    }

    function formatOddsDisplay(val) {
        if (val == null || val === '') return '—';
        const n = Number(val);
        if (isNaN(n)) return String(val);
        return n.toFixed(2);
    }

    function getStrategyExecStatus(item) {
        const ignore = String(item && item.ruleMeetIgnore != null ? item.ruleMeetIgnore : '0');
        const invalid = String(item && item.ruleMeetInvalid != null ? item.ruleMeetInvalid : '0');
        const invalidFlag = String(item && item.invalidFlag != null ? item.invalidFlag : '0');
        if (ignore === '2') return 'executed';
        if (ignore === '1' || invalid === '1' || invalidFlag === '1') return 'aborted';
        if (ignore === '-1') return 'confirming';
        return 'pending';
    }

    function strategyExecLabel(item) {
        const status = getStrategyExecStatus(item);
        if (status === 'executed') return '已执行';
        if (status === 'aborted') return '已中止';
        if (status === 'confirming') return '待确认';
        return '未执行';
    }

    function strategyExecKind(item) {
        return getStrategyExecStatus(item);
    }

    function formatStrategyPlateDesc(item) {
        const market = MARKET_LABEL[item.market] || item.market || '—';
        const side = PLATE_ON_LABEL[item.plateOn] || item.plateOn || '';
        const line = item.plateOnK != null && item.plateOnK !== '' ? String(item.plateOnK) : '';
        let desc = market;
        if (side || line) desc += ' ' + side + line;
        return desc;
    }

    function formatStrategyItemHtml(item) {
        const odds = formatOddsDisplay(item.plateOddsHit);
        const amount = item.plateAmount != null ? formatOddsDisplay(item.plateAmount) : '—';
        const rate = item.plateAmountRate != null
            ? (Number(item.plateAmountRate) * 100).toFixed(1) + '%'
            : '—';
        return '<span class="tm-hty-strategy-exec tm-hty-strategy-exec-' +
            strategyExecKind(item) + '">' + strategyExecLabel(item) + '</span> ' +
            formatStrategyPlateDesc(item) +
            ' · 赔率≥<span class="tm-hty-strategy-odds">' + odds + '</span>' +
            ' · 投注<span class="tm-hty-strategy-amount">$' + amount + '</span>' +
            ' · ' + rate;
    }

    function fetchActiveMatches() {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: ALERT_MATCHES_API,
                timeout: 15000,
                onload: function (res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (String(json.code) !== '200') {
                            reject(new Error(json.msg || 'API 返回错误'));
                            return;
                        }
                        resolve(Array.isArray(json.data) ? json.data : []);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function () { reject(new Error('策略赛事接口网络错误')); },
                ontimeout: function () { reject(new Error('策略赛事接口请求超时')); },
            });
        });
    }

    function fetchAlertStrategies(id) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: ALERT_API + '?match_id=' + encodeURIComponent(id),
                timeout: 15000,
                onload: function (res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (String(json.code) !== '200') {
                            reject(new Error(json.msg || 'API 返回错误'));
                            return;
                        }
                        resolve(json.data || {});
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function () { reject(new Error('策略接口网络错误')); },
                ontimeout: function () { reject(new Error('策略接口请求超时')); },
            });
        });
    }

    function activeMatchesRenderKey() {
        if (matchesStatus === 'err') return 'err|' + matchesError;
        const rows = activeMatches.map(function (item) {
            return [
                item.matchId || '',
                item.kickoffTime || '',
                item.status != null ? String(item.status) : (item.matchPhase || ''),
                item.ruleCount != null ? String(item.ruleCount) : '',
                item.homeName || '',
                item.awayName || '',
                item.finalScore != null ? String(item.finalScore) : '',
            ].join(':');
        }).join(';');
        return matchesStatus + '|' + matchId + '|' + selectedMatchId + '|' + activeMatches.length + '|' + rows;
    }

    function strategyRenderKey() {
        if (strategyStatus === 'err') return 'err|' + selectedMatchId + '|' + strategyError;
        const rows = strategyList.map(function (item) {
            return [
                item.recHash || '',
                item.market || '',
                item.plateOn || '',
                item.plateOnK != null ? String(item.plateOnK) : '',
                item.plateOddsHit != null ? String(item.plateOddsHit) : '',
                item.plateAmount != null ? String(item.plateAmount) : '',
                item.plateAmountRate != null ? String(item.plateAmountRate) : '',
                item.ruleMeetIgnore != null ? String(item.ruleMeetIgnore) : '',
                item.ruleMeetInvalid != null ? String(item.ruleMeetInvalid) : '',
                item.invalidFlag != null ? String(item.invalidFlag) : '',
                item.kickoffTime || '',
            ].join(':');
        }).join(';');
        return strategyStatus + '|' + selectedMatchId + '|' + strategyTrigger + '|' +
            strategyList.length + '|' + rows;
    }

    async function loadActiveMatches(silent) {
        const isSilent = !!silent;
        if (!isSilent && !activeMatches.length) {
            matchesStatus = 'loading';
            matchesError = '';
            renderActiveMatches(document.getElementById(PANEL_ID));
        }

        try {
            activeMatches = await fetchActiveMatches();
            matchesStatus = 'ok';
            matchesError = '';
        } catch (err) {
            if (!isSilent || !activeMatches.length) {
                activeMatches = [];
            }
            matchesStatus = 'err';
            matchesError = err && err.message ? err.message : '加载失败';
        }

        const changed = activeMatchesRenderKey() !== lastMatchesListKey;
        if (changed) {
            renderActiveMatches(document.getElementById(PANEL_ID));
        }
    }

    async function loadMatchStrategies(id, silent) {
        const isSilent = !!silent;
        const targetId = String(id || selectedMatchId || matchId);

        if (!isSilent && (!strategyList.length || String(selectedMatchId) !== targetId)) {
            strategyStatus = 'loading';
            strategyError = '';
            renderMatchStrategies(document.getElementById(PANEL_ID));
        }

        try {
            const payload = await fetchAlertStrategies(targetId);
            if (String(selectedMatchId) !== targetId) return;
            strategyList = Array.isArray(payload.data) ? payload.data : [];
            strategyTrigger = payload.trigger != null ? String(payload.trigger) : '';
            strategyStatus = 'ok';
            strategyError = '';
            strategyCache[targetId] = {
                list: strategyList.slice(),
                trigger: strategyTrigger,
            };
        } catch (err) {
            if (String(selectedMatchId) !== targetId) return;
            if (!isSilent && strategyCache[targetId]) {
                strategyList = strategyCache[targetId].list.slice();
                strategyTrigger = strategyCache[targetId].trigger || '';
                strategyStatus = 'ok';
                strategyError = '';
            } else if (!isSilent || !strategyList.length) {
                strategyList = [];
                strategyTrigger = '';
                strategyStatus = 'err';
                strategyError = err && err.message ? err.message : '加载失败';
            }
        }

        const changed = strategyRenderKey() !== lastStrategyListKey;
        if (changed) {
            renderMatchStrategies(document.getElementById(PANEL_ID));
        }
    }

    async function refreshAll(silent) {
        await Promise.all([
            loadActiveMatches(silent),
            loadMatchStrategies(selectedMatchId, silent),
        ]);
    }

    async function loadStrategies(silent) {
        await refreshAll(silent);
    }

    function scheduleStrategyPoll() {
        if (strategyTimer) return;
        strategyTimer = setInterval(function () {
            refreshAll(true);
        }, STRATEGY_POLL_MS);
    }

    function renderActiveMatches(panel) {
        if (!panel) return;
        const statusEl = panel.querySelector('.tm-hty-matches-status');
        const listEl = panel.querySelector('.tm-hty-matches-list');
        if (!statusEl || !listEl) return;

        const listKey = activeMatchesRenderKey();
        if (listKey === lastMatchesListKey) return;
        lastMatchesListKey = listKey;

        if (matchesStatus === 'loading' && !activeMatches.length) {
            statusEl.textContent = '加载中…';
            statusEl.dataset.kind = 'info';
            listEl.innerHTML = '';
            return;
        }
        if (matchesStatus === 'err') {
            statusEl.textContent = matchesError || '加载失败';
            statusEl.dataset.kind = 'err';
            if (!activeMatches.length) {
                listEl.innerHTML = '';
            }
            return;
        }

        const currentHit = activeMatches.some(function (item) {
            return String(item.matchId) === String(matchId);
        });
        statusEl.textContent = activeMatches.length + ' 场' +
            (currentHit ? ' · 含当前页' : '');
        statusEl.dataset.kind = currentHit ? 'ready' : 'info';

        if (!activeMatches.length) {
            listEl.innerHTML = '<div class="tm-hty-strategy-empty">暂无策略赛事</div>';
            return;
        }

        listEl.innerHTML = activeMatches.map(function (item, idx) {
            const id = item.matchId || '';
            const isPage = String(id) === String(matchId);
            const score = item.finalScore != null && item.finalScore !== ''
                ? ' · 比分 ' + item.finalScore
                : '';
            let rowClass = 'tm-hty-match-item';
            if (isPage) rowClass += ' tm-hty-match-page';
            const pickText = formatActiveMatchItem(item) + score;
            const pageBadge = isPage ? '<span class="tm-hty-match-badge" title="当前页">📌</span>' : '';
            const traceLink = id
                ? '<a class="tm-hty-match-trace" href="' + traceMatchUrl(id) +
                    '" target="_blank" rel="noopener" title="奇胜走势">奇胜</a>'
                : '';
            if (!id) {
                return '<div class="' + rowClass + '">' +
                    '<span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span>' +
                    '<span class="tm-hty-match-pick">' + pickText + '</span>' +
                    pageBadge +
                    '</div>';
            }
            const inplayReady = isMatchInPlay(item);
            let mainHtml;
            if (inplayReady) {
                mainHtml = '<a class="tm-hty-match-main" href="' + inplayMatchUrl(id, false) +
                    '" title="跳转滚球页">' + pickText + '</a>';
            } else {
                mainHtml = '<a class="tm-hty-match-main" href="' + earlyMatchUrl(id) +
                    '" title="跳转早盘页">' + pickText + '</a>';
            }
            return '<div class="' + rowClass + '">' +
                '<span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span>' +
                mainHtml +
                traceLink +
                pageBadge +
                '</div>';
        }).join('');
    }

    function renderMatchStrategies(panel) {
        if (!panel) return;
        const statusEl = panel.querySelector('.tm-hty-strategy-status');
        const listEl = panel.querySelector('.tm-hty-strategy-list');
        if (!statusEl || !listEl) return;

        const listKey = strategyRenderKey();
        if (listKey === lastStrategyListKey) return;
        lastStrategyListKey = listKey;

        if (strategyStatus === 'loading' && !strategyList.length) {
            statusEl.textContent = '加载中…';
            statusEl.dataset.kind = 'info';
            listEl.innerHTML = '';
            return;
        }
        if (strategyStatus === 'err') {
            statusEl.textContent = strategyError || '加载失败';
            statusEl.dataset.kind = 'err';
            if (!strategyList.length) {
                listEl.innerHTML = '';
            }
            return;
        }

        const triggerText = strategyTrigger === '1' ? '已触发' : '未触发';
        const executedCount = strategyList.filter(function (item) {
            return getStrategyExecStatus(item) === 'executed';
        }).length;
        const abortedCount = strategyList.filter(function (item) {
            return getStrategyExecStatus(item) === 'aborted';
        }).length;
        const confirmingCount = strategyList.filter(function (item) {
            return getStrategyExecStatus(item) === 'confirming';
        }).length;
        let statusText = strategyList.length + ' 条 · ' + triggerText + ' · #' + selectedMatchId;
        if (executedCount > 0) statusText += ' · ' + executedCount + ' 已执行';
        if (abortedCount > 0) statusText += ' · ' + abortedCount + ' 已中止';
        if (confirmingCount > 0) statusText += ' · ' + confirmingCount + ' 待确认';
        statusEl.textContent = statusText;
        statusEl.dataset.kind = strategyTrigger === '1' ? 'ready' : 'info';

        if (!strategyList.length) {
            listEl.innerHTML = '<div class="tm-hty-strategy-empty">暂无策略</div>';
            return;
        }

        listEl.innerHTML = strategyList.map(function (item, idx) {
            const execStatus = getStrategyExecStatus(item);
            let rowClass = '';
            if (execStatus === 'executed') rowClass = ' tm-hty-strategy-item-done';
            else if (execStatus === 'aborted') rowClass = ' tm-hty-strategy-item-aborted';
            else if (execStatus === 'confirming') rowClass = ' tm-hty-strategy-item-confirming';
            return '<div class="tm-hty-strategy-item' + rowClass + '">' +
                '<span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span>' +
                '<span class="tm-hty-strategy-text">' + formatStrategyItemHtml(item) + '</span>' +
                '</div>';
        }).join('');
    }

    function renderStrategies(panel) {
        renderActiveMatches(panel);
        renderMatchStrategies(panel);
    }

    function renderPanel(force) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        targetOption = findHomeWinOption();

        const cooldown = targetOption ? remainingCooldown(targetOption.testid, MIN_STAKE) : 0;
        const panelKey = [
            panelReady ? '1' : '0',
            panelCollapsed ? '1' : '0',
            targetOption ? targetOption.testid : 'none',
            targetOption ? targetOption.odds : '',
            betResult,
            betStep,
            cooldown,
            placing ? '1' : '0',
            betDone ? '1' : '0',
            isLoggedIn() ? '1' : '0',
            isCartOpen() ? '1' : '0',
            matchId,
            selectedMatchId,
            activeMatchesRenderKey(),
            strategyRenderKey(),
        ].join('|');

        if (!force && panelKey === lastPanelKey) return;
        lastPanelKey = panelKey;

        const matchEl = panel.querySelector('.tm-hty-match');
        const linkEl = panel.querySelector('.tm-hty-link-hty');
        const traceLinkEl = panel.querySelector('.tm-hty-link-trace');
        const upcomingEl = panel.querySelector('.tm-hty-upcoming');
        const resultEl = panel.querySelector('.tm-hty-result');
        const stepEl = panel.querySelector('.tm-hty-step');
        const loginEl = panel.querySelector('.tm-hty-login');
        const openCartBtn = panel.querySelector('[data-action="open-cart"]');

        if (matchEl) {
            matchEl.textContent = '赛事 ' + matchId + '（地址栏）' +
                (isAutoBetEnabled() ? ' · 独赢(' + TARGET_MARKET + ') 自动下注' : ' · 策略监控');
        }
        if (linkEl) {
            linkEl.href = matchPageUrl();
            linkEl.textContent = 'HTY比赛页';
        }
        if (traceLinkEl) {
            traceLinkEl.href = traceMatchUrl(matchId);
        }
        if (upcomingEl) upcomingEl.textContent = upcomingText();
        if (resultEl) {
            resultEl.textContent = resultLabel();
            resultEl.dataset.kind = resultKind();
        }
        if (stepEl) stepEl.textContent = betStep || '—';
        if (loginEl) {
            loginEl.textContent = isLoggedIn() ? '已登录' : '未登录';
            loginEl.dataset.kind = isLoggedIn() ? 'ok' : 'warn';
        }
        if (openCartBtn) {
            openCartBtn.textContent = isCartOpen() ? '投注单已开' : '打开投注单';
            openCartBtn.disabled = placing || !isAutoBetEnabled();
        }
        renderStrategies(panel);
        updateBetSectionVisibility(panel);
    }

    function updateBetSectionVisibility(panel) {
        if (!panel) return;
        const betSection = panel.querySelector('.tm-hty-bet-section');
        const actionsEl = panel.querySelector('.tm-hty-actions');
        const enabled = isAutoBetEnabled();
        if (betSection) betSection.dataset.hidden = enabled ? '0' : '1';
        if (actionsEl) actionsEl.style.display = enabled ? '' : 'none';
    }

    function onMatchRouteChange(newId) {
        if (!newId || newId === matchId) return;
        matchId = newId;
        selectedMatchId = newId;
        lastMatchesListKey = '';
        lastStrategyListKey = '';
        lastPanelKey = '';
        targetOption = null;
        loadMatchStrategies(newId, !!strategyCache[newId]);
        renderPanel(true);
    }

    function checkUrlChange() {
        const href = window.location.href;
        if (href === lastWatchedUrl) return;
        lastWatchedUrl = href;
        const newId = getMatchIdFromUrl();
        if (newId) onMatchRouteChange(newId);
    }

    function setupRouteWatcher() {
        if (routeWatchTimer) return;
        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function () {
            const ret = origPush.apply(this, arguments);
            checkUrlChange();
            return ret;
        };
        history.replaceState = function () {
            const ret = origReplace.apply(this, arguments);
            checkUrlChange();
            return ret;
        };
        window.addEventListener('popstate', checkUrlChange);
        routeWatchTimer = setInterval(checkUrlChange, 800);
    }

    function shouldAutoBet() {
        if (!isAutoBetEnabled()) return false;
        if (betDone || placing || !targetOption) return false;
        if (attemptedThisPage.has(targetOption.testid)) return false;
        if (isRecentlyPlaced(targetOption.testid, MIN_STAKE)) return false;
        return true;
    }

    async function placeMinBet(option) {
        if (!option || placing) return false;
        if (isRecentlyPlaced(option.testid, MIN_STAKE)) return false;
        if (attemptedThisPage.has(option.testid)) return false;

        placing = true;
        attemptedThisPage.add(option.testid);
        setBetResult('placing', '准备点击赔率');

        try {
            setBetStep('滚动到赔率按钮');
            await humanScrollTo(option.button);
            setBetStep('点击主胜赔率');
            safeClick(option.button);
            await humanDelay(600, 1100);

            setBetStep('等待投注单打开');
            const opened = await waitFor(isCartOpen, 12000, 300);
            if (!opened) throw new Error('投注单未打开');
            await humanDelay(400, 800);

            setBetStep('数字键盘输入 ' + MIN_STAKE);
            await enterAmountViaKeypad(MIN_STAKE);
            await humanDelay(300, 700);

            await submitBetSlip();

            markPlaced(option.testid, MIN_STAKE);
            betDone = true;
            stopPolling();
            setBetResult('success', '主胜 ' + MIN_STAKE + ' 已提交');
            renderPanel(true);
            return true;
        } catch (err) {
            attemptedThisPage.delete(option.testid);
            const msg = err && err.message ? err.message : '未知错误';
            setBetResult('failed', '失败：' + msg);
            renderPanel(true);
            return false;
        } finally {
            placing = false;
        }
    }

    async function runAutoBet() {
        if (!shouldAutoBet()) return;
        if (!isLoggedIn()) {
            betResult = 'pending';
            setBetStep('等待登录后继续自动下注');
            schedulePoll();
            return;
        }
        await placeMinBet(targetOption);
    }

    async function manualOpenCart() {
        if (placing) return;
        setBetStep('正在打开投注单...');
        const ok = await openBetDrawer();
        if (ok) {
            setBetStep('投注单已打开');
        } else {
            setBetStep('未能打开投注单');
        }
        renderPanel(true);
    }

    async function manualBet() {
        if (placing) return;
        await ensureMarketView();
        targetOption = findHomeWinOption();
        if (!targetOption) {
            setBetResult('failed', '未找到主胜盘口，请切换到经典盘口视图');
            return;
        }
        if (isRecentlyPlaced(targetOption.testid, MIN_STAKE)) {
            setBetResult('skipped', '90秒内已下过主胜 ' + MIN_STAKE);
            return;
        }
        attemptedThisPage.delete(targetOption.testid);
        betDone = false;
        await placeMinBet(targetOption);
    }

    function schedulePoll() {
        if (betDone || pollTimer) return;
        if (pollCount >= MAX_POLLS) {
            setBetResult('stopped', '等待超时，已停止');
            return;
        }
        pollTimer = setTimeout(async function () {
            pollTimer = null;
            pollCount += 1;
            if (betDone) return;
            if (!isPageReady()) {
                schedulePoll();
                return;
            }

            await ensureMarketView();
            targetOption = findHomeWinOption();
            if (targetOption && betStep.indexOf('等待主胜盘口') >= 0) {
                setBetStep('已识别主胜盘口 @' + targetOption.odds);
            }
            renderPanel();
            if (!placing && shouldAutoBet()) {
                if (isLoggedIn()) {
                    if (betResult === 'stopped' && betStep.indexOf('登录') >= 0) {
                        betResult = 'pending';
                    }
                    runAutoBet();
                } else {
                    betResult = 'pending';
                    setBetStep('等待登录后继续自动下注');
                    schedulePoll();
                }
            } else if (!betDone && !placing) {
                schedulePoll();
            }
        }, POLL_MS);
    }

    function kickoffAutoBet() {
        panelReady = true;
        renderPanel(true);
        if (targetOption && isRecentlyPlaced(targetOption.testid, MIN_STAKE)) {
            betDone = true;
            setBetResult('skipped', '90秒内已下过主胜 ' + MIN_STAKE);
            return;
        }
        if (shouldAutoBet() && isLoggedIn()) {
            setBetStep('已识别盘口，准备自动下注');
            runAutoBet();
            return;
        }
        if (!isLoggedIn()) {
            betResult = 'pending';
            setBetStep('等待登录后继续自动下注');
            schedulePoll();
            return;
        }
        setBetStep('等待主胜盘口或下注时机');
        schedulePoll();
    }

    function togglePanelCollapsed() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panelCollapsed = !panelCollapsed;
        panel.classList.toggle('tm-hty-collapsed', panelCollapsed);
        const btn = panel.querySelector('.tm-hty-collapse');
        if (btn) btn.textContent = panelCollapsed ? '▸' : '▾';
        renderPanel(true);
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID) || !document.body) return;
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent =
                '#' + PANEL_ID + '{position:fixed;right:16px;bottom:16px;z-index:99999;width:fit-content;max-width:calc(100vw - 32px);' +
                'border:1px solid #334155;border-radius:10px;background:#0f172a;color:#e2e8f0;' +
                'box-shadow:0 8px 24px rgba(0,0,0,.35);font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;}' +
                '#' + PANEL_ID + '.tm-hty-collapsed{width:auto;min-width:148px;}' +
                '#' + PANEL_ID + '.tm-hty-collapsed .tm-hty-body,' +
                '#' + PANEL_ID + '.tm-hty-collapsed .tm-hty-actions{display:none;}' +
                '#' + PANEL_ID + ' .tm-hty-head{position:relative;display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1e293b;font-weight:600;font-size:12px;cursor:pointer;user-select:none;}' +
                '#' + PANEL_ID + ' .tm-hty-title{flex:1;}' +
                '#' + PANEL_ID + ' .tm-hty-collapse{border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:12px;padding:0 2px;}' +
                '#' + PANEL_ID + ' .tm-hty-body{padding:10px 10px 8px;}' +
                '#' + PANEL_ID + ' .tm-hty-row{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;}' +
                '#' + PANEL_ID + ' .tm-hty-label{flex:0 0 52px;color:#94a3b8;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-value{flex:0 1 auto;color:#f1f5f9;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-link{color:#60a5fa;text-decoration:none;}' +
                '#' + PANEL_ID + ' .tm-hty-link:hover{text-decoration:underline;}' +
                '#' + PANEL_ID + ' .tm-hty-link-sep{color:#475569;margin:0 4px;}' +
                '#' + PANEL_ID + ' .tm-hty-result{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:600;font-size:11px;}' +
                '#' + PANEL_ID + ' .tm-hty-result[data-kind="ready"]{background:#1d4ed8;color:#dbeafe;}' +
                '#' + PANEL_ID + ' .tm-hty-result[data-kind="ing"]{background:#854d0e;color:#fef3c7;}' +
                '#' + PANEL_ID + ' .tm-hty-result[data-kind="ok"]{background:#166534;color:#dcfce7;}' +
                '#' + PANEL_ID + ' .tm-hty-result[data-kind="err"]{background:#991b1b;color:#fee2e2;}' +
                '#' + PANEL_ID + ' .tm-hty-result[data-kind="warn"]{background:#92400e;color:#fef3c7;}' +
                '#' + PANEL_ID + ' .tm-hty-result[data-kind="info"]{background:#334155;color:#cbd5e1;}' +
                '#' + PANEL_ID + ' .tm-hty-step{margin-top:4px;padding-top:8px;border-top:1px dashed #334155;color:#94a3b8;font-size:11px;}' +
                '#' + PANEL_ID + ' .tm-hty-login{font-size:10px;color:#64748b;}' +
                '#' + PANEL_ID + ' .tm-hty-login[data-kind="ok"]{color:#86efac;}' +
                '#' + PANEL_ID + ' .tm-hty-login[data-kind="warn"]{color:#fde68a;}' +
                '#' + PANEL_ID + ' .tm-hty-actions{display:flex;gap:6px;padding:0 12px 12px;}' +
                '#' + PANEL_ID + ' .tm-hty-action-btn{flex:1;border:1px solid #2563eb;border-radius:6px;padding:6px 8px;' +
                'background:#172554;color:#dbeafe;font-size:11px;cursor:pointer;}' +
                '#' + PANEL_ID + ' .tm-hty-action-btn:hover:not(:disabled){background:#1d4ed8;}' +
                '#' + PANEL_ID + ' .tm-hty-action-btn:disabled{opacity:.45;cursor:not-allowed;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy{margin-top:8px;padding-top:8px;border-top:1px dashed #334155;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-title{font-weight:600;color:#cbd5e1;font-size:11px;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-head > span:last-child{white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-matches-status,' +
                '#' + PANEL_ID + ' .tm-hty-strategy-status{font-size:10px;padding:1px 6px;border-radius:999px;background:#334155;color:#cbd5e1;}' +
                '#' + PANEL_ID + ' .tm-hty-matches-status[data-kind="ready"],' +
                '#' + PANEL_ID + ' .tm-hty-strategy-status[data-kind="ready"]{background:#1d4ed8;color:#dbeafe;}' +
                '#' + PANEL_ID + ' .tm-hty-matches-status[data-kind="err"],' +
                '#' + PANEL_ID + ' .tm-hty-strategy-status[data-kind="err"]{background:#991b1b;color:#fee2e2;}' +
                '#' + PANEL_ID + ' .tm-hty-matches-list{display:flex;flex-direction:column;align-items:flex-start;gap:2px;max-height:120px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-list{max-height:120px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;}' +
                '#' + PANEL_ID + ' .tm-hty-match-item{display:flex;flex-wrap:nowrap;gap:4px;align-items:center;width:fit-content;max-width:100%;margin-bottom:2px;font-size:11px;color:#e2e8f0;border-radius:6px;padding:3px 4px;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-match-item:hover{background:#1e293b;}' +
                '#' + PANEL_ID + ' .tm-hty-match-item .tm-hty-strategy-idx{flex:0 0 auto;flex-shrink:0;}' +
                '#' + PANEL_ID + ' .tm-hty-match-main{flex:0 0 auto;color:#e2e8f0;text-decoration:none;}' +
                '#' + PANEL_ID + ' .tm-hty-match-pick{flex:0 0 auto;}' +
                '#' + PANEL_ID + ' .tm-hty-match-main:hover{color:#93c5fd;text-decoration:underline;}' +
                '#' + PANEL_ID + ' .tm-hty-match-trace{flex:0 0 auto;flex-shrink:0;font-size:10px;padding:1px 4px;border-radius:4px;' +
                'border:1px solid #475569;color:#94a3b8;text-decoration:none;line-height:1.4;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-match-trace:hover{border-color:#60a5fa;color:#60a5fa;background:#172554;}' +
                '#' + PANEL_ID + ' .tm-hty-match-page{background:linear-gradient(90deg,rgba(37,99,235,.22) 0%,rgba(30,41,59,.55) 100%);' +
                'border:1px solid rgba(59,130,246,.45);box-shadow:inset 2px 0 0 #3b82f6;}' +
                '#' + PANEL_ID + ' .tm-hty-match-page:hover{background:linear-gradient(90deg,rgba(37,99,235,.28) 0%,rgba(30,41,59,.65) 100%);}' +
                '#' + PANEL_ID + ' .tm-hty-match-page .tm-hty-match-main{color:#dbeafe;font-weight:600;}' +
                '#' + PANEL_ID + ' .tm-hty-match-badge{flex:0 0 auto;flex-shrink:0;font-size:10px;padding:1px 6px;border-radius:999px;' +
                'background:#1d4ed8;color:#dbeafe;font-weight:600;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item{display:flex;gap:4px;margin-bottom:4px;font-size:11px;color:#e2e8f0;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-idx{flex:0 0 16px;color:#64748b;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-text{flex:0 0 auto;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;line-height:1.4;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-pending{background:#334155;color:#cbd5e1;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-executed{background:#dcfce7;color:#166534;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-confirming{background:#334155;color:#94a3b8;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-aborted{background:#451a1a;color:#fca5a5;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-done .tm-hty-strategy-text{color:#86efac;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-confirming .tm-hty-strategy-text,' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-aborted .tm-hty-strategy-text{color:#94a3b8;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-odds{display:inline-block;padding:1px 6px;border-radius:4px;' +
                'background:#dcfce7;color:#166534;font-weight:600;font-size:10px;line-height:1.4;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-amount{display:inline-block;padding:1px 6px;border-radius:4px;' +
                'background:#fef3c7;color:#92400e;font-weight:600;font-size:10px;line-height:1.4;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-empty{color:#64748b;font-size:11px;}' +
                '#' + PANEL_ID + ' .tm-hty-refresh{border:0;background:transparent;color:#60a5fa;cursor:pointer;font-size:10px;padding:0;}' +
                '#' + PANEL_ID + ' .tm-hty-bet-section{margin-top:4px;padding-top:8px;border-top:1px dashed #334155;}' +
                '#' + PANEL_ID + ' .tm-hty-bet-section[data-hidden="1"]{display:none;}';
            document.head.appendChild(style);
        }
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<div class="tm-hty-head">' +
            '<span class="tm-hty-title">HTY 策略监控</span>' +
            '<span class="tm-hty-login">检测中</span>' +
            '<button type="button" class="tm-hty-collapse" title="折叠/展开">▾</button>' +
            '</div>' +
            '<div class="tm-hty-body">' +
            '<div class="tm-hty-row"><span class="tm-hty-label">赛事</span><span class="tm-hty-value tm-hty-match">—</span></div>' +
            '<div class="tm-hty-row"><span class="tm-hty-label">链接</span><span class="tm-hty-value">' +
            '<a class="tm-hty-link tm-hty-link-hty" href="#">HTY比赛页</a>' +
            '<span class="tm-hty-link-sep">·</span>' +
            '<a class="tm-hty-link tm-hty-link-trace" href="#" target="_blank" rel="noopener">走势追踪</a>' +
            '</span></div>' +
            '<div class="tm-hty-strategy tm-hty-matches">' +
            '<div class="tm-hty-strategy-head">' +
            '<span class="tm-hty-strategy-title">策略赛事</span>' +
            '<span><span class="tm-hty-matches-status" data-kind="info">加载中…</span> ' +
            '<button type="button" class="tm-hty-refresh" data-action="refresh-strategy" title="刷新">刷新</button></span>' +
            '</div>' +
            '<div class="tm-hty-matches-list"></div>' +
            '</div>' +
            '<div class="tm-hty-strategy tm-hty-strategy-rules">' +
            '<div class="tm-hty-strategy-head">' +
            '<span class="tm-hty-strategy-title">策略列表</span>' +
            '<span class="tm-hty-strategy-status" data-kind="info">加载中…</span>' +
            '</div>' +
            '<div class="tm-hty-strategy-list"></div>' +
            '</div>' +
            '<div class="tm-hty-bet-section">' +
            '<div class="tm-hty-row"><span class="tm-hty-label">即将投注</span><span class="tm-hty-value tm-hty-upcoming">等待页面加载</span></div>' +
            '<div class="tm-hty-row"><span class="tm-hty-label">投注结果</span><span class="tm-hty-value"><span class="tm-hty-result" data-kind="info">等待盘口</span></span></div>' +
            '<div class="tm-hty-step">初始化中</div>' +
            '</div>' +
            '</div>' +
            '<div class="tm-hty-actions">' +
            '<button type="button" class="tm-hty-action-btn" data-action="open-cart">打开投注单</button>' +
            '<button type="button" class="tm-hty-action-btn" data-action="retry-bet">手动下注</button>' +
            '</div>';

        panel.querySelector('.tm-hty-head').addEventListener('click', function (e) {
            if (e.target.closest('.tm-hty-collapse') || e.target.closest('.tm-hty-login')) return;
            togglePanelCollapsed();
        });
        panel.querySelector('.tm-hty-collapse').addEventListener('click', function (e) {
            e.stopPropagation();
            togglePanelCollapsed();
        });
        panel.addEventListener('click', function (e) {
            if (e.target.closest('.tm-hty-match-trace')) return;
            if (e.target.closest('.tm-hty-match-main')) {
                const link = e.target.closest('.tm-hty-match-main');
                const href = link.getAttribute('href') || '';
                if (href.indexOf('/sportEvents/inplay/') >= 0) {
                    e.preventDefault();
                    const idMatch = href.match(/\/match\/(\d+)/i);
                    const targetId = idMatch ? idMatch[1] : '';
                    if (targetId) {
                        window.location.href = inplayMatchUrl(targetId, true);
                    }
                    return;
                }
                setTimeout(checkUrlChange, 0);
                setTimeout(checkUrlChange, 400);
                return;
            }
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn || actionBtn.disabled) return;
            e.stopPropagation();
            if (actionBtn.dataset.action === 'open-cart') manualOpenCart();
            if (actionBtn.dataset.action === 'retry-bet') manualBet();
            if (actionBtn.dataset.action === 'refresh-strategy') loadStrategies(true);
        });

        const betSection = panel.querySelector('.tm-hty-bet-section');
        const actionsEl = panel.querySelector('.tm-hty-actions');
        if (betSection) betSection.dataset.hidden = isAutoBetEnabled() ? '0' : '1';
        if (actionsEl) actionsEl.style.display = isAutoBetEnabled() ? '' : 'none';

        document.body.appendChild(panel);
        setupRouteWatcher();
        loadStrategies(false);
        scheduleStrategyPoll();
        renderPanel(true);
    }

    async function startAutoBetFlow() {
        setBetStep('等待赛事页加载完成');

        try {
            await waitFor(isPageReady, 60000, 500);
        } catch (e) {
            setBetResult('stopped', '页面加载超时');
            return;
        }

        setBetStep('页面已就绪，查找独赢盘口');
        panelReady = true;
        targetOption = await waitForHomeMarket(60000);
        renderPanel(true);
        if (!targetOption) {
            setBetResult('stopped', '未找到主胜盘口，请切换到经典视图后点手动下注');
            schedulePoll();
            return;
        }
        await humanDelay(1500, 3000);
        kickoffAutoBet();
    }

    async function start() {
        if (started) return;
        started = true;

        createPanel();

        if (!isAutoBetEnabled()) {
            panelReady = true;
            setBetStep('策略监控中（自动下注仅赛事 ' + TARGET_MATCH_ID + '）');
            renderPanel(true);
            return;
        }

        await startAutoBetFlow();
    }

    start();
})();
