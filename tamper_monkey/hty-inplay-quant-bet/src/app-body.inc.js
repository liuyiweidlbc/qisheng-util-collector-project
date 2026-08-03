
const PANEL_ID = 'tm-hty-inplay-quant-panel';
    const STYLE_ID = 'tm-hty-inplay-quant-style';
    const SCRIPT_VERSION = (function () {
        try {
            if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) {
                return GM_info.script.version;
            }
        } catch (e) { /* ignore */ }
        return '2.14.57';
    })();
    const BET_API_WAIT_MS = 25000;
    const BET_RECOVERY_WINDOW_MS = 180000;
    /** 查单确认无订单后，允许重试的最短等待（避免误杀慢入库；也避免干等满 3 分钟） */
    const BET_DEDUP_VERIFY_MISS_MS = 60000;
    const PANEL_TEXT_MAX = 72;
    const ALERT_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/trigger';
    const ALERT_MATCHES_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/matches/active';
    const ALERT_RULE_API = 'http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/rule';
    const TRACE_MATCH_BASE = 'http://qisheng1.xyz/match/trace?match_id=';
    const STRATEGY_POLL_MS = 30000;
    const STAKE_MODE_KEY = 'tm_hty_inplay_stake_mode';
    const BET_DEDUP_KEY = 'tm_hty_inplay_bet_dedup';
    const STAKE_MODE_OPTIONS = {
        strategy: { label: '策略实际金额', value: null, input: null },
        '2.5': { label: '2.5', value: 2.5, input: '2.5' },
        '1': { label: '1', value: 1, input: '1' },
        '0.3': { label: '0.3', value: 0.3, input: '0.3' },
    };
    const POLL_MS = 15000;
    const HEARTBEAT_MS = 15000;
    const HEARTBEAT_COLLAPSED_MS = 30000;
    const HEARTBEAT_HIDDEN_MS = 60000;
    const DOM_CHECK_DEBOUNCE_MS = 500;
    const RESCAN_MS = 30000;
    const MATCH_SCAN_MS = 12000;
    const MATCH_SCAN_PENDING_MS = 8000;
    const RULE_MEET_SCAN_MS = 20000;
    const RULE_MEET_NAV_COOLDOWN_MS = 10000;
    const LOGIN_CACHE_MS = 3000;
    const MAX_POLLS = 30;
    const PAGE_READY_SEL = '[data-testid="SportExhaustivePage"]';
    const MATCH_ENDED_HINT = '此赛事已结束';
    const LOCAL_ENDED_MATCHES_KEY = 'tm_hty_inplay_local_ended_matches';
    const LOCAL_ENDED_TTL_MS = 21600000;
    const MATCH_ENDED_DIALOGS = [
        ['此赛事已结束'],
        ['当前赛事已结束'],
        ['赛事', '已结束'],
        ['比赛', '已结束'],
    ];
    const MATCH_ENDED_PAGE_HINTS = [
        '当前赛事已结束',
        '此赛事已结束',
    ];
    const MATCH_BLOCKED_DIALOGS = [
        ['温馨提示', '当前无法进入'],
        ['赛事', '不存在'],
        ['比赛', '不存在'],
    ];
    const IDLE_LOGIN_HINT = '闲置过久';
    /**
     * 默认禁止整页乱跳；仅放行「用户选场 / 规则达标切场 / 本场结束切场」等策略性跳转。
     * 保活轮换、列表进场、非足球拉回、WAF 自动恢复仍关闭。
     * document-start 硬拦截 location.*，须配合 __htyAllowPageNav 放行。
     */
    const AUTO_PAGE_NAV_ENABLED = false;
    function isStrategicMatchSwitchReason(reason) {
        const r = String(reason || '');
        if (!r) return false;
        if (isUserManualMatchPickReason(r)) return true;
        if (isRuleMeetNavReason(r)) return true;
        if (r.indexOf('赛事已结束') >= 0) return true;
        if (r.indexOf('有进行中赛事，切换滚球') >= 0) return true;
        if (r.indexOf('比赛已开始，进入滚球') >= 0) return true;
        if (r.indexOf('进入策略滚球页') >= 0) return true;
        return false;
    }
    function isAutoPageNavAllowed(reason) {
        if (AUTO_PAGE_NAV_ENABLED) return true;
        return isStrategicMatchSwitchReason(reason);
    }
    function withPageNavAllow(fn) {
        try {
            window.__htyAllowPageNav = true;
            return fn();
        } finally {
            try { window.__htyAllowPageNav = false; } catch (e) { /* ignore */ }
        }
    }
    const KEEPALIVE_RETURN_URL_KEY = 'tm_hty_inplay_keepalive_return';
    const KEEPALIVE_PHASE_KEY = 'tm_hty_inplay_keepalive_phase';
    const KEEPALIVE_MATCH_ID_KEY = 'tm_hty_inplay_keepalive_match_id';
    const KEEPALIVE_TARGET_MATCH_ID_KEY = 'tm_hty_inplay_keepalive_target';
    const KEEPALIVE_TARGET_HOME_KEY = 'tm_hty_inplay_keepalive_home';
    const KEEPALIVE_TARGET_AWAY_KEY = 'tm_hty_inplay_keepalive_away';
    const KEEPALIVE_ROTATE_INDEX_KEY = 'tm_hty_inplay_rotate_index';
    const SESSION_KEEPALIVE_MS = 300000;
    const PAGE_KEEPALIVE_MIN_GAP_MS = 600000;
    const MATCH_ROTATE_MS = 180000;
    const MATCH_ENDED_SWITCH_COOLDOWN_MS = 12000;
    const MATCH_BLOCKED_HANDLE_COOLDOWN_MS = 60000;
    const INPLAY_NAV_COOLDOWN_MS = 45000;
    const MATCH_NAV_STICK_MS = 90000;
    const LAST_INPLAY_NAV_AT_KEY = 'tm_hty_inplay_last_nav_at';
    const LAST_INPLAY_NAV_MATCH_KEY = 'tm_hty_inplay_last_nav_match';
    const NAV_HARD_AT_KEY = 'tm_hty_nav_hard_at';
    const NAV_HARD_COOLDOWN_MS = 45000;
    const NAV_BREAKER_WINDOW_MS = 120000;
    const NAV_BREAKER_MAX = 4;
    const NAV_BREAKER_PAUSE_MS = 180000;
    const NAV_BREAKER_LOG_KEY = 'tm_hty_nav_breaker_log';
    const NAV_BREAKER_UNTIL_KEY = 'tm_hty_nav_breaker_until';
    const PAGE_RELOAD_COOLDOWN_MS = 120000;
    const WAF_RECOVERY_COOLDOWN_MS = 300000;
    const NAV_SUPPRESS_NO_INPLAY_MS = 120000;
    const WAF_RECOVERY_KEY = 'tm_hty_inplay_waf_recovery_at';
    const INPLAY_MATCH_WATCH_MS = 15000;
    const TAB_TG_NAV_COOLDOWN_MS = 90000;
    const TAB_TG_NAV_KEY = 'tm_hty_inplay_tab_tg_nav_at';
    const USER_MANUAL_MATCH_GRACE_MS = 90000;
    const USER_MANUAL_MATCH_ID_KEY = 'tm_hty_inplay_manual_match_id';
    const USER_MANUAL_MATCH_AT_KEY = 'tm_hty_inplay_manual_match_at';
    const USER_MANUAL_CATEGORY_TAB_KEY = 'tm_hty_inplay_manual_tab';
    const USER_MANUAL_CATEGORY_TAB_AT_KEY = 'tm_hty_inplay_manual_tab_at';
    const USER_MANUAL_CATEGORY_TAB_GRACE_MS = 1800000;
    const SCRIPT_TAB_SWITCH_GRACE_MS = 3000;
    const KICKOFF_EARLY_MS = 60000;
    const KICKOFF_NAV_PRIORITY_MS = 900000;
    const REPORT_UPLOAD = {
        bet: 'http://192.168.31.168:9999/bet/records/upload',
        strategy: 'http://192.168.31.168:9999/bet/strategy/upload',
        site: 'http://192.168.31.168:9999/site/url',
        wallet: 'http://192.168.31.168:9999/bet/wallet/upload',
    };
    const REPORT_UPLOAD_TIMEOUT = 30000;
    const REPORT_SYNC_DELAY_MS = 4000;
    const ORDERS_UPLOAD_AFTER_BET_ATTEMPTS = 6;
    const ORDERS_UPLOAD_RETRY_GAP_MS = 3500;
    const ORDERS_UPLOAD_DELAYED_RETRY_MS = 45000;
    const MATCH_BET_HISTORY_DAYS = 29;
    const REPORT_API_WAIT_MS = 12000;
    const SESSION_API_KEEPALIVE_MS = 120000;
    const SESSION_HEADER_FRESH_MS = 180000;
    const SESSION_LOGIN_WATCH_MS = 15000;
    const RELOGIN_COOLDOWN_MS = 12000;
    const RELOGIN_COOLDOWN_URGENT_MS = 2000;
    const LOGIN_NAV_LOCK_MS = 45000;
    const LOGIN_NAV_SETTLE_MS = 8000;
    const RELOGIN_WATCH_MS = 8000;
    const SIMPLE_LOGIN_PIN = '0514';
    const ENSURE_MARKET_VIEW_GAP_MS = 60000;
    const EXECUTED_STRATEGIES_KEY = 'tm_hty_inplay_executed';
    const ABORTED_SYNCED_KEY = 'tm_hty_inplay_aborted_synced';
    const BET_INFLIGHT_KEY = 'tm_hty_inplay_bet_inflight';
    const BET_ATTEMPT_KEY = 'tm_hty_inplay_bet_attempt';
    const HTY_API_CACHE_KEY = 'tm_hty_inplay_api_cache';
    const HTY_ORDERS_CACHE_KEY = 'tm_hty_inplay_orders_cache';
    const HTY_ORDERS_API_BASE_KEY = 'tm_hty_inplay_orders_api_base';
    const ORDERS_REPORT_CACHE_MS = 180000;
    const ORDERS_FETCH_ATTEMPT_MS = 6000;
    const ORDERS_QUICK_FETCH_MS = 8000;
    const ORDERS_CONFIRM_GM_MS = 10000;
    const ORDERS_HOOK_PASSIVE_WAIT_MS = 2000;
    const ORDERS_HOOK_QUICK_WAIT_MS = 1500;
    const ORDERS_UPLOAD_HOOK_WAIT_MS = 15000;
    const ORDERS_DISCOVER_MAX_BASES = 4;
    const EXECUTED_STRATEGY_TTL_MS = 86400000;
    const STRATEGY_RULE_UPDATE_RETRIES = 3;

    let htyApiState = {
        apiBase: '',
        headers: {},
        lastCaptureAt: 0,
    };
    let reportSyncing = false;
    let matchHistoryUploading = false;
    let betResultWaiter = null;
    let lastCapturedBetSuccess = null;
    let lastCapturedOrdersReport = null;
    let lastStrategyBetRecord = null;
    let lastAutoUploadMatchAt = 0;
    let delayedOrdersUploadTimer = null;
    const AUTO_UPLOAD_AFTER_DEDUP_GAP_MS = 45000;
    const PAGE_HOOK_SRC = 'hty-inplay-api-hook';
    const PAGE_USR_SRC = 'hty-inplay-userscript';

    const MARKET_LABEL = {
        aou: '客进球',
        hou: '主进球',
        ah: '让球',
        ou: '全场进球',
        ou_1st: '上半进球',
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

    let navSuppressedUntil = 0;
    let lastBlockedHandleAt = 0;
    let lastPageReloadAt = 0;

    function getMatchIdFromUrl(href) {
        const url = String(href || window.location.href || '');
        const m = url.match(/\/sportEvents\/(?:inplay|incoming)\/football\/match\/(\d+)/i);
        return m ? m[1] : '';
    }

    function getMatchPageSegmentFromUrl(href) {
        const url = String(href || window.location.href || '');
        if (/\/sportEvents\/inplay\/football\/match\//i.test(url)) return 'inplay';
        if (/\/sportEvents\/incoming\/football\/match\//i.test(url)) return 'incoming';
        return '';
    }

    function isOnMatchBetPage() {
        return /\/sportEvents\/(?:inplay|incoming)\/football\/match\/\d+/i.test(window.location.pathname);
    }

    function resolveMatchUrlSegmentForId(id) {
        if (String(id) === String(getMatchIdFromUrl())) {
            const curSeg = getMatchPageSegmentFromUrl();
            if (curSeg) return curSeg;
        }
        const item = activeMatches.find(function (m) {
            return String(m.matchId) === String(id);
        });
        if (item) {
            const phase = resolveMatchPhase(item);
            if (phase === 'IN_PLAY') return 'inplay';
            if (phase === 'NOT_STARTED') return 'incoming';
        }
        if (String(id) === String(matchId)) {
            const seg = getMatchPageSegmentFromUrl();
            if (seg) return seg;
        }
        return 'inplay';
    }

    function matchBetUrl(id, tab, segment) {
        const seg = segment || resolveMatchUrlSegmentForId(id);
        let url = window.location.origin + '/sportEvents/' + seg + '/football/match/' + id + '?type=market';
        if (tab) url += '&tab=' + encodeURIComponent(String(tab).toLowerCase());
        return url;
    }

    function normalizeMatchBetHref(href) {
        try {
            const u = new URL(String(href || window.location.href), window.location.origin);
            u.hash = '';
            u.searchParams.delete('_tm');
            if (!u.searchParams.get('tab')) u.searchParams.delete('tab');
            const pairs = [];
            u.searchParams.forEach(function (v, k) {
                pairs.push(k + '=' + v);
            });
            pairs.sort();
            return u.pathname + (pairs.length ? '?' + pairs.join('&') : '');
        } catch (e) {
            return String(href || '');
        }
    }

    function isAlreadyOnMatchBetUrl(id, tab) {
        if (!id || !isOnMatchBetPage()) return false;
        if (String(id) !== String(getMatchIdFromUrl())) return false;
        const target = matchBetUrl(id, tab);
        const cur = window.location.href.split('#')[0];
        return normalizeMatchBetHref(cur) === normalizeMatchBetHref(target);
    }

    function shouldSkipTabTgUrlNav() {
        try {
            const last = parseInt(sessionStorage.getItem(TAB_TG_NAV_KEY) || '0', 10);
            return !isNaN(last) && Date.now() - last < TAB_TG_NAV_COOLDOWN_MS;
        } catch (e) {
            return false;
        }
    }

    function markTabTgUrlNav() {
        try {
            sessionStorage.setItem(TAB_TG_NAV_KEY, String(Date.now()));
        } catch (e) { /* ignore */ }
    }

    function isSiteAccessBlockedPage() {
        if (!document.body) return false;
        const text = (document.body.innerText || document.body.textContent || '').replace(/\s+/g, '');
        return (text.indexOf('已阻断') >= 0 && (text.indexOf('安全威胁') >= 0 || text.indexOf('有害') >= 0)) ||
            (text.indexOf('访问被阻断') >= 0) ||
            (text.indexOf('URL') >= 0 && text.indexOf('阻断') >= 0);
    }

    function recoverFromBlockedAccessPage() {
        if (!isSiteAccessBlockedPage()) return false;
        if (!AUTO_PAGE_NAV_ENABLED) {
            console.warn('[hty-inplay] WAF 阻断页：自动恢复跳转已禁用，请手动刷新');
            return false;
        }
        const href = window.location.href;
        let lastRecovery = 0;
        try {
            lastRecovery = parseInt(sessionStorage.getItem(WAF_RECOVERY_KEY) || '0', 10);
        } catch (e) { /* ignore */ }
        if (!isNaN(lastRecovery) && Date.now() - lastRecovery < WAF_RECOVERY_COOLDOWN_MS) {
            console.warn('[hty-inplay] WAF 阻断静默中，停止自动重试');
            navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + WAF_RECOVERY_COOLDOWN_MS);
            return false;
        }
        if (href.indexOf('_tm=') >= 0) {
            try {
                const url = new URL(href);
                url.searchParams.delete('_tm');
                const clean = url.toString();
                console.warn('[hty-inplay] WAF 阻断，去除 _tm 参数后重试', clean);
                try { sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now())); } catch (e) { /* ignore */ }
                withPageNavAllow(function () {
                    window.location.replace(clean);
                });
                return true;
            } catch (e) {
                const clean = href
                    .replace(/([?&])_tm=\d+(?=&|$)/, '$1')
                    .replace(/[?&]$/, '');
                console.warn('[hty-inplay] WAF 阻断，去除 _tm 参数后重试', clean);
                try { sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now())); } catch (e2) { /* ignore */ }
                withPageNavAllow(function () {
                    window.location.replace(clean);
                });
                return true;
            }
        }
        const id = getMatchIdFromUrl();
        if (!id) return false;
        const seg = getMatchPageSegmentFromUrl(href) || resolveMatchUrlSegmentForId(id);
        let clean = window.location.origin +
            '/sportEvents/' + seg + '/football/match/' + id + '?type=market';
        const tabMatch = href.match(/[?&]tab=([^&#]+)/i);
        if (tabMatch && tabMatch[1]) clean += '&tab=' + encodeURIComponent(tabMatch[1]);
        if (clean === href.split('#')[0]) {
            console.warn('[hty-inplay] WAF 阻断且 URL 已干净，进入静默');
            try { sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now())); } catch (e) { /* ignore */ }
            navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + WAF_RECOVERY_COOLDOWN_MS);
            return false;
        }
        console.warn('[hty-inplay] WAF 阻断，重试干净 URL', clean);
        try { sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        withPageNavAllow(function () {
            window.location.replace(clean);
        });
        return true;
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

    let matchId = getMatchIdFromUrl();
    (function initUserManualMatchLock() {
        try {
            userManualMatchId = sessionStorage.getItem(USER_MANUAL_MATCH_ID_KEY) || '';
            userManualMatchAt = parseInt(sessionStorage.getItem(USER_MANUAL_MATCH_AT_KEY) || '0', 10);
            if (isNaN(userManualMatchAt)) userManualMatchAt = 0;
            if (userManualMatchId && userManualMatchAt &&
                Date.now() - userManualMatchAt > USER_MANUAL_MATCH_GRACE_MS) {
                userManualMatchId = '';
                userManualMatchAt = 0;
            }
        } catch (e) { /* ignore */ }
    })();
    (function initUserManualCategoryTabLock() {
        try {
            userManualCategoryTab = sessionStorage.getItem(USER_MANUAL_CATEGORY_TAB_KEY) || '';
            userManualCategoryTabAt = parseInt(sessionStorage.getItem(USER_MANUAL_CATEGORY_TAB_AT_KEY) || '0', 10);
            if (isNaN(userManualCategoryTabAt)) userManualCategoryTabAt = 0;
            if (userManualCategoryTab && userManualCategoryTabAt &&
                Date.now() - userManualCategoryTabAt > USER_MANUAL_CATEGORY_TAB_GRACE_MS) {
                userManualCategoryTab = '';
                userManualCategoryTabAt = 0;
            }
        } catch (e) { /* ignore */ }
    })();
    let loginCache = { value: false, ts: 0 };
    let reloginInProgress = false;
    let lastReloginAttemptAt = 0;
    let loginNavLockUntil = 0;

    initPlatformApiBridge();
    injectPlatformApiHook();
    restoreApiState();

    let targetOption = null;
    let placing = false;
    let autoBetInFlight = false;
    let pollTimer = null;
    let pollCount = 0;
    let started = false;
    let panelReady = false;
    let panelCollapsed = false;
    let panelCollapsedBeforeBet = false;
    let panelBetAutoCollapsed = false;
    let manualCartPanelWatchReady = false;
    let lastCartOpenForPanel = false;
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
    let lastWatchedCategoryTab = '';
    let scriptCategoryTabSwitchAt = 0;
    let userManualCategoryTabAt = 0;
    let userManualCategoryTab = '';
    let userManualMatchId = '';
    let userManualMatchAt = 0;
    let manualCategoryTabWatchReady = false;
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
    let matchEndedObserver = null;
    let refreshDebounceTimer = null;
    let heartbeatTimer = null;
    let heartbeatTick = 0;
    let heartbeatInFlight = false;
    let domCheckTimers = {};
    let pageHidden = false;
    let lastOddsSignature = '';
    let lastStatusPanelKey = '';
    let buttonMarketIndex = new Map();
    let lastScanButtonCount = 0;
    let lastScanViewMode = '';
    let lastScanError = '';
    let matchRuleMeetCache = {};
    let matchPendingWorkCache = {};
    let lastRuleMeetScanAt = 0;
    let ruleMeetScanInFlight = false;
    let lastButtonSnapshot = new Map();
    let endedMatchesCollapsed = true;
    let matchEndedHandling = false;
    let lastEndedSwitchAt = 0;
    let matchEndedWatchTimer = null;
    let stakeMode = loadStakeMode();
    let betDedupEnabled = loadBetDedupEnabled();

    function loadBetDedupEnabled() {
        try {
            const saved = localStorage.getItem(BET_DEDUP_KEY);
            if (saved === '0' || saved === 'false') return false;
            if (saved === '1' || saved === 'true') return true;
        } catch (e) { /* ignore */ }
        return true;
    }

    function saveBetDedupEnabled(enabled) {
        try {
            localStorage.setItem(BET_DEDUP_KEY, enabled ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    function isBetDedupEnabled() {
        return betDedupEnabled;
    }

    /** ruleMeetIgnore: -1待确认 0未执行 1已中止 2已执行 */
    function getStrategyExecStatusFromApi(item) {
        const ignore = String(item && item.ruleMeetIgnore != null ? item.ruleMeetIgnore : '0');
        if (ignore === '2') return 'executed';
        if (ignore === '1') return 'aborted';
        if (ignore === '-1') return 'confirming';
        const invalid = String(item && item.ruleMeetInvalid != null ? item.ruleMeetInvalid : '0');
        const invalidFlag = String(item && item.invalidFlag != null ? item.invalidFlag : '0');
        if (invalid === '1' || invalidFlag === '1') return 'aborted';
        return 'pending';
    }

    function needsAbortedStatusPut(item) {
        if (!item || !item.recHash) return false;
        if (getStrategyExecStatusFromApi(item) !== 'aborted') return false;
        return String(item.ruleMeetIgnore != null ? item.ruleMeetIgnore : '0') !== '1';
    }

    function passesStrategyStatusGate(item) {
        // 本地已确认成交的策略禁止再下（即使后台仍显示未执行）
        if (item && item.recHash && typeof isStrategyLocallyExecuted === 'function' &&
            isStrategyLocallyExecuted(item.recHash)) {
            return false;
        }
        return getStrategyExecStatusFromApi(item) === 'pending';
    }

    function hasPendingExecutableStrategies() {
        return strategyList.some(function (item) {
            return passesStrategyStatusGate(item);
        });
    }

    function isCurrentMatchNotStarted() {
        const item = getCurrentMatchItem();
        if (!item) return false;
        return resolveMatchPhase(item) === 'NOT_STARTED';
    }

    function hasOtherInPlayMatchesThanCurrent() {
        const cur = matchId ? String(matchId) : '';
        return getSortedInPlayMatchIds().some(function (id) {
            return id !== cur;
        });
    }

    function isStrategyRuleMeet(item) {
        if (!item) return false;
        const meet = String(item.ruleMeet != null ? item.ruleMeet : '0');
        return meet === '1' || meet === 'true';
    }

    function isStrategyPendingRuleMeet(item) {
        return isStrategyRuleMeet(item) && passesStrategyStatusGate(item);
    }

    function countPendingRuleMeet(strategies) {
        if (!Array.isArray(strategies)) return 0;
        let n = 0;
        for (let i = 0; i < strategies.length; i++) {
            if (isStrategyPendingRuleMeet(strategies[i])) n += 1;
        }
        return n;
    }

    /** 仍有可跟进工作：未执行 / 待确认（不含已中止、已执行） */
    function countPendingWorkStrategies(strategies) {
        if (!Array.isArray(strategies)) return 0;
        let n = 0;
        for (let i = 0; i < strategies.length; i++) {
            const st = getStrategyExecStatusFromApi(strategies[i]);
            if (st === 'pending' || st === 'confirming') n += 1;
        }
        return n;
    }

    function rememberMatchPendingWork(id, pendingCount) {
        const mid = String(id || '');
        if (!mid) return;
        matchPendingWorkCache[mid] = {
            pendingCount: Number(pendingCount) || 0,
            known: true,
            at: Date.now(),
        };
    }

    function syncCurrentMatchPendingWorkCache() {
        if (!matchId) return;
        // 导航缓存只记「已达标+未执行」；待确认不进场
        rememberMatchPendingWork(matchId, countPendingRuleMeet(strategyList));
    }

    function matchHasNavigablePendingWork(item) {
        if (!item || !item.matchId) return false;
        const id = String(item.matchId);
        if (isMatchLocallyEnded(id) || isMatchEndedPhase(item)) return false;
        // 仅「已达标且未执行」才有进场价值；待确认不会执行，不跳转
        if (id === String(matchId) && (strategyList.length || lastMatchScanAt || strategyStatus === 'ok')) {
            return countPendingRuleMeet(strategyList) > 0;
        }
        const meetCached = matchRuleMeetCache[id];
        if (meetCached) return Number(meetCached.meetCount) > 0;
        const cached = matchPendingWorkCache[id];
        if (cached && cached.known) return cached.pendingCount > 0;
        return false;
    }

    function getCurrentMatchPendingRuleMeetCount() {
        return countPendingRuleMeet(strategyList);
    }

    function getCurrentMatchRuleMeetCountForNav() {
        const local = getCurrentMatchPendingRuleMeetCount();
        if (local > 0) return local;
        if (!matchId) return 0;
        const cached = matchRuleMeetCache[String(matchId)];
        return cached && cached.meetCount > 0 ? cached.meetCount : 0;
    }

    function recordInplayNavigation(targetId) {
        const now = Date.now();
        const mid = String(targetId || matchId || '');
        lastInplayNavAt = now;
        try {
            sessionStorage.setItem(LAST_INPLAY_NAV_AT_KEY, String(now));
            if (mid) sessionStorage.setItem(LAST_INPLAY_NAV_MATCH_KEY, mid);
            sessionStorage.setItem(NAV_HARD_AT_KEY, String(now));
        } catch (e) { /* ignore */ }
    }

    function readNavBreakerUntil() {
        try {
            return parseInt(sessionStorage.getItem(NAV_BREAKER_UNTIL_KEY) || '0', 10) || 0;
        } catch (e) {
            return 0;
        }
    }

    function readNavHardAt() {
        try {
            return parseInt(sessionStorage.getItem(NAV_HARD_AT_KEY) || '0', 10) || 0;
        } catch (e) {
            return 0;
        }
    }

    function pushNavBreakerLog(now) {
        let arr = [];
        try {
            arr = JSON.parse(sessionStorage.getItem(NAV_BREAKER_LOG_KEY) || '[]');
        } catch (e) {
            arr = [];
        }
        if (!Array.isArray(arr)) arr = [];
        arr.push(now);
        arr = arr.filter(function (t) { return now - Number(t) < NAV_BREAKER_WINDOW_MS; });
        try {
            sessionStorage.setItem(NAV_BREAKER_LOG_KEY, JSON.stringify(arr));
        } catch (e) { /* ignore */ }
        return arr;
    }

    /** 全局硬门：所有脚本发起的整页跳转必须走这里，防止连环跳 */
    function canPerformPageNavigation(reason) {
        const now = Date.now();
        const breakerUntil = readNavBreakerUntil();
        if (breakerUntil && now < breakerUntil) {
            console.warn('[hty-inplay] 导航熔断中，跳过', reason || '', Math.ceil((breakerUntil - now) / 1000) + 's');
            return false;
        }
        const hardAt = Math.max(lastInplayNavAt || 0, readNavHardAt());
        if (hardAt && now - hardAt < NAV_HARD_COOLDOWN_MS) {
            console.warn('[hty-inplay] 导航硬冷却中，跳过', reason || '',
                Math.ceil((NAV_HARD_COOLDOWN_MS - (now - hardAt)) / 1000) + 's');
            return false;
        }
        return true;
    }

    function performPageNavigation(url, reason, matchIdForRecord) {
        if (!url) return false;
        if (!isAutoPageNavAllowed(reason)) {
            console.warn('[hty-inplay] 自动整页跳转已禁用，跳过', reason || '', url);
            return false;
        }
        url = rewriteAwayFromInplayList(url, reason);
        if (!url) return false;
        const dest = String(url).split('#')[0];
        const cur = String(window.location.href || '').split('#')[0];
        if (normalizeMatchBetHref(dest) === normalizeMatchBetHref(cur) || dest === cur) {
            return true;
        }
        if (!canPerformPageNavigation(reason)) return false;
        const now = Date.now();
        const log = pushNavBreakerLog(now);
        if (log.length >= NAV_BREAKER_MAX) {
            const until = now + NAV_BREAKER_PAUSE_MS;
            try { sessionStorage.setItem(NAV_BREAKER_UNTIL_KEY, String(until)); } catch (e) { /* ignore */ }
            console.error('[hty-inplay] 导航过于频繁，熔断', NAV_BREAKER_PAUSE_MS / 1000 + 's', reason || '');
            navSuppressedUntil = Math.max(navSuppressedUntil, until);
            return false;
        }
        if (matchIdForRecord) recordInplayNavigation(matchIdForRecord);
        else {
            lastInplayNavAt = now;
            try { sessionStorage.setItem(NAV_HARD_AT_KEY, String(now)); } catch (e) { /* ignore */ }
        }
        console.log('[hty-inplay] 页面跳转', reason || '', dest);
        withPageNavAllow(function () {
            window.location.href = url;
        });
        return true;
    }

    function performPageReplace(url, reason, matchIdForRecord) {
        if (!url) return false;
        if (!isAutoPageNavAllowed(reason)) {
            console.warn('[hty-inplay] 自动整页替换已禁用，跳过', reason || '', url);
            return false;
        }
        url = rewriteAwayFromInplayList(url, reason);
        if (!url) return false;
        const dest = String(url).split('#')[0];
        const cur = String(window.location.href || '').split('#')[0];
        if (dest === cur) return true;
        if (!canPerformPageNavigation(reason)) return false;
        const now = Date.now();
        const log = pushNavBreakerLog(now);
        if (log.length >= NAV_BREAKER_MAX) {
            const until = now + NAV_BREAKER_PAUSE_MS;
            try { sessionStorage.setItem(NAV_BREAKER_UNTIL_KEY, String(until)); } catch (e) { /* ignore */ }
            console.error('[hty-inplay] 导航过于频繁，熔断', NAV_BREAKER_PAUSE_MS / 1000 + 's', reason || '');
            navSuppressedUntil = Math.max(navSuppressedUntil, until);
            return false;
        }
        if (matchIdForRecord) recordInplayNavigation(matchIdForRecord);
        else {
            lastInplayNavAt = now;
            try { sessionStorage.setItem(NAV_HARD_AT_KEY, String(now)); } catch (e) { /* ignore */ }
        }
        console.log('[hty-inplay] 页面替换', reason || '', dest);
        withPageNavAllow(function () {
            window.location.replace(url);
        });
        return true;
    }

    function getPersistedInplayNavMatchId() {
        try {
            return sessionStorage.getItem(LAST_INPLAY_NAV_MATCH_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    function isMatchNavStickActive() {
        if (!matchId || !lastInplayNavAt) return false;
        if (String(getPersistedInplayNavMatchId()) !== String(matchId)) return false;
        return Date.now() - lastInplayNavAt < MATCH_NAV_STICK_MS;
    }

    function canLeaveCurrentMatchForAutoSwitch() {
        // 总览/列表页没有当前比赛，不应被「未扫描策略」卡住
        if (!matchId) return true;
        if (isCurrentMatchEnded()) return true;
        // 其它场已 ruleMeet：允许尽快离开，不被 90s 粘滞钉死
        if (isMatchNavStickActive() && !hasOtherRuleMeetMatchThanCurrent()) return false;
        if (!strategyList.length && !lastMatchScanAt) return false;
        return true;
    }

    function isHubSportEventsPage() {
        return isStrandedSportEventsPage() || isInplayListPage();
    }

    /** 总览/滚球列表：有可进场次时尽快进入，不干等 */
    async function maybeEnterMatchFromHubPage(reason) {
        if (!AUTO_PAGE_NAV_ENABLED) return false;
        if (!isHubSportEventsPage()) return false;
        if (isUserManualMatchLockActive()) return false;
        if (placing || matchEndedHandling || shouldBlockMatchAutoNav()) return false;
        if (Date.now() - lastInplayNavAt < INPLAY_NAV_COOLDOWN_MS) return false;

        if (!hasNavigableInPlayMatches()) {
            setBetStep((isStrandedSportEventsPage() ? '总览页' : '列表页') +
                '：暂无进行中且已达标的比赛');
            renderPanel(true);
            return false;
        }
        // 总览页曾因「暂无可进」静默 2 分钟；有可进场次时立即解除（登录中绝不解除）
        if (!shouldBlockMatchAutoNav()) navSuppressedUntil = 0;

        let targetId = '';
        const savedId = resolveStrandedTargetMatchId();
        if (savedId && !isMatchLocallyEnded(savedId) && !isMatchIdEnded(savedId)) {
            const savedItem = activeMatches.find(function (m) {
                return String(m.matchId) === String(savedId);
            });
            if (savedItem && matchHasNavigablePendingWork(savedItem)) {
                targetId = savedId;
            }
        }
        if (!targetId) {
            targetId = pickPreferredNavigableMatch('', '', activeMatches);
        }
        if (!targetId) return false;

        console.log('[hty-inplay] 总览/列表自动进入', targetId, reason || '');
        setBetStep((reason || '进入策略比赛') + '…');
        renderPanel(true);
        return navigateToInplayMatch(targetId, reason || '总览页进入策略比赛');
    }

    function getMatchRuleMeetCount(item) {
        if (!item || !item.matchId) return 0;
        const id = String(item.matchId);
        if (id === String(matchId)) return getCurrentMatchRuleMeetCountForNav();
        const entry = matchRuleMeetCache[id];
        return entry ? entry.meetCount : 0;
    }

    function hasOtherRuleMeetMatchThanCurrent() {
        const cur = matchId ? String(matchId) : '';
        const keys = Object.keys(matchRuleMeetCache);
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] === cur) continue;
            if (matchRuleMeetCache[keys[i]].meetCount > 0) return true;
        }
        return false;
    }

    /** 本场有可下/正在投注时钉住；其它场已有 ruleMeet 时不因本场未下完而钉死 */
    function shouldHoldCurrentMatch() {
        if (isCurrentMatchEnded()) return false;
        if (placing) return true;
        if (targetOption) return true;
        if (strategyStates.some(function (st) { return st.actionable; })) return true;
        // 其它场已达标待下：本场即使还有未下完的 ruleMeet/半命中，也不占住（立即可下已在上方拦截）
        if (hasOtherRuleMeetMatchThanCurrent()) return false;
        if (strategyStates.some(function (st) {
            return st.hit && st.execStatus === 'pending';
        })) return true;
        if (strategyStates.some(function (st) {
            return st.plateMatched && st.execStatus === 'pending';
        })) return true;
        if (hasPendingExecutableStrategies() && lastScanButtonCount === 0) {
            // 未开赛页暂无盘口；若有其它进行中赛事，应自动切过去而非一直钉在地址栏场次
            if (isCurrentMatchNotStarted() && hasOtherInPlayMatchesThanCurrent()) {
                return false;
            }
            return true;
        }
        return false;
    }

    function shouldKeepOddsWatch() {
        if (isCurrentMatchEnded()) return false;
        if (targetOption) return true;
        if (strategyStates.some(function (st) { return st.actionable; })) return true;
        if (strategyStates.some(function (st) {
            return st.hit && st.execStatus === 'pending';
        })) return true;
        return hasPendingExecutableStrategies();
    }

    /** 第二层：本地已成交强制防重；开关开启时额外防 tid/进行中 */
    function isScriptDedupStored(option, recHash) {
        // 不论防重开关：本地已记录成功单必须拦截，否则会重复投注
        if (recHash && isStrategyLocallyExecuted(recHash)) return true;
        if (!isBetDedupEnabled()) return false;
        if (option && option.testid && recHash) {
            const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
            const tidEntry = store['tid:' + option.testid];
            // 同按钮不同阈值档位（不同 recHash）允许分别下单；tid 仅防同一策略 DOM 刷新后重复
            if (tidEntry && tidEntry.recHash === recHash) return true;
        }
        return false;
    }

    function isScriptDedupInflight(option, recHash) {
        // 进行中/超时未确认：不论防重开关都拦截，避免重复下单
        const inflight = getBetInFlight();
        if (!inflight || !recHash) return false;
        return inflight.recHash === recHash;
    }

    function releaseStaleBetInflight() {
        const inflight = getBetInFlight();
        if (!inflight) return;
        if (inflight.recHash && isStrategyLocallyExecuted(inflight.recHash)) {
            clearBetInFlight();
            clearBetAttempt(inflight.recHash);
        }
    }

    function betAttemptStorageKey(id) {
        return BET_ATTEMPT_KEY + '_' + (id || matchId || '');
    }

    function loadBetAttemptStore(id) {
        try {
            const raw = sessionStorage.getItem(betAttemptStorageKey(id));
            const store = raw ? JSON.parse(raw) : {};
            return store && typeof store === 'object' ? store : {};
        } catch (e) {
            return {};
        }
    }

    function saveBetAttemptStore(store, id) {
        try {
            sessionStorage.setItem(betAttemptStorageKey(id), JSON.stringify(store || {}));
        } catch (e) { /* ignore */ }
    }

    function pruneBetAttemptStore(store) {
        const now = Date.now();
        Object.keys(store).forEach(function (recHash) {
            const entry = store[recHash];
            if (!entry || now - Number(entry.at || 0) > BET_RECOVERY_WINDOW_MS) {
                delete store[recHash];
            }
        });
        return store;
    }

    function getBetAttempt(recHash) {
        if (!recHash) return null;
        const store = pruneBetAttemptStore(loadBetAttemptStore());
        return store[recHash] || null;
    }

    function isBetAttemptBlocked(recHash) {
        if (!recHash) return false;
        return !!getBetAttempt(recHash);
    }

    function markBetAttempt(recHash, option, stake) {
        // 点击投注后的 attempt 锁：不论防重开关都写入，超时不确定时才能拦住自动重下
        if (!recHash) return;
        const store = pruneBetAttemptStore(loadBetAttemptStore());
        store[recHash] = {
            at: Date.now(),
            testid: option && option.testid ? String(option.testid) : '',
            stake: stake != null ? String(stake) : '',
            matchId: String(matchId || ''),
            label: option && option.label ? String(option.label) : '',
            bttsSubstitute: !!(option && option.bttsSubstitute),
            substitutedFrom: option && option.substitutedFrom ? option.substitutedFrom : null,
            market: option && option.market ? String(option.market) : '',
            side: option && option.side ? String(option.side) : '',
        };
        saveBetAttemptStore(store);
    }

    function clearBetAttempt(recHash) {
        if (!recHash) return;
        const store = pruneBetAttemptStore(loadBetAttemptStore());
        if (store[recHash]) {
            delete store[recHash];
            saveBetAttemptStore(store);
        }
    }

    function isScriptDedupBlocked(option, recHash) {
        return isScriptDedupStored(option, recHash) ||
            isScriptDedupInflight(option, recHash);
    }

    function clearPausedDuplicateBetStep() {
        const step = String(betStep || '');
        if (!step) return;
        if (step.indexOf('请勿手动重复下注') < 0 &&
            step.indexOf('暂停重复下单') < 0 &&
            step.indexOf('等待订单入库确认') < 0 &&
            step.indexOf('等待订单确认') < 0 &&
            step.indexOf('下注可能已成功') < 0) {
            return;
        }
        if (betResult === 'pending' || betResult === 'skipped') {
            betResult = 'pending';
        }
        setBetStep('等待策略盘口与赔率达标');
    }

    function getPendingBetDedupMeta() {
        const inflight = getBetInFlight();
        if (inflight && inflight.recHash) {
            return {
                recHash: String(inflight.recHash),
                at: Number(inflight.at || 0) || Date.now(),
                source: 'inflight',
            };
        }
        const store = pruneBetAttemptStore(loadBetAttemptStore());
        const keys = Object.keys(store);
        let best = null;
        for (let i = 0; i < keys.length; i++) {
            const entry = store[keys[i]];
            if (!entry) continue;
            const at = Number(entry.at || 0) || 0;
            if (!best || at > best.at) {
                best = { recHash: String(keys[i]), at: at, source: 'attempt' };
            }
        }
        return best;
    }

    function findOptionForRecHash(recHash) {
        if (!recHash) return null;
        const want = String(recHash);
        for (let i = 0; i < strategyStates.length; i++) {
            const st = strategyStates[i];
            if (!st || !st.strategy || String(st.strategy.recHash || '') !== want) continue;
            if (!st.testid && !st.plateMatched) continue;
            return buildTargetOption(st);
        }
        for (let j = 0; j < strategyList.length; j++) {
            const strategy = strategyList[j];
            if (!strategy || String(strategy.recHash || '') !== want) continue;
            const picked = pickStrategyButtonMatch(strategy, lastButtonSnapshot, 0);
            if (!picked) continue;
            return {
                testid: picked.testid,
                strategy: strategy,
                side: picked.parsed.side,
                market: picked.parsed.market,
                lineIndex: picked.parsed.lineIndex,
                displayLine: picked.extracted.lineText,
                label: formatTargetOptionLabel(strategy, false),
                minOdds: Number(strategy.plateOddsHit),
                odds: String(picked.extracted.odds),
                button: picked.btn,
                bttsSubstitute: false,
                substitutedFrom: null,
            };
        }
        return null;
    }

    function clearPendingBetDedup(recHash, reason) {
        if (recHash) clearBetAttempt(recHash);
        clearBetInFlight();
        clearPausedDuplicateBetStep();
        if (reason) console.warn('[hty-inplay]', reason, recHash || '');
    }

    /**
     * 防重卡死修复：可下被 inflight 置 0 时 targetOption 为空，原先轮询无法查单，
     * 只能干等 BET_RECOVERY_WINDOW（3 分钟）后才突然下单。
     * 这里用 inflight/attempt 反查策略，确认订单或超时无单后放行重试。
     */
    async function resolvePendingBetDedup() {
        // 超时锁定不依赖防重开关，查单/放行也必须始终跑
        if (placing || matchEndedHandling) return false;
        releaseStaleBetInflight();
        const meta = getPendingBetDedupMeta();
        if (!meta) {
            clearPausedDuplicateBetStep();
            return false;
        }

        let option = findOptionForRecHash(meta.recHash);
        if (!option && targetOption && targetOption.strategy &&
            String(targetOption.strategy.recHash || '') === meta.recHash) {
            option = targetOption;
        }

        if (option) {
            const recovered = await tryRecoverSuccessfulBet(option, meta.at, {
                retries: 2,
                gapMs: 2000,
            });
            if (recovered) {
                lastStrategyBetRecord = recovered;
                placing = true;
                try {
                    await finalizeBetSuccess(option, recovered, true, '防重确认已有订单');
                } finally {
                    placing = false;
                }
                return true;
            }
        }

        if (isBetSubmittedDrawerVisible()) {
            setBetStep('检测到未完成下注抽屉，等待确认…');
            renderPanel(true);
            return false;
        }

        const age = Date.now() - meta.at;
        if (age >= BET_DEDUP_VERIFY_MISS_MS) {
            // 若已因超时写入本地「已执行」，绝不清锁重试（宁可卡死也不重复下单）
            if (meta.recHash && isStrategyLocallyExecuted(meta.recHash)) {
                setBetResult('pending', '超时未确认到订单，已锁定防重');
                setBetStep('下注结果不确定，已锁定不重试（请核对投注记录）');
                renderPanel(true);
                return false;
            }
            clearPendingBetDedup(
                meta.recHash,
                '防重查单无结果，清除标记允许重试 age=' + age + 'ms'
            );
            setBetResult('pending', '上次下注未确认到订单，将重试');
            setBetStep('上次下注未确认到订单，条件满足将重试');
            renderPanel(true);
            return false;
        }

        const leftSec = Math.max(1, Math.ceil((BET_DEDUP_VERIFY_MISS_MS - age) / 1000));
        setBetStep('防重查单中（' + leftSec + 's 无单可重试）…');
        return false;
    }

    function isDefinitiveBetFailure(err) {
        const msg = String(err && err.message ? err.message : err || '');
        // 「等待超时/接口超时」一律视为不确定，禁止当失败清锁重下
        if (/超时|响应超时|等待超时/i.test(msg)) return false;
        return /赔率多次变动|提交未完成|投注按钮不可用|找不到投注|余额不足|键盘缺少|投注单未打开|未找到盘口|金额无效|投注金额无效/i.test(msg);
    }

    function isUncertainBetFailure(err) {
        if (isBetSubmittedDrawerVisible()) return true;
        const msg = String(err && err.message ? err.message : err || '');
        if (isDefinitiveBetFailure(err)) return false;
        return /超时|响应|订单|确认|网络|等待/i.test(msg);
    }

    function loadStakeMode() {
        try {
            const saved = localStorage.getItem(STAKE_MODE_KEY);
            if (saved === '1.0') {
                saveStakeMode('1');
                return '1';
            }
            if (saved && STAKE_MODE_OPTIONS[saved]) return saved;
        } catch (e) { /* ignore */ }
        return 'strategy';
    }

    function formatStakeKeypadInput(val) {
        if (val == null || val === '') return '';
        const raw = String(val).trim();
        const n = Number(raw);
        if (isNaN(n) || n <= 0) return raw;
        // 整数金额按人类习惯输入：1、2、10，绝不输入 1.0 / 2.0
        if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
        // 小数去掉多余尾零：2.50 -> 2.5，0.30 -> 0.3
        if (raw.indexOf('.') >= 0) {
            return raw.replace(/(\.\d*?)0+$/, '').replace(/\.$/, '');
        }
        return String(n).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    }

    function saveStakeMode(mode) {
        try {
            localStorage.setItem(STAKE_MODE_KEY, mode);
        } catch (e) { /* ignore */ }
    }

    function stakeModeLabel(mode) {
        const opt = STAKE_MODE_OPTIONS[mode];
        return opt ? opt.label : String(mode);
    }

    function resolveBetStakeValue(option) {
        if (stakeMode === 'strategy') {
            const strategy = option && option.strategy;
            const amt = strategy && strategy.plateAmount;
            const n = Number(amt);
            if (amt == null || amt === '' || isNaN(n) || n <= 0) {
                throw new Error('策略实际金额不可用');
            }
            return n;
        }
        return STAKE_MODE_OPTIONS[stakeMode].value;
    }

    function resolveBetStakeInput(option) {
        if (stakeMode === 'strategy') {
            return formatStakeKeypadInput(resolveBetStakeValue(option));
        }
        return formatStakeKeypadInput(STAKE_MODE_OPTIONS[stakeMode].input);
    }

    function formatBetStakeSummary(option) {
        if (stakeMode === 'strategy') {
            const strategy = option && option.strategy;
            if (strategy && strategy.plateAmount != null) {
                return '策略金额 ' + formatOddsDisplay(strategy.plateAmount);
            }
            return '策略金额 —';
        }
        return stakeModeLabel(stakeMode);
    }
    let lastEnsureMarketViewAt = 0;
    let lastEnsureMarketCategoryTabAt = 0;
    let lastInplayNavAt = 0;
    (function initPersistedInplayNavAt() {
        try {
            lastInplayNavAt = parseInt(sessionStorage.getItem(LAST_INPLAY_NAV_AT_KEY) || '0', 10) || 0;
        } catch (e) { /* ignore */ }
    })();
    let lastPageKeepaliveAt = 0;
    let lastMatchRotateAt = 0;
    let inplayWatchTimer = null;
    let pageSwitchTimer = null;
    let listPageKeepAliveBooted = false;
    let listPageEnterMatchActive = false;
    let listPageEnterAttempts = 0;

    function isInplayListPage() {
        const path = window.location.pathname.replace(/\/$/, '');
        return /\/sportEvents\/inplay\/football$/i.test(path);
    }

    function isStrandedSportEventsPage() {
        const path = window.location.pathname.replace(/\/$/, '') || '/';
        return path === '/sportEvents';
    }

    /** 电竞/篮球等非足球版块：脚本需强制拉回足球滚球 */
    function isWrongSportSectionPage() {
        const path = window.location.pathname.replace(/\/$/, '') || '/';
        if (!/^\/sportEvents\//i.test(path)) return false;
        if (/\/sportEvents\/(?:inplay|incoming)\/football/i.test(path)) return false;
        if (path === '/sportEvents') return false;
        return true;
    }

    /** 凡进入电竞等非足球页：自动跳转已关闭，仅打日志 */
    function recoverFromWrongSportSection(reason) {
        if (!isWrongSportSectionPage()) return false;
        console.warn('[hty-inplay] 检测到非足球版块，自动拉回已禁用',
            reason || '', window.location.pathname + window.location.search);
        return false;
    }

    let wrongSportGuardTimer = null;
    function ensureWrongSportSectionGuard() {
        if (wrongSportGuardTimer) return;
        // 仅监控打日志，不再 replace 跳转
        wrongSportGuardTimer = setInterval(function () {
            if (!isWrongSportSectionPage()) return;
            console.warn('[hty-inplay] 仍在非足球版块（不自动跳转）', window.location.pathname);
        }, 30000);
    }

    function resolveStrandedTargetMatchId() {
        if (isUserManualMatchLockActive()) return String(userManualMatchId);
        const saved = sessionStorage.getItem(KEEPALIVE_TARGET_MATCH_ID_KEY) ||
            sessionStorage.getItem(KEEPALIVE_MATCH_ID_KEY) || '';
        if (saved) return String(saved);
        try {
            const returnUrl = sessionStorage.getItem(KEEPALIVE_RETURN_URL_KEY) || '';
            const m = returnUrl.match(/\/match\/(\d+)/i);
            if (m) return m[1];
        } catch (e) { /* ignore */ }
        return '';
    }

    function bootStrandedSportEventsPage() {
        void ensureStrandedSportEventsBoot();
    }

    async function ensureStrandedSportEventsBoot() {
        if (!isStrandedSportEventsPage()) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', function () {
                void ensureStrandedSportEventsBoot();
            }, { once: true });
            return;
        }
        matchId = '';
        if (!document.getElementById(PANEL_ID)) {
            createPanel();
            if (!document.getElementById(PANEL_ID)) return;
        }
        if (!started) {
            started = true;
            betStep = '赛事总览页：点击策略赛事可跳转';
            betResult = 'pending';
            scheduleLoginWatch();
            scheduleHeartbeat();
            setInterval(function () {
                loginCache.ts = 0;
                if (isLoggedIn() || reloginInProgress) return;
                tryAutoRelogin({ lite: true }).catch(function (e) {
                    console.warn('[hty-inplay] 总览页自动登录', e);
                });
            }, RELOGIN_WATCH_MS);
        }
        setupRouteWatcher();
        if (matchesStatus === 'loading' || !activeMatches.length) {
            try {
                await loadActiveMatches(false);
                await scanAllMatchesRuleMeet(true);
                renderPanel(true);
            } catch (e) {
                console.warn('[hty-inplay] 总览页加载赛事失败', e);
            }
        } else {
            renderPanel(true);
        }
        if (await maybeEnterMatchFromHubPage('总览页进入策略比赛')) return;
    }

    async function startStrandedPage() {
        if (recoverFromBlockedAccessPage()) return;
        await ensureStrandedSportEventsBoot();
    }

    function rememberCurrentMatchReturnUrl() {
        if (!matchId || !isOnInplayMatchPage()) return;
        try {
            let href = window.location.href;
            try {
                const u = new URL(href);
                if (u.searchParams.has('_tm')) {
                    u.searchParams.delete('_tm');
                    href = u.toString();
                }
            } catch (e) { /* ignore */ }
            sessionStorage.setItem(KEEPALIVE_RETURN_URL_KEY, href);
            sessionStorage.setItem(KEEPALIVE_MATCH_ID_KEY, String(matchId));
        } catch (e) { /* ignore */ }
    }

    function recoverStrandedFromMatchContext() {
        if (isUserManualMatchLockActive()) {
            const tab = getActiveMarketCategoryTab();
            const tabArg = tab && tab !== 'all' ? tab : null;
            if (!matchId || String(matchId) !== String(userManualMatchId)) {
                console.warn('[hty-inplay] 偏离用户所选赛事，跳回', userManualMatchId);
                gotoInplayMatch(userManualMatchId, tabArg);
                return true;
            }
        }
        if (!matchId) return false;
        const tab = getActiveMarketCategoryTab();
        const tabArg = tab && tab !== 'all' ? tab : null;
        console.warn('[hty-inplay] URL偏离赛事页，跳回', matchId, tab || 'all');
        if (typeof setBetStep === 'function') {
            setBetStep('页面偏离，返回赛事…');
            if (typeof renderPanel === 'function') renderPanel(true);
        }
        gotoInplayMatch(matchId, tabArg);
        return true;
    }

    function inplayListUrl() {
        // 保留函数名兼容旧调用，但永不返回列表地址
        console.error('[hty-inplay] inplayListUrl 已禁用：禁止跳转 /sportEvents/inplay/football');
        return '';
    }

    function isForbiddenInplayListUrl(url) {
        return modIsForbiddenInplayListUrl(url);
    }

    function rewriteAwayFromInplayList(url, reason) {
        if (!isForbiddenInplayListUrl(url)) return url;
        const mid = resolveStrandedTargetMatchId() || matchId || getMatchIdFromUrl() || '';
        if (mid) {
            const fixed = inplayMatchUrl(mid);
            console.warn('[hty-inplay] 拦截滚球列表跳转，改为比赛页', reason || '', url, '->', fixed);
            return fixed;
        }
        console.error('[hty-inplay] 拦截滚球列表跳转且无目标比赛，取消导航', reason || '', url);
        return '';
    }

    function findSidebarFootballLink() {
        // 只接受「比赛页」链接；纯列表 href 一律忽略（禁止点进列表）
        const anchors = document.querySelectorAll('a[href*="/football/match/"]');
        for (let i = 0; i < anchors.length; i++) {
            const href = anchors[i].getAttribute('href') || '';
            if (isForbiddenInplayListUrl(href)) continue;
            if (/\/sportEvents\/(?:inplay|incoming)\/football\/match\/\d+/i.test(href) &&
                isElementVisible(anchors[i])) {
                return anchors[i];
            }
        }
        return null;
    }

    function clickSidebarFootball() {
        if (!AUTO_PAGE_NAV_ENABLED) {
            console.warn('[hty-inplay] 侧栏点击进场已禁用');
            return false;
        }
        // 永不回滚球列表：有目标就直跳比赛，否则不动
        const targetId = resolveStrandedTargetMatchId();
        if (targetId) {
            console.warn('[hty-inplay] 保活：侧栏改直跳比赛', targetId);
            try { sessionStorage.removeItem(KEEPALIVE_PHASE_KEY); } catch (e) { /* ignore */ }
            return performPageNavigation(inplayMatchUrl(targetId), '侧栏直跳比赛', targetId);
        }
        const el = findSidebarFootballLink();
        if (el) {
            const href = String((el.getAttribute && el.getAttribute('href')) || el.href || '');
            if (href && !isForbiddenInplayListUrl(href) && href.indexOf('/match/') >= 0) {
                console.log('[hty-inplay] 保活：点击侧边栏比赛链接', href);
                safeClick(el);
                return true;
            }
        }
        console.warn('[hty-inplay] 保活：无目标比赛，禁止跳转滚球列表');
        return false;
    }

    function clickMatchOnInplayList(targetId, home, away) {
        if (!AUTO_PAGE_NAV_ENABLED) return false;
        // 列表进场不因登录误判永久卡住；仅登录弹窗可见时暂缓
        if (isLoginUiBusy()) {
            console.log('[hty-inplay] 登录弹窗中，暂缓列表点击进场', targetId || '');
            return false;
        }
        if (targetId) {
            const links = document.querySelectorAll(
                'a[href*="/sportEvents/inplay/football/match/' + targetId + '"], ' +
                'a[href*="/sportEvents/incoming/football/match/' + targetId + '"], ' +
                '[href*="/sportEvents/inplay/football/match/' + targetId + '"], ' +
                '[href*="/sportEvents/incoming/football/match/' + targetId + '"]'
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
                if (!clickEl || !isElementVisible(clickEl)) continue;
                const href = String(clickEl.href || clickEl.getAttribute('href') || '');
                if (href && href.indexOf('/football/match/') < 0) continue;
                safeClick(clickEl);
                return true;
            }
        }
        const links = document.querySelectorAll(
            'a[href*="/sportEvents/inplay/football/match/"], a[href*="/sportEvents/incoming/football/match/"]'
        );
        for (let i = 0; i < links.length; i++) {
            if (!isElementVisible(links[i])) continue;
            const href = links[i].href || links[i].getAttribute('href') || '';
            if (!targetId || href.indexOf('/match/' + targetId) >= 0) {
                safeClick(links[i]);
                return true;
            }
        }
        return false;
    }

    function countInplayListMatchLinks() {
        const links = document.querySelectorAll(
            'a[href*="/sportEvents/inplay/football/match/"], a[href*="/sportEvents/incoming/football/match/"]'
        );
        let count = 0;
        for (let i = 0; i < links.length; i++) {
            if (isElementVisible(links[i])) count += 1;
        }
        return count;
    }

    function finishListPageEnterMatch(fallbackId, reason) {
        listPageEnterMatchActive = false;
        listPageEnterAttempts = 0;
        sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
        if (fallbackId) {
            gotoInplayMatchDirect(fallbackId, null, reason || '列表页直跳比赛', { force: true });
        }
    }

    function bootListPageEnterMatch() {
        if (!AUTO_PAGE_NAV_ENABLED) {
            console.log('[hty-inplay] 列表自动进场已禁用');
            return;
        }
        if (listPageEnterMatchActive) return;
        if (!canPerformPageNavigation('list-enter-boot')) return;
        listPageEnterMatchActive = true;
        listPageEnterAttempts = 0;
        const targetId = (isUserManualMatchLockActive() ? userManualMatchId : '') ||
            sessionStorage.getItem(KEEPALIVE_TARGET_MATCH_ID_KEY) ||
            sessionStorage.getItem(KEEPALIVE_MATCH_ID_KEY) ||
            resolveStrandedTargetMatchId() || '';
        const home = sessionStorage.getItem(KEEPALIVE_TARGET_HOME_KEY) || '';
        const away = sessionStorage.getItem(KEEPALIVE_TARGET_AWAY_KEY) || '';
        const maxAttempts = 6;

        async function tryClick() {
            if (!isInplayListPage()) {
                listPageEnterMatchActive = false;
                listPageEnterAttempts = 0;
                return;
            }
            if (isLoginUiBusy()) {
                setTimeout(tryClick, 1200);
                return;
            }
            if (!canPerformPageNavigation('list-enter-try')) {
                listPageEnterMatchActive = false;
                listPageEnterAttempts = 0;
                return;
            }
            listPageEnterAttempts += 1;
            if (listPageEnterAttempts > maxAttempts) {
                console.warn('[hty-inplay] 列表页进入比赛超时', targetId);
                finishListPageEnterMatch(targetId, '列表页超时直跳');
                return;
            }
            if (countInplayListMatchLinks() > 0) {
                await humanDelay(600, 1200);
                if (clickMatchOnInplayList(targetId, home, away)) {
                    console.log('[hty-inplay] 列表页已点击比赛', targetId);
                    listPageEnterMatchActive = false;
                    listPageEnterAttempts = 0;
                    try { sessionStorage.removeItem(KEEPALIVE_PHASE_KEY); } catch (e) { /* ignore */ }
                    // 若点击无效，45s 硬冷却后再由定时器重试，不再 1.8s 连环直跳
                    return;
                }
            }
            setTimeout(tryClick, 2000);
        }

        if (document.body) tryClick();
        else document.addEventListener('DOMContentLoaded', tryClick);
    }

    async function ensureListPageBoot() {
        if (!isInplayListPage()) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', function () {
                void ensureListPageBoot();
            }, { once: true });
            return;
        }
        matchId = '';
        if (!document.getElementById(PANEL_ID)) {
            createPanel();
            if (!document.getElementById(PANEL_ID)) return;
        }
        if (!started) {
            started = true;
            betStep = '滚球列表页，准备进入比赛…';
            betResult = 'pending';
            scheduleLoginWatch();
        }
        setupRouteWatcher();
        bootListPageKeepAlive();
        if (matchesStatus === 'loading' || !activeMatches.length) {
            try {
                await loadActiveMatches(false);
                renderPanel(true);
            } catch (e) {
                console.warn('[hty-inplay] 列表页加载赛事失败', e);
            }
        } else {
            renderPanel(true);
        }
        // 不再启动即强制直跳；交给保活 phase / 定时器（受硬冷却约束）
    }

    function bootListPageKeepAlive() {
        if (listPageKeepAliveBooted) return;
        listPageKeepAliveBooted = true;
        function checkListIdleModal() {
            if (!document.body) return;
            if (!findVisibleDialogContaining([IDLE_LOGIN_HINT, '重新登录']) &&
                !findVisibleDialogContaining(['温馨提示', IDLE_LOGIN_HINT])) {
                return;
            }
            const btn = findModalConfirmButton(['温馨提示', IDLE_LOGIN_HINT]) ||
                findModalConfirmButton([IDLE_LOGIN_HINT, '重新登录']);
            if (btn) btn.click();
            else {
                const nodes = document.querySelectorAll('button, [role="button"]');
                for (let i = 0; i < nodes.length; i++) {
                    const label = (nodes[i].textContent || '').replace(/\s+/g, '');
                    if (label === '确定') {
                        nodes[i].click();
                        break;
                    }
                }
            }
            console.warn('[hty-inplay] 列表页检测到闲置登出弹窗');
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

        const phase = getKeepalivePhase();
        if (phase === KEEPALIVE_PHASE_ENTER) {
            console.log('[hty-inplay] 列表页保活：等待进入策略比赛');
            bootListPageEnterMatch();
        }

        async function listPageNavigateToKickoffMatch() {
            if (!AUTO_PAGE_NAV_ENABLED) return;
            if (!isInplayListPage()) return;
            if (isLoginUiBusy()) return;
            if (listPageEnterMatchActive) return;
            if (!canPerformPageNavigation('list-kickoff')) return;
            try {
                await loadActiveMatches(true);
                await scanAllMatchesRuleMeet(true);
                renderPanel(true);
                const navigable = getNavigableInPlayMatches();
                if (!navigable.length) {
                      setBetStep('列表页：暂无进行中且已达标的比赛');
                      renderPanel(true);
                      return;
                  }
                  if (!shouldBlockMatchAutoNav() && !isUserManualMatchLockActive() &&
                      hasNavigableInPlayMatches()) {
                      // 有可进场次时解除「无比赛」静默，但不清硬冷却
                      if (navSuppressedUntil && Date.now() < navSuppressedUntil) {
                          const remain = navSuppressedUntil - Date.now();
                          if (remain <= NAV_SUPPRESS_NO_INPLAY_MS) navSuppressedUntil = 0;
                      }
                  }
                  const savedId = resolveStrandedTargetMatchId();
                  let targetId = '';
                  if (savedId && !isMatchLocallyEnded(savedId)) {
                      const savedItem = activeMatches.find(function (m) {
                          return String(m.matchId) === String(savedId);
                      });
                      if (savedItem && matchHasNavigablePendingWork(savedItem)) {
                          targetId = savedId;
                      }
                  }
                  if (!targetId) {
                      targetId = pickPreferredNavigableMatch('', '', activeMatches);
                  }
                  if (!targetId) return;
                  const targetItem = activeMatches.find(function (m) {
                      return String(m.matchId) === String(targetId);
                  });
                  if (!targetItem || !matchHasNavigablePendingWork(targetItem)) {
                      setBetStep('列表页：目标场无已达标策略，跳过进场');
                      renderPanel(true);
                      return;
                  }
                  if (isKeepaliveEnterMatchPhase()) {
                      if (!listPageEnterMatchActive) bootListPageEnterMatch();
                      return;
                  }
                  console.log('[hty-inplay] 列表页：进入策略比赛', targetId);
                  if (clickMatchOnInplayList(targetId, '', '')) return;
                  gotoInplayMatchDirect(targetId, null, '列表页进入策略比赛', { force: true });
            } catch (e) {
                console.warn('[hty-inplay] 列表页检测开赛失败', e);
            }
        }

        setInterval(listPageNavigateToKickoffMatch, Math.max(INPLAY_MATCH_WATCH_MS, 30000));
        setTimeout(function () {
            if (document.body) listPageNavigateToKickoffMatch();
        }, 2500);
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
        if (shouldBlockProgrammaticNavClick(el)) {
            console.warn('[hty-inplay] 拦截程序化导航点击',
                (el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-testid'))) ||
                (el.textContent || '').slice(0, 40));
            return false;
        }
        el.click();
        return true;
    }

    function shouldBlockProgrammaticNavClick(el) {
        if (AUTO_PAGE_NAV_ENABLED) return false;
        if (!el || !el.closest) return false;
        const a = el.closest('a[href]');
        if (!a) return false;
        const href = String(a.getAttribute('href') || '').trim();
        if (!href || href === '#' || href.indexOf('javascript:') === 0) return false;
        // 面板内选场由 preventDefault + openInplayMatchPage 处理，不应走到这里
        if (a.closest && a.closest('#' + PANEL_ID)) return false;
        try {
            const u = new URL(href, window.location.origin);
            if (u.origin !== window.location.origin) return true;
            const path = String(u.pathname || '');
            // 任何会离开当前 path 的 sportEvents 链接都禁止程序化点击
            if (/\/sportEvents\//i.test(path) && path !== window.location.pathname) return true;
            if (/eSport|Esport|basketball|tennis|volleyball|baseball/i.test(path)) return true;
        } catch (e) {
            return true;
        }
        return false;
    }

    function robustClick(el) {
        if (!el) return false;
        if (shouldBlockProgrammaticNavClick(el)) {
            console.warn('[hty-inplay] 拦截 robust 导航点击');
            return false;
        }
        try {
            el.scrollIntoView({ block: 'center', behavior: 'auto' });
        } catch (e) {}
        const opts = { bubbles: true, cancelable: true, view: window };
        try {
            if (typeof PointerEvent === 'function') {
                el.dispatchEvent(new PointerEvent('pointerdown', opts));
                el.dispatchEvent(new PointerEvent('pointerup', opts));
            }
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            if (!el.disabled) el.click();
        } catch (e) {
            try {
                if (!el.disabled) el.click();
            } catch (e2) {}
        }
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

    async function ensureBetCartVisible() {
        if (!isCartOpen()) return false;
        // 投注单已打开时不要点悬浮球：多数页面会 toggle 关掉抽屉
        const cart = getSportCartRoot();
        if (cart && isElementVisible(cart)) {
            try {
                cart.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            } catch (e) { /* ignore */ }
            await humanDelay(200, 400);
        }
        await ensureOddsChangeAccepted();
        return isCartOpen();
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

        await ensureOddsChangeAccepted();
        await focusBetInput(cart);

        const text = formatStakeKeypadInput(amount);
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
        const byTestId = document.querySelector('[data-testid="sport-cart-bet-button"]')
            || document.querySelector('[data-testid="sport-cart-submit-bet-btn"]');
        if (byTestId && isElementVisible(byTestId)) return byTestId;

        const cart = getSportCartRoot();
        if (!cart || !isElementVisible(cart)) return null;
        const nodes = cart.querySelectorAll('button, [role="button"]');
        let best = null;
        let bestScore = -1;
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el) || el.disabled) continue;
            const t = normalizeHintText(buttonText(el));
            if (!t) continue;
            const isAccept = t.indexOf('接受更改') >= 0 || t.indexOf('接受变更') >= 0 ||
                /acceptchange/i.test(t);
            const isBet = t === '投注' || t.indexOf('确认投注') >= 0 || t.indexOf('立即投注') >= 0;
            if (!isAccept && !isBet) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 24) continue;
            // 优先底部大按钮（接受更改 / 投注）
            const score = (isAccept ? 1000000 : 0) + rect.top * 10 + rect.width * rect.height;
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }
        return best;
    }

    function buttonText(btn) {
        return (btn && btn.textContent ? btn.textContent : '').trim();
    }

    function isAcceptChangesBtn(btn) {
        const t = normalizeHintText(buttonText(btn));
        if (!t) return false;
        if (t.indexOf('已提交') >= 0) return false;
        return t.indexOf('接受更改') >= 0 ||
            t.indexOf('接受变更') >= 0 ||
            (t.indexOf('接受') >= 0 && t.indexOf('更改') >= 0) ||
            /accept\s*change/i.test(buttonText(btn) || '');
    }

    function needsAcceptOddsChange() {
        const actionBtn = findBetActionButton();
        if (actionBtn && isAcceptChangesBtn(actionBtn)) return true;
        return isOddsChangedModalVisible();
    }

    async function clickAcceptOddsChangeButton() {
        let actionBtn = findBetActionButton();
        if (actionBtn && isAcceptChangesBtn(actionBtn) && isElementVisible(actionBtn)) {
            setBetStep('赔率已更改，点击接受更改…');
            renderPanel(true);
            await humanScrollTo(actionBtn);
            robustClick(actionBtn);
            await humanDelay(600, 1100);
            return true;
        }
        const cart = getSportCartRoot();
        if (cart && textHasOddsChangeHint(cart.textContent || '')) {
            const inCart = findConfirmInRoot(cart, ODDS_CHANGE_CONFIRM_LABELS);
            if (inCart && isElementVisible(inCart)) {
                setBetStep('赔率已更改，点击接受更改…');
                renderPanel(true);
                await humanScrollTo(inCart);
                robustClick(inCart);
                await humanDelay(600, 1100);
                return true;
            }
        }
        const fallback = findOddsChangedConfirmButton();
        if (fallback && isElementVisible(fallback)) {
            setBetStep('赔率已更改，点击接受更改…');
            renderPanel(true);
            await humanScrollTo(fallback);
            robustClick(fallback);
            await humanDelay(600, 1100);
            return true;
        }
        return false;
    }

    function isInsufficientBalanceText(text) {
        return /insufficient|余额不足|余额|deposit|充值/i.test(text || '');
    }

    async function submitBetSlip(stakeInput, onAcceptOddsChange) {
        for (let attempt = 0; attempt < 8; attempt++) {
            if (!isCartOpen()) {
                const opened = await openBetDrawer();
                if (!opened) throw new Error('投注单未打开');
            }
            await ensureBetCartVisible();

            if (isBetSubmittedDrawerVisible()) return true;

            if (needsAcceptOddsChange()) {
                setBetStep('赔率已更改，点击接受更改…');
                renderPanel(true);
                const accepted = await clickAcceptOddsChangeButton();
                if (!accepted) await dismissOddsChangedModalIfAny();
                if (typeof onAcceptOddsChange === 'function') onAcceptOddsChange();
                await humanDelay(600, 1100);
                // 「接受更改」常等同于确认并提交
                if (isBetSubmittedDrawerVisible()) return true;
                if (!needsAcceptOddsChange()) {
                    const afterBtn = findBetActionButton();
                    // 接受后若已无投注按钮（成功页/关闭），交给结果等待
                    if (!afterBtn || afterBtn.disabled) return true;
                    // 若按钮变回「投注」，继续循环点击提交
                }
                if (stakeInput && needsAcceptOddsChange() === false && findBetActionButton() &&
                    !isAcceptChangesBtn(findBetActionButton())) {
                    try { await enterAmountViaKeypad(stakeInput); } catch (e) { /* keep going */ }
                }
                continue;
            }

            const btn = await waitFor(findBetActionButton, 8000, 300);
            if (!btn) {
                if (isBetSubmittedDrawerVisible()) return true;
                throw new Error('找不到投注按钮');
            }
            const text = buttonText(btn);

            if (isAcceptChangesBtn(btn)) {
                await clickAcceptOddsChangeButton();
                if (typeof onAcceptOddsChange === 'function') onAcceptOddsChange();
                await humanDelay(600, 1100);
                if (isBetSubmittedDrawerVisible()) return true;
                continue;
            }

            if (btn.disabled) throw new Error('投注按钮不可用');
            if (isInsufficientBalanceText(text)) throw new Error(text);

            setBetStep('点击投注按钮提交');
            renderPanel(true);
            await humanScrollTo(btn);
            robustClick(btn);
            await humanDelay(600, 1100);

            if (isBetSubmittedDrawerVisible()) return true;
            if (needsAcceptOddsChange()) {
                setBetStep('提交后赔率已更改，点击接受更改…');
                renderPanel(true);
                if (typeof onAcceptOddsChange === 'function') onAcceptOddsChange();
                await clickAcceptOddsChangeButton();
                await humanDelay(600, 1100);
                if (isBetSubmittedDrawerVisible()) return true;
                continue;
            }
            return true;
        }
        throw new Error('赔率多次变动，提交未完成');
    }

    function getSportCartFloatBtn() {
        return document.querySelector('[data-testid="sport-cart-float-btn"]');
    }

    function getSportCartItemCount() {
        const floatBtn = getSportCartFloatBtn();
        if (!floatBtn) return 0;
        const texts = floatBtn.querySelectorAll('span, div, small, strong');
        for (let i = 0; i < texts.length; i++) {
            const t = (texts[i].textContent || '').trim();
            if (/^[1-9]\d{0,1}$/.test(t)) return parseInt(t, 10);
        }
        return 0;
    }

    async function openBetDrawer() {
        if (isCartOpen()) return true;

        const floatBtn = getSportCartFloatBtn();
        for (let i = 0; i < 4; i++) {
            if (isCartOpen()) return true;
            if (floatBtn && isElementVisible(floatBtn)) {
                await humanScrollTo(floatBtn);
                robustClick(floatBtn);
                await humanDelay(500, 900);
            }
            if (isCartOpen()) return true;
            await sleep(300);
        }

        const option = targetOption;
        if (option && option.button && getSportCartItemCount() === 0) {
            safeClick(option.button);
            await humanDelay(600, 1100);
        }

        return isCartOpen();
    }

    async function ensureMarketView(force) {
        const now = Date.now();
        let oddsCount = countOddsButtons();
        if (!force && oddsCount >= 3 && now - lastEnsureMarketViewAt < ENSURE_MARKET_VIEW_GAP_MS) {
            return;
        }
        lastEnsureMarketViewAt = now;
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

        oddsCount = countOddsButtons();
        if (oddsCount < 3 && classic && classic.getAttribute('aria-pressed') !== 'true') {
            await pressTab(classic);
            oddsCount = countOddsButtons();
        }
        if (oddsCount < 3 && quick && quick.getAttribute('aria-pressed') !== 'true') {
            await pressTab(quick);
        }
    }

    function strategyMarketNeedsTgTab(market) {
        return !!TG_CATEGORY_STRATEGY_MARKETS[String(market || '').toLowerCase()];
    }

    function buildMatchMarketUrl(tab) {
        if (!isOnMatchBetPage() || !matchId) {
            return matchBetUrl(matchId || resolveStrandedTargetMatchId(), tab);
        }
        const u = new URL(window.location.href);
        u.searchParams.delete('_tm');
        u.searchParams.set('type', 'market');
        if (tab) u.searchParams.set('tab', String(tab).toLowerCase());
        return u.toString();
    }

    function getActiveMarketCategoryTab() {
        try {
            const tab = new URL(window.location.href).searchParams.get('tab');
            if (tab) return String(tab).toLowerCase();
        } catch (e) { /* ignore */ }
        return 'all';
    }

    function marketCategoryTabLabel(tab) {
        const t = String(tab || '').toLowerCase();
        if (t === 'tg') return '进球';
        if (t === 'all') return '全部';
        if (t === 'ah') return '让球';
        return t || '全部';
    }

    function hasPendingTgCategoryPlateScan() {
        return strategyList.some(function (item) {
            if (!strategyNeedsPlateScan(item)) return false;
            return strategyMarketNeedsTgTab(item.market);
        });
    }

    function isScriptCategoryTabSwitchRecent() {
        return Date.now() - scriptCategoryTabSwitchAt < SCRIPT_TAB_SWITCH_GRACE_MS;
    }

    function isUserManualCategoryTabActive() {
        if (!userManualCategoryTabAt || !userManualCategoryTab) return false;
        if (Date.now() - userManualCategoryTabAt > USER_MANUAL_CATEGORY_TAB_GRACE_MS) {
            clearUserManualCategoryTabLock();
            return false;
        }
        return true;
    }

    function markUserManualCategoryTab(tab) {
        const t = String(tab || '').toLowerCase();
        if (!t || t === MARKET_CATEGORY_TG) {
            clearUserManualCategoryTabLock();
            return;
        }
        userManualCategoryTab = t;
        userManualCategoryTabAt = Date.now();
        try {
            sessionStorage.setItem(USER_MANUAL_CATEGORY_TAB_KEY, userManualCategoryTab);
            sessionStorage.setItem(USER_MANUAL_CATEGORY_TAB_AT_KEY, String(userManualCategoryTabAt));
        } catch (e) { /* ignore */ }
        console.log('[hty-inplay] 用户手动选择 tab=' + t + '，暂停自动切换');
    }

    function clearUserManualCategoryTabLock() {
        userManualCategoryTabAt = 0;
        userManualCategoryTab = '';
        try {
            sessionStorage.removeItem(USER_MANUAL_CATEGORY_TAB_KEY);
            sessionStorage.removeItem(USER_MANUAL_CATEGORY_TAB_AT_KEY);
        } catch (e) { /* ignore */ }
    }

    function markUserManualMatch(id) {
        const mid = String(id || '');
        if (!mid) return;
        userManualMatchId = mid;
        userManualMatchAt = Date.now();
        try {
            sessionStorage.setItem(USER_MANUAL_MATCH_ID_KEY, userManualMatchId);
            sessionStorage.setItem(USER_MANUAL_MATCH_AT_KEY, String(userManualMatchAt));
        } catch (e) { /* ignore */ }
        navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + 60000);
        try {
            sessionStorage.setItem(KEEPALIVE_TARGET_MATCH_ID_KEY, userManualMatchId);
            sessionStorage.setItem(KEEPALIVE_MATCH_ID_KEY, userManualMatchId);
        } catch (e) { /* ignore */ }
        console.log('[hty-inplay] 用户手动选择赛事', mid + '，短时防回跳');
    }

    function isRuleMeetNavReason(reason) {
        const r = String(reason || '');
        return r.indexOf('规则已达标') >= 0 || r.indexOf('ruleMeet') >= 0;
    }

    function clearUserManualMatchLock() {
        userManualMatchId = '';
        userManualMatchAt = 0;
        try {
            sessionStorage.removeItem(USER_MANUAL_MATCH_ID_KEY);
            sessionStorage.removeItem(USER_MANUAL_MATCH_AT_KEY);
        } catch (e) { /* ignore */ }
    }

    function isUserManualMatchLockActive() {
        if (!userManualMatchId || !userManualMatchAt) return false;
        if (Date.now() - userManualMatchAt > USER_MANUAL_MATCH_GRACE_MS) {
            clearUserManualMatchLock();
            return false;
        }
        return true;
    }

    function isUserManualMatchActive() {
        return isUserManualMatchLockActive() &&
            String(matchId) === String(userManualMatchId);
    }

    function shouldBlockAutoMatchNavigation(targetId, reason) {
        if (isRuleMeetNavReason(reason)) return false;
        if (!isUserManualMatchLockActive()) return false;
        return String(targetId) !== String(userManualMatchId);
    }

    function isUserManualMatchPickReason(reason) {
        return String(reason || '').indexOf('用户选择') >= 0;
    }

    function noteScriptCategoryTabSwitch() {
        scriptCategoryTabSwitchAt = Date.now();
    }

    function syncUserManualCategoryTabFromUrl(prevTab, nextTab) {
        const next = String(nextTab || '').toLowerCase();
        const prev = String(prevTab || '').toLowerCase();
        if (!next || next === prev) return;
        if (isScriptCategoryTabSwitchRecent()) return;
        if (next === MARKET_CATEGORY_TG) {
            clearUserManualCategoryTabLock();
            return;
        }
        markUserManualCategoryTab(next);
    }

    function setupManualCategoryTabWatch() {
        if (manualCategoryTabWatchReady) return;
        manualCategoryTabWatchReady = true;
        const labelToTab = {
            '全部': 'all',
            '进球': MARKET_CATEGORY_TG,
            '让球': 'ah',
        };
        document.addEventListener('click', function (e) {
            if (!isOnInplayMatchPage()) return;
            const el = e.target && e.target.closest('button, a, [role="tab"], [role="button"], div, span');
            if (!el || !isElementVisible(el)) return;
            if (isScriptCategoryTabSwitchRecent()) return;
            const text = (el.textContent || '').replace(/\s+/g, '');
            const tab = labelToTab[text];
            if (!tab) return;
            if (tab === MARKET_CATEGORY_TG) {
                clearUserManualCategoryTabLock();
            } else {
                markUserManualCategoryTab(tab);
            }
        }, true);
        if (isOnInplayMatchPage()) {
            lastWatchedCategoryTab = getActiveMarketCategoryTab();
        }
    }

    function clickMarketCategoryTab(tab) {
        const tabId = String(tab || '').toLowerCase();
        const label = marketCategoryTabLabel(tabId);
        // 只在盘口分类区域精确匹配，禁止 data-testid 子串误点（曾用 indexOf('tg') 极易误点导航）
        const roots = [
            document.querySelector('[data-testid="SportExhaustivePage"]'),
            document.querySelector('[data-testid="SportCart"]'),
            document.body,
        ].filter(Boolean);
        const seen = {};
        for (let r = 0; r < roots.length; r++) {
            const nodes = roots[r].querySelectorAll(
                'button, a, [role="tab"], [role="button"]'
            );
            for (let i = 0; i < nodes.length; i++) {
                const el = nodes[i];
                if (!el || seen[el]) continue;
                seen[el] = true;
                if (!isElementVisible(el)) continue;
                if (el.closest && el.closest('#' + PANEL_ID)) continue;
                const tid = (el.getAttribute('data-testid') || '').toLowerCase();
                if (tid && tid !== tabId) continue;
                if (tid === tabId) {
                    safeClick(el);
                    return true;
                }
                const text = (el.textContent || '').replace(/\s+/g, '');
                if (text === label && text.length <= 6) {
                    safeClick(el);
                    return true;
                }
            }
            if (roots[r] === document.body) break;
        }
        return false;
    }

    async function ensureMarketCategoryTab(force, forAutoBet, requireTgOnly) {
        if (!forAutoBet && isUserManualCategoryTabActive()) return;
        const needsTg = forAutoBet ? !!requireTgOnly :
            (!isUserManualCategoryTabActive() && (
                force ||
                hasPendingTgCategoryPlateScan() ||
                (targetOption && targetOption.strategy &&
                    strategyMarketNeedsTgTab(targetOption.strategy.market))
            ));
        if (!needsTg) return;
        if (!isOnInplayMatchPage() || !matchId) return;
        if (!hasNavigableInPlayMatches() || isCurrentMatchEnded()) return;
        if (getActiveMarketCategoryTab() === MARKET_CATEGORY_TG) return;
        const now = Date.now();
        if (!force && !forAutoBet && now - lastEnsureMarketCategoryTabAt < 3000) return;
        lastEnsureMarketCategoryTabAt = now;
        rememberCurrentMatchReturnUrl();
        try {
            noteScriptCategoryTabSwitch();
            if (clickMarketCategoryTab(MARKET_CATEGORY_TG)) {
                await humanDelay(400, 800);
                if (isStrandedSportEventsPage()) {
                    if (shouldAllowAutoNavigation('tab-stranded')) {
                        recoverStrandedFromMatchContext();
                    }
                    return;
                }
                await waitForOddsButtons(1, 10000);
                lastWatchedCategoryTab = MARKET_CATEGORY_TG;
                console.log('[hty-inplay] 已点击 tab=tg' + (forAutoBet ? '（自动投注）' : ''));
                return;
            }
            if (shouldAllowAutoNavigation('tab-tg')) {
                if (isAlreadyOnMatchBetUrl(matchId, MARKET_CATEGORY_TG)) return;
                if (shouldSkipTabTgUrlNav()) {
                    console.log('[hty-inplay] tab=tg URL 跳转冷却中，仅重试点击');
                    return;
                }
                markTabTgUrlNav();
                gotoInplayMatch(matchId, MARKET_CATEGORY_TG);
                lastWatchedCategoryTab = MARKET_CATEGORY_TG;
            }
        } catch (e) {
            console.warn('[hty-inplay] 切换 tab=tg 失败', e);
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
        return String(text || '').trim()
            .replace(/^(?:[OU]|[大小])\s*/i, '')
            .replace(/^大(?=[\d.+-/])/, '')
            .replace(/^小(?=[\d.+-/])/, '');
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

    function getButtonMarketFromTestid(btn) {
        if (!btn) return '';
        const parsed = parseOddsBtnTestid(btn.dataset.testid || '');
        return parsed ? String(parsed.market || '').toLowerCase() : '';
    }

    function getEffectiveButtonMarket(btn) {
        const scope = getButtonMarketScope(btn);
        if (scope) return scope;
        return getButtonMarketFromTestid(btn);
    }

    function isTeamOuMarket(effective) {
        const m = String(effective || '').toLowerCase();
        return m === 'a-ou' || m === 'aou' || m === 'h-ou' || m === 'hou';
    }

    function parseScoreText(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        let m = raw.match(/^(\d+)\s*[-:：]\s*(\d+)$/);
        if (!m) m = raw.match(/(\d{1,2})\s*[-:：]\s*(\d{1,2})/);
        if (!m) return null;
        return {
            home: parseInt(m[1], 10),
            away: parseInt(m[2], 10),
            raw: m[1] + '-' + m[2],
        };
    }

    function isTeamOuHalfLine(strategy) {
        if (!strategy) return false;
        const m = String(strategy.market || '').toLowerCase();
        if (m !== 'hou' && m !== 'aou') return false;
        if (String(strategy.plateOn || '').toLowerCase() !== 'ov') return false;
        const k = canonicalPlateLine(strategy.plateOnK, m);
        const n = parseFloat(k);
        return k === '0.5' || (!isNaN(n) && n === 0.5);
    }

    /** 客已进主队未进时 hou大0.5≈BTTS是；主已进客未进时 aou大0.5≈BTTS是 */
    function getBttsSubstituteKind(strategy, score) {
        if (!score || !isTeamOuHalfLine(strategy)) return '';
        const m = String(strategy.market || '').toLowerCase();
        if (m === 'hou' && score.away >= 1 && score.home === 0) return 'hou';
        if (m === 'aou' && score.home >= 1 && score.away === 0) return 'aou';
        return '';
    }

    function getBttsYesStrategyStub() {
        return { market: 'btts', plateOn: 'y', plateOnK: '', matchId: matchId };
    }

    function applyBttsSubstitutionIfBetter(state, strategy, buttonMap, minOdds, originalPicked) {
        if (!originalPicked || isNaN(originalPicked.extracted.odds)) return;
        const score = getLiveMatchScore();
        if (!getBttsSubstituteKind(strategy, score)) {
            if (isTeamOuHalfLine(strategy) && !score) {
                console.log('[hty-inplay] BTTS替代跳过：读不到比分', strategy.market, strategy.plateOnK);
            }
            return;
        }

        const bttsPicked = pickStrategyButtonMatch(getBttsYesStrategyStub(), buttonMap, minOdds);
        if (!bttsPicked || !bttsPicked.oddsOk) {
            console.log('[hty-inplay] BTTS替代跳过：未找到达标的两队进球按钮',
                '原盘', originalPicked.extracted.odds,
                '比分', score.raw,
                '钮数', buttonMap ? buttonMap.size : 0);
            return;
        }
        if (bttsPicked.extracted.odds <= originalPicked.extracted.odds) {
            console.log('[hty-inplay] BTTS替代跳过：赔率未更高',
                'hou/aou@' + originalPicked.extracted.odds,
                'btts@' + bttsPicked.extracted.odds);
            return;
        }

        state.bttsSubstitute = true;
        state.substitutedFrom = {
            market: strategy.market,
            plateOn: strategy.plateOn,
            plateOnK: strategy.plateOnK != null ? String(strategy.plateOnK) : '',
        };
        state.button = bttsPicked.btn;
        state.testid = bttsPicked.testid;
        state.side = bttsPicked.parsed.side;
        state.market = bttsPicked.parsed.market;
        state.lineIndex = bttsPicked.parsed.lineIndex;
        state.displayLine = bttsPicked.extracted.lineText || '是';
        state.currentOdds = bttsPicked.extracted.odds;
        console.log('[hty-inplay] BTTS替代更高赔率',
            strategy.market, strategy.plateOn, strategy.plateOnK,
            '@' + originalPicked.extracted.odds, '-> btts y @' + bttsPicked.extracted.odds,
            '比分', score.raw);
    }

    function formatTargetOptionLabel(strategy, bttsSubstitute) {
        const base = formatStrategyShort(strategy);
        return bttsSubstitute ? base + ' → 两队进球 是' : base;
    }

    function getOptionBetMarket(option) {
        if (!option) return '';
        if (option.bttsSubstitute) return 'btts';
        if (option.market) return String(option.market).toLowerCase();
        return option.strategy && option.strategy.market
            ? String(option.strategy.market).toLowerCase() : '';
    }

    function getOptionBetPlateOn(option) {
        if (!option) return '';
        if (option.bttsSubstitute) return 'y';
        if (option.side) return parsePageSide(option.side);
        return option.strategy && option.strategy.plateOn
            ? String(option.strategy.plateOn).toLowerCase() : '';
    }

    function marketsMatch(strategyMarket, pageMarket, btn) {
        const sm = String(strategyMarket || '').toLowerCase();
        const pm = String(pageMarket || '').toLowerCase();
        const effective = btn ? getEffectiveButtonMarket(btn) : pm;
        if (sm === pm) {
            if (sm === 'ou' && isTeamOuMarket(effective)) return false;
            if (sm === 'ou' && effective && effective !== 'ou') return false;
            return true;
        }
        if ((sm === 'ad' || sm === '1x2') && (pm === 'ad' || pm === '1x2')) return true;
        if (sm === 'aou' && (pm === 'a-ou' || pm === 'aou')) return true;
        if (sm === 'hou' && (pm === 'h-ou' || pm === 'hou')) return true;
        if (sm === 'aou' && pm === 'ou') {
            return effective === 'a-ou' || effective === 'aou';
        }
        if (sm === 'hou' && pm === 'ou') {
            return effective === 'h-ou' || effective === 'hou';
        }
        if (sm === 'ou' && pm === 'ou') {
            return !effective || effective === 'ou';
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
        if (m === 'aou') return ['a-ou', 'aou'];
        if (m === 'hou') return ['h-ou', 'hou'];
        if (m === 'ou') return ['ou'];
        const pm = pageMarketForStrategy(market);
        return pm ? [pm] : [];
    }

    const MARKET_SECTION_LABEL = {
        'a-ou': '客进球',
        aou: '客进球',
        'h-ou': '主进球',
        hou: '主进球',
        btts: '两队进球',
    };

    const MARKET_CATEGORY_TG = 'tg';
    const TG_CATEGORY_STRATEGY_MARKETS = { hou: 1, aou: 1, btts: 1 };

    function findMarketElementByLabel(label) {
        if (!label || !document.body) return null;
        const nodes = document.querySelectorAll(
            '[data-testid*="MarketTableColTwoContainer-"],' +
            '[data-testid*="ExhaustiveMarketCardWrapper-"]'
        );
        for (let i = 0; i < nodes.length; i++) {
            const container = nodes[i];
            const headings = container.querySelectorAll('h3, h4, span, div');
            for (let j = 0; j < headings.length; j++) {
                const node = headings[j];
                const text = (node.textContent || '').trim();
                if (!text || text.indexOf(label) < 0) continue;
                if (text.length > 24 && text !== label) continue;
                return container;
            }
        }
        return null;
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
                if (/^(?:[OU]|[大小])\s*[\d.+-/]/i.test(t)) {
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

    function hasSplitPlateNotation(val) {
        return /\d\/\d/.test(String(val || ''));
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
        return cs === cd;
    }

    function pickStrategyButtonMatch(strategy, buttonMap, minOdds) {
        const candidates = candidateButtonsForStrategy(strategy, buttonMap);
        let best = null;
        let bestRank = -1;

        for (let i = 0; i < candidates.length; i++) {
            const btn = candidates[i];
            if (btn.disabled) continue;
            const testid = btn.dataset.testid || '';
            const parsed = parseOddsBtnTestid(testid);
            if (!parsed) continue;
            const extracted = extractButtonLineOdds(btn);
            if (!strategyMatchesButton(strategy, parsed, extracted.lineText, btn)) continue;

            const oddsOk = !isNaN(extracted.odds) && extracted.odds >= minOdds;
            let rank = oddsOk ? 100000 : 0;
            rank += Math.min(extracted.odds || 0, 9999) * 10;

            if (rank > bestRank) {
                bestRank = rank;
                best = { btn: btn, testid: testid, parsed: parsed, extracted: extracted, oddsOk: oddsOk };
            }
        }
        return best;
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

    function buildButtonMarketIndex(buttonMap) {
        const index = new Map();
        function addKey(key, btn) {
            if (!index.has(key)) index.set(key, []);
            const list = index.get(key);
            if (list.indexOf(btn) < 0) list.push(btn);
        }
        buttonMap.forEach(function (btn, testid) {
            const parsed = parseOddsBtnTestid(testid);
            if (!parsed) return;
            const side = parsePageSide(parsed.side);
            const mid = String(parsed.matchId);
            const parsedMarket = String(parsed.market).toLowerCase();
            const effective = getEffectiveButtonMarket(btn);
            addKey(mid + '|' + parsedMarket + '|' + side, btn);
            if (effective && effective !== parsedMarket) {
                addKey(mid + '|' + effective + '|' + side, btn);
            }
            if (effective === 'h-ou' || effective === 'hou') {
                addKey(mid + '|h-ou|' + side, btn);
                addKey(mid + '|hou|' + side, btn);
            }
            if (effective === 'a-ou' || effective === 'aou') {
                addKey(mid + '|a-ou|' + side, btn);
                addKey(mid + '|aou|' + side, btn);
            }
        });
        return index;
    }

    function candidateButtonsForStrategy(strategy, buttonMap) {
        const side = String(strategy.plateOn || '').toLowerCase();
        const mid = String(matchId);
        const markets = pageMarketsForStrategy(strategy.market);
        const out = [];
        const seen = new Set();
        for (let m = 0; m < markets.length; m++) {
            const key = mid + '|' + markets[m].toLowerCase() + '|' + side;
            const list = buttonMarketIndex.get(key);
            if (!list) continue;
            for (let i = 0; i < list.length; i++) {
                const btn = list[i];
                const tid = btn.dataset.testid || '';
                if (!tid || seen.has(tid)) continue;
                seen.add(tid);
                out.push(btn);
            }
        }
        if (out.length) return out;
        const buttons = Array.from(buttonMap.values());
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const parsed = parseOddsBtnTestid(btn.dataset.testid || '');
            if (!parsed) continue;
            if (String(parsed.matchId) !== mid) continue;
            if (!marketsMatch(strategy.market, parsed.market, btn)) continue;
            if (parsePageSide(parsed.side) !== side) continue;
            out.push(btn);
        }
        return out;
    }

    function oddsButtonsSignature(buttonMap) {
        const parts = [];
        buttonMap.forEach(function (btn, testid) {
            const ex = extractButtonLineOdds(btn);
            parts.push(testid + '@' + (ex.oddsText || String(ex.odds != null ? ex.odds : '')));
        });
        parts.sort();
        return parts.join(';');
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

    function resolveLiveButtonForOption(option) {
        if (!option) return null;
        if (option.strategy) {
            const map = new Map();
            snapshotOddsButtons(map);
            const minOdds = Number(option.strategy.plateOddsHit);
            // BTTS 替代时必须按 btts 重选，不能再按原 hou/aou 策略把按钮覆盖回去
            const pickStrategy = option.bttsSubstitute
                ? getBttsYesStrategyStub()
                : option.strategy;
            const picked = pickStrategyButtonMatch(
                pickStrategy,
                map,
                isNaN(minOdds) ? 0 : minOdds
            );
            if (picked && picked.btn) {
                option.testid = picked.testid;
                option.button = picked.btn;
                option.displayLine = picked.extracted.lineText;
                option.odds = String(picked.extracted.odds);
                option.side = picked.parsed.side;
                option.market = picked.parsed.market;
                option.lineIndex = picked.parsed.lineIndex;
                return picked.btn;
            }
        }
        return resolveLiveButton(option.testid);
    }

    async function ensureButtonVisible(option) {
        if (!option || !option.strategy) return resolveLiveButton(option.testid);
        const betMarket = getOptionBetMarket(option) || option.strategy.market;
        if (strategyMarketNeedsTgTab(betMarket) || strategyMarketNeedsTgTab(option.strategy.market)) {
            await ensureMarketCategoryTab(true, true, true);
        }
        const markets = pageMarketsForStrategy(betMarket);
        for (let i = 0; i < markets.length; i++) {
            const el = findStrategyMarketElement(markets[i]);
            if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        await humanDelay(400, 700);
        snapshotOddsButtons(lastButtonSnapshot);
        return resolveLiveButtonForOption(option);
    }

    function truncatePanelText(text, max) {
        const s = String(text || '');
        const limit = max || PANEL_TEXT_MAX;
        if (s.length <= limit) return s;
        return s.slice(0, Math.max(0, limit - 1)) + '…';
    }

    function formatBelowThresholdHint(st) {
        const s = st.strategy;
        if (!s) return '';
        const line = truncatePanelText(st.displayLine || '—', 20);
        return formatStrategyPlateDesc(s) + ' ' + line + ' ' +
            formatOddsDisplay(st.currentOdds) + '<' + formatOddsDisplay(s.plateOddsHit) + '（未达阈值）';
    }

    function countPlateMatchedStates() {
        let n = 0;
        for (let i = 0; i < strategyStates.length; i++) {
            const st = strategyStates[i];
            if (st.plateMatched) {
                n++;
                continue;
            }
            if (st.execStatus !== 'pending' || !st.strategy) continue;
            if (pickStrategyButtonMatch(st.strategy, lastButtonSnapshot, 0)) n++;
        }
        return n;
    }

    function buildUnmatchedHint() {
        const hitBlocked = strategyStates.filter(function (st) {
            return st.execStatus === 'pending' && st.hit && st.dedupBlocked;
        });
        if (hitBlocked.length) {
            const st = hitBlocked[0];
            const line = truncatePanelText(st.displayLine || '—', 20);
            const why = isScriptDedupInflight({ testid: st.testid, strategy: st.strategy }, st.strategy.recHash)
                ? '防重(等待确认)'
                : '防重(本地已记)';
            return line + ' ' + formatOddsDisplay(st.currentOdds) +
                '≥' + formatOddsDisplay(st.strategy.plateOddsHit) + ' · ' + why;
        }
        const pending = strategyStates.filter(function (st) {
            return st.execStatus === 'pending';
        });
        if (!pending.length) return '';

        for (let i = 0; i < pending.length; i++) {
            const st = pending[i];
            if (st.plateMatched && !st.oddsMatched) {
                return formatBelowThresholdHint(st);
            }
        }

        for (let i = 0; i < pending.length; i++) {
            const st = pending[i];
            const s = st.strategy;
            if (!s || st.plateMatched) continue;
            const picked = pickStrategyButtonMatch(s, lastButtonSnapshot, 0);
            if (picked) {
                const minOdds = Number(s.plateOddsHit);
                if (isNaN(minOdds) || picked.extracted.odds < minOdds) {
                    return formatBelowThresholdHint({
                        strategy: s,
                        displayLine: picked.extracted.lineText,
                        currentOdds: picked.extracted.odds,
                    });
                }
            }
        }

        for (let i = 0; i < pending.length; i++) {
            const s = pending[i].strategy;
            if (!s) continue;
            const minOdds = Number(s.plateOddsHit);
            const side = String(s.plateOn || '').toLowerCase();
            const candidates = candidateButtonsForStrategy(s, lastButtonSnapshot);
            let best = null;
            for (let j = 0; j < candidates.length; j++) {
                const btn = candidates[j];
                if (btn.disabled) continue;
                const parsed = parseOddsBtnTestid(btn.dataset.testid || '');
                if (parsed && parsePageSide(parsed.side) !== side) continue;
                const ex = extractButtonLineOdds(btn);
                if (isNaN(ex.odds)) continue;
                if (!best || ex.odds > best.odds) best = ex;
            }
            if (best && !isNaN(minOdds) && best.odds < minOdds) {
                const label = formatStrategyPlateDesc(s);
                const line = truncatePanelText(best.lineText || '—', 20);
                return label + ' ' + line + ' ' + formatOddsDisplay(best.odds) +
                    '<' + formatOddsDisplay(s.plateOddsHit) + '（未达阈值）';
            }
        }

        const s = pending[0].strategy;
        if (!s) return '';
        const label = formatStrategyPlateDesc(s);
        return label + '：未找到盘口';
    }

    function scanStatusSummary() {
        const total = strategyList.length;
        const actionable = strategyStates.filter(function (st) { return st.actionable; }).length;
        const matched = countPlateMatchedStates();
        const catLabel = marketCategoryTabLabel(getActiveMarketCategoryTab());
        const modeLabel = lastScanViewMode || getActiveMarketViewLabel();
        const view = catLabel + '·' + modeLabel;
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
        const direct = document.querySelector('[data-testid="MarketTableColTwoContainer-' + pm + '"]')
            || document.querySelector('[data-testid*="MarketTableColTwoContainer-' + pm + '"]')
            || document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-' + pm + '"]')
            || document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-' + pm + '_group-grouped"]')
            || document.querySelector('[data-testid*="ExhaustiveMarketCardWrapper-' + pm + '"]');
        if (direct) return direct;
        const label = MARKET_SECTION_LABEL[pm.toLowerCase()];
        if (label) return findMarketElementByLabel(label);
        return null;
    }

    function strategyNeedsPlateScan(item) {
        if (!isStrategyActionable(item)) return false;
        const st = strategyStates.find(function (s) {
            return s.strategy && s.strategy.recHash === item.recHash;
        });
        return !st || !st.plateMatched;
    }

    function hasPendingTeamOuPlateScan() {
        return hasPendingTgCategoryPlateScan();
    }

    async function ensureStrategyMarketsVisible() {
        const hasPendingUnmatched = strategyList.some(function (item) {
            return strategyNeedsPlateScan(item);
        });
        if (!hasPendingUnmatched) return;
        const seen = {};
        const toScroll = [];
        for (let i = 0; i < strategyList.length; i++) {
            if (!strategyNeedsPlateScan(strategyList[i])) continue;
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
        releaseStaleBetInflight();
        await ensureMarketView();
        await ensureMarketCategoryTab(
            hasPendingTgCategoryPlateScan() && !isUserManualCategoryTabActive()
        );
        const buttonMap = new Map();
        snapshotOddsButtons(buttonMap);
        buttonMarketIndex = buildButtonMarketIndex(buttonMap);
        strategyStates = evaluateStrategyStatesFromMap(buttonMap);
        const firstPlateCount = strategyStates.filter(function (st) { return st.plateMatched; }).length;

        for (let round = 0; round < 2; round++) {
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
                        buttonMarketIndex = buildButtonMarketIndex(buttonMap);
                    }
                }
            }
            await humanDelay(500, 800);
            snapshotOddsButtons(buttonMap);
            buttonMarketIndex = buildButtonMarketIndex(buttonMap);
            strategyStates = evaluateStrategyStatesFromMap(buttonMap);
        }

        const pendingAfter = strategyStates.filter(function (st) {
            return st.execStatus === 'pending' && !st.plateMatched;
        });
        const pendingTeamOu = pendingAfter.filter(function (st) {
            const m = st.strategy && st.strategy.market
                ? String(st.strategy.market).toLowerCase() : '';
            return strategyMarketNeedsTgTab(m);
        });
        if (pendingAfter.length && (!firstPlateCount || pendingTeamOu.length)) {
            if (pendingTeamOu.length && getActiveMarketCategoryTab() !== MARKET_CATEGORY_TG &&
                !isUserManualCategoryTabActive()) {
                await ensureMarketCategoryTab(true, false);
                snapshotOddsButtons(buttonMap);
                buttonMarketIndex = buildButtonMarketIndex(buttonMap);
            }
            for (let i = 0; i < pendingAfter.length; i++) {
                const markets = pageMarketsForStrategy(pendingAfter[i].strategy.market);
                for (let m = 0; m < markets.length; m++) {
                    const el = findStrategyMarketElement(markets[m]);
                    if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
            }
            await humanDelay(500, 800);
            snapshotOddsButtons(buttonMap);
            buttonMarketIndex = buildButtonMarketIndex(buttonMap);
            strategyStates = evaluateStrategyStatesFromMap(buttonMap);
        }

        lastButtonSnapshot = buttonMap;
        lastScanButtonCount = buttonMap.size;
        buttonMarketIndex = buildButtonMarketIndex(buttonMap);

        // 已命中 hou/aou 大0.5 且比分满足替代条件，但快照里还没有 BTTS：滚到两队进球再评一次
        const needBttsSub = strategyStates.some(function (st) {
            if (!st.hit || st.bttsSubstitute || st.execStatus !== 'pending') return false;
            return !!getBttsSubstituteKind(st.strategy, getLiveMatchScore());
        });
        if (needBttsSub) {
            const bttsEl = findStrategyMarketElement('btts');
            if (bttsEl) {
                bttsEl.scrollIntoView({ block: 'center', behavior: 'auto' });
                await humanDelay(400, 700);
                snapshotOddsButtons(buttonMap);
                buttonMarketIndex = buildButtonMarketIndex(buttonMap);
                strategyStates = evaluateStrategyStatesFromMap(buttonMap);
                lastButtonSnapshot = buttonMap;
                lastScanButtonCount = buttonMap.size;
            }
        }

        return strategyStates;
    }

    function getStrategyExecStatus(item) {
        if (item && item.recHash && isStrategyLocallyExecuted(item.recHash)) {
            return 'executed';
        }
        return getStrategyExecStatusFromApi(item);
    }

    function isStrategyActionable(item) {
        return passesStrategyStatusGate(item);
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
            label: formatTargetOptionLabel(state.strategy, state.bttsSubstitute),
            minOdds: Number(state.strategy.plateOddsHit),
            odds: String(state.currentOdds),
            button: state.button,
            bttsSubstitute: !!state.bttsSubstitute,
            substitutedFrom: state.substitutedFrom || null,
        };
    }

    function evaluateStrategyStatesFromMap(buttonMap) {
        if (!buttonMarketIndex.size && buttonMap.size) {
            buttonMarketIndex = buildButtonMarketIndex(buttonMap);
        }
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

            const picked = pickStrategyButtonMatch(strategy, buttonMap, 0);
            if (picked) {
                state.plateMatched = true;
                state.displayLine = picked.extracted.lineText;
                state.currentOdds = picked.extracted.odds;
                state.button = picked.btn;
                state.testid = picked.testid;
                state.side = picked.parsed.side;
                state.market = picked.parsed.market;
                state.lineIndex = picked.parsed.lineIndex;
                if (!isNaN(picked.extracted.odds) && picked.extracted.odds >= minOdds) {
                    state.oddsMatched = true;
                    state.hit = true;
                    applyBttsSubstitutionIfBetter(state, strategy, buttonMap, minOdds, picked);
                    state.dedupBlocked = state.execStatus === 'pending' &&
                        isScriptDedupBlocked({ testid: state.testid, strategy: strategy }, strategy.recHash);
                    state.actionable = state.execStatus === 'pending' && state.hit && !state.dedupBlocked;
                }
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
                st.dedupBlocked ? '1' : '0',
                st.bttsSubstitute ? '1' : '0',
                st.testid || '',
                st.displayLine || '',
                st.currentOdds != null ? String(st.currentOdds) : '',
            ].join(':');
        }).join(';');
    }

    function findStrategyMatch() {
        let best = null;
        let bestThreshold = -Infinity;
        for (let i = 0; i < strategyStates.length; i++) {
            const st = strategyStates[i];
            if (!st.actionable) continue;
            const th = Number(st.strategy && st.strategy.plateOddsHit);
            const score = isNaN(th) ? 0 : th;
            if (!best || score >= bestThreshold) {
                bestThreshold = score;
                best = st;
            }
        }
        return best ? buildTargetOption(best) : null;
    }

    function syncTargetOptionFromStates() {
        const match = findStrategyMatch();
        if (match) {
            targetOption = match;
            return targetOption;
        }
        if (!strategyStates.some(function (st) { return st.actionable; })) {
            targetOption = null;
        }
        return targetOption;
    }

    async function lightweightReevaluateOdds(buttonMap) {
        if (hasPendingTgCategoryPlateScan()) {
            await ensureStrategyMarketsVisible();
        }
        const map = buttonMap || new Map();
        if (!buttonMap) snapshotOddsButtons(map);
        buttonMarketIndex = buildButtonMarketIndex(map);
        strategyStates = evaluateStrategyStatesFromMap(map);
        lastButtonSnapshot = map;
        lastScanButtonCount = map.size;
        targetOption = findStrategyMatch();
        return targetOption;
    }

    function maybeTriggerAutoBet(renderPanelAfter) {
        syncTargetOptionFromStates();
        if (renderPanelAfter) renderPanel(false, false);
        if (placing || autoBetInFlight) return;
        if (shouldAutoBet()) {
            if (isLoggedIn()) {
                runAutoBet();
                return;
            }
            betResult = 'pending';
            setBetStep('策略已命中，等待登录后自动投注…');
            updatePanelStatus();
            tryAutoRelogin({ urgent: true }).catch(function (e) {
                console.warn('[hty-inplay] autoBet 自动登录', e);
            });
            schedulePoll();
            return;
        }
        if (shouldHoldCurrentMatch() && !pollTimer) {
            schedulePoll();
            return;
        }
        if (strategyStates.some(function (st) { return st.actionable; }) && !pollTimer) {
            schedulePoll();
        }
    }

    async function refreshTargetOption(force) {
        if (isCurrentMatchEnded()) {
            await handleMatchEnded();
            return targetOption;
        }
        const now = Date.now();
        const hasPending = strategyList.some(function (item) {
            return isStrategyActionable(item);
        });
        const scanGap = hasPending && !targetOption ? MATCH_SCAN_PENDING_MS : MATCH_SCAN_MS;
        if (!force && now - lastMatchScanAt < scanGap) {
            await lightweightReevaluateOdds();
            updatePanelStatus();
            return targetOption;
        }

        if (!force && lastOddsSignature) {
            const quickMap = new Map();
            snapshotOddsButtons(quickMap);
            const sig = oddsButtonsSignature(quickMap);
            if (sig === lastOddsSignature) {
                await lightweightReevaluateOdds(quickMap);
                updatePanelStatus();
                return targetOption;
            }
        }

        lastScanError = '';
        try {
            await ensureMarketView(force || hasPendingTgCategoryPlateScan());
            await ensureMarketCategoryTab(
                (force || hasPendingTgCategoryPlateScan()) && !isUserManualCategoryTabActive()
            );
            await waitForOddsButtons(1, 15000);
            await ensureStrategyMarketsVisible();
            lastMatchScanAt = now;
            lastScanViewMode = getActiveMarketViewLabel();
            await scanStrategyStatesWithRetry();
            lastOddsSignature = oddsButtonsSignature(lastButtonSnapshot);
            targetOption = findStrategyMatch();
            if (!placing && betResult !== 'placing') {
                if (targetOption) {
                    betStep = '已命中 ' + targetOption.label + ' @' + formatOddsDisplay(targetOption.odds);
                } else if (strategyList.length) {
                    betStep = '等待策略盘口与赔率达标';
                }
            }
            updatePanelStatus();
        } catch (err) {
            lastScanError = err && err.message ? err.message : '扫描失败';
            if (!placing && betResult !== 'placing') {
                betStep = '扫描异常';
            }
            updatePanelStatus();
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
            if (isCurrentMatchEnded()) {
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
        return isOnMatchBetPage();
    }

    function loadLocalEndedMatches() {
        try {
            const raw = sessionStorage.getItem(LOCAL_ENDED_MATCHES_KEY);
            const store = raw ? JSON.parse(raw) : {};
            return store && typeof store === 'object' ? store : {};
        } catch (e) {
            return {};
        }
    }

    function saveLocalEndedMatches(store) {
        try {
            sessionStorage.setItem(LOCAL_ENDED_MATCHES_KEY, JSON.stringify(store || {}));
        } catch (e) { /* ignore */ }
    }

    function pruneLocalEndedMatches(store) {
        const now = Date.now();
        Object.keys(store).forEach(function (id) {
            const entry = store[id];
            if (!entry || now - Number(entry.at || 0) > LOCAL_ENDED_TTL_MS) {
                delete store[id];
            }
        });
        return store;
    }

    function isMatchLocallyEnded(id) {
        if (!id) return false;
        const store = pruneLocalEndedMatches(loadLocalEndedMatches());
        return !!store[String(id)];
    }

    function markMatchLocallyEnded(id, reason) {
        if (!id) return;
        const store = pruneLocalEndedMatches(loadLocalEndedMatches());
        store[String(id)] = { at: Date.now(), reason: reason || '' };
        saveLocalEndedMatches(store);
        lastMatchesListKey = '';
        console.log('[hty-inplay] 本地标记赛事已结束', id, reason || '');
    }

    function clearMatchLocallyEnded(id) {
        if (!id) return false;
        const store = pruneLocalEndedMatches(loadLocalEndedMatches());
        const key = String(id);
        if (!store[key]) return false;
        delete store[key];
        saveLocalEndedMatches(store);
        lastMatchesListKey = '';
        console.log('[hty-inplay] 清除本地误标已结束', id);
        return true;
    }

    function isMatchIdEnded(id) {
        if (!id) return false;
        if (isMatchLocallyEnded(id)) return true;
        const item = activeMatches.find(function (m) {
            return String(m.matchId) === String(id);
        });
        if (!item) return false;
        return isMatchEndedByFields(item) || resolveMatchPhase(item) === 'ENDED';
    }

    function isInplayMatchApiNotFoundReason(reason) {
        const r = String(reason || '').toLowerCase();
        return r === 'api_not_found' || r === 'api_match_not_found' ||
            r.indexOf('match not found') >= 0;
    }

    function reconcileLocalEndedMatches() {
        const store = pruneLocalEndedMatches(loadLocalEndedMatches());
        let changed = false;
        activeMatches.forEach(function (item) {
            const id = String(item.matchId || '');
            if (!id || !store[id]) return;
            if (isInplayMatchApiNotFoundReason(store[id].reason)) return;
            if (String(id) === String(matchId) && isOnMatchBetPage()) return;
            if (!isMatchEndedByFields(item)) {
                delete store[id];
                changed = true;
                console.log('[hty-inplay] 策略列表仍活跃，清除本地误标已结束', id,
                    item.homeName, 'vs', item.awayName);
            }
        });
        if (changed) saveLocalEndedMatches(store);
        return changed;
    }

    function isMatchEndedPageVisible() {
        if (!isOnInplayMatchPage()) return false;
        const root = document.querySelector(PAGE_READY_SEL);
        if (!root || !isElementVisible(root)) return false;
        const text = normalizeHintText(root.textContent || '');
        for (let i = 0; i < MATCH_ENDED_PAGE_HINTS.length; i++) {
            if (text.indexOf(normalizeHintText(MATCH_ENDED_PAGE_HINTS[i])) >= 0) return true;
        }
        return false;
    }

    function isMatchEndedModalVisible() {
        if (!document.body) return false;
        for (let i = 0; i < MATCH_ENDED_DIALOGS.length; i++) {
            if (findVisibleDialogContaining(MATCH_ENDED_DIALOGS[i])) return true;
        }
        return false;
    }

    function isMatchEndedUiVisible() {
        return isMatchEndedModalVisible() || isMatchEndedPageVisible();
    }

    function isMatchBlockedModalVisible() {
        if (!document.body) return false;
        for (let i = 0; i < MATCH_BLOCKED_DIALOGS.length; i++) {
            if (findVisibleDialogContaining(MATCH_BLOCKED_DIALOGS[i])) return true;
        }
        return false;
    }

    function isMatchUnavailableModalVisible() {
        return isMatchEndedUiVisible() || isMatchBlockedModalVisible();
    }

    function noteCurrentMatchUnavailable(reason) {
        if (!isOnInplayMatchPage() || !matchId) return;
        if (!isMatchEndedUiVisible()) return;
        markMatchLocallyEnded(matchId, reason || 'page_ended');
    }

    function phaseFromMatchStatus(status) {
        if (status == null || status === '') return '';
        const n = Number(status);
        if (n === MATCH_STATUS.NOT_STARTED) return 'NOT_STARTED';
        if (n === MATCH_STATUS.IN_PLAY) return 'IN_PLAY';
        if (n === MATCH_STATUS.ENDED) return 'ENDED';
        return '';
    }

    function isMatchEndedByFields(item) {
        if (!item) return false;
        const statusVal = getMatchStatusValue(item);
        if (statusVal != null && statusVal !== '' && Number(statusVal) === MATCH_STATUS.ENDED) {
            return true;
        }
        const phase = String(item.matchPhase || '').toUpperCase();
        return phase === 'ENDED' || phase === 'FINISHED' || phase === 'CANCELLED';
    }

    function handleInplayMatchNotFound(id, reason) {
        const mid = String(id || matchId || '');
        if (!mid) return;
        markMatchLocallyEnded(mid, reason || 'api_not_found');
        if (String(matchId) === mid && isOnInplayMatchPage()) {
            handleMatchEnded().catch(function (e) {
                console.warn('[hty-inplay] API赛事不存在后切换', e);
            });
        }
    }

    function isCurrentMatchEnded() {
        if (!isOnInplayMatchPage()) return false;
        if (isMatchEndedUiVisible()) {
            noteCurrentMatchUnavailable(isMatchEndedPageVisible() ? 'page_inline' : 'page_modal');
            return true;
        }
        if (isMatchLocallyEnded(matchId)) return true;
        const item = getCurrentMatchItem();
        if (!item) return false;
        return isMatchEndedByFields(item);
    }

    function isMatchIdInPlay(targetId) {
        if (!targetId) return false;
        const item = activeMatches.find(function (m) {
            return String(m.matchId) === String(targetId);
        });
        if (!item) return false;
        return resolveMatchPhase(item) === 'IN_PLAY';
    }

    function isCurrentPageLive() {
        if (!isOnInplayMatchPage()) return false;
        if (isMatchLocallyEnded(matchId)) return false;
        if (isMatchUnavailableModalVisible()) return false;
        const item = getCurrentMatchItem();
        if (item && isMatchEndedByFields(item)) return false;
        if (item && resolveMatchPhase(item) !== 'IN_PLAY') return false;
        return isPageReady();
    }

    function resolveMatchPhase(item) {
        if (!item) return '';
        if (isMatchEndedByFields(item)) return 'ENDED';
        if (isMatchLocallyEnded(item.matchId)) {
            if (!isMatchEndedByFields(item)) clearMatchLocallyEnded(item.matchId);
        }
        if (isMatchLocallyEnded(item.matchId)) return 'ENDED';
        if (isCurrentMatchItem(item) && isMatchEndedUiVisible()) return 'ENDED';

        const statusVal = getMatchStatusValue(item);
        const fromStatus = phaseFromMatchStatus(statusVal);
        if (fromStatus === 'IN_PLAY') return 'IN_PLAY';
        if (fromStatus === 'NOT_STARTED') {
            return isKickoffReached(item, KICKOFF_EARLY_MS) ? 'IN_PLAY' : 'NOT_STARTED';
        }

        const mp = String(item.matchPhase || '').toUpperCase();
        // 后台 matches/active 进行中常用 LIVE，与 IN_PLAY 等价
        if (mp === 'IN_PLAY' || mp === 'LIVE') return 'IN_PLAY';
        if (mp === 'NOT_STARTED') {
            return isKickoffReached(item, KICKOFF_EARLY_MS) ? 'IN_PLAY' : 'NOT_STARTED';
        }

        if (isKickoffReached(item, KICKOFF_EARLY_MS)) return 'IN_PLAY';
        if (isCurrentMatchItem(item) && isPageReady() && isKickoffReached(item, 0)) {
            return 'IN_PLAY';
        }
        return mp || 'NOT_STARTED';
    }

    function isMatchEndedPhase(item) {
        if (!item) return false;
        if (isMatchEndedByFields(item)) return true;
        if (isMatchLocallyEnded(item.matchId)) return true;
        if (isCurrentMatchItem(item) && isMatchEndedUiVisible()) return true;
        return false;
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
        if (isMatchEndedPhase(item)) {
            mainHtml = '<span class="tm-hty-match-pick" title="比赛已结束">' + pickText + '</span>';
        } else if (inplayReady) {
            mainHtml = '<a class="tm-hty-match-main" href="' + inplayMatchUrl(id) + '" title="跳转滚球页">' + pickText + '</a>';
        } else {
            // 未开赛也可点进即将开赛页，总览/列表页方便快捷跳转
            mainHtml = '<a class="tm-hty-match-main" href="' + matchBetUrl(id, null, 'incoming') +
                '" title="跳转即将开赛页">' + pickText + '</a>';
        }
        return '<div class="' + rowClass + '">' +
            '<span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span>' +
            mainHtml +
            traceLink +
            pageBadge +
            '</div>';
    }

    function inplayMatchUrl(id, tab) {
        return matchBetUrl(id, tab);
    }

    function gotoInplayMatch(id, tab, forceRefresh) {
        if (!AUTO_PAGE_NAV_ENABLED) {
            console.warn('[hty-inplay] 自动跳转已禁用，跳过 gotoInplayMatch', id);
            return false;
        }
        if (!id) return false;
        if (shouldBlockMatchAutoNav()) {
            console.log('[hty-inplay] 未登录/登录中，跳过跳转', id);
            return false;
        }
        if (isMatchIdEnded(id)) {
            console.log('[hty-inplay] 跳过已结束赛事跳转', id);
            return false;
        }
        if (shouldBlockAutoMatchNavigation(id)) {
            console.log('[hty-inplay] 用户手动选场锁定，跳过跳转', id);
            return false;
        }
        if (forceRefresh) {
            if (!shouldAllowAutoNavigation('page-reload')) return false;
            if (isCurrentMatchEnded() || isMatchEndedModalVisible()) return false;
            if (Date.now() - lastPageReloadAt < PAGE_RELOAD_COOLDOWN_MS) return false;
        } else if (!shouldAllowAutoNavigation('goto')) {
            return false;
        }
        const url = inplayMatchUrl(id, tab);
        if (!forceRefresh && isAlreadyOnMatchBetUrl(id, tab)) {
            return true;
        }
        const targetSeg = resolveMatchUrlSegmentForId(id);
        const curSeg = getMatchPageSegmentFromUrl();
        const sameMatch = isOnMatchBetPage() && String(id) === String(matchId) && targetSeg === curSeg;
        const wantTab = tab ? String(tab).toLowerCase() : '';
        const curTab = typeof getActiveMarketCategoryTab === 'function'
            ? getActiveMarketCategoryTab()
            : '';
        const tabMatches = !wantTab || wantTab === curTab;
        if (forceRefresh && (isAlreadyOnMatchBetUrl(id, tab) || (sameMatch && tabMatches))) {
            console.log('[hty-inplay] 同页刷新', id, tab || 'all');
            lastPageReloadAt = Date.now();
            withPageNavAllow(function () {
                window.location.reload();
            });
            return true;
        }
        if (normalizeMatchBetHref(window.location.href) === normalizeMatchBetHref(url)) {
            return true;
        }
        console.log('[hty-inplay] 跳转滚球页', id, tab || 'all');
        return performPageNavigation(url, 'gotoInplayMatch', id);
    }

    function gotoInplayMatchDirect(id, tab, reason, opts) {
        if (!id) return false;
        const force = !!(opts && opts.force);
        // 列表强制回场：仅拦登录弹窗，不拦「未检测到余额」误判
        if (force) {
            if (isLoginUiBusy()) {
                console.log('[hty-inplay] 登录弹窗中，暂缓强制直跳', id);
                return false;
            }
        } else if (shouldBlockMatchAutoNav()) {
            console.log('[hty-inplay] 未登录/登录中，跳过直跳', id);
            return false;
        }
        if (!force && shouldBlockAutoMatchNavigation(id, reason)) {
            console.log('[hty-inplay] 用户手动选场锁定，跳过直跳', id);
            return false;
        }
        if (!force && (isMatchIdEnded(id) || isMatchLocallyEnded(id))) {
            console.log('[hty-inplay] 跳过已结束赛事直跳', id);
            return false;
        }
        if (!isUserManualMatchPickReason(reason)) {
            const item = activeMatches.find(function (m) {
                return String(m.matchId) === String(id);
            });
            if (!matchHasNavigablePendingWork(item || { matchId: id })) {
                console.log('[hty-inplay] 跳过无已达标策略赛事直跳', id);
                return false;
            }
        }
        if (isAlreadyOnMatchBetUrl(id, tab)) return true;
        const url = inplayMatchUrl(id, tab);
        if (normalizeMatchBetHref(window.location.href) === normalizeMatchBetHref(url)) return true;
        if (reason && typeof setBetStep === 'function') {
            setBetStep(reason);
            if (typeof renderPanel === 'function') renderPanel(true);
        }
        console.log('[hty-inplay] 直接跳转滚球页', id, tab || 'all', reason || '', force ? '(force)' : '');
        return performPageNavigation(url, reason || 'gotoInplayMatchDirect', id);
    }

    function openInplayMatchPage(targetId, reason) {
        if (!targetId) return false;
        const userPick = isUserManualMatchPickReason(reason);
        if (!userPick && shouldBlockMatchAutoNav()) {
            console.log('[hty-inplay] 未登录/登录中，跳过打开', targetId);
            return false;
        }
        if (!userPick && shouldBlockAutoMatchNavigation(targetId, reason)) {
            console.log('[hty-inplay] 用户手动选场锁定，跳过打开', targetId);
            return false;
        }
        if (isMatchIdEnded(targetId) || isMatchLocallyEnded(targetId)) {
            console.log('[hty-inplay] 跳过打开已结束赛事', targetId);
            return false;
        }
        const item = activeMatches.find(function (m) {
            return String(m.matchId) === String(targetId);
        });
        if (!userPick && !matchHasNavigablePendingWork(item || { matchId: targetId })) {
            console.log('[hty-inplay] 跳过打开无已达标策略赛事', targetId);
            return false;
        }
        if (isAlreadyOnMatchBetUrl(targetId)) return true;
        if (!userPick && !shouldAllowAutoNavigation(reason || 'open-match')) return false;
        const url = inplayMatchUrl(targetId);
        if (normalizeMatchBetHref(window.location.href) === normalizeMatchBetHref(url)) return true;
        const label = item ? formatActiveMatchItem(item) : ('#' + targetId);
        if (reason) {
            setBetStep(reason + '：' + label);
            renderPanel(true);
        }
        console.log('[hty-inplay] 跳转滚球页', targetId, reason || '');
        return performPageNavigation(url, reason || 'openInplayMatchPage', targetId);
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
        let phaseHint = '';
        if (isMatchLocallyEnded(item.matchId)) {
            phaseHint = '(本地已结束)';
        } else if (isCurrentMatchItem(item) && (apiPhase === 'ENDED' || apiPhase === 'FINISHED') &&
            resolved === 'IN_PLAY') {
            phaseHint = '(页)';
        }
        const rules = item.ruleCount != null ? item.ruleCount + '条策略' : '';
        const meetCount = getMatchRuleMeetCount(item);
        const meetHint = meetCount > 0 ? meetCount + '条达标' : '';
        const tour = shortTournamentName(item.tournamentName);
        const parts = [];
        if (kick) parts.push(kick);
        if (tour) parts.push(tour);
        parts.push(home + 'vs' + away);
        parts.push(phase + phaseHint);
        if (rules) parts.push(rules);
        if (meetHint) parts.push(meetHint);
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
                String(getMatchRuleMeetCount(item)),
            ].join(':');
        }).join(';');
        const meetSig = Object.keys(matchRuleMeetCache).sort().map(function (id) {
            return id + ':' + matchRuleMeetCache[id].meetCount;
        }).join(',');
        return matchesStatus + '|' + matchId + '|' + activeMatches.length + '|' + rows +
            '|' + (isCurrentPageLive() ? 'live' : 'idle') + '|' + lastScanButtonCount + '|' + meetSig;
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
            if (reconcileLocalEndedMatches()) {
                renderActiveMatches(document.getElementById(PANEL_ID));
            }
            const inPlayMatches = getSortedInPlayMatches();
            if (!inPlayMatches.length) {
                // 总览/列表页不要静默 2 分钟，否则有比赛后仍要干等很久
                if (!isHubSportEventsPage()) {
                    suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, '策略列表无进行中');
                }
            } else {
                // 先按进行中场次扫 ruleMeet；不可用 hasNavigable 门禁（达标缓存依赖本扫描）
                if (!shouldBlockMatchAutoNav() && !isUserManualMatchLockActive() &&
                    !isSiteAccessBlockedPage() && !isCurrentMatchEnded()) {
                    navSuppressedUntil = 0;
                }
                void scanAllMatchesRuleMeet(false).then(async function () {
                    renderActiveMatches(document.getElementById(PANEL_ID));
                    if (!hasNavigableInPlayMatches()) {
                        if (!isHubSportEventsPage()) {
                            suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, '策略列表无已达标比赛');
                        }
                        return;
                    }
                    if (shouldBlockMatchAutoNav()) return;
                    if (isHubSportEventsPage()) {
                        if (await maybeEnterMatchFromHubPage('策略赛事就绪，进入比赛')) return;
                    }
                    if (await maybeNavigateToRuleMeetMatch()) return;
                    if (!isUserManualMatchLockActive()) void maybeAutoNavigateToInplay();
                });
            }
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

    function getLiveMatchScore() {
        const item = getCurrentMatchItem();
        if (item && item.finalScore != null && item.finalScore !== '') {
            const parsed = parseScoreText(item.finalScore);
            if (parsed) return parsed;
        }
        const page = document.querySelector(PAGE_READY_SEL) || document.body;
        if (!page) return null;
        const scoreNodes = page.querySelectorAll(
            '[data-testid*="score" i], [data-testid*="Score"], [data-testid*="match-score" i],' +
            '[class*="score" i], [class*="Score"]'
        );
        for (let i = 0; i < scoreNodes.length; i++) {
            const parsed = parseScoreText((scoreNodes[i].textContent || '').trim());
            if (parsed) return parsed;
        }
        // 宽松匹配页面可见比分文本，如 "0 - 2" / "0:2"
        const blob = (page.innerText || '').slice(0, 4000);
        const loose = blob.match(/(?:^|\s)(\d{1,2})\s*[-:：]\s*(\d{1,2})(?:\s|$)/m);
        if (loose) {
            return {
                home: parseInt(loose[1], 10),
                away: parseInt(loose[2], 10),
                raw: loose[1] + '-' + loose[2],
            };
        }
        return null;
    }

    function countMatchesByPhase(phase) {
        return activeMatches.filter(function (item) {
            return resolveMatchPhase(item) === phase;
        }).length;
    }

    function getSortedInPlayMatches(sourceList) {
        const list = sourceList || activeMatches;
        return list.filter(function (item) {
            return resolveMatchPhase(item) === 'IN_PLAY' && item.matchId;
        }).sort(function (a, b) {
            const ka = parseKickoffMs(a.kickoffTime) || 0;
            const kb = parseKickoffMs(b.kickoffTime) || 0;
            if (ka !== kb) return ka - kb;
            return String(a.matchId).localeCompare(String(b.matchId));
        });
    }

    function getSortedInPlayMatchIds(sourceList) {
        return getSortedInPlayMatches(sourceList).map(function (item) {
            return String(item.matchId);
        });
    }

    function getNavigableInPlayMatches(sourceList) {
        return getSortedInPlayMatches(sourceList).filter(function (item) {
            if (isMatchLocallyEnded(item.matchId)) return false;
            if (isMatchEndedPhase(item)) return false;
            return matchHasNavigablePendingWork(item);
        });
    }

    function hasNavigableInPlayMatches(sourceList) {
        return getNavigableInPlayMatches(sourceList).length > 0;
    }

    function isNavSuppressed() {
        if (isSiteAccessBlockedPage()) return true;
        return Date.now() < navSuppressedUntil;
    }

    function suppressNavigation(ms, reason) {
        navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + (ms || NAV_SUPPRESS_NO_INPLAY_MS));
        if (reason) console.log('[hty-inplay] 暂停自动跳转', reason);
    }

    function isLoginUiBusy() {
        if (reloginInProgress) return true;
        if (Date.now() < loginNavLockUntil) return true;
        try {
            if (typeof isSimplePasswordModalVisible === 'function' && isSimplePasswordModalVisible()) {
                return true;
            }
            if (typeof isIdleLoginModalVisible === 'function' && isIdleLoginModalVisible()) {
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    /** 未登录不能投注，自动切场/进场一律禁止（login-nav-gate 模块） */
    let __loginNavGate = null;
    function ensureLoginNavGate() {
        if (!__loginNavGate) {
            __loginNavGate = createLoginNavGate({
                isLoginUiBusy: isLoginUiBusy,
                isLoggedIn: isLoggedIn,
            });
        }
        return __loginNavGate;
    }
    function shouldBlockMatchAutoNav() {
        return ensureLoginNavGate().shouldBlockMatchAutoNav();
    }

    function lockNavigationForLogin(ms, reason) {
        const hold = Math.max(0, ms || LOGIN_NAV_LOCK_MS);
        loginNavLockUntil = Math.max(loginNavLockUntil, Date.now() + hold);
        suppressNavigation(hold, reason || '登录中禁止跳转');
    }

    function shouldAllowAutoNavigation(reason) {
        if (shouldBlockMatchAutoNav()) {
            console.log('[hty-inplay] 未登录/登录中，跳过导航', reason || '');
            return false;
        }
        if (isNavSuppressed()) {
            console.log('[hty-inplay] 导航静默中，跳过', reason || '');
            return false;
        }
        if (!hasNavigableInPlayMatches()) {
            suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, '无进行中比赛');
            return false;
        }
        return true;
    }

    function dismissMatchBlockedModal() {
        const confirmBtn = findModalConfirmButton(['温馨提示', '当前无法进入']) ||
            findModalConfirmButton(['赛事', '不存在']) ||
            findModalConfirmButton(['比赛', '不存在']);
        if (confirmBtn) safeClick(confirmBtn);
    }

    function pickRuleMeetNavigableMatch(excludeId, sourceList) {
        return ensureNavPicker().pickRuleMeetNavigableMatch(excludeId, sourceList);
    }

    async function scanAllMatchesRuleMeet(force) {
        if (ruleMeetScanInFlight) return matchRuleMeetCache;
        const inPlay = getSortedInPlayMatches();
        if (!inPlay.length) {
            if (matchId) {
                const curMeet = getCurrentMatchPendingRuleMeetCount();
                rememberMatchPendingWork(matchId, curMeet);
                if (curMeet > 0) {
                    matchRuleMeetCache[String(matchId)] = { meetCount: curMeet, at: Date.now() };
                } else {
                    delete matchRuleMeetCache[String(matchId)];
                }
            }
            lastRuleMeetScanAt = Date.now();
            return matchRuleMeetCache;
        }
        if (!force && Date.now() - lastRuleMeetScanAt < RULE_MEET_SCAN_MS) {
            return matchRuleMeetCache;
        }

        ruleMeetScanInFlight = true;
        try {
            const tasks = inPlay.map(function (item) {
                const id = String(item.matchId);
                if (id === String(matchId) && (strategyList.length || strategyStatus === 'ok')) {
                    const meetCount = getCurrentMatchPendingRuleMeetCount();
                    return Promise.resolve({
                        id: id,
                        meetCount: meetCount,
                        // 导航用：仅已达标+未执行（不含待确认）
                        pendingCount: meetCount,
                    });
                }
                return fetchAlertStrategies(id).then(function (payload) {
                    const list = Array.isArray(payload.data) ? payload.data : [];
                    const meetCount = countPendingRuleMeet(list);
                    return {
                        id: id,
                        meetCount: meetCount,
                        pendingCount: meetCount,
                    };
                }).catch(function () {
                    const prevMeet = matchRuleMeetCache[id];
                    const prevWork = matchPendingWorkCache[id];
                    return {
                        id: id,
                        meetCount: prevMeet ? prevMeet.meetCount : 0,
                        pendingCount: prevWork && prevWork.known ? prevWork.pendingCount : -1,
                    };
                });
            });
            const results = await Promise.all(tasks);
            const nextMeet = {};
            results.forEach(function (r) {
                if (r.pendingCount >= 0) rememberMatchPendingWork(r.id, r.pendingCount);
                if (r.meetCount > 0) nextMeet[r.id] = { meetCount: r.meetCount, at: Date.now() };
            });
            matchRuleMeetCache = nextMeet;
            lastRuleMeetScanAt = Date.now();
            lastMatchesListKey = '';
            console.log('[hty-inplay] ruleMeet 扫描', Object.keys(nextMeet).map(function (id) {
                return id + ':' + nextMeet[id].meetCount;
            }).join(', ') || '无达标',
                '| navigable',
                results.map(function (r) {
                    return r.id + ':' + (r.pendingCount >= 0 ? r.pendingCount : '?');
                }).join(', ') || '无');
            return matchRuleMeetCache;
        } finally {
            ruleMeetScanInFlight = false;
        }
    }

    async function maybeNavigateToRuleMeetMatch() {
        if (placing || matchEndedHandling || shouldBlockMatchAutoNav()) return false;
        // 本场已有立即可下的盘口时先下完；仅 ruleMeet 未可下时允许切到其它达标场
        if (targetOption || strategyStates.some(function (st) { return st.actionable; })) {
            return false;
        }
        if (!canLeaveCurrentMatchForAutoSwitch()) return false;
        if (!shouldAllowAutoNavigation('ruleMeet')) return false;
        if (getNavigableInPlayMatches().length < 2) return false;

        await scanAllMatchesRuleMeet(false);
        const targetId = pickRuleMeetNavigableMatch(matchId);
        if (!targetId || String(targetId) === String(matchId)) return false;

        const navGap = Date.now() - lastInplayNavAt;
        if (navGap < RULE_MEET_NAV_COOLDOWN_MS) return false;

        const meetCount = getMatchRuleMeetCount({ matchId: targetId });
        const curMeet = getCurrentMatchRuleMeetCountForNav();
        console.log(
            '[hty-inplay] ruleMeet 优先切换',
            matchId, '(' + curMeet + ')',
            '->', targetId, meetCount, '条'
        );
        clearUserManualMatchLock();
        return navigateToInplayMatch(targetId, '规则已达标，切换下单(' + meetCount + '条)');
    }

    let __navPicker = null;
    function ensureNavPicker() {
        if (__navPicker) return __navPicker;
        __navPicker = createNavPicker({
            getNavigableInPlayMatches: getNavigableInPlayMatches,
            getMatchRuleMeetCount: getMatchRuleMeetCount,
            matchHasNavigablePendingWork: matchHasNavigablePendingWork,
            isUserManualMatchActive: isUserManualMatchActive,
            shouldHoldCurrentMatch: shouldHoldCurrentMatch,
            isCurrentMatchEnded: isCurrentMatchEnded,
            parseKickoffMs: parseKickoffMs,
            KICKOFF_NAV_PRIORITY_MS: KICKOFF_NAV_PRIORITY_MS,
            getMatchId: function () { return matchId; },
            saveRotateIndex: saveRotateIndex,
        });
        return __navPicker;
    }

    function pickPreferredNavigableMatch(excludeId, currentId, sourceList) {
        return ensureNavPicker().pickPreferredNavigableMatch(
            excludeId, currentId, sourceList || activeMatches
        );
    }

    function saveRotateIndex(idx, total) {
        if (total <= 0) return;
        try {
            sessionStorage.setItem(KEEPALIVE_ROTATE_INDEX_KEY, String(((idx % total) + total) % total));
        } catch (e) { /* ignore */ }
    }

    function pickRotatingInplayMatch(currentId, sourceList) {
        return ensureNavPicker().pickRotatingInplayMatch(currentId, sourceList);
    }

    function pickInplayNavigableMatch(excludeId, sourceList) {
        return ensureNavPicker().pickInplayNavigableMatch(excludeId, sourceList);
    }

    function isCurrentNavigable() {
        const item = getCurrentMatchItem();
        if (!item) return isPageReady();
        return resolveMatchPhase(item) === 'IN_PLAY' && isPageReady();
    }

    function buildWaitingKickoffMessage() {
        if (isSiteAccessBlockedPage()) return '站点访问被阻断，已停止自动跳转';
        const inplayCount = countMatchesByPhase('IN_PLAY');
        const waitingCount = countMatchesByPhase('NOT_STARTED');
        if (inplayCount > 0) return '';
        if (waitingCount > 0) return '等待比赛开始（' + waitingCount + ' 场未开赛）';
        if (activeMatches.length > 0) return '全部比赛已结束，停止自动跳转';
        return '暂无策略赛事';
    }

    function setWaitingKickoffState() {
        const msg = buildWaitingKickoffMessage();
        setBetStep(msg);
        setBetResult('pending', '等待滚球开赛');
        renderPanel(true);
        if (!pollTimer) schedulePoll();
    }

    function pickNextNavigableMatchId(excludeIds) {
        return ensureNavPicker().pickNextNavigableMatchId(excludeIds);
    }

    async function navigateToInplayMatch(targetId, reason) {
        if (!targetId || String(targetId) === String(matchId)) return false;
        if (shouldBlockMatchAutoNav()) {
            console.log('[hty-inplay] 未登录/登录中，跳过导航', targetId, reason || '');
            return false;
        }
        if (isMatchLocallyEnded(targetId) || isMatchIdEnded(targetId)) {
            console.warn('[hty-inplay] 跳过已结束赛事', targetId);
            const altId = pickNextNavigableMatchId([targetId, matchId]);
            if (altId) return navigateToInplayMatch(altId, reason || '跳过已结束赛事');
            return false;
        }
        const item = activeMatches.find(function (m) {
            return String(m.matchId) === String(targetId);
        });
        if (!matchHasNavigablePendingWork(item || { matchId: targetId })) {
            console.warn('[hty-inplay] 跳过无已达标策略赛事', targetId);
            rememberMatchPendingWork(targetId, 0);
            const altId = pickNextNavigableMatchId([targetId, matchId]);
            if (altId) return navigateToInplayMatch(altId, reason || '跳过无已达标策略');
            return false;
        }
        return openInplayMatchPage(targetId, reason || '跳转滚球页');
    }

    async function maybeAutoNavigateToInplay() {
        // 仍受 isAutoPageNavAllowed 约束：仅策略性切场放行，不恢复保活/列表乱跳
        if (placing || matchEndedHandling || shouldBlockMatchAutoNav()) return false;
        if (isUserManualMatchLockActive()) return false;
        if (!canLeaveCurrentMatchForAutoSwitch()) return false;
        if (shouldHoldCurrentMatch()) return false;
        if (Date.now() - lastInplayNavAt < INPLAY_NAV_COOLDOWN_MS) return false;
        if (!shouldAllowAutoNavigation('auto-nav')) {
            if (!hasNavigableInPlayMatches()) setWaitingKickoffState();
            return false;
        }

        await scanAllMatchesRuleMeet(false);

        const endedModal = isMatchEndedModalVisible();
        const excludeId = (endedModal || isCurrentMatchEnded()) ? matchId : '';
        const targetId = pickPreferredNavigableMatch(excludeId, matchId);

        if (!targetId) {
            if (endedModal || !isCurrentNavigable()) {
                setWaitingKickoffState();
            }
            return false;
        }

        if (String(targetId) === String(matchId) && !endedModal && !isCurrentMatchEnded()) {
            return false;
        }

        const targetItem = activeMatches.find(function (m) {
            return String(m.matchId) === String(targetId);
        });
        let reason = '进入策略滚球页';
        if (endedModal) {
            reason = '赛事已结束，切换进行中';
        } else if (isCurrentMatchNotStarted() && resolveMatchPhase(targetItem) === 'IN_PLAY') {
            reason = '有进行中赛事，切换滚球';
        } else if (targetItem && getMatchRuleMeetCount(targetItem) > 0) {
            reason = '规则已达标，切换下单(' + getMatchRuleMeetCount(targetItem) + '条)';
        } else if (targetItem && isKickoffReached(targetItem, KICKOFF_EARLY_MS)) {
            const km = parseKickoffMs(targetItem.kickoffTime);
            if (km && Date.now() - km <= KICKOFF_NAV_PRIORITY_MS) {
                reason = '比赛已开始，进入滚球';
            }
        }
        return navigateToInplayMatch(targetId, reason);
    }

    function scheduleInplayMatchWatch() {
        scheduleHeartbeat();
    }

    function getHeartbeatIntervalMs() {
        if (document.hidden || pageHidden) return HEARTBEAT_HIDDEN_MS;
        if (panelCollapsed && !placing && !shouldKeepOddsWatch()) {
            return HEARTBEAT_COLLAPSED_MS;
        }
        return HEARTBEAT_MS;
    }

    let __heartbeatRunner = null;
    function getHeartbeatRunner() {
        if (__heartbeatRunner) return __heartbeatRunner;
        __heartbeatRunner = createHeartbeatRunner(function (tick) {
            heartbeatTick = tick;
            return [
                {
                    name: 'waf',
                    run: async function () {
                        if (!isSiteAccessBlockedPage()) return false;
                        suppressNavigation(WAF_RECOVERY_COOLDOWN_MS, 'WAF阻断页');
                        return true;
                    },
                },
                {
                    name: 'list-boot',
                    run: async function () {
                        if (!isInplayListPage()) return false;
                        void ensureListPageBoot();
                        return true;
                    },
                },
                {
                    name: 'hub-boot',
                    run: async function () {
                        if (!isStrandedSportEventsPage()) return false;
                        void ensureStrandedSportEventsBoot();
                        try {
                            await loadActiveMatches(true);
                            await scanAllMatchesRuleMeet(heartbeatTick % 2 === 0);
                            renderPanel(true);
                            await maybeEnterMatchFromHubPage('总览页进入策略比赛');
                        } catch (e) {
                            console.warn('[hty-inplay] 总览页刷新/进场', e);
                        }
                        return true;
                    },
                },
                {
                    name: 'wrong-sport',
                    run: async function () {
                        if (!isWrongSportSectionPage()) return false;
                        recoverFromWrongSportSection('心跳检测到非足球版块');
                        return true;
                    },
                },
                {
                    name: 'idle-login',
                    run: async function () {
                        if (!isIdleLoginModalVisible()) return false;
                        dismissIdleLoginModal();
                        return true;
                    },
                },
                {
                    name: 'login-gate',
                    run: async function () {
                        return shouldBlockMatchAutoNav();
                    },
                },
                {
                    name: 'bet-submitted-finish',
                    run: async function () {
                        if (!(placing && isBetSubmittedDrawerVisible())) return false;
                        console.warn('[hty-inplay] 心跳：投注中但已提交，强制按成功收尾');
                        placing = false;
                        restorePanelAfterBet();
                        setBetResult('success', '已提交（心跳收尾）');
                        setBetStep('检测到已提交，正在同步状态…');
                        renderPanel(true);
                        const opt = targetOption;
                        if (opt) {
                            const rec = buildBetRecordFromUiSuccess(opt);
                            lastStrategyBetRecord = rec;
                            void finalizeBetSuccess(opt, rec, true, '心跳收尾·UI已提交');
                        } else {
                            dismissBetSubmittedDrawer(3).catch(function () { /* ignore */ });
                        }
                        return true;
                    },
                },
                {
                    name: 'match-ended',
                    run: async function () {
                        if (!isCurrentMatchEnded()) return false;
                        await handleMatchEnded();
                        return true;
                    },
                },
                {
                    name: 'stranded-recover',
                    run: async function () {
                        if (!(matchId && isStrandedSportEventsPage())) return false;
                        if (shouldAllowAutoNavigation('stranded-recover')) {
                            recoverStrandedFromMatchContext();
                        }
                        return true;
                    },
                },
                {
                    name: 'hidden-light',
                    run: async function () {
                        if (!(document.hidden || pageHidden)) return false;
                        if (heartbeatTick % 4 === 0) await loadStrategies(true);
                        return true;
                    },
                },
                {
                    name: 'matches-dedup-rulemeet',
                    run: async function () {
                        await loadActiveMatches(true);
                        if (!placing && await resolvePendingBetDedup()) return true;
                        // 有进行中场次就扫达标（勿等 hasNavigable，否则缓存永远空、列表不显示「条达标」）
                        if (getSortedInPlayMatches().length > 0) {
                            await scanAllMatchesRuleMeet(false);
                            renderActiveMatches(document.getElementById(PANEL_ID));
                            if (!placing && !targetOption && hasNavigableInPlayMatches() &&
                                await maybeNavigateToRuleMeetMatch()) {
                                return true;
                            }
                        }
                        return false;
                    },
                },
                {
                    name: 'strategy-odds-bet',
                    run: async function () {
                        if (heartbeatTick % 2 === 0) {
                            await loadStrategies(true, true);
                        }
                        if (!shouldRunHeavyDomWork() || !panelReady || !strategyList.length || placing) {
                            if (panelReady && !placing) maybeTriggerAutoBet(false);
                            return true;
                        }
                        if (pollTimer) {
                            await lightweightReevaluateOdds();
                            maybeTriggerAutoBet(false);
                            return true;
                        }
                        const prevKey = strategyHitRenderKey();
                        await refreshTargetOption(false);
                        if (strategyHitRenderKey() !== prevKey) {
                            renderPanel(false, false);
                        }
                        maybeTriggerAutoBet(false);
                        return true;
                    },
                },
            ];
        });
        return __heartbeatRunner;
    }

    async function runHeartbeatTask() {
        if (heartbeatInFlight) return;
        heartbeatInFlight = true;
        try {
            await getHeartbeatRunner().runHeartbeatTask();
        } finally {
            heartbeatInFlight = false;
        }
    }

    function scheduleHeartbeat() {
        if (heartbeatTimer) return;
        function tick() {
            runHeartbeatTask().catch(function (e) {
                console.warn('[hty-inplay] heartbeat', e);
            });
            heartbeatTimer = setTimeout(tick, getHeartbeatIntervalMs());
        }
        heartbeatTimer = setTimeout(tick, getHeartbeatIntervalMs());
    }

    function onMatchRouteChange(newId) {
        if (!newId || newId === matchId) return;
        matchId = newId;
        if (userManualMatchId && String(newId) === String(userManualMatchId)) {
            clearUserManualMatchLock();
        }
        clearUserManualCategoryTabLock();
        lastWatchedCategoryTab = getActiveMarketCategoryTab();
        lastMatchesListKey = '';
        lastStrategyListKey = '';
        lastStrategyHitKey = '';
        lastPanelKey = '';
        lastStatusPanelKey = '';
        lastOddsSignature = '';
        targetOption = null;
        strategyList = [];
        strategyTrigger = '';
        lastMatchScanAt = 0;
        loadActiveMatches(true);
        loadStrategies(false);
    }

    function checkUrlChange() {
        const href = window.location.href;
        const prevTab = lastWatchedCategoryTab;
        const nextTab = isOnInplayMatchPage() ? getActiveMarketCategoryTab() : '';
        if (href === lastWatchedUrl) return;
        lastWatchedUrl = href;
        if (isOnInplayMatchPage()) {
            syncUserManualCategoryTabFromUrl(prevTab, nextTab);
            lastWatchedCategoryTab = nextTab;
        }
        const newId = getMatchIdFromUrl();
        if (newId) {
            onMatchRouteChange(newId);
            rememberCurrentMatchReturnUrl();
            return;
        }
        if (isStrandedSportEventsPage()) {
            matchId = '';
            void ensureStrandedSportEventsBoot();
            return;
        }
        if (isWrongSportSectionPage()) {
            matchId = '';
            recoverFromWrongSportSection('路由进入非足球版块，统一拉回足球滚球列表');
            return;
        }
        if (isInplayListPage()) {
            matchId = '';
            void ensureListPageBoot();
            if (isKeepaliveEnterMatchPhase()) {
                setKeepalivePhaseEnter();
                if (!listPageEnterMatchActive) bootListPageEnterMatch();
            }
            return;
        }
    }

    function setupRouteWatcher() {
        if (routeWatchTimer) return;
        ensureWrongSportSectionGuard();
        setupManualCategoryTabWatch();
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
        routeWatchTimer = setInterval(checkUrlChange, 2000);
    }

    function isIdleLoginModalVisible() {
        if (!document.body) return false;
        return !!findVisibleDialogContaining([IDLE_LOGIN_HINT, '重新登录']) ||
            !!findVisibleDialogContaining(['温馨提示', IDLE_LOGIN_HINT]);
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

    const ODDS_CHANGE_HINTS = [
        '赔率已更改', '赔率已变更', '赔率变动', '赔率变化',
        '赔率或投注项已更改', '赔率、投注项或比分已更改',
        '投注项的赔率、盘口或有效性已更改', '盘口已更改',
    ];
    const ODDS_CHANGE_CONFIRM_LABELS = ['确定', 'OK', '接受更改', '接受变更并投注'];

    function textHasOddsChangeHint(text) {
        const normalized = normalizeHintText(text || '');
        if (!normalized) return false;
        if (normalized.indexOf('已提交') >= 0) return false;
        for (let i = 0; i < ODDS_CHANGE_HINTS.length; i++) {
            if (normalized.indexOf(normalizeHintText(ODDS_CHANGE_HINTS[i])) >= 0) return true;
        }
        return /oddschanged|oddshavechanged|acceptchange/i.test(normalized);
    }

    function isOddsChangedModalVisible() {
        for (let i = 0; i < ODDS_CHANGE_HINTS.length; i++) {
            if (findVisibleDialogContaining([ODDS_CHANGE_HINTS[i]])) return true;
        }
        const cart = getSportCartRoot();
        if (cart && isElementVisible(cart) && textHasOddsChangeHint(cart.textContent || '')) {
            return true;
        }
        const roots = getModalCandidateRoots();
        for (let r = 0; r < roots.length; r++) {
            if (textHasOddsChangeHint(roots[r].textContent || '')) return true;
        }
        return false;
    }

    function labelMatchesConfirm(label, wanted) {
        const normalized = normalizeHintText(label);
        if (!normalized) return false;
        for (let j = 0; j < wanted.length; j++) {
            const want = normalizeHintText(wanted[j]);
            if (normalized === want) return true;
            if (want.indexOf('接受') >= 0 && normalized.indexOf('接受') >= 0) return true;
            if (want === 'OK' && /^accept$/i.test(normalized)) return true;
        }
        return false;
    }

    function findConfirmInRoot(root, labels) {
        if (!root) return null;
        const wanted = labels || ODDS_CHANGE_CONFIRM_LABELS;
        const nodes = root.querySelectorAll(
            'button, [role="button"], a, [class*="btn"], [class*="Btn"], ' +
            '[class*="button"], [class*="Button"], [data-testid*="confirm"], [data-testid*="Confirm"]'
        );
        let best = null;
        let bestScore = -1;
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            if (!labelMatchesConfirm(el.textContent || '', wanted)) continue;
            const rect = el.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (area <= 0) continue;
            const t = normalizeHintText(el.textContent || '');
            // 「接受更改」底部大按钮优先；其它确认钮仍偏向更具体的小区域
            const preferLarge = t.indexOf('接受') >= 0;
            const score = preferLarge
                ? (1000000 + rect.top * 10 + area)
                : (1000000 - area + rect.top);
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }
        return best;
    }

    function findOddsChangedConfirmButton() {
        const actionBtn = findBetActionButton();
        if (actionBtn && isAcceptChangesBtn(actionBtn) && isElementVisible(actionBtn)) {
            return actionBtn;
        }
        for (let i = 0; i < ODDS_CHANGE_HINTS.length; i++) {
            const btn = findModalConfirmButton([ODDS_CHANGE_HINTS[i]]);
            if (btn) return btn;
        }
        let dialog = null;
        for (let i = 0; i < ODDS_CHANGE_HINTS.length; i++) {
            dialog = findVisibleDialogContaining([ODDS_CHANGE_HINTS[i]]);
            if (dialog) break;
        }
        if (dialog) return findConfirmInRoot(dialog);
        const cart = getSportCartRoot();
        if (cart && textHasOddsChangeHint(cart.textContent || '')) {
            const inCart = findConfirmInRoot(cart);
            if (inCart) return inCart;
        }
        return null;
    }

    async function dismissOddsChangedModalIfAny() {
        if (!isOddsChangedModalVisible()) return false;
        const btn = findOddsChangedConfirmButton();
        if (!btn) return false;
        await humanScrollTo(btn);
        robustClick(btn);
        await humanDelay(400, 700);
        return true;
    }

    async function ensureOddsChangeAccepted(maxRounds) {
        const rounds = maxRounds != null ? maxRounds : 6;
        for (let i = 0; i < rounds; i++) {
            const actionBtn = findBetActionButton();
            if (actionBtn && isAcceptChangesBtn(actionBtn)) {
                await clickAcceptOddsChangeButton();
                await humanDelay(300, 600);
                continue;
            }
            if (!isOddsChangedModalVisible()) return true;
            setBetStep('赔率已更改，点击确定继续…');
            renderPanel(true);
            const ok = await dismissOddsChangedModalIfAny();
            if (!ok) return false;
            await humanDelay(300, 600);
        }
        return !isOddsChangedModalVisible() &&
            !(findBetActionButton() && isAcceptChangesBtn(findBetActionButton()));
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
            tryAutoRelogin({ urgent: true }).catch(function (e) {
                console.warn('[hty-inplay] 闲置后自动登录', e);
            });
        }, 800);
        return true;
    }

    function pickNextActiveMatch() {
        return pickInplayNavigableMatch(matchId);
    }

    async function handleMatchBlocked() {
        if (matchEndedHandling || placing || shouldBlockMatchAutoNav()) return false;
        if (!isMatchBlockedModalVisible()) return false;
        if (Date.now() - lastBlockedHandleAt < MATCH_BLOCKED_HANDLE_COOLDOWN_MS) return false;

        matchEndedHandling = true;
        try {
            console.log('[hty-inplay] 检测到赛事暂不可进弹窗（非已结束）');
            dismissMatchBlockedModal();
            await humanDelay(400, 800);

            if (!shouldAllowAutoNavigation('blocked-modal') ||
                isCurrentMatchEnded() ||
                isMatchEndedModalVisible()) {
                setWaitingKickoffState();
                lastBlockedHandleAt = Date.now();
                suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, '暂不可进/已结束');
                return true;
            }

            const item = getCurrentMatchItem();
            if (item && isKickoffReached(item, KICKOFF_EARLY_MS) && matchId && !isCurrentMatchEnded()) {
                setBetStep('开赛切换滚球…');
                lastBlockedHandleAt = Date.now();
                gotoInplayMatch(matchId, 'tg', true);
                return true;
            }
            lastBlockedHandleAt = Date.now();
            if (!isUserManualMatchLockActive()) void maybeAutoNavigateToInplay();
            return true;
        } finally {
            matchEndedHandling = false;
        }
    }

    async function handleMatchEnded() {
        if (matchEndedHandling || placing || shouldBlockMatchAutoNav()) return false;
        if (Date.now() - lastEndedSwitchAt < MATCH_ENDED_SWITCH_COOLDOWN_MS) return false;
        const modalEnded = isMatchEndedModalVisible();
        const fieldEnded = isCurrentMatchEnded();
        if (!modalEnded && !fieldEnded) return false;

        matchEndedHandling = true;
        try {
            console.log('[hty-inplay] 检测到赛事已结束' + (modalEnded ? '（弹窗）' : '（状态）'));
            if (matchId && !isMatchLocallyEnded(matchId)) {
                markMatchLocallyEnded(matchId, modalEnded ? 'page_modal' : 'page_status');
            }
            if (isUserManualMatchActive()) clearUserManualMatchLock();
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

            const nextId = pickNextNavigableMatchId([matchId]);
            lastEndedSwitchAt = Date.now();
            if (!nextId) {
                suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, '赛事已结束且无下一场');
                setWaitingKickoffState();
                targetOption = null;
                strategyStates = [];
                lastScanButtonCount = 0;
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
            if (isMatchEndedUiVisible()) {
                noteCurrentMatchUnavailable('page_ended');
                handleMatchEnded().catch(function (e) {
                    console.error('[hty-inplay] handleMatchEnded', e);
                });
                return;
            }
            if (isMatchBlockedModalVisible()) {
                handleMatchBlocked().catch(function (e) {
                    console.error('[hty-inplay] handleMatchBlocked', e);
                });
            }
        }
        matchEndedWatchTimer = setInterval(checkEnded, 2000);
        function onDomChange() {
            scheduleDomCheck('matchEnded', checkEnded, DOM_CHECK_DEBOUNCE_MS);
        }
        function attachObserver() {
            if (matchEndedObserver || !document.body) return;
            matchEndedObserver = new MutationObserver(onDomChange);
            matchEndedObserver.observe(document.body, { childList: true, subtree: false });
        }
        if (document.body) attachObserver();
        else document.addEventListener('DOMContentLoaded', attachObserver);
    }

    function isElementVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (!rect.width && !rect.height) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    }

    function normalizeHintText(text) {
        return String(text || '').replace(/\s+/g, '');
    }

    function nodeTextContainsAll(node, hints) {
        const text = normalizeHintText(node.textContent || '');
        for (let i = 0; i < hints.length; i++) {
            if (text.indexOf(normalizeHintText(hints[i])) < 0) return false;
        }
        return true;
    }

    function getModalCandidateRoots() {
        const roots = [];
        const selectors = [
            '[role="dialog"]', 'dialog',
            '[data-testid*="overlay"]', '[data-testid*="modal"]', '[data-testid*="Modal"]',
        ];
        const seen = new Set();
        for (let s = 0; s < selectors.length; s++) {
            const nodes = document.querySelectorAll(selectors[s]);
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (seen.has(node) || !isElementVisible(node)) continue;
                seen.add(node);
                roots.push(node);
            }
        }
        const cart = document.querySelector(
            '[data-testid="SportCart"], [data-testid="overlay-container-cart-overlay-task-id"]'
        );
        if (cart && isElementVisible(cart) && !seen.has(cart)) roots.push(cart);
        return roots;
    }

    function findVisibleDialogContaining(hints) {
        if (!hints || !hints.length) return null;
        const roots = getModalCandidateRoots();
        for (let r = 0; r < roots.length; r++) {
            if (nodeTextContainsAll(roots[r], hints)) return roots[r];
        }
        return null;
    }

    function scheduleDomCheck(key, fn, delayMs) {
        if (domCheckTimers[key]) clearTimeout(domCheckTimers[key]);
        domCheckTimers[key] = setTimeout(function () {
            domCheckTimers[key] = null;
            fn();
        }, delayMs != null ? delayMs : DOM_CHECK_DEBOUNCE_MS);
    }

    function getObserveRoot() {
        return document.querySelector(PAGE_READY_SEL) || document.body;
    }

    function shouldRunHeavyDomWork() {
        if (document.hidden || pageHidden) return false;
        if (placing) return false;
        if (panelCollapsed && !shouldKeepOddsWatch()) return false;
        return true;
    }

    function teardownOddsObserver() {
        if (oddsObserver) {
            oddsObserver.disconnect();
            oddsObserver = null;
        }
    }

    function syncOddsObserverState() {
        teardownOddsObserver();
        if (panelReady && !document.hidden && !pageHidden) {
            setupOddsObserver();
        }
    }

    function setupVisibilityWatch() {
        pageHidden = document.hidden;
        document.addEventListener('visibilitychange', function () {
            pageHidden = document.hidden;
            if (document.hidden) {
                teardownOddsObserver();
            } else {
                loginCache.ts = 0;
                syncOddsObserverState();
                runHeartbeatTask().catch(function (e) {
                    console.warn('[hty-inplay] visibility resume', e);
                });
                if (panelReady && strategyList.length && !placing) {
                    refreshTargetOption(true).then(function () {
                        renderPanel(false, false);
                    }).catch(function (e) {
                        console.warn('[hty-inplay] visibility rescan', e);
                    });
                }
            }
        });
    }

    function findHeaderRegisterButton() {
        const testBtn = document.querySelector('[data-testid="liquid-glass-button-register-btn"]');
        if (testBtn && isElementVisible(testBtn)) return testBtn;
        const nodes = document.querySelectorAll('button, [role="button"], a');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top > 140) continue;
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label === '注册') return el;
        }
        return null;
    }

    function hasVisibleLoggedOutAuthButtons() {
        const loginBtn = findHeaderLoginButton();
        if (loginBtn && isElementVisible(loginBtn)) return true;
        const registerBtn = findHeaderRegisterButton();
        if (registerBtn && isElementVisible(registerBtn)) return true;
        return false;
    }

    function hasVisibleLoggedInBalanceUi() {
        const positiveSelectors = [
            '[data-testid="balance-text"]',
            '[data-testid="liquid-glass-button-user-now-balance-btn"]',
            '[data-testid="HeaderUserBalance"]',
            '[data-testid="user-now-balance"]',
            '[data-testid*="UserBalance"]',
        ];
        for (let i = 0; i < positiveSelectors.length; i++) {
            const el = document.querySelector(positiveSelectors[i]);
            if (isElementVisible(el)) return true;
        }
        return false;
    }

    function isLoggedIn() {
        // 顶栏「登录/注册」可见 = 明确未登录（优先于缓存，避免误显示已登录）
        if (!/\/login/i.test(window.location.pathname) && hasVisibleLoggedOutAuthButtons()) {
            loginCache = { value: false, ts: Date.now() };
            return false;
        }

        const now = Date.now();
        if (now - loginCache.ts < LOGIN_CACHE_MS) return loginCache.value;

        let result = false;
        if (!/\/login/i.test(window.location.pathname)) {
            // 仅余额/用户区作为已登录依据；不要用投注悬浮球（未登录也可能存在）
            result = hasVisibleLoggedInBalanceUi();
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
        if (input._valueTracker) {
            input._valueTracker.setValue('');
        }
        if (desc && desc.set) desc.set.call(input, value);
        else input.value = value;
        dispatchInputEvents(input, value, 'insertFromPaste');
    }

    function isSimplePasswordModalVisible() {
        if (!document.body) return false;
        return !!findVisibleDialogContaining(['简易密码']) ||
            !!findVisibleDialogContaining(['四位数字']) ||
            !!findVisibleDialogContaining(['设置简易密码']);
    }

    function walkDomIncludingShadow(root, fn) {
        if (!root) return;
        const stack = [root];
        while (stack.length) {
            const node = stack.pop();
            fn(node);
            if (node.shadowRoot) stack.push(node.shadowRoot);
            const children = node.children;
            if (children) {
                for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
            }
        }
    }

    function isEditablePinTarget(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return isSimplePasswordInput(el);
        if (el.isContentEditable) return true;
        const ce = el.getAttribute && el.getAttribute('contenteditable');
        return ce === '' || ce === 'true';
    }

    function isLikelyPageSearchInput(input) {
        if (!input || input.tagName !== 'INPUT') return false;
        const type = String(input.type || '').toLowerCase();
        if (type === 'search') return true;
        const hints = [
            input.placeholder,
            input.getAttribute('aria-label'),
            input.name,
            input.id,
            input.getAttribute('data-testid'),
            input.className,
        ].join(' ').toLowerCase();
        if (/search|搜寻|搜索|查询|query|filter/.test(hints)) return true;
        const parent = input.closest(
            '[role="search"], [data-testid*="search"], [class*="search"], [class*="Search"]'
        );
        return !!parent;
    }

    function isInsideSimplePasswordScope(el) {
        if (!el) return false;
        const root = getSimplePasswordSearchRoot();
        if (root && root !== document.body && root.contains(el)) return true;
        const modal = findSimplePasswordModalRoot();
        if (modal && modal.contains(el)) return true;
        if (modal && el.getBoundingClientRect) {
            const rect = el.getBoundingClientRect();
            const mr = modal.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 &&
                rect.left >= mr.left - 12 && rect.right <= mr.right + 12 &&
                rect.top >= mr.top - 12 && rect.bottom <= mr.bottom + 12) {
                return true;
            }
        }
        return false;
    }

    function isLikelyHiddenOtpInput(input) {
        if (!input || input.tagName !== 'INPUT') return false;
        if (String(input.type || '').toLowerCase() !== 'hidden') return false;
        const maxLen = Number(input.maxLength);
        if (maxLen > 0 && maxLen <= 6) return true;
        const mode = String(input.inputMode || input.getAttribute('inputmode') || '').toLowerCase();
        if (mode === 'numeric') return true;
        const auto = String(input.autocomplete || input.getAttribute('autocomplete') || '').toLowerCase();
        if (auto.indexOf('one-time-code') >= 0) return true;
        const name = String(input.name || input.id || input.getAttribute('aria-label') || '').toLowerCase();
        return /pin|password|code|otp|verify|simple/.test(name);
    }

    function isSimplePasswordInput(input) {
        if (!input) return false;
        if (input.tagName !== 'INPUT' && input.tagName !== 'TEXTAREA') return false;
        if (isLikelyPageSearchInput(input)) return false;
        const type = String(input.type || '').toLowerCase();
        if (type === 'hidden') {
            const modal = findSimplePasswordModalRoot();
            if (modal && modal.contains(input)) return true;
            return isLikelyHiddenOtpInput(input);
        }
        if (type === 'password' || type === 'tel' || type === 'number' || type === 'text') return true;
        const mode = String(input.inputMode || input.getAttribute('inputmode') || '').toLowerCase();
        if (mode === 'numeric') return true;
        const maxLen = Number(input.maxLength);
        if (maxLen > 0 && maxLen <= 6) return true;
        const auto = String(input.autocomplete || input.getAttribute('autocomplete') || '').toLowerCase();
        if (auto.indexOf('one-time-code') >= 0) return true;
        const name = String(input.name || input.id || input.getAttribute('aria-label') || '').toLowerCase();
        return name.indexOf('pin') >= 0 || name.indexOf('password') >= 0 || name.indexOf('code') >= 0;
    }

    function isValidSimplePasswordTarget(input) {
        if (!input) return false;
        if (isLikelyPageSearchInput(input)) return false;
        const modal = findSimplePasswordModalRoot();
        if (modal && modal.contains(input) &&
            (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
            const type = String(input.type || '').toLowerCase();
            if (type === 'hidden' || type === 'text' || type === 'tel' ||
                type === 'password' || type === 'number') {
                return true;
            }
        }
        if (!isSimplePasswordInput(input)) return false;
        return isInsideSimplePasswordScope(input);
    }

    function blurMisfocusedPageSearch() {
        const active = document.activeElement;
        if (active && isLikelyPageSearchInput(active)) {
            active.blur();
        }
    }

    function findHiddenOtpInput(root) {
        const modal = findSimplePasswordModalRoot();
        const scope = modal || root;
        if (!scope) return null;
        let namedHidden = null;
        let anyHidden = null;
        let offscreenText = null;
        walkDomIncludingShadow(scope, function (node) {
            if (node.tagName !== 'INPUT') return;
            if (isLikelyPageSearchInput(node)) return;
            const type = String(node.type || '').toLowerCase();
            if (type === 'hidden') {
                anyHidden = node;
                if (isLikelyHiddenOtpInput(node)) namedHidden = node;
                return;
            }
            if ((type === 'text' || type === 'tel' || type === 'password' || type === 'number') &&
                modal && modal.contains(node) && !isElementVisible(node)) {
                offscreenText = node;
            }
        });
        return namedHidden || offscreenText || anyHidden;
    }

    function findSimplePasswordModalRoot() {
        return findVisibleDialogContaining(['设置简易密码']) ||
            findVisibleDialogContaining(['简易密码', '四位']) ||
            findVisibleDialogContaining(['简易密码']) ||
            findVisibleDialogContaining(['四位数字']);
    }

    function getSimplePasswordSearchRoot() {
        const modal = findSimplePasswordModalRoot();
        if (!modal) return document.body;
        let root = modal;
        let node = modal;
        while (node && node !== document.body) {
            const role = node.getAttribute && node.getAttribute('role');
            const testid = node.getAttribute && node.getAttribute('data-testid') || '';
            const style = window.getComputedStyle(node);
            if (role === 'dialog' || node.tagName === 'DIALOG' ||
                /modal|overlay|dialog|popup/i.test(String(node.className || '')) ||
                /modal|overlay|dialog|popup/i.test(testid) ||
                style.position === 'fixed') {
                root = node;
            }
            node = node.parentElement;
        }
        return root || modal;
    }

    function collectSimplePasswordInputs(root) {
        const seen = new Set();
        const matched = [];
        function pushInput(input) {
            if (!input || seen.has(input)) return;
            seen.add(input);
            matched.push(input);
        }
        walkDomIncludingShadow(root, function (node) {
            if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
                if (isSimplePasswordInput(node)) pushInput(node);
            }
        });
        return matched;
    }

    function findAllSimplePasswordInputs(root) {
        return collectSimplePasswordInputs(root || document.body);
    }

    function findGlobalSimplePasswordInputs() {
        const searchRoot = getSimplePasswordSearchRoot();
        const modal = findSimplePasswordModalRoot();
        const fromTree = collectSimplePasswordInputs(searchRoot).filter(function (input) {
            return isValidSimplePasswordTarget(input);
        });
        if (modal) {
            const hidden = findHiddenOtpInput(searchRoot);
            if (hidden && isValidSimplePasswordTarget(hidden) && fromTree.indexOf(hidden) < 0) {
                fromTree.unshift(hidden);
            }
            return fromTree;
        }
        const fromBody = collectSimplePasswordInputs(document.body).filter(function (input) {
            return !isLikelyPageSearchInput(input);
        });
        const seen = new Set();
        const merged = [];
        fromTree.concat(fromBody).forEach(function (input) {
            if (seen.has(input)) return;
            seen.add(input);
            merged.push(input);
        });
        if (!modal || !merged.length) return merged;
        const modalRect = modal.getBoundingClientRect();
        merged.sort(function (a, b) {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const da = Math.abs(ra.left - modalRect.left) + Math.abs(ra.top - modalRect.top);
            const db = Math.abs(rb.left - modalRect.left) + Math.abs(rb.top - modalRect.top);
            return da - db;
        });
        return merged;
    }

    function findVisibleSimplePasswordInputs(root) {
        const matched = findAllSimplePasswordInputs(root);
        const visible = [];
        for (let i = 0; i < matched.length; i++) {
            if (!isValidSimplePasswordTarget(matched[i])) continue;
            if (isElementVisible(matched[i])) visible.push(matched[i]);
        }
        return visible;
    }

    function findOtpSlotInputs(root) {
        if (!root) return [];
        const slots = [];
        walkDomIncludingShadow(root, function (node) {
            if (node.tagName !== 'INPUT') return;
            const maxLen = Number(node.maxLength);
            if (maxLen === 1) slots.push(node);
        });
        const matched = [];
        for (let i = 0; i < slots.length; i++) {
            const input = slots[i];
            if (isElementVisible(input)) {
                matched.push(input);
                continue;
            }
            const host = input.parentElement;
            if (host && isElementVisible(host)) matched.push(input);
        }
        return matched.length >= 4 ? matched.slice(0, 4) : matched;
    }

    function findVisualOtpBoxes(root) {
        if (!root) return [];
        let best = [];
        walkDomIncludingShadow(root, function (node) {
            if (!node.children || node.children.length < 4) return;
            const kids = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (!isElementVisible(child)) continue;
                if ((child.textContent || '').replace(/\s+/g, '').length > 2) continue;
                const rect = child.getBoundingClientRect();
                if (rect.width < 18 || rect.width > 120 || rect.height < 18 || rect.height > 120) continue;
                kids.push(child);
            }
            if (kids.length !== 4) return;
            const w0 = kids[0].getBoundingClientRect().width;
            let similar = true;
            for (let j = 1; j < kids.length; j++) {
                const r = kids[j].getBoundingClientRect();
                if (Math.abs(r.width - w0) > 10 || Math.abs(r.height - kids[0].getBoundingClientRect().height) > 10) {
                    similar = false;
                    break;
                }
            }
            if (similar) best = kids;
        });
        return best;
    }

    function resolvePinTarget(preferred) {
        if (preferred && isEditablePinTarget(preferred) && isValidSimplePasswordTarget(preferred)) {
            return preferred;
        }
        if (preferred) {
            const nested = preferred.querySelector && preferred.querySelector(
                'input:not([type="search"]), textarea, [contenteditable="true"]'
            );
            if (nested && isEditablePinTarget(nested) && isValidSimplePasswordTarget(nested)) return nested;
            const searchRoot = getSimplePasswordSearchRoot();
            const hidden = findHiddenOtpInput(searchRoot);
            if (hidden && isValidSimplePasswordTarget(hidden)) return hidden;
        }
        blurMisfocusedPageSearch();
        const active = document.activeElement;
        if (active && active !== document.body && isEditablePinTarget(active) &&
            isValidSimplePasswordTarget(active)) {
            return active;
        }
        const searchRoot = getSimplePasswordSearchRoot();
        const hidden = findHiddenOtpInput(searchRoot);
        if (hidden && isValidSimplePasswordTarget(hidden)) return hidden;
        const inputs = findGlobalSimplePasswordInputs();
        if (inputs.length) return inputs[0];
        return null;
    }

    async function focusSimplePasswordEntry(modal) {
        const searchRoot = getSimplePasswordSearchRoot();
        const otpSlots = findOtpSlotInputs(searchRoot);
        if (otpSlots.length) {
            safeClick(otpSlots[0]);
            otpSlots[0].focus();
            await humanDelay(120, 220);
            return resolvePinTarget(otpSlots[0]);
        }

        const visualBoxes = findVisualOtpBoxes(searchRoot);
        if (visualBoxes.length >= 4) {
            safeClick(visualBoxes[0]);
            await humanDelay(120, 220);
            return resolvePinTarget(visualBoxes[0]);
        }

        const visibleInputs = findVisibleSimplePasswordInputs(searchRoot);
        if (visibleInputs.length) {
            safeClick(visibleInputs[0]);
            visibleInputs[0].focus();
            await humanDelay(120, 220);
            return resolvePinTarget(visibleInputs[0]);
        }

        const allInputs = findGlobalSimplePasswordInputs();
        for (let i = 0; i < allInputs.length; i++) {
            const input = allInputs[i];
            const host = input.closest('label, button, [role="button"], div, span') || input.parentElement;
            if (host && isElementVisible(host)) safeClick(host);
            else safeClick(input);
            input.focus();
            await humanDelay(120, 220);
            const target = resolvePinTarget(input);
            if (target) return target;
        }
        if (visualBoxes.length) {
            safeClick(visualBoxes[0]);
            await humanDelay(120, 220);
            return resolvePinTarget(visualBoxes[0]);
        }
        return null;
    }

    function dispatchInputEvents(input, value, inputType) {
        if (!input) return;
        try {
            input.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: inputType || 'insertFromPaste',
                data: value,
            }));
        } catch (e) { /* ignore */ }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function insertTextIntoTarget(target, text) {
        if (!target) return false;
        target.focus();
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            setNativeInputValue(target, text);
            return true;
        }
        if (target.isContentEditable) {
            target.textContent = text;
            dispatchInputEvents(target, text, 'insertFromPaste');
            return true;
        }
        try {
            if (document.execCommand('insertText', false, text)) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    async function pasteSimplePassword(target, pin) {
        if (!target) return false;
        target.focus();
        safeClick(target);
        await humanDelay(100, 200);
        if (await insertTextIntoTarget(target, pin)) {
            await humanDelay(120, 220);
            if (isSimplePasswordEntered() || String(target.value || '').replace(/\D/g, '').length >= 4) {
                return true;
            }
        }
        try {
            const dt = new DataTransfer();
            dt.setData('text/plain', pin);
            target.dispatchEvent(new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt,
            }));
            dispatchInputEvents(target, pin, 'insertFromPaste');
            await humanDelay(120, 220);
            return isSimplePasswordEntered() || String(target.value || '').replace(/\D/g, '').length >= 4;
        } catch (e) {
            return false;
        }
    }

    async function typePinChar(input, ch) {
        if (!input || !isValidSimplePasswordTarget(input)) return false;
        input.focus();
        const key = String(ch);
        const code = key >= '0' && key <= '9' ? 'Digit' + key : 'Key' + key.toUpperCase();
        const opts = { key: key, code: code, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keypress', opts));
        if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
            const proto = input.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            const next = (input.value || '') + key;
            if (input._valueTracker) {
                input._valueTracker.setValue(input.value || '');
            }
            if (desc && desc.set) desc.set.call(input, next);
            else input.value = next;
        } else if (input.isContentEditable) {
            input.textContent = (input.textContent || '') + key;
        } else {
            try { document.execCommand('insertText', false, key); } catch (e) { /* ignore */ }
        }
        dispatchInputEvents(input, key, 'insertText');
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
        await humanDelay(90, 180);
        return true;
    }

    async function typePinOnTarget(target, pin) {
        const digits = String(pin || '').replace(/\D/g, '').slice(0, 4);
        if (digits.length !== 4) return false;
        const input = resolvePinTarget(target);
        if (!input) return false;
        for (let i = 0; i < 4; i++) {
            if (!(await typePinChar(input, digits.charAt(i)))) return false;
        }
        return true;
    }

    async function fillViaVisualOtpBoxes(boxes, pin) {
        const digits = String(pin || '').replace(/\D/g, '').slice(0, 4);
        if (digits.length !== 4 || !boxes || boxes.length < 4) return false;
        const searchRoot = getSimplePasswordSearchRoot();
        safeClick(boxes[0]);
        await humanDelay(120, 220);
        const hidden = findHiddenOtpInput(searchRoot);
        if (hidden && await pasteSimplePassword(hidden, digits)) return true;
        if (hidden && await typePinOnTarget(hidden, digits)) return true;
        for (let i = 0; i < 4; i++) {
            const box = boxes[i];
            safeClick(box);
            await humanDelay(120, 220);
            let target = resolvePinTarget(box);
            if (!target) {
                target = findHiddenOtpInput(searchRoot);
            }
            if (!target) {
                const globalInputs = findGlobalSimplePasswordInputs();
                target = globalInputs.length ? globalInputs[0] : null;
            }
            if (!target) return false;
            if (!(await typePinChar(target, digits.charAt(i)))) return false;
        }
        return isSimplePasswordEntered();
    }

    function findSimplePasswordInputs() {
        const searchRoot = getSimplePasswordSearchRoot();
        const otpSlots = findOtpSlotInputs(searchRoot);
        if (otpSlots.length >= 4) return otpSlots;
        const globalInputs = findGlobalSimplePasswordInputs();
        if (globalInputs.length === 1) return globalInputs;
        if (globalInputs.length >= 4) {
            const oneChar = globalInputs.filter(function (input) { return Number(input.maxLength) === 1; });
            if (oneChar.length >= 4) return oneChar.slice(0, 4);
            return globalInputs.slice(0, 4);
        }
        const visible = findVisibleSimplePasswordInputs(searchRoot);
        if (visible.length) return visible;
        return globalInputs;
    }

    function isSimplePasswordEntered(modal) {
        const inputs = findSimplePasswordInputs();
        if (inputs.length === 1) {
            const val = String(inputs[0].value || '').replace(/\D/g, '');
            return val.length >= 4;
        }
        if (inputs.length >= 4) {
            let filled = 0;
            for (let i = 0; i < 4; i++) {
                if (String(inputs[i].value || '').replace(/\D/g, '').length >= 1) filled += 1;
            }
            return filled >= 4;
        }
        return false;
    }

    function logSimplePasswordDebug(reason) {
        const modal = findSimplePasswordModalRoot();
        const searchRoot = getSimplePasswordSearchRoot();
        const inputs = findSimplePasswordInputs();
        const globalInputs = findGlobalSimplePasswordInputs();
        const visualBoxes = findVisualOtpBoxes(searchRoot);
        console.warn('[hty-inplay] PIN debug(' + reason + ')', {
            modal: !!modal,
            searchRootTag: searchRoot && searchRoot.tagName,
            inputs: inputs.length,
            globalInputs: globalInputs.length,
            visualBoxes: visualBoxes.length,
            activeTag: document.activeElement && document.activeElement.tagName,
            activeType: document.activeElement && document.activeElement.type,
        });
    }

    async function fillSimplePassword(pin) {
        const digits = String(pin || '').replace(/\D/g, '').slice(0, 4);
        if (digits.length !== 4) return false;
        const modal = findSimplePasswordModalRoot();
        const searchRoot = getSimplePasswordSearchRoot();
        if (!modal && !isSimplePasswordModalVisible()) return false;

        blurMisfocusedPageSearch();

        const target = await focusSimplePasswordEntry(modal);
        const inputs = findSimplePasswordInputs();
        const visualBoxes = findVisualOtpBoxes(searchRoot);
        const hiddenOtp = findHiddenOtpInput(searchRoot);

        if (hiddenOtp && await pasteSimplePassword(hiddenOtp, digits)) return true;

        if (visualBoxes.length >= 4 && await fillViaVisualOtpBoxes(visualBoxes, digits)) {
            return true;
        }

        if (inputs.length === 1) {
            const input = inputs[0];
            if (await pasteSimplePassword(input, digits)) return true;
            input.focus();
            setNativeInputValue(input, '');
            await humanDelay(80, 140);
            if (await typePinOnTarget(input, digits)) return true;
        }

        if (inputs.length >= 4) {
            for (let i = 0; i < 4; i++) {
                const input = inputs[i];
                input.focus();
                safeClick(input);
                setNativeInputValue(input, digits.charAt(i));
                await humanDelay(80, 180);
            }
            if (isSimplePasswordEntered(modal)) return true;
            for (let i = 0; i < 4; i++) {
                if (!(await typePinChar(inputs[i], digits.charAt(i)))) break;
            }
            return true;
        }

        if (target && await pasteSimplePassword(target, digits)) {
            return true;
        }

        if (target && await typePinOnTarget(target, digits)) {
            return true;
        }

        for (let i = 0; i < 4; i++) {
            const btn = findDigitButtonIn(modal || searchRoot, digits.charAt(i));
            if (!btn) break;
            safeClick(btn);
            await humanDelay(100, 220);
        }
        if (isSimplePasswordEntered(modal)) return true;

        const retryTarget = await focusSimplePasswordEntry(modal);
        if (retryTarget && await typePinOnTarget(retryTarget, digits)) {
            return true;
        }

        logSimplePasswordDebug('all-strategies-failed');
        return false;
    }

    function findHeaderLoginButton() {
        const testBtn = document.querySelector('[data-testid="liquid-glass-button-login-btn"]');
        if (testBtn && isElementVisible(testBtn)) return testBtn;
        const nodes = document.querySelectorAll('button, [role="button"], a');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const rect = el.getBoundingClientRect();
            // 顶栏登录按钮；避免误匹配正文里的「登录」文案
            if (rect.top > 140) continue;
            if (rect.width < 28 || rect.height < 18) continue;
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label === '登录') return el;
        }
        return null;
    }

    function findDigitButtonIn(root, digit) {
        if (!root) return null;
        // 禁止在整页找数字：会误点赔率/比分并跳场
        if (root === document.body || root === document.documentElement || root === document) {
            return null;
        }
        const modal = findSimplePasswordModalRoot();
        if (modal && !modal.contains(root) && root !== modal) {
            root = modal;
        }
        const nodes = root.querySelectorAll('button, [role="button"], div, span');
        let best = null;
        let bestArea = Infinity;
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            if (el.closest && el.closest('[data-testid*="oddsBtn"], [data-testid*="OddsBtn"]')) {
                continue;
            }
            const label = (el.textContent || '').replace(/\s+/g, '');
            if (label !== String(digit)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (rect.width > 96 || rect.height > 96) continue;
            const area = rect.width * rect.height;
            if (area < bestArea) {
                bestArea = area;
                best = el;
            }
        }
        return best;
    }

    function pressEnterOnActiveElement() {
        const el = document.activeElement;
        if (!el || isLikelyPageSearchInput(el)) return;
        const opts = { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent('keydown', opts));
        el.dispatchEvent(new KeyboardEvent('keyup', opts));
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
        const opts = options || {};
        const lite = !!opts.lite;
        const urgent = !!opts.urgent;
        const force = !!opts.force;
        if (reloginInProgress) return false;
        loginCache.ts = 0;
        if (isLoggedIn()) return false;
        if (!lite && !urgent && placing) return false;
        const cooldown = urgent ? RELOGIN_COOLDOWN_URGENT_MS : RELOGIN_COOLDOWN_MS;
        if (!force && Date.now() - lastReloginAttemptAt < cooldown) return false;

        reloginInProgress = true;
        lastReloginAttemptAt = Date.now();
        // 登录全程禁止自动跳场，避免输 0514 时被切走导致失败
        lockNavigationForLogin(LOGIN_NAV_LOCK_MS, '自动登录中');
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
                await humanDelay(urgent ? 200 : 500, urgent ? 400 : 900);
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
                    await waitFor(isSimplePasswordModalVisible, urgent ? 6000 : 10000, urgent ? 250 : 400);
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
            await humanDelay(urgent ? 200 : 400, urgent ? 450 : 800);

            loginCache.ts = 0;
            try {
                await waitFor(function () {
                    loginCache.ts = 0;
                    return isLoggedIn() || !isSimplePasswordModalVisible();
                }, urgent ? 3000 : 4000, urgent ? 200 : 250);
            } catch (e) { /* 可能仍需手动确认 */ }

            if (!isLoggedIn() && isSimplePasswordModalVisible()) {
                const submitBtn = findSimplePasswordSubmitButton();
                if (submitBtn) {
                    setReloginStatus('自动登录：确认…');
                    safeClick(submitBtn);
                    await humanDelay(urgent ? 800 : 1500, urgent ? 1400 : 2500);
                } else {
                    setReloginStatus('自动登录：尝试提交密码…');
                    pressEnterOnActiveElement();
                    await humanDelay(urgent ? 700 : 1200, urgent ? 1200 : 2000);
                }
            }

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
            loginCache.ts = 0;
            const stillOnLoginUi = !isLoggedIn() && (
                isSimplePasswordModalVisible() || isIdleLoginModalVisible()
            );
            // 函数结束后仍短暂锁导航：避免密码刚输完就被切场打断
            lockNavigationForLogin(
                stillOnLoginUi ? LOGIN_NAV_LOCK_MS : LOGIN_NAV_SETTLE_MS,
                stillOnLoginUi ? '登录弹窗仍在' : '登录收尾静默'
            );
            reloginInProgress = false;
        }
    }

    function scheduleLoginWatch() {
        if (loginWatchTimer) return;
        function tick() {
            loginCache.ts = 0;
            const wasLoggedIn = !!loginCache.value;
            const nowLoggedIn = isLoggedIn();
            loginWatchTimer = setTimeout(tick, nowLoggedIn ? SESSION_LOGIN_WATCH_MS : RELOGIN_WATCH_MS);
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            if (!nowLoggedIn && !reloginInProgress) {
                const urgent = placing || wasLoggedIn || hasVisibleLoggedOutAuthButtons();
                tryAutoRelogin({ urgent: urgent, lite: false }).catch(function (e) {
                    console.warn('[hty-inplay] 自动登录', e);
                });
            }
            if (wasLoggedIn && !nowLoggedIn) {
                console.warn('[hty-inplay] 检测到登录已失效');
                htyApiState.headers.authorization = '';
                setBetStep('登录已失效，正在自动登录…');
                renderPanel(true);
                if (!reloginInProgress) {
                    tryAutoRelogin({ urgent: true }).catch(function (e) {
                        console.warn('[hty-inplay] 登录失效后自动登录', e);
                    });
                }
                if (!placing) {
                    betResult = 'pending';
                    schedulePoll();
                }
            } else if (!nowLoggedIn) {
                renderPanel(true);
            }
        }
        loginWatchTimer = setTimeout(tick, RELOGIN_WATCH_MS);
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
        return getSortedInPlayMatchIds();
    }

    async function tryRotateInplayMatch(reason) {
        if (!AUTO_PAGE_NAV_ENABLED) return false;
        if (shouldBlockMatchAutoNav()) return false;
        if (isMatchNavStickActive()) return false;
        if (!canLeaveCurrentMatchForAutoSwitch()) return false;
        if (await maybeNavigateToRuleMeetMatch()) return true;
        if (isUserManualMatchLockActive()) return false;
        const ids = getNavigableInPlayMatches().map(function (item) {
            return String(item.matchId);
        });
        if (ids.length < 2) return false;
        if (placing || shouldAutoBet() || shouldHoldCurrentMatch()) return false;
        if (Date.now() - lastMatchRotateAt < MATCH_ROTATE_MS) return false;

        const nextId = pickRotatingInplayMatch(matchId);
        if (!nextId || String(nextId) === String(matchId)) return false;

        lastMatchRotateAt = Date.now();
        console.log('[hty-inplay] 轮换进行中比赛', matchId, '->', nextId, reason || '');
        await navigateToInplayMatch(nextId, reason || '轮换进行中比赛');
        return true;
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
        // 紧急：保活永不整页跳转，只做 API
        console.log('[hty-inplay] 保活：仅 API，禁止页面跳转', targetId || '');
        try { clearKeepalivePhase(); } catch (e) { /* ignore */ }
        try {
            await sessionApiKeepAlive();
        } catch (e) {
            console.warn('[hty-inplay] API 保活失败（不跳转）', e);
        }
    }

    function resolveKeepaliveTargetId() {
        if (shouldHoldCurrentMatch() && matchId) {
            return String(matchId);
        }
        if (isCurrentMatchEnded() || isMatchEndedModalVisible()) {
            return pickInplayNavigableMatch(matchId);
        }
        const navigableIds = getNavigableInPlayMatches().map(function (item) {
            return String(item.matchId);
        });
        if (navigableIds.length >= 2) {
            return pickInplayNavigableMatch(matchId);
        }
        if (matchId && navigableIds.indexOf(String(matchId)) >= 0) {
            return String(matchId);
        }
        if (navigableIds.length === 1) {
            return navigableIds[0];
        }
        return pickInplayNavigableMatch('') || resolveStrandedTargetMatchId() || '';
    }

    async function runKeepaliveSwitch() {
        if (placing || reportSyncing || matchEndedHandling) return;
        if (isUserManualMatchLockActive()) return;
        if (shouldAutoBet() || shouldHoldCurrentMatch()) return;

        if (isMatchEndedModalVisible() || isCurrentMatchEnded()) {
            // 结束处理可能切场；自动跳转关闭时仅更新状态、不跳
            handleMatchEnded().catch(function (e) {
                console.warn('[hty-inplay] 保活检测到赛事结束', e);
            });
            return;
        }

        try {
            activeMatches = await fetchActiveMatches();
        } catch (e) {
            console.warn('[hty-inplay] 保活刷新赛事失败', e);
        }

        // 禁止保活轮换整页跳转
        // if (await tryRotateInplayMatch('保活轮换')) return;

        try {
            await sessionApiKeepAlive();
        } catch (e) {
            console.warn('[hty-inplay] API保活失败（不跳转）', e);
        }
    }

    function scheduleMatchKeepAlive() {
        if (pageSwitchTimer) return;
        // 废弃 phase 归一；比赛页清掉 enter-match 残留
        getKeepalivePhase();
        if (isOnMatchBetPage() && isKeepaliveEnterMatchPhase()) {
            clearKeepalivePhase();
        }
        pageSwitchTimer = setInterval(function () {
            if (placing || reportSyncing || matchEndedHandling || shouldBlockMatchAutoNav()) return;
            if (isUserManualMatchLockActive()) return;
            if (shouldAutoBet() || shouldHoldCurrentMatch()) return;
            if (isIdleLoginModalVisible()) {
                dismissIdleLoginModal();
                return;
            }
            if (isCurrentMatchEnded()) return;
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
        if (!shouldRunHeavyDomWork()) return;
        if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
        refreshDebounceTimer = setTimeout(async function () {
            refreshDebounceTimer = null;
            if (placing || !strategyList.length || !shouldRunHeavyDomWork()) return;
            const prevKey = strategyHitRenderKey();
            await refreshTargetOption(false);
            if (strategyHitRenderKey() !== prevKey) {
                renderPanel(false, false);
            }
            maybeTriggerAutoBet(false);
        }, 1500);
    }

    function setupOddsObserver() {
        if (oddsObserver || document.hidden || pageHidden) return;
        if (!panelReady || !strategyList.length || placing) return;
        if (panelCollapsed && !shouldKeepOddsWatch()) return;
        const root = getObserveRoot();
        if (!root) return;
        oddsObserver = new MutationObserver(function () {
            scheduleDomCheck('odds', scheduleOddsRescan, DOM_CHECK_DEBOUNCE_MS);
        });
        oddsObserver.observe(root, { childList: true, subtree: true });
    }

    function schedulePeriodicRescan() {
        scheduleHeartbeat();
    }

    function stopPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function setBetStep(text) {
        betStep = text || '';
        updatePanelStatus();
    }

    function setBetResult(result, detail) {
        betResult = result || 'pending';
        if (detail) betStep = detail;
        updatePanelStatus();
    }

    function resultLabel(loggedIn) {
        if (betResult === 'success') {
            const step = betStep || '';
            if (/订单恢复|接口未捕获|后台确认|重复请求已合并|接口迟到的响应|未走完整弹窗流程/.test(step)) {
                return '投注成功·恢复确认';
            }
            return '投注成功';
        }
        if (betResult === 'failed') {
            const step = betStep || '';
            if (/^失败：|^下注失败：/.test(step)) {
                return truncatePanelText(step.replace(/^下注/, ''), 28);
            }
            return '投注失败';
        }
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
            '（≥' + formatOddsDisplay(targetOption.minOdds) + '）· 投注 ' + formatBetStakeSummary(targetOption);
    }

    function formatOddsDisplay(val) {
        if (val == null || val === '') return '—';
        const n = Number(val);
        if (isNaN(n)) return String(val);
        return n.toFixed(2);
    }

    function formatPlateLineDisplay(val) {
        if (val == null || val === '') return '';
        const s = String(val).trim();
        if (hasSplitPlateNotation(s)) return s;
        const n = parseFloat(s);
        if (!isNaN(n)) return n.toFixed(1);
        return s;
    }

    function formatStrategyPlateDesc(item) {
        const market = MARKET_LABEL[item.market] || item.market || '—';
        const side = PLATE_ON_LABEL[item.plateOn] || item.plateOn || '';
        const lineRaw = item.plateOnK != null && item.plateOnK !== '' ? String(item.plateOnK) : '';
        const line = lineRaw ? formatPlateLineDisplay(lineRaw) : '';
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

    function executedStrategiesStorageKey(id) {
        return EXECUTED_STRATEGIES_KEY + '_' + (id || matchId || '');
    }

    function loadExecutedStrategyStore(id) {
        try {
            const raw = sessionStorage.getItem(executedStrategiesStorageKey(id));
            const store = raw ? JSON.parse(raw) : {};
            return store && typeof store === 'object' ? store : {};
        } catch (e) {
            return {};
        }
    }

    function saveExecutedStrategyStore(store, id) {
        try {
            sessionStorage.setItem(executedStrategiesStorageKey(id), JSON.stringify(store || {}));
        } catch (e) { /* ignore */ }
    }

    function pruneExecutedStrategyStore(store) {
        const now = Date.now();
        Object.keys(store).forEach(function (recHash) {
            const entry = store[recHash];
            if (!entry || now - Number(entry.at || 0) > EXECUTED_STRATEGY_TTL_MS) {
                delete store[recHash];
            }
        });
        return store;
    }

    function getLocalExecutedStrategy(recHash) {
        if (!recHash) return null;
        const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
        return store[recHash] || null;
    }

    function isStrategyLocallyExecuted(recHash) {
        return !!getLocalExecutedStrategy(recHash);
    }

    function isBetPlacedForOption(option, recHash) {
        return isScriptDedupStored(option, recHash);
    }

    function isRealBetOrderNo(orderno) {
        const s = orderno != null ? String(orderno) : '';
        if (!s) return false;
        // ui- / pending- 为本地占位，不能传给策略状态接口（否则易拒收导致「有单却未更新状态」）
        if (s.indexOf('ui-') === 0 || s.indexOf('pending-') === 0) return false;
        return true;
    }

    function rememberExecutedStrategy(recHash, orderno, option, meta) {
        if (!recHash && !(option && option.testid)) return;
        const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
        const prev = recHash ? store[recHash] : null;
        const entry = {
            orderno: orderno ? String(orderno) : ((prev && prev.orderno) || ''),
            at: Date.now(),
            // pendingSync: wait backend rule PUT; cleared by markExecutedStrategySynced
            pendingSync: meta && meta.pendingSync === false ? false : true,
            betOdds: meta && meta.betOdds != null ? meta.betOdds
                : (prev && prev.betOdds != null ? prev.betOdds : undefined),
            betStake: meta && meta.betStake != null ? meta.betStake
                : (prev && prev.betStake != null ? prev.betStake : undefined),
            matchId: meta && meta.matchId ? String(meta.matchId)
                : ((prev && prev.matchId) || String(matchId || '')),
        };
        // only mark the bet strategy; testid is for DOM-refresh dedup
        if (recHash) store[recHash] = entry;
        if (isBetDedupEnabled() && option && option.testid) {
            store['tid:' + option.testid] = Object.assign({}, entry, { recHash: recHash || '' });
        }
        saveExecutedStrategyStore(store);
    }

    function markExecutedStrategySynced(recHash, orderno) {
        if (!recHash) return;
        const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
        const entry = store[recHash] || { at: Date.now() };
        entry.pendingSync = false;
        entry.at = entry.at || Date.now();
        if (orderno) entry.orderno = String(orderno);
        store[recHash] = entry;
        saveExecutedStrategyStore(store);
    }

    function markStrategyExecutedLocally(recHash) {
        if (!recHash) return;
        for (let i = 0; i < strategyList.length; i++) {
            if (strategyList[i].recHash === recHash) {
                strategyList[i].ruleMeetIgnore = '2';
            }
        }
        for (let j = 0; j < strategyStates.length; j++) {
            const st = strategyStates[j];
            if (!st.strategy || st.strategy.recHash !== recHash) continue;
            st.execStatus = 'executed';
            st.actionable = false;
            st.hit = false;
            st.dedupBlocked = true;
            if (st.strategy) st.strategy.ruleMeetIgnore = '2';
        }
        if (targetOption && targetOption.strategy && targetOption.strategy.recHash === recHash) {
            targetOption = null;
        }
        lastStrategyListKey = '';
        lastStrategyHitKey = '';
    }

    function markBetAttemptStarted(option, recHash, stakeInput) {
        if (!recHash) return;
        markBetAttempt(recHash, option, stakeInput);
        markBetInFlight(recHash, {
            testid: option && option.testid,
            stake: stakeInput != null ? String(stakeInput) : '',
            bttsSubstitute: !!(option && option.bttsSubstitute),
            substitutedFrom: option && option.substitutedFrom ? option.substitutedFrom : null,
            market: option && option.market ? String(option.market) : '',
            side: option && option.side ? String(option.side) : '',
            label: option && option.label ? String(option.label) : '',
        });
    }

    function betInFlightStorageKey(id) {
        return BET_INFLIGHT_KEY + '_' + (id || matchId || '');
    }

    function getBetInFlight(id) {
        try {
            const raw = sessionStorage.getItem(betInFlightStorageKey(id));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.at) return null;
            if (Date.now() - Number(data.at) > BET_RECOVERY_WINDOW_MS) {
                clearBetInFlight(id);
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    function markBetInFlight(recHash, meta) {
        try {
            sessionStorage.setItem(betInFlightStorageKey(), JSON.stringify({
                recHash: recHash || '',
                testid: meta && meta.testid ? String(meta.testid) : '',
                stake: meta && meta.stake != null ? String(meta.stake) : '',
                at: meta && meta.at ? Number(meta.at) : Date.now(),
                bttsSubstitute: !!(meta && meta.bttsSubstitute),
                substitutedFrom: meta && meta.substitutedFrom ? meta.substitutedFrom : null,
                market: meta && meta.market ? String(meta.market) : '',
                side: meta && meta.side ? String(meta.side) : '',
                label: meta && meta.label ? String(meta.label) : '',
            }));
        } catch (e) { /* ignore */ }
    }

    function clearBetInFlight(id) {
        try {
            sessionStorage.removeItem(betInFlightStorageKey(id));
        } catch (e) { /* ignore */ }
    }

    function isBetSlipSubmittedUiLegacy() {
        const cart = document.querySelector(
            '[data-testid="SportCart"], [data-testid="overlay-container-cart-overlay-task-id"], ' +
            '[data-testid*="SportCart"], [data-testid*="cart-overlay"], [class*="SportCart"]'
        );
        if (cart && isElementVisible(cart)) {
            const text = cart.textContent || '';
            if (text.indexOf('已提交') >= 0 || /投注成功|submitte?d/i.test(text)) return true;
        }
        return !!findVisibleDialogContaining(['已提交']) ||
            !!findVisibleDialogContaining(['投注成功']);
    }

    /** 侧栏成功页可能没有 dialog role，用可见「已提交」标题兜底 */
    function findVisibleBetSubmittedTitle() {
        const nodes = document.querySelectorAll(
            'div, span, h1, h2, h3, p, strong, [class*="title"], [class*="Title"], [class*="status"], [class*="Status"]'
        );
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!raw || raw.length > 16) continue;
            const t = normalizeHintText(raw);
            if (t !== '已提交' && t.indexOf('已提交') !== 0) continue;
            let p = el.parentElement;
            for (let d = 0; d < 10 && p; d++) {
                const pt = normalizeHintText(p.textContent || '');
                if (pt.indexOf('可赢') >= 0 || pt.indexOf('USDT') >= 0 ||
                    pt.indexOf('1注') >= 0 || pt.indexOf('投注') >= 0) {
                    return el;
                }
                p = p.parentElement;
            }
        }
        return null;
    }

    function isBetSubmittedDrawerVisible() {
        if (isBetSlipSubmittedUiLegacy()) return true;
        if (findVisibleDialogContaining(['已提交', '可赢'])) return true;
        if (findVisibleDialogContaining(['已提交', 'USDT'])) return true;
        if (findVisibleBetSubmittedTitle()) return true;
        const roots = getModalCandidateRoots();
        for (let r = 0; r < roots.length; r++) {
            const text = normalizeHintText(roots[r].textContent || '');
            if (text.indexOf('已提交') >= 0 &&
                (text.indexOf('可赢') >= 0 || text.indexOf('USDT') >= 0 ||
                    text.indexOf('投注') >= 0)) {
                return true;
            }
        }
        return false;
    }

    function isBetSlipSubmittedUi() {
        return isBetSubmittedDrawerVisible();
    }

    const BET_SUBMITTED_CONFIRM_LABELS = ['确定', 'OK', '确认', '完成', '关闭'];

    function findBetSubmittedDrawerRoot() {
        const cart = getSportCartRoot();
        if (cart && isElementVisible(cart)) {
            const text = cart.textContent || '';
            if (text.indexOf('已提交') >= 0 || /投注成功|submitte?d/i.test(text)) return cart;
        }
        const title = findVisibleBetSubmittedTitle();
        if (title) {
            let p = title.parentElement;
            for (let d = 0; d < 8 && p; d++) {
                const pt = normalizeHintText(p.textContent || '');
                if (pt.indexOf('可赢') >= 0 || pt.indexOf('USDT') >= 0) return p;
                p = p.parentElement;
            }
            return title.parentElement || title;
        }
        return findVisibleDialogContaining(['已提交', '可赢']) ||
            findVisibleDialogContaining(['已提交', 'USDT']) ||
            findVisibleDialogContaining(['已提交']) ||
            findVisibleDialogContaining(['投注成功']);
    }

    function findBetSubmittedCloseButton(root) {
        const scope = root || document;
        const nodes = scope.querySelectorAll(
            'button, [role="button"], a, [aria-label], [data-testid*="close"], [data-testid*="Close"], ' +
            '[class*="close"], [class*="Close"]'
        );
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const label = normalizeHintText(el.textContent || el.getAttribute('aria-label') || '');
            const tid = String(el.getAttribute('data-testid') || '').toLowerCase();
            if (label === '×' || label === 'x' || label === '关闭' || /close/i.test(tid)) {
                return el;
            }
        }
        return null;
    }

    function findBetSubmittedConfirmButton() {
        const root = findBetSubmittedDrawerRoot();
        if (root) {
            const inRoot = findConfirmInRoot(root, BET_SUBMITTED_CONFIRM_LABELS);
            if (inRoot) return inRoot;
        }
        let btn = findModalConfirmButton(['已提交', '可赢']) ||
            findModalConfirmButton(['已提交', 'USDT']) ||
            findModalConfirmButton(['已提交']) ||
            findModalConfirmButton(['投注成功']);
        if (btn) return btn;
        if (!isBetSubmittedDrawerVisible()) return null;
        const viewportBottom = window.innerHeight;
        const candidates = document.querySelectorAll(
            'button, [role="button"], a, [class*="btn"], [class*="Btn"], ' +
            '[class*="button"], [class*="Button"]'
        );
        let best = null;
        let bestTop = -1;
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (!isElementVisible(el)) continue;
            if (!labelMatchesConfirm(el.textContent || '', BET_SUBMITTED_CONFIRM_LABELS)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.bottom < viewportBottom - 160 || rect.height <= 0) continue;
            if (rect.top > bestTop) {
                bestTop = rect.top;
                best = el;
            }
        }
        if (best) return best;
        return findBetSubmittedCloseButton(root);
    }

    async function dismissBetSubmittedDrawer(maxRounds) {
        const rounds = maxRounds != null ? maxRounds : 4;
        for (let i = 0; i < rounds; i++) {
            if (!isBetSubmittedDrawerVisible()) return true;
            const btn = findBetSubmittedConfirmButton();
            if (btn) {
                await humanScrollTo(btn);
                robustClick(btn);
                await humanDelay(350, 550);
                if (!isBetSubmittedDrawerVisible()) return true;
            } else {
                const closeBtn = findBetSubmittedCloseButton(findBetSubmittedDrawerRoot());
                if (closeBtn) {
                    robustClick(closeBtn);
                    await humanDelay(350, 550);
                    if (!isBetSubmittedDrawerVisible()) return true;
                } else {
                    await humanDelay(200, 350);
                }
            }
        }
        if (isBetSubmittedDrawerVisible()) {
            console.warn('[hty-inplay] 已提交抽屉仍在，未能自动点击确定（仍按成功处理）');
        }
        return !isBetSubmittedDrawerVisible();
    }

    function buildBetRecordFromUiSuccess(option) {
        const ts = Date.now();
        return buildStrategyBetRecord(option, {
            orderno: 'ui-' + String(matchId || '') + '-' + ts,
            delay: null,
            singles: [],
            response: { uiSubmitted: true },
            requestBody: null,
        }, null);
    }

    async function waitForBetOutcomeAfterSubmit(betWaitHandle, option, sinceAt) {
        const deadline = Date.now() + BET_API_WAIT_MS + 8000;
        let apiPayload = null;
        let apiError = null;
        let attachedGen = -1;

        function attachCurrentWaiter() {
            if (!betWaitHandle || !betWaitHandle.promise) return;
            if (attachedGen === betWaitHandle.generation) return;
            attachedGen = betWaitHandle.generation;
            const gen = attachedGen;
            const p = betWaitHandle.promise;
            p.then(function (payload) {
                if (gen !== betWaitHandle.generation) {
                    // rearm 后世代变了：勿丢弃成功响应，写入迟到缓存供后续收尾/更新策略
                    if (payload && payload.orderno) {
                        lastCapturedBetSuccess = { payload: payload, at: Date.now() };
                        console.warn('[hty-inplay] 下注成功响应遇 rearm，已转入迟到缓存', payload.orderno);
                    }
                    return;
                }
                apiPayload = payload;
            }).catch(function (e) {
                if (gen !== betWaitHandle.generation) return;
                apiError = e;
            });
        }

        function finish(result) {
            try {
                if (betWaitHandle && typeof betWaitHandle.clear === 'function') {
                    betWaitHandle.clear();
                } else {
                    clearBetResultWaiter();
                }
            } catch (e) { /* ignore */ }
            return result;
        }

        attachCurrentWaiter();

        try {
            while (Date.now() < deadline) {
                attachCurrentWaiter();
                if (apiPayload) {
                    return finish({ source: 'api', payload: apiPayload });
                }
                const lateCap = consumeLastCapturedBetSuccess(option, sinceAt);
                if (lateCap) {
                    return finish({ source: 'api_late', payload: lateCap });
                }
                // 等待结果期间出现「赔率已更改 / 接受更改」：点掉并必要时再点投注
                if (needsAcceptOddsChange()) {
                    setBetStep('等待结果时赔率已更改，点击接受更改…');
                    renderPanel(true);
                    const accepted = await clickAcceptOddsChangeButton();
                    if (!accepted) await dismissOddsChangedModalIfAny();
                    if (betWaitHandle && typeof betWaitHandle.rearm === 'function') {
                        betWaitHandle.rearm();
                        attachCurrentWaiter();
                    }
                    await humanDelay(600, 1100);
                    if (isBetSubmittedDrawerVisible()) {
                        // fall through to success drawer handling below
                    } else if (needsAcceptOddsChange()) {
                        await humanDelay(400, 700);
                        continue;
                    } else {
                        const actionBtn = findBetActionButton();
                        if (actionBtn && !isAcceptChangesBtn(actionBtn) && !actionBtn.disabled) {
                            setBetStep('接受更改后重新点击投注…');
                            renderPanel(true);
                            if (betWaitHandle && typeof betWaitHandle.rearm === 'function') {
                                betWaitHandle.rearm();
                                attachCurrentWaiter();
                            }
                            await humanScrollTo(actionBtn);
                            robustClick(actionBtn);
                            await humanDelay(600, 1100);
                        }
                        continue;
                    }
                }
                if (isBetSubmittedDrawerVisible()) {
                    setBetStep('检测到已提交，按成功处理…');
                    renderPanel(true);
                    dismissBetSubmittedDrawer(3).catch(function () { /* ignore */ });
                    if (apiPayload) {
                        return finish({ source: 'api', payload: apiPayload });
                    }
                    const captured = consumeLastCapturedBetSuccess(option, sinceAt);
                    if (captured) {
                        return finish({ source: 'api_late', payload: captured });
                    }
                    try {
                        const recovered = await tryRecoverSuccessfulBet(option, sinceAt, {
                            quick: true,
                            retries: 1,
                            gapMs: 0,
                        });
                        if (recovered) {
                            const orderno = String(recovered.orderno || '');
                            if (orderno.indexOf('ui-') === 0) {
                                return finish({ source: 'ui', record: recovered });
                            }
                            return finish({ source: 'order', record: recovered });
                        }
                    } catch (e) {
                        console.warn('[hty-inplay] 已提交后快速查单失败，按 UI 成功', e);
                    }
                    console.log('[hty-inplay] 已提交抽屉确认，按 UI 成功处理');
                    return finish({ source: 'ui', record: buildBetRecordFromUiSuccess(option) });
                }
                if (apiError) {
                    const captured = consumeLastCapturedBetSuccess(option, sinceAt);
                    if (captured) {
                        return finish({ source: 'api_late', payload: captured });
                    }
                }
                await humanDelay(350, 550);
            }

            if (apiPayload) return finish({ source: 'api', payload: apiPayload });
            if (isBetSubmittedDrawerVisible()) {
                dismissBetSubmittedDrawer(3).catch(function () { /* ignore */ });
                const captured = consumeLastCapturedBetSuccess(option, sinceAt);
                if (captured) return finish({ source: 'api_late', payload: captured });
                try {
                    const recovered = await tryRecoverSuccessfulBet(option, sinceAt, {
                        quick: true,
                        retries: 1,
                        gapMs: 0,
                    });
                    if (recovered) {
                        const orderno = String(recovered.orderno || '');
                        if (orderno.indexOf('ui-') === 0) {
                            return finish({ source: 'ui', record: recovered });
                        }
                        return finish({ source: 'order', record: recovered });
                    }
                } catch (e) { /* ignore */ }
                console.log('[hty-inplay] 已提交抽屉确认，按 UI 成功处理');
                return finish({ source: 'ui', record: buildBetRecordFromUiSuccess(option) });
            }
            const lateCaptured = consumeLastCapturedBetSuccess(option, sinceAt);
            if (lateCaptured) return finish({ source: 'api_late', payload: lateCaptured });
            if (apiError) throw apiError;
            throw new Error('下注接口响应超时');
        } catch (err) {
            try {
                if (betWaitHandle && typeof betWaitHandle.clear === 'function') betWaitHandle.clear();
                else clearBetResultWaiter();
            } catch (e) { /* ignore */ }
            throw err;
        }
    }

    function extractOrdersFromReport(json) {
        const out = [];
        const seen = new Set();
        function walk(node) {
            if (!node) return;
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) walk(node[i]);
                return;
            }
            if (typeof node !== 'object') return;
            const orderno = node.orderno || node.orderNo || node.order_id || node.orderId;
            if (orderno) {
                const key = String(orderno);
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(node);
                }
            }
            const keys = Object.keys(node);
            for (let i = 0; i < keys.length; i++) walk(node[keys[i]]);
        }
        walk(json);
        return out;
    }

    function parseOrderTimestamp(order) {
        const fields = [
            order.betTime, order.createTime, order.createdTime, order.time,
            order.created_at, order.placedAt, order.orderTime,
        ];
        for (let i = 0; i < fields.length; i++) {
            const t = Date.parse(fields[i]);
            if (!isNaN(t)) return t;
        }
        return 0;
    }

    function orderLineVariants(strategy, market) {
        const plateOnK = strategy && strategy.plateOnK != null && strategy.plateOnK !== ''
            ? String(strategy.plateOnK) : '';
        const variants = [];
        if (!plateOnK) return variants;
        variants.push(plateOnK.toLowerCase());
        variants.push(canonicalPlateLine(plateOnK, market).toLowerCase());
        const n = parseFloat(plateOnK);
        if (!isNaN(n)) {
            variants.push(n.toFixed(1));
            variants.push(n.toFixed(2));
            variants.push(String(n));
        }
        return variants.filter(function (v, idx, arr) {
            return v && arr.indexOf(v) === idx;
        });
    }

    function orderMarketHits(blob, market) {
        const m = String(market || '').toLowerCase();
        if (!m) return true;
        if (blob.indexOf(m) >= 0) return true;
        if (m === 'aou' && (blob.indexOf('a-ou') >= 0 || blob.indexOf('aou') >= 0)) return true;
        if (m === 'hou' && (blob.indexOf('h-ou') >= 0 || blob.indexOf('hou') >= 0)) return true;
        if (m === 'btts' && blob.indexOf('btts') >= 0) return true;
        if (m === 'ou' && (blob.indexOf('"ou"') >= 0 || blob.indexOf('|ou|') >= 0)) return true;
        return false;
    }

    function orderPlateOnHits(blob, plateOn) {
        const p = String(plateOn || '').toLowerCase();
        if (!p) return true;
        if (blob.indexOf('"' + p + '"') >= 0) return true;
        if (blob.indexOf('"beton":"' + p) >= 0) return true;
        if (blob.indexOf('"beton": "' + p) >= 0) return true;
        if (p === 'ov' && (/"ov"|over|大/.test(blob))) return true;
        if (p === 'ud' && (/"ud"|under|小/.test(blob))) return true;
        if (p === 'y' && (/"y"|both|两队|btts/.test(blob))) return true;
        return false;
    }

    function orderStakeHits(blob, option) {
        try {
            const stake = resolveBetStakeValue(option);
            if (stake == null) return false;
            const parts = [String(stake)];
            const n = Number(stake);
            if (!isNaN(n)) {
                parts.push(n.toFixed(1));
                parts.push(n.toFixed(2));
            }
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] && blob.indexOf(parts[i]) >= 0) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function getBetMetaForOption(option) {
        const recHash = option && option.strategy && option.strategy.recHash;
        if (!recHash) return null;
        const attempt = getBetAttempt(recHash);
        if (attempt) return attempt;
        const inflight = getBetInFlight();
        if (inflight && inflight.recHash === recHash) return inflight;
        return null;
    }

    /** 查单/恢复时还原 BTTS 替代下注的实际盘口信息，避免按原 hou/aou 策略匹配不到订单 */
    function enrichOptionFromBetMeta(option) {
        if (!option) return option;
        const meta = getBetMetaForOption(option);
        if (!meta || !meta.bttsSubstitute) return option;
        if (option.bttsSubstitute && option.testid && option.testid === meta.testid) return option;
        const enriched = Object.assign({}, option, {
            bttsSubstitute: true,
            substitutedFrom: meta.substitutedFrom || option.substitutedFrom || null,
            testid: meta.testid || option.testid,
            market: meta.market || 'btts',
            side: meta.side || option.side || 'y',
            label: meta.label || option.label ||
                formatTargetOptionLabel(option.strategy, true),
        });
        return enriched;
    }

    function orderMatchesOption(order, option) {
        if (!order || !option) return false;
        option = enrichOptionFromBetMeta(option);
        const blob = JSON.stringify(order || {}).toLowerCase();
        const mid = matchId && String(matchId);
        if (!mid || blob.indexOf(mid) < 0) return false;

        const testid = option.testid && String(option.testid).toLowerCase();
        if (testid && blob.indexOf(testid) >= 0) return true;

        const strategy = option.strategy || {};
        const market = getOptionBetMarket(option) ||
            (strategy.market && String(strategy.market).toLowerCase());
        const plateOn = getOptionBetPlateOn(option) ||
            (strategy.plateOn && String(strategy.plateOn).toLowerCase());
        const lineVariants = option.bttsSubstitute
            ? []
            : orderLineVariants(strategy, market);
        const lineHit = !lineVariants.length || lineVariants.some(function (v) {
            return blob.indexOf(v) >= 0;
        });

        if (lineHit && orderStakeHits(blob, option) && orderMarketHits(blob, market)) {
            return orderPlateOnHits(blob, plateOn);
        }

        if (!orderMarketHits(blob, market)) return false;
        if (!orderPlateOnHits(blob, plateOn)) return false;
        return lineHit;
    }

    function canQueryOrdersReport() {
        restoreApiState();
        restoreKnownOrdersApiBase();
        if (htyApiState.apiBase && isExcludedApiOrigin(htyApiState.apiBase)) {
            htyApiState.apiBase = '';
        }
        return !!(htyApiState.apiBase || htyApiState.headers.authorization ||
            getCachedOrdersReportText(matchId));
    }

    async function findRecentOrderForOptionOnce(option, sinceAt, fetchOpts) {
        const cutoff = sinceAt || (Date.now() - BET_RECOVERY_WINDOW_MS);
        const loadOpts = Object.assign({
            passive: true,
            gmOnly: true,
            softFail: true,
        }, fetchOpts || {});
        if (!loadOpts.forUpload && !canQueryOrdersReport() && !getCachedOrdersReportText(matchId)) {
            return null;
        }
        try {
            const text = await fetchMatchOrdersReportText(matchId, loadOpts);
            if (!text) return null;
            const json = JSON.parse(text);
            const orders = extractOrdersFromReport(json);
            let best = null;
            let bestTs = 0;
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];
                if (!orderMatchesOption(order, option)) continue;
                const ts = parseOrderTimestamp(order);
                if (ts && ts < cutoff) continue;
                const rank = ts || Date.now();
                if (rank >= bestTs) {
                    bestTs = rank;
                    best = order;
                }
            }
            return best;
        } catch (e) {
            if (!loadOpts.softFail) {
                console.warn('[hty-inplay] 查询近期订单失败', e);
            }
            return null;
        }
    }

    async function findRecentOrderForOption(option, sinceAt, retryOpts) {
        const retries = retryOpts && retryOpts.retries != null ? retryOpts.retries : 1;
        const gapMs = retryOpts && retryOpts.gapMs != null ? retryOpts.gapMs : 0;
        const fetchOpts = retryOpts && retryOpts.fetchOpts ? retryOpts.fetchOpts : null;
        for (let i = 0; i < retries; i++) {
            if (i > 0) {
                setBetStep('查询订单确认…' + i + '/' + (retries - 1));
                renderPanel(true);
                await humanDelay(gapMs, gapMs + 800);
            }
            const order = await findRecentOrderForOptionOnce(option, sinceAt, fetchOpts);
            if (order) return order;
        }
        return null;
    }

    function getBetRecHash(option, betRecord) {
        if (betRecord && betRecord.recHash) return betRecord.recHash;
        if (option && option.strategy && option.strategy.recHash) return option.strategy.recHash;
        return '';
    }

    function consumeLastCapturedBetSuccess(option, sinceAt) {
        const cap = lastCapturedBetSuccess;
        if (!cap) return null;
        if (Date.now() - cap.at > BET_API_WAIT_MS + 8000) {
            lastCapturedBetSuccess = null;
            return null;
        }
        if (sinceAt && cap.at < sinceAt - 3000) return null;
        lastCapturedBetSuccess = null;
        console.log('[hty-inplay] 使用迟到的下注接口响应', cap.payload.orderno);
        return cap.payload;
    }

    async function tryRecoverSuccessfulBet(option, sinceAt, retryOpts) {
        option = enrichOptionFromBetMeta(option);
        const opts = retryOpts || {};
        const captured = consumeLastCapturedBetSuccess(option, sinceAt);
        if (captured) {
            return buildStrategyBetRecord(option, captured, captured.requestBody);
        }

        const hadUiDrawer = isBetSubmittedDrawerVisible();
        if (hadUiDrawer) {
            setBetStep('检测到已提交，自动点击确定…');
            renderPanel(true);
            await dismissBetSubmittedDrawer();
            setBetStep('已提交，正在确认…');
            renderPanel(true);
            await humanDelay(400, 700);
        }

        const fetchOpts = {
            passive: true,
            gmOnly: true,
            quick: opts.quick !== false,
            softFail: true,
        };
        restoreApiState();
        restoreKnownOrdersApiBase();
        if (htyApiState.apiBase && isExcludedApiOrigin(htyApiState.apiBase)) {
            htyApiState.apiBase = '';
        }
        mergeProbeCredentials(await probeCredentialsFromPage());
        let order = null;
        if (canQueryOrdersReport() || getCachedOrdersReportText(matchId)) {
            const retries = opts.retries != null
                ? opts.retries
                : (opts.quick === false || hadUiDrawer ? 3 : 1);
            const gapMs = opts.gapMs != null ? opts.gapMs : 1500;
            order = await findRecentOrderForOption(option, sinceAt, {
                retries: retries,
                gapMs: gapMs,
                fetchOpts: fetchOpts,
            });
        }
        if (order) {
            const orderno = String(
                order.orderId || order.orderno || order.orderNo || order.order_id || ''
            );
            console.log('[hty-inplay] 已从订单列表恢复下注成功', orderno);
            return buildStrategyBetRecord(option, {
                orderno: orderno,
                delay: order.delay,
                singles: [order],
                response: order,
                requestBody: null,
            }, null);
        }
        if (hadUiDrawer || isBetSubmittedDrawerVisible()) {
            console.warn('[hty-inplay] UI已提交且GM查单无结果，按成功处理');
            return buildBetRecordFromUiSuccess(option);
        }
        return null;
    }

    async function finalizeBetSuccess(option, betRecord, fromAutoBet, extraMsg) {
        const recHash = getBetRecHash(option, betRecord);
        let ruleExtra = extraMsg || '';
        markStrategyExecutedLocally(recHash);
        rememberExecutedStrategy(recHash, betRecord && betRecord.orderno, option, {
            pendingSync: true,
            betOdds: betRecord && betRecord.betOdds,
            betStake: betRecord && betRecord.betStake,
            matchId: betRecord && betRecord.matchId ? betRecord.matchId : matchId,
        });

        // 立刻切出「投注中」，避免上传/改状态接口慢时面板一直卡着
        const orderHint = betRecord && betRecord.orderno ? ' 单号' + betRecord.orderno : '';
        const stakeText = betRecord && betRecord.betStake != null
            ? String(betRecord.betStake)
            : formatBetStakeSummary(option);
        const label = (option && option.label ? option.label : '') + ' ' + stakeText + ' 已提交' + orderHint;
        setBetResult('success', extraMsg ? label + '（' + extraMsg + '）' : label);
        renderPanel(true);

        if (recHash) {
            setBetStep('上传策略投注单…');
            renderPanel(true);
            try {
                await uploadStrategyBetRecord(betRecord);
            } catch (upErr) {
                console.warn('[hty-inplay] 策略投注单上传异常', upErr);
            }
            setBetStep('更新策略状态…');
            renderPanel(true);
            try {
                await updateStrategyRuleWithRetry(recHash, '2', {
                    orderno: betRecord.orderno,
                    orderNo: betRecord.orderno,
                    betOdds: betRecord.betOdds,
                    betStake: betRecord.betStake,
                    matchId: betRecord.matchId,
                });
                markExecutedStrategySynced(recHash, isRealBetOrderNo(betRecord.orderno) ? betRecord.orderno : '');
                console.log('[hty-inplay] 策略状态已更新为已执行', recHash);
            } catch (ruleErr) {
                const msg = ruleErr && ruleErr.message ? ruleErr.message : '策略状态更新失败';
                ruleExtra = ruleExtra ? ruleExtra + '；' + msg : msg;
                console.warn('[hty-inplay] 策略状态接口失败，已本地锁定防重，稍后重试同步', recHash, msg);
            }
        }
        clearBetInFlight();
        clearBetAttempt(recHash);
        await continueAfterBetSuccess(option, ruleExtra || undefined, !!fromAutoBet, betRecord);
    }

    function purgeLocalExecutedForStrategy(store, recHash) {
        if (!store || !recHash) return;
        delete store[recHash];
        const keys = Object.keys(store);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key.indexOf('tid:') !== 0) continue;
            const entry = store[key];
            if (!entry || !entry.recHash || entry.recHash === recHash) {
                delete store[key];
            }
        }
    }

    /**
     * 对齐本地已执行缓存与 API：
     * - API 已是已执行：补本地缓存
     * - 本地刚确认成功 / 待同步后台：覆盖策略为已执行，禁止因 API 滞后清缓存导致重复下单
     * - 仅清除明显过期且无 pendingSync 的本地残留
     */
    function reconcileLocalExecutedWithApi() {
        const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
        let dirty = false;

        for (let i = 0; i < strategyList.length; i++) {
            const item = strategyList[i];
            if (!item || !item.recHash) continue;
            const apiIgnore = String(item.ruleMeetIgnore != null ? item.ruleMeetIgnore : '0');

            if (apiIgnore === '2') {
                const cur = store[item.recHash];
                if (!cur) {
                    store[item.recHash] = { orderno: '', at: Date.now(), pendingSync: false };
                    dirty = true;
                } else if (cur.pendingSync) {
                    cur.pendingSync = false;
                    dirty = true;
                }
                continue;
            }

            if (store[item.recHash]) {
                const entry = store[item.recHash];
                const age = Date.now() - Number(entry.at || 0);
                // pendingSync 未成功上报前绝不清除，避免重复投注
                if (entry.pendingSync) {
                    item.ruleMeetIgnore = '2';
                    continue;
                }
                if (age < BET_RECOVERY_WINDOW_MS) {
                    item.ruleMeetIgnore = '2';
                    continue;
                }
                purgeLocalExecutedForStrategy(store, item.recHash);
                dirty = true;
            }
        }

        if (dirty) saveExecutedStrategyStore(store);
        return dirty;
    }

    function updateStrategyRule(recHash, ruleMeetIgnore, extra) {
        const payload = {
            recHash: recHash,
            ruleMeetIgnore: String(ruleMeetIgnore != null ? ruleMeetIgnore : '2'),
            quantFlag: '2',
        };
        if (extra) {
            // 假单号 ui-* 不传给后台，避免接口拒收导致状态更新失败、反复下单
            if (isRealBetOrderNo(extra.orderno)) payload.orderno = String(extra.orderno);
            if (isRealBetOrderNo(extra.orderNo)) payload.orderNo = String(extra.orderNo);
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

    async function updateStrategyRuleWithRetry(recHash, ruleMeetIgnore, extra) {
        let lastErr = null;
        for (let i = 0; i < STRATEGY_RULE_UPDATE_RETRIES; i++) {
            try {
                return await updateStrategyRule(recHash, ruleMeetIgnore, extra);
            } catch (err) {
                lastErr = err;
                console.warn('[hty-inplay] 策略状态更新重试', i + 1, err && err.message ? err.message : err);
                if (i + 1 < STRATEGY_RULE_UPDATE_RETRIES) {
                    await humanDelay(800, 1400);
                }
            }
        }
        throw lastErr || new Error('策略状态更新失败');
    }

    function abortedSyncedStorageKey(id) {
        return ABORTED_SYNCED_KEY + '_' + (id || matchId || '');
    }

    function loadAbortedSyncedStore(id) {
        try {
            const raw = sessionStorage.getItem(abortedSyncedStorageKey(id));
            const store = raw ? JSON.parse(raw) : {};
            return store && typeof store === 'object' ? store : {};
        } catch (e) {
            return {};
        }
    }

    function saveAbortedSyncedStore(store, id) {
        try {
            sessionStorage.setItem(abortedSyncedStorageKey(id), JSON.stringify(store || {}));
        } catch (e) { /* ignore */ }
    }

    function isAbortedSyncDone(recHash) {
        if (!recHash) return false;
        return !!loadAbortedSyncedStore()[recHash];
    }

    function markAbortedSyncDone(recHash) {
        if (!recHash) return;
        const store = loadAbortedSyncedStore();
        store[recHash] = { at: Date.now() };
        saveAbortedSyncedStore(store);
    }

    async function syncPendingExecutedStrategyStatuses() {
        const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
        let dirty = false;
        for (let i = 0; i < strategyList.length; i++) {
            const item = strategyList[i];
            if (!item || !item.recHash) continue;
            const entry = store[item.recHash];
            // reconcile 可能已把本地 ruleMeetIgnore 盖成 2；只要 pendingSync 仍在就必须补传后台
            if (!entry || !entry.pendingSync) continue;
            try {
                await updateStrategyRuleWithRetry(item.recHash, '2', {
                    orderno: entry.orderno,
                    orderNo: entry.orderno,
                    betOdds: entry.betOdds,
                    betStake: entry.betStake,
                    matchId: entry.matchId || item.matchId || matchId,
                });
                item.ruleMeetIgnore = '2';
                entry.pendingSync = false;
                dirty = true;
                console.log('[hty-inplay] 待同步策略状态已补传为已执行', item.recHash);
            } catch (err) {
                item.ruleMeetIgnore = '2';
                console.warn('[hty-inplay] 待同步策略状态补传失败', item.recHash,
                    err && err.message ? err.message : err);
            }
        }
        if (dirty) saveExecutedStrategyStore(store);
    }

    async function syncAbortedStrategyStatuses() {
        const toSync = strategyList.filter(function (item) {
            return needsAbortedStatusPut(item) && !isAbortedSyncDone(item.recHash);
        });
        if (!toSync.length) return;
        for (let i = 0; i < toSync.length; i++) {
            const item = toSync[i];
            try {
                await updateStrategyRuleWithRetry(item.recHash, '1', {
                    matchId: item.matchId || matchId,
                });
                item.ruleMeetIgnore = '1';
                markAbortedSyncDone(item.recHash);
                console.log('[hty-inplay] 策略状态已更新为已中止', item.recHash);
            } catch (err) {
                console.warn('[hty-inplay] 策略中止状态同步失败', item.recHash,
                    err && err.message ? err.message : err);
            }
        }
        lastStrategyListKey = '';
    }

    function markStrategyExecuted(recHash, orderno, option) {
        rememberExecutedStrategy(recHash, orderno, option);
        for (let i = 0; i < strategyList.length; i++) {
            if (strategyList[i].recHash === recHash) {
                strategyList[i].ruleMeetIgnore = '2';
                break;
            }
        }
        if (targetOption && targetOption.strategy && targetOption.strategy.recHash === recHash) {
            targetOption = null;
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
                item.ruleMeet != null ? String(item.ruleMeet) : '',
                item.ruleMeetInvalid != null ? String(item.ruleMeetInvalid) : '',
                item.invalidFlag != null ? String(item.invalidFlag) : '',
                item.kickoffTime || '',
            ].join(':');
        }).join(';');
        return strategyStatus + '|' + strategyTrigger + '|' + strategyList.length + '|' + rows;
    }

    async function loadStrategies(silent, skipMatchesLoad) {
        const isSilent = !!silent;
        if (!skipMatchesLoad) void loadActiveMatches(isSilent);
        if (!isSilent && !strategyList.length) {
            strategyStatus = 'loading';
            strategyError = '';
            renderPanel(true);
        }

        let reconciled = false;
        try {
            const payload = await fetchAlertStrategies(matchId);
            strategyList = Array.isArray(payload.data) ? payload.data : [];
            strategyTrigger = payload.trigger != null ? String(payload.trigger) : '';
            reconciled = reconcileLocalExecutedWithApi();
            await syncPendingExecutedStrategyStatuses();
            await syncAbortedStrategyStatuses();
            strategyStatus = 'ok';
            strategyError = '';
            const curMeet = countPendingRuleMeet(strategyList);
            if (curMeet > 0) {
                matchRuleMeetCache[String(matchId)] = { meetCount: curMeet, at: Date.now() };
            } else {
                delete matchRuleMeetCache[String(matchId)];
            }
            syncCurrentMatchPendingWorkCache();
            lastMatchesListKey = '';
            if (reconciled) {
                lastStrategyListKey = '';
                lastStrategyHitKey = '';
            }
        } catch (err) {
            if (!isSilent || !strategyList.length) {
                strategyList = [];
                strategyTrigger = '';
            }
            strategyStatus = 'err';
            strategyError = err && err.message ? err.message : '加载失败';
        }

        const strategyChanged = strategyRenderKey() !== lastStrategyListKey;
        if (strategyChanged || reconciled) {
            renderPanel(true);
        } else if (!isSilent) {
            renderPanel();
        }
        if (panelReady && strategyList.length) {
            syncOddsObserverState();
        }

        // 本场已无「已达标+未执行」：离开去其它达标场（待确认不留场）
        if (strategyStatus === 'ok' && matchId &&
            countPendingRuleMeet(strategyList) === 0 &&
            !placing && !isUserManualMatchLockActive()) {
            if (hasNavigableInPlayMatches()) {
                void maybeAutoNavigateToInplay();
            } else if (!isCurrentMatchEnded()) {
                setBetStep('本场已无已达标未执行策略，暂无其它达标比赛');
            }
        }

        try {
            await refreshTargetOption(true);
            renderPanel(true, false);
            maybeTriggerAutoBet(false);
        } catch (err) {
            lastScanError = err && err.message ? err.message : '扫描失败';
            betStep = '扫描异常';
            renderPanel(true);
        }
    }

    function scheduleStrategyPoll() {
        scheduleHeartbeat();
    }

    function statusPanelKey(loggedIn) {
        return [
            betResult,
            betStep,
            placing ? '1' : '0',
            loggedIn ? '1' : '0',
            targetOption ? targetOption.testid : 'none',
            targetOption ? targetOption.odds : '',
            isCartOpen() ? '1' : '0',
            lastScanButtonCount,
            lastScanViewMode,
            lastScanError,
            stakeMode,
        ].join('|');
    }

    function updatePanelStatus(force) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const loggedIn = isLoggedIn();
        const key = statusPanelKey(loggedIn);
        if (!force && key === lastStatusPanelKey) return;
        lastStatusPanelKey = key;

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
        const stakeSelect = panel.querySelector('.tm-hty-stake-select');
        const dedupToggle = panel.querySelector('.tm-hty-dedup-toggle');

        if (matchEl) {
            if (isStrandedSportEventsPage()) {
                matchEl.textContent = '赛事总览 · 点击下方策略赛事跳转';
            } else if (isInplayListPage()) {
                matchEl.textContent = '滚球列表 · 点击策略赛事跳转（' + stakeModeLabel(stakeMode) + '）';
            } else {
                matchEl.textContent = '赛事 ' + matchId + '（滚球）· 策略自动下注（' + stakeModeLabel(stakeMode) + '）';
            }
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
            loginEl.title = loggedIn ? '' : '点击立即用 0514 登录';
        }
        if (openCartBtn) {
            openCartBtn.textContent = isCartOpen() ? '投注单已开' : '打开投注单';
            openCartBtn.disabled = placing;
        }
        if (testBetBtn) {
            testBetBtn.disabled = placing;
            testBetBtn.textContent = stakeMode === 'strategy' ? '测试下注' : ('测试 ' + stakeModeLabel(stakeMode));
        }
        if (stakeSelect && stakeSelect.value !== stakeMode) {
            stakeSelect.value = stakeMode;
        }
        const stakeRow = panel.querySelector('.tm-hty-stake-row');
        if (stakeRow) {
            stakeRow.classList.toggle('tm-hty-stake-alert', stakeMode !== 'strategy');
            stakeRow.title = stakeMode !== 'strategy'
                ? '当前为固定金额，非策略实际金额'
                : '';
        }
        if (dedupToggle) {
            dedupToggle.checked = isBetDedupEnabled();
        }
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
            } else if (state.dedupBlocked) {
                markClass += ' plate';
                markText = '◎';
                const waitingConfirm = isScriptDedupInflight(
                    { testid: state.testid, strategy: state.strategy },
                    state.strategy && state.strategy.recHash
                );
                markTitle = state.hit
                    ? (waitingConfirm
                        ? '未执行 · 已达阈值，防重等待订单确认（查无单约 60s 后可重试）'
                        : '未执行 · 已达阈值，脚本防重拦截（同按钮其它档位已下或进行中）')
                    : '未执行 · 脚本防重：本策略已下单，跳过重复';
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

        const panelKey = [
            panelReady ? '1' : '0',
            panelCollapsed ? '1' : '0',
            matchId,
            strategyStatus,
            strategyHitRenderKey(),
            strategyList.length,
            strategyError,
        ].join('|');

        if (!force && panelKey === lastPanelKey) {
            updatePanelStatus();
            return;
        }
        lastPanelKey = panelKey;

        updatePanelStatus(true);
        renderStrategies(panel);
    }

    function shouldAutoBet() {
        if (strategyStatus !== 'ok' || !strategyList.length) return false;
        if (placing || autoBetInFlight) return false;
        if (betResult === 'pending' && betStep &&
            (betStep.indexOf('请勿手动重复下注') >= 0 ||
                betStep.indexOf('暂停重复下单') >= 0 ||
                betStep.indexOf('防重查单中') >= 0)) {
            if (getPendingBetDedupMeta()) return false;
            clearPausedDuplicateBetStep();
        }
        syncTargetOptionFromStates();
        if (!targetOption) return false;
        if (!targetOption.strategy || !passesStrategyStatusGate(targetOption.strategy)) return false;
        const recHash = targetOption.strategy.recHash;
        if (isScriptDedupBlocked(targetOption, recHash)) return false;
        if (recHash && isBetAttemptBlocked(recHash)) return false;
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

    /** 页面上下文 XHR/fetch 禁止设置 Referer/Origin，需剥离 */
    function buildPageContextRequestHeaders() {
        const out = Object.assign({}, buildPlatformRequestHeaders());
        delete out.Referer;
        delete out.Origin;
        delete out.referer;
        delete out.origin;
        return out;
    }

    /**
     * HTY 平台 API 域名会动态变化，靠结构特征识别，不写死具体 host。
     * API: host 含 -api-ddos / -api-（如 war-tiger-api-ddos.gcqurb.com）
     * 非 API: i18n- 为语言包服务，orders 等接口会 404
     * CDN: host 含 -fluid / fe-source / static / cdn 等（如 *-tiger-fluid.*）
     */
    function apiHostName(originOrUrl) {
        let raw = String(originOrUrl || '').trim();
        if (!raw) return '';
        try {
            if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.toLowerCase();
            if (raw.indexOf('/') >= 0) return new URL(raw).hostname.toLowerCase();
        } catch (e) { /* ignore */ }
        return raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
    }

    function classifyApiHost(originOrUrl) {
        const host = apiHostName(originOrUrl);
        if (!host) return { kind: 'unknown', score: 0, host: '' };
        if (/-fluid(?:[.-]|$)/.test(host)) return { kind: 'cdn', score: 0, host: host };
        if (/(?:^|[.-])fe-source(?:[.-]|$)/.test(host)) return { kind: 'cdn', score: 0, host: host };
        if (/(?:^|[.-])fe-static(?:[.-]|$)/.test(host)) return { kind: 'cdn', score: 0, host: host };
        if (/(?:^|[.-])(?:static|cdn|assets)(?:[.-]|$)/.test(host)) return { kind: 'cdn', score: 0, host: host };
        if (/shbxs\d+\./.test(host)) return { kind: 'cdn', score: 0, host: host };
        if (/^i18n[-.]/.test(host)) return { kind: 'cdn', score: 0, host: host };
        if (/-api-ddos(?:[.-]|$)/.test(host)) return { kind: 'api', score: 95, host: host };
        if (/-api[-.]/.test(host)) return { kind: 'api', score: 88, host: host };
        return { kind: 'unknown', score: 0, host: host };
    }

    function isLikelyPlatformApiOrigin(origin) {
        return classifyApiHost(origin).kind === 'api';
    }

    function isExcludedApiOrigin(origin) {
        const host = apiHostName(origin);
        if (!host) return true;
        return classifyApiHost(origin).kind === 'cdn';
    }

    function scoreApiOrigin(origin) {
        const c = classifyApiHost(origin);
        return c.kind === 'api' ? c.score : 0;
    }

    function isProvenPlatformApiUrl(url) {
        const u = String(url || '');
        return /\/product\/game\/bet/i.test(u) ||
            /\/thirdparty-report\/user\/orders\/sport/i.test(u) ||
            /\/platform\/payment\/wallets/i.test(u) ||
            /\/product\/cashout\//i.test(u);
    }

    function extractPlatformApiBase(url) {
        const base = extractSiteApiBase(url);
        if (!base || isExcludedApiOrigin(base)) return '';
        if (isProvenPlatformApiUrl(url) && isLikelyPlatformApiOrigin(base)) return base;
        if (isLikelyPlatformApiOrigin(base)) return base;
        return '';
    }

    function purgeInvalidOrdersApiBase() {
        try {
            const saved = sessionStorage.getItem(HTY_ORDERS_API_BASE_KEY);
            if (saved && !isLikelyPlatformApiOrigin(saved)) {
                sessionStorage.removeItem(HTY_ORDERS_API_BASE_KEY);
            }
        } catch (e) { /* ignore */ }
        if (htyApiState.apiBase && !isLikelyPlatformApiOrigin(htyApiState.apiBase)) {
            htyApiState.apiBase = '';
        }
    }

    function rememberKnownOrdersApiBase(base) {
        const b = String(base || '').replace(/\/$/, '');
        if (!b || !isLikelyPlatformApiOrigin(b)) return;
        htyApiState.apiBase = b;
        htyApiState.lastCaptureAt = Date.now();
        try {
            sessionStorage.setItem(HTY_ORDERS_API_BASE_KEY, b);
        } catch (e) { /* ignore */ }
        persistApiState();
    }

    function restoreKnownOrdersApiBase() {
        purgeInvalidOrdersApiBase();
        try {
            const saved = sessionStorage.getItem(HTY_ORDERS_API_BASE_KEY);
            if (saved && isLikelyPlatformApiOrigin(saved)) {
                htyApiState.apiBase = saved;
            }
        } catch (e) { /* ignore */ }
    }

    function discoverApiBaseCandidates() {
        const scored = [];
        const seen = {};
        function add(base, score) {
            const b = String(base || '').replace(/\/$/, '');
            if (!b || seen[b] || isExcludedApiOrigin(b)) return;
            seen[b] = 1;
            scored.push({ base: b, score: score });
        }

        try {
            const saved = sessionStorage.getItem(HTY_ORDERS_API_BASE_KEY);
            if (saved && isLikelyPlatformApiOrigin(saved)) add(saved, 100);
        } catch (e) { /* ignore */ }

        if (htyApiState.apiBase && isLikelyPlatformApiOrigin(htyApiState.apiBase)) {
            add(htyApiState.apiBase, 90);
        }

        try {
            performance.getEntriesByType('resource').forEach(function (entry) {
                const u = entry.name || '';
                try {
                    const origin = new URL(u).origin;
                    if (origin === location.origin) return;
                    const hostScore = scoreApiOrigin(origin);
                    if (isProvenPlatformApiUrl(u) && hostScore > 0) {
                        add(origin, 80 + hostScore);
                    } else if (hostScore > 0) {
                        add(origin, hostScore);
                    }
                } catch (e) { /* ignore */ }
            });
        } catch (e) { /* ignore */ }

        scored.sort(function (a, b) { return b.score - a.score; });
        const out = scored.map(function (x) { return x.base; });
        if (out.length) {
            console.log('[hty-inplay] API 候选(筛选后)', out.length, out);
        }
        return out.slice(0, ORDERS_DISCOVER_MAX_BASES);
    }

    function formatReportDateTime(d) {
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function buildOrdersReportPathQuery(opts) {
        const options = opts || {};
        const end = new Date();
        const start = new Date(end);
        const daysBack = options.daysBack != null ? options.daysBack : 6;
        start.setDate(start.getDate() - daysBack);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 0);
        let qs = 'betStatus=2' +
            '&startDate=' + encodeURIComponent(formatReportDateTime(start)) +
            '&endDate=' + encodeURIComponent(formatReportDateTime(end)) +
            '&dataType=0&timeConditionType=BET';
        if (options.iids != null && options.iids !== '') {
            qs += '&iids=' + encodeURIComponent(String(options.iids));
        }
        return '/platform/thirdparty-report/user/orders/sport?' + qs;
    }

    function buildOrdersReportUrl(apiBase, opts) {
        return apiBase.replace(/\/$/, '') + buildOrdersReportPathQuery(opts);
    }

    function countOrdersInReportText(jsonText) {
        if (!jsonText) return 0;
        try {
            const json = JSON.parse(jsonText);
            const data = json && json.data;
            if (!data || typeof data !== 'object') return 0;
            let count = 0;
            ['unSettlement', 'settlement', 'cancel'].forEach(function (key) {
                const block = data[key];
                if (block && Array.isArray(block.data)) count += block.data.length;
            });
            return count;
        } catch (e) {
            return 0;
        }
    }

    function parseOrdersReportMatchId(url) {
        const m = String(url || '').match(/[?&]iids=([^&]+)/i);
        return m ? decodeURIComponent(m[1]) : '';
    }

    function cacheOrdersReport(url, text) {
        if (!text || !/orders\/sport/i.test(url || '')) return;
        if (!isValidOrdersReportText(text)) return;
        const entry = {
            text: text,
            url: url,
            matchId: parseOrdersReportMatchId(url),
            at: Date.now(),
        };
        lastCapturedOrdersReport = entry;
        try {
            sessionStorage.setItem(HTY_ORDERS_CACHE_KEY, JSON.stringify(entry));
        } catch (e) { /* ignore */ }
        try {
            const base = extractPlatformApiBase(url);
            if (base) rememberKnownOrdersApiBase(base);
        } catch (e) { /* ignore */ }
    }

    function reportContainsMatchId(text, mid) {
        if (!text || !mid) return false;
        const id = String(mid);
        return text.indexOf('"iid":' + id) >= 0 ||
            text.indexOf('"iid":"' + id + '"') >= 0 ||
            text.indexOf('"matchId":"' + id + '"') >= 0 ||
            text.indexOf('"matchId":' + id) >= 0;
    }

    function getCachedOrdersReportText(targetMatchId) {
        let cap = lastCapturedOrdersReport;
        if (!cap || !cap.text) {
            try {
                cap = JSON.parse(sessionStorage.getItem(HTY_ORDERS_CACHE_KEY) || 'null');
            } catch (e) {
                cap = null;
            }
        }
        if (!cap || !cap.text) return null;
        if (Date.now() - Number(cap.at || 0) > ORDERS_REPORT_CACHE_MS) return null;
        if (targetMatchId && cap.matchId && String(cap.matchId) !== String(targetMatchId)) {
            if (reportContainsMatchId(cap.text, targetMatchId)) return cap.text;
            return null;
        }
        if (targetMatchId && !cap.matchId && !reportContainsMatchId(cap.text, targetMatchId)) {
            return null;
        }
        return cap.text;
    }

    function isValidOrdersReportText(text) {
        if (!text || text.length < 20) return false;
        try {
            const json = JSON.parse(text);
            if (!json || typeof json !== 'object') return false;
            const code = json.code;
            if (code != null && String(code) !== '0' && String(code) !== '200') return false;
            return !!(json.data && typeof json.data === 'object');
        } catch (e) {
            return false;
        }
    }

    async function waitForOrdersHookCache(targetMatchId, maxMs) {
        const deadline = Date.now() + (maxMs || ORDERS_HOOK_PASSIVE_WAIT_MS);
        while (Date.now() < deadline) {
            const cached = getCachedOrdersReportText(targetMatchId);
            if (cached) return cached;
            await humanDelay(350, 550);
        }
        return getCachedOrdersReportText(targetMatchId);
    }

    async function proactivePullOrdersReport(mid, tag) {
        const targetId = String(mid || matchId || '');
        if (!targetId) return null;

        restoreApiState();
        restoreKnownOrdersApiBase();
        mergeProbeCredentials(await probeCredentialsFromPage());
        if (!hasPlatformCredentials() && !htyApiState.apiBase) {
            await ensureHtyApiCredentials(4000, null);
        }

        let cached = getCachedOrdersReportText(targetId);
        if (cached && countOrdersInReportText(cached) > 0) return cached;

        const candidates = discoverApiBaseCandidates();
        if (candidates.length) {
            try {
                console.log('[hty-inplay] 主动页面拉单', tag || '', targetId);
                const batch = await pageContextFetchMatchOrdersReport(
                    targetId, MATCH_BET_HISTORY_DAYS, candidates.slice(0, ORDERS_DISCOVER_MAX_BASES)
                );
                if (batch && batch.text && isValidOrdersReportText(batch.text)) {
                    cacheOrdersReport(batch.url, batch.text);
                    if (batch.apiBase && !htyApiState.apiBase) {
                        htyApiState.apiBase = batch.apiBase;
                        persistApiState();
                    }
                    return batch.text;
                }
            } catch (e) {
                console.warn('[hty-inplay] 主动页面拉单失败', tag || '', e);
            }
        }

        if (htyApiState.apiBase || htyApiState.headers.authorization) {
            const bases = htyApiState.apiBase
                ? [htyApiState.apiBase.replace(/\/$/, '')]
                : candidates.slice(0, ORDERS_DISCOVER_MAX_BASES);
            for (let i = 0; i < bases.length; i++) {
                const url = buildOrdersReportUrl(bases[i], {
                    iids: targetId,
                    daysBack: MATCH_BET_HISTORY_DAYS,
                });
                try {
                    console.log('[hty-inplay] 主动 GM 拉单', tag || '', url);
                    const text = await gmPlatformGetText(url, ORDERS_CONFIRM_GM_MS);
                    if (isValidOrdersReportText(text)) {
                        cacheOrdersReport(url, text);
                        return text;
                    }
                } catch (e) {
                    console.warn('[hty-inplay] 主动 GM 拉单失败', tag || '', e);
                }
            }
        }

        return getCachedOrdersReportText(targetId);
    }

    /** 与下单后订单确认相同：页面上下文 fetch orders/sport（不点击余额等 UI） */
    function pageContextFetchMatchOrdersReport(targetMatchId, daysBack, candidateBases) {
        return new Promise(function (resolve, reject) {
            const reqId = 'orders_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const pathQs = buildOrdersReportPathQuery({
                iids: targetMatchId,
                daysBack: daysBack != null ? daysBack : MATCH_BET_HISTORY_DAYS,
            });
            const knownBase = htyApiState.apiBase || '';
            const attemptMs = ORDERS_FETCH_ATTEMPT_MS;
            const maxBases = ORDERS_DISCOVER_MAX_BASES;
            const bases = (candidateBases && candidateBases.length)
                ? candidateBases.slice(0, maxBases)
                : discoverApiBaseCandidates();
            const pageHeaders = buildPageContextRequestHeaders();
            const waitMs = Math.min(REPORT_UPLOAD_TIMEOUT, Math.max(8000, bases.length * attemptMs + 3000));
            let settled = false;
            function finish(err, payload) {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', onMsg);
                if (err) reject(err);
                else resolve(payload);
            }
            function onMsg(e) {
                if (e.source !== window || !e.data || e.data.source !== PAGE_USR_SRC) return;
                if (e.data.type !== 'orders-fetch' || e.data.id !== reqId) return;
                if (e.data.ok) {
                    finish(null, {
                        text: e.data.text || '',
                        url: e.data.url || '',
                        apiBase: e.data.apiBase || '',
                    });
                } else {
                    finish(new Error(e.data.error || '订单接口请求失败'));
                }
            }
            if (!bases.length) {
                finish(new Error('尚无 API 地址，请在本页完成一次下注后再上传'));
                return;
            }
            window.addEventListener('message', onMsg);
            const script = document.createElement('script');
            script.textContent = '(function(){' +
                'try{' +
                'var id=' + JSON.stringify(reqId) + ';' +
                'var USR_SRC=' + JSON.stringify(PAGE_USR_SRC) + ';' +
                'var pathQs=' + JSON.stringify(pathQs) + ';' +
                'var attemptMs=' + attemptMs + ';' +
                'var candidateBases=' + JSON.stringify(bases) + ';' +
                'var headers=Object.assign({},' + JSON.stringify(pageHeaders) + ');' +
                'function post(ok,p){try{window.postMessage(Object.assign({source:USR_SRC,type:"orders-fetch",id:id,ok:ok},p||{}),"*");}catch(e){}}' +
                'function pickAuth(v){if(!v)return"";v=String(v).trim();if(!v)return"";return /^Bearer\\s/i.test(v)?v:"Bearer "+v;}' +
                'function setHdr(k,v){if(v!=null&&v!=="")headers[String(k).toLowerCase()]=v;}' +
                'function scanAuth(){if(headers.authorization)return;try{[localStorage,sessionStorage].forEach(function(s){for(var i=0;i<s.length;i++){var k=s.key(i)||"";var v=s.getItem(k)||"";if(!v)continue;if(/authorization|access[_-]?token|^token$|auth|jwt|bearer/i.test(k)){var a=pickAuth(v);if(a){setHdr("authorization",a);return;}}if(/^Bearer\\s+/i.test(v)){setHdr("authorization",v);return;}if(/^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.test(v)){setHdr("authorization","Bearer "+v);return;}try{var o=JSON.parse(v);if(o&&typeof o==="object"){var t=o.token||o.accessToken||o.access_token||o.authorization;var a=pickAuth(t);if(a){setHdr("authorization",a);return;}}}catch(e){}}});}catch(e){}}' +
                'function valid(text){try{var j=JSON.parse(text||"null");if(!j||typeof j!=="object")return false;var c=j.code;if(c!=null&&String(c)!=="0"&&String(c)!=="200")return false;return !!(j.data&&typeof j.data==="object");}catch(e){return false;}}' +
                'function tryOne(url,base,cb){var xhr=new XMLHttpRequest();xhr.open("GET",url,true);xhr.timeout=attemptMs;xhr.withCredentials=false;Object.keys(headers).forEach(function(k){if(k==="referer"||k==="origin")return;try{xhr.setRequestHeader(k,headers[k]);}catch(e){}});xhr.onload=function(){cb(null,xhr.status,xhr.responseText||"",base,url);};xhr.onerror=function(){cb(new Error("xhr error"));};xhr.ontimeout=function(){cb(new Error("xhr timeout"));};xhr.send();}' +
                'scanAuth();if(!headers.accept)headers.accept="application/json, text/plain, */*";' +
                'var idx=0;' +
                'function next(){if(idx>=candidateBases.length){post(false,{error:"订单接口不可用（投注可能已成功，仅上传失败）"});return;}var base=candidateBases[idx++];var url=base+pathQs;tryOne(url,base,function(err,status,text,usedBase,usedUrl){if(!err&&status>=200&&status<300&&valid(text)){post(true,{text:text,url:usedUrl,apiBase:usedBase});}else{next();}});}' +
                'next();' +
                '}catch(e){post(false,{error:e&&e.message?e.message:"orders script error"});}' +
                '})();';
            (document.documentElement || document.head || document.body).appendChild(script);
            script.remove();
            setTimeout(function () {
                finish(new Error('订单接口超时（投注可能已成功，仅上传失败）'));
            }, waitMs);
        });
    }

    /** 查询订单确认 / 上传本场记录 共用（投注确认默认 GM+hook；上传可走批量页面拉单） */
    async function fetchMatchOrdersReportText(targetMatchId, fetchOpts) {
        const opts = fetchOpts || {};
        const passive = opts.passive !== false;
        const quick = opts.quick === true;
        const forUpload = opts.forUpload === true;
        const softFail = opts.softFail === true;
        const gmOnly = !forUpload && opts.gmOnly !== false;
        const allowPageFetch = forUpload || opts.allowPageFetch === true;
        const confirmMode = gmOnly && !forUpload;
        const gmTimeout = quick ? ORDERS_QUICK_FETCH_MS
            : (gmOnly ? ORDERS_CONFIRM_GM_MS : REPORT_UPLOAD_TIMEOUT);
        const hookWaitMs = opts.hookWaitMs != null ? opts.hookWaitMs
            : (forUpload ? ORDERS_UPLOAD_HOOK_WAIT_MS
                : (quick ? ORDERS_HOOK_QUICK_WAIT_MS
                    : (passive ? ORDERS_HOOK_PASSIVE_WAIT_MS : 5000)));
        const mid = String(targetMatchId || matchId || '');
        if (!mid) throw new Error('无赛事ID');

        let cached = getCachedOrdersReportText(mid);
        if (cached) {
            console.log('[hty-inplay] 使用已缓存的订单接口响应', mid);
            return cached;
        }

        restoreApiState();
        restoreKnownOrdersApiBase();
        if (htyApiState.apiBase && isExcludedApiOrigin(htyApiState.apiBase)) {
            htyApiState.apiBase = '';
        }
        mergeProbeCredentials(await probeCredentialsFromPage());
        if (!quick && !hasPlatformCredentials() && allowPageFetch) {
            await ensureHtyApiCredentials(4000, null);
        }

        if (forUpload) {
            await proactivePullOrdersReport(mid, 'upload-init');
            cached = getCachedOrdersReportText(mid);
            if (cached) {
                console.log('[hty-inplay] 上传：主动拉单命中', mid);
                return cached;
            }
            console.log('[hty-inplay] 上传：等待 hook 捕获 orders/sport…', hookWaitMs, 'ms');
            cached = await waitForOrdersHookCache(mid, hookWaitMs);
            if (cached) {
                console.log('[hty-inplay] 上传：hook 缓存命中', mid);
                return cached;
            }
        }

        async function tryFetchOrdersUrl(ordersUrl, tag) {
            if (hasPlatformCredentials() || htyApiState.headers.authorization) {
                try {
                    console.log('[hty-inplay] GM GET orders/sport', tag, ordersUrl);
                    const text = await gmPlatformGetText(ordersUrl, gmTimeout);
                    if (isValidOrdersReportText(text)) {
                        cacheOrdersReport(ordersUrl, text);
                        return text;
                    }
                } catch (e) {
                    if (!confirmMode) {
                        console.warn('[hty-inplay] GM 拉单失败', tag, e);
                    }
                }
            }
            if (allowPageFetch && !gmOnly) {
                try {
                    console.log('[hty-inplay] 页面 GET orders/sport', tag, ordersUrl);
                    const text = await pageContextFetchText(ordersUrl, buildPageContextRequestHeaders());
                    if (isValidOrdersReportText(text)) {
                        cacheOrdersReport(ordersUrl, text);
                        return text;
                    }
                } catch (e) {
                    console.warn('[hty-inplay] 页面拉单失败', tag, e);
                }
            }
            return null;
        }

        if (htyApiState.apiBase) {
            const directUrl = buildOrdersReportUrl(htyApiState.apiBase, {
                iids: mid,
                daysBack: MATCH_BET_HISTORY_DAYS,
            });
            const text = await tryFetchOrdersUrl(directUrl, quick ? 'quick-known' : 'known-base');
            if (text) return text;
        }

        if (quick && !htyApiState.apiBase) {
            const quickCandidates = discoverApiBaseCandidates();
            for (let qi = 0; qi < quickCandidates.length && qi < 2; qi++) {
                const qBase = quickCandidates[qi];
                const qUrl = buildOrdersReportUrl(qBase, {
                    iids: mid,
                    daysBack: MATCH_BET_HISTORY_DAYS,
                });
                const qText = await tryFetchOrdersUrl(qUrl, 'quick-candidate-' + qi);
                if (qText) {
                    rememberKnownOrdersApiBase(qBase);
                    return qText;
                }
            }
        } else if (!gmOnly && !quick && !forUpload) {
            const apiCandidates = discoverApiBaseCandidates();
            console.log('[hty-inplay] API 候选', apiCandidates.length, apiCandidates);
            if (!apiCandidates.length) {
                if (confirmMode || softFail) return null;
                throw new Error('尚无 API 地址，请在本页完成一次下注后再上传');
            }
        }

        if (!forUpload) {
            cached = await waitForOrdersHookCache(mid, hookWaitMs);
            if (cached) {
                console.log('[hty-inplay] hook 缓存命中订单响应', mid);
                return cached;
            }
        }

        if (quick) {
            if (softFail || confirmMode) return null;
            throw new Error('快速查单无结果');
        }

        if (htyApiState.apiBase) {
            const retryUrl = buildOrdersReportUrl(htyApiState.apiBase, {
                iids: mid,
                daysBack: MATCH_BET_HISTORY_DAYS,
            });
            const retryText = await tryFetchOrdersUrl(retryUrl, 'after-hook-wait');
            if (retryText) return retryText;
        }

        const apiCandidates = discoverApiBaseCandidates();
        const maxCandidates = gmOnly ? 2 : ORDERS_DISCOVER_MAX_BASES;
        console.log('[hty-inplay] API 候选', apiCandidates.length, apiCandidates.slice(0, maxCandidates));

        for (let i = 0; i < apiCandidates.length && i < maxCandidates; i++) {
            const base = apiCandidates[i];
            if (htyApiState.apiBase && base === htyApiState.apiBase.replace(/\/$/, '')) continue;
            const url = buildOrdersReportUrl(base, {
                iids: mid,
                daysBack: MATCH_BET_HISTORY_DAYS,
            });
            const candText = await tryFetchOrdersUrl(url, 'candidate-' + i);
            if (candText) {
                rememberKnownOrdersApiBase(base);
                return candText;
            }
        }

        if (allowPageFetch && apiCandidates.length) {
            try {
                console.log('[hty-inplay] 批量页面拉单 orders/sport…');
                const batch = await pageContextFetchMatchOrdersReport(
                    mid, MATCH_BET_HISTORY_DAYS, apiCandidates.slice(0, ORDERS_DISCOVER_MAX_BASES)
                );
                if (batch && batch.text && isValidOrdersReportText(batch.text)) {
                    cacheOrdersReport(batch.url, batch.text);
                    if (batch.apiBase && !htyApiState.apiBase) {
                        htyApiState.apiBase = batch.apiBase;
                        persistApiState();
                    }
                    return batch.text;
                }
            } catch (e) {
                console.warn('[hty-inplay] 批量页面拉单失败', e);
            }
        }

        if (forUpload) {
            cached = await waitForOrdersHookCache(mid, 5000);
            if (cached) {
                console.log('[hty-inplay] 上传：延迟 hook 缓存命中', mid);
                return cached;
            }
        }

        if (softFail || confirmMode) return null;
        throw new Error('订单接口不可用（投注可能已成功，请刷新或稍后重试）');
    }

    function normalizeBetRecordsJsonString(raw) {
        if (raw == null) return '';
        if (typeof raw === 'object') return JSON.stringify(raw);
        return String(raw).trim();
    }

    function uploadBetRecordsOnly(betJson) {
        const normalized = normalizeBetRecordsJsonString(betJson);
        if (!normalized || normalized.length < 20) {
            return Promise.reject(new Error('投注记录为空'));
        }
        if (!isValidOrdersReportText(normalized)) {
            return Promise.reject(new Error('投注记录格式无效'));
        }
        return uploadReportData(REPORT_UPLOAD.bet, { bet_records_json: normalized });
    }

    async function fetchOrdersReportForUpload(mid, fetchOpts, afterBetSuccess) {
        const attempts = afterBetSuccess ? ORDERS_UPLOAD_AFTER_BET_ATTEMPTS : 2;
        let lastText = null;
        for (let i = 0; i < attempts; i++) {
            const attemptOpts = Object.assign({}, fetchOpts || {}, {
                forUpload: true,
                softFail: i < attempts - 1,
                hookWaitMs: afterBetSuccess
                    ? Math.min(ORDERS_UPLOAD_HOOK_WAIT_MS + i * 4000, 32000)
                    : (fetchOpts && fetchOpts.hookWaitMs != null
                        ? fetchOpts.hookWaitMs
                        : ORDERS_UPLOAD_HOOK_WAIT_MS),
            });
            if (afterBetSuccess && i > 0) {
                await proactivePullOrdersReport(mid, 'upload-retry-' + (i + 1));
            }
            try {
                lastText = await fetchMatchOrdersReportText(mid, attemptOpts);
            } catch (e) {
                lastText = null;
                if (i >= attempts - 1) throw e;
                console.warn('[hty-inplay] 上传拉单第' + (i + 1) + '次失败，重试…',
                    e && e.message ? e.message : e);
            }
            const count = countOrdersInReportText(lastText);
            if (count > 0) return { text: lastText, count: count };
            if (i < attempts - 1) {
                const gap = afterBetSuccess
                    ? ORDERS_UPLOAD_RETRY_GAP_MS + i * 800
                    : 2000;
                console.log('[hty-inplay] 上传：订单尚未入库，' + (i + 2) + '/' + attempts + ' 次重试…');
                await humanDelay(gap, gap + 1200);
            }
        }
        return { text: lastText, count: countOrdersInReportText(lastText) };
    }

    async function uploadMatchBetHistory(targetMatchId, extraBetPayload, uploadOpts) {
        const opts = uploadOpts || {};
        const mid = String(targetMatchId || matchId || '');
        if (!mid) throw new Error('无赛事ID');

        const fetchOpts = {
            passive: opts.passive !== false,
            forUpload: opts.forUpload === true,
            gmOnly: opts.gmOnly === true,
            allowPageFetch: opts.allowPageFetch !== false,
            hookWaitMs: opts.hookWaitMs,
        };
        const afterBetSuccess = opts.afterBetSuccess === true;
        let betJson = null;
        let orderCount = 0;
        try {
            const fetched = await fetchOrdersReportForUpload(mid, fetchOpts, afterBetSuccess);
            betJson = fetched.text;
            orderCount = fetched.count;
        } catch (fetchErr) {
            const stratJson = extraBetPayload && extraBetPayload.strategy_bet_json;
            if (opts.allowPartial !== false && stratJson) {
                console.warn('[hty-inplay] 拉单暂不可用，先上传 strategy 记录，稍后自动补传订单', fetchErr);
                await uploadReportData(REPORT_UPLOAD.strategy, { strategy_bet_json: stratJson });
                scheduleDelayedOrdersUploadRetry(mid, extraBetPayload);
                return { orderCount: 0, bytes: 0, matchId: mid, partial: true };
            }
            throw fetchErr;
        }
        console.log('[hty-inplay] 本场投注记录', orderCount, '条',
            betJson ? betJson.length : 0, '字符');

        const apiBase = htyApiState.apiBase || '';
        if (apiBase) {
            try {
                await uploadReportData(REPORT_UPLOAD.site, {
                    site_url: apiBase,
                    app_url: window.location.origin,
                });
            } catch (e) {
                console.warn('[hty-inplay] 上传站点URL失败', e);
            }
        }

        if (!betJson || orderCount === 0) {
            const stratJson = extraBetPayload && extraBetPayload.strategy_bet_json;
            if (opts.allowPartial !== false && stratJson) {
                console.warn('[hty-inplay] 订单列表为空，先上传 strategy 记录，稍后自动补传订单');
                await uploadReportData(REPORT_UPLOAD.strategy, { strategy_bet_json: stratJson });
                scheduleDelayedOrdersUploadRetry(mid, extraBetPayload);
                return { orderCount: 0, bytes: 0, matchId: mid, partial: true };
            }
            throw new Error('投注记录为空（订单尚未入库）');
        }

        await uploadBetRecordsOnly(betJson);

        if (opts.uploadWallet && apiBase && htyApiState.headers.authorization) {
            try {
                const walletUrl = apiBase.replace(/\/$/, '') + '/platform/payment/wallets/list';
                const walletJson = await platformGetText(walletUrl);
                if (walletJson) {
                    await uploadReportData(REPORT_UPLOAD.wallet, { wallet_records_json: walletJson });
                }
            } catch (e) {
                console.warn('[hty-inplay] 上传钱包余额失败', e);
            }
        }

        return { orderCount: orderCount, bytes: betJson.length, matchId: mid };
    }

    /** 防重验证后 / 下注成功后自动上传本场记录（共用 uploadMatchBetHistory，带节流） */
    function scheduleDelayedOrdersUploadRetry(targetMatchId, extraBetPayload) {
        if (delayedOrdersUploadTimer) {
            clearTimeout(delayedOrdersUploadTimer);
            delayedOrdersUploadTimer = null;
        }
        const mid = String(targetMatchId || matchId || '');
        if (!mid) return;
        delayedOrdersUploadTimer = setTimeout(function () {
            delayedOrdersUploadTimer = null;
            if (!matchId || String(matchId) !== mid) return;
            if (reportSyncing || matchHistoryUploading || placing) return;
            console.log('[hty-inplay] 延迟补传订单', mid);
            uploadMatchBetHistory(mid, extraBetPayload, {
                passive: true,
                forUpload: true,
                allowPageFetch: true,
                allowPartial: false,
                afterBetSuccess: true,
            }).then(function (result) {
                console.log('[hty-inplay] 延迟补传订单完成', result);
                if (result && result.orderCount > 0) {
                    setBetStep('投注记录已补传（' + result.orderCount + '条）');
                    renderPanel(true);
                }
            }).catch(function (e) {
                console.warn('[hty-inplay] 延迟补传订单仍失败', e);
            });
        }, ORDERS_UPLOAD_DELAYED_RETRY_MS);
    }

    async function triggerAutoUploadMatchHistory(reason, opts) {
        const options = opts || {};
        if (!matchId || reportSyncing || matchHistoryUploading) return null;
        const now = Date.now();
        if (!options.force && now - lastAutoUploadMatchAt < AUTO_UPLOAD_AFTER_DEDUP_GAP_MS) {
            console.log('[hty-inplay] 跳过重复上传（节流）', reason);
            return null;
        }
        if (!isLoggedIn()) return null;

        reportSyncing = true;
        try {
            console.log('[hty-inplay] 自动上传本场投注记录', reason, matchId);
            if (options.updateStep !== false) {
                setBetStep('同步投注记录…');
                renderPanel(true);
            }
            const extra = {};
            const stratRec = options.strategyBetRecord || lastStrategyBetRecord;
            if (stratRec && stratRec.orderno) {
                extra.strategy_bet_json = JSON.stringify(stratRec);
            }
            const result = await uploadMatchBetHistory(matchId, extra, {
                passive: true,
                uploadWallet: reason === 'bet-success',
                forUpload: true,
                allowPageFetch: true,
                allowPartial: true,
                afterBetSuccess: reason === 'bet-success',
            });
            lastAutoUploadMatchAt = Date.now();
            if (result && result.partial) {
                console.log('[hty-inplay] 自动上传（仅 strategy 记录）', reason, result);
            } else {
                console.log('[hty-inplay] 自动上传完成', reason, result);
            }
            if (options.updateStep !== false) {
                setBetStep('投注记录已同步（本场' + result.orderCount + '条）');
                renderPanel(true);
            }
            return result;
        } catch (e) {
            console.warn('[hty-inplay] 自动上传失败', reason, e);
            if (options.updateStep !== false) {
                setBetStep('投注记录同步失败：' + (e && e.message ? e.message : e));
                renderPanel(true);
            }
            return null;
        } finally {
            reportSyncing = false;
        }
    }

    function hasPlatformCredentials() {
        return !!(htyApiState.apiBase && htyApiState.headers.authorization);
    }

    function persistApiState() {
        if (htyApiState.apiBase && !isLikelyPlatformApiOrigin(htyApiState.apiBase)) {
            htyApiState.apiBase = '';
        }
        if (!htyApiState.apiBase && !htyApiState.headers.authorization) return;
        try {
            sessionStorage.setItem(HTY_API_CACHE_KEY, JSON.stringify({
                apiBase: htyApiState.apiBase || '',
                headers: Object.assign({}, htyApiState.headers),
                at: htyApiState.lastCaptureAt || Date.now(),
            }));
        } catch (e) { /* ignore */ }
    }

    function restoreApiState() {
        try {
            const raw = sessionStorage.getItem(HTY_API_CACHE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || Date.now() - Number(data.at || 0) > SESSION_HEADER_FRESH_MS) return;
            if (data.apiBase && isLikelyPlatformApiOrigin(data.apiBase)) {
                htyApiState.apiBase = data.apiBase;
            }
            mergePlatformHeaders(data.headers || {});
            htyApiState.lastCaptureAt = Number(data.at) || Date.now();
        } catch (e) { /* ignore */ }
        restoreKnownOrdersApiBase();
    }

    function mergeProbeCredentials(probed) {
        if (!probed) return;
        if (probed.apiBase) rememberKnownOrdersApiBase(probed.apiBase);
        if (probed.headers) mergePlatformHeaders(probed.headers);
        if (hasPlatformCredentials()) {
            htyApiState.lastCaptureAt = Date.now();
            persistApiState();
        }
    }

    function probeCredentialsFromPage() {
        return new Promise(function (resolve) {
            const probeId = 'cred_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            let settled = false;
            function finish(payload) {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', onMsg);
                resolve(payload || null);
            }
            function onMsg(e) {
                if (e.source !== window || !e.data || e.data.source !== PAGE_USR_SRC) return;
                if (e.data.type !== 'cred-probe' || e.data.id !== probeId) return;
                finish(e.data.payload || null);
            }
            window.addEventListener('message', onMsg);
            const script = document.createElement('script');
            script.textContent = '(function(){' +
                'var id=' + JSON.stringify(probeId) + ';' +
                'var USR_SRC=' + JSON.stringify(PAGE_USR_SRC) + ';' +
                'var out={apiBase:"",headers:{}};' +
                'function pickAuth(v){if(!v)return"";v=String(v).trim();if(!v)return"";return /^Bearer\\s/i.test(v)?v:"Bearer "+v;}' +
                'try{' +
                'function hostOf(u){try{return new URL(u).hostname.toLowerCase()}catch(e){return""}}' +
                'function isCdnHost(h){return/-fluid(?:[.-]|$)/.test(h)||/(?:^|[.-])fe-source(?:[.-]|$)/.test(h)||/(?:^|[.-])(?:static|cdn|assets)(?:[.-]|$)/.test(h)||/shbxs\\d+\\./.test(h)||/^i18n[-.]/.test(h)}' +
                'function isApiHost(h){if(!h||isCdnHost(h))return false;return/-api-ddos(?:[.-]|$)/.test(h)||/-api[-.]/.test(h)}' +
                'function isProvenApiUrl(u){return/\\/product\\/game\\/bet|\\/thirdparty-report\\/user\\/orders\\/sport|\\/platform\\/payment\\/wallets|\\/product\\/cashout\\//i.test(u||"")}' +
                'function pickApiBase(origin){try{var h=hostOf(origin);if(isApiHost(h))return String(origin).replace(/\\/$/,"")}catch(e){}return""}' +
                'var entries=performance.getEntriesByType("resource");' +
                'for(var i=entries.length-1;i>=0;i--){' +
                'var u=entries[i].name||"";' +
                'if(isProvenApiUrl(u)&&isApiHost(hostOf(u))){var b=pickApiBase(new URL(u).origin);if(b){out.apiBase=b;break;}}' +
                '}' +
                'if(!out.apiBase){' +
                'for(var j=entries.length-1;j>=0;j--){' +
                'var u2=entries[j].name||"";' +
                'if(isApiHost(hostOf(u2))){var b2=pickApiBase(new URL(u2).origin);if(b2){out.apiBase=b2;break;}}' +
                '}' +
                '}' +
                '}catch(e2){}' +
                'function scanStore(store){' +
                'if(!store)return;' +
                'for(var i=0;i<store.length;i++){' +
                'var k=store.key(i)||""; var v=store.getItem(k)||"";' +
                'if(!out.headers.authorization){' +
                'if(/authorization|access[_-]?token|^token$/i.test(k)){var a=pickAuth(v);if(a)out.headers.authorization=a;}' +
                'else if(/^Bearer\\s/i.test(v)){out.headers.authorization=v;}' +
                '}' +
                'if(!out.apiBase && /api.*(url|host|base)|platform.*url|gateway/i.test(k) && /^https?:\\/\\//i.test(v)){' +
                'try{out.apiBase=new URL(v).origin;}catch(e3){}' +
                '}' +
                'if(!out.apiBase && /https?:\\/\\/[^\\s"\']+\\/platform\\//i.test(v)){' +
                'var m=v.match(/(https?:\\/\\/[^\\s"\']+?)\\/platform\\//i);' +
                'if(m){var b3=pickApiBase(m[1]);if(b3)out.apiBase=b3;}' +
                '}' +
                '}' +
                '}' +
                'try{scanStore(localStorage);scanStore(sessionStorage);}catch(e4){}' +
                'try{window.postMessage({source:USR_SRC,type:"cred-probe",id:id,payload:out},"*");}catch(e5){}' +
                '})();';
            (document.documentElement || document.head || document.body).appendChild(script);
            script.remove();
            setTimeout(function () { finish(null); }, 3500);
        });
    }

    function tryTriggerPlatformApiActivity() {
        const nodes = document.querySelectorAll('button, [role="button"], a');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!isElementVisible(el)) continue;
            const text = (el.textContent || '').replace(/\s+/g, ' ');
            if (/USDT|余额|钱包|Wallet/i.test(text)) {
                safeClick(el);
                return true;
            }
        }
        return false;
    }

    function pageContextFetchText(url, headers) {
        const hdrs = headers || buildPageContextRequestHeaders();
        return new Promise(function (resolve, reject) {
            const fetchId = 'fetch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            let settled = false;
            function finish(err, text) {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', onMsg);
                if (err) reject(err);
                else resolve(text);
            }
            function onMsg(e) {
                if (e.source !== window || !e.data || e.data.source !== PAGE_USR_SRC) return;
                if (e.data.type !== 'platform-fetch' || e.data.id !== fetchId) return;
                if (e.data.ok) finish(null, e.data.text || '');
                else finish(new Error(e.data.error || ('HTTP ' + (e.data.status || ''))));
            }
            window.addEventListener('message', onMsg);
            const script = document.createElement('script');
            script.textContent = '(function(){' +
                'var id=' + JSON.stringify(fetchId) + ';' +
                'var USR_SRC=' + JSON.stringify(PAGE_USR_SRC) + ';' +
                'var url=' + JSON.stringify(url) + ';' +
                'var headers=Object.assign({},' + JSON.stringify(hdrs) + ');' +
                'function pickAuth(v){if(!v)return"";v=String(v).trim();if(!v)return"";return /^Bearer\\s/i.test(v)?v:"Bearer "+v;}' +
                'function setHdr(k,v){if(v!=null&&v!=="")headers[String(k).toLowerCase()]=v;}' +
                'function scanAuth(){' +
                'if(headers.authorization)return;' +
                'try{[localStorage,sessionStorage].forEach(function(store){' +
                'for(var i=0;i<store.length;i++){' +
                'var k=store.key(i)||"";var v=store.getItem(k)||"";' +
                'if(!v)continue;' +
                'if(/authorization|access[_-]?token|^token$|auth|jwt|bearer/i.test(k)){' +
                'var a=pickAuth(v);if(a){setHdr("authorization",a);return;}}' +
                'if(/^Bearer\\s+/i.test(v)){setHdr("authorization",v);return;}' +
                'if(/^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.test(v)){setHdr("authorization","Bearer "+v);return;}' +
                'try{var o=JSON.parse(v);if(o&&typeof o==="object"){' +
                'var t=o.token||o.accessToken||o.access_token||o.authorization||o.Authorization;' +
                'var a=pickAuth(t);if(a){setHdr("authorization",a);return;}' +
                '}}catch(e){}' +
                '}' +
                '});}catch(e){}' +
                '}' +
                'scanAuth();' +
                'if(!headers.accept)headers.accept="application/json, text/plain, */*";' +
                'var xhr=new XMLHttpRequest();xhr.open("GET",url,true);xhr.timeout=' + ORDERS_FETCH_ATTEMPT_MS + ';xhr.withCredentials=false;' +
                'Object.keys(headers).forEach(function(k){if(k==="referer"||k==="origin")return;try{xhr.setRequestHeader(k,headers[k]);}catch(e){}});' +
                'xhr.onload=function(){window.postMessage({source:USR_SRC,type:"platform-fetch",id:id,ok:xhr.status>=200&&xhr.status<300,status:xhr.status,text:xhr.responseText||""},"*");};' +
                'xhr.onerror=function(){window.postMessage({source:USR_SRC,type:"platform-fetch",id:id,ok:false,error:"xhr error"},"*");};' +
                'xhr.ontimeout=function(){window.postMessage({source:USR_SRC,type:"platform-fetch",id:id,ok:false,error:"xhr timeout"},"*");};' +
                'xhr.send();' +
                '})();';
            (document.documentElement || document.head || document.body).appendChild(script);
            script.remove();
            setTimeout(function () { finish(new Error('页面fetch超时')); }, REPORT_UPLOAD_TIMEOUT);
        });
    }

    async function ensureHtyApiCredentials(maxMs, progressStep, credOpts) {
        const options = credOpts || {};
        const allowUiTrigger = options.allowUiTrigger === true;
        restoreApiState();
        if (hasPlatformCredentials()) return true;

        mergeProbeCredentials(await probeCredentialsFromPage());
        if (hasPlatformCredentials()) return true;

        if (allowUiTrigger && progressStep) {
            setBetStep(progressStep + '：触发平台接口…');
            renderPanel(true);
            tryTriggerPlatformApiActivity();
        }

        const deadline = Date.now() + (maxMs || REPORT_API_WAIT_MS);
        let lastTriggerAt = Date.now();
        while (Date.now() < deadline) {
            if (hasPlatformCredentials()) return true;
            if (allowUiTrigger && Date.now() - lastTriggerAt > 2500) {
                tryTriggerPlatformApiActivity();
                mergeProbeCredentials(await probeCredentialsFromPage());
                lastTriggerAt = Date.now();
            } else if (!allowUiTrigger) {
                mergeProbeCredentials(await probeCredentialsFromPage());
                await humanDelay(400, 600);
            } else {
                await humanDelay(400, 600);
            }
        }
        return hasPlatformCredentials();
    }

    async function platformGetText(url) {
        restoreApiState();
        if (hasPlatformCredentials() || htyApiState.headers.authorization) {
            try {
                return await gmPlatformGetText(url);
            } catch (e) {
                console.warn('[hty-inplay] GM平台请求失败，回退页面fetch', url, e);
            }
        }
        try {
            const text = await pageContextFetchText(url, buildPageContextRequestHeaders());
            if (text) return text;
        } catch (e) {
            console.warn('[hty-inplay] 页面fetch失败', url, e);
        }
        throw new Error('平台接口请求失败');
    }

    function gmPlatformGetText(url, timeoutMs) {
        const timeout = timeoutMs != null ? timeoutMs : REPORT_UPLOAD_TIMEOUT;
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: buildPlatformRequestHeaders(),
                timeout: timeout,
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
                    else {
                        const body = (res.responseText || '').trim();
                        const hint = body ? body.slice(0, 160) : '';
                        reject(new Error('上传失败 ' + res.status + (hint ? '：' + hint : '')));
                    }
                },
                onerror: function () { reject(new Error('上传网络错误')); },
                ontimeout: function () { reject(new Error('上传超时')); },
            });
        });
    }

    async function waitForHtyApiCredentials(maxMs) {
        return ensureHtyApiCredentials(maxMs);
    }

    function parseBetSubmitResponse(json) {
        if (!json || typeof json !== 'object') {
            return { ok: false, error: '下注响应为空' };
        }
        const submitted = json.data && json.data.submitted;
        const failed = json.data && json.data.failed;
        const failedSingles = failed && Array.isArray(failed.singles) ? failed.singles : [];
        if (failedSingles.length) {
            return { ok: false, error: '下注被拒绝', failedSingles: failedSingles };
        }
        const singles = submitted && Array.isArray(submitted.singles) ? submitted.singles : [];
        const orderno = singles.length
            ? String(singles[0].orderno || singles[0].orderId || singles[0].orderNo || '')
            : '';
        if (orderno) {
            return {
                ok: true,
                orderno: orderno,
                delay: singles[0].delay,
                singles: singles,
                response: json,
            };
        }
        const code = Number(json.code);
        if (code !== 0 && code !== 200 && String(json.code) !== '200' && json.success !== true) {
            return { ok: false, error: json.msg || ('下注失败 code=' + json.code) };
        }
        return { ok: false, error: '响应无 orderno' };
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
        const betMarket = getOptionBetMarket(option);
        const betPlateOn = getOptionBetPlateOn(option);
        const betPlateOnK = option.bttsSubstitute
            ? ''
            : (strategy.plateOnK != null ? String(strategy.plateOnK) : (ticket && ticket.k) || '');
        const record = {
            orderno: betApi.orderno,
            delay: betApi.delay,
            matchId: String(matchId || strategy.matchId || (ticket && ticket.iid) || ''),
            recHash: strategy.recHash || '',
            market: betMarket || (ticket && ticket.market) || option.market || '',
            plateOn: betPlateOn || (ticket && ticket.beton) || option.side || '',
            plateOnK: betPlateOnK,
            plateOddsHit: strategy.plateOddsHit,
            plateAmount: strategy.plateAmount,
            plateAmountRate: strategy.plateAmountRate,
            betOdds: option.odds != null ? Number(option.odds) : (ticket && ticket.odds),
            betStake: single && single.ante != null ? Number(single.ante) : resolveBetStakeValue(option),
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
        if (option.bttsSubstitute && option.substitutedFrom) {
            record.triggerMarket = option.substitutedFrom.market || strategy.market || '';
            record.triggerPlateOn = option.substitutedFrom.plateOn || strategy.plateOn || '';
            record.triggerPlateOnK = option.substitutedFrom.plateOnK != null
                ? String(option.substitutedFrom.plateOnK) : '';
            record.bttsSubstitute = true;
        }
        return record;
    }

    function clearBetResultWaiter() {
        if (!betResultWaiter) return;
        if (betResultWaiter.timer) clearTimeout(betResultWaiter.timer);
        betResultWaiter = null;
    }

    function armBetResultWaiter() {
        clearBetResultWaiter();
        const p = new Promise(function (resolve, reject) {
            const timer = setTimeout(function () {
                if (!betResultWaiter || betResultWaiter.reject !== reject) return;
                clearBetResultWaiter();
                reject(new Error('下注接口响应超时'));
            }, BET_API_WAIT_MS);
            betResultWaiter = { resolve: resolve, reject: reject, timer: timer };
        });
        // 调用方结束后仍可能迟到 reject：吞掉避免 Uncaught (in promise)
        p.catch(function () { /* settled by wait loop or discarded */ });
        return p;
    }

    /** 可重绑的等待句柄：接受赔率变更后 rearm 不会丢掉成功响应 */
    function createBetWaitHandle() {
        const handle = {
            promise: null,
            generation: 0,
        };
        handle.rearm = function () {
            handle.generation += 1;
            handle.promise = armBetResultWaiter();
            return handle.promise;
        };
        handle.clear = function () {
            clearBetResultWaiter();
            handle.generation += 1;
            handle.promise = null;
        };
        handle.rearm();
        return handle;
    }

    function handleBetResultMessage(data) {
        if (!data) return;
        const url = data.url || '';
        const base = extractPlatformApiBase(url);
        if (base) {
            rememberKnownOrdersApiBase(base);
        }
        const parsed = parseBetSubmitResponse(data.response);
        if (parsed.ok) {
            // 无论是否有 waiter：先缓存成功响应，避免 rearm/世代切换丢掉结果后无法更新策略状态
            lastCapturedBetSuccess = {
                payload: {
                    orderno: parsed.orderno,
                    delay: parsed.delay,
                    singles: parsed.singles,
                    response: parsed.response,
                    requestBody: data.requestBody,
                },
                at: Date.now(),
            };
            persistApiState();
        }
        if (!betResultWaiter) {
            if (parsed.ok) {
                console.log('[hty-inplay] 捕获下注响应(无等待者)', parsed.orderno);
            } else {
                console.warn('[hty-inplay] 捕获下注响应(无等待者) 解析失败', parsed.error, data.response);
            }
            return;
        }
        const waiter = betResultWaiter;
        clearBetResultWaiter();
        if (parsed.ok) {
            console.log('[hty-inplay] 捕获下注响应', parsed.orderno);
            waiter.resolve({
                orderno: parsed.orderno,
                delay: parsed.delay,
                singles: parsed.singles,
                response: parsed.response,
                requestBody: data.requestBody,
            });
        } else {
            console.warn('[hty-inplay] 下注响应解析失败', parsed.error, data.response);
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
            console.warn('[hty-inplay] 策略投注单上传失败', e);
            return false;
        }
    }

    function initPlatformApiBridge() {
        window.addEventListener('message', function (e) {
            if (e.source !== window || !e.data || e.data.source !== PAGE_HOOK_SRC) return;
            if (e.data.type === 'capture') {
                if (e.data.apiBase) rememberKnownOrdersApiBase(e.data.apiBase);
                mergePlatformHeaders(e.data.headers || {});
                htyApiState.lastCaptureAt = e.data.ts || Date.now();
                persistApiState();
            }
            if (e.data.type === 'orders-report') {
                if (isValidOrdersReportText(e.data.text)) {
                    cacheOrdersReport(e.data.url, e.data.text);
                    if (e.data.apiBase) rememberKnownOrdersApiBase(e.data.apiBase);
                    mergePlatformHeaders(e.data.headers || {});
                    htyApiState.lastCaptureAt = e.data.ts || Date.now();
                    persistApiState();
                    console.log('[hty-inplay] hook 捕获订单接口响应',
                        parseOrdersReportMatchId(e.data.url), (e.data.text || '').length, '字符');
                }
            }
            if (e.data.type === 'bet-result') {
                handleBetResultMessage(e.data);
            }
            if (e.data.type === 'inplay-match-gone') {
                handleInplayMatchNotFound(e.data.matchId, e.data.msg || 'api_not_found');
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
            'function isPlatformUrl(url){return /\\/product\\/game\\/bet/i.test(url)||/\\/thirdparty-report\\//i.test(url)||/\\/platform\\/payment\\//i.test(url)||/\\/product\\/cashout\\//i.test(url)}' +
            'function postBetResult(url,body,resp){try{window.postMessage({source:HOOK_SRC,type:"bet-result",url:url||"",requestBody:body,response:resp||null,ts:Date.now()},"*")}catch(e){}}' +
            'function hdrObj(h){var o={};if(!h)return o;if(typeof Headers!=="undefined"&&h instanceof Headers){h.forEach(function(v,k){o[String(k).toLowerCase()]=v});return o}' +
            'if(Array.isArray(h)){h.forEach(function(p){if(p&&p.length>=2)o[String(p[0]).toLowerCase()]=p[1]});return o}' +
            'if(typeof h==="object"){Object.keys(h).forEach(function(k){o[String(k).toLowerCase()]=h[k]});return o}return o}' +
            'function postCapture(base,headers){try{window.postMessage({source:HOOK_SRC,type:"capture",apiBase:base||"",headers:headers||{},ts:Date.now()},"*")}catch(e){}}' +
            'function onBetResponse(url,body,text){if(!/\\/product\\/game\\/bet/i.test(url||""))return;try{postBetResult(url,body,JSON.parse(text||"{}"))}catch(e){postBetResult(url,body,{code:-1,msg:"parse error"})}}' +
            'function isOrdersReportUrl(url){return /thirdparty-report\\/user\\/orders\\/sport/i.test(url||"")}' +
            'function postOrdersReport(url,headers,text){try{window.postMessage({source:HOOK_SRC,type:"orders-report",url:url||"",text:text||"",apiBase:apiBase(url),headers:hdrObj(headers||{}),ts:Date.now()},"*")}catch(e){}}' +
            'function isInplayMatchUrl(url){return /\\/product\\/business\\/sport\\/inplay\\/match/i.test(url||"")}' +
            'function parseInplayMatchId(url){try{var u=new URL(url,location.origin);return u.searchParams.get("iid")||u.searchParams.get("matchId")||""}catch(e){return ""}}' +
            'function postInplayMatchStatus(url,text){try{var data=JSON.parse(text||"{}");var code=String(data.code||"");var msg=String(data.msg||"");if(code==="40001"||/MATCH\\s*NOT\\s*FOUND/i.test(msg)){window.postMessage({source:HOOK_SRC,type:"inplay-match-gone",url:url||"",matchId:parseInplayMatchId(url),code:code,msg:msg,ts:Date.now()},"*")}}catch(e){}}' +
            'function onPlatformRequest(url,headers){if(!isPlatformUrl(url))return;var base=apiBase(url);var h=hdrObj(headers);if(base)postCapture(base,h)}' +
            'var oOpen=XMLHttpRequest.prototype.open;' +
            'XMLHttpRequest.prototype.open=function(m,url){this._htyMethod=String(m||"").toUpperCase();this._htyUrl=absUrl(url);this._htyHdr={};this._htyBody=null;return oOpen.apply(this,arguments)};' +
            'var oSet=XMLHttpRequest.prototype.setRequestHeader;' +
            'XMLHttpRequest.prototype.setRequestHeader=function(n,v){if(!this._htyHdr)this._htyHdr={};this._htyHdr[String(n).toLowerCase()]=v;return oSet.apply(this,arguments)};' +
            'var oSend=XMLHttpRequest.prototype.send;' +
            'XMLHttpRequest.prototype.send=function(body){this._htyBody=body;try{onPlatformRequest(this._htyUrl||"",this._htyHdr||{})}catch(e){}var xhr=this;var url=xhr._htyUrl||"";var reqBody=body;var hdr=xhr._htyHdr||{};' +
            'if(/\\/product\\/game\\/bet/i.test(url)){xhr.addEventListener("load",function(){try{onBetResponse(url,reqBody,xhr.responseText||"")}catch(e){}})}' +
            'if(isInplayMatchUrl(url)){xhr.addEventListener("load",function(){try{postInplayMatchStatus(url,xhr.responseText||"")}catch(e){}})}' +
            'if(isOrdersReportUrl(url)){xhr.addEventListener("load",function(){try{postOrdersReport(url,hdr,xhr.responseText||"")}catch(e){}})}' +
            'return oSend.apply(this,arguments)};' +
            'var oFetch=window.fetch;' +
            'if(typeof oFetch==="function"){' +
            'window.fetch=function(input,init){var url="";try{url=absUrl(typeof input==="string"?input:(input&&input.url)||"")}catch(e){}' +
            'try{onPlatformRequest(url,hdrObj(init&&init.headers))}catch(e){}' +
            'var ret=oFetch.apply(this,arguments);' +
            'if(/\\/product\\/game\\/bet/i.test(url)){' +
            'return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){onBetResponse(url,init&&init.body,t)}).catch(function(){})}catch(e){}return res;});' +
            '}' +
            'if(isInplayMatchUrl(url)){' +
            'return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){postInplayMatchStatus(url,t)}).catch(function(){})}catch(e){}return res;});' +
            '}' +
            'if(isOrdersReportUrl(url)){' +
            'return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){postOrdersReport(url,hdrObj(init&&init.headers),t)}).catch(function(){})}catch(e){}return res;});' +
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
        try {
            console.log('[hty-inplay] 后台同步投注记录…');
            await humanDelay(REPORT_SYNC_DELAY_MS, REPORT_SYNC_DELAY_MS + 800);
            await triggerAutoUploadMatchHistory('bet-success', {
                force: true,
                updateStep: false,
            });
        } catch (e) {
            console.warn('[hty-inplay] 投注记录后台同步失败', e);
        }
    }

    async function manualUploadMatchBetHistory() {
        if (matchHistoryUploading || reportSyncing || placing) return;
        if (!matchId) {
            setBetStep('上传失败：当前页无赛事ID');
            renderPanel(true);
            return;
        }
        if (!isLoggedIn()) {
            setBetStep('上传本场记录：等待登录…');
            renderPanel(true);
            tryAutoRelogin().catch(function (e) {
                console.warn('[hty-inplay] 上传记录前自动登录', e);
            });
            return;
        }
        matchHistoryUploading = true;
        setBetStep('上传本场投注记录：拉取 orders/sport…');
        renderPanel(true);
        try {
            const result = await uploadMatchBetHistory(matchId, null, {
                passive: true,
                uploadWallet: false,
                forUpload: true,
                allowPageFetch: true,
                allowPartial: false,
            });
            setBetResult('pending', '本场投注记录已上传 ' + result.orderCount + ' 条');
            setBetStep('上传完成 · 赛事#' + result.matchId + ' · ' + result.orderCount + '条');
            renderPanel(true);
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            setBetStep('上传本场记录失败：' + msg);
            renderPanel(true);
            console.error('[hty-inplay] 手动上传本场记录失败', e);
        } finally {
            matchHistoryUploading = false;
        }
    }

    async function continueAfterBetSuccess(option, extraMsg, fromAutoBet, betRecord) {
        const orderHint = betRecord && betRecord.orderno ? ' 单号' + betRecord.orderno : '';
        const stakeText = betRecord && betRecord.betStake != null
            ? String(betRecord.betStake)
            : formatBetStakeSummary(option);
        const label = option.label + ' ' + stakeText + ' 已提交' + orderHint;
        setBetResult('success', extraMsg ? label + '（' + extraMsg + '）' : label);
        syncReportAfterBetSuccess().catch(function (e) {
            console.error('[hty-inplay] report sync', e);
        });
        renderPanel(true);
        lastMatchScanAt = 0;
        await loadStrategies(true);
        await refreshTargetOption(true);
        renderPanel(true);
        syncTargetOptionFromStates();
        if (shouldAutoBet()) {
            setBetStep('上一条策略已完成，准备下一条');
            await humanDelay(1500, 3000);
            maybeTriggerAutoBet(false);
            return;
        }
        betResult = 'pending';
        setBetStep('等待其余策略盘口与赔率达标');
        schedulePoll();
    }

    async function placeTestBet(option, fromAutoBet) {
        if (!option || placing) return false;
        if (!option.strategy || !passesStrategyStatusGate(option.strategy)) return false;

        const recHash = option.strategy.recHash;

        if (isScriptDedupStored(option, recHash)) {
            const local = recHash ? getLocalExecutedStrategy(recHash) : null;
            console.warn('[hty-inplay] 脚本防重：跳过重复下单', recHash, option.testid);
            setBetResult('skipped', '脚本防重' + (local && local.orderno ? ' 单号' + local.orderno : ''));
            targetOption = null;
            renderPanel(true);
            triggerAutoUploadMatchHistory('dedup-already-placed', { updateStep: false }).catch(function (e) {
                console.warn('[hty-inplay] 防重拦截后上传', e);
            });
            schedulePoll();
            return false;
        }

        if (recHash && isBetAttemptBlocked(recHash)) {
            const attempt = getBetAttempt(recHash);
            let recovered = null;
            if (isBetSubmittedDrawerVisible()) {
                setBetStep('检测到未完成下注，尝试确认…');
                renderPanel(true);
                recovered = await tryRecoverSuccessfulBet(option, attempt && attempt.at, { quick: true });
            } else if (canQueryOrdersReport() || getCachedOrdersReportText(matchId)) {
                setBetStep('检测到未完成下注，尝试确认…');
                renderPanel(true);
                recovered = await tryRecoverSuccessfulBet(option, attempt && attempt.at, { quick: true });
            }
            if (recovered) {
                lastStrategyBetRecord = recovered;
                placing = true;
                await finalizeBetSuccess(option, recovered, !!fromAutoBet, '后台确认已有订单（防重拦截）');
                placing = false;
                return true;
            }
            if (!isBetSubmittedDrawerVisible()) {
                const age = attempt ? Date.now() - Number(attempt.at || 0) : 0;
                if (age < BET_DEDUP_VERIFY_MISS_MS) {
                    console.warn('[hty-inplay] 防重拦截：近期尝试未确认，暂停重复下单', recHash);
                    setBetResult('pending', '暂停重复下单，等待确认');
                    setBetStep('防重查单中（' +
                        Math.max(1, Math.ceil((BET_DEDUP_VERIFY_MISS_MS - age) / 1000)) +
                        's 无单可重试）…');
                    renderPanel(true);
                    schedulePoll();
                    return false;
                }
                console.log('[hty-inplay] 上次下注未成功，清除防重标记并重试', recHash);
                clearPendingBetDedup(recHash, 'attempt 超时无单，允许重试');
                betResult = 'pending';
                setBetStep('上次下注失败，条件满足将重新尝试');
                renderPanel(true);
            } else {
                console.warn('[hty-inplay] 下注尝试未确认，跳过重复下单', recHash);
                setBetResult('pending', '暂停重复下单，等待确认');
                setBetStep('等待订单入库确认，请勿手动重复下注');
                renderPanel(true);
                schedulePoll();
                return false;
            }
        }

        const inflight = getBetInFlight();
        if (recHash && inflight && inflight.recHash === recHash) {
            setBetStep('检测到进行中的下注，尝试确认…');
            const recovered = await tryRecoverSuccessfulBet(option, inflight.at, {
                retries: 3,
                gapMs: 2500,
            });
            if (recovered) {
                lastStrategyBetRecord = recovered;
                placing = true;
                await finalizeBetSuccess(option, recovered, !!fromAutoBet, '后台确认已有订单（未走完整弹窗流程）');
                placing = false;
                return true;
            }
            const inflightAge = Date.now() - Number(inflight.at || 0);
            if (inflightAge > BET_DEDUP_VERIFY_MISS_MS && !isBetSubmittedDrawerVisible()) {
                clearPendingBetDedup(recHash, 'inflight 超时无单，允许重试');
            } else if (inflightAge > BET_RECOVERY_WINDOW_MS) {
                clearBetInFlight();
            } else {
                console.warn('[hty-inplay] 下注进行中且未确认，跳过重复下单', recHash);
                setBetResult('pending', '暂停重复下单，等待确认');
                setBetStep('防重查单中（' +
                    Math.max(1, Math.ceil((BET_DEDUP_VERIFY_MISS_MS - inflightAge) / 1000)) +
                    's 无单可重试）…');
                renderPanel(true);
                schedulePoll();
                return false;
            }
        }

        placing = true;
        collapsePanelForBet();
        setBetResult('placing', '准备点击赔率');

        let stakeInput = '';
        try {
            stakeInput = resolveBetStakeInput(option);
        } catch (stakeErr) {
            placing = false;
            restorePanelAfterBet();
            const msg = stakeErr && stakeErr.message ? stakeErr.message : '投注金额无效';
            setBetResult('failed', msg);
            renderPanel(true);
            schedulePoll();
            return false;
        }

        markBetAttemptStarted(option, recHash, stakeInput);

        let betAttemptAt = 0;
        try {
            setBetStep('定位赔率按钮');
            const liveBtn = await ensureButtonVisible(option);
            if (!liveBtn) throw new Error('页面上找不到对应赔率按钮');
            option.button = liveBtn;

            setBetStep('等待投注单打开');
            let opened = isCartOpen();
            if (!opened && getSportCartItemCount() > 0) {
                opened = await openBetDrawer();
            }
            if (!opened) {
                setBetStep('滚动到赔率按钮');
                await humanScrollTo(liveBtn);
                setBetStep('点击 ' + option.label + ' 赔率');
                safeClick(liveBtn);
                await humanDelay(600, 1100);
                opened = await waitFor(isCartOpen, 12000, 300);
            }
            if (!opened) throw new Error('投注单未打开');
            await ensureBetCartVisible();
            await humanDelay(400, 800);

            setBetStep('数字键盘输入 ' + stakeInput);
            await enterAmountViaKeypad(stakeInput);
            await humanDelay(300, 700);

            betAttemptAt = Date.now();
            setBetStep('等待下注结果（接口或成功抽屉）…');
            const betWaitHandle = createBetWaitHandle();
            await ensureBetCartVisible();
            await submitBetSlip(stakeInput, function () {
                betWaitHandle.rearm();
            });
            const outcome = await waitForBetOutcomeAfterSubmit(betWaitHandle, option, betAttemptAt);
            let betRecord;
            let outcomeHint = '';
            if (outcome.source === 'api' || outcome.source === 'api_late') {
                betRecord = buildStrategyBetRecord(option, outcome.payload, outcome.payload.requestBody);
            } else if (outcome.source === 'order') {
                betRecord = outcome.record;
                outcomeHint = '订单恢复确认';
            } else {
                betRecord = outcome.record;
                outcomeHint = 'UI成功抽屉确认';
            }
            lastStrategyBetRecord = betRecord;
            console.log('[hty-inplay] 下注成功', betRecord.orderno, betRecord.recHash, outcome.source);
            const doneRecHash = getBetRecHash(option, betRecord);
            // 先本地锁定「已执行」，再放开 placing，杜绝中间被再次自动下单
            markStrategyExecutedLocally(doneRecHash);
            rememberExecutedStrategy(doneRecHash, betRecord.orderno, option, {
                pendingSync: true,
                betOdds: betRecord.betOdds,
                betStake: betRecord.betStake,
                matchId: betRecord.matchId || matchId,
            });
            placing = false;
            restorePanelAfterBet();
            setBetResult('success', (option.label || '') + ' 已提交');
            renderPanel(true);
            await finalizeBetSuccess(option, betRecord, !!fromAutoBet, outcomeHint || undefined);
            return true;
        } catch (err) {
            clearBetResultWaiter();
            let recovered = null;
            let recoverHint = '';
            const sinceAt = betAttemptAt > 0 ? betAttemptAt : (Date.now() - 60000);
            if (betAttemptAt > 0 || isBetSubmittedDrawerVisible()) {
                setBetStep('下注响应异常，尝试从订单确认…');
                renderPanel(true);
                recovered = await tryRecoverSuccessfulBet(option, sinceAt, {
                    quick: isBetSubmittedDrawerVisible(),
                    retries: 3,
                    gapMs: 2500,
                });
                if (recovered) recoverHint = '订单/UI 恢复确认';
            } else {
                const captured = consumeLastCapturedBetSuccess(option, Date.now() - 10000);
                if (captured) {
                    recovered = buildStrategyBetRecord(option, captured, captured.requestBody);
                    recoverHint = '接口迟到的响应';
                }
            }
            if (recovered) {
                lastStrategyBetRecord = recovered;
                const hint = err && err.message ? err.message : '未知错误';
                const extra = recoverHint
                    ? recoverHint + '（' + hint + '）'
                    : '接口未捕获(' + hint + ')';
                const doneRecHash = getBetRecHash(option, recovered);
                markStrategyExecutedLocally(doneRecHash);
                rememberExecutedStrategy(doneRecHash, recovered.orderno, option);
                await finalizeBetSuccess(option, recovered, !!fromAutoBet, extra);
                return true;
            }
            const msg = err && err.message ? err.message : '未知错误';
            // 仅「已点投注」或「已提交抽屉」后的超时才锁；打开投注单阶段的等待超时可重试
            const submittedUi = isBetSubmittedDrawerVisible();
            const keepAttempt = !isDefinitiveBetFailure(err) &&
                (submittedUi || (betAttemptAt > 0 && isUncertainBetFailure(err)));
            if (keepAttempt) {
                // 不论防重开关：超时后必须锁住，防止自动再下一注
                markBetAttempt(recHash, option, stakeInput);
                markBetInFlight(recHash, {
                    testid: option && option.testid,
                    stake: stakeInput,
                    at: betAttemptAt || Date.now(),
                });
                if (submittedUi) {
                    const uiRec = buildBetRecordFromUiSuccess(option);
                    const doneRecHash = getBetRecHash(option, uiRec) || recHash;
                    markStrategyExecutedLocally(doneRecHash);
                    rememberExecutedStrategy(doneRecHash, uiRec.orderno, option, {
                        pendingSync: true,
                        betOdds: uiRec.betOdds,
                        betStake: uiRec.betStake,
                        matchId: uiRec.matchId || matchId,
                    });
                    setBetResult('success', (option.label || '') + ' 已提交（超时·UI确认）');
                    setBetStep('接口超时但页面已提交，已锁定防重并同步状态');
                    renderPanel(true);
                    await finalizeBetSuccess(option, uiRec, !!fromAutoBet, '超时·UI已提交');
                    return true;
                }
                // 无 UI：仍必须走 finalize 更新后台 ruleMeetIgnore=2（有单却不更新状态的根因）
                const lateCap = consumeLastCapturedBetSuccess(option, sinceAt);
                const uncertainRec = lateCap
                    ? buildStrategyBetRecord(option, lateCap, lateCap.requestBody)
                    : buildBetRecordFromUiSuccess(option);
                console.warn('[hty-inplay] 下注结果不确定，锁定并同步策略状态', msg, recHash,
                    uncertainRec && uncertainRec.orderno);
                setBetResult('pending', '下注可能已成功，暂停重复下单（' + msg + '）');
                setBetStep('超时未接到响应，已锁定并同步策略为已执行');
                renderPanel(true);
                await finalizeBetSuccess(option, uncertainRec, !!fromAutoBet, '超时·防重锁定');
                return false;
            }
            clearBetInFlight();
            clearBetAttempt(recHash);
            console.warn('[hty-inplay] 投注失败', msg, err);
            setBetResult('failed', '失败：' + msg);
            setBetStep('下注失败：' + msg + '，条件满足将重试');
            renderPanel(true);
            schedulePoll();
            // 明确失败才允许自动再试；超时类绝不再 maybeTrigger
            if (!/超时|等待/i.test(msg)) {
                maybeTriggerAutoBet(false);
            }
            return false;
        } finally {
            placing = false;
            restorePanelAfterBet();
        }
    }

    async function runAutoBet() {
        if (autoBetInFlight || placing) return;
        if (!shouldAutoBet()) return;
        if (!isLoggedIn()) {
            betResult = 'pending';
            setBetStep('等待登录，尝试自动登录…');
            tryAutoRelogin({ urgent: true }).catch(function (e) {
                console.warn('[hty-inplay] runAutoBet 自动登录', e);
            });
            schedulePoll();
            return;
        }
        autoBetInFlight = true;
        try {
            await placeTestBet(targetOption, true);
        } finally {
            autoBetInFlight = false;
        }
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
        const stakeSummary = formatBetStakeSummary(targetOption);
        const msg = '确认测试下注？\n\n' +
            '盘口：' + targetOption.label + '\n' +
            '当前赔率：' + formatOddsDisplay(targetOption.odds) +
            '（阈值≥' + formatOddsDisplay(targetOption.minOdds) + '）\n' +
            '投注金额：' + stakeSummary;
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
            if (isCurrentMatchEnded()) {
                await handleMatchEnded();
                if (isCurrentMatchEnded()) {
                    setBetStep(hasNavigableInPlayMatches()
                        ? '当前赛事已结束，准备切换…'
                        : (buildWaitingKickoffMessage() || '当前赛事已结束，已停止扫描'));
                    setBetResult('pending', '赛事已结束');
                    renderPanel(true);
                    return;
                }
                return;
            }
            if (!isPageReady()) {
                schedulePoll();
                return;
            }

            if (!isLoggedIn() && !reloginInProgress) {
                if (placing || betResult === 'placing') {
                    placing = false;
                    betResult = 'pending';
                }
                setBetStep('登录已失效，正在自动登录…');
                renderPanel(true);
                tryAutoRelogin({ urgent: true }).catch(function (e) {
                    console.warn('[hty-inplay] 轮询中自动登录', e);
                });
                schedulePoll();
                return;
            }
            await ensureMarketView(false);
            await refreshTargetOption(!targetOption);
            if (!placing) {
                if (await resolvePendingBetDedup()) {
                    schedulePoll();
                    return;
                }
                // 刚清除防重后立刻尝试下单，避免再空等一轮
                syncTargetOptionFromStates();
                if (!targetOption) {
                    const states = evaluateStrategyStates();
                    strategyStates = states;
                    targetOption = findStrategyMatch();
                }
            }
            if (targetOption && betStep.indexOf('等待策略盘口') >= 0) {
                setBetStep('已命中 ' + targetOption.label + ' @' + targetOption.odds);
            }
            renderPanel(false, false);
            maybeTriggerAutoBet(false);
            if (!placing && !shouldAutoBet() && !pollTimer) {
                const rotated = await tryRotateInplayMatch('扫描轮换');
                if (rotated) return;
            }
            schedulePoll();
        }, POLL_MS);
    }

    function kickoffAutoBet() {
        panelReady = true;
        renderPanel(true);
        maybeTriggerAutoBet(false);
        if (shouldAutoBet()) return;
        if (!isLoggedIn()) {
            schedulePoll();
            return;
        }
        setBetStep('等待策略盘口与赔率达标');
        schedulePoll();
    }

    function setPanelCollapsed(collapsed) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panelCollapsed = !!collapsed;
        panel.classList.toggle('tm-hty-collapsed', panelCollapsed);
        const btn = panel.querySelector('.tm-hty-collapse');
        if (btn) btn.textContent = panelCollapsed ? '▸' : '▾';
        syncOddsObserverState();
    }

    function collapsePanelForBet() {
        if (panelBetAutoCollapsed) return;
        panelCollapsedBeforeBet = panelCollapsed;
        if (!panelCollapsed) {
            setPanelCollapsed(true);
            panelBetAutoCollapsed = true;
        }
    }

    function restorePanelAfterBet() {
        if (!panelBetAutoCollapsed) return;
        panelBetAutoCollapsed = false;
        if (!panelCollapsedBeforeBet) {
            setPanelCollapsed(false);
            renderPanel(true);
        }
        panelCollapsedBeforeBet = false;
    }

    function clearPanelBetCollapseState() {
        panelBetAutoCollapsed = false;
        panelCollapsedBeforeBet = false;
    }

    function setupManualCartPanelWatch() {
        if (manualCartPanelWatchReady) return;
        manualCartPanelWatchReady = true;
        setInterval(function () {
            if (placing) return;
            const open = isCartOpen();
            if (open && !lastCartOpenForPanel) {
                collapsePanelForBet();
            } else if (!open && lastCartOpenForPanel) {
                setTimeout(function () {
                    if (!placing && !isCartOpen()) {
                        restorePanelAfterBet();
                    }
                }, 600);
            }
            lastCartOpenForPanel = open;
        }, 350);
    }

    function togglePanelCollapsed() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        if (panelBetAutoCollapsed) {
            clearPanelBetCollapseState();
        }
        setPanelCollapsed(!panelCollapsed);
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
                '#' + PANEL_ID + ' .tm-hty-login[data-kind="ok"]{color:#86efac;cursor:default;}' +
                '#' + PANEL_ID + ' .tm-hty-login[data-kind="warn"]{color:#fde68a;cursor:pointer;text-decoration:underline;}' +
                '#' + PANEL_ID + ' .tm-hty-actions{display:flex;gap:6px;padding:0 12px 12px;flex-wrap:wrap;}' +
                '#' + PANEL_ID + ' .tm-hty-action-btn{flex:1 1 30%;border:1px solid #2563eb;border-radius:6px;padding:6px 8px;' +
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
                '#' + PANEL_ID + ' .tm-hty-bet-section[data-hidden="1"]{display:none;}' +
                '#' + PANEL_ID + ' .tm-hty-stake-row{margin-left:-4px;margin-right:-4px;padding:6px 4px;border-radius:6px;transition:background .15s ease;}' +
                '#' + PANEL_ID + ' .tm-hty-stake-row.tm-hty-stake-alert{background:#fecaca;box-shadow:inset 0 0 0 1px #f87171;}' +
                '#' + PANEL_ID + ' .tm-hty-stake-row.tm-hty-stake-alert .tm-hty-label{color:#7f1d1d;font-weight:700;}' +
                '#' + PANEL_ID + ' .tm-hty-stake-row.tm-hty-stake-alert .tm-hty-stake-select{' +
                'border-color:#ef4444;background:#fff1f2;color:#7f1d1d;font-weight:700;}' +
                '#' + PANEL_ID + ' .tm-hty-stake-select{width:100%;border:1px solid #475569;border-radius:4px;' +
                'background:#1e293b;color:#f1f5f9;font-size:11px;padding:3px 6px;cursor:pointer;}' +
                '#' + PANEL_ID + ' .tm-hty-dedup-label{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#cbd5e1;cursor:pointer;}' +
                '#' + PANEL_ID + ' .tm-hty-dedup-toggle{margin:0;cursor:pointer;}';
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
            '<div class="tm-hty-row tm-hty-stake-row"><span class="tm-hty-label">投注金额</span><span class="tm-hty-value">' +
            '<select class="tm-hty-stake-select" title="投注金额规则">' +
            '<option value="strategy">策略实际金额</option>' +
            '<option value="2.5">2.5</option>' +
            '<option value="1">1</option>' +
            '<option value="0.3">0.3</option>' +
            '</select></span></div>' +
            '<div class="tm-hty-row tm-hty-dedup-row"><span class="tm-hty-label">脚本防重</span>' +
            '<span class="tm-hty-value tm-hty-dedup-wrap">' +
            '<label class="tm-hty-dedup-label" title="策略状态为未执行时，再检查本页/本会话是否已下单">' +
            '<input type="checkbox" class="tm-hty-dedup-toggle" checked> 开启（默认）</label></span></div>' +
            '<div class="tm-hty-row"><span class="tm-hty-label">即将投注</span><span class="tm-hty-value tm-hty-upcoming">等待页面加载</span></div>' +
            '<div class="tm-hty-row"><span class="tm-hty-label">投注结果</span><span class="tm-hty-value"><span class="tm-hty-result" data-kind="info">等待盘口</span></span></div>' +
            '<div class="tm-hty-step">初始化中</div>' +
            '</div>' +
            '</div>' +
            '<div class="tm-hty-actions">' +
            '<button type="button" class="tm-hty-action-btn" data-action="open-cart">打开投注单</button>' +
            '<button type="button" class="tm-hty-action-btn" data-action="test-bet">测试下注</button>' +
            '<button type="button" class="tm-hty-action-btn" data-action="upload-match-bets">上传本场记录</button>' +
            '</div>';

        panel.querySelector('.tm-hty-head').addEventListener('click', function (e) {
            if (e.target.closest('.tm-hty-collapse') || e.target.closest('.tm-hty-login')) return;
            togglePanelCollapsed();
        });
        panel.querySelector('.tm-hty-collapse').addEventListener('click', function (e) {
            e.stopPropagation();
            togglePanelCollapsed();
        });
        const loginEl = panel.querySelector('.tm-hty-login');
        if (loginEl) {
            loginEl.addEventListener('click', function (e) {
                e.stopPropagation();
                loginCache.ts = 0;
                if (isLoggedIn()) return;
                if (reloginInProgress) {
                    setReloginStatus('登录进行中…');
                    return;
                }
                setReloginStatus('手动触发登录…');
                tryAutoRelogin({ urgent: true, force: true }).catch(function (err) {
                    console.warn('[hty-inplay] 手动点击登录', err);
                });
            });
        }
        const stakeSelect = panel.querySelector('.tm-hty-stake-select');
        if (stakeSelect) {
            stakeSelect.value = stakeMode;
            const stakeRow = panel.querySelector('.tm-hty-stake-row');
            if (stakeRow) {
                stakeRow.classList.toggle('tm-hty-stake-alert', stakeMode !== 'strategy');
                stakeRow.title = stakeMode !== 'strategy'
                    ? '当前为固定金额，非策略实际金额'
                    : '';
            }
            stakeSelect.addEventListener('change', function (e) {
                e.stopPropagation();
                const mode = stakeSelect.value;
                if (!STAKE_MODE_OPTIONS[mode]) return;
                stakeMode = mode;
                saveStakeMode(mode);
                renderPanel(true);
            });
        }
        const dedupToggle = panel.querySelector('.tm-hty-dedup-toggle');
        if (dedupToggle) {
            dedupToggle.checked = isBetDedupEnabled();
            dedupToggle.addEventListener('change', function (e) {
                e.stopPropagation();
                betDedupEnabled = !!dedupToggle.checked;
                saveBetDedupEnabled(betDedupEnabled);
                lastStrategyHitKey = '';
                void refreshTargetOption(true).then(function () {
                    renderPanel(true);
                });
            });
        }
        panel.addEventListener('click', function (e) {
            if (e.target.closest('.tm-hty-ended-toggle')) {
                e.stopPropagation();
                toggleEndedMatchesCollapsed(panel);
                return;
            }
            if (e.target.closest('.tm-hty-match-trace')) return;
            if (e.target.closest('.tm-hty-match-main')) {
                e.preventDefault();
                const link = e.target.closest('.tm-hty-match-main');
                const idMatch = (link.getAttribute('href') || '').match(/\/match\/(\d+)/i);
                const targetId = idMatch ? idMatch[1] : '';
                if (targetId) {
                    markUserManualMatch(targetId);
                    openInplayMatchPage(targetId, '用户选择赛事');
                }
                return;
            }
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn || actionBtn.disabled) return;
            e.stopPropagation();
            if (actionBtn.dataset.action === 'open-cart') manualOpenCart();
            if (actionBtn.dataset.action === 'test-bet') testBet03();
            if (actionBtn.dataset.action === 'upload-match-bets') manualUploadMatchBetHistory();
            if (actionBtn.dataset.action === 'refresh-strategy') {
                loadActiveMatches(true);
                loadStrategies(true);
            }
        });

        document.body.appendChild(panel);
        setupRouteWatcher();
        setupManualCartPanelWatch();
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
                if (isCurrentMatchEnded()) return true;
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
        if (isCurrentMatchEnded()) return;

        if (!pickInplayNavigableMatch('') && !isPageReady()) {
            setWaitingKickoffState();
            schedulePoll();
            return;
        }

        setBetStep('切换盘口视图并扫描…');
        panelReady = true;
        scheduleHeartbeat();
        syncOddsObserverState();
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

    async function startListPage() {
        if (recoverFromBlockedAccessPage()) return;
        await ensureListPageBoot();
    }

    async function start() {
        if (started) return;
        if (isSiteAccessBlockedPage()) {
            suppressNavigation(WAF_RECOVERY_COOLDOWN_MS, 'WAF阻断页启动');
        }
        if (recoverFromBlockedAccessPage()) return;
        started = true;

        rememberCurrentMatchReturnUrl();
        // 直开比赛 URL：钉住本场；清掉「回列表再进场」残留；不在此写入硬冷却（避免误伤）
        try {
            sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
            // 若刚被连环跳熔断，进到比赛页后解除熔断，只保留普通硬冷却
            const until = parseInt(sessionStorage.getItem(NAV_BREAKER_UNTIL_KEY) || '0', 10) || 0;
            if (until && Date.now() < until) {
                sessionStorage.removeItem(NAV_BREAKER_UNTIL_KEY);
                sessionStorage.removeItem(NAV_BREAKER_LOG_KEY);
            }
        } catch (e) { /* ignore */ }
        if (matchId) {
            lastInplayNavAt = Date.now();
            try {
                sessionStorage.setItem(LAST_INPLAY_NAV_AT_KEY, String(lastInplayNavAt));
                sessionStorage.setItem(LAST_INPLAY_NAV_MATCH_KEY, String(matchId));
                sessionStorage.setItem(NAV_HARD_AT_KEY, String(lastInplayNavAt));
            } catch (e) { /* ignore */ }
        }
        createPanel();
        ensureWrongSportSectionGuard();
        scheduleLoginWatch();
        setInterval(function () {
            loginCache.ts = 0;
            if (isLoggedIn() || reloginInProgress) return;
            tryAutoRelogin({ urgent: placing }).catch(function (e) {
                console.warn('[hty-inplay] 定时自动登录', e);
            });
        }, RELOGIN_WATCH_MS);
        scheduleSessionKeepAlive();
        setupMatchEndedWatcher();
        setupVisibilityWatch();
        scheduleHeartbeat();
        setTimeout(function () {
            startAutoBetFlow();
        }, 0);
    }

    function boot() {
        try { clearKeepalivePhase(); } catch (e) { /* ignore */ }
        try { window.__htyAllowPageNav = false; } catch (e2) { /* ignore */ }
        console.log('[hty-inplay] boot', SCRIPT_VERSION,
            'AUTO_PAGE_NAV=', AUTO_PAGE_NAV_ENABLED);
        ensureLoginNavGate();
        ensureNavPicker();
        getHeartbeatRunner();
        ensureWrongSportSectionGuard();
        if (isWrongSportSectionPage()) {
            recoverFromWrongSportSection('启动于非足球版块，统一拉回足球滚球列表');
            return;
        }
        if (!matchId && isInplayListPage()) {
            startListPage();
            return;
        }
        if (!matchId && isStrandedSportEventsPage()) {
            startStrandedPage();
            return;
        }
        if (!matchId) return;
        start();
    }

    ensureWrongSportSectionGuard();
    if (document.body) {
        boot();
    } else {
        document.addEventListener('DOMContentLoaded', boot);
    }
