// ==UserScript==
// @name         HTY滚球量化投注
// @namespace    https://smartodds.xyz/
// @version      2.10.1
// @description  HTY滚球赛事页：策略赛事列表 + 自动下注 + 投注单关联策略 + 记录同步
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/inplay\/football\/match\/\d+(\?|#|$)/
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/inplay\/football\/?(\?|#|$)/
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      alert.socbeta.xyz
// @connect      *
// @connect      192.168.31.168
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'tm-hty-inplay-quant-panel';
    const STYLE_ID = 'tm-hty-inplay-quant-style';
    const SCRIPT_VERSION = '2.10.1';
    const BET_API_WAIT_MS = 18000;
    const PANEL_TEXT_MAX = 72;
    const ALERT_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/trigger';
    const ALERT_MATCHES_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/matches/active';
    const ALERT_RULE_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/rule';
    const TRACE_MATCH_BASE = 'http://qisheng1.xyz/match/trace?match_id=';
    const STRATEGY_POLL_MS = 30000;
    const TEST_STAKE = 0.3;
    const POLL_MS = 8000;
    const RESCAN_MS = 8000;
    const MATCH_SCAN_MS = 8000;
    const MATCH_SCAN_PENDING_MS = 5000;
    const LOGIN_CACHE_MS = 5000;
    const MAX_POLLS = 30;
    const PAGE_READY_SEL = '[data-testid="SportExhaustivePage"]';
    const MATCH_ENDED_HINT = '此赛事已结束';
    const IDLE_LOGIN_HINT = '闲置过久';
    const KEEPALIVE_RETURN_URL_KEY = 'tm_hty_inplay_keepalive_return';
    const KEEPALIVE_PHASE_KEY = 'tm_hty_inplay_keepalive_phase';
    const KEEPALIVE_MATCH_ID_KEY = 'tm_hty_inplay_keepalive_match_id';
    const KEEPALIVE_TARGET_MATCH_ID_KEY = 'tm_hty_inplay_keepalive_target';
    const KEEPALIVE_TARGET_HOME_KEY = 'tm_hty_inplay_keepalive_home';
    const KEEPALIVE_TARGET_AWAY_KEY = 'tm_hty_inplay_keepalive_away';
    const SESSION_KEEPALIVE_MS = 120000;
    const MATCH_ENDED_SWITCH_COOLDOWN_MS = 12000;
    const INPLAY_NAV_COOLDOWN_MS = 15000;
    const INPLAY_MATCH_WATCH_MS = 15000;
    const REPORT_UPLOAD = {
        bet: 'http://192.168.31.168:9999/bet/records/upload',
        strategy: 'http://192.168.31.168:9999/bet/strategy/upload',
        site: 'http://192.168.31.168:9999/site/url',
        wallet: 'http://192.168.31.168:9999/bet/wallet/upload',
    };
    const REPORT_UPLOAD_TIMEOUT = 30000;
    const REPORT_SYNC_DELAY_MS = 2500;
    const REPORT_API_WAIT_MS = 12000;
    const SESSION_API_KEEPALIVE_MS = 180000;
    const SESSION_HEADER_FRESH_MS = 180000;
    const SESSION_LOGIN_WATCH_MS = 60000;
    const RELOGIN_COOLDOWN_MS = 25000;
    const RELOGIN_WATCH_MS = 15000;
    const SIMPLE_LOGIN_PIN = '0514';

    let htyApiState = {
        apiBase: '',
        headers: {},
        lastCaptureAt: 0,
    };
    let reportSyncing = false;
    let betResultWaiter = null;
    let lastStrategyBetRecord = null;
    const PAGE_HOOK_SRC = 'hty-inplay-api-hook';
    const PAGE_USR_SRC = 'hty-inplay-userscript';

    const MARKET_LABEL = {
        aou: '客进球',
        hou: '主进球',
        ah: '让球',
        ou: '全场进球',
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
        const m = window.location.href.match(/\/sportEvents\/inplay\/football\/match\/(\d+)/i);
        return m ? m[1] : '';
    }

    let matchId = getMatchIdFromUrl();
    let loginCache = { value: false, ts: 0 };
    let reloginInProgress = false;
    let lastReloginAttemptAt = 0;

    initPlatformApiBridge();
    injectPlatformApiHook();

    if (!matchId) {
        if (isInplayListPage()) {
            bootListPageKeepAlive();
        }
        return;
    }

    let targetOption = null;
    let placing = false;
    let pollTimer = null;
    let pollCount = 0;
    let started = false;
    let panelReady = false;
    let panelCollapsed = false;
    let betResult = 'pending';
    let betStep = '等待页面加载';
    let lastPanelKey = '';
    let strategyList = [];
    let strategyTrigger = '';
    let strategyStatus = 'loading';
    let strategyError = '';
    let strategyTimer = null;
    let routeWatchTimer = null;
    let lastWatchedUrl = window.location.href;
    let activeMatches = [];
    let matchesStatus = 'loading';
    let matchesError = '';
    let lastMatchesListKey = '';
    let lastStrategyListKey = '';
    let lastStrategyHitKey = '';
    let strategyStates = [];
    let lastMatchScanAt = 0;
    let loginWatchTimer = null;
    let oddsObserver = null;
    let refreshDebounceTimer = null;
    let rescanTimer = null;
    let lastScanButtonCount = 0;
    let lastScanViewMode = '';
    let lastScanError = '';
    let lastButtonSnapshot = new Map();
    let endedMatchesCollapsed = true;
    let matchEndedHandling = false;
    let lastEndedSwitchAt = 0;
    let matchEndedWatchTimer = null;
    let lastInplayNavAt = 0;
    let inplayWatchTimer = null;
    let pageSwitchTimer = null;

    function isInplayListPage() {
        const path = window.location.pathname.replace(/\/$/, '');
        return /\/sportEvents\/inplay\/football$/i.test(path);
    }

    function inplayListUrl() {
        return window.location.origin + '/sportEvents/inplay/football';
    }

    function findSidebarFootballLink() {
        const hrefNeedles = [
            '/sportEvents/inplay/football',
            '/sportEvents/football/inplay',
        ];
        const anchors = document.querySelectorAll('a[href]');
        for (let i = 0; i < anchors.length; i++) {
            const href = anchors[i].getAttribute('href') || '';
            for (let p = 0; p < hrefNeedles.length; p++) {
                if (href.indexOf(hrefNeedles[p]) >= 0 && isElementVisible(anchors[i])) {
                    return anchors[i];
                }
            }
        }
        const scoped = document.querySelectorAll(
            'aside a, aside button, nav a, nav button, nav div, aside div, nav span, aside span, ' +
            '[class*="sidebar"] a, [class*="Sidebar"] a, [class*="menu"] a, [class*="Menu"] a'
        );
        for (let i = 0; i < scoped.length; i++) {
            const el = scoped[i];
            if (!isElementVisible(el)) continue;
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label === '足球') return el;
        }
        const nodes = document.querySelectorAll('a, button, [role="button"], div, span, li');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label !== '足球') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width > 220 || rect.height > 90) continue;
            if (rect.left > window.innerWidth * 0.45) continue;
            return el;
        }
        return null;
    }

    function clickSidebarFootball() {
        const el = findSidebarFootballLink();
        if (!el) return false;
        console.log('[hty-inplay] 保活：点击侧边栏足球');
        safeClick(el);
        return true;
    }

    function clickMatchOnInplayList(targetId, home, away) {
        if (targetId) {
            const links = document.querySelectorAll(
                'a[href*="/match/' + targetId + '"], [href*="/match/' + targetId + '"]'
            );
            for (let i = 0; i < links.length; i++) {
                const el = links[i].closest('a') || links[i];
                if (isElementVisible(el)) {
                    safeClick(el);
                    return true;
                }
            }
        }
        if (home && away) {
            const nodes = document.querySelectorAll('a, [role="button"], li, div');
            for (let i = 0; i < nodes.length; i++) {
                const text = nodes[i].textContent || '';
                if (text.indexOf(home) < 0 || text.indexOf(away) < 0) continue;
                const clickEl = nodes[i].closest('a') || nodes[i].querySelector('a') || nodes[i];
                if (clickEl && isElementVisible(clickEl)) {
                    safeClick(clickEl);
                    return true;
                }
            }
        }
        const links = document.querySelectorAll('a[href*="/sportEvents/inplay/football/match/"]');
        for (let i = 0; i < links.length; i++) {
            if (!isElementVisible(links[i])) continue;
            if (!targetId || (links[i].href || '').indexOf('/match/' + targetId) >= 0) {
                safeClick(links[i]);
                return true;
            }
        }
        return false;
    }

    function bootListPageEnterMatch() {
        const targetId = sessionStorage.getItem(KEEPALIVE_TARGET_MATCH_ID_KEY) ||
            sessionStorage.getItem(KEEPALIVE_MATCH_ID_KEY) || '';
        const home = sessionStorage.getItem(KEEPALIVE_TARGET_HOME_KEY) || '';
        const away = sessionStorage.getItem(KEEPALIVE_TARGET_AWAY_KEY) || '';
        let attempts = 0;
        const maxAttempts = 24;

        async function tryClick() {
            attempts += 1;
            if (attempts > maxAttempts) {
                console.warn('[hty-inplay] 列表页进入比赛超时', targetId);
                sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
                if (targetId) window.location.href = inplayMatchUrl(targetId);
                return;
            }
            const ready = document.querySelectorAll('a[href*="/sportEvents/inplay/football/match/"]').length > 0;
            if (!ready) {
                setTimeout(tryClick, 500);
                return;
            }
            await humanDelay(800, 1500);
            if (clickMatchOnInplayList(targetId, home, away)) {
                console.log('[hty-inplay] 列表页已点击比赛', targetId);
                sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
                return;
            }
            setTimeout(tryClick, 1500);
        }

        if (document.body) tryClick();
        else document.addEventListener('DOMContentLoaded', tryClick);
    }

    function bootListPageKeepAlive() {
        function checkListIdleModal() {
            if (!document.body) return;
            const text = document.body.innerText || '';
            if (text.indexOf(IDLE_LOGIN_HINT) < 0 || text.indexOf('重新登录') < 0) return;
            const nodes = document.querySelectorAll('button, [role="button"]');
            for (let i = 0; i < nodes.length; i++) {
                const label = (nodes[i].textContent || '').replace(/\s+/g, '');
                if (label === '确定') {
                    nodes[i].click();
                    console.warn('[hty-inplay] 列表页检测到闲置登出弹窗');
                    break;
                }
            }
        }
        setInterval(checkListIdleModal, 2000);
        document.addEventListener('DOMContentLoaded', checkListIdleModal);

        setInterval(function () {
            loginCache.ts = 0;
            if (isLoggedIn() || reloginInProgress) return;
            tryAutoRelogin({ lite: true }).catch(function (e) {
                console.warn('[hty-inplay] 列表页自动登录', e);
            });
        }, RELOGIN_WATCH_MS);

        const phase = sessionStorage.getItem(KEEPALIVE_PHASE_KEY) || '';
        if (phase === 'via-football' || phase === 'enter-match') {
            sessionStorage.setItem(KEEPALIVE_PHASE_KEY, 'enter-match');
            console.log('[hty-inplay] 列表页保活：等待进入策略比赛');
            bootListPageEnterMatch();
            return;
        }
    }

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
                await enterAmountViaKeypad(TEST_STAKE);
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

        const option = targetOption;
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

        async function pressTab(btn) {
            if (!btn) return false;
            if (btn.getAttribute('aria-pressed') === 'true') return true;
            safeClick(btn);
            await humanDelay(800, 1200);
            return btn.getAttribute('aria-pressed') === 'true';
        }

        if (lineup && lineup.getAttribute('aria-pressed') === 'true') {
            await pressTab(classic) || await pressTab(quick);
        }

        let count = countOddsButtons();
        if (count < 3 && classic && classic.getAttribute('aria-pressed') !== 'true') {
            await pressTab(classic);
            count = countOddsButtons();
        }
        if (count < 3 && quick && quick.getAttribute('aria-pressed') !== 'true') {
            await pressTab(quick);
        }
    }

    function getActiveMarketViewLabel() {
        const classic = document.querySelector('[data-testid="classic"]');
        const quick = document.querySelector('[data-testid="quick"]');
        const lineup = document.querySelector('[data-testid="lineUp"]');
        if (classic && classic.getAttribute('aria-pressed') === 'true') return '经典';
        if (quick && quick.getAttribute('aria-pressed') === 'true') return '快速';
        if (lineup && lineup.getAttribute('aria-pressed') === 'true') return '阵容';
        return '未知';
    }

    function queryOddsButtons() {
        const primary = document.querySelectorAll('button[data-testid^="oddsBtn-"]');
        if (primary.length) return primary;
        return document.querySelectorAll('button[data-testid*="oddsBtn"]');
    }

    function countOddsButtons() {
        return queryOddsButtons().length;
    }

    async function waitForOddsButtons(minCount, timeoutMs) {
        const min = minCount || 1;
        const deadline = Date.now() + (timeoutMs || 15000);
        while (Date.now() < deadline) {
            await ensureMarketView();
            const count = countOddsButtons();
            if (count >= min) return count;
            await sleep(500);
        }
        return countOddsButtons();
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

    function stripOuPrefix(text) {
        return String(text || '').trim().replace(/^[OU大小]\s*/i, '');
    }

    function getButtonMarketScope(btn) {
        if (!btn || !btn.closest) return '';
        const sel = '[data-testid*="MarketTableColTwoContainer-"],[data-testid*="ExhaustiveMarketCardWrapper-"]';
        let el = btn.closest(sel);
        while (el) {
            const tid = el.getAttribute('data-testid') || '';
            const m = tid.match(/(?:MarketTableColTwoContainer|ExhaustiveMarketCardWrapper)-([^"_]+)/i);
            if (m) return String(m[1]).toLowerCase();
            el = el.parentElement ? el.parentElement.closest(sel) : null;
        }
        return '';
    }

    function marketsMatch(strategyMarket, pageMarket, btn) {
        const sm = String(strategyMarket || '').toLowerCase();
        const pm = String(pageMarket || '').toLowerCase();
        const scope = btn ? getButtonMarketScope(btn) : '';
        if (sm === pm) {
            if (sm === 'ou' && scope && scope !== 'ou') return false;
            return true;
        }
        if ((sm === 'ad' || sm === '1x2') && (pm === 'ad' || pm === '1x2')) return true;
        if (sm === 'aou' && (pm === 'a-ou' || pm === 'aou')) return true;
        if (sm === 'hou' && (pm === 'h-ou' || pm === 'hou')) return true;
        if (sm === 'aou' && pm === 'ou') {
            return scope === 'a-ou' || scope === 'ou' || scope === '';
        }
        if (sm === 'hou' && pm === 'ou') {
            return scope === 'h-ou';
        }
        if (sm === 'ou' && pm === 'ou') {
            return !scope || scope === 'ou';
        }
        return false;
    }

    function parsePageSide(side) {
        const s = String(side || '').toLowerCase();
        const amp = s.indexOf('&');
        if (amp >= 0) return s.slice(amp + 1);
        return s;
    }

    function pageMarketForStrategy(market) {
        const m = String(market || '').toLowerCase();
        if (m === 'aou') return 'a-ou';
        if (m === 'hou') return 'h-ou';
        return m;
    }

    function pageMarketsForStrategy(market) {
        const m = String(market || '').toLowerCase();
        if (m === 'aou') return ['a-ou', 'ou', 'aou'];
        if (m === 'hou') return ['h-ou', 'ou', 'hou'];
        if (m === 'ou') return ['ou'];
        const pm = pageMarketForStrategy(market);
        return pm ? [pm] : [];
    }

    function canonicalPlateLine(text, market) {
        const m = String(market || '').toLowerCase();
        if (m === '1x2' || m === 'ad') return '0';

        let s = stripOuPrefix(text).trim();
        const split = s.match(/^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
        if (split) {
            const head = split[1];
            const sign = head.startsWith('-') ? '-' : (head.startsWith('+') ? '+' : '');
            const a = head.replace(/^[+-]/, '');
            return sign + a + '/' + split[2];
        }
        const n = parseFloat(s);
        if (!isNaN(n)) return String(n);
        return s;
    }

    function extractButtonLineOdds(btn) {
        let lineText = '';
        const lineRoot = btn.querySelector('[data-testid="undefined-scale-content"]')
            || btn.querySelector('[data-testid*="scale-content"]');
        if (lineRoot) lineText = (lineRoot.textContent || '').trim();
        if (!lineText) {
            const spans = btn.querySelectorAll('span');
            for (let i = 0; i < spans.length; i++) {
                const t = (spans[i].textContent || '').trim();
                if (!t) continue;
                if (/^[OU大小]\s*[\d.+-/]/i.test(t)) {
                    lineText = t;
                    break;
                }
            }
        }
        const oddsEl = btn.querySelector('span.font-semibold')
            || btn.querySelector('span.text-text-2')
            || btn.querySelector('span');
        const oddsText = oddsEl ? parseOddsText(oddsEl.textContent || '') : '';
        const odds = parseFloat(oddsText);
        return {
            lineText: lineText,
            oddsText: oddsText,
            odds: isNaN(odds) ? NaN : odds,
        };
    }

    function normalizeLine(val) {
        if (val == null || val === '') return '0';
        const s = String(val).trim();
        const n = parseFloat(s);
        if (!isNaN(n)) return String(n);
        return s;
    }

    function linesMatch(a, b) {
        const na = normalizeLine(a);
        const nb = normalizeLine(b);
        if (na === nb) return true;
        const fa = parseFloat(na);
        const fb = parseFloat(nb);
        return !isNaN(fa) && !isNaN(fb) && Math.abs(fa - fb) < 0.001;
    }

    function parseOddsBtnTestid(testid) {
        const raw = String(testid || '');
        const body = raw.replace(/^oddsBtn-/i, '');
        const parts = body.split('|');
        if (parts.length < 5) return null;
        return {
            bookId: parts[0],
            matchId: parts[1],
            market: parts[2],
            side: parts[3],
            lineIndex: parts[4],
            testid: raw,
        };
    }

    function formatStrategyShort(item) {
        return formatStrategyPlateDesc(item);
    }

    function strategyLineMatches(strategy, displayLine, market, lineIndex) {
        const m = String(market || '').toLowerCase();
        if (m === '1x2' || m === 'ad' || m === 'btts') return true;

        const strategyLine = strategy.plateOnK;
        if (strategyLine == null || strategyLine === '') {
            return String(lineIndex) === '0';
        }

        const cs = canonicalPlateLine(strategyLine, m);
        const cd = canonicalPlateLine(displayLine, m);
        if (cs === cd) return true;
        return linesMatch(cs, cd);
    }

    function strategyMatchesButton(strategy, parsed, displayLine, btn) {
        if (String(parsed.matchId) !== String(matchId)) return false;
        if (!marketsMatch(strategy.market, parsed.market, btn)) return false;
        const side = String(strategy.plateOn || '').toLowerCase();
        if (side !== parsePageSide(parsed.side)) return false;
        return strategyLineMatches(strategy, displayLine, parsed.market, parsed.lineIndex);
    }

    function snapshotOddsButtons(targetMap) {
        const buttons = queryOddsButtons();
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const testid = btn.dataset.testid || '';
            if (!testid) continue;
            targetMap.set(testid, btn);
        }
    }

    function resolveLiveButton(testid) {
        if (!testid) return null;
        const buttons = queryOddsButtons();
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (btn.dataset.testid === testid && !btn.disabled) return btn;
        }
        return null;
    }

    async function ensureButtonVisible(option) {
        if (!option || !option.strategy) return resolveLiveButton(option.testid);
        const markets = pageMarketsForStrategy(option.strategy.market);
        for (let i = 0; i < markets.length; i++) {
            const el = findStrategyMarketElement(markets[i]);
            if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        await humanDelay(400, 700);
        snapshotOddsButtons(lastButtonSnapshot);
        return resolveLiveButton(option.testid);
    }

    function truncatePanelText(text, max) {
        const s = String(text || '');
        const limit = max || PANEL_TEXT_MAX;
        if (s.length <= limit) return s;
        return s.slice(0, Math.max(0, limit - 1)) + '…';
    }

    function buildUnmatchedHint() {
        const pending = strategyStates.filter(function (st) {
            return st.execStatus === 'pending';
        });
        if (!pending.length) return '';
        const first = pending[0];
        const s = first.strategy;
        if (!s) return '';
        if (first.plateMatched && !first.oddsMatched) {
            const line = truncatePanelText(first.displayLine || '—', 20);
            return line + ' ' + formatOddsDisplay(first.currentOdds) +
                '<' + formatOddsDisplay(s.plateOddsHit);
        }
        const found = [];
        const buttons = Array.from(lastButtonSnapshot.values());
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (btn.disabled) continue;
            const parsed = parseOddsBtnTestid(btn.dataset.testid || '');
            if (!parsed) continue;
            if (!marketsMatch(s.market, parsed.market, btn)) continue;
            if (String(s.plateOn || '').toLowerCase() !== parsePageSide(parsed.side)) continue;
            const ex = extractButtonLineOdds(btn);
            found.push((ex.lineText || '?') + '@' + formatOddsDisplay(ex.odds));
        }
        const label = formatStrategyPlateDesc(s);
        if (!found.length) return label + '：未找到盘口';
        const shown = found.slice(0, 3);
        let tail = shown.join('，');
        if (found.length > 3) tail += ' 等' + found.length + '个';
        return label + '：' + tail;
    }

    function scanStatusSummary() {
        const total = strategyList.length;
        const actionable = strategyStates.filter(function (st) { return st.actionable; }).length;
        const matched = strategyStates.filter(function (st) { return st.plateMatched; }).length;
        const view = lastScanViewMode || getActiveMarketViewLabel();
        return view + ' · ' + lastScanButtonCount + '钮 · 匹' + matched + '/' + total +
            ' · 可下' + actionable;
    }

    function scanStatusFull() {
        let text = scanStatusSummary();
        if (!strategyStates.some(function (st) { return st.actionable; }) && strategyList.length) {
            const hint = buildUnmatchedHint();
            if (hint) text += ' · ' + hint;
        }
        if (lastScanError) text += ' · ' + lastScanError;
        return text;
    }

    function scanStatusText() {
        return scanStatusFull();
    }

    function findStrategyMarketElement(pageMarket) {
        const pm = String(pageMarket || '');
        if (!pm) return null;
        return document.querySelector('[data-testid="MarketTableColTwoContainer-' + pm + '"]')
            || document.querySelector('[data-testid*="MarketTableColTwoContainer-' + pm + '"]')
            || document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-' + pm + '"]')
            || document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-' + pm + '_group-grouped"]')
            || document.querySelector('[data-testid*="ExhaustiveMarketCardWrapper-' + pm + '"]');
    }

    async function ensureStrategyMarketsVisible() {
        const seen = {};
        const toScroll = [];
        for (let i = 0; i < strategyList.length; i++) {
            const markets = pageMarketsForStrategy(strategyList[i].market);
            for (let m = 0; m < markets.length; m++) {
                const pm = markets[m];
                if (!pm || seen[pm]) continue;
                seen[pm] = true;
                const el = findStrategyMarketElement(pm);
                if (el) toScroll.push(el);
            }
        }
        for (let j = 0; j < toScroll.length; j++) {
            toScroll[j].scrollIntoView({ block: 'center', behavior: 'auto' });
            await humanDelay(200, 400);
        }
        if (toScroll.length) {
            await humanDelay(450, 800);
        }
    }

    async function scanStrategyStatesWithRetry() {
        await ensureMarketView();
        const buttonMap = new Map();
        snapshotOddsButtons(buttonMap);

        for (let round = 0; round < 5; round++) {
            strategyStates = evaluateStrategyStatesFromMap(buttonMap);
            const pendingUnmatched = strategyStates.filter(function (st) {
                return st.execStatus === 'pending' && !st.plateMatched;
            });
            if (!pendingUnmatched.length) break;

            for (let i = 0; i < pendingUnmatched.length; i++) {
                const markets = pageMarketsForStrategy(pendingUnmatched[i].strategy.market);
                for (let m = 0; m < markets.length; m++) {
                    const el = findStrategyMarketElement(markets[m]);
                    if (el) {
                        el.scrollIntoView({ block: 'center', behavior: 'auto' });
                        await humanDelay(300, 500);
                        snapshotOddsButtons(buttonMap);
                    }
                }
            }
            await humanDelay(500, 800);
            snapshotOddsButtons(buttonMap);
            strategyStates = evaluateStrategyStatesFromMap(buttonMap);
        }

        lastButtonSnapshot = buttonMap;
        lastScanButtonCount = buttonMap.size;
        strategyStates = evaluateStrategyStatesFromMap(buttonMap);
        return strategyStates;
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

    function isStrategyActionable(item) {
        return getStrategyExecStatus(item) === 'pending';
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

    function buildTargetOption(state) {
        return {
            testid: state.testid,
            strategy: state.strategy,
            side: state.side,
            market: state.market,
            lineIndex: state.lineIndex,
            displayLine: state.displayLine,
            label: formatStrategyShort(state.strategy),
            minOdds: Number(state.strategy.plateOddsHit),
            odds: String(state.currentOdds),
            button: state.button,
        };
    }

    function evaluateStrategyStatesFromMap(buttonMap) {
        const buttons = Array.from(buttonMap.values());
        const states = [];

        for (let s = 0; s < strategyList.length; s++) {
            const strategy = strategyList[s];
            const minOdds = Number(strategy.plateOddsHit);
            const state = {
                strategy: strategy,
                execStatus: getStrategyExecStatus(strategy),
                plateMatched: false,
                oddsMatched: false,
                hit: false,
                actionable: false,
                currentOdds: null,
                displayLine: '',
                button: null,
                testid: '',
                side: '',
                market: '',
                lineIndex: '',
            };

            if (isNaN(minOdds)) {
                states.push(state);
                continue;
            }

            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                if (btn.disabled) continue;
                const testid = btn.dataset.testid || '';
                const parsed = parseOddsBtnTestid(testid);
                if (!parsed) continue;

                const extracted = extractButtonLineOdds(btn);
                if (!strategyMatchesButton(strategy, parsed, extracted.lineText, btn)) continue;

                state.plateMatched = true;
                state.displayLine = extracted.lineText;
                state.currentOdds = extracted.odds;
                state.button = btn;
                state.testid = testid;
                state.side = parsed.side;
                state.market = parsed.market;
                state.lineIndex = parsed.lineIndex;
                if (!isNaN(extracted.odds) && extracted.odds >= minOdds) {
                    state.oddsMatched = true;
                    state.hit = true;
                    state.actionable = state.execStatus === 'pending';
                }
                break;
            }
            states.push(state);
        }
        return states;
    }

    function evaluateStrategyStates() {
        return evaluateStrategyStatesFromMap(lastButtonSnapshot);
    }

    function strategyHitRenderKey() {
        return strategyStates.map(function (st) {
            return [
                st.execStatus || 'pending',
                st.actionable ? '1' : '0',
                st.hit ? '1' : '0',
                st.plateMatched ? '1' : '0',
                st.displayLine || '',
                st.currentOdds != null ? String(st.currentOdds) : '',
            ].join(':');
        }).join(';');
    }

    function findStrategyMatch() {
        for (let i = 0; i < strategyStates.length; i++) {
            if (strategyStates[i].actionable) return buildTargetOption(strategyStates[i]);
        }
        return null;
    }

    async function refreshTargetOption(force) {
        const now = Date.now();
        const hasPending = strategyList.some(function (item) {
            return isStrategyActionable(item);
        });
        const scanGap = hasPending && !targetOption ? MATCH_SCAN_PENDING_MS : MATCH_SCAN_MS;
        if (!force && now - lastMatchScanAt < scanGap) return targetOption;

        lastScanError = '';
        try {
            await ensureMarketView();
            await waitForOddsButtons(1, 15000);
            await ensureStrategyMarketsVisible();
            lastMatchScanAt = now;
            lastScanViewMode = getActiveMarketViewLabel();
            await scanStrategyStatesWithRetry();
            targetOption = findStrategyMatch();
            if (!placing && betResult !== 'placing') {
                if (targetOption) {
                    betStep = '已命中 ' + targetOption.label + ' @' + formatOddsDisplay(targetOption.odds);
                } else if (strategyList.length) {
                    betStep = '等待策略盘口与赔率达标';
                }
            }
        } catch (err) {
            lastScanError = err && err.message ? err.message : '扫描失败';
            if (!placing && betResult !== 'placing') {
                betStep = '扫描异常';
            }
        }
        return targetOption;
    }

    async function waitForStrategyMatch(timeoutMs) {
        const deadline = Date.now() + (timeoutMs || 60000);
        while (Date.now() < deadline) {
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return null;
            }
            if (isMatchEndedModalVisible()) {
                await handleMatchEnded();
                return null;
            }
            await ensureMarketView();
            const option = await refreshTargetOption(true);
            if (option) return option;
            await sleep(1500);
        }
        return null;
    }

    function isPageReady() {
        return !!document.querySelector(PAGE_READY_SEL);
    }

    function matchPageUrl() {
        return inplayMatchUrl(matchId);
    }

    const MATCH_PHASE_LABEL = {
        NOT_STARTED: '未开始',
        IN_PLAY: '进行中',
        ENDED: '已结束',
        FINISHED: '已结束',
        POSTPONED: '延期',
        CANCELLED: '取消',
    };
    const MATCH_STATUS = {
        NOT_STARTED: 0,
        IN_PLAY: 1,
        ENDED: 3,
    };

    function getMatchStatusValue(item) {
        if (!item) return null;
        if (item.status != null && item.status !== '') return item.status;
        if (item.matchStatus != null && item.matchStatus !== '') return item.matchStatus;
        return null;
    }

    function isCurrentMatchItem(item) {
        return item && String(item.matchId) === String(matchId);
    }

    function isOnInplayMatchPage() {
        return /\/sportEvents\/inplay\/football\/match\/\d+/i.test(window.location.pathname);
    }

    function phaseFromMatchStatus(status) {
        if (status == null || status === '') return '';
        const n = Number(status);
        if (n === MATCH_STATUS.NOT_STARTED) return 'NOT_STARTED';
        if (n === MATCH_STATUS.IN_PLAY) return 'IN_PLAY';
        if (n === MATCH_STATUS.ENDED) return 'ENDED';
        return '';
    }

    function isCurrentPageLive() {
        if (!isOnInplayMatchPage()) return false;
        if (isMatchEndedModalVisible()) return false;
        return isPageReady();
    }

    function resolveMatchPhase(item) {
        if (!item) return '';
        if (isCurrentMatchItem(item)) {
            if (isMatchEndedModalVisible()) return 'ENDED';
            if (isCurrentPageLive()) return 'IN_PLAY';
        }
        const statusVal = getMatchStatusValue(item);
        const fromStatus = phaseFromMatchStatus(statusVal);
        if (fromStatus) return fromStatus;
        const phase = String(item.matchPhase || '').toUpperCase();
        if (isCurrentMatchItem(item) && isPageReady() && !isMatchEndedModalVisible()) {
            if (phase === 'ENDED' || phase === 'FINISHED') return 'IN_PLAY';
        }
        return item.matchPhase || '';
    }

    function isMatchEndedPhase(item) {
        if (!item) return false;
        if (isCurrentMatchItem(item)) {
            if (isMatchEndedModalVisible()) return true;
            if (isCurrentPageLive()) return false;
            const statusVal = getMatchStatusValue(item);
            if (statusVal != null && statusVal !== '') {
                return Number(statusVal) === MATCH_STATUS.ENDED;
            }
            return false;
        }
        const statusVal = getMatchStatusValue(item);
        if (statusVal != null && statusVal !== '') {
            return Number(statusVal) === MATCH_STATUS.ENDED;
        }
        const phase = String(resolveMatchPhase(item) || '').toUpperCase();
        return phase === 'ENDED' || phase === 'FINISHED' || phase === 'CANCELLED';
    }

    function renderMatchListRow(item, idx) {
        const id = item.matchId || '';
        const isPage = String(id) === String(matchId);
        const score = item.finalScore != null && item.finalScore !== ''
            ? ' · 比分 ' + item.finalScore
            : '';
        let rowClass = 'tm-hty-match-item';
        if (isPage) rowClass += ' tm-hty-match-page';
        if (isMatchEndedPhase(item)) rowClass += ' tm-hty-match-ended';
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
        const inplayReady = resolveMatchPhase(item) === 'IN_PLAY';
        let mainHtml;
        if (inplayReady) {
            mainHtml = '<a class="tm-hty-match-main" href="' + inplayMatchUrl(id) + '" title="跳转滚球页">' + pickText + '</a>';
        } else if (isMatchEndedPhase(item)) {
            mainHtml = '<span class="tm-hty-match-pick" title="比赛已结束">' + pickText + '</span>';
        } else {
            mainHtml = '<span class="tm-hty-match-pick" title="比赛尚未开始，滚球页暂不可进">' + pickText + '</span>';
        }
        return '<div class="' + rowClass + '">' +
            '<span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span>' +
            mainHtml +
            traceLink +
            pageBadge +
            '</div>';
    }

    function inplayMatchUrl(id) {
        return window.location.origin + '/sportEvents/inplay/football/match/' + id + '?type=market';
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
        const apiPhase = String(item.matchPhase || '').toUpperCase();
        const resolved = resolveMatchPhase(item);
        const phaseHint = (isCurrentMatchItem(item) && (apiPhase === 'ENDED' || apiPhase === 'FINISHED') &&
            resolved === 'IN_PLAY') ? '(页)' : '';
        const rules = item.ruleCount != null ? item.ruleCount + '条策略' : '';
        const tour = shortTournamentName(item.tournamentName);
        const parts = [];
        if (kick) parts.push(kick);
        if (tour) parts.push(tour);
        parts.push(home + 'vs' + away);
        parts.push(phase + phaseHint);
        if (rules) parts.push(rules);
        return parts.join('  ');
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

    function activeMatchesRenderKey() {
        if (matchesStatus === 'err') return 'err|' + matchesError;
        const rows = activeMatches.map(function (item) {
            return [
                item.matchId || '',
                item.kickoffTime || '',
                getMatchStatusValue(item) != null ? String(getMatchStatusValue(item)) : (item.matchPhase || ''),
                item.ruleCount != null ? String(item.ruleCount) : '',
                item.homeName || '',
                item.awayName || '',
                item.finalScore != null ? String(item.finalScore) : '',
            ].join(':');
        }).join(';');
        return matchesStatus + '|' + matchId + '|' + activeMatches.length + '|' + rows +
            '|' + (isCurrentPageLive() ? 'live' : 'idle') + '|' + lastScanButtonCount;
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
        if (matchesStatus === 'ok') {
            void maybeAutoNavigateToInplay();
        }
    }

    function renderActiveMatches(panel) {
        if (!panel) return;
        const statusEl = panel.querySelector('.tm-hty-matches-status');
        const listEl = panel.querySelector('.tm-hty-matches-list');
        const endedSection = panel.querySelector('.tm-hty-matches-ended');
        const endedToggle = panel.querySelector('.tm-hty-ended-toggle');
        const endedListEl = panel.querySelector('.tm-hty-matches-ended-list');
        if (!statusEl || !listEl) return;

        const listKey = activeMatchesRenderKey();
        if (listKey === lastMatchesListKey) return;
        lastMatchesListKey = listKey;

        if (matchesStatus === 'loading' && !activeMatches.length) {
            statusEl.textContent = '加载中…';
            statusEl.dataset.kind = 'info';
            listEl.innerHTML = '';
            if (endedSection) endedSection.style.display = 'none';
            return;
        }
        if (matchesStatus === 'err') {
            statusEl.textContent = matchesError || '加载失败';
            statusEl.dataset.kind = 'err';
            if (!activeMatches.length) {
                listEl.innerHTML = '';
                if (endedSection) endedSection.style.display = 'none';
            }
            return;
        }

        const liveMatches = activeMatches.filter(function (item) {
            return !isMatchEndedPhase(item);
        });
        const endedMatches = activeMatches.filter(function (item) {
            return isMatchEndedPhase(item);
        });

        const currentHit = activeMatches.some(function (item) {
            return String(item.matchId) === String(matchId);
        });
        let statusText = liveMatches.length + ' 场';
        if (endedMatches.length) statusText += ' · ' + endedMatches.length + ' 已结束';
        if (currentHit) statusText += ' · 含当前页';
        statusEl.textContent = statusText;
        statusEl.dataset.kind = currentHit ? 'ready' : 'info';

        if (!liveMatches.length && !endedMatches.length) {
            listEl.innerHTML = '<div class="tm-hty-strategy-empty">暂无策略赛事</div>';
            if (endedSection) endedSection.style.display = 'none';
            return;
        }

        if (!liveMatches.length) {
            listEl.innerHTML = '<div class="tm-hty-strategy-empty">暂无进行中/未开赛赛事</div>';
        } else {
            listEl.innerHTML = liveMatches.map(function (item, idx) {
                return renderMatchListRow(item, idx);
            }).join('');
        }

        if (endedSection && endedToggle && endedListEl) {
            if (!endedMatches.length) {
                endedSection.style.display = 'none';
            } else {
                endedSection.style.display = '';
                endedSection.dataset.collapsed = endedMatchesCollapsed ? '1' : '0';
                endedToggle.textContent = '已结束 (' + endedMatches.length + ') ' +
                    (endedMatchesCollapsed ? '▸' : '▾');
                endedListEl.style.display = endedMatchesCollapsed ? 'none' : '';
                endedListEl.innerHTML = endedMatches.map(function (item, idx) {
                    return renderMatchListRow(item, idx);
                }).join('');
            }
        }
    }

    function toggleEndedMatchesCollapsed(panel) {
        endedMatchesCollapsed = !endedMatchesCollapsed;
        const root = panel || document.getElementById(PANEL_ID);
        if (!root) return;
        const endedSection = root.querySelector('.tm-hty-matches-ended');
        const endedToggle = root.querySelector('.tm-hty-ended-toggle');
        const endedListEl = root.querySelector('.tm-hty-matches-ended-list');
        if (!endedSection || !endedToggle || !endedListEl) return;
        endedSection.dataset.collapsed = endedMatchesCollapsed ? '1' : '0';
        endedToggle.textContent = endedToggle.textContent.replace(/[▸▾]$/, endedMatchesCollapsed ? '▸' : '▾');
        endedListEl.style.display = endedMatchesCollapsed ? 'none' : '';
    }

    function getCurrentMatchItem() {
        return activeMatches.find(function (item) {
            return String(item.matchId) === String(matchId);
        }) || null;
    }

    function countMatchesByPhase(phase) {
        return activeMatches.filter(function (item) {
            return resolveMatchPhase(item) === phase;
        }).length;
    }

    function pickInplayNavigableMatch(excludeId) {
        const candidates = activeMatches.filter(function (item) {
            if (resolveMatchPhase(item) !== 'IN_PLAY') return false;
            if (!item.matchId) return false;
            if (excludeId && String(item.matchId) === String(excludeId)) return false;
            return true;
        });
        if (!candidates.length) return '';
        candidates.sort(function (a, b) {
            return String(a.kickoffTime || '').localeCompare(String(b.kickoffTime || ''));
        });
        return String(candidates[0].matchId);
    }

    function buildWaitingKickoffMessage() {
        const inplayCount = countMatchesByPhase('IN_PLAY');
        const waitingCount = countMatchesByPhase('NOT_STARTED');
        if (inplayCount > 0) return '';
        if (waitingCount > 0) return '等待比赛开始（' + waitingCount + ' 场未开赛）';
        if (activeMatches.length > 0) return '暂无进行中的滚球赛事';
        return '暂无策略赛事';
    }

    function setWaitingKickoffState() {
        const msg = buildWaitingKickoffMessage();
        setBetStep(msg);
        setBetResult('pending', '等待滚球开赛');
        renderPanel(true);
        if (!pollTimer) schedulePoll();
    }

    async function navigateToInplayMatch(targetId, reason) {
        if (!targetId || String(targetId) === String(matchId)) return false;
        const item = activeMatches.find(function (m) {
            return String(m.matchId) === String(targetId);
        });
        const label = item ? formatActiveMatchItem(item) : ('#' + targetId);
        lastInplayNavAt = Date.now();
        setBetStep((reason || '跳转滚球页') + '：' + label);
        renderPanel(true);
        console.log('[hty-inplay] 跳转滚球页', targetId, reason || '');
        window.location.href = inplayMatchUrl(targetId);
        return true;
    }

    async function maybeAutoNavigateToInplay() {
        if (placing || matchEndedHandling) return false;
        if (Date.now() - lastInplayNavAt < INPLAY_NAV_COOLDOWN_MS) return false;

        const currentItem = getCurrentMatchItem();
        const currentInplay = isCurrentPageLive() ||
            (currentItem && resolveMatchPhase(currentItem) === 'IN_PLAY');
        const endedModal = isMatchEndedModalVisible();

        if (!endedModal && currentInplay && isPageReady()) return false;

        const excludeId = endedModal ? matchId : '';
        const targetId = pickInplayNavigableMatch(excludeId);
        if (!targetId) {
            if (endedModal || !currentInplay || !isPageReady()) {
                setWaitingKickoffState();
            }
            return false;
        }

        const reason = endedModal
            ? '赛事已结束，切换进行中'
            : (currentInplay ? '切换到进行中' : '比赛已开始，进入滚球');
        return navigateToInplayMatch(targetId, reason);
    }

    function scheduleInplayMatchWatch() {
        if (inplayWatchTimer) return;
        inplayWatchTimer = setInterval(function () {
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            if (isMatchEndedModalVisible()) {
                handleMatchEnded().catch(function (e) {
                    console.error('[hty-inplay] handleMatchEnded', e);
                });
                return;
            }
            loadActiveMatches(true);
        }, INPLAY_MATCH_WATCH_MS);
    }

    function onMatchRouteChange(newId) {
        if (!newId || newId === matchId) return;
        matchId = newId;
        lastMatchesListKey = '';
        lastStrategyListKey = '';
        lastStrategyHitKey = '';
        lastPanelKey = '';
        targetOption = null;
        strategyList = [];
        strategyTrigger = '';
        lastMatchScanAt = 0;
        loadActiveMatches(true);
        loadStrategies(false);
    }

    function checkUrlChange() {
        const href = window.location.href;
        if (href === lastWatchedUrl) return;
        lastWatchedUrl = href;
        const newId = getMatchIdFromUrl();
        if (newId) {
            onMatchRouteChange(newId);
            return;
        }
        if (isInplayListPage()) {
            const phase = sessionStorage.getItem(KEEPALIVE_PHASE_KEY) || '';
            if (phase === 'via-football' || phase === 'enter-match') {
                sessionStorage.setItem(KEEPALIVE_PHASE_KEY, 'enter-match');
                bootListPageEnterMatch();
            }
        }
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

    function isIdleLoginModalVisible() {
        if (!document.body) return false;
        const text = document.body.innerText || '';
        return text.indexOf(IDLE_LOGIN_HINT) >= 0 && text.indexOf('重新登录') >= 0;
    }

    function findModalConfirmButton(blockHints) {
        const nodes = document.querySelectorAll('button, [role="button"], a');
        for (let i = 0; i < nodes.length; i++) {
            const btn = nodes[i];
            if (!isElementVisible(btn)) continue;
            const label = (btn.textContent || '').replace(/\s+/g, '');
            if (label !== '确定') continue;
            let parent = btn;
            for (let depth = 0; depth < 12 && parent; depth++) {
                const block = parent.textContent || '';
                let matched = true;
                for (let h = 0; h < blockHints.length; h++) {
                    if (block.indexOf(blockHints[h]) < 0) {
                        matched = false;
                        break;
                    }
                }
                if (matched) return btn;
                parent = parent.parentElement;
            }
        }
        return null;
    }

    function findMatchEndedConfirmButton() {
        return findModalConfirmButton([MATCH_ENDED_HINT]) ||
            findModalConfirmButton(['温馨提示', '当前无法进入']);
    }

    function dismissIdleLoginModal() {
        if (!isIdleLoginModalVisible()) return false;
        const btn = findModalConfirmButton(['温馨提示', IDLE_LOGIN_HINT]) ||
            findModalConfirmButton([IDLE_LOGIN_HINT, '重新登录']);
        if (btn) safeClick(btn);
        loginCache = { value: false, ts: 0 };
        setBetStep('会话闲置已过期，尝试自动登录…');
        setBetResult('pending', '等待登录');
        renderPanel(true);
        console.warn('[hty-inplay] 检测到闲置登出弹窗');
        setTimeout(function () {
            tryAutoRelogin().catch(function (e) {
                console.warn('[hty-inplay] 闲置后自动登录', e);
            });
        }, 800);
        return true;
    }

    function isMatchEndedModalVisible() {
        if (!document.body) return false;
        const text = document.body.innerText || '';
        return text.indexOf(MATCH_ENDED_HINT) >= 0 ||
            (text.indexOf('温馨提示') >= 0 && text.indexOf('当前无法进入') >= 0);
    }

    function pickNextActiveMatch() {
        return pickInplayNavigableMatch(matchId);
    }

    async function handleMatchEnded() {
        if (matchEndedHandling || placing) return false;
        if (Date.now() - lastEndedSwitchAt < MATCH_ENDED_SWITCH_COOLDOWN_MS) return false;
        if (!isMatchEndedModalVisible()) return false;

        matchEndedHandling = true;
        try {
            console.log('[hty-inplay] 检测到赛事已结束弹窗');
            setBetResult('pending', '当前赛事已结束');
            setBetStep('赛事已结束，准备切换…');
            renderPanel(true);

            const confirmBtn = findMatchEndedConfirmButton();
            if (confirmBtn) {
                safeClick(confirmBtn);
                await humanDelay(400, 800);
            }

            try {
                await loadActiveMatches(true);
            } catch (e) {
                console.warn('[hty-inplay] 刷新策略赛事失败', e);
            }

            const nextId = pickNextActiveMatch();
            lastEndedSwitchAt = Date.now();
            if (!nextId) {
                setWaitingKickoffState();
                return true;
            }

            await navigateToInplayMatch(nextId, '赛事已结束，切换进行中');
            return true;
        } finally {
            matchEndedHandling = false;
        }
    }

    function setupMatchEndedWatcher() {
        if (matchEndedWatchTimer) return;
        function checkEnded() {
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            if (!isMatchEndedModalVisible()) return;
            handleMatchEnded().catch(function (e) {
                console.error('[hty-inplay] handleMatchEnded', e);
            });
        }
        matchEndedWatchTimer = setInterval(checkEnded, 2000);
        if (document.body) {
            const observer = new MutationObserver(checkEnded);
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                if (!document.body) return;
                const observer = new MutationObserver(checkEnded);
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
    }

    function isElementVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (!rect.width && !rect.height) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    }

    function isLoggedIn() {
        const now = Date.now();
        if (now - loginCache.ts < LOGIN_CACHE_MS) return loginCache.value;

        let result = false;
        if (!/\/login/i.test(window.location.pathname)) {
            const positiveSelectors = [
                '[data-testid="balance-text"]',
                '[data-testid="liquid-glass-button-user-now-balance-btn"]',
                '[data-testid="sport-cart-float-btn"]',
                '[data-testid="HeaderUserBalance"]',
            ];
            for (let i = 0; i < positiveSelectors.length; i++) {
                const el = document.querySelector(positiveSelectors[i]);
                if (isElementVisible(el)) {
                    result = true;
                    break;
                }
            }
            if (!result) {
                const loginBtn = document.querySelector('[data-testid="liquid-glass-button-login-btn"]');
                const registerBtn = document.querySelector('[data-testid="liquid-glass-button-register-btn"]');
                if (!isElementVisible(loginBtn) && !isElementVisible(registerBtn) && document.querySelector(PAGE_READY_SEL)) {
                    result = true;
                }
            }
        }

        loginCache = { value: result, ts: now };
        return result;
    }

    function setReloginStatus(msg) {
        console.log('[hty-inplay] ' + msg);
        if (!matchId) return;
        setBetStep(msg);
        renderPanel(true);
    }

    function setNativeInputValue(input, value) {
        if (!input) return;
        const proto = input.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function isSimplePasswordModalVisible() {
        if (!document.body) return false;
        const text = document.body.innerText || '';
        return text.indexOf('简易密码') >= 0 || text.indexOf('四位数字') >= 0;
    }

    function findSimplePasswordModalRoot() {
        const nodes = document.querySelectorAll('[role="dialog"], dialog, section, div');
        let best = null;
        let bestLen = Infinity;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!isElementVisible(node)) continue;
            const text = node.textContent || '';
            if (text.indexOf('简易密码') < 0 && text.indexOf('四位数字') < 0) continue;
            const len = text.length;
            if (len < bestLen) {
                best = node;
                bestLen = len;
            }
        }
        return best;
    }

    function findHeaderLoginButton() {
        const testBtn = document.querySelector('[data-testid="liquid-glass-button-login-btn"]');
        if (testBtn && isElementVisible(testBtn)) return testBtn;
        const nodes = document.querySelectorAll('button, [role="button"], a');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label === '登录') return el;
        }
        return null;
    }

    function findSimplePasswordInputs() {
        const root = findSimplePasswordModalRoot();
        if (!root) return [];
        const inputs = root.querySelectorAll('input:not([type="hidden"])');
        const visible = [];
        for (let i = 0; i < inputs.length; i++) {
            if (isElementVisible(inputs[i])) visible.push(inputs[i]);
        }
        return visible;
    }

    function findDigitButtonIn(root, digit) {
        if (!root) return null;
        const nodes = root.querySelectorAll('button, [role="button"], div, span');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label === String(digit)) return el;
        }
        return null;
    }

    async function fillSimplePassword(pin) {
        const digits = String(pin || '').replace(/\D/g, '').slice(0, 4);
        if (digits.length !== 4) return false;
        const inputs = findSimplePasswordInputs();
        if (inputs.length === 1) {
            setNativeInputValue(inputs[0], digits);
            await humanDelay(120, 260);
            return true;
        }
        if (inputs.length >= 4) {
            for (let i = 0; i < 4; i++) {
                const input = inputs[i];
                input.focus();
                setNativeInputValue(input, digits.charAt(i));
                await humanDelay(80, 180);
            }
            return true;
        }
        const modal = findSimplePasswordModalRoot();
        if (!modal) return false;
        for (let i = 0; i < 4; i++) {
            const btn = findDigitButtonIn(modal, digits.charAt(i));
            if (!btn) return false;
            safeClick(btn);
            await humanDelay(100, 220);
        }
        return true;
    }

    function findSimplePasswordSubmitButton() {
        const root = findSimplePasswordModalRoot();
        if (root) {
            const buttons = root.querySelectorAll('button, [role="button"], a');
            let fallback = null;
            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                if (!isElementVisible(btn)) continue;
                const label = (btn.textContent || '').replace(/\s+/g, '');
                if (label === '确定' || label === '确认' || label === '提交') return btn;
                if (label !== '切换账号' && label !== '注册' && label.length <= 6) fallback = btn;
            }
            if (fallback) return fallback;
        }
        return findModalConfirmButton(['简易密码']) ||
            findModalConfirmButton(['四位数字']) ||
            findModalConfirmButton(['简易密码', '四位']);
    }

    async function tryAutoRelogin(options) {
        const lite = !!(options && options.lite);
        if (reloginInProgress) return false;
        loginCache.ts = 0;
        if (isLoggedIn()) return false;
        if (!lite && placing) return false;
        if (Date.now() - lastReloginAttemptAt < RELOGIN_COOLDOWN_MS) return false;

        reloginInProgress = true;
        lastReloginAttemptAt = Date.now();
        try {
            if (isIdleLoginModalVisible()) {
                if (lite) {
                    const nodes = document.querySelectorAll('button, [role="button"]');
                    for (let i = 0; i < nodes.length; i++) {
                        const label = (nodes[i].textContent || '').replace(/\s+/g, '');
                        if (label === '确定') {
                            nodes[i].click();
                            break;
                        }
                    }
                } else {
                    dismissIdleLoginModal();
                }
                await humanDelay(500, 900);
                loginCache.ts = 0;
            }

            if (!isSimplePasswordModalVisible()) {
                const loginBtn = findHeaderLoginButton();
                if (!loginBtn) {
                    console.warn('[hty-inplay] 未找到登录按钮');
                    return false;
                }
                setReloginStatus('自动登录：点击登录…');
                safeClick(loginBtn);
                try {
                    await waitFor(isSimplePasswordModalVisible, 10000, 400);
                } catch (e) {
                    console.warn('[hty-inplay] 等待简易密码弹窗超时');
                    return false;
                }
            }

            setReloginStatus('自动登录：输入简易密码…');
            if (!(await fillSimplePassword(SIMPLE_LOGIN_PIN))) {
                console.warn('[hty-inplay] 简易密码输入失败');
                setReloginStatus('自动登录：密码输入失败');
                return false;
            }
            await humanDelay(300, 600);

            const submitBtn = findSimplePasswordSubmitButton();
            if (!submitBtn) {
                console.warn('[hty-inplay] 未找到确定按钮');
                setReloginStatus('自动登录：未找到确定按钮');
                return false;
            }
            setReloginStatus('自动登录：确认…');
            safeClick(submitBtn);
            await humanDelay(1500, 2500);

            loginCache.ts = 0;
            if (isLoggedIn()) {
                console.log('[hty-inplay] 自动登录成功');
                setReloginStatus('自动登录成功');
                if (!lite) {
                    betResult = 'pending';
                    schedulePoll();
                }
                return true;
            }
            console.warn('[hty-inplay] 自动登录后仍未检测到登录状态');
            setReloginStatus('自动登录未完成，等待重试');
            return false;
        } finally {
            reloginInProgress = false;
        }
    }

    function scheduleLoginWatch() {
        if (loginWatchTimer) return;
        function tick() {
            loginWatchTimer = setTimeout(tick, SESSION_LOGIN_WATCH_MS);
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            const wasLoggedIn = loginCache.value;
            loginCache.ts = 0;
            const loggedIn = isLoggedIn();
            if (!loggedIn && !reloginInProgress && !placing) {
                tryAutoRelogin().catch(function (e) {
                    console.warn('[hty-inplay] 自动登录', e);
                });
            }
            if (wasLoggedIn && !loggedIn) {
                console.warn('[hty-inplay] 检测到登录已失效');
                htyApiState.headers.authorization = '';
                if (!placing) {
                    betResult = 'pending';
                    setBetStep('登录已失效，请重新登录');
                    renderPanel(true);
                    schedulePoll();
                }
            }
        }
        loginWatchTimer = setTimeout(tick, SESSION_LOGIN_WATCH_MS);
    }

    async function sessionApiKeepAlive() {
        if (!isLoggedIn()) return;
        if (!htyApiState.apiBase || !htyApiState.headers.authorization) return;
        if (Date.now() - htyApiState.lastCaptureAt > SESSION_HEADER_FRESH_MS) return;
        const walletUrl = htyApiState.apiBase.replace(/\/$/, '') + '/platform/payment/wallets/list';
        try {
            await gmPlatformGetText(walletUrl);
            console.log('[hty-inplay] 会话保活 ping 成功');
        } catch (e) {
            console.warn('[hty-inplay] 会话保活 ping 失败', e);
        }
    }

    function getInPlayMatchIds() {
        return activeMatches.filter(function (item) {
            return resolveMatchPhase(item) === 'IN_PLAY' && item.matchId;
        }).map(function (item) {
            return String(item.matchId);
        });
    }

    function storeKeepaliveTarget(item, targetId) {
        sessionStorage.setItem(KEEPALIVE_TARGET_MATCH_ID_KEY, targetId || '');
        sessionStorage.setItem(KEEPALIVE_MATCH_ID_KEY, targetId || matchId || '');
        if (item) {
            sessionStorage.setItem(KEEPALIVE_TARGET_HOME_KEY, item.homeName || '');
            sessionStorage.setItem(KEEPALIVE_TARGET_AWAY_KEY, item.awayName || '');
        }
    }

    async function runKeepaliveViaFootballList(targetId) {
        const targetItem = activeMatches.find(function (m) {
            return String(m.matchId) === String(targetId);
        }) || null;
        storeKeepaliveTarget(targetItem, targetId);
        sessionStorage.setItem(KEEPALIVE_PHASE_KEY, 'via-football');
        setBetStep('保活：点击足球进入列表…');
        renderPanel(true);
        console.log('[hty-inplay] 保活：经足球导航至列表', targetId);
        if (clickSidebarFootball()) {
            setTimeout(function () {
                const phase = sessionStorage.getItem(KEEPALIVE_PHASE_KEY) || '';
                if (phase !== 'via-football' && phase !== 'enter-match') return;
                if (isInplayListPage()) {
                    sessionStorage.setItem(KEEPALIVE_PHASE_KEY, 'enter-match');
                    bootListPageEnterMatch();
                    return;
                }
                console.warn('[hty-inplay] 足球点击未跳转，直接打开列表');
                sessionStorage.setItem(KEEPALIVE_PHASE_KEY, 'enter-match');
                window.location.href = inplayListUrl();
            }, 2500);
            return;
        }
        console.warn('[hty-inplay] 未找到足球入口，直接跳转列表');
        sessionStorage.setItem(KEEPALIVE_PHASE_KEY, 'enter-match');
        window.location.href = inplayListUrl();
    }

    async function runKeepaliveSwitch() {
        try {
            activeMatches = await fetchActiveMatches();
        } catch (e) {
            console.warn('[hty-inplay] 保活刷新赛事失败', e);
        }

        const inplayIds = getInPlayMatchIds();
        if (inplayIds.length >= 2) {
            const nextId = pickInplayNavigableMatch(matchId);
            if (nextId && nextId !== String(matchId)) {
                console.log('[hty-inplay] 保活：多场比赛切换', nextId);
                setBetStep('保活：切换至另一场比赛…');
                renderPanel(true);
                await navigateToInplayMatch(nextId, '保活切换');
            }
            return;
        }

        let targetId = String(matchId || '');
        if (!targetId && inplayIds.length === 1) targetId = inplayIds[0];
        if (!targetId) {
            const any = pickInplayNavigableMatch('');
            if (any) targetId = any;
        }
        await runKeepaliveViaFootballList(targetId);
    }

    function scheduleMatchKeepAlive() {
        if (pageSwitchTimer) return;
        const phase = sessionStorage.getItem(KEEPALIVE_PHASE_KEY);
        if (phase === 'returning' || phase === 'going-list') {
            sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
        }
        pageSwitchTimer = setInterval(function () {
            if (placing || reportSyncing || matchEndedHandling || reloginInProgress) return;
            if (shouldAutoBet()) return;
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            if (isMatchEndedModalVisible()) return;
            runKeepaliveSwitch().catch(function (e) {
                console.warn('[hty-inplay] 保活切换失败', e);
            });
        }, SESSION_KEEPALIVE_MS);
    }

    function scheduleSessionKeepAlive() {
        scheduleMatchKeepAlive();
        setInterval(function () {
            sessionApiKeepAlive().catch(function (e) {
                console.warn('[hty-inplay] session keepalive', e);
            });
        }, SESSION_API_KEEPALIVE_MS);
    }

    function scheduleOddsRescan() {
        if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
        refreshDebounceTimer = setTimeout(async function () {
            refreshDebounceTimer = null;
            if (placing || !strategyList.length) return;
            const prevKey = strategyHitRenderKey();
            const prevTarget = targetOption ? targetOption.testid : '';
            await refreshTargetOption(true);
            if (strategyHitRenderKey() !== prevKey || (targetOption && targetOption.testid !== prevTarget)) {
                renderPanel(true, false);
                if (shouldAutoBet() && isLoggedIn()) {
                    runAutoBet();
                } else if (!pollTimer) {
                    schedulePoll();
                }
            }
        }, 800);
    }

    function setupOddsObserver() {
        if (oddsObserver || !document.body) return;
        oddsObserver = new MutationObserver(function (mutations) {
            for (let i = 0; i < mutations.length; i++) {
                const added = mutations[i].addedNodes;
                for (let j = 0; j < added.length; j++) {
                    const node = added[j];
                    if (node.nodeType !== 1) continue;
                    const el = node;
                    if ((el.matches && (el.matches('button[data-testid^="oddsBtn-"]') || el.matches('button[data-testid*="oddsBtn"]')))
                        || (el.querySelector && el.querySelector('button[data-testid^="oddsBtn-"], button[data-testid*="oddsBtn"]'))) {
                        scheduleOddsRescan();
                        return;
                    }
                }
            }
        });
        oddsObserver.observe(document.body, { childList: true, subtree: true });
    }

    function schedulePeriodicRescan() {
        if (rescanTimer) return;
        rescanTimer = setInterval(async function () {
            if (placing || !isPageReady() || !strategyList.length) return;
            await refreshTargetOption(true);
            renderPanel(true, false);
            if (shouldAutoBet() && isLoggedIn()) {
                runAutoBet();
            }
        }, RESCAN_MS);
    }

    function stopPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function setBetStep(text) {
        betStep = text || '';
        renderPanel();
    }

    function setBetResult(result, detail) {
        betResult = result || 'pending';
        if (detail) betStep = detail;
        renderPanel();
    }

    function resultLabel(loggedIn) {
        if (betResult === 'success') return '投注成功';
        if (betResult === 'failed') return '投注失败';
        if (betResult === 'placing') return '投注中';
        if (betResult === 'skipped') return '已跳过';
        if (betResult === 'stopped') return '已停止';
        if (!loggedIn) return '等待登录';
        if (targetOption && shouldAutoBet()) return '即将自动投注';
        if (targetOption) return '策略已命中';
        if (!strategyList.length) return '等待策略';
        return '等待盘口/赔率';
    }

    function resultKind(loggedIn) {
        if (betResult === 'success') return 'ok';
        if (betResult === 'failed') return 'err';
        if (betResult === 'placing') return 'ing';
        if (betResult === 'skipped' || betResult === 'stopped') return 'warn';
        if (!loggedIn) return 'info';
        if (targetOption && shouldAutoBet()) return 'ready';
        return 'info';
    }

    function upcomingText() {
        if (!strategyList.length) return '等待策略列表加载';
        if (!targetOption) return '尚未命中策略盘口（需盘口+赔率≥阈值）';
        return targetOption.label + ' · 页面盘口 ' + (targetOption.displayLine || '—') +
            ' · 赔率 ' + formatOddsDisplay(targetOption.odds) +
            '（≥' + formatOddsDisplay(targetOption.minOdds) + '）· 测试金额 ' + TEST_STAKE;
    }

    function formatOddsDisplay(val) {
        if (val == null || val === '') return '—';
        const n = Number(val);
        if (isNaN(n)) return String(val);
        return n.toFixed(2);
    }

    function formatStrategyPlateDesc(item) {
        const market = MARKET_LABEL[item.market] || item.market || '—';
        const side = PLATE_ON_LABEL[item.plateOn] || item.plateOn || '';
        const line = item.plateOnK != null && item.plateOnK !== '' ? String(item.plateOnK) : '';
        let desc = market;
        if (side || line) desc += ' ' + side + line;
        return desc;
    }

    function formatStrategyItemHtml(item, state) {
        const odds = formatOddsDisplay(item.plateOddsHit);
        const amount = item.plateAmount != null ? formatOddsDisplay(item.plateAmount) : '—';
        const rate = item.plateAmountRate != null
            ? (Number(item.plateAmountRate) * 100).toFixed(1) + '%'
            : '—';
        let html = '<span class="tm-hty-strategy-exec tm-hty-strategy-exec-' +
            strategyExecKind(item) + '">' + strategyExecLabel(item) + '</span> ' +
            formatStrategyPlateDesc(item) +
            ' · 赔率≥<span class="tm-hty-strategy-odds">' + odds + '</span>' +
            ' · 投注<span class="tm-hty-strategy-amount">$' + amount + '</span>' +
            ' · ' + rate;
        if (state && state.plateMatched && state.currentOdds != null) {
            html += ' · 当前<span class="tm-hty-strategy-odds">' +
                formatOddsDisplay(state.currentOdds) + '</span>';
        }
        return html;
    }

    function updateStrategyRule(recHash, extra) {
        const payload = {
            recHash: recHash,
            ruleMeetIgnore: '2',
            quantFlag: '2',
        };
        if (extra) {
            if (extra.orderno) payload.orderno = extra.orderno;
            if (extra.orderNo) payload.orderNo = extra.orderNo;
            if (extra.betOdds != null) payload.betOdds = extra.betOdds;
            if (extra.betStake != null) payload.betStake = extra.betStake;
            if (extra.matchId) payload.matchId = extra.matchId;
        }
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'PUT',
                url: ALERT_RULE_API,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                timeout: 15000,
                onload: function (res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (String(json.code) !== '200') {
                            reject(new Error(json.msg || '策略状态更新失败'));
                            return;
                        }
                        resolve(json);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function () { reject(new Error('策略状态接口网络错误')); },
                ontimeout: function () { reject(new Error('策略状态接口请求超时')); },
            });
        });
    }

    function markStrategyExecuted(recHash) {
        for (let i = 0; i < strategyList.length; i++) {
            if (strategyList[i].recHash === recHash) {
                strategyList[i].ruleMeetIgnore = '2';
                break;
            }
        }
        lastStrategyListKey = '';
        lastStrategyHitKey = '';
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

    function strategyRenderKey() {
        if (strategyStatus === 'err') {
            return 'err|' + strategyError;
        }
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
        return strategyStatus + '|' + strategyTrigger + '|' + strategyList.length + '|' + rows;
    }

    async function loadStrategies(silent) {
        const isSilent = !!silent;
        void loadActiveMatches(isSilent);
        if (!isSilent && !strategyList.length) {
            strategyStatus = 'loading';
            strategyError = '';
            renderPanel(true);
        }

        try {
            const payload = await fetchAlertStrategies(matchId);
            strategyList = Array.isArray(payload.data) ? payload.data : [];
            strategyTrigger = payload.trigger != null ? String(payload.trigger) : '';
            strategyStatus = 'ok';
            strategyError = '';
        } catch (err) {
            if (!isSilent || !strategyList.length) {
                strategyList = [];
                strategyTrigger = '';
            }
            strategyStatus = 'err';
            strategyError = err && err.message ? err.message : '加载失败';
        }

        const strategyChanged = strategyRenderKey() !== lastStrategyListKey;
        if (strategyChanged) {
            renderPanel(true);
        } else if (!isSilent) {
            renderPanel();
        }

        try {
            await refreshTargetOption(true);
            renderPanel(true, false);
            if (!placing && shouldAutoBet() && isLoggedIn()) {
                runAutoBet();
            }
        } catch (err) {
            lastScanError = err && err.message ? err.message : '扫描失败';
            betStep = '扫描异常';
            renderPanel(true);
        }
    }

    function scheduleStrategyPoll() {
        if (strategyTimer) return;
        strategyTimer = setInterval(function () {
            loadActiveMatches(true);
            loadStrategies(true);
        }, STRATEGY_POLL_MS);
    }

    function renderPageStrategies(panel) {
        const statusEl = panel.querySelector('.tm-hty-strategy-status');
        const listEl = panel.querySelector('.tm-hty-strategy-list');
        if (!statusEl || !listEl) return;

        const listKey = strategyRenderKey();
        const hitKey = strategyHitRenderKey();
        if (listKey === lastStrategyListKey && hitKey === lastStrategyHitKey) return;
        lastStrategyListKey = listKey;
        lastStrategyHitKey = hitKey;

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

        const actionableCount = strategyStates.filter(function (st) { return st.actionable; }).length;
        const hitPendingCount = strategyStates.filter(function (st) {
            return st.hit && st.execStatus === 'pending';
        }).length;
        const plateCount = strategyStates.filter(function (st) { return st.plateMatched; }).length;
        const executedCount = strategyList.filter(function (item) {
            return getStrategyExecStatus(item) === 'executed';
        }).length;
        const abortedCount = strategyList.filter(function (item) {
            return getStrategyExecStatus(item) === 'aborted';
        }).length;
        const confirmingCount = strategyList.filter(function (item) {
            return getStrategyExecStatus(item) === 'confirming';
        }).length;
        let statusText = strategyList.length + ' 条 · #' + matchId;
        if (executedCount > 0) {
            statusText += ' · ' + executedCount + ' 条已执行';
        }
        if (abortedCount > 0) {
            statusText += ' · ' + abortedCount + ' 条已中止';
        }
        if (confirmingCount > 0) {
            statusText += ' · ' + confirmingCount + ' 条待确认';
        }
        if (actionableCount > 0) {
            statusText += ' · ' + actionableCount + ' 条可下单';
            statusEl.dataset.kind = 'ready';
        } else if (hitPendingCount > 0) {
            statusText += ' · ' + hitPendingCount + ' 条已满足';
            statusEl.dataset.kind = 'ready';
        } else if (plateCount > 0) {
            statusText += ' · ' + plateCount + ' 条盘口已匹配';
            statusEl.dataset.kind = 'info';
        } else {
            statusText += ' · 等待盘口';
            statusEl.dataset.kind = 'info';
        }
        statusEl.textContent = statusText;

        if (!strategyList.length) {
            listEl.innerHTML = '<div class="tm-hty-strategy-empty">暂无策略</div>';
            return;
        }

        listEl.innerHTML = strategyList.map(function (item, idx) {
            const state = strategyStates[idx] || {};
            let markClass = 'tm-hty-strategy-mark';
            let markText = '';
            let markTitle = '未匹配盘口';
            if (state.execStatus === 'executed') {
                markClass += ' done';
                markText = '✓';
                markTitle = '策略已执行';
            } else if (state.execStatus === 'aborted') {
                markClass += ' aborted';
                markText = '×';
                markTitle = '策略已中止';
            } else if (state.execStatus === 'confirming') {
                markClass += ' confirming';
                if (state.hit) {
                    markText = '✓';
                    markTitle = '待确认 · 盘口+赔率已满足，不参与自动下单';
                } else if (state.plateMatched) {
                    markText = '◎';
                    markTitle = '待确认 · 盘口已匹配，不参与自动下单';
                } else {
                    markTitle = '待确认 · 不参与自动下单';
                }
            } else if (state.actionable) {
                markClass += ' hit';
                markText = '✓';
                markTitle = '未执行 · 盘口+赔率已满足，可自动下单';
            } else if (state.hit) {
                markClass += ' hit';
                markText = '✓';
                markTitle = '盘口+赔率已满足';
            } else if (state.plateMatched) {
                markClass += ' plate';
                markText = '◎';
                markTitle = '盘口已匹配，赔率未达阈值';
            }
            const rowClass = state.actionable ? ' tm-hty-strategy-item-hit' :
                (state.execStatus === 'executed' ? ' tm-hty-strategy-item-done' :
                    (state.execStatus === 'aborted' ? ' tm-hty-strategy-item-aborted' :
                        (state.execStatus === 'confirming' ? ' tm-hty-strategy-item-confirming' : '')));
            return '<div class="tm-hty-strategy-item' + rowClass + '">' +
                '<span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span>' +
                '<span class="' + markClass + '" title="' + markTitle + '">' + markText + '</span>' +
                '<span class="tm-hty-strategy-text">' + formatStrategyItemHtml(item, state) + '</span>' +
                '</div>';
        }).join('');
    }

    function renderStrategies(panel) {
        renderActiveMatches(panel);
        renderPageStrategies(panel);
    }

    function renderPanel(force, refreshMatch) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        if (refreshMatch) void refreshTargetOption(true);

        const loggedIn = isLoggedIn();
        const panelKey = [
            panelReady ? '1' : '0',
            panelCollapsed ? '1' : '0',
            targetOption ? targetOption.testid : 'none',
            targetOption ? targetOption.odds : '',
            betResult,
            betStep,
            placing ? '1' : '0',
            loggedIn ? '1' : '0',
            isCartOpen() ? '1' : '0',
            matchId,
            activeMatchesRenderKey(),
            strategyStatus,
            strategyHitRenderKey(),
            strategyList.length,
            strategyError,
            lastScanButtonCount,
            lastScanViewMode,
            lastScanError,
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
        const scanEl = panel.querySelector('.tm-hty-scan');
        const openCartBtn = panel.querySelector('[data-action="open-cart"]');
        const testBetBtn = panel.querySelector('[data-action="test-bet"]');

        if (matchEl) {
            matchEl.textContent = '赛事 ' + matchId + '（滚球）· 策略自动下注（测试' + TEST_STAKE + '）';
        }
        if (scanEl) {
            const full = scanStatusFull();
            scanEl.textContent = truncatePanelText(full, PANEL_TEXT_MAX);
            scanEl.title = full.length > PANEL_TEXT_MAX ? full : '';
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
            resultEl.textContent = resultLabel(loggedIn);
            resultEl.dataset.kind = resultKind(loggedIn);
        }
        if (stepEl) {
            const step = betStep || '—';
            stepEl.textContent = truncatePanelText(step, PANEL_TEXT_MAX);
            stepEl.title = step.length > PANEL_TEXT_MAX ? step : '';
        }
        if (loginEl) {
            loginEl.textContent = loggedIn ? '已登录' : '未登录';
            loginEl.dataset.kind = loggedIn ? 'ok' : 'warn';
        }
        if (openCartBtn) {
            openCartBtn.textContent = isCartOpen() ? '投注单已开' : '打开投注单';
            openCartBtn.disabled = placing;
        }
        if (testBetBtn) {
            testBetBtn.disabled = placing;
        }
        renderStrategies(panel);
    }

    function shouldAutoBet() {
        if (strategyStatus !== 'ok' || !strategyList.length) return false;
        if (placing || !targetOption) return false;
        if (!targetOption.strategy || !isStrategyActionable(targetOption.strategy)) return false;
        return true;
    }

    function resolveAbsoluteUrl(url) {
        const text = String(url || '').trim();
        if (!text || text === 'undefined') return '';
        if (/^https?:\/\//i.test(text)) return text;
        try {
            return new URL(text, window.location.origin).href;
        } catch (e) {
            return text;
        }
    }

    function extractSiteApiBase(responseUrl) {
        const text = String(responseUrl || '').trim();
        if (!text || text === 'undefined') return '';
        try {
            return new URL(text).origin;
        } catch (e) {
            const m = text.match(/^(https?:\/\/[^/?#]+)/i);
            return m ? m[1] : '';
        }
    }

    const PLATFORM_HEADER_KEYS = [
        'authorization', 'x-uuid', 'cks', 'x-checksum', 'currency', 'time-zone',
        'device', 'apptype', 'devicemode', 'browser', 'phonebrand', 'screen', 'os', 'devicetype',
        'accept-language', 'accept',
    ];

    function mergePlatformHeaders(raw) {
        if (!raw) return;
        PLATFORM_HEADER_KEYS.forEach(function (key) {
            if (raw[key] != null && raw[key] !== '') {
                htyApiState.headers[key] = raw[key];
            }
        });
    }

    function buildPlatformRequestHeaders() {
        const src = htyApiState.headers;
        const out = {
            Accept: src.accept || 'application/json, text/plain, */*',
            'Accept-Language': src['accept-language'] || 'zh-cn',
            Referer: window.location.origin + '/',
            Origin: window.location.origin,
        };
        if (src.currency) out.currency = src.currency;
        if (src['time-zone']) out['time-zone'] = src['time-zone'];
        if (src.device) out.device = src.device;
        if (src.apptype) out.appType = src.apptype;
        if (src.authorization) out.authorization = src.authorization;
        if (src['x-uuid']) out['x-uuid'] = src['x-uuid'];
        if (src.cks) out.cks = src.cks;
        if (src.devicemode) out.deviceMode = src.devicemode;
        if (src.browser) out.browser = src.browser;
        if (src.phonebrand) out.phoneBrand = src.phonebrand;
        if (src.screen) out.screen = src.screen;
        if (src.os) out.os = src.os;
        if (src.devicetype) out.deviceType = src.devicetype;
        if (src['x-checksum']) out['x-checksum'] = src['x-checksum'];
        return out;
    }

    function formatReportDateTime(d) {
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function buildOrdersReportUrl(apiBase) {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 0);
        const qs = 'betStatus=2' +
            '&startDate=' + encodeURIComponent(formatReportDateTime(start)) +
            '&endDate=' + encodeURIComponent(formatReportDateTime(end)) +
            '&dataType=0&timeConditionType=BET';
        return apiBase.replace(/\/$/, '') + '/platform/thirdparty-report/user/orders/sport?' + qs;
    }

    function gmPlatformGetText(url) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: buildPlatformRequestHeaders(),
                timeout: REPORT_UPLOAD_TIMEOUT,
                onload: function (res) {
                    if (res.status >= 200 && res.status < 300) resolve(res.responseText);
                    else reject(new Error('GET ' + res.status));
                },
                onerror: function () { reject(new Error('网络错误')); },
                ontimeout: function () { reject(new Error('请求超时')); },
            });
        });
    }

    function uploadReportData(url, data) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                data: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' },
                timeout: REPORT_UPLOAD_TIMEOUT,
                onload: function (res) {
                    if (res.status >= 200 && res.status < 300) resolve(res.responseText);
                    else reject(new Error('上传失败 ' + res.status));
                },
                onerror: function () { reject(new Error('上传网络错误')); },
                ontimeout: function () { reject(new Error('上传超时')); },
            });
        });
    }

    async function waitForHtyApiCredentials(maxMs) {
        const deadline = Date.now() + (maxMs || REPORT_API_WAIT_MS);
        while (Date.now() < deadline) {
            if (htyApiState.apiBase && htyApiState.headers.authorization) return true;
            await humanDelay(400, 600);
        }
        return !!(htyApiState.apiBase && htyApiState.headers.authorization);
    }

    function parseBetSubmitResponse(json) {
        if (!json || typeof json !== 'object') {
            return { ok: false, error: '下注响应为空' };
        }
        if (Number(json.code) !== 0) {
            return { ok: false, error: json.msg || ('下注失败 code=' + json.code) };
        }
        const submitted = json.data && json.data.submitted;
        const failed = json.data && json.data.failed;
        const failedSingles = failed && Array.isArray(failed.singles) ? failed.singles : [];
        if (failedSingles.length) {
            return { ok: false, error: '下注被拒绝', failedSingles: failedSingles };
        }
        const singles = submitted && Array.isArray(submitted.singles) ? submitted.singles : [];
        if (!singles.length || !singles[0].orderno) {
            return { ok: false, error: '响应无 orderno' };
        }
        return {
            ok: true,
            orderno: String(singles[0].orderno),
            delay: singles[0].delay,
            singles: singles,
            response: json,
        };
    }

    function parseBetRequestBody(body) {
        if (!body) return null;
        if (typeof body === 'object') return body;
        try {
            return JSON.parse(String(body));
        } catch (e) {
            return null;
        }
    }

    function buildStrategyBetRecord(option, betApi, requestBody) {
        const strategy = option.strategy || {};
        const req = parseBetRequestBody(requestBody);
        const ticket = req && Array.isArray(req.tickets) && req.tickets.length ? req.tickets[0] : null;
        const single = req && Array.isArray(req.singles) && req.singles.length ? req.singles[0] : null;
        return {
            orderno: betApi.orderno,
            delay: betApi.delay,
            matchId: String(matchId || strategy.matchId || (ticket && ticket.iid) || ''),
            recHash: strategy.recHash || '',
            market: strategy.market || (ticket && ticket.market) || option.market || '',
            plateOn: strategy.plateOn || (ticket && ticket.beton) || option.side || '',
            plateOnK: strategy.plateOnK != null ? String(strategy.plateOnK) : (ticket && ticket.k) || '',
            plateOddsHit: strategy.plateOddsHit,
            plateAmount: strategy.plateAmount,
            plateAmountRate: strategy.plateAmountRate,
            betOdds: option.odds != null ? Number(option.odds) : (ticket && ticket.odds),
            betStake: single && single.ante != null ? Number(single.ante) : TEST_STAKE,
            oddsKey: (ticket && ticket.oddsKey) || option.testid || '',
            displayLine: option.displayLine || '',
            label: option.label || formatStrategyShort(strategy),
            siteUrl: window.location.origin,
            pageUrl: window.location.href,
            apiBase: htyApiState.apiBase || '',
            submittedAt: new Date().toISOString(),
            betRequest: req,
            betResponse: betApi.response,
        };
    }

    function clearBetResultWaiter() {
        if (!betResultWaiter) return;
        if (betResultWaiter.timer) clearTimeout(betResultWaiter.timer);
        betResultWaiter = null;
    }

    function armBetResultWaiter() {
        clearBetResultWaiter();
        return new Promise(function (resolve, reject) {
            const timer = setTimeout(function () {
                if (!betResultWaiter) return;
                clearBetResultWaiter();
                reject(new Error('下注接口响应超时'));
            }, BET_API_WAIT_MS);
            betResultWaiter = { resolve: resolve, reject: reject, timer: timer };
        });
    }

    function handleBetResultMessage(data) {
        if (!data) return;
        const url = data.url || '';
        const base = extractSiteApiBase(url);
        if (base) {
            htyApiState.apiBase = base;
            htyApiState.lastCaptureAt = data.ts || Date.now();
        }
        const parsed = parseBetSubmitResponse(data.response);
        if (!betResultWaiter) {
            if (parsed.ok) console.log('[hty-inplay] 捕获下注响应(无等待者)', parsed.orderno);
            return;
        }
        const waiter = betResultWaiter;
        clearBetResultWaiter();
        if (parsed.ok) {
            waiter.resolve({
                orderno: parsed.orderno,
                delay: parsed.delay,
                singles: parsed.singles,
                response: parsed.response,
                requestBody: data.requestBody,
            });
        } else {
            waiter.reject(new Error(parsed.error || '下注失败'));
        }
    }

    async function uploadStrategyBetRecord(record) {
        if (!record || !record.orderno) return false;
        try {
            await uploadReportData(REPORT_UPLOAD.strategy, { strategy_bet_json: JSON.stringify(record) });
            console.log('[hty-inplay] 策略投注单已上传', record.orderno, record.recHash);
            return true;
        } catch (e) {
            console.warn('[hty-inplay] 策略投注单上传失败，尝试合并上传', e);
            try {
                await uploadReportData(REPORT_UPLOAD.bet, {
                    strategy_bet_json: JSON.stringify(record),
                    bet_records_json: JSON.stringify({ strategyBet: record }),
                });
                console.log('[hty-inplay] 策略投注单已合并上传', record.orderno);
                return true;
            } catch (e2) {
                console.error('[hty-inplay] 策略投注单上传失败', e2);
                return false;
            }
        }
    }

    function initPlatformApiBridge() {
        window.addEventListener('message', function (e) {
            if (e.source !== window || !e.data || e.data.source !== PAGE_HOOK_SRC) return;
            if (e.data.type === 'capture') {
                if (e.data.apiBase) htyApiState.apiBase = e.data.apiBase;
                mergePlatformHeaders(e.data.headers || {});
                htyApiState.lastCaptureAt = e.data.ts || Date.now();
            }
            if (e.data.type === 'bet-result') {
                handleBetResultMessage(e.data);
            }
        });
    }

    function injectPlatformApiHook() {
        const root = document.documentElement;
        if (!root || root.dataset.htyInplayApiHook === '1') return;
        root.dataset.htyInplayApiHook = '1';

        const script = document.createElement('script');
        script.textContent = '(function(){' +
            'if(window.__htyInplayApiHook)return;' +
            'window.__htyInplayApiHook=true;' +
            'var HOOK_SRC=' + JSON.stringify(PAGE_HOOK_SRC) + ';' +
            'var USR_SRC=' + JSON.stringify(PAGE_USR_SRC) + ';' +
            'function absUrl(url){var t=String(url||"").trim();if(!t)return"";if(/^https?:\\/\\//i.test(t))return t;try{return new URL(t,location.origin).href}catch(e){return t}}' +
            'function apiBase(url){var t=String(url||"").trim();if(!t)return"";try{return new URL(t).origin}catch(e){var m=t.match(/^(https?:\\/\\/[^/?#]+)/i);return m?m[1]:""}}' +
            'function isPlatformUrl(url){return /\\/platform\\//i.test(url)||/\\/product\\/cashout\\/setting/i.test(url)||/\\/product\\/game\\/bet/i.test(url)}' +
            'function postBetResult(url,body,resp){try{window.postMessage({source:HOOK_SRC,type:"bet-result",url:url||"",requestBody:body,response:resp||null,ts:Date.now()},"*")}catch(e){}}' +
            'function hdrObj(h){var o={};if(!h)return o;if(typeof Headers!=="undefined"&&h instanceof Headers){h.forEach(function(v,k){o[String(k).toLowerCase()]=v});return o}' +
            'if(Array.isArray(h)){h.forEach(function(p){if(p&&p.length>=2)o[String(p[0]).toLowerCase()]=p[1]});return o}' +
            'if(typeof h==="object"){Object.keys(h).forEach(function(k){o[String(k).toLowerCase()]=h[k]});return o}return o}' +
            'function postCapture(base,headers){try{window.postMessage({source:HOOK_SRC,type:"capture",apiBase:base||"",headers:headers||{},ts:Date.now()},"*")}catch(e){}}' +
            'function onBetResponse(url,body,text){if(!/\\/product\\/game\\/bet/i.test(url||""))return;try{postBetResult(url,body,JSON.parse(text||"{}"))}catch(e){postBetResult(url,body,{code:-1,msg:"parse error"})}}' +
            'function onPlatformRequest(url,headers){if(!isPlatformUrl(url))return;var base=apiBase(url);var h=hdrObj(headers);if(base)postCapture(base,h)}' +
            'var oOpen=XMLHttpRequest.prototype.open;' +
            'XMLHttpRequest.prototype.open=function(m,url){this._htyMethod=String(m||"").toUpperCase();this._htyUrl=absUrl(url);this._htyHdr={};this._htyBody=null;return oOpen.apply(this,arguments)};' +
            'var oSet=XMLHttpRequest.prototype.setRequestHeader;' +
            'XMLHttpRequest.prototype.setRequestHeader=function(n,v){if(!this._htyHdr)this._htyHdr={};this._htyHdr[String(n).toLowerCase()]=v;return oSet.apply(this,arguments)};' +
            'var oSend=XMLHttpRequest.prototype.send;' +
            'XMLHttpRequest.prototype.send=function(body){this._htyBody=body;try{onPlatformRequest(this._htyUrl||"",this._htyHdr||{})}catch(e){}var xhr=this;var url=xhr._htyUrl||"";var reqBody=body;if(/\\/product\\/game\\/bet/i.test(url)){xhr.addEventListener("load",function(){try{onBetResponse(url,reqBody,xhr.responseText||"")}catch(e){}})}return oSend.apply(this,arguments)};' +
            'var oFetch=window.fetch;' +
            'if(typeof oFetch==="function"){' +
            'window.fetch=function(input,init){var url="";try{url=absUrl(typeof input==="string"?input:(input&&input.url)||"")}catch(e){}' +
            'try{onPlatformRequest(url,hdrObj(init&&init.headers))}catch(e){}' +
            'var ret=oFetch.apply(this,arguments);' +
            'if(/\\/product\\/game\\/bet/i.test(url)){' +
            'return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){onBetResponse(url,init&&init.body,t)}).catch(function(){})}catch(e){}return res;});' +
            '}' +
            'return ret;' +
            '}' +
            '}' +
            '})();';
        (root || document.head || document.body).appendChild(script);
        script.remove();
    }

    async function syncReportAfterBetSuccess() {
        if (reportSyncing) return;
        reportSyncing = true;
        try {
            console.log('[hty-inplay] 开始同步投注记录…');
            setBetStep('同步投注记录：等待订单入库…');
            renderPanel(true);
            await humanDelay(REPORT_SYNC_DELAY_MS, REPORT_SYNC_DELAY_MS + 800);
            setBetStep('同步投注记录：等待平台凭证…');
            renderPanel(true);
            const ready = await waitForHtyApiCredentials(REPORT_API_WAIT_MS);
            if (!ready) {
                const msg = '未捕获平台API凭证(api=' + (htyApiState.apiBase || '无') +
                    ', auth=' + (htyApiState.headers.authorization ? '有' : '无') + ')';
                console.warn('[hty-inplay]', msg);
                setBetStep('同步失败：' + msg);
                renderPanel(true);
                return;
            }
            const apiBase = htyApiState.apiBase;
            const ordersUrl = buildOrdersReportUrl(apiBase);
            const walletUrl = apiBase.replace(/\/$/, '') + '/platform/payment/wallets/list';
            console.log('[hty-inplay] 拉取投注记录', ordersUrl);

            let betJson = '';
            let walletJson = '';
            setBetStep('同步投注记录：拉取订单…');
            renderPanel(true);
            try {
                betJson = await gmPlatformGetText(ordersUrl);
                console.log('[hty-inplay] 投注记录长度', betJson.length);
            } catch (e) {
                console.error('[hty-inplay] 获取投注记录失败', e);
                setBetStep('同步失败：拉取订单 ' + (e.message || e));
                renderPanel(true);
            }
            setBetStep('同步投注记录：拉取钱包…');
            renderPanel(true);
            try {
                walletJson = await gmPlatformGetText(walletUrl);
                console.log('[hty-inplay] 钱包记录长度', walletJson.length);
            } catch (e) {
                console.error('[hty-inplay] 获取钱包失败', e);
            }

            setBetStep('同步投注记录：上传…');
            renderPanel(true);
            try {
                await uploadReportData(REPORT_UPLOAD.site, {
                    site_url: apiBase,
                    app_url: window.location.origin,
                });
                console.log('[hty-inplay] 站点URL已上传');
            } catch (e) {
                console.error('[hty-inplay] 上传站点URL失败', e);
            }
            if (betJson) {
                try {
                    const betPayload = { bet_records_json: betJson };
                    if (lastStrategyBetRecord && lastStrategyBetRecord.orderno) {
                        betPayload.strategy_bet_json = JSON.stringify(lastStrategyBetRecord);
                    }
                    await uploadReportData(REPORT_UPLOAD.bet, betPayload);
                    console.log('[hty-inplay] 投注记录已上传');
                } catch (e) {
                    console.error('[hty-inplay] 上传投注记录失败', e);
                    setBetStep('同步失败：上传投注记录 ' + (e.message || e));
                    renderPanel(true);
                    return;
                }
            }
            if (walletJson) {
                try {
                    await uploadReportData(REPORT_UPLOAD.wallet, { wallet_records_json: walletJson });
                    console.log('[hty-inplay] 钱包余额已上传');
                } catch (e) {
                    console.error('[hty-inplay] 上传钱包余额失败', e);
                }
            }
            setBetStep('投注记录同步完成');
            renderPanel(true);
            console.log('[hty-inplay] 投注记录同步完成');
        } catch (e) {
            console.error('[hty-inplay] 投注记录同步异常', e);
            setBetStep('同步异常：' + (e && e.message ? e.message : e));
            renderPanel(true);
        } finally {
            reportSyncing = false;
        }
    }

    async function continueAfterBetSuccess(option, extraMsg, fromAutoBet, betRecord) {
        const orderHint = betRecord && betRecord.orderno ? ' 单号' + betRecord.orderno : '';
        const label = option.label + ' ' + TEST_STAKE + ' 已提交' + orderHint;
        setBetResult('success', extraMsg ? label + '（' + extraMsg + '）' : label);
        syncReportAfterBetSuccess().catch(function (e) {
            console.error('[hty-inplay] report sync', e);
        });
        renderPanel(true);
        await loadStrategies(true);
        await refreshTargetOption(true);
        renderPanel(true);
        if (shouldAutoBet() && isLoggedIn()) {
            setBetStep('上一条策略已完成，准备下一条');
            await humanDelay(1500, 3000);
            runAutoBet();
            return;
        }
        betResult = 'pending';
        setBetStep('等待其余策略盘口与赔率达标');
        schedulePoll();
    }

    async function placeTestBet(option, fromAutoBet) {
        if (!option || placing) return false;
        if (!option.strategy || !isStrategyActionable(option.strategy)) return false;

        placing = true;
        setBetResult('placing', '准备点击赔率');

        try {
            setBetStep('定位赔率按钮');
            const liveBtn = await ensureButtonVisible(option);
            if (!liveBtn) throw new Error('页面上找不到对应赔率按钮');
            option.button = liveBtn;

            setBetStep('滚动到赔率按钮');
            await humanScrollTo(liveBtn);
            setBetStep('点击 ' + option.label + ' 赔率');
            safeClick(liveBtn);
            await humanDelay(600, 1100);

            setBetStep('等待投注单打开');
            const opened = await waitFor(isCartOpen, 12000, 300);
            if (!opened) throw new Error('投注单未打开');
            await humanDelay(400, 800);

            setBetStep('数字键盘输入 ' + TEST_STAKE);
            await enterAmountViaKeypad(TEST_STAKE);
            await humanDelay(300, 700);

            setBetStep('等待下注接口响应…');
            const betWait = armBetResultWaiter();
            await submitBetSlip();
            const betApi = await betWait;
            const betRecord = buildStrategyBetRecord(option, betApi, betApi.requestBody);
            lastStrategyBetRecord = betRecord;
            console.log('[hty-inplay] 下注成功', betRecord.orderno, betRecord.recHash);

            let ruleExtra = '';
            const recHash = option.strategy && option.strategy.recHash;
            if (recHash) {
                markStrategyExecuted(recHash);
                setBetStep('上传策略投注单…');
                await uploadStrategyBetRecord(betRecord);
                setBetStep('更新策略状态…');
                try {
                    await updateStrategyRule(recHash, {
                        orderno: betRecord.orderno,
                        orderNo: betRecord.orderno,
                        betOdds: betRecord.betOdds,
                        betStake: betRecord.betStake,
                        matchId: betRecord.matchId,
                    });
                } catch (ruleErr) {
                    ruleExtra = ruleErr && ruleErr.message ? ruleErr.message : '策略状态更新失败';
                }
            }
            placing = false;
            await continueAfterBetSuccess(option, ruleExtra || undefined, !!fromAutoBet, betRecord);
            return true;
        } catch (err) {
            clearBetResultWaiter();
            const msg = err && err.message ? err.message : '未知错误';
            setBetResult('failed', '失败：' + msg);
            renderPanel(true);
            schedulePoll();
            return false;
        } finally {
            placing = false;
        }
    }

    async function runAutoBet() {
        if (!shouldAutoBet()) return;
        if (!isLoggedIn()) {
            betResult = 'pending';
            setBetStep('等待登录，尝试自动登录…');
            tryAutoRelogin().catch(function (e) {
                console.warn('[hty-inplay] runAutoBet 自动登录', e);
            });
            schedulePoll();
            return;
        }
        await placeTestBet(targetOption, true);
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

    async function testBet03() {
        if (placing) return;
        await ensureMarketView();
        await refreshTargetOption(true);
        if (!targetOption) {
            setBetResult('failed', '未命中策略盘口，请确认盘口与赔率已达阈值');
            return;
        }
        const msg = '确认测试下注 ' + TEST_STAKE + ' 元？\n\n' +
            '盘口：' + targetOption.label + '\n' +
            '当前赔率：' + formatOddsDisplay(targetOption.odds) +
            '（阈值≥' + formatOddsDisplay(targetOption.minOdds) + '）\n' +
            '测试金额：' + TEST_STAKE + '（暂不使用策略金额）';
        if (!window.confirm(msg)) {
            setBetStep('已取消测试下注');
            renderPanel(true);
            return;
        }
        await placeTestBet(targetOption);
    }

    function schedulePoll() {
        if (pollTimer) return;
        if (pollCount >= MAX_POLLS) {
            if (targetOption) {
                setBetResult('stopped', '等待超时，已停止');
                return;
            }
            pollCount = 0;
        }
        pollTimer = setTimeout(async function () {
            pollTimer = null;
            pollCount += 1;
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            if (isMatchEndedModalVisible()) {
                await handleMatchEnded();
                return;
            }
            if (!isPageReady()) {
                schedulePoll();
                return;
            }

            await ensureMarketView();
            await refreshTargetOption(true);
            if (targetOption && betStep.indexOf('等待策略盘口') >= 0) {
                setBetStep('已命中 ' + targetOption.label + ' @' + targetOption.odds);
            }
            renderPanel(true, false);
            if (!placing && shouldAutoBet()) {
                if (isLoggedIn()) {
                    if (betResult === 'stopped' && betStep.indexOf('登录') >= 0) {
                        betResult = 'pending';
                    }
                    runAutoBet();
                } else {
                    betResult = 'pending';
                    setBetStep('等待登录，尝试自动登录…');
                    if (!reloginInProgress) {
                        tryAutoRelogin().catch(function (e) {
                            console.warn('[hty-inplay] poll 自动登录', e);
                        });
                    }
                    schedulePoll();
                }
            } else if (!placing) {
                schedulePoll();
            }
        }, POLL_MS);
    }

    function kickoffAutoBet() {
        panelReady = true;
        renderPanel(true);
        if (shouldAutoBet() && isLoggedIn()) {
            setBetStep('策略盘口已命中，准备自动下注');
            runAutoBet();
            return;
        }
        if (!isLoggedIn()) {
            betResult = 'pending';
            setBetStep('等待登录，尝试自动登录…');
            tryAutoRelogin().catch(function (e) {
                console.warn('[hty-inplay] kickoff 自动登录', e);
            });
            schedulePoll();
            return;
        }
        setBetStep('等待策略盘口与赔率达标');
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
                '#' + PANEL_ID + '{position:fixed;right:16px;bottom:16px;z-index:99999;width:360px;max-width:calc(100vw - 32px);' +
                'border:1px solid #334155;border-radius:10px;background:#0f172a;color:#e2e8f0;' +
                'box-shadow:0 8px 24px rgba(0,0,0,.35);font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;}' +
                '#' + PANEL_ID + '.tm-hty-collapsed{width:auto;min-width:148px;}' +
                '#' + PANEL_ID + '.tm-hty-collapsed .tm-hty-body,' +
                '#' + PANEL_ID + '.tm-hty-collapsed .tm-hty-actions{display:none;}' +
                '#' + PANEL_ID + ' .tm-hty-head{position:relative;display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1e293b;font-weight:600;font-size:12px;cursor:pointer;user-select:none;}' +
                '#' + PANEL_ID + ' .tm-hty-title{flex:1;}' +
                '#' + PANEL_ID + ' .tm-hty-version{font-weight:400;color:#64748b;font-size:10px;margin-left:4px;}' +
                '#' + PANEL_ID + ' .tm-hty-collapse{border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:12px;padding:0 2px;}' +
                '#' + PANEL_ID + ' .tm-hty-body{padding:10px 10px 8px;min-width:0;}' +
                '#' + PANEL_ID + ' .tm-hty-row{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;min-width:0;}' +
                '#' + PANEL_ID + ' .tm-hty-label{flex:0 0 52px;color:#94a3b8;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-value{flex:1;min-width:0;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
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
                '#' + PANEL_ID + ' .tm-hty-step{margin-top:4px;padding-top:8px;border-top:1px dashed #334155;color:#94a3b8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
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
                '#' + PANEL_ID + ' .tm-hty-matches-ended{margin-top:6px;padding-top:6px;border-top:1px dashed #334155;}' +
                '#' + PANEL_ID + ' .tm-hty-ended-toggle{display:flex;align-items:center;gap:4px;width:100%;border:0;background:transparent;' +
                'color:#94a3b8;font-size:10px;cursor:pointer;padding:2px 0;text-align:left;}' +
                '#' + PANEL_ID + ' .tm-hty-ended-toggle:hover{color:#cbd5e1;}' +
                '#' + PANEL_ID + ' .tm-hty-matches-ended-list{display:flex;flex-direction:column;align-items:flex-start;gap:2px;' +
                'max-height:90px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;margin-top:4px;}' +
                '#' + PANEL_ID + ' .tm-hty-match-ended{opacity:.72;}' +
                '#' + PANEL_ID + ' .tm-hty-match-ended .tm-hty-match-pick{color:#94a3b8;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-list{max-height:160px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-list::-webkit-scrollbar{width:4px;height:4px;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-list::-webkit-scrollbar-thumb{background:#475569;border-radius:4px;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-list::-webkit-scrollbar-track{background:transparent;}' +
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
                '#' + PANEL_ID + ' .tm-hty-strategy-item{display:flex;gap:4px;margin-bottom:4px;font-size:11px;color:#e2e8f0;min-width:0;white-space:nowrap;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-idx{flex:0 0 16px;color:#64748b;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-mark{flex:0 0 14px;text-align:center;font-size:11px;color:#64748b;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-mark.hit{color:#86efac;font-weight:700;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-mark.plate{color:#fde68a;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-mark.done{color:#86efac;font-weight:700;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-mark.aborted{color:#fca5a5;font-weight:700;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-mark.confirming{color:#94a3b8;font-weight:700;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;line-height:1.4;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-pending{background:#334155;color:#cbd5e1;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-executed{background:#dcfce7;color:#166534;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-confirming{background:#334155;color:#94a3b8;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-exec-aborted{background:#451a1a;color:#fca5a5;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-hit .tm-hty-strategy-text{color:#f8fafc;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-done .tm-hty-strategy-text{color:#86efac;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-confirming .tm-hty-strategy-text{color:#94a3b8;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-item-aborted .tm-hty-strategy-text{color:#94a3b8;}' +
                '#' + PANEL_ID + ' .tm-hty-strategy-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
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
            '<span class="tm-hty-title">HTY 滚球量化<span class="tm-hty-version">v' + SCRIPT_VERSION + '</span></span>' +
            '<span class="tm-hty-login">检测中</span>' +
            '<button type="button" class="tm-hty-collapse" title="折叠/展开">▾</button>' +
            '</div>' +
            '<div class="tm-hty-body">' +
            '<div class="tm-hty-row"><span class="tm-hty-label">赛事</span><span class="tm-hty-value tm-hty-match">—</span></div>' +
            '<div class="tm-hty-row"><span class="tm-hty-label">扫描</span><span class="tm-hty-value tm-hty-scan">等待扫描</span></div>' +
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
            '<div class="tm-hty-matches-ended" data-collapsed="1" style="display:none">' +
            '<button type="button" class="tm-hty-ended-toggle">已结束 (0) ▸</button>' +
            '<div class="tm-hty-matches-ended-list" style="display:none"></div>' +
            '</div>' +
            '</div>' +
            '<div class="tm-hty-strategy tm-hty-strategy-rules">' +
            '<div class="tm-hty-strategy-head">' +
            '<span class="tm-hty-strategy-title">策略列表</span>' +
            '<span><span class="tm-hty-strategy-status" data-kind="info">加载中…</span></span>' +
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
            '<button type="button" class="tm-hty-action-btn" data-action="test-bet">测试0.3</button>' +
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
            if (e.target.closest('.tm-hty-ended-toggle')) {
                e.stopPropagation();
                toggleEndedMatchesCollapsed(panel);
                return;
            }
            if (e.target.closest('.tm-hty-match-trace')) return;
            if (e.target.closest('.tm-hty-match-main')) {
                setTimeout(checkUrlChange, 0);
                setTimeout(checkUrlChange, 400);
                return;
            }
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn || actionBtn.disabled) return;
            e.stopPropagation();
            if (actionBtn.dataset.action === 'open-cart') manualOpenCart();
            if (actionBtn.dataset.action === 'test-bet') testBet03();
            if (actionBtn.dataset.action === 'refresh-strategy') {
                loadActiveMatches(true);
                loadStrategies(true);
            }
        });

        document.body.appendChild(panel);
        setupRouteWatcher();
        loadActiveMatches(false);
        scheduleStrategyPoll();
        renderPanel(true);
    }

    async function startAutoBetFlow() {
        setBetStep('等待赛事页加载完成');

        await humanDelay(500, 1000);
        try {
            await loadActiveMatches(false);
        } catch (e) {
            console.warn('[hty-inplay] 初始加载策略赛事失败', e);
        }
        if (await handleMatchEnded()) return;
        if (await maybeAutoNavigateToInplay()) return;

        try {
            await waitFor(function () {
                if (isMatchEndedModalVisible()) return true;
                return isPageReady();
            }, 60000, 500);
        } catch (e) {
            if (await handleMatchEnded()) return;
            if (await maybeAutoNavigateToInplay()) return;
            setBetResult('stopped', '页面加载超时');
            return;
        }

        if (await handleMatchEnded()) return;
        if (await maybeAutoNavigateToInplay()) return;

        if (!pickInplayNavigableMatch('') && !isPageReady()) {
            setWaitingKickoffState();
            schedulePoll();
            return;
        }

        setBetStep('切换盘口视图并扫描…');
        panelReady = true;
        setupOddsObserver();
        schedulePeriodicRescan();
        await loadStrategies();
        targetOption = await waitForStrategyMatch(60000);
        renderPanel(true);
        if (!targetOption) {
            setBetResult('pending', '暂未命中策略盘口，持续监控中');
            setBetStep('等待策略盘口与赔率达标');
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
        scheduleLoginWatch();
        setInterval(function () {
            loginCache.ts = 0;
            if (isLoggedIn() || reloginInProgress || placing) return;
            tryAutoRelogin().catch(function (e) {
                console.warn('[hty-inplay] 定时自动登录', e);
            });
        }, RELOGIN_WATCH_MS);
        scheduleSessionKeepAlive();
        setupMatchEndedWatcher();
        scheduleInplayMatchWatch();
        setTimeout(function () {
            startAutoBetFlow();
        }, 0);
    }

    function boot() {
        start();
    }

    if (document.body) {
        boot();
    } else {
        document.addEventListener('DOMContentLoaded', boot);
    }
})();
