// ==UserScript==
// @name         HTY滚球量化投注
// @namespace    https://smartodds.xyz/
// @version      2.16.1
// @description  HTY滚球/即将开赛赛事页：策略赛事列表 + 自动下注 + 投注单关联策略 + 记录同步
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/inplay\/football\/match\/\d+(\?|#|$)/
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/incoming\/football\/match\/\d+(\?|#|$)/
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/inplay\/football\/?(\?|#|$)/
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/?(\?|#|$)/
// @include      /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents\/.+/
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      alert.socbeta.xyz
// @connect      *
// @connect      192.168.31.168
// ==/UserScript==

/* === early document-start guard === */
/* document-start：硬拦截 JS 整页导航（location.assign/replace/href/reload）
 * 仅当 window.__htyAllowPageNav === true 时放行（用户手动选场等）。
 * 不拦截：用户真实点击 <a>、站点 history.pushState SPA。
 */
(function () {
  'use strict';
  var FLAG = '__htyAllowPageNav';
  try {
    if (typeof window[FLAG] === 'undefined') window[FLAG] = false;
  } catch (e) { /* ignore */ }

  function blocked(kind, url) {
    try {
      console.error('[hty-inplay] 硬拦截整页导航', kind, url || '', (new Error()).stack);
    } catch (e2) { /* ignore */ }
  }

  function isAllowed() {
    try {
      return !!window[FLAG];
    } catch (e) {
      return false;
    }
  }

  try {
    var proto = Location.prototype;
    ['assign', 'replace'].forEach(function (name) {
      var orig = proto[name];
      if (typeof orig !== 'function' || orig.__htyNavPatched) return;
      var wrapped = function (url) {
        if (!isAllowed()) {
          blocked(name, url);
          return;
        }
        return orig.call(this, url);
      };
      wrapped.__htyNavPatched = true;
      proto[name] = wrapped;
    });

    var origReload = proto.reload;
    if (typeof origReload === 'function' && !origReload.__htyNavPatched) {
      var wrappedReload = function () {
        if (!isAllowed()) {
          blocked('reload');
          return;
        }
        return origReload.apply(this, arguments);
      };
      wrappedReload.__htyNavPatched = true;
      proto.reload = wrappedReload;
    }

    var desc = Object.getOwnPropertyDescriptor(proto, 'href');
    if (desc && desc.set && !desc.set.__htyNavPatched) {
      var origSet = desc.set;
      var origGet = desc.get;
      var newSet = function (v) {
        if (!isAllowed()) {
          blocked('href', v);
          return;
        }
        return origSet.call(this, v);
      };
      newSet.__htyNavPatched = true;
      Object.defineProperty(proto, 'href', {
        configurable: true,
        enumerable: !!desc.enumerable,
        get: origGet,
        set: newSet,
      });
    }
    console.log('[hty-inplay] document-start：整页导航硬拦截已启用（仅用户选场可放行）');
  } catch (e) {
    try {
      console.warn('[hty-inplay] document-start 硬拦截安装失败', e);
    } catch (e2) { /* ignore */ }
  }
})();

/* === bundled app (esbuild) === */
(() => {
  // src/config.js
  var SCRIPT_VERSION = "2.16.1";

  // src/storage-keys.js
  var KEYS = {
    KEEPALIVE_PHASE: "tm_hty_inplay_keepalive_phase",
    KEEPALIVE_RETURN: "tm_hty_inplay_keepalive_return",
    KEEPALIVE_MATCH_ID: "tm_hty_inplay_keepalive_match_id",
    KEEPALIVE_TARGET: "tm_hty_inplay_keepalive_target",
    KEEPALIVE_TARGET_HOME: "tm_hty_inplay_keepalive_home",
    KEEPALIVE_TARGET_AWAY: "tm_hty_inplay_keepalive_away",
    KEEPALIVE_ROTATE_INDEX: "tm_hty_inplay_rotate_index",
    NAV_HARD_AT: "tm_hty_nav_hard_at",
    NAV_BREAKER_LOG: "tm_hty_nav_breaker_log",
    NAV_BREAKER_UNTIL: "tm_hty_nav_breaker_until",
    LAST_INPLAY_NAV_AT: "tm_hty_inplay_last_nav_at",
    LAST_INPLAY_NAV_MATCH: "tm_hty_inplay_last_nav_match"
  };
  var KEEPALIVE_PHASE_ENTER = "enter-match";

  // src/keepalive.js
  function getKeepalivePhase() {
    try {
      const p = sessionStorage.getItem(KEYS.KEEPALIVE_PHASE) || "";
      if (p === "via-football" || p === "returning" || p === "going-list") {
        sessionStorage.setItem(KEYS.KEEPALIVE_PHASE, KEEPALIVE_PHASE_ENTER);
        return KEEPALIVE_PHASE_ENTER;
      }
      return p === KEEPALIVE_PHASE_ENTER ? KEEPALIVE_PHASE_ENTER : "";
    } catch (e) {
      return "";
    }
  }
  function setKeepalivePhaseEnter() {
    try {
      sessionStorage.setItem(KEYS.KEEPALIVE_PHASE, KEEPALIVE_PHASE_ENTER);
    } catch (e) {
    }
  }
  function clearKeepalivePhase() {
    try {
      sessionStorage.removeItem(KEYS.KEEPALIVE_PHASE);
    } catch (e) {
    }
  }
  function isKeepaliveEnterMatchPhase() {
    return getKeepalivePhase() === KEEPALIVE_PHASE_ENTER;
  }

  // src/login-nav-gate.js
  function createLoginNavGate(deps) {
    const { isLoginUiBusy, isLoggedIn } = deps;
    function shouldBlockMatchAutoNav() {
      if (isLoginUiBusy()) return true;
      try {
        if (!isLoggedIn()) return true;
      } catch (e) {
        return true;
      }
      return false;
    }
    return { shouldBlockMatchAutoNav };
  }

  // src/scheduler.js
  function createHeartbeatRunner(getTasks) {
    let inFlight = false;
    let tick = 0;
    async function runHeartbeatTask() {
      if (inFlight) return;
      inFlight = true;
      tick += 1;
      try {
        const tasks = typeof getTasks === "function" ? getTasks(tick) : getTasks;
        for (let i = 0; i < tasks.length; i++) {
          try {
            if (await tasks[i].run()) return;
          } catch (e) {
            console.warn("[hty-inplay] heartbeat task", tasks[i].name, e);
          }
        }
      } finally {
        inFlight = false;
      }
    }
    return {
      runHeartbeatTask,
      getTick: function() {
        return tick;
      }
    };
  }

  // src/nav-picker.js
  function createNavPicker(deps) {
    const {
      getNavigableInPlayMatches,
      getMatchRuleMeetCount,
      matchHasNavigablePendingWork,
      isUserManualMatchActive,
      shouldHoldCurrentMatch,
      isCurrentMatchEnded,
      parseKickoffMs,
      KICKOFF_NAV_PRIORITY_MS,
      getMatchId,
      saveRotateIndex
    } = deps;
    function pickRuleMeetNavigableMatch(excludeId, sourceList) {
      const ex = excludeId ? String(excludeId) : "";
      const cur = getMatchId() ? String(getMatchId()) : "";
      const candidates = getNavigableInPlayMatches(sourceList).filter(function(item) {
        const id = String(item.matchId);
        if (ex && id === ex) return false;
        return getMatchRuleMeetCount(item) > 0;
      });
      if (!candidates.length) return "";
      const pool = cur ? candidates.filter(function(item) {
        return String(item.matchId) !== cur;
      }) : candidates;
      const ranked = (pool.length ? pool : candidates).slice().sort(function(a, b) {
        const diff = getMatchRuleMeetCount(b) - getMatchRuleMeetCount(a);
        if (diff !== 0) return diff;
        const ka = parseKickoffMs(a.kickoffTime) || 0;
        const kb = parseKickoffMs(b.kickoffTime) || 0;
        if (ka !== kb) return ka - kb;
        return String(a.matchId).localeCompare(String(b.matchId));
      });
      const bestId = String(ranked[0].matchId);
      if (bestId !== cur) return bestId;
      return "";
    }
    function pickPreferredNavigableMatch(excludeId, currentId, sourceList) {
      const list = sourceList;
      const matchId = getMatchId();
      const cur = currentId != null ? String(currentId) : matchId ? String(matchId) : "";
      let ex = excludeId ? String(excludeId) : "";
      if (!ex && cur && String(cur) === String(matchId) && isCurrentMatchEnded()) {
        ex = cur;
      }
      const now = Date.now();
      const navigable = getNavigableInPlayMatches(list).filter(function(item) {
        const id = String(item.matchId);
        if (ex && id === ex) return false;
        return true;
      });
      if (!navigable.length) return "";
      if (cur && isUserManualMatchActive()) {
        for (let j = 0; j < navigable.length; j++) {
          if (String(navigable[j].matchId) === cur) return cur;
        }
      }
      if (cur && shouldHoldCurrentMatch()) {
        for (let j = 0; j < navigable.length; j++) {
          if (String(navigable[j].matchId) === cur) return cur;
        }
      }
      const ruleMeetId = pickRuleMeetNavigableMatch(ex, list);
      if (ruleMeetId && (!cur || String(ruleMeetId) !== cur)) return ruleMeetId;
      if (cur) {
        const curItem = navigable.find(function(item) {
          return String(item.matchId) === cur;
        });
        if (curItem && matchHasNavigablePendingWork(curItem)) {
          return cur;
        }
      }
      const recentKickoff = navigable.filter(function(item) {
        const km = parseKickoffMs(item.kickoffTime);
        return km && now >= km && now - km <= KICKOFF_NAV_PRIORITY_MS;
      }).sort(function(a, b) {
        return (parseKickoffMs(b.kickoffTime) || 0) - (parseKickoffMs(a.kickoffTime) || 0);
      });
      for (let i = 0; i < recentKickoff.length; i++) {
        const id = String(recentKickoff[i].matchId);
        if (cur && id === cur) continue;
        return id;
      }
      return String(navigable[0].matchId);
    }
    function pickRotatingInplayMatch(currentId, sourceList) {
      const ids = getNavigableInPlayMatches(sourceList).map(function(item) {
        return String(item.matchId);
      });
      if (!ids.length) return "";
      if (ids.length === 1) return ids[0];
      let pickIdx = 0;
      const cur = currentId ? String(currentId) : "";
      if (cur) {
        const curIdx = ids.indexOf(cur);
        pickIdx = curIdx >= 0 ? (curIdx + 1) % ids.length : 0;
      } else {
        try {
          const saved = parseInt(sessionStorage.getItem("tm_hty_inplay_rotate_index") || "0", 10);
          pickIdx = !isNaN(saved) && saved >= 0 && saved < ids.length ? saved : 0;
        } catch (e) {
          pickIdx = 0;
        }
      }
      const picked = ids[pickIdx];
      if (saveRotateIndex) saveRotateIndex(pickIdx + 1, ids.length);
      return picked;
    }
    function pickNextNavigableMatchId(excludeIds) {
      const ex = {};
      (excludeIds || []).forEach(function(id) {
        if (id != null && id !== "") ex[String(id)] = true;
      });
      const navigable = getNavigableInPlayMatches();
      for (let i = 0; i < navigable.length; i++) {
        const id = String(navigable[i].matchId);
        if (ex[id]) continue;
        return id;
      }
      return "";
    }
    function pickInplayNavigableMatch(excludeId, sourceList) {
      if (excludeId) {
        const next = pickRotatingInplayMatch(excludeId, sourceList);
        if (next && String(next) !== String(excludeId)) return next;
        const ids = getNavigableInPlayMatches(sourceList).map(function(item) {
          return String(item.matchId);
        });
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i]) !== String(excludeId)) return ids[i];
        }
        return "";
      }
      return pickPreferredNavigableMatch("", getMatchId(), sourceList);
    }
    return {
      pickRuleMeetNavigableMatch,
      pickPreferredNavigableMatch,
      pickRotatingInplayMatch,
      pickNextNavigableMatchId,
      pickInplayNavigableMatch
    };
  }

  // src/nav-policy.js
  function isForbiddenInplayListUrl(url) {
    try {
      const u = new URL(String(url || ""), window.location.origin);
      const p = String(u.pathname || "").replace(/\/$/, "") || "/";
      return /\/sportEvents\/inplay\/football$/i.test(p) || /\/sportEvents\/football\/inplay$/i.test(p);
    } catch (e) {
      const s = String(url || "");
      return /\/sportEvents\/inplay\/football\/?(\?|#|$)/i.test(s) && s.indexOf("/match/") < 0;
    }
  }

  // src/app.js
  function bootApp() {
    "use strict";
    const getKeepalivePhase2 = getKeepalivePhase;
    const setKeepalivePhaseEnter2 = setKeepalivePhaseEnter;
    const clearKeepalivePhase2 = clearKeepalivePhase;
    const isKeepaliveEnterMatchPhase2 = isKeepaliveEnterMatchPhase;
    const KEEPALIVE_PHASE_ENTER2 = KEEPALIVE_PHASE_ENTER;
    void KEYS;
    void SCRIPT_VERSION;
    const PANEL_ID = "tm-hty-inplay-quant-panel";
    const STYLE_ID = "tm-hty-inplay-quant-style";
    const SCRIPT_VERSION2 = (function() {
      try {
        if (typeof GM_info !== "undefined" && GM_info.script && GM_info.script.version) {
          return GM_info.script.version;
        }
      } catch (e) {
      }
      return "2.14.57";
    })();
    const BET_API_WAIT_MS = 25e3;
    const BET_RECOVERY_WINDOW_MS = 18e4;
    const BET_DEDUP_VERIFY_MISS_MS = 6e4;
    const PANEL_TEXT_MAX = 72;
    const ALERT_API = "http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/trigger";
    const ALERT_MATCHES_API = "http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/matches/active";
    const ALERT_RULE_API = "http://alert.socbeta.xyz/api/v1/soc/market/monitor/alert/rule";
    const TRACE_MATCH_BASE = "http://qisheng1.xyz/match/trace?match_id=";
    const STRATEGY_POLL_MS = 3e4;
    const STAKE_MODE_KEY = "tm_hty_inplay_stake_mode";
    const BET_DEDUP_KEY = "tm_hty_inplay_bet_dedup";
    const STAKE_MODE_OPTIONS = {
      strategy: { label: "\u7B56\u7565\u5B9E\u9645\u91D1\u989D", value: null, input: null },
      "2.5": { label: "2.5", value: 2.5, input: "2.5" },
      "1": { label: "1", value: 1, input: "1" },
      "0.3": { label: "0.3", value: 0.3, input: "0.3" }
    };
    const POLL_MS = 15e3;
    const HEARTBEAT_MS = 15e3;
    const HEARTBEAT_COLLAPSED_MS = 3e4;
    const HEARTBEAT_HIDDEN_MS = 6e4;
    const DOM_CHECK_DEBOUNCE_MS = 500;
    const RESCAN_MS = 3e4;
    const MATCH_SCAN_MS = 12e3;
    const MATCH_SCAN_PENDING_MS = 8e3;
    const RULE_MEET_SCAN_MS = 2e4;
    const RULE_MEET_NAV_COOLDOWN_MS = 1e4;
    const LOGIN_CACHE_MS = 3e3;
    const MAX_POLLS = 30;
    const PAGE_READY_SEL = '[data-testid="SportExhaustivePage"]';
    const MATCH_ENDED_HINT = "\u6B64\u8D5B\u4E8B\u5DF2\u7ED3\u675F";
    const LOCAL_ENDED_MATCHES_KEY = "tm_hty_inplay_local_ended_matches";
    const LOCAL_ENDED_TTL_MS = 216e5;
    const MATCH_ENDED_DIALOGS = [
      ["\u6B64\u8D5B\u4E8B\u5DF2\u7ED3\u675F"],
      ["\u5F53\u524D\u8D5B\u4E8B\u5DF2\u7ED3\u675F"],
      ["\u8D5B\u4E8B", "\u5DF2\u7ED3\u675F"],
      ["\u6BD4\u8D5B", "\u5DF2\u7ED3\u675F"]
    ];
    const MATCH_ENDED_PAGE_HINTS = [
      "\u5F53\u524D\u8D5B\u4E8B\u5DF2\u7ED3\u675F",
      "\u6B64\u8D5B\u4E8B\u5DF2\u7ED3\u675F"
    ];
    const MATCH_BLOCKED_DIALOGS = [
      ["\u6E29\u99A8\u63D0\u793A", "\u5F53\u524D\u65E0\u6CD5\u8FDB\u5165"],
      ["\u8D5B\u4E8B", "\u4E0D\u5B58\u5728"],
      ["\u6BD4\u8D5B", "\u4E0D\u5B58\u5728"]
    ];
    const IDLE_LOGIN_HINT = "\u95F2\u7F6E\u8FC7\u4E45";
    const AUTO_PAGE_NAV_ENABLED = false;
    function isStrategicMatchSwitchReason(reason) {
      const r = String(reason || "");
      if (!r) return false;
      if (isUserManualMatchPickReason(r)) return true;
      if (isRuleMeetNavReason(r)) return true;
      if (r.indexOf("\u8D5B\u4E8B\u5DF2\u7ED3\u675F") >= 0) return true;
      if (r.indexOf("\u6709\u8FDB\u884C\u4E2D\u8D5B\u4E8B\uFF0C\u5207\u6362\u6EDA\u7403") >= 0) return true;
      if (r.indexOf("\u6BD4\u8D5B\u5DF2\u5F00\u59CB\uFF0C\u8FDB\u5165\u6EDA\u7403") >= 0) return true;
      if (r.indexOf("\u8FDB\u5165\u7B56\u7565\u6EDA\u7403\u9875") >= 0) return true;
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
        try {
          window.__htyAllowPageNav = false;
        } catch (e) {
        }
      }
    }
    const KEEPALIVE_RETURN_URL_KEY = "tm_hty_inplay_keepalive_return";
    const KEEPALIVE_PHASE_KEY = "tm_hty_inplay_keepalive_phase";
    const KEEPALIVE_MATCH_ID_KEY = "tm_hty_inplay_keepalive_match_id";
    const KEEPALIVE_TARGET_MATCH_ID_KEY = "tm_hty_inplay_keepalive_target";
    const KEEPALIVE_TARGET_HOME_KEY = "tm_hty_inplay_keepalive_home";
    const KEEPALIVE_TARGET_AWAY_KEY = "tm_hty_inplay_keepalive_away";
    const KEEPALIVE_ROTATE_INDEX_KEY = "tm_hty_inplay_rotate_index";
    const SESSION_KEEPALIVE_MS = 3e5;
    const PAGE_KEEPALIVE_MIN_GAP_MS = 6e5;
    const MATCH_ROTATE_MS = 18e4;
    const MATCH_ENDED_SWITCH_COOLDOWN_MS = 12e3;
    const MATCH_BLOCKED_HANDLE_COOLDOWN_MS = 6e4;
    const INPLAY_NAV_COOLDOWN_MS = 45e3;
    const MATCH_NAV_STICK_MS = 9e4;
    const LAST_INPLAY_NAV_AT_KEY = "tm_hty_inplay_last_nav_at";
    const LAST_INPLAY_NAV_MATCH_KEY = "tm_hty_inplay_last_nav_match";
    const NAV_HARD_AT_KEY = "tm_hty_nav_hard_at";
    const NAV_HARD_COOLDOWN_MS2 = 45e3;
    const NAV_BREAKER_WINDOW_MS2 = 12e4;
    const NAV_BREAKER_MAX2 = 4;
    const NAV_BREAKER_PAUSE_MS2 = 18e4;
    const NAV_BREAKER_LOG_KEY = "tm_hty_nav_breaker_log";
    const NAV_BREAKER_UNTIL_KEY = "tm_hty_nav_breaker_until";
    const PAGE_RELOAD_COOLDOWN_MS = 12e4;
    const WAF_RECOVERY_COOLDOWN_MS = 3e5;
    const NAV_SUPPRESS_NO_INPLAY_MS = 12e4;
    const WAF_RECOVERY_KEY = "tm_hty_inplay_waf_recovery_at";
    const INPLAY_MATCH_WATCH_MS = 15e3;
    const TAB_TG_NAV_COOLDOWN_MS = 9e4;
    const TAB_TG_NAV_KEY = "tm_hty_inplay_tab_tg_nav_at";
    const USER_MANUAL_MATCH_GRACE_MS = 9e4;
    const USER_MANUAL_MATCH_ID_KEY = "tm_hty_inplay_manual_match_id";
    const USER_MANUAL_MATCH_AT_KEY = "tm_hty_inplay_manual_match_at";
    const USER_MANUAL_CATEGORY_TAB_KEY = "tm_hty_inplay_manual_tab";
    const USER_MANUAL_CATEGORY_TAB_AT_KEY = "tm_hty_inplay_manual_tab_at";
    const USER_MANUAL_CATEGORY_TAB_GRACE_MS = 18e5;
    const SCRIPT_TAB_SWITCH_GRACE_MS = 3e3;
    const KICKOFF_EARLY_MS = 6e4;
    const KICKOFF_NAV_PRIORITY_MS = 9e5;
    const REPORT_UPLOAD = {
      bet: "http://192.168.31.168:9999/bet/records/upload",
      strategy: "http://192.168.31.168:9999/bet/strategy/upload",
      site: "http://192.168.31.168:9999/site/url",
      wallet: "http://192.168.31.168:9999/bet/wallet/upload"
    };
    const REPORT_UPLOAD_TIMEOUT = 3e4;
    const REPORT_SYNC_DELAY_MS = 4e3;
    const ORDERS_UPLOAD_AFTER_BET_ATTEMPTS = 6;
    const ORDERS_UPLOAD_RETRY_GAP_MS = 3500;
    const ORDERS_UPLOAD_DELAYED_RETRY_MS = 45e3;
    const MATCH_BET_HISTORY_DAYS = 29;
    const REPORT_API_WAIT_MS = 12e3;
    const SESSION_API_KEEPALIVE_MS = 12e4;
    const SESSION_HEADER_FRESH_MS = 18e4;
    const SESSION_LOGIN_WATCH_MS = 15e3;
    const RELOGIN_COOLDOWN_MS = 12e3;
    const RELOGIN_COOLDOWN_URGENT_MS = 2e3;
    const LOGIN_NAV_LOCK_MS = 45e3;
    const LOGIN_NAV_SETTLE_MS = 8e3;
    const RELOGIN_WATCH_MS = 8e3;
    const SIMPLE_LOGIN_PIN = "0514";
    const ENSURE_MARKET_VIEW_GAP_MS = 6e4;
    const EXECUTED_STRATEGIES_KEY = "tm_hty_inplay_executed";
    const ABORTED_SYNCED_KEY = "tm_hty_inplay_aborted_synced";
    const BET_INFLIGHT_KEY = "tm_hty_inplay_bet_inflight";
    const BET_ATTEMPT_KEY = "tm_hty_inplay_bet_attempt";
    const HTY_API_CACHE_KEY = "tm_hty_inplay_api_cache";
    const HTY_ORDERS_CACHE_KEY = "tm_hty_inplay_orders_cache";
    const HTY_ORDERS_API_BASE_KEY = "tm_hty_inplay_orders_api_base";
    const ORDERS_REPORT_CACHE_MS = 18e4;
    const ORDERS_FETCH_ATTEMPT_MS = 6e3;
    const ORDERS_QUICK_FETCH_MS = 8e3;
    const ORDERS_CONFIRM_GM_MS = 1e4;
    const ORDERS_HOOK_PASSIVE_WAIT_MS = 2e3;
    const ORDERS_HOOK_QUICK_WAIT_MS = 1500;
    const ORDERS_UPLOAD_HOOK_WAIT_MS = 15e3;
    const ORDERS_DISCOVER_MAX_BASES = 4;
    const EXECUTED_STRATEGY_TTL_MS = 864e5;
    const STRATEGY_RULE_UPDATE_RETRIES = 3;
    let htyApiState = {
      apiBase: "",
      headers: {},
      lastCaptureAt: 0
    };
    let reportSyncing = false;
    let matchHistoryUploading = false;
    let betResultWaiter = null;
    let lastCapturedBetSuccess = null;
    let lastCapturedOrdersReport = null;
    let lastStrategyBetRecord = null;
    let lastAutoUploadMatchAt = 0;
    let delayedOrdersUploadTimer = null;
    const AUTO_UPLOAD_AFTER_DEDUP_GAP_MS = 45e3;
    const PAGE_HOOK_SRC = "hty-inplay-api-hook";
    const PAGE_USR_SRC = "hty-inplay-userscript";
    const MARKET_LABEL = {
      aou: "\u5BA2\u8FDB\u7403",
      hou: "\u4E3B\u8FDB\u7403",
      ah: "\u8BA9\u7403",
      ou: "\u5168\u573A\u8FDB\u7403",
      ou_1st: "\u4E0A\u534A\u8FDB\u7403",
      btts: "\u4E24\u961F\u8FDB\u7403",
      "1x2": "\u72EC\u8D62",
      ad: "\u72EC\u8D62"
    };
    const PLATE_ON_LABEL = {
      ov: "\u5927",
      ud: "\u5C0F",
      h: "\u4E3B",
      d: "\u5E73",
      a: "\u5BA2",
      y: "\u662F",
      n: "\u5426"
    };
    let navSuppressedUntil = 0;
    let lastBlockedHandleAt = 0;
    let lastPageReloadAt = 0;
    function getMatchIdFromUrl(href) {
      const url = String(href || window.location.href || "");
      const m = url.match(/\/sportEvents\/(?:inplay|incoming)\/football\/match\/(\d+)/i);
      return m ? m[1] : "";
    }
    function getMatchPageSegmentFromUrl(href) {
      const url = String(href || window.location.href || "");
      if (/\/sportEvents\/inplay\/football\/match\//i.test(url)) return "inplay";
      if (/\/sportEvents\/incoming\/football\/match\//i.test(url)) return "incoming";
      return "";
    }
    function isOnMatchBetPage() {
      return /\/sportEvents\/(?:inplay|incoming)\/football\/match\/\d+/i.test(window.location.pathname);
    }
    function resolveMatchUrlSegmentForId(id) {
      if (String(id) === String(getMatchIdFromUrl())) {
        const curSeg = getMatchPageSegmentFromUrl();
        if (curSeg) return curSeg;
      }
      const item = activeMatches.find(function(m) {
        return String(m.matchId) === String(id);
      });
      if (item) {
        const phase = resolveMatchPhase(item);
        if (phase === "IN_PLAY") return "inplay";
        if (phase === "NOT_STARTED") return "incoming";
      }
      if (String(id) === String(matchId)) {
        const seg = getMatchPageSegmentFromUrl();
        if (seg) return seg;
      }
      return "inplay";
    }
    function matchBetUrl(id, tab, segment) {
      const seg = segment || resolveMatchUrlSegmentForId(id);
      let url = window.location.origin + "/sportEvents/" + seg + "/football/match/" + id + "?type=market";
      if (tab) url += "&tab=" + encodeURIComponent(String(tab).toLowerCase());
      return url;
    }
    function normalizeMatchBetHref(href) {
      try {
        const u = new URL(String(href || window.location.href), window.location.origin);
        u.hash = "";
        u.searchParams.delete("_tm");
        if (!u.searchParams.get("tab")) u.searchParams.delete("tab");
        const pairs = [];
        u.searchParams.forEach(function(v, k) {
          pairs.push(k + "=" + v);
        });
        pairs.sort();
        return u.pathname + (pairs.length ? "?" + pairs.join("&") : "");
      } catch (e) {
        return String(href || "");
      }
    }
    function isAlreadyOnMatchBetUrl(id, tab) {
      if (!id || !isOnMatchBetPage()) return false;
      if (String(id) !== String(getMatchIdFromUrl())) return false;
      const target = matchBetUrl(id, tab);
      const cur = window.location.href.split("#")[0];
      return normalizeMatchBetHref(cur) === normalizeMatchBetHref(target);
    }
    function shouldSkipTabTgUrlNav() {
      try {
        const last = parseInt(sessionStorage.getItem(TAB_TG_NAV_KEY) || "0", 10);
        return !isNaN(last) && Date.now() - last < TAB_TG_NAV_COOLDOWN_MS;
      } catch (e) {
        return false;
      }
    }
    function markTabTgUrlNav() {
      try {
        sessionStorage.setItem(TAB_TG_NAV_KEY, String(Date.now()));
      } catch (e) {
      }
    }
    function isSiteAccessBlockedPage() {
      if (!document.body) return false;
      const text = (document.body.innerText || document.body.textContent || "").replace(/\s+/g, "");
      return text.indexOf("\u5DF2\u963B\u65AD") >= 0 && (text.indexOf("\u5B89\u5168\u5A01\u80C1") >= 0 || text.indexOf("\u6709\u5BB3") >= 0) || text.indexOf("\u8BBF\u95EE\u88AB\u963B\u65AD") >= 0 || text.indexOf("URL") >= 0 && text.indexOf("\u963B\u65AD") >= 0;
    }
    function recoverFromBlockedAccessPage() {
      if (!isSiteAccessBlockedPage()) return false;
      if (!AUTO_PAGE_NAV_ENABLED) {
        console.warn("[hty-inplay] WAF \u963B\u65AD\u9875\uFF1A\u81EA\u52A8\u6062\u590D\u8DF3\u8F6C\u5DF2\u7981\u7528\uFF0C\u8BF7\u624B\u52A8\u5237\u65B0");
        return false;
      }
      const href = window.location.href;
      let lastRecovery = 0;
      try {
        lastRecovery = parseInt(sessionStorage.getItem(WAF_RECOVERY_KEY) || "0", 10);
      } catch (e) {
      }
      if (!isNaN(lastRecovery) && Date.now() - lastRecovery < WAF_RECOVERY_COOLDOWN_MS) {
        console.warn("[hty-inplay] WAF \u963B\u65AD\u9759\u9ED8\u4E2D\uFF0C\u505C\u6B62\u81EA\u52A8\u91CD\u8BD5");
        navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + WAF_RECOVERY_COOLDOWN_MS);
        return false;
      }
      if (href.indexOf("_tm=") >= 0) {
        try {
          const url = new URL(href);
          url.searchParams.delete("_tm");
          const clean2 = url.toString();
          console.warn("[hty-inplay] WAF \u963B\u65AD\uFF0C\u53BB\u9664 _tm \u53C2\u6570\u540E\u91CD\u8BD5", clean2);
          try {
            sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now()));
          } catch (e) {
          }
          withPageNavAllow(function() {
            window.location.replace(clean2);
          });
          return true;
        } catch (e) {
          const clean2 = href.replace(/([?&])_tm=\d+(?=&|$)/, "$1").replace(/[?&]$/, "");
          console.warn("[hty-inplay] WAF \u963B\u65AD\uFF0C\u53BB\u9664 _tm \u53C2\u6570\u540E\u91CD\u8BD5", clean2);
          try {
            sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now()));
          } catch (e2) {
          }
          withPageNavAllow(function() {
            window.location.replace(clean2);
          });
          return true;
        }
      }
      const id = getMatchIdFromUrl();
      if (!id) return false;
      const seg = getMatchPageSegmentFromUrl(href) || resolveMatchUrlSegmentForId(id);
      let clean = window.location.origin + "/sportEvents/" + seg + "/football/match/" + id + "?type=market";
      const tabMatch = href.match(/[?&]tab=([^&#]+)/i);
      if (tabMatch && tabMatch[1]) clean += "&tab=" + encodeURIComponent(tabMatch[1]);
      if (clean === href.split("#")[0]) {
        console.warn("[hty-inplay] WAF \u963B\u65AD\u4E14 URL \u5DF2\u5E72\u51C0\uFF0C\u8FDB\u5165\u9759\u9ED8");
        try {
          sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now()));
        } catch (e) {
        }
        navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + WAF_RECOVERY_COOLDOWN_MS);
        return false;
      }
      console.warn("[hty-inplay] WAF \u963B\u65AD\uFF0C\u91CD\u8BD5\u5E72\u51C0 URL", clean);
      try {
        sessionStorage.setItem(WAF_RECOVERY_KEY, String(Date.now()));
      } catch (e) {
      }
      withPageNavAllow(function() {
        window.location.replace(clean);
      });
      return true;
    }
    function parseKickoffMs(kickoffTime) {
      const raw = String(kickoffTime || "").trim();
      if (!raw) return 0;
      let t = Date.parse(raw.replace(" ", "T"));
      if (!isNaN(t)) return t;
      t = Date.parse(raw.replace(/-/g, "/"));
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
        userManualMatchId = sessionStorage.getItem(USER_MANUAL_MATCH_ID_KEY) || "";
        userManualMatchAt = parseInt(sessionStorage.getItem(USER_MANUAL_MATCH_AT_KEY) || "0", 10);
        if (isNaN(userManualMatchAt)) userManualMatchAt = 0;
        if (userManualMatchId && userManualMatchAt && Date.now() - userManualMatchAt > USER_MANUAL_MATCH_GRACE_MS) {
          userManualMatchId = "";
          userManualMatchAt = 0;
        }
      } catch (e) {
      }
    })();
    (function initUserManualCategoryTabLock() {
      try {
        userManualCategoryTab = sessionStorage.getItem(USER_MANUAL_CATEGORY_TAB_KEY) || "";
        userManualCategoryTabAt = parseInt(sessionStorage.getItem(USER_MANUAL_CATEGORY_TAB_AT_KEY) || "0", 10);
        if (isNaN(userManualCategoryTabAt)) userManualCategoryTabAt = 0;
        if (userManualCategoryTab && userManualCategoryTabAt && Date.now() - userManualCategoryTabAt > USER_MANUAL_CATEGORY_TAB_GRACE_MS) {
          userManualCategoryTab = "";
          userManualCategoryTabAt = 0;
        }
      } catch (e) {
      }
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
    let betResult = "pending";
    let betStep = "\u7B49\u5F85\u9875\u9762\u52A0\u8F7D";
    let lastPanelKey = "";
    let strategyList = [];
    let strategyTrigger = "";
    let strategyStatus = "loading";
    let strategyError = "";
    let strategyTimer = null;
    let routeWatchTimer = null;
    let lastWatchedUrl = window.location.href;
    let lastWatchedCategoryTab = "";
    let scriptCategoryTabSwitchAt = 0;
    let userManualCategoryTabAt = 0;
    let userManualCategoryTab = "";
    let userManualMatchId = "";
    let userManualMatchAt = 0;
    let manualCategoryTabWatchReady = false;
    let activeMatches = [];
    let matchesStatus = "loading";
    let matchesError = "";
    let lastMatchesListKey = "";
    let lastStrategyListKey = "";
    let lastStrategyHitKey = "";
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
    let lastOddsSignature = "";
    let lastStatusPanelKey = "";
    let buttonMarketIndex = /* @__PURE__ */ new Map();
    let lastScanButtonCount = 0;
    let lastScanViewMode = "";
    let lastScanError = "";
    let matchRuleMeetCache = {};
    let matchPendingWorkCache = {};
    let lastRuleMeetScanAt = 0;
    let ruleMeetScanInFlight = false;
    let lastButtonSnapshot = /* @__PURE__ */ new Map();
    let endedMatchesCollapsed = true;
    let matchEndedHandling = false;
    let lastEndedSwitchAt = 0;
    let matchEndedWatchTimer = null;
    let stakeMode = loadStakeMode();
    let betDedupEnabled = loadBetDedupEnabled();
    function loadBetDedupEnabled() {
      try {
        const saved = localStorage.getItem(BET_DEDUP_KEY);
        if (saved === "0" || saved === "false") return false;
        if (saved === "1" || saved === "true") return true;
      } catch (e) {
      }
      return true;
    }
    function saveBetDedupEnabled(enabled) {
      try {
        localStorage.setItem(BET_DEDUP_KEY, enabled ? "1" : "0");
      } catch (e) {
      }
    }
    function isBetDedupEnabled() {
      return betDedupEnabled;
    }
    function getStrategyExecStatusFromApi(item) {
      const ignore = String(item && item.ruleMeetIgnore != null ? item.ruleMeetIgnore : "0");
      if (ignore === "2") return "executed";
      if (ignore === "1") return "aborted";
      if (ignore === "-1") return "confirming";
      const invalid = String(item && item.ruleMeetInvalid != null ? item.ruleMeetInvalid : "0");
      const invalidFlag = String(item && item.invalidFlag != null ? item.invalidFlag : "0");
      if (invalid === "1" || invalidFlag === "1") return "aborted";
      return "pending";
    }
    function needsAbortedStatusPut(item) {
      if (!item || !item.recHash) return false;
      if (getStrategyExecStatusFromApi(item) !== "aborted") return false;
      return String(item.ruleMeetIgnore != null ? item.ruleMeetIgnore : "0") !== "1";
    }
    function passesStrategyStatusGate(item) {
      if (item && item.recHash && typeof isStrategyLocallyExecuted === "function" && isStrategyLocallyExecuted(item.recHash)) {
        return false;
      }
      return getStrategyExecStatusFromApi(item) === "pending";
    }
    function hasPendingExecutableStrategies() {
      return strategyList.some(function(item) {
        return passesStrategyStatusGate(item);
      });
    }
    function isCurrentMatchNotStarted() {
      const item = getCurrentMatchItem();
      if (!item) return false;
      return resolveMatchPhase(item) === "NOT_STARTED";
    }
    function hasOtherInPlayMatchesThanCurrent() {
      const cur = matchId ? String(matchId) : "";
      return getSortedInPlayMatchIds().some(function(id) {
        return id !== cur;
      });
    }
    function isStrategyRuleMeet(item) {
      if (!item) return false;
      const meet = String(item.ruleMeet != null ? item.ruleMeet : "0");
      return meet === "1" || meet === "true";
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
    function countPendingWorkStrategies(strategies) {
      if (!Array.isArray(strategies)) return 0;
      let n = 0;
      for (let i = 0; i < strategies.length; i++) {
        const st = getStrategyExecStatusFromApi(strategies[i]);
        if (st === "pending" || st === "confirming") n += 1;
      }
      return n;
    }
    function rememberMatchPendingWork(id, pendingCount) {
      const mid = String(id || "");
      if (!mid) return;
      matchPendingWorkCache[mid] = {
        pendingCount: Number(pendingCount) || 0,
        known: true,
        at: Date.now()
      };
    }
    function syncCurrentMatchPendingWorkCache() {
      if (!matchId) return;
      rememberMatchPendingWork(matchId, countPendingWorkStrategies(strategyList));
    }
    function matchHasNavigablePendingWork(item) {
      if (!item || !item.matchId) return false;
      const id = String(item.matchId);
      if (isMatchLocallyEnded(id) || isMatchEndedPhase(item)) return false;
      if (id === String(matchId) && (strategyList.length || lastMatchScanAt || strategyStatus === "ok")) {
        return countPendingWorkStrategies(strategyList) > 0;
      }
      const cached = matchPendingWorkCache[id];
      if (cached && cached.known) return cached.pendingCount > 0;
      if (item.pendingRuleCount != null) return Number(item.pendingRuleCount) > 0;
      if (item.unfinishedRuleCount != null) return Number(item.unfinishedRuleCount) > 0;
      if (item.ruleCount != null && Number(item.ruleCount) === 0) return false;
      return true;
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
      const mid = String(targetId || matchId || "");
      lastInplayNavAt = now;
      try {
        sessionStorage.setItem(LAST_INPLAY_NAV_AT_KEY, String(now));
        if (mid) sessionStorage.setItem(LAST_INPLAY_NAV_MATCH_KEY, mid);
        sessionStorage.setItem(NAV_HARD_AT_KEY, String(now));
      } catch (e) {
      }
    }
    function readNavBreakerUntil() {
      try {
        return parseInt(sessionStorage.getItem(NAV_BREAKER_UNTIL_KEY) || "0", 10) || 0;
      } catch (e) {
        return 0;
      }
    }
    function readNavHardAt() {
      try {
        return parseInt(sessionStorage.getItem(NAV_HARD_AT_KEY) || "0", 10) || 0;
      } catch (e) {
        return 0;
      }
    }
    function pushNavBreakerLog(now) {
      let arr = [];
      try {
        arr = JSON.parse(sessionStorage.getItem(NAV_BREAKER_LOG_KEY) || "[]");
      } catch (e) {
        arr = [];
      }
      if (!Array.isArray(arr)) arr = [];
      arr.push(now);
      arr = arr.filter(function(t) {
        return now - Number(t) < NAV_BREAKER_WINDOW_MS2;
      });
      try {
        sessionStorage.setItem(NAV_BREAKER_LOG_KEY, JSON.stringify(arr));
      } catch (e) {
      }
      return arr;
    }
    function canPerformPageNavigation(reason) {
      const now = Date.now();
      const breakerUntil = readNavBreakerUntil();
      if (breakerUntil && now < breakerUntil) {
        console.warn("[hty-inplay] \u5BFC\u822A\u7194\u65AD\u4E2D\uFF0C\u8DF3\u8FC7", reason || "", Math.ceil((breakerUntil - now) / 1e3) + "s");
        return false;
      }
      const hardAt = Math.max(lastInplayNavAt || 0, readNavHardAt());
      if (hardAt && now - hardAt < NAV_HARD_COOLDOWN_MS2) {
        console.warn(
          "[hty-inplay] \u5BFC\u822A\u786C\u51B7\u5374\u4E2D\uFF0C\u8DF3\u8FC7",
          reason || "",
          Math.ceil((NAV_HARD_COOLDOWN_MS2 - (now - hardAt)) / 1e3) + "s"
        );
        return false;
      }
      return true;
    }
    function performPageNavigation(url, reason, matchIdForRecord) {
      if (!url) return false;
      if (!isAutoPageNavAllowed(reason)) {
        console.warn("[hty-inplay] \u81EA\u52A8\u6574\u9875\u8DF3\u8F6C\u5DF2\u7981\u7528\uFF0C\u8DF3\u8FC7", reason || "", url);
        return false;
      }
      url = rewriteAwayFromInplayList(url, reason);
      if (!url) return false;
      const dest = String(url).split("#")[0];
      const cur = String(window.location.href || "").split("#")[0];
      if (normalizeMatchBetHref(dest) === normalizeMatchBetHref(cur) || dest === cur) {
        return true;
      }
      if (!canPerformPageNavigation(reason)) return false;
      const now = Date.now();
      const log = pushNavBreakerLog(now);
      if (log.length >= NAV_BREAKER_MAX2) {
        const until = now + NAV_BREAKER_PAUSE_MS2;
        try {
          sessionStorage.setItem(NAV_BREAKER_UNTIL_KEY, String(until));
        } catch (e) {
        }
        console.error("[hty-inplay] \u5BFC\u822A\u8FC7\u4E8E\u9891\u7E41\uFF0C\u7194\u65AD", NAV_BREAKER_PAUSE_MS2 / 1e3 + "s", reason || "");
        navSuppressedUntil = Math.max(navSuppressedUntil, until);
        return false;
      }
      if (matchIdForRecord) recordInplayNavigation(matchIdForRecord);
      else {
        lastInplayNavAt = now;
        try {
          sessionStorage.setItem(NAV_HARD_AT_KEY, String(now));
        } catch (e) {
        }
      }
      console.log("[hty-inplay] \u9875\u9762\u8DF3\u8F6C", reason || "", dest);
      withPageNavAllow(function() {
        window.location.href = url;
      });
      return true;
    }
    function performPageReplace(url, reason, matchIdForRecord) {
      if (!url) return false;
      if (!isAutoPageNavAllowed(reason)) {
        console.warn("[hty-inplay] \u81EA\u52A8\u6574\u9875\u66FF\u6362\u5DF2\u7981\u7528\uFF0C\u8DF3\u8FC7", reason || "", url);
        return false;
      }
      url = rewriteAwayFromInplayList(url, reason);
      if (!url) return false;
      const dest = String(url).split("#")[0];
      const cur = String(window.location.href || "").split("#")[0];
      if (dest === cur) return true;
      if (!canPerformPageNavigation(reason)) return false;
      const now = Date.now();
      const log = pushNavBreakerLog(now);
      if (log.length >= NAV_BREAKER_MAX2) {
        const until = now + NAV_BREAKER_PAUSE_MS2;
        try {
          sessionStorage.setItem(NAV_BREAKER_UNTIL_KEY, String(until));
        } catch (e) {
        }
        console.error("[hty-inplay] \u5BFC\u822A\u8FC7\u4E8E\u9891\u7E41\uFF0C\u7194\u65AD", NAV_BREAKER_PAUSE_MS2 / 1e3 + "s", reason || "");
        navSuppressedUntil = Math.max(navSuppressedUntil, until);
        return false;
      }
      if (matchIdForRecord) recordInplayNavigation(matchIdForRecord);
      else {
        lastInplayNavAt = now;
        try {
          sessionStorage.setItem(NAV_HARD_AT_KEY, String(now));
        } catch (e) {
        }
      }
      console.log("[hty-inplay] \u9875\u9762\u66FF\u6362", reason || "", dest);
      withPageNavAllow(function() {
        window.location.replace(url);
      });
      return true;
    }
    function getPersistedInplayNavMatchId() {
      try {
        return sessionStorage.getItem(LAST_INPLAY_NAV_MATCH_KEY) || "";
      } catch (e) {
        return "";
      }
    }
    function isMatchNavStickActive() {
      if (!matchId || !lastInplayNavAt) return false;
      if (String(getPersistedInplayNavMatchId()) !== String(matchId)) return false;
      return Date.now() - lastInplayNavAt < MATCH_NAV_STICK_MS;
    }
    function canLeaveCurrentMatchForAutoSwitch() {
      if (!matchId) return true;
      if (isCurrentMatchEnded()) return true;
      if (isMatchNavStickActive() && !hasOtherRuleMeetMatchThanCurrent()) return false;
      if (!strategyList.length && !lastMatchScanAt) return false;
      return true;
    }
    function isHubSportEventsPage() {
      return isStrandedSportEventsPage() || isInplayListPage();
    }
    async function maybeEnterMatchFromHubPage(reason) {
      if (!AUTO_PAGE_NAV_ENABLED) return false;
      if (!isHubSportEventsPage()) return false;
      if (isUserManualMatchLockActive()) return false;
      if (placing || matchEndedHandling || shouldBlockMatchAutoNav()) return false;
      if (Date.now() - lastInplayNavAt < INPLAY_NAV_COOLDOWN_MS) return false;
      if (!hasNavigableInPlayMatches()) {
        setBetStep((isStrandedSportEventsPage() ? "\u603B\u89C8\u9875" : "\u5217\u8868\u9875") + "\uFF1A\u6682\u65E0\u8FDB\u884C\u4E2D\u4E14\u5F85\u6267\u884C\u7B56\u7565\u7684\u6BD4\u8D5B");
        renderPanel(true);
        return false;
      }
      if (!shouldBlockMatchAutoNav()) navSuppressedUntil = 0;
      let targetId = "";
      const savedId = resolveStrandedTargetMatchId();
      if (savedId && !isMatchLocallyEnded(savedId) && !isMatchIdEnded(savedId)) {
        const savedItem = activeMatches.find(function(m) {
          return String(m.matchId) === String(savedId);
        });
        if (savedItem && matchHasNavigablePendingWork(savedItem)) {
          targetId = savedId;
        }
      }
      if (!targetId) {
        targetId = pickPreferredNavigableMatch("", "", activeMatches);
      }
      if (!targetId) return false;
      console.log("[hty-inplay] \u603B\u89C8/\u5217\u8868\u81EA\u52A8\u8FDB\u5165", targetId, reason || "");
      setBetStep((reason || "\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B") + "\u2026");
      renderPanel(true);
      return navigateToInplayMatch(targetId, reason || "\u603B\u89C8\u9875\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B");
    }
    function getMatchRuleMeetCount(item) {
      if (!item || !item.matchId) return 0;
      const id = String(item.matchId);
      if (id === String(matchId)) return getCurrentMatchRuleMeetCountForNav();
      const entry = matchRuleMeetCache[id];
      return entry ? entry.meetCount : 0;
    }
    function hasOtherRuleMeetMatchThanCurrent() {
      const cur = matchId ? String(matchId) : "";
      const keys = Object.keys(matchRuleMeetCache);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === cur) continue;
        if (matchRuleMeetCache[keys[i]].meetCount > 0) return true;
      }
      return false;
    }
    function shouldHoldCurrentMatch() {
      if (isCurrentMatchEnded()) return false;
      if (placing) return true;
      if (targetOption) return true;
      if (strategyStates.some(function(st) {
        return st.actionable;
      })) return true;
      if (hasOtherRuleMeetMatchThanCurrent()) return false;
      if (strategyStates.some(function(st) {
        return st.hit && st.execStatus === "pending";
      })) return true;
      if (strategyStates.some(function(st) {
        return st.plateMatched && st.execStatus === "pending";
      })) return true;
      if (hasPendingExecutableStrategies() && lastScanButtonCount === 0) {
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
      if (strategyStates.some(function(st) {
        return st.actionable;
      })) return true;
      if (strategyStates.some(function(st) {
        return st.hit && st.execStatus === "pending";
      })) return true;
      return hasPendingExecutableStrategies();
    }
    function isScriptDedupStored(option, recHash) {
      if (recHash && isStrategyLocallyExecuted(recHash)) return true;
      if (!isBetDedupEnabled()) return false;
      if (option && option.testid && recHash) {
        const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
        const tidEntry = store["tid:" + option.testid];
        if (tidEntry && tidEntry.recHash === recHash) return true;
      }
      return false;
    }
    function isScriptDedupInflight(option, recHash) {
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
      return BET_ATTEMPT_KEY + "_" + (id || matchId || "");
    }
    function loadBetAttemptStore(id) {
      try {
        const raw = sessionStorage.getItem(betAttemptStorageKey(id));
        const store = raw ? JSON.parse(raw) : {};
        return store && typeof store === "object" ? store : {};
      } catch (e) {
        return {};
      }
    }
    function saveBetAttemptStore(store, id) {
      try {
        sessionStorage.setItem(betAttemptStorageKey(id), JSON.stringify(store || {}));
      } catch (e) {
      }
    }
    function pruneBetAttemptStore(store) {
      const now = Date.now();
      Object.keys(store).forEach(function(recHash) {
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
      if (!recHash) return;
      const store = pruneBetAttemptStore(loadBetAttemptStore());
      store[recHash] = {
        at: Date.now(),
        testid: option && option.testid ? String(option.testid) : "",
        stake: stake != null ? String(stake) : "",
        matchId: String(matchId || ""),
        label: option && option.label ? String(option.label) : "",
        bttsSubstitute: !!(option && option.bttsSubstitute),
        substitutedFrom: option && option.substitutedFrom ? option.substitutedFrom : null,
        market: option && option.market ? String(option.market) : "",
        side: option && option.side ? String(option.side) : ""
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
      return isScriptDedupStored(option, recHash) || isScriptDedupInflight(option, recHash);
    }
    function clearPausedDuplicateBetStep() {
      const step = String(betStep || "");
      if (!step) return;
      if (step.indexOf("\u8BF7\u52FF\u624B\u52A8\u91CD\u590D\u4E0B\u6CE8") < 0 && step.indexOf("\u6682\u505C\u91CD\u590D\u4E0B\u5355") < 0 && step.indexOf("\u7B49\u5F85\u8BA2\u5355\u5165\u5E93\u786E\u8BA4") < 0 && step.indexOf("\u7B49\u5F85\u8BA2\u5355\u786E\u8BA4") < 0 && step.indexOf("\u4E0B\u6CE8\u53EF\u80FD\u5DF2\u6210\u529F") < 0) {
        return;
      }
      if (betResult === "pending" || betResult === "skipped") {
        betResult = "pending";
      }
      setBetStep("\u7B49\u5F85\u7B56\u7565\u76D8\u53E3\u4E0E\u8D54\u7387\u8FBE\u6807");
    }
    function getPendingBetDedupMeta() {
      const inflight = getBetInFlight();
      if (inflight && inflight.recHash) {
        return {
          recHash: String(inflight.recHash),
          at: Number(inflight.at || 0) || Date.now(),
          source: "inflight"
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
          best = { recHash: String(keys[i]), at, source: "attempt" };
        }
      }
      return best;
    }
    function findOptionForRecHash(recHash) {
      if (!recHash) return null;
      const want = String(recHash);
      for (let i = 0; i < strategyStates.length; i++) {
        const st = strategyStates[i];
        if (!st || !st.strategy || String(st.strategy.recHash || "") !== want) continue;
        if (!st.testid && !st.plateMatched) continue;
        return buildTargetOption(st);
      }
      for (let j = 0; j < strategyList.length; j++) {
        const strategy = strategyList[j];
        if (!strategy || String(strategy.recHash || "") !== want) continue;
        const picked = pickStrategyButtonMatch(strategy, lastButtonSnapshot, 0);
        if (!picked) continue;
        return {
          testid: picked.testid,
          strategy,
          side: picked.parsed.side,
          market: picked.parsed.market,
          lineIndex: picked.parsed.lineIndex,
          displayLine: picked.extracted.lineText,
          label: formatTargetOptionLabel(strategy, false),
          minOdds: Number(strategy.plateOddsHit),
          odds: String(picked.extracted.odds),
          button: picked.btn,
          bttsSubstitute: false,
          substitutedFrom: null
        };
      }
      return null;
    }
    function clearPendingBetDedup(recHash, reason) {
      if (recHash) clearBetAttempt(recHash);
      clearBetInFlight();
      clearPausedDuplicateBetStep();
      if (reason) console.warn("[hty-inplay]", reason, recHash || "");
    }
    async function resolvePendingBetDedup() {
      if (placing || matchEndedHandling) return false;
      releaseStaleBetInflight();
      const meta = getPendingBetDedupMeta();
      if (!meta) {
        clearPausedDuplicateBetStep();
        return false;
      }
      let option = findOptionForRecHash(meta.recHash);
      if (!option && targetOption && targetOption.strategy && String(targetOption.strategy.recHash || "") === meta.recHash) {
        option = targetOption;
      }
      if (option) {
        const recovered = await tryRecoverSuccessfulBet(option, meta.at, {
          retries: 2,
          gapMs: 2e3
        });
        if (recovered) {
          lastStrategyBetRecord = recovered;
          placing = true;
          try {
            await finalizeBetSuccess(option, recovered, true, "\u9632\u91CD\u786E\u8BA4\u5DF2\u6709\u8BA2\u5355");
          } finally {
            placing = false;
          }
          return true;
        }
      }
      if (isBetSubmittedDrawerVisible()) {
        setBetStep("\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u4E0B\u6CE8\u62BD\u5C49\uFF0C\u7B49\u5F85\u786E\u8BA4\u2026");
        renderPanel(true);
        return false;
      }
      const age = Date.now() - meta.at;
      if (age >= BET_DEDUP_VERIFY_MISS_MS) {
        if (meta.recHash && isStrategyLocallyExecuted(meta.recHash)) {
          setBetResult("pending", "\u8D85\u65F6\u672A\u786E\u8BA4\u5230\u8BA2\u5355\uFF0C\u5DF2\u9501\u5B9A\u9632\u91CD");
          setBetStep("\u4E0B\u6CE8\u7ED3\u679C\u4E0D\u786E\u5B9A\uFF0C\u5DF2\u9501\u5B9A\u4E0D\u91CD\u8BD5\uFF08\u8BF7\u6838\u5BF9\u6295\u6CE8\u8BB0\u5F55\uFF09");
          renderPanel(true);
          return false;
        }
        clearPendingBetDedup(
          meta.recHash,
          "\u9632\u91CD\u67E5\u5355\u65E0\u7ED3\u679C\uFF0C\u6E05\u9664\u6807\u8BB0\u5141\u8BB8\u91CD\u8BD5 age=" + age + "ms"
        );
        setBetResult("pending", "\u4E0A\u6B21\u4E0B\u6CE8\u672A\u786E\u8BA4\u5230\u8BA2\u5355\uFF0C\u5C06\u91CD\u8BD5");
        setBetStep("\u4E0A\u6B21\u4E0B\u6CE8\u672A\u786E\u8BA4\u5230\u8BA2\u5355\uFF0C\u6761\u4EF6\u6EE1\u8DB3\u5C06\u91CD\u8BD5");
        renderPanel(true);
        return false;
      }
      const leftSec = Math.max(1, Math.ceil((BET_DEDUP_VERIFY_MISS_MS - age) / 1e3));
      setBetStep("\u9632\u91CD\u67E5\u5355\u4E2D\uFF08" + leftSec + "s \u65E0\u5355\u53EF\u91CD\u8BD5\uFF09\u2026");
      return false;
    }
    function isDefinitiveBetFailure(err) {
      const msg = String(err && err.message ? err.message : err || "");
      if (/超时|响应超时|等待超时/i.test(msg)) return false;
      return /赔率多次变动|提交未完成|投注按钮不可用|找不到投注|余额不足|键盘缺少|投注单未打开|未找到盘口|金额无效|投注金额无效/i.test(msg);
    }
    function isUncertainBetFailure(err) {
      if (isBetSubmittedDrawerVisible()) return true;
      const msg = String(err && err.message ? err.message : err || "");
      if (isDefinitiveBetFailure(err)) return false;
      return /超时|响应|订单|确认|网络|等待/i.test(msg);
    }
    function loadStakeMode() {
      try {
        const saved = localStorage.getItem(STAKE_MODE_KEY);
        if (saved === "1.0") {
          saveStakeMode("1");
          return "1";
        }
        if (saved && STAKE_MODE_OPTIONS[saved]) return saved;
      } catch (e) {
      }
      return "strategy";
    }
    function formatStakeKeypadInput(val) {
      if (val == null || val === "") return "";
      const raw = String(val).trim();
      const n = Number(raw);
      if (isNaN(n) || n <= 0) return raw;
      if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
      if (raw.indexOf(".") >= 0) {
        return raw.replace(/(\.\d*?)0+$/, "").replace(/\.$/, "");
      }
      return String(n).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    }
    function saveStakeMode(mode) {
      try {
        localStorage.setItem(STAKE_MODE_KEY, mode);
      } catch (e) {
      }
    }
    function stakeModeLabel(mode) {
      const opt = STAKE_MODE_OPTIONS[mode];
      return opt ? opt.label : String(mode);
    }
    function resolveBetStakeValue(option) {
      if (stakeMode === "strategy") {
        const strategy = option && option.strategy;
        const amt = strategy && strategy.plateAmount;
        const n = Number(amt);
        if (amt == null || amt === "" || isNaN(n) || n <= 0) {
          throw new Error("\u7B56\u7565\u5B9E\u9645\u91D1\u989D\u4E0D\u53EF\u7528");
        }
        return n;
      }
      return STAKE_MODE_OPTIONS[stakeMode].value;
    }
    function resolveBetStakeInput(option) {
      if (stakeMode === "strategy") {
        return formatStakeKeypadInput(resolveBetStakeValue(option));
      }
      return formatStakeKeypadInput(STAKE_MODE_OPTIONS[stakeMode].input);
    }
    function formatBetStakeSummary(option) {
      if (stakeMode === "strategy") {
        const strategy = option && option.strategy;
        if (strategy && strategy.plateAmount != null) {
          return "\u7B56\u7565\u91D1\u989D " + formatOddsDisplay(strategy.plateAmount);
        }
        return "\u7B56\u7565\u91D1\u989D \u2014";
      }
      return stakeModeLabel(stakeMode);
    }
    let lastEnsureMarketViewAt = 0;
    let lastEnsureMarketCategoryTabAt = 0;
    let lastInplayNavAt = 0;
    (function initPersistedInplayNavAt() {
      try {
        lastInplayNavAt = parseInt(sessionStorage.getItem(LAST_INPLAY_NAV_AT_KEY) || "0", 10) || 0;
      } catch (e) {
      }
    })();
    let lastPageKeepaliveAt = 0;
    let lastMatchRotateAt = 0;
    let inplayWatchTimer = null;
    let pageSwitchTimer = null;
    let listPageKeepAliveBooted = false;
    let listPageEnterMatchActive = false;
    let listPageEnterAttempts = 0;
    function isInplayListPage() {
      const path = window.location.pathname.replace(/\/$/, "");
      return /\/sportEvents\/inplay\/football$/i.test(path);
    }
    function isStrandedSportEventsPage() {
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      return path === "/sportEvents";
    }
    function isWrongSportSectionPage() {
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      if (!/^\/sportEvents\//i.test(path)) return false;
      if (/\/sportEvents\/(?:inplay|incoming)\/football/i.test(path)) return false;
      if (path === "/sportEvents") return false;
      return true;
    }
    function recoverFromWrongSportSection(reason) {
      if (!isWrongSportSectionPage()) return false;
      console.warn(
        "[hty-inplay] \u68C0\u6D4B\u5230\u975E\u8DB3\u7403\u7248\u5757\uFF0C\u81EA\u52A8\u62C9\u56DE\u5DF2\u7981\u7528",
        reason || "",
        window.location.pathname + window.location.search
      );
      return false;
    }
    let wrongSportGuardTimer = null;
    function ensureWrongSportSectionGuard() {
      if (wrongSportGuardTimer) return;
      wrongSportGuardTimer = setInterval(function() {
        if (!isWrongSportSectionPage()) return;
        console.warn("[hty-inplay] \u4ECD\u5728\u975E\u8DB3\u7403\u7248\u5757\uFF08\u4E0D\u81EA\u52A8\u8DF3\u8F6C\uFF09", window.location.pathname);
      }, 3e4);
    }
    function resolveStrandedTargetMatchId() {
      if (isUserManualMatchLockActive()) return String(userManualMatchId);
      const saved = sessionStorage.getItem(KEEPALIVE_TARGET_MATCH_ID_KEY) || sessionStorage.getItem(KEEPALIVE_MATCH_ID_KEY) || "";
      if (saved) return String(saved);
      try {
        const returnUrl = sessionStorage.getItem(KEEPALIVE_RETURN_URL_KEY) || "";
        const m = returnUrl.match(/\/match\/(\d+)/i);
        if (m) return m[1];
      } catch (e) {
      }
      return "";
    }
    function bootStrandedSportEventsPage() {
      void ensureStrandedSportEventsBoot();
    }
    async function ensureStrandedSportEventsBoot() {
      if (!isStrandedSportEventsPage()) return;
      if (!document.body) {
        document.addEventListener("DOMContentLoaded", function() {
          void ensureStrandedSportEventsBoot();
        }, { once: true });
        return;
      }
      matchId = "";
      if (!document.getElementById(PANEL_ID)) {
        createPanel();
        if (!document.getElementById(PANEL_ID)) return;
      }
      if (!started) {
        started = true;
        betStep = "\u8D5B\u4E8B\u603B\u89C8\u9875\uFF1A\u70B9\u51FB\u7B56\u7565\u8D5B\u4E8B\u53EF\u8DF3\u8F6C";
        betResult = "pending";
        scheduleLoginWatch();
        scheduleHeartbeat();
        setInterval(function() {
          loginCache.ts = 0;
          if (isLoggedIn() || reloginInProgress) return;
          tryAutoRelogin({ lite: true }).catch(function(e) {
            console.warn("[hty-inplay] \u603B\u89C8\u9875\u81EA\u52A8\u767B\u5F55", e);
          });
        }, RELOGIN_WATCH_MS);
      }
      setupRouteWatcher();
      if (matchesStatus === "loading" || !activeMatches.length) {
        try {
          await loadActiveMatches(false);
          await scanAllMatchesRuleMeet(true);
          renderPanel(true);
        } catch (e) {
          console.warn("[hty-inplay] \u603B\u89C8\u9875\u52A0\u8F7D\u8D5B\u4E8B\u5931\u8D25", e);
        }
      } else {
        renderPanel(true);
      }
      if (await maybeEnterMatchFromHubPage("\u603B\u89C8\u9875\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B")) return;
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
          if (u.searchParams.has("_tm")) {
            u.searchParams.delete("_tm");
            href = u.toString();
          }
        } catch (e) {
        }
        sessionStorage.setItem(KEEPALIVE_RETURN_URL_KEY, href);
        sessionStorage.setItem(KEEPALIVE_MATCH_ID_KEY, String(matchId));
      } catch (e) {
      }
    }
    function recoverStrandedFromMatchContext() {
      if (isUserManualMatchLockActive()) {
        const tab2 = getActiveMarketCategoryTab();
        const tabArg2 = tab2 && tab2 !== "all" ? tab2 : null;
        if (!matchId || String(matchId) !== String(userManualMatchId)) {
          console.warn("[hty-inplay] \u504F\u79BB\u7528\u6237\u6240\u9009\u8D5B\u4E8B\uFF0C\u8DF3\u56DE", userManualMatchId);
          gotoInplayMatch(userManualMatchId, tabArg2);
          return true;
        }
      }
      if (!matchId) return false;
      const tab = getActiveMarketCategoryTab();
      const tabArg = tab && tab !== "all" ? tab : null;
      console.warn("[hty-inplay] URL\u504F\u79BB\u8D5B\u4E8B\u9875\uFF0C\u8DF3\u56DE", matchId, tab || "all");
      if (typeof setBetStep === "function") {
        setBetStep("\u9875\u9762\u504F\u79BB\uFF0C\u8FD4\u56DE\u8D5B\u4E8B\u2026");
        if (typeof renderPanel === "function") renderPanel(true);
      }
      gotoInplayMatch(matchId, tabArg);
      return true;
    }
    function inplayListUrl() {
      console.error("[hty-inplay] inplayListUrl \u5DF2\u7981\u7528\uFF1A\u7981\u6B62\u8DF3\u8F6C /sportEvents/inplay/football");
      return "";
    }
    function isForbiddenInplayListUrl2(url) {
      return isForbiddenInplayListUrl(url);
    }
    function rewriteAwayFromInplayList(url, reason) {
      if (!isForbiddenInplayListUrl2(url)) return url;
      const mid = resolveStrandedTargetMatchId() || matchId || getMatchIdFromUrl() || "";
      if (mid) {
        const fixed = inplayMatchUrl(mid);
        console.warn("[hty-inplay] \u62E6\u622A\u6EDA\u7403\u5217\u8868\u8DF3\u8F6C\uFF0C\u6539\u4E3A\u6BD4\u8D5B\u9875", reason || "", url, "->", fixed);
        return fixed;
      }
      console.error("[hty-inplay] \u62E6\u622A\u6EDA\u7403\u5217\u8868\u8DF3\u8F6C\u4E14\u65E0\u76EE\u6807\u6BD4\u8D5B\uFF0C\u53D6\u6D88\u5BFC\u822A", reason || "", url);
      return "";
    }
    function findSidebarFootballLink() {
      const anchors = document.querySelectorAll('a[href*="/football/match/"]');
      for (let i = 0; i < anchors.length; i++) {
        const href = anchors[i].getAttribute("href") || "";
        if (isForbiddenInplayListUrl2(href)) continue;
        if (/\/sportEvents\/(?:inplay|incoming)\/football\/match\/\d+/i.test(href) && isElementVisible(anchors[i])) {
          return anchors[i];
        }
      }
      return null;
    }
    function clickSidebarFootball() {
      if (!AUTO_PAGE_NAV_ENABLED) {
        console.warn("[hty-inplay] \u4FA7\u680F\u70B9\u51FB\u8FDB\u573A\u5DF2\u7981\u7528");
        return false;
      }
      const targetId = resolveStrandedTargetMatchId();
      if (targetId) {
        console.warn("[hty-inplay] \u4FDD\u6D3B\uFF1A\u4FA7\u680F\u6539\u76F4\u8DF3\u6BD4\u8D5B", targetId);
        try {
          sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
        } catch (e) {
        }
        return performPageNavigation(inplayMatchUrl(targetId), "\u4FA7\u680F\u76F4\u8DF3\u6BD4\u8D5B", targetId);
      }
      const el = findSidebarFootballLink();
      if (el) {
        const href = String(el.getAttribute && el.getAttribute("href") || el.href || "");
        if (href && !isForbiddenInplayListUrl2(href) && href.indexOf("/match/") >= 0) {
          console.log("[hty-inplay] \u4FDD\u6D3B\uFF1A\u70B9\u51FB\u4FA7\u8FB9\u680F\u6BD4\u8D5B\u94FE\u63A5", href);
          safeClick(el);
          return true;
        }
      }
      console.warn("[hty-inplay] \u4FDD\u6D3B\uFF1A\u65E0\u76EE\u6807\u6BD4\u8D5B\uFF0C\u7981\u6B62\u8DF3\u8F6C\u6EDA\u7403\u5217\u8868");
      return false;
    }
    function clickMatchOnInplayList(targetId, home, away) {
      if (!AUTO_PAGE_NAV_ENABLED) return false;
      if (isLoginUiBusy()) {
        console.log("[hty-inplay] \u767B\u5F55\u5F39\u7A97\u4E2D\uFF0C\u6682\u7F13\u5217\u8868\u70B9\u51FB\u8FDB\u573A", targetId || "");
        return false;
      }
      if (targetId) {
        const links2 = document.querySelectorAll(
          'a[href*="/sportEvents/inplay/football/match/' + targetId + '"], a[href*="/sportEvents/incoming/football/match/' + targetId + '"], [href*="/sportEvents/inplay/football/match/' + targetId + '"], [href*="/sportEvents/incoming/football/match/' + targetId + '"]'
        );
        for (let i = 0; i < links2.length; i++) {
          const el = links2[i].closest("a") || links2[i];
          if (isElementVisible(el)) {
            safeClick(el);
            return true;
          }
        }
      }
      if (home && away) {
        const nodes = document.querySelectorAll('a, [role="button"], li, div');
        for (let i = 0; i < nodes.length; i++) {
          const text = nodes[i].textContent || "";
          if (text.indexOf(home) < 0 || text.indexOf(away) < 0) continue;
          const clickEl = nodes[i].closest("a") || nodes[i].querySelector("a") || nodes[i];
          if (!clickEl || !isElementVisible(clickEl)) continue;
          const href = String(clickEl.href || clickEl.getAttribute("href") || "");
          if (href && href.indexOf("/football/match/") < 0) continue;
          safeClick(clickEl);
          return true;
        }
      }
      const links = document.querySelectorAll(
        'a[href*="/sportEvents/inplay/football/match/"], a[href*="/sportEvents/incoming/football/match/"]'
      );
      for (let i = 0; i < links.length; i++) {
        if (!isElementVisible(links[i])) continue;
        const href = links[i].href || links[i].getAttribute("href") || "";
        if (!targetId || href.indexOf("/match/" + targetId) >= 0) {
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
        gotoInplayMatchDirect(fallbackId, null, reason || "\u5217\u8868\u9875\u76F4\u8DF3\u6BD4\u8D5B", { force: true });
      }
    }
    function bootListPageEnterMatch() {
      if (!AUTO_PAGE_NAV_ENABLED) {
        console.log("[hty-inplay] \u5217\u8868\u81EA\u52A8\u8FDB\u573A\u5DF2\u7981\u7528");
        return;
      }
      if (listPageEnterMatchActive) return;
      if (!canPerformPageNavigation("list-enter-boot")) return;
      listPageEnterMatchActive = true;
      listPageEnterAttempts = 0;
      const targetId = (isUserManualMatchLockActive() ? userManualMatchId : "") || sessionStorage.getItem(KEEPALIVE_TARGET_MATCH_ID_KEY) || sessionStorage.getItem(KEEPALIVE_MATCH_ID_KEY) || resolveStrandedTargetMatchId() || "";
      const home = sessionStorage.getItem(KEEPALIVE_TARGET_HOME_KEY) || "";
      const away = sessionStorage.getItem(KEEPALIVE_TARGET_AWAY_KEY) || "";
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
        if (!canPerformPageNavigation("list-enter-try")) {
          listPageEnterMatchActive = false;
          listPageEnterAttempts = 0;
          return;
        }
        listPageEnterAttempts += 1;
        if (listPageEnterAttempts > maxAttempts) {
          console.warn("[hty-inplay] \u5217\u8868\u9875\u8FDB\u5165\u6BD4\u8D5B\u8D85\u65F6", targetId);
          finishListPageEnterMatch(targetId, "\u5217\u8868\u9875\u8D85\u65F6\u76F4\u8DF3");
          return;
        }
        if (countInplayListMatchLinks() > 0) {
          await humanDelay(600, 1200);
          if (clickMatchOnInplayList(targetId, home, away)) {
            console.log("[hty-inplay] \u5217\u8868\u9875\u5DF2\u70B9\u51FB\u6BD4\u8D5B", targetId);
            listPageEnterMatchActive = false;
            listPageEnterAttempts = 0;
            try {
              sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
            } catch (e) {
            }
            return;
          }
        }
        setTimeout(tryClick, 2e3);
      }
      if (document.body) tryClick();
      else document.addEventListener("DOMContentLoaded", tryClick);
    }
    async function ensureListPageBoot() {
      if (!isInplayListPage()) return;
      if (!document.body) {
        document.addEventListener("DOMContentLoaded", function() {
          void ensureListPageBoot();
        }, { once: true });
        return;
      }
      matchId = "";
      if (!document.getElementById(PANEL_ID)) {
        createPanel();
        if (!document.getElementById(PANEL_ID)) return;
      }
      if (!started) {
        started = true;
        betStep = "\u6EDA\u7403\u5217\u8868\u9875\uFF0C\u51C6\u5907\u8FDB\u5165\u6BD4\u8D5B\u2026";
        betResult = "pending";
        scheduleLoginWatch();
      }
      setupRouteWatcher();
      bootListPageKeepAlive();
      if (matchesStatus === "loading" || !activeMatches.length) {
        try {
          await loadActiveMatches(false);
          renderPanel(true);
        } catch (e) {
          console.warn("[hty-inplay] \u5217\u8868\u9875\u52A0\u8F7D\u8D5B\u4E8B\u5931\u8D25", e);
        }
      } else {
        renderPanel(true);
      }
    }
    function bootListPageKeepAlive() {
      if (listPageKeepAliveBooted) return;
      listPageKeepAliveBooted = true;
      function checkListIdleModal() {
        if (!document.body) return;
        if (!findVisibleDialogContaining([IDLE_LOGIN_HINT, "\u91CD\u65B0\u767B\u5F55"]) && !findVisibleDialogContaining(["\u6E29\u99A8\u63D0\u793A", IDLE_LOGIN_HINT])) {
          return;
        }
        const btn = findModalConfirmButton(["\u6E29\u99A8\u63D0\u793A", IDLE_LOGIN_HINT]) || findModalConfirmButton([IDLE_LOGIN_HINT, "\u91CD\u65B0\u767B\u5F55"]);
        if (btn) btn.click();
        else {
          const nodes = document.querySelectorAll('button, [role="button"]');
          for (let i = 0; i < nodes.length; i++) {
            const label = (nodes[i].textContent || "").replace(/\s+/g, "");
            if (label === "\u786E\u5B9A") {
              nodes[i].click();
              break;
            }
          }
        }
        console.warn("[hty-inplay] \u5217\u8868\u9875\u68C0\u6D4B\u5230\u95F2\u7F6E\u767B\u51FA\u5F39\u7A97");
      }
      setInterval(checkListIdleModal, 2e3);
      document.addEventListener("DOMContentLoaded", checkListIdleModal);
      setInterval(function() {
        loginCache.ts = 0;
        if (isLoggedIn() || reloginInProgress) return;
        tryAutoRelogin({ lite: true }).catch(function(e) {
          console.warn("[hty-inplay] \u5217\u8868\u9875\u81EA\u52A8\u767B\u5F55", e);
        });
      }, RELOGIN_WATCH_MS);
      const phase = getKeepalivePhase2();
      if (phase === KEEPALIVE_PHASE_ENTER2) {
        console.log("[hty-inplay] \u5217\u8868\u9875\u4FDD\u6D3B\uFF1A\u7B49\u5F85\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B");
        bootListPageEnterMatch();
      }
      async function listPageNavigateToKickoffMatch() {
        if (!AUTO_PAGE_NAV_ENABLED) return;
        if (!isInplayListPage()) return;
        if (isLoginUiBusy()) return;
        if (listPageEnterMatchActive) return;
        if (!canPerformPageNavigation("list-kickoff")) return;
        try {
          await loadActiveMatches(true);
          await scanAllMatchesRuleMeet(true);
          renderPanel(true);
          const navigable = getNavigableInPlayMatches();
          if (!navigable.length) {
            setBetStep("\u5217\u8868\u9875\uFF1A\u6682\u65E0\u8FDB\u884C\u4E2D\u4E14\u5F85\u6267\u884C\u7B56\u7565\u7684\u6BD4\u8D5B");
            renderPanel(true);
            return;
          }
          if (!shouldBlockMatchAutoNav() && !isUserManualMatchLockActive() && hasNavigableInPlayMatches()) {
            if (navSuppressedUntil && Date.now() < navSuppressedUntil) {
              const remain = navSuppressedUntil - Date.now();
              if (remain <= NAV_SUPPRESS_NO_INPLAY_MS) navSuppressedUntil = 0;
            }
          }
          const savedId = resolveStrandedTargetMatchId();
          let targetId = "";
          if (savedId && !isMatchLocallyEnded(savedId)) {
            const savedItem = activeMatches.find(function(m) {
              return String(m.matchId) === String(savedId);
            });
            if (!savedItem || matchHasNavigablePendingWork(savedItem)) {
              targetId = savedId;
            }
          }
          if (!targetId) {
            targetId = pickPreferredNavigableMatch("", "", activeMatches);
          }
          if (!targetId) return;
          if (isKeepaliveEnterMatchPhase2()) {
            if (!listPageEnterMatchActive) bootListPageEnterMatch();
            return;
          }
          console.log("[hty-inplay] \u5217\u8868\u9875\uFF1A\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B", targetId);
          if (clickMatchOnInplayList(targetId, "", "")) return;
          gotoInplayMatchDirect(targetId, null, "\u5217\u8868\u9875\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B", { force: true });
        } catch (e) {
          console.warn("[hty-inplay] \u5217\u8868\u9875\u68C0\u6D4B\u5F00\u8D5B\u5931\u8D25", e);
        }
      }
      setInterval(listPageNavigateToKickoffMatch, Math.max(INPLAY_MATCH_WATCH_MS, 3e4));
      setTimeout(function() {
        if (document.body) listPageNavigateToKickoffMatch();
      }, 2500);
    }
    function rand(min, max) {
      return min + Math.random() * (max - min);
    }
    function sleep(ms) {
      return new Promise(function(resolve) {
        setTimeout(resolve, ms);
      });
    }
    function humanDelay(minMs, maxMs) {
      return sleep(rand(minMs, maxMs));
    }
    function waitFor(getter, timeoutMs, intervalMs) {
      const timeout = timeoutMs || 15e3;
      const interval = intervalMs || 300;
      const start2 = Date.now();
      return new Promise(function(resolve, reject) {
        function tick() {
          let value = null;
          try {
            value = getter();
          } catch (e) {
          }
          if (value) {
            resolve(value);
            return;
          }
          if (Date.now() - start2 >= timeout) {
            reject(new Error("\u7B49\u5F85\u8D85\u65F6"));
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
        console.warn(
          "[hty-inplay] \u62E6\u622A\u7A0B\u5E8F\u5316\u5BFC\u822A\u70B9\u51FB",
          el.getAttribute && (el.getAttribute("href") || el.getAttribute("data-testid")) || (el.textContent || "").slice(0, 40)
        );
        return false;
      }
      el.click();
      return true;
    }
    function shouldBlockProgrammaticNavClick(el) {
      if (AUTO_PAGE_NAV_ENABLED) return false;
      if (!el || !el.closest) return false;
      const a = el.closest("a[href]");
      if (!a) return false;
      const href = String(a.getAttribute("href") || "").trim();
      if (!href || href === "#" || href.indexOf("javascript:") === 0) return false;
      if (a.closest && a.closest("#" + PANEL_ID)) return false;
      try {
        const u = new URL(href, window.location.origin);
        if (u.origin !== window.location.origin) return true;
        const path = String(u.pathname || "");
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
        console.warn("[hty-inplay] \u62E6\u622A robust \u5BFC\u822A\u70B9\u51FB");
        return false;
      }
      try {
        el.scrollIntoView({ block: "center", behavior: "auto" });
      } catch (e) {
      }
      const opts = { bubbles: true, cancelable: true, view: window };
      try {
        if (typeof PointerEvent === "function") {
          el.dispatchEvent(new PointerEvent("pointerdown", opts));
          el.dispatchEvent(new PointerEvent("pointerup", opts));
        }
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        if (!el.disabled) el.click();
      } catch (e) {
        try {
          if (!el.disabled) el.click();
        } catch (e2) {
        }
      }
      return true;
    }
    async function humanScrollTo(el) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= 80 && rect.bottom <= window.innerHeight - 80;
      if (!inView) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        await humanDelay(300, 700);
      } else {
        await humanDelay(150, 400);
      }
    }
    function getSportCartRoot() {
      return document.querySelector('[data-testid="SportCart"]') || document.querySelector('[data-testid="overlay-container-cart-overlay-task-id"]');
    }
    function isCartOpen() {
      const root = getSportCartRoot();
      return isElementVisible(root);
    }
    async function ensureBetCartVisible() {
      if (!isCartOpen()) return false;
      const cart = getSportCartRoot();
      if (cart && isElementVisible(cart)) {
        try {
          cart.scrollIntoView({ block: "nearest", behavior: "auto" });
        } catch (e) {
        }
        await humanDelay(200, 400);
      }
      await ensureOddsChangeAccepted();
      return isCartOpen();
    }
    function findKeypadButton(cart, key) {
      if (!cart) return null;
      const buttons = cart.querySelectorAll("button");
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        if ((btn.textContent || "").trim() === key && !btn.disabled) return btn;
      }
      return null;
    }
    async function focusBetInput(cart) {
      const inputArea = cart && cart.querySelector('[data-testid="SportCartBetInput"]') || document.querySelector('[data-testid="SportCartBetInput"]');
      if (inputArea) safeClick(inputArea);
      await humanDelay(200, 450);
    }
    async function enterAmountViaKeypad(amount) {
      const cart = getSportCartRoot();
      if (!cart) throw new Error("\u6295\u6CE8\u5355\u672A\u6253\u5F00");
      await ensureOddsChangeAccepted();
      await focusBetInput(cart);
      const text = formatStakeKeypadInput(amount);
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const btn = findKeypadButton(cart, ch);
        if (!btn) throw new Error("\u952E\u76D8\u7F3A\u5C11\u6309\u952E " + ch);
        setBetStep("\u70B9\u51FB\u952E\u76D8 " + ch);
        safeClick(btn);
        await humanDelay(180, 380);
      }
    }
    function findBetActionButton() {
      const byTestId = document.querySelector('[data-testid="sport-cart-bet-button"]') || document.querySelector('[data-testid="sport-cart-submit-bet-btn"]');
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
        const isAccept = t.indexOf("\u63A5\u53D7\u66F4\u6539") >= 0 || t.indexOf("\u63A5\u53D7\u53D8\u66F4") >= 0 || /acceptchange/i.test(t);
        const isBet = t === "\u6295\u6CE8" || t.indexOf("\u786E\u8BA4\u6295\u6CE8") >= 0 || t.indexOf("\u7ACB\u5373\u6295\u6CE8") >= 0;
        if (!isAccept && !isBet) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 24) continue;
        const score = (isAccept ? 1e6 : 0) + rect.top * 10 + rect.width * rect.height;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
      return best;
    }
    function buttonText(btn) {
      return (btn && btn.textContent ? btn.textContent : "").trim();
    }
    function isAcceptChangesBtn(btn) {
      const t = normalizeHintText(buttonText(btn));
      if (!t) return false;
      if (t.indexOf("\u5DF2\u63D0\u4EA4") >= 0) return false;
      return t.indexOf("\u63A5\u53D7\u66F4\u6539") >= 0 || t.indexOf("\u63A5\u53D7\u53D8\u66F4") >= 0 || t.indexOf("\u63A5\u53D7") >= 0 && t.indexOf("\u66F4\u6539") >= 0 || /accept\s*change/i.test(buttonText(btn) || "");
    }
    function needsAcceptOddsChange() {
      const actionBtn = findBetActionButton();
      if (actionBtn && isAcceptChangesBtn(actionBtn)) return true;
      return isOddsChangedModalVisible();
    }
    async function clickAcceptOddsChangeButton() {
      let actionBtn = findBetActionButton();
      if (actionBtn && isAcceptChangesBtn(actionBtn) && isElementVisible(actionBtn)) {
        setBetStep("\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u63A5\u53D7\u66F4\u6539\u2026");
        renderPanel(true);
        await humanScrollTo(actionBtn);
        robustClick(actionBtn);
        await humanDelay(600, 1100);
        return true;
      }
      const cart = getSportCartRoot();
      if (cart && textHasOddsChangeHint(cart.textContent || "")) {
        const inCart = findConfirmInRoot(cart, ODDS_CHANGE_CONFIRM_LABELS);
        if (inCart && isElementVisible(inCart)) {
          setBetStep("\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u63A5\u53D7\u66F4\u6539\u2026");
          renderPanel(true);
          await humanScrollTo(inCart);
          robustClick(inCart);
          await humanDelay(600, 1100);
          return true;
        }
      }
      const fallback = findOddsChangedConfirmButton();
      if (fallback && isElementVisible(fallback)) {
        setBetStep("\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u63A5\u53D7\u66F4\u6539\u2026");
        renderPanel(true);
        await humanScrollTo(fallback);
        robustClick(fallback);
        await humanDelay(600, 1100);
        return true;
      }
      return false;
    }
    function isInsufficientBalanceText(text) {
      return /insufficient|余额不足|余额|deposit|充值/i.test(text || "");
    }
    async function submitBetSlip(stakeInput, onAcceptOddsChange) {
      for (let attempt = 0; attempt < 8; attempt++) {
        if (!isCartOpen()) {
          const opened = await openBetDrawer();
          if (!opened) throw new Error("\u6295\u6CE8\u5355\u672A\u6253\u5F00");
        }
        await ensureBetCartVisible();
        if (isBetSubmittedDrawerVisible()) return true;
        if (needsAcceptOddsChange()) {
          setBetStep("\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u63A5\u53D7\u66F4\u6539\u2026");
          renderPanel(true);
          const accepted = await clickAcceptOddsChangeButton();
          if (!accepted) await dismissOddsChangedModalIfAny();
          if (typeof onAcceptOddsChange === "function") onAcceptOddsChange();
          await humanDelay(600, 1100);
          if (isBetSubmittedDrawerVisible()) return true;
          if (!needsAcceptOddsChange()) {
            const afterBtn = findBetActionButton();
            if (!afterBtn || afterBtn.disabled) return true;
          }
          if (stakeInput && needsAcceptOddsChange() === false && findBetActionButton() && !isAcceptChangesBtn(findBetActionButton())) {
            try {
              await enterAmountViaKeypad(stakeInput);
            } catch (e) {
            }
          }
          continue;
        }
        const btn = await waitFor(findBetActionButton, 8e3, 300);
        if (!btn) {
          if (isBetSubmittedDrawerVisible()) return true;
          throw new Error("\u627E\u4E0D\u5230\u6295\u6CE8\u6309\u94AE");
        }
        const text = buttonText(btn);
        if (isAcceptChangesBtn(btn)) {
          await clickAcceptOddsChangeButton();
          if (typeof onAcceptOddsChange === "function") onAcceptOddsChange();
          await humanDelay(600, 1100);
          if (isBetSubmittedDrawerVisible()) return true;
          continue;
        }
        if (btn.disabled) throw new Error("\u6295\u6CE8\u6309\u94AE\u4E0D\u53EF\u7528");
        if (isInsufficientBalanceText(text)) throw new Error(text);
        setBetStep("\u70B9\u51FB\u6295\u6CE8\u6309\u94AE\u63D0\u4EA4");
        renderPanel(true);
        await humanScrollTo(btn);
        robustClick(btn);
        await humanDelay(600, 1100);
        if (isBetSubmittedDrawerVisible()) return true;
        if (needsAcceptOddsChange()) {
          setBetStep("\u63D0\u4EA4\u540E\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u63A5\u53D7\u66F4\u6539\u2026");
          renderPanel(true);
          if (typeof onAcceptOddsChange === "function") onAcceptOddsChange();
          await clickAcceptOddsChangeButton();
          await humanDelay(600, 1100);
          if (isBetSubmittedDrawerVisible()) return true;
          continue;
        }
        return true;
      }
      throw new Error("\u8D54\u7387\u591A\u6B21\u53D8\u52A8\uFF0C\u63D0\u4EA4\u672A\u5B8C\u6210");
    }
    function getSportCartFloatBtn() {
      return document.querySelector('[data-testid="sport-cart-float-btn"]');
    }
    function getSportCartItemCount() {
      const floatBtn = getSportCartFloatBtn();
      if (!floatBtn) return 0;
      const texts = floatBtn.querySelectorAll("span, div, small, strong");
      for (let i = 0; i < texts.length; i++) {
        const t = (texts[i].textContent || "").trim();
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
        if (btn.getAttribute("aria-pressed") === "true") return true;
        safeClick(btn);
        await humanDelay(800, 1200);
        return btn.getAttribute("aria-pressed") === "true";
      }
      if (lineup && lineup.getAttribute("aria-pressed") === "true") {
        await pressTab(classic) || await pressTab(quick);
      }
      oddsCount = countOddsButtons();
      if (oddsCount < 3 && classic && classic.getAttribute("aria-pressed") !== "true") {
        await pressTab(classic);
        oddsCount = countOddsButtons();
      }
      if (oddsCount < 3 && quick && quick.getAttribute("aria-pressed") !== "true") {
        await pressTab(quick);
      }
    }
    function strategyMarketNeedsTgTab(market) {
      return !!TG_CATEGORY_STRATEGY_MARKETS[String(market || "").toLowerCase()];
    }
    function buildMatchMarketUrl(tab) {
      if (!isOnMatchBetPage() || !matchId) {
        return matchBetUrl(matchId || resolveStrandedTargetMatchId(), tab);
      }
      const u = new URL(window.location.href);
      u.searchParams.delete("_tm");
      u.searchParams.set("type", "market");
      if (tab) u.searchParams.set("tab", String(tab).toLowerCase());
      return u.toString();
    }
    function getActiveMarketCategoryTab() {
      try {
        const tab = new URL(window.location.href).searchParams.get("tab");
        if (tab) return String(tab).toLowerCase();
      } catch (e) {
      }
      return "all";
    }
    function marketCategoryTabLabel(tab) {
      const t = String(tab || "").toLowerCase();
      if (t === "tg") return "\u8FDB\u7403";
      if (t === "all") return "\u5168\u90E8";
      if (t === "ah") return "\u8BA9\u7403";
      return t || "\u5168\u90E8";
    }
    function hasPendingTgCategoryPlateScan() {
      return strategyList.some(function(item) {
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
      const t = String(tab || "").toLowerCase();
      if (!t || t === MARKET_CATEGORY_TG) {
        clearUserManualCategoryTabLock();
        return;
      }
      userManualCategoryTab = t;
      userManualCategoryTabAt = Date.now();
      try {
        sessionStorage.setItem(USER_MANUAL_CATEGORY_TAB_KEY, userManualCategoryTab);
        sessionStorage.setItem(USER_MANUAL_CATEGORY_TAB_AT_KEY, String(userManualCategoryTabAt));
      } catch (e) {
      }
      console.log("[hty-inplay] \u7528\u6237\u624B\u52A8\u9009\u62E9 tab=" + t + "\uFF0C\u6682\u505C\u81EA\u52A8\u5207\u6362");
    }
    function clearUserManualCategoryTabLock() {
      userManualCategoryTabAt = 0;
      userManualCategoryTab = "";
      try {
        sessionStorage.removeItem(USER_MANUAL_CATEGORY_TAB_KEY);
        sessionStorage.removeItem(USER_MANUAL_CATEGORY_TAB_AT_KEY);
      } catch (e) {
      }
    }
    function markUserManualMatch(id) {
      const mid = String(id || "");
      if (!mid) return;
      userManualMatchId = mid;
      userManualMatchAt = Date.now();
      try {
        sessionStorage.setItem(USER_MANUAL_MATCH_ID_KEY, userManualMatchId);
        sessionStorage.setItem(USER_MANUAL_MATCH_AT_KEY, String(userManualMatchAt));
      } catch (e) {
      }
      navSuppressedUntil = Math.max(navSuppressedUntil, Date.now() + 6e4);
      try {
        sessionStorage.setItem(KEEPALIVE_TARGET_MATCH_ID_KEY, userManualMatchId);
        sessionStorage.setItem(KEEPALIVE_MATCH_ID_KEY, userManualMatchId);
      } catch (e) {
      }
      console.log("[hty-inplay] \u7528\u6237\u624B\u52A8\u9009\u62E9\u8D5B\u4E8B", mid + "\uFF0C\u77ED\u65F6\u9632\u56DE\u8DF3");
    }
    function isRuleMeetNavReason(reason) {
      const r = String(reason || "");
      return r.indexOf("\u89C4\u5219\u5DF2\u8FBE\u6807") >= 0 || r.indexOf("ruleMeet") >= 0;
    }
    function clearUserManualMatchLock() {
      userManualMatchId = "";
      userManualMatchAt = 0;
      try {
        sessionStorage.removeItem(USER_MANUAL_MATCH_ID_KEY);
        sessionStorage.removeItem(USER_MANUAL_MATCH_AT_KEY);
      } catch (e) {
      }
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
      return isUserManualMatchLockActive() && String(matchId) === String(userManualMatchId);
    }
    function shouldBlockAutoMatchNavigation(targetId, reason) {
      if (isRuleMeetNavReason(reason)) return false;
      if (!isUserManualMatchLockActive()) return false;
      return String(targetId) !== String(userManualMatchId);
    }
    function isUserManualMatchPickReason(reason) {
      return String(reason || "").indexOf("\u7528\u6237\u9009\u62E9") >= 0;
    }
    function noteScriptCategoryTabSwitch() {
      scriptCategoryTabSwitchAt = Date.now();
    }
    function syncUserManualCategoryTabFromUrl(prevTab, nextTab) {
      const next = String(nextTab || "").toLowerCase();
      const prev = String(prevTab || "").toLowerCase();
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
        "\u5168\u90E8": "all",
        "\u8FDB\u7403": MARKET_CATEGORY_TG,
        "\u8BA9\u7403": "ah"
      };
      document.addEventListener("click", function(e) {
        if (!isOnInplayMatchPage()) return;
        const el = e.target && e.target.closest('button, a, [role="tab"], [role="button"], div, span');
        if (!el || !isElementVisible(el)) return;
        if (isScriptCategoryTabSwitchRecent()) return;
        const text = (el.textContent || "").replace(/\s+/g, "");
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
      const tabId = String(tab || "").toLowerCase();
      const label = marketCategoryTabLabel(tabId);
      const roots = [
        document.querySelector('[data-testid="SportExhaustivePage"]'),
        document.querySelector('[data-testid="SportCart"]'),
        document.body
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
          if (el.closest && el.closest("#" + PANEL_ID)) continue;
          const tid = (el.getAttribute("data-testid") || "").toLowerCase();
          if (tid && tid !== tabId) continue;
          if (tid === tabId) {
            safeClick(el);
            return true;
          }
          const text = (el.textContent || "").replace(/\s+/g, "");
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
      const needsTg = forAutoBet ? !!requireTgOnly : !isUserManualCategoryTabActive() && (force || hasPendingTgCategoryPlateScan() || targetOption && targetOption.strategy && strategyMarketNeedsTgTab(targetOption.strategy.market));
      if (!needsTg) return;
      if (!isOnInplayMatchPage() || !matchId) return;
      if (!hasNavigableInPlayMatches() || isCurrentMatchEnded()) return;
      if (getActiveMarketCategoryTab() === MARKET_CATEGORY_TG) return;
      const now = Date.now();
      if (!force && !forAutoBet && now - lastEnsureMarketCategoryTabAt < 3e3) return;
      lastEnsureMarketCategoryTabAt = now;
      rememberCurrentMatchReturnUrl();
      try {
        noteScriptCategoryTabSwitch();
        if (clickMarketCategoryTab(MARKET_CATEGORY_TG)) {
          await humanDelay(400, 800);
          if (isStrandedSportEventsPage()) {
            if (shouldAllowAutoNavigation("tab-stranded")) {
              recoverStrandedFromMatchContext();
            }
            return;
          }
          await waitForOddsButtons(1, 1e4);
          lastWatchedCategoryTab = MARKET_CATEGORY_TG;
          console.log("[hty-inplay] \u5DF2\u70B9\u51FB tab=tg" + (forAutoBet ? "\uFF08\u81EA\u52A8\u6295\u6CE8\uFF09" : ""));
          return;
        }
        if (shouldAllowAutoNavigation("tab-tg")) {
          if (isAlreadyOnMatchBetUrl(matchId, MARKET_CATEGORY_TG)) return;
          if (shouldSkipTabTgUrlNav()) {
            console.log("[hty-inplay] tab=tg URL \u8DF3\u8F6C\u51B7\u5374\u4E2D\uFF0C\u4EC5\u91CD\u8BD5\u70B9\u51FB");
            return;
          }
          markTabTgUrlNav();
          gotoInplayMatch(matchId, MARKET_CATEGORY_TG);
          lastWatchedCategoryTab = MARKET_CATEGORY_TG;
        }
      } catch (e) {
        console.warn("[hty-inplay] \u5207\u6362 tab=tg \u5931\u8D25", e);
      }
    }
    function getActiveMarketViewLabel() {
      const classic = document.querySelector('[data-testid="classic"]');
      const quick = document.querySelector('[data-testid="quick"]');
      const lineup = document.querySelector('[data-testid="lineUp"]');
      if (classic && classic.getAttribute("aria-pressed") === "true") return "\u7ECF\u5178";
      if (quick && quick.getAttribute("aria-pressed") === "true") return "\u5FEB\u901F";
      if (lineup && lineup.getAttribute("aria-pressed") === "true") return "\u9635\u5BB9";
      return "\u672A\u77E5";
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
      const deadline = Date.now() + (timeoutMs || 15e3);
      while (Date.now() < deadline) {
        await ensureMarketView();
        const count = countOddsButtons();
        if (count >= min) return count;
        await sleep(500);
      }
      return countOddsButtons();
    }
    function parseOddsText(text) {
      const raw = String(text || "").trim();
      if (!raw) return "";
      if (/^X/i.test(raw)) return raw.replace(/^X/i, "");
      if (/^1\d+\.\d+$/.test(raw)) return raw.slice(1);
      if (/^2\d+\.\d+$/.test(raw)) return raw.slice(1);
      const m = raw.match(/(\d+\.\d+|\d+)/);
      return m ? m[1] : raw;
    }
    function stripOuPrefix(text) {
      return String(text || "").trim().replace(/^(?:[OU]|[大小])\s*/i, "").replace(/^大(?=[\d.+-/])/, "").replace(/^小(?=[\d.+-/])/, "");
    }
    function getButtonMarketScope(btn) {
      if (!btn || !btn.closest) return "";
      const sel = '[data-testid*="MarketTableColTwoContainer-"],[data-testid*="ExhaustiveMarketCardWrapper-"]';
      let el = btn.closest(sel);
      while (el) {
        const tid = el.getAttribute("data-testid") || "";
        const m = tid.match(/(?:MarketTableColTwoContainer|ExhaustiveMarketCardWrapper)-([^"_]+)/i);
        if (m) return String(m[1]).toLowerCase();
        el = el.parentElement ? el.parentElement.closest(sel) : null;
      }
      return "";
    }
    function getButtonMarketFromTestid(btn) {
      if (!btn) return "";
      const parsed = parseOddsBtnTestid(btn.dataset.testid || "");
      return parsed ? String(parsed.market || "").toLowerCase() : "";
    }
    function getEffectiveButtonMarket(btn) {
      const scope = getButtonMarketScope(btn);
      if (scope) return scope;
      return getButtonMarketFromTestid(btn);
    }
    function isTeamOuMarket(effective) {
      const m = String(effective || "").toLowerCase();
      return m === "a-ou" || m === "aou" || m === "h-ou" || m === "hou";
    }
    function parseScoreText(text) {
      const raw = String(text || "").trim();
      if (!raw) return null;
      let m = raw.match(/^(\d+)\s*[-:：]\s*(\d+)$/);
      if (!m) m = raw.match(/(\d{1,2})\s*[-:：]\s*(\d{1,2})/);
      if (!m) return null;
      return {
        home: parseInt(m[1], 10),
        away: parseInt(m[2], 10),
        raw: m[1] + "-" + m[2]
      };
    }
    function isTeamOuHalfLine(strategy) {
      if (!strategy) return false;
      const m = String(strategy.market || "").toLowerCase();
      if (m !== "hou" && m !== "aou") return false;
      if (String(strategy.plateOn || "").toLowerCase() !== "ov") return false;
      const k = canonicalPlateLine(strategy.plateOnK, m);
      const n = parseFloat(k);
      return k === "0.5" || !isNaN(n) && n === 0.5;
    }
    function getBttsSubstituteKind(strategy, score) {
      if (!score || !isTeamOuHalfLine(strategy)) return "";
      const m = String(strategy.market || "").toLowerCase();
      if (m === "hou" && score.away >= 1 && score.home === 0) return "hou";
      if (m === "aou" && score.home >= 1 && score.away === 0) return "aou";
      return "";
    }
    function getBttsYesStrategyStub() {
      return { market: "btts", plateOn: "y", plateOnK: "", matchId };
    }
    function applyBttsSubstitutionIfBetter(state, strategy, buttonMap, minOdds, originalPicked) {
      if (!originalPicked || isNaN(originalPicked.extracted.odds)) return;
      const score = getLiveMatchScore();
      if (!getBttsSubstituteKind(strategy, score)) {
        if (isTeamOuHalfLine(strategy) && !score) {
          console.log("[hty-inplay] BTTS\u66FF\u4EE3\u8DF3\u8FC7\uFF1A\u8BFB\u4E0D\u5230\u6BD4\u5206", strategy.market, strategy.plateOnK);
        }
        return;
      }
      const bttsPicked = pickStrategyButtonMatch(getBttsYesStrategyStub(), buttonMap, minOdds);
      if (!bttsPicked || !bttsPicked.oddsOk) {
        console.log(
          "[hty-inplay] BTTS\u66FF\u4EE3\u8DF3\u8FC7\uFF1A\u672A\u627E\u5230\u8FBE\u6807\u7684\u4E24\u961F\u8FDB\u7403\u6309\u94AE",
          "\u539F\u76D8",
          originalPicked.extracted.odds,
          "\u6BD4\u5206",
          score.raw,
          "\u94AE\u6570",
          buttonMap ? buttonMap.size : 0
        );
        return;
      }
      if (bttsPicked.extracted.odds <= originalPicked.extracted.odds) {
        console.log(
          "[hty-inplay] BTTS\u66FF\u4EE3\u8DF3\u8FC7\uFF1A\u8D54\u7387\u672A\u66F4\u9AD8",
          "hou/aou@" + originalPicked.extracted.odds,
          "btts@" + bttsPicked.extracted.odds
        );
        return;
      }
      state.bttsSubstitute = true;
      state.substitutedFrom = {
        market: strategy.market,
        plateOn: strategy.plateOn,
        plateOnK: strategy.plateOnK != null ? String(strategy.plateOnK) : ""
      };
      state.button = bttsPicked.btn;
      state.testid = bttsPicked.testid;
      state.side = bttsPicked.parsed.side;
      state.market = bttsPicked.parsed.market;
      state.lineIndex = bttsPicked.parsed.lineIndex;
      state.displayLine = bttsPicked.extracted.lineText || "\u662F";
      state.currentOdds = bttsPicked.extracted.odds;
      console.log(
        "[hty-inplay] BTTS\u66FF\u4EE3\u66F4\u9AD8\u8D54\u7387",
        strategy.market,
        strategy.plateOn,
        strategy.plateOnK,
        "@" + originalPicked.extracted.odds,
        "-> btts y @" + bttsPicked.extracted.odds,
        "\u6BD4\u5206",
        score.raw
      );
    }
    function formatTargetOptionLabel(strategy, bttsSubstitute) {
      const base = formatStrategyShort(strategy);
      return bttsSubstitute ? base + " \u2192 \u4E24\u961F\u8FDB\u7403 \u662F" : base;
    }
    function getOptionBetMarket(option) {
      if (!option) return "";
      if (option.bttsSubstitute) return "btts";
      if (option.market) return String(option.market).toLowerCase();
      return option.strategy && option.strategy.market ? String(option.strategy.market).toLowerCase() : "";
    }
    function getOptionBetPlateOn(option) {
      if (!option) return "";
      if (option.bttsSubstitute) return "y";
      if (option.side) return parsePageSide(option.side);
      return option.strategy && option.strategy.plateOn ? String(option.strategy.plateOn).toLowerCase() : "";
    }
    function marketsMatch(strategyMarket, pageMarket, btn) {
      const sm = String(strategyMarket || "").toLowerCase();
      const pm = String(pageMarket || "").toLowerCase();
      const effective = btn ? getEffectiveButtonMarket(btn) : pm;
      if (sm === pm) {
        if (sm === "ou" && isTeamOuMarket(effective)) return false;
        if (sm === "ou" && effective && effective !== "ou") return false;
        return true;
      }
      if ((sm === "ad" || sm === "1x2") && (pm === "ad" || pm === "1x2")) return true;
      if (sm === "aou" && (pm === "a-ou" || pm === "aou")) return true;
      if (sm === "hou" && (pm === "h-ou" || pm === "hou")) return true;
      if (sm === "aou" && pm === "ou") {
        return effective === "a-ou" || effective === "aou";
      }
      if (sm === "hou" && pm === "ou") {
        return effective === "h-ou" || effective === "hou";
      }
      if (sm === "ou" && pm === "ou") {
        return !effective || effective === "ou";
      }
      return false;
    }
    function parsePageSide(side) {
      const s = String(side || "").toLowerCase();
      const amp = s.indexOf("&");
      if (amp >= 0) return s.slice(amp + 1);
      return s;
    }
    function pageMarketForStrategy(market) {
      const m = String(market || "").toLowerCase();
      if (m === "aou") return "a-ou";
      if (m === "hou") return "h-ou";
      return m;
    }
    function pageMarketsForStrategy(market) {
      const m = String(market || "").toLowerCase();
      if (m === "aou") return ["a-ou", "aou"];
      if (m === "hou") return ["h-ou", "hou"];
      if (m === "ou") return ["ou"];
      const pm = pageMarketForStrategy(market);
      return pm ? [pm] : [];
    }
    const MARKET_SECTION_LABEL = {
      "a-ou": "\u5BA2\u8FDB\u7403",
      aou: "\u5BA2\u8FDB\u7403",
      "h-ou": "\u4E3B\u8FDB\u7403",
      hou: "\u4E3B\u8FDB\u7403",
      btts: "\u4E24\u961F\u8FDB\u7403"
    };
    const MARKET_CATEGORY_TG = "tg";
    const TG_CATEGORY_STRATEGY_MARKETS = { hou: 1, aou: 1, btts: 1 };
    function findMarketElementByLabel(label) {
      if (!label || !document.body) return null;
      const nodes = document.querySelectorAll(
        '[data-testid*="MarketTableColTwoContainer-"],[data-testid*="ExhaustiveMarketCardWrapper-"]'
      );
      for (let i = 0; i < nodes.length; i++) {
        const container = nodes[i];
        const headings = container.querySelectorAll("h3, h4, span, div");
        for (let j = 0; j < headings.length; j++) {
          const node = headings[j];
          const text = (node.textContent || "").trim();
          if (!text || text.indexOf(label) < 0) continue;
          if (text.length > 24 && text !== label) continue;
          return container;
        }
      }
      return null;
    }
    function canonicalPlateLine(text, market) {
      const m = String(market || "").toLowerCase();
      if (m === "1x2" || m === "ad") return "0";
      let s = stripOuPrefix(text).trim();
      const split = s.match(/^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      if (split) {
        const head = split[1];
        const sign = head.startsWith("-") ? "-" : head.startsWith("+") ? "+" : "";
        const a = head.replace(/^[+-]/, "");
        return sign + a + "/" + split[2];
      }
      const n = parseFloat(s);
      if (!isNaN(n)) return String(n);
      return s;
    }
    function extractButtonLineOdds(btn) {
      let lineText = "";
      const lineRoot = btn.querySelector('[data-testid="undefined-scale-content"]') || btn.querySelector('[data-testid*="scale-content"]');
      if (lineRoot) lineText = (lineRoot.textContent || "").trim();
      if (!lineText) {
        const spans = btn.querySelectorAll("span");
        for (let i = 0; i < spans.length; i++) {
          const t = (spans[i].textContent || "").trim();
          if (!t) continue;
          if (/^(?:[OU]|[大小])\s*[\d.+-/]/i.test(t)) {
            lineText = t;
            break;
          }
        }
      }
      const oddsEl = btn.querySelector("span.font-semibold") || btn.querySelector("span.text-text-2") || btn.querySelector("span");
      const oddsText = oddsEl ? parseOddsText(oddsEl.textContent || "") : "";
      const odds = parseFloat(oddsText);
      return {
        lineText,
        oddsText,
        odds: isNaN(odds) ? NaN : odds
      };
    }
    function hasSplitPlateNotation(val) {
      return /\d\/\d/.test(String(val || ""));
    }
    function parseOddsBtnTestid(testid) {
      const raw = String(testid || "");
      const body = raw.replace(/^oddsBtn-/i, "");
      const parts = body.split("|");
      if (parts.length < 5) return null;
      return {
        bookId: parts[0],
        matchId: parts[1],
        market: parts[2],
        side: parts[3],
        lineIndex: parts[4],
        testid: raw
      };
    }
    function formatStrategyShort(item) {
      return formatStrategyPlateDesc(item);
    }
    function strategyLineMatches(strategy, displayLine, market, lineIndex) {
      const m = String(market || "").toLowerCase();
      if (m === "1x2" || m === "ad" || m === "btts") return true;
      const strategyLine = strategy.plateOnK;
      if (strategyLine == null || strategyLine === "") {
        return String(lineIndex) === "0";
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
        const testid = btn.dataset.testid || "";
        const parsed = parseOddsBtnTestid(testid);
        if (!parsed) continue;
        const extracted = extractButtonLineOdds(btn);
        if (!strategyMatchesButton(strategy, parsed, extracted.lineText, btn)) continue;
        const oddsOk = !isNaN(extracted.odds) && extracted.odds >= minOdds;
        let rank = oddsOk ? 1e5 : 0;
        rank += Math.min(extracted.odds || 0, 9999) * 10;
        if (rank > bestRank) {
          bestRank = rank;
          best = { btn, testid, parsed, extracted, oddsOk };
        }
      }
      return best;
    }
    function strategyMatchesButton(strategy, parsed, displayLine, btn) {
      if (String(parsed.matchId) !== String(matchId)) return false;
      if (!marketsMatch(strategy.market, parsed.market, btn)) return false;
      const side = String(strategy.plateOn || "").toLowerCase();
      if (side !== parsePageSide(parsed.side)) return false;
      return strategyLineMatches(strategy, displayLine, parsed.market, parsed.lineIndex);
    }
    function snapshotOddsButtons(targetMap) {
      const buttons = queryOddsButtons();
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const testid = btn.dataset.testid || "";
        if (!testid) continue;
        targetMap.set(testid, btn);
      }
    }
    function buildButtonMarketIndex(buttonMap) {
      const index = /* @__PURE__ */ new Map();
      function addKey(key, btn) {
        if (!index.has(key)) index.set(key, []);
        const list = index.get(key);
        if (list.indexOf(btn) < 0) list.push(btn);
      }
      buttonMap.forEach(function(btn, testid) {
        const parsed = parseOddsBtnTestid(testid);
        if (!parsed) return;
        const side = parsePageSide(parsed.side);
        const mid = String(parsed.matchId);
        const parsedMarket = String(parsed.market).toLowerCase();
        const effective = getEffectiveButtonMarket(btn);
        addKey(mid + "|" + parsedMarket + "|" + side, btn);
        if (effective && effective !== parsedMarket) {
          addKey(mid + "|" + effective + "|" + side, btn);
        }
        if (effective === "h-ou" || effective === "hou") {
          addKey(mid + "|h-ou|" + side, btn);
          addKey(mid + "|hou|" + side, btn);
        }
        if (effective === "a-ou" || effective === "aou") {
          addKey(mid + "|a-ou|" + side, btn);
          addKey(mid + "|aou|" + side, btn);
        }
      });
      return index;
    }
    function candidateButtonsForStrategy(strategy, buttonMap) {
      const side = String(strategy.plateOn || "").toLowerCase();
      const mid = String(matchId);
      const markets = pageMarketsForStrategy(strategy.market);
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (let m = 0; m < markets.length; m++) {
        const key = mid + "|" + markets[m].toLowerCase() + "|" + side;
        const list = buttonMarketIndex.get(key);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const btn = list[i];
          const tid = btn.dataset.testid || "";
          if (!tid || seen.has(tid)) continue;
          seen.add(tid);
          out.push(btn);
        }
      }
      if (out.length) return out;
      const buttons = Array.from(buttonMap.values());
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const parsed = parseOddsBtnTestid(btn.dataset.testid || "");
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
      buttonMap.forEach(function(btn, testid) {
        const ex = extractButtonLineOdds(btn);
        parts.push(testid + "@" + (ex.oddsText || String(ex.odds != null ? ex.odds : "")));
      });
      parts.sort();
      return parts.join(";");
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
        const map = /* @__PURE__ */ new Map();
        snapshotOddsButtons(map);
        const minOdds = Number(option.strategy.plateOddsHit);
        const pickStrategy = option.bttsSubstitute ? getBttsYesStrategyStub() : option.strategy;
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
        if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
      }
      await humanDelay(400, 700);
      snapshotOddsButtons(lastButtonSnapshot);
      return resolveLiveButtonForOption(option);
    }
    function truncatePanelText(text, max) {
      const s = String(text || "");
      const limit = max || PANEL_TEXT_MAX;
      if (s.length <= limit) return s;
      return s.slice(0, Math.max(0, limit - 1)) + "\u2026";
    }
    function formatBelowThresholdHint(st) {
      const s = st.strategy;
      if (!s) return "";
      const line = truncatePanelText(st.displayLine || "\u2014", 20);
      return formatStrategyPlateDesc(s) + " " + line + " " + formatOddsDisplay(st.currentOdds) + "<" + formatOddsDisplay(s.plateOddsHit) + "\uFF08\u672A\u8FBE\u9608\u503C\uFF09";
    }
    function countPlateMatchedStates() {
      let n = 0;
      for (let i = 0; i < strategyStates.length; i++) {
        const st = strategyStates[i];
        if (st.plateMatched) {
          n++;
          continue;
        }
        if (st.execStatus !== "pending" || !st.strategy) continue;
        if (pickStrategyButtonMatch(st.strategy, lastButtonSnapshot, 0)) n++;
      }
      return n;
    }
    function buildUnmatchedHint() {
      const hitBlocked = strategyStates.filter(function(st) {
        return st.execStatus === "pending" && st.hit && st.dedupBlocked;
      });
      if (hitBlocked.length) {
        const st = hitBlocked[0];
        const line = truncatePanelText(st.displayLine || "\u2014", 20);
        const why = isScriptDedupInflight({ testid: st.testid, strategy: st.strategy }, st.strategy.recHash) ? "\u9632\u91CD(\u7B49\u5F85\u786E\u8BA4)" : "\u9632\u91CD(\u672C\u5730\u5DF2\u8BB0)";
        return line + " " + formatOddsDisplay(st.currentOdds) + "\u2265" + formatOddsDisplay(st.strategy.plateOddsHit) + " \xB7 " + why;
      }
      const pending = strategyStates.filter(function(st) {
        return st.execStatus === "pending";
      });
      if (!pending.length) return "";
      for (let i = 0; i < pending.length; i++) {
        const st = pending[i];
        if (st.plateMatched && !st.oddsMatched) {
          return formatBelowThresholdHint(st);
        }
      }
      for (let i = 0; i < pending.length; i++) {
        const st = pending[i];
        const s2 = st.strategy;
        if (!s2 || st.plateMatched) continue;
        const picked = pickStrategyButtonMatch(s2, lastButtonSnapshot, 0);
        if (picked) {
          const minOdds = Number(s2.plateOddsHit);
          if (isNaN(minOdds) || picked.extracted.odds < minOdds) {
            return formatBelowThresholdHint({
              strategy: s2,
              displayLine: picked.extracted.lineText,
              currentOdds: picked.extracted.odds
            });
          }
        }
      }
      for (let i = 0; i < pending.length; i++) {
        const s2 = pending[i].strategy;
        if (!s2) continue;
        const minOdds = Number(s2.plateOddsHit);
        const side = String(s2.plateOn || "").toLowerCase();
        const candidates = candidateButtonsForStrategy(s2, lastButtonSnapshot);
        let best = null;
        for (let j = 0; j < candidates.length; j++) {
          const btn = candidates[j];
          if (btn.disabled) continue;
          const parsed = parseOddsBtnTestid(btn.dataset.testid || "");
          if (parsed && parsePageSide(parsed.side) !== side) continue;
          const ex = extractButtonLineOdds(btn);
          if (isNaN(ex.odds)) continue;
          if (!best || ex.odds > best.odds) best = ex;
        }
        if (best && !isNaN(minOdds) && best.odds < minOdds) {
          const label2 = formatStrategyPlateDesc(s2);
          const line = truncatePanelText(best.lineText || "\u2014", 20);
          return label2 + " " + line + " " + formatOddsDisplay(best.odds) + "<" + formatOddsDisplay(s2.plateOddsHit) + "\uFF08\u672A\u8FBE\u9608\u503C\uFF09";
        }
      }
      const s = pending[0].strategy;
      if (!s) return "";
      const label = formatStrategyPlateDesc(s);
      return label + "\uFF1A\u672A\u627E\u5230\u76D8\u53E3";
    }
    function scanStatusSummary() {
      const total = strategyList.length;
      const actionable = strategyStates.filter(function(st) {
        return st.actionable;
      }).length;
      const matched = countPlateMatchedStates();
      const catLabel = marketCategoryTabLabel(getActiveMarketCategoryTab());
      const modeLabel = lastScanViewMode || getActiveMarketViewLabel();
      const view = catLabel + "\xB7" + modeLabel;
      return view + " \xB7 " + lastScanButtonCount + "\u94AE \xB7 \u5339" + matched + "/" + total + " \xB7 \u53EF\u4E0B" + actionable;
    }
    function scanStatusFull() {
      let text = scanStatusSummary();
      if (!strategyStates.some(function(st) {
        return st.actionable;
      }) && strategyList.length) {
        const hint = buildUnmatchedHint();
        if (hint) text += " \xB7 " + hint;
      }
      if (lastScanError) text += " \xB7 " + lastScanError;
      return text;
    }
    function scanStatusText() {
      return scanStatusFull();
    }
    function findStrategyMarketElement(pageMarket) {
      const pm = String(pageMarket || "");
      if (!pm) return null;
      const direct = document.querySelector('[data-testid="MarketTableColTwoContainer-' + pm + '"]') || document.querySelector('[data-testid*="MarketTableColTwoContainer-' + pm + '"]') || document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-' + pm + '"]') || document.querySelector('[data-testid="ExhaustiveMarketCardWrapper-' + pm + '_group-grouped"]') || document.querySelector('[data-testid*="ExhaustiveMarketCardWrapper-' + pm + '"]');
      if (direct) return direct;
      const label = MARKET_SECTION_LABEL[pm.toLowerCase()];
      if (label) return findMarketElementByLabel(label);
      return null;
    }
    function strategyNeedsPlateScan(item) {
      if (!isStrategyActionable(item)) return false;
      const st = strategyStates.find(function(s) {
        return s.strategy && s.strategy.recHash === item.recHash;
      });
      return !st || !st.plateMatched;
    }
    function hasPendingTeamOuPlateScan() {
      return hasPendingTgCategoryPlateScan();
    }
    async function ensureStrategyMarketsVisible() {
      const hasPendingUnmatched = strategyList.some(function(item) {
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
        toScroll[j].scrollIntoView({ block: "center", behavior: "auto" });
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
      const buttonMap = /* @__PURE__ */ new Map();
      snapshotOddsButtons(buttonMap);
      buttonMarketIndex = buildButtonMarketIndex(buttonMap);
      strategyStates = evaluateStrategyStatesFromMap(buttonMap);
      const firstPlateCount = strategyStates.filter(function(st) {
        return st.plateMatched;
      }).length;
      for (let round = 0; round < 2; round++) {
        const pendingUnmatched = strategyStates.filter(function(st) {
          return st.execStatus === "pending" && !st.plateMatched;
        });
        if (!pendingUnmatched.length) break;
        for (let i = 0; i < pendingUnmatched.length; i++) {
          const markets = pageMarketsForStrategy(pendingUnmatched[i].strategy.market);
          for (let m = 0; m < markets.length; m++) {
            const el = findStrategyMarketElement(markets[m]);
            if (el) {
              el.scrollIntoView({ block: "center", behavior: "auto" });
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
      const pendingAfter = strategyStates.filter(function(st) {
        return st.execStatus === "pending" && !st.plateMatched;
      });
      const pendingTeamOu = pendingAfter.filter(function(st) {
        const m = st.strategy && st.strategy.market ? String(st.strategy.market).toLowerCase() : "";
        return strategyMarketNeedsTgTab(m);
      });
      if (pendingAfter.length && (!firstPlateCount || pendingTeamOu.length)) {
        if (pendingTeamOu.length && getActiveMarketCategoryTab() !== MARKET_CATEGORY_TG && !isUserManualCategoryTabActive()) {
          await ensureMarketCategoryTab(true, false);
          snapshotOddsButtons(buttonMap);
          buttonMarketIndex = buildButtonMarketIndex(buttonMap);
        }
        for (let i = 0; i < pendingAfter.length; i++) {
          const markets = pageMarketsForStrategy(pendingAfter[i].strategy.market);
          for (let m = 0; m < markets.length; m++) {
            const el = findStrategyMarketElement(markets[m]);
            if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
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
      const needBttsSub = strategyStates.some(function(st) {
        if (!st.hit || st.bttsSubstitute || st.execStatus !== "pending") return false;
        return !!getBttsSubstituteKind(st.strategy, getLiveMatchScore());
      });
      if (needBttsSub) {
        const bttsEl = findStrategyMarketElement("btts");
        if (bttsEl) {
          bttsEl.scrollIntoView({ block: "center", behavior: "auto" });
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
        return "executed";
      }
      return getStrategyExecStatusFromApi(item);
    }
    function isStrategyActionable(item) {
      return passesStrategyStatusGate(item);
    }
    function strategyExecLabel(item) {
      const status = getStrategyExecStatus(item);
      if (status === "executed") return "\u5DF2\u6267\u884C";
      if (status === "aborted") return "\u5DF2\u4E2D\u6B62";
      if (status === "confirming") return "\u5F85\u786E\u8BA4";
      return "\u672A\u6267\u884C";
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
        substitutedFrom: state.substitutedFrom || null
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
          strategy,
          execStatus: getStrategyExecStatus(strategy),
          plateMatched: false,
          oddsMatched: false,
          hit: false,
          actionable: false,
          currentOdds: null,
          displayLine: "",
          button: null,
          testid: "",
          side: "",
          market: "",
          lineIndex: ""
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
            state.dedupBlocked = state.execStatus === "pending" && isScriptDedupBlocked({ testid: state.testid, strategy }, strategy.recHash);
            state.actionable = state.execStatus === "pending" && state.hit && !state.dedupBlocked;
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
      return strategyStates.map(function(st) {
        return [
          st.execStatus || "pending",
          st.actionable ? "1" : "0",
          st.hit ? "1" : "0",
          st.plateMatched ? "1" : "0",
          st.dedupBlocked ? "1" : "0",
          st.bttsSubstitute ? "1" : "0",
          st.testid || "",
          st.displayLine || "",
          st.currentOdds != null ? String(st.currentOdds) : ""
        ].join(":");
      }).join(";");
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
      if (!strategyStates.some(function(st) {
        return st.actionable;
      })) {
        targetOption = null;
      }
      return targetOption;
    }
    async function lightweightReevaluateOdds(buttonMap) {
      if (hasPendingTgCategoryPlateScan()) {
        await ensureStrategyMarketsVisible();
      }
      const map = buttonMap || /* @__PURE__ */ new Map();
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
        betResult = "pending";
        setBetStep("\u7B56\u7565\u5DF2\u547D\u4E2D\uFF0C\u7B49\u5F85\u767B\u5F55\u540E\u81EA\u52A8\u6295\u6CE8\u2026");
        updatePanelStatus();
        tryAutoRelogin({ urgent: true }).catch(function(e) {
          console.warn("[hty-inplay] autoBet \u81EA\u52A8\u767B\u5F55", e);
        });
        schedulePoll();
        return;
      }
      if (shouldHoldCurrentMatch() && !pollTimer) {
        schedulePoll();
        return;
      }
      if (strategyStates.some(function(st) {
        return st.actionable;
      }) && !pollTimer) {
        schedulePoll();
      }
    }
    async function refreshTargetOption(force) {
      if (isCurrentMatchEnded()) {
        await handleMatchEnded();
        return targetOption;
      }
      const now = Date.now();
      const hasPending = strategyList.some(function(item) {
        return isStrategyActionable(item);
      });
      const scanGap = hasPending && !targetOption ? MATCH_SCAN_PENDING_MS : MATCH_SCAN_MS;
      if (!force && now - lastMatchScanAt < scanGap) {
        await lightweightReevaluateOdds();
        updatePanelStatus();
        return targetOption;
      }
      if (!force && lastOddsSignature) {
        const quickMap = /* @__PURE__ */ new Map();
        snapshotOddsButtons(quickMap);
        const sig = oddsButtonsSignature(quickMap);
        if (sig === lastOddsSignature) {
          await lightweightReevaluateOdds(quickMap);
          updatePanelStatus();
          return targetOption;
        }
      }
      lastScanError = "";
      try {
        await ensureMarketView(force || hasPendingTgCategoryPlateScan());
        await ensureMarketCategoryTab(
          (force || hasPendingTgCategoryPlateScan()) && !isUserManualCategoryTabActive()
        );
        await waitForOddsButtons(1, 15e3);
        await ensureStrategyMarketsVisible();
        lastMatchScanAt = now;
        lastScanViewMode = getActiveMarketViewLabel();
        await scanStrategyStatesWithRetry();
        lastOddsSignature = oddsButtonsSignature(lastButtonSnapshot);
        targetOption = findStrategyMatch();
        if (!placing && betResult !== "placing") {
          if (targetOption) {
            betStep = "\u5DF2\u547D\u4E2D " + targetOption.label + " @" + formatOddsDisplay(targetOption.odds);
          } else if (strategyList.length) {
            betStep = "\u7B49\u5F85\u7B56\u7565\u76D8\u53E3\u4E0E\u8D54\u7387\u8FBE\u6807";
          }
        }
        updatePanelStatus();
      } catch (err) {
        lastScanError = err && err.message ? err.message : "\u626B\u63CF\u5931\u8D25";
        if (!placing && betResult !== "placing") {
          betStep = "\u626B\u63CF\u5F02\u5E38";
        }
        updatePanelStatus();
      }
      return targetOption;
    }
    async function waitForStrategyMatch(timeoutMs) {
      const deadline = Date.now() + (timeoutMs || 6e4);
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
      NOT_STARTED: "\u672A\u5F00\u59CB",
      IN_PLAY: "\u8FDB\u884C\u4E2D",
      ENDED: "\u5DF2\u7ED3\u675F",
      FINISHED: "\u5DF2\u7ED3\u675F",
      POSTPONED: "\u5EF6\u671F",
      CANCELLED: "\u53D6\u6D88"
    };
    const MATCH_STATUS = {
      NOT_STARTED: 0,
      IN_PLAY: 1,
      ENDED: 3
    };
    function getMatchStatusValue(item) {
      if (!item) return null;
      if (item.status != null && item.status !== "") return item.status;
      if (item.matchStatus != null && item.matchStatus !== "") return item.matchStatus;
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
        return store && typeof store === "object" ? store : {};
      } catch (e) {
        return {};
      }
    }
    function saveLocalEndedMatches(store) {
      try {
        sessionStorage.setItem(LOCAL_ENDED_MATCHES_KEY, JSON.stringify(store || {}));
      } catch (e) {
      }
    }
    function pruneLocalEndedMatches(store) {
      const now = Date.now();
      Object.keys(store).forEach(function(id) {
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
      store[String(id)] = { at: Date.now(), reason: reason || "" };
      saveLocalEndedMatches(store);
      lastMatchesListKey = "";
      console.log("[hty-inplay] \u672C\u5730\u6807\u8BB0\u8D5B\u4E8B\u5DF2\u7ED3\u675F", id, reason || "");
    }
    function clearMatchLocallyEnded(id) {
      if (!id) return false;
      const store = pruneLocalEndedMatches(loadLocalEndedMatches());
      const key = String(id);
      if (!store[key]) return false;
      delete store[key];
      saveLocalEndedMatches(store);
      lastMatchesListKey = "";
      console.log("[hty-inplay] \u6E05\u9664\u672C\u5730\u8BEF\u6807\u5DF2\u7ED3\u675F", id);
      return true;
    }
    function isMatchIdEnded(id) {
      if (!id) return false;
      if (isMatchLocallyEnded(id)) return true;
      const item = activeMatches.find(function(m) {
        return String(m.matchId) === String(id);
      });
      if (!item) return false;
      return isMatchEndedByFields(item) || resolveMatchPhase(item) === "ENDED";
    }
    function isInplayMatchApiNotFoundReason(reason) {
      const r = String(reason || "").toLowerCase();
      return r === "api_not_found" || r === "api_match_not_found" || r.indexOf("match not found") >= 0;
    }
    function reconcileLocalEndedMatches() {
      const store = pruneLocalEndedMatches(loadLocalEndedMatches());
      let changed = false;
      activeMatches.forEach(function(item) {
        const id = String(item.matchId || "");
        if (!id || !store[id]) return;
        if (isInplayMatchApiNotFoundReason(store[id].reason)) return;
        if (String(id) === String(matchId) && isOnMatchBetPage()) return;
        if (!isMatchEndedByFields(item)) {
          delete store[id];
          changed = true;
          console.log(
            "[hty-inplay] \u7B56\u7565\u5217\u8868\u4ECD\u6D3B\u8DC3\uFF0C\u6E05\u9664\u672C\u5730\u8BEF\u6807\u5DF2\u7ED3\u675F",
            id,
            item.homeName,
            "vs",
            item.awayName
          );
        }
      });
      if (changed) saveLocalEndedMatches(store);
      return changed;
    }
    function isMatchEndedPageVisible() {
      if (!isOnInplayMatchPage()) return false;
      const root = document.querySelector(PAGE_READY_SEL);
      if (!root || !isElementVisible(root)) return false;
      const text = normalizeHintText(root.textContent || "");
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
      markMatchLocallyEnded(matchId, reason || "page_ended");
    }
    function phaseFromMatchStatus(status) {
      if (status == null || status === "") return "";
      const n = Number(status);
      if (n === MATCH_STATUS.NOT_STARTED) return "NOT_STARTED";
      if (n === MATCH_STATUS.IN_PLAY) return "IN_PLAY";
      if (n === MATCH_STATUS.ENDED) return "ENDED";
      return "";
    }
    function isMatchEndedByFields(item) {
      if (!item) return false;
      const statusVal = getMatchStatusValue(item);
      if (statusVal != null && statusVal !== "" && Number(statusVal) === MATCH_STATUS.ENDED) {
        return true;
      }
      const phase = String(item.matchPhase || "").toUpperCase();
      return phase === "ENDED" || phase === "FINISHED" || phase === "CANCELLED";
    }
    function handleInplayMatchNotFound(id, reason) {
      const mid = String(id || matchId || "");
      if (!mid) return;
      markMatchLocallyEnded(mid, reason || "api_not_found");
      if (String(matchId) === mid && isOnInplayMatchPage()) {
        handleMatchEnded().catch(function(e) {
          console.warn("[hty-inplay] API\u8D5B\u4E8B\u4E0D\u5B58\u5728\u540E\u5207\u6362", e);
        });
      }
    }
    function isCurrentMatchEnded() {
      if (!isOnInplayMatchPage()) return false;
      if (isMatchEndedUiVisible()) {
        noteCurrentMatchUnavailable(isMatchEndedPageVisible() ? "page_inline" : "page_modal");
        return true;
      }
      if (isMatchLocallyEnded(matchId)) return true;
      const item = getCurrentMatchItem();
      if (!item) return false;
      return isMatchEndedByFields(item);
    }
    function isMatchIdInPlay(targetId) {
      if (!targetId) return false;
      const item = activeMatches.find(function(m) {
        return String(m.matchId) === String(targetId);
      });
      if (!item) return false;
      return resolveMatchPhase(item) === "IN_PLAY";
    }
    function isCurrentPageLive() {
      if (!isOnInplayMatchPage()) return false;
      if (isMatchLocallyEnded(matchId)) return false;
      if (isMatchUnavailableModalVisible()) return false;
      const item = getCurrentMatchItem();
      if (item && isMatchEndedByFields(item)) return false;
      if (item && resolveMatchPhase(item) !== "IN_PLAY") return false;
      return isPageReady();
    }
    function resolveMatchPhase(item) {
      if (!item) return "";
      if (isMatchEndedByFields(item)) return "ENDED";
      if (isMatchLocallyEnded(item.matchId)) {
        if (!isMatchEndedByFields(item)) clearMatchLocallyEnded(item.matchId);
      }
      if (isMatchLocallyEnded(item.matchId)) return "ENDED";
      if (isCurrentMatchItem(item) && isMatchEndedUiVisible()) return "ENDED";
      const statusVal = getMatchStatusValue(item);
      const fromStatus = phaseFromMatchStatus(statusVal);
      if (fromStatus === "IN_PLAY") return "IN_PLAY";
      if (fromStatus === "NOT_STARTED") {
        return isKickoffReached(item, KICKOFF_EARLY_MS) ? "IN_PLAY" : "NOT_STARTED";
      }
      const mp = String(item.matchPhase || "").toUpperCase();
      if (mp === "IN_PLAY") return "IN_PLAY";
      if (mp === "NOT_STARTED") {
        return isKickoffReached(item, KICKOFF_EARLY_MS) ? "IN_PLAY" : "NOT_STARTED";
      }
      if (isKickoffReached(item, KICKOFF_EARLY_MS)) return "IN_PLAY";
      if (isCurrentMatchItem(item) && isPageReady() && isKickoffReached(item, 0)) {
        return "IN_PLAY";
      }
      return mp || "NOT_STARTED";
    }
    function isMatchEndedPhase(item) {
      if (!item) return false;
      if (isMatchEndedByFields(item)) return true;
      if (isMatchLocallyEnded(item.matchId)) return true;
      if (isCurrentMatchItem(item) && isMatchEndedUiVisible()) return true;
      return false;
    }
    function renderMatchListRow(item, idx) {
      const id = item.matchId || "";
      const isPage = String(id) === String(matchId);
      const score = item.finalScore != null && item.finalScore !== "" ? " \xB7 \u6BD4\u5206 " + item.finalScore : "";
      let rowClass = "tm-hty-match-item";
      if (isPage) rowClass += " tm-hty-match-page";
      if (isMatchEndedPhase(item)) rowClass += " tm-hty-match-ended";
      const pickText = formatActiveMatchItem(item) + score;
      const pageBadge = isPage ? '<span class="tm-hty-match-badge" title="\u5F53\u524D\u9875">\u{1F4CC}</span>' : "";
      const traceLink = id ? '<a class="tm-hty-match-trace" href="' + traceMatchUrl(id) + '" target="_blank" rel="noopener" title="\u5947\u80DC\u8D70\u52BF">\u5947\u80DC</a>' : "";
      if (!id) {
        return '<div class="' + rowClass + '"><span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span><span class="tm-hty-match-pick">' + pickText + "</span>" + pageBadge + "</div>";
      }
      const inplayReady = resolveMatchPhase(item) === "IN_PLAY";
      let mainHtml;
      if (isMatchEndedPhase(item)) {
        mainHtml = '<span class="tm-hty-match-pick" title="\u6BD4\u8D5B\u5DF2\u7ED3\u675F">' + pickText + "</span>";
      } else if (inplayReady) {
        mainHtml = '<a class="tm-hty-match-main" href="' + inplayMatchUrl(id) + '" title="\u8DF3\u8F6C\u6EDA\u7403\u9875">' + pickText + "</a>";
      } else {
        mainHtml = '<a class="tm-hty-match-main" href="' + matchBetUrl(id, null, "incoming") + '" title="\u8DF3\u8F6C\u5373\u5C06\u5F00\u8D5B\u9875">' + pickText + "</a>";
      }
      return '<div class="' + rowClass + '"><span class="tm-hty-strategy-idx">' + (idx + 1) + ".</span>" + mainHtml + traceLink + pageBadge + "</div>";
    }
    function inplayMatchUrl(id, tab) {
      return matchBetUrl(id, tab);
    }
    function gotoInplayMatch(id, tab, forceRefresh) {
      if (!AUTO_PAGE_NAV_ENABLED) {
        console.warn("[hty-inplay] \u81EA\u52A8\u8DF3\u8F6C\u5DF2\u7981\u7528\uFF0C\u8DF3\u8FC7 gotoInplayMatch", id);
        return false;
      }
      if (!id) return false;
      if (shouldBlockMatchAutoNav()) {
        console.log("[hty-inplay] \u672A\u767B\u5F55/\u767B\u5F55\u4E2D\uFF0C\u8DF3\u8FC7\u8DF3\u8F6C", id);
        return false;
      }
      if (isMatchIdEnded(id)) {
        console.log("[hty-inplay] \u8DF3\u8FC7\u5DF2\u7ED3\u675F\u8D5B\u4E8B\u8DF3\u8F6C", id);
        return false;
      }
      if (shouldBlockAutoMatchNavigation(id)) {
        console.log("[hty-inplay] \u7528\u6237\u624B\u52A8\u9009\u573A\u9501\u5B9A\uFF0C\u8DF3\u8FC7\u8DF3\u8F6C", id);
        return false;
      }
      if (forceRefresh) {
        if (!shouldAllowAutoNavigation("page-reload")) return false;
        if (isCurrentMatchEnded() || isMatchEndedModalVisible()) return false;
        if (Date.now() - lastPageReloadAt < PAGE_RELOAD_COOLDOWN_MS) return false;
      } else if (!shouldAllowAutoNavigation("goto")) {
        return false;
      }
      const url = inplayMatchUrl(id, tab);
      if (!forceRefresh && isAlreadyOnMatchBetUrl(id, tab)) {
        return true;
      }
      const targetSeg = resolveMatchUrlSegmentForId(id);
      const curSeg = getMatchPageSegmentFromUrl();
      const sameMatch = isOnMatchBetPage() && String(id) === String(matchId) && targetSeg === curSeg;
      const wantTab = tab ? String(tab).toLowerCase() : "";
      const curTab = typeof getActiveMarketCategoryTab === "function" ? getActiveMarketCategoryTab() : "";
      const tabMatches = !wantTab || wantTab === curTab;
      if (forceRefresh && (isAlreadyOnMatchBetUrl(id, tab) || sameMatch && tabMatches)) {
        console.log("[hty-inplay] \u540C\u9875\u5237\u65B0", id, tab || "all");
        lastPageReloadAt = Date.now();
        withPageNavAllow(function() {
          window.location.reload();
        });
        return true;
      }
      if (normalizeMatchBetHref(window.location.href) === normalizeMatchBetHref(url)) {
        return true;
      }
      console.log("[hty-inplay] \u8DF3\u8F6C\u6EDA\u7403\u9875", id, tab || "all");
      return performPageNavigation(url, "gotoInplayMatch", id);
    }
    function gotoInplayMatchDirect(id, tab, reason, opts) {
      if (!id) return false;
      const force = !!(opts && opts.force);
      if (force) {
        if (isLoginUiBusy()) {
          console.log("[hty-inplay] \u767B\u5F55\u5F39\u7A97\u4E2D\uFF0C\u6682\u7F13\u5F3A\u5236\u76F4\u8DF3", id);
          return false;
        }
      } else if (shouldBlockMatchAutoNav()) {
        console.log("[hty-inplay] \u672A\u767B\u5F55/\u767B\u5F55\u4E2D\uFF0C\u8DF3\u8FC7\u76F4\u8DF3", id);
        return false;
      }
      if (!force && shouldBlockAutoMatchNavigation(id, reason)) {
        console.log("[hty-inplay] \u7528\u6237\u624B\u52A8\u9009\u573A\u9501\u5B9A\uFF0C\u8DF3\u8FC7\u76F4\u8DF3", id);
        return false;
      }
      if (!force && (isMatchIdEnded(id) || isMatchLocallyEnded(id))) {
        console.log("[hty-inplay] \u8DF3\u8FC7\u5DF2\u7ED3\u675F\u8D5B\u4E8B\u76F4\u8DF3", id);
        return false;
      }
      if (!force) {
        const item = activeMatches.find(function(m) {
          return String(m.matchId) === String(id);
        });
        if (item && !matchHasNavigablePendingWork(item) && !isUserManualMatchPickReason(reason)) {
          console.log("[hty-inplay] \u8DF3\u8FC7\u65E0\u5F85\u6267\u884C\u7B56\u7565\u8D5B\u4E8B\u76F4\u8DF3", id);
          return false;
        }
      }
      if (isAlreadyOnMatchBetUrl(id, tab)) return true;
      const url = inplayMatchUrl(id, tab);
      if (normalizeMatchBetHref(window.location.href) === normalizeMatchBetHref(url)) return true;
      if (reason && typeof setBetStep === "function") {
        setBetStep(reason);
        if (typeof renderPanel === "function") renderPanel(true);
      }
      console.log("[hty-inplay] \u76F4\u63A5\u8DF3\u8F6C\u6EDA\u7403\u9875", id, tab || "all", reason || "", force ? "(force)" : "");
      return performPageNavigation(url, reason || "gotoInplayMatchDirect", id);
    }
    function openInplayMatchPage(targetId, reason) {
      if (!targetId) return false;
      const userPick = isUserManualMatchPickReason(reason);
      if (!userPick && shouldBlockMatchAutoNav()) {
        console.log("[hty-inplay] \u672A\u767B\u5F55/\u767B\u5F55\u4E2D\uFF0C\u8DF3\u8FC7\u6253\u5F00", targetId);
        return false;
      }
      if (!userPick && shouldBlockAutoMatchNavigation(targetId, reason)) {
        console.log("[hty-inplay] \u7528\u6237\u624B\u52A8\u9009\u573A\u9501\u5B9A\uFF0C\u8DF3\u8FC7\u6253\u5F00", targetId);
        return false;
      }
      if (isMatchIdEnded(targetId) || isMatchLocallyEnded(targetId)) {
        console.log("[hty-inplay] \u8DF3\u8FC7\u6253\u5F00\u5DF2\u7ED3\u675F\u8D5B\u4E8B", targetId);
        return false;
      }
      const item = activeMatches.find(function(m) {
        return String(m.matchId) === String(targetId);
      });
      if (!userPick && item && !matchHasNavigablePendingWork(item)) {
        console.log("[hty-inplay] \u8DF3\u8FC7\u6253\u5F00\u65E0\u5F85\u6267\u884C\u7B56\u7565\u8D5B\u4E8B", targetId);
        return false;
      }
      if (isAlreadyOnMatchBetUrl(targetId)) return true;
      if (!userPick && !shouldAllowAutoNavigation(reason || "open-match")) return false;
      const url = inplayMatchUrl(targetId);
      if (normalizeMatchBetHref(window.location.href) === normalizeMatchBetHref(url)) return true;
      const label = item ? formatActiveMatchItem(item) : "#" + targetId;
      if (reason) {
        setBetStep(reason + "\uFF1A" + label);
        renderPanel(true);
      }
      console.log("[hty-inplay] \u8DF3\u8F6C\u6EDA\u7403\u9875", targetId, reason || "");
      return performPageNavigation(url, reason || "openInplayMatchPage", targetId);
    }
    function traceMatchUrl(id) {
      return TRACE_MATCH_BASE + encodeURIComponent(id);
    }
    function formatKickoffShort(kick) {
      if (!kick) return "";
      const m = String(kick).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
      if (m) return m[2] + "-" + m[3] + " " + m[4] + ":" + m[5];
      return String(kick);
    }
    function shortTournamentName(name) {
      const raw = String(name || "").trim();
      if (!raw) return "";
      const normalized = raw.replace(/（/g, "(").replace(/）/g, ")");
      const wcHosts = normalized.match(/^(\d{4})?世界杯\s*\(([^)]+)\)\s*$/);
      if (wcHosts) {
        const hosts = wcHosts[2] || "";
        if (/加拿大|墨西哥|美国|美加墨/.test(hosts)) {
          return (wcHosts[1] || "2026") + "\u7F8E\u52A0\u58A8";
        }
        return (wcHosts[1] || "") + "\u4E16\u754C\u676F";
      }
      return normalized.replace(/世界杯\s*\([^)]+\)/, "\u4E16\u754C\u676F");
    }
    function formatActiveMatchItem(item) {
      const home = item.homeName || "\u2014";
      const away = item.awayName || "\u2014";
      const kick = formatKickoffShort(item.kickoffTime);
      const phase = MATCH_PHASE_LABEL[resolveMatchPhase(item)] || resolveMatchPhase(item) || "\u2014";
      const apiPhase = String(item.matchPhase || "").toUpperCase();
      const resolved = resolveMatchPhase(item);
      let phaseHint = "";
      if (isMatchLocallyEnded(item.matchId)) {
        phaseHint = "(\u672C\u5730\u5DF2\u7ED3\u675F)";
      } else if (isCurrentMatchItem(item) && (apiPhase === "ENDED" || apiPhase === "FINISHED") && resolved === "IN_PLAY") {
        phaseHint = "(\u9875)";
      }
      const rules = item.ruleCount != null ? item.ruleCount + "\u6761\u7B56\u7565" : "";
      const meetCount = getMatchRuleMeetCount(item);
      const meetHint = meetCount > 0 ? meetCount + "\u6761\u8FBE\u6807" : "";
      const tour = shortTournamentName(item.tournamentName);
      const parts = [];
      if (kick) parts.push(kick);
      if (tour) parts.push(tour);
      parts.push(home + "vs" + away);
      parts.push(phase + phaseHint);
      if (rules) parts.push(rules);
      if (meetHint) parts.push(meetHint);
      return parts.join("  ");
    }
    function fetchActiveMatches() {
      return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
          method: "GET",
          url: ALERT_MATCHES_API,
          timeout: 15e3,
          onload: function(res) {
            try {
              const json = JSON.parse(res.responseText);
              if (String(json.code) !== "200") {
                reject(new Error(json.msg || "API \u8FD4\u56DE\u9519\u8BEF"));
                return;
              }
              resolve(Array.isArray(json.data) ? json.data : []);
            } catch (e) {
              reject(e);
            }
          },
          onerror: function() {
            reject(new Error("\u7B56\u7565\u8D5B\u4E8B\u63A5\u53E3\u7F51\u7EDC\u9519\u8BEF"));
          },
          ontimeout: function() {
            reject(new Error("\u7B56\u7565\u8D5B\u4E8B\u63A5\u53E3\u8BF7\u6C42\u8D85\u65F6"));
          }
        });
      });
    }
    function activeMatchesRenderKey() {
      if (matchesStatus === "err") return "err|" + matchesError;
      const rows = activeMatches.map(function(item) {
        return [
          item.matchId || "",
          item.kickoffTime || "",
          getMatchStatusValue(item) != null ? String(getMatchStatusValue(item)) : item.matchPhase || "",
          item.ruleCount != null ? String(item.ruleCount) : "",
          item.homeName || "",
          item.awayName || "",
          item.finalScore != null ? String(item.finalScore) : "",
          String(getMatchRuleMeetCount(item))
        ].join(":");
      }).join(";");
      const meetSig = Object.keys(matchRuleMeetCache).sort().map(function(id) {
        return id + ":" + matchRuleMeetCache[id].meetCount;
      }).join(",");
      return matchesStatus + "|" + matchId + "|" + activeMatches.length + "|" + rows + "|" + (isCurrentPageLive() ? "live" : "idle") + "|" + lastScanButtonCount + "|" + meetSig;
    }
    async function loadActiveMatches(silent) {
      const isSilent = !!silent;
      if (!isSilent && !activeMatches.length) {
        matchesStatus = "loading";
        matchesError = "";
        renderActiveMatches(document.getElementById(PANEL_ID));
      }
      try {
        activeMatches = await fetchActiveMatches();
        matchesStatus = "ok";
        matchesError = "";
      } catch (err) {
        if (!isSilent || !activeMatches.length) {
          activeMatches = [];
        }
        matchesStatus = "err";
        matchesError = err && err.message ? err.message : "\u52A0\u8F7D\u5931\u8D25";
      }
      const changed = activeMatchesRenderKey() !== lastMatchesListKey;
      if (changed) {
        renderActiveMatches(document.getElementById(PANEL_ID));
      }
      if (matchesStatus === "ok") {
        if (hasNavigableInPlayMatches() && !isSiteAccessBlockedPage() && !isCurrentMatchEnded()) {
          if (!shouldBlockMatchAutoNav() && !isUserManualMatchLockActive()) navSuppressedUntil = 0;
        }
        if (reconcileLocalEndedMatches()) {
          renderActiveMatches(document.getElementById(PANEL_ID));
        }
        if (!hasNavigableInPlayMatches()) {
          if (!isHubSportEventsPage()) {
            suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, "\u7B56\u7565\u5217\u8868\u65E0\u8FDB\u884C\u4E2D");
          }
        } else {
          void scanAllMatchesRuleMeet(false).then(async function() {
            if (shouldBlockMatchAutoNav()) return;
            if (isHubSportEventsPage()) {
              if (await maybeEnterMatchFromHubPage("\u7B56\u7565\u8D5B\u4E8B\u5C31\u7EEA\uFF0C\u8FDB\u5165\u6BD4\u8D5B")) return;
            }
            if (await maybeNavigateToRuleMeetMatch()) return;
            if (!isUserManualMatchLockActive()) void maybeAutoNavigateToInplay();
          });
        }
      }
    }
    function renderActiveMatches(panel) {
      if (!panel) return;
      const statusEl = panel.querySelector(".tm-hty-matches-status");
      const listEl = panel.querySelector(".tm-hty-matches-list");
      const endedSection = panel.querySelector(".tm-hty-matches-ended");
      const endedToggle = panel.querySelector(".tm-hty-ended-toggle");
      const endedListEl = panel.querySelector(".tm-hty-matches-ended-list");
      if (!statusEl || !listEl) return;
      const listKey = activeMatchesRenderKey();
      if (listKey === lastMatchesListKey) return;
      lastMatchesListKey = listKey;
      if (matchesStatus === "loading" && !activeMatches.length) {
        statusEl.textContent = "\u52A0\u8F7D\u4E2D\u2026";
        statusEl.dataset.kind = "info";
        listEl.innerHTML = "";
        if (endedSection) endedSection.style.display = "none";
        return;
      }
      if (matchesStatus === "err") {
        statusEl.textContent = matchesError || "\u52A0\u8F7D\u5931\u8D25";
        statusEl.dataset.kind = "err";
        if (!activeMatches.length) {
          listEl.innerHTML = "";
          if (endedSection) endedSection.style.display = "none";
        }
        return;
      }
      const liveMatches = activeMatches.filter(function(item) {
        return !isMatchEndedPhase(item);
      });
      const endedMatches = activeMatches.filter(function(item) {
        return isMatchEndedPhase(item);
      });
      const currentHit = activeMatches.some(function(item) {
        return String(item.matchId) === String(matchId);
      });
      let statusText = liveMatches.length + " \u573A";
      if (endedMatches.length) statusText += " \xB7 " + endedMatches.length + " \u5DF2\u7ED3\u675F";
      if (currentHit) statusText += " \xB7 \u542B\u5F53\u524D\u9875";
      statusEl.textContent = statusText;
      statusEl.dataset.kind = currentHit ? "ready" : "info";
      if (!liveMatches.length && !endedMatches.length) {
        listEl.innerHTML = '<div class="tm-hty-strategy-empty">\u6682\u65E0\u7B56\u7565\u8D5B\u4E8B</div>';
        if (endedSection) endedSection.style.display = "none";
        return;
      }
      if (!liveMatches.length) {
        listEl.innerHTML = '<div class="tm-hty-strategy-empty">\u6682\u65E0\u8FDB\u884C\u4E2D/\u672A\u5F00\u8D5B\u8D5B\u4E8B</div>';
      } else {
        listEl.innerHTML = liveMatches.map(function(item, idx) {
          return renderMatchListRow(item, idx);
        }).join("");
      }
      if (endedSection && endedToggle && endedListEl) {
        if (!endedMatches.length) {
          endedSection.style.display = "none";
        } else {
          endedSection.style.display = "";
          endedSection.dataset.collapsed = endedMatchesCollapsed ? "1" : "0";
          endedToggle.textContent = "\u5DF2\u7ED3\u675F (" + endedMatches.length + ") " + (endedMatchesCollapsed ? "\u25B8" : "\u25BE");
          endedListEl.style.display = endedMatchesCollapsed ? "none" : "";
          endedListEl.innerHTML = endedMatches.map(function(item, idx) {
            return renderMatchListRow(item, idx);
          }).join("");
        }
      }
    }
    function toggleEndedMatchesCollapsed(panel) {
      endedMatchesCollapsed = !endedMatchesCollapsed;
      const root = panel || document.getElementById(PANEL_ID);
      if (!root) return;
      const endedSection = root.querySelector(".tm-hty-matches-ended");
      const endedToggle = root.querySelector(".tm-hty-ended-toggle");
      const endedListEl = root.querySelector(".tm-hty-matches-ended-list");
      if (!endedSection || !endedToggle || !endedListEl) return;
      endedSection.dataset.collapsed = endedMatchesCollapsed ? "1" : "0";
      endedToggle.textContent = endedToggle.textContent.replace(/[▸▾]$/, endedMatchesCollapsed ? "\u25B8" : "\u25BE");
      endedListEl.style.display = endedMatchesCollapsed ? "none" : "";
    }
    function getCurrentMatchItem() {
      return activeMatches.find(function(item) {
        return String(item.matchId) === String(matchId);
      }) || null;
    }
    function getLiveMatchScore() {
      const item = getCurrentMatchItem();
      if (item && item.finalScore != null && item.finalScore !== "") {
        const parsed = parseScoreText(item.finalScore);
        if (parsed) return parsed;
      }
      const page = document.querySelector(PAGE_READY_SEL) || document.body;
      if (!page) return null;
      const scoreNodes = page.querySelectorAll(
        '[data-testid*="score" i], [data-testid*="Score"], [data-testid*="match-score" i],[class*="score" i], [class*="Score"]'
      );
      for (let i = 0; i < scoreNodes.length; i++) {
        const parsed = parseScoreText((scoreNodes[i].textContent || "").trim());
        if (parsed) return parsed;
      }
      const blob = (page.innerText || "").slice(0, 4e3);
      const loose = blob.match(/(?:^|\s)(\d{1,2})\s*[-:：]\s*(\d{1,2})(?:\s|$)/m);
      if (loose) {
        return {
          home: parseInt(loose[1], 10),
          away: parseInt(loose[2], 10),
          raw: loose[1] + "-" + loose[2]
        };
      }
      return null;
    }
    function countMatchesByPhase(phase) {
      return activeMatches.filter(function(item) {
        return resolveMatchPhase(item) === phase;
      }).length;
    }
    function getSortedInPlayMatches(sourceList) {
      const list = sourceList || activeMatches;
      return list.filter(function(item) {
        return resolveMatchPhase(item) === "IN_PLAY" && item.matchId;
      }).sort(function(a, b) {
        const ka = parseKickoffMs(a.kickoffTime) || 0;
        const kb = parseKickoffMs(b.kickoffTime) || 0;
        if (ka !== kb) return ka - kb;
        return String(a.matchId).localeCompare(String(b.matchId));
      });
    }
    function getSortedInPlayMatchIds(sourceList) {
      return getSortedInPlayMatches(sourceList).map(function(item) {
        return String(item.matchId);
      });
    }
    function getNavigableInPlayMatches(sourceList) {
      return getSortedInPlayMatches(sourceList).filter(function(item) {
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
      if (reason) console.log("[hty-inplay] \u6682\u505C\u81EA\u52A8\u8DF3\u8F6C", reason);
    }
    function isLoginUiBusy() {
      if (reloginInProgress) return true;
      if (Date.now() < loginNavLockUntil) return true;
      try {
        if (typeof isSimplePasswordModalVisible === "function" && isSimplePasswordModalVisible()) {
          return true;
        }
        if (typeof isIdleLoginModalVisible === "function" && isIdleLoginModalVisible()) {
          return true;
        }
      } catch (e) {
      }
      return false;
    }
    let __loginNavGate = null;
    function ensureLoginNavGate() {
      if (!__loginNavGate) {
        __loginNavGate = createLoginNavGate({
          isLoginUiBusy,
          isLoggedIn
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
      suppressNavigation(hold, reason || "\u767B\u5F55\u4E2D\u7981\u6B62\u8DF3\u8F6C");
    }
    function shouldAllowAutoNavigation(reason) {
      if (shouldBlockMatchAutoNav()) {
        console.log("[hty-inplay] \u672A\u767B\u5F55/\u767B\u5F55\u4E2D\uFF0C\u8DF3\u8FC7\u5BFC\u822A", reason || "");
        return false;
      }
      if (isNavSuppressed()) {
        console.log("[hty-inplay] \u5BFC\u822A\u9759\u9ED8\u4E2D\uFF0C\u8DF3\u8FC7", reason || "");
        return false;
      }
      if (!hasNavigableInPlayMatches()) {
        suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, "\u65E0\u8FDB\u884C\u4E2D\u6BD4\u8D5B");
        return false;
      }
      return true;
    }
    function dismissMatchBlockedModal() {
      const confirmBtn = findModalConfirmButton(["\u6E29\u99A8\u63D0\u793A", "\u5F53\u524D\u65E0\u6CD5\u8FDB\u5165"]) || findModalConfirmButton(["\u8D5B\u4E8B", "\u4E0D\u5B58\u5728"]) || findModalConfirmButton(["\u6BD4\u8D5B", "\u4E0D\u5B58\u5728"]);
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
          const curPending = countPendingWorkStrategies(strategyList);
          rememberMatchPendingWork(matchId, curPending);
          const curMeet = getCurrentMatchPendingRuleMeetCount();
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
        const tasks = inPlay.map(function(item) {
          const id = String(item.matchId);
          if (id === String(matchId) && (strategyList.length || strategyStatus === "ok")) {
            return Promise.resolve({
              id,
              meetCount: getCurrentMatchPendingRuleMeetCount(),
              pendingCount: countPendingWorkStrategies(strategyList)
            });
          }
          return fetchAlertStrategies(id).then(function(payload) {
            const list = Array.isArray(payload.data) ? payload.data : [];
            return {
              id,
              meetCount: countPendingRuleMeet(list),
              pendingCount: countPendingWorkStrategies(list)
            };
          }).catch(function() {
            const prevMeet = matchRuleMeetCache[id];
            const prevWork = matchPendingWorkCache[id];
            return {
              id,
              meetCount: prevMeet ? prevMeet.meetCount : 0,
              pendingCount: prevWork && prevWork.known ? prevWork.pendingCount : -1
            };
          });
        });
        const results = await Promise.all(tasks);
        const nextMeet = {};
        results.forEach(function(r) {
          if (r.pendingCount >= 0) rememberMatchPendingWork(r.id, r.pendingCount);
          if (r.meetCount > 0) nextMeet[r.id] = { meetCount: r.meetCount, at: Date.now() };
        });
        matchRuleMeetCache = nextMeet;
        lastRuleMeetScanAt = Date.now();
        lastMatchesListKey = "";
        console.log(
          "[hty-inplay] ruleMeet \u626B\u63CF",
          Object.keys(nextMeet).map(function(id) {
            return id + ":" + nextMeet[id].meetCount;
          }).join(", ") || "\u65E0\u8FBE\u6807",
          "| pending",
          results.map(function(r) {
            return r.id + ":" + (r.pendingCount >= 0 ? r.pendingCount : "?");
          }).join(", ") || "\u65E0"
        );
        return matchRuleMeetCache;
      } finally {
        ruleMeetScanInFlight = false;
      }
    }
    async function maybeNavigateToRuleMeetMatch() {
      if (placing || matchEndedHandling || shouldBlockMatchAutoNav()) return false;
      if (targetOption || strategyStates.some(function(st) {
        return st.actionable;
      })) {
        return false;
      }
      if (!canLeaveCurrentMatchForAutoSwitch()) return false;
      if (!shouldAllowAutoNavigation("ruleMeet")) return false;
      if (getNavigableInPlayMatches().length < 2) return false;
      await scanAllMatchesRuleMeet(false);
      const targetId = pickRuleMeetNavigableMatch(matchId);
      if (!targetId || String(targetId) === String(matchId)) return false;
      const navGap = Date.now() - lastInplayNavAt;
      if (navGap < RULE_MEET_NAV_COOLDOWN_MS) return false;
      const meetCount = getMatchRuleMeetCount({ matchId: targetId });
      const curMeet = getCurrentMatchRuleMeetCountForNav();
      console.log(
        "[hty-inplay] ruleMeet \u4F18\u5148\u5207\u6362",
        matchId,
        "(" + curMeet + ")",
        "->",
        targetId,
        meetCount,
        "\u6761"
      );
      clearUserManualMatchLock();
      return navigateToInplayMatch(targetId, "\u89C4\u5219\u5DF2\u8FBE\u6807\uFF0C\u5207\u6362\u4E0B\u5355(" + meetCount + "\u6761)");
    }
    let __navPicker = null;
    function ensureNavPicker() {
      if (__navPicker) return __navPicker;
      __navPicker = createNavPicker({
        getNavigableInPlayMatches,
        getMatchRuleMeetCount,
        matchHasNavigablePendingWork,
        isUserManualMatchActive,
        shouldHoldCurrentMatch,
        isCurrentMatchEnded,
        parseKickoffMs,
        KICKOFF_NAV_PRIORITY_MS,
        getMatchId: function() {
          return matchId;
        },
        saveRotateIndex
      });
      return __navPicker;
    }
    function pickPreferredNavigableMatch(excludeId, currentId, sourceList) {
      return ensureNavPicker().pickPreferredNavigableMatch(
        excludeId,
        currentId,
        sourceList || activeMatches
      );
    }
    function saveRotateIndex(idx, total) {
      if (total <= 0) return;
      try {
        sessionStorage.setItem(KEEPALIVE_ROTATE_INDEX_KEY, String((idx % total + total) % total));
      } catch (e) {
      }
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
      return resolveMatchPhase(item) === "IN_PLAY" && isPageReady();
    }
    function buildWaitingKickoffMessage() {
      if (isSiteAccessBlockedPage()) return "\u7AD9\u70B9\u8BBF\u95EE\u88AB\u963B\u65AD\uFF0C\u5DF2\u505C\u6B62\u81EA\u52A8\u8DF3\u8F6C";
      const inplayCount = countMatchesByPhase("IN_PLAY");
      const waitingCount = countMatchesByPhase("NOT_STARTED");
      if (inplayCount > 0) return "";
      if (waitingCount > 0) return "\u7B49\u5F85\u6BD4\u8D5B\u5F00\u59CB\uFF08" + waitingCount + " \u573A\u672A\u5F00\u8D5B\uFF09";
      if (activeMatches.length > 0) return "\u5168\u90E8\u6BD4\u8D5B\u5DF2\u7ED3\u675F\uFF0C\u505C\u6B62\u81EA\u52A8\u8DF3\u8F6C";
      return "\u6682\u65E0\u7B56\u7565\u8D5B\u4E8B";
    }
    function setWaitingKickoffState() {
      const msg = buildWaitingKickoffMessage();
      setBetStep(msg);
      setBetResult("pending", "\u7B49\u5F85\u6EDA\u7403\u5F00\u8D5B");
      renderPanel(true);
      if (!pollTimer) schedulePoll();
    }
    function pickNextNavigableMatchId(excludeIds) {
      return ensureNavPicker().pickNextNavigableMatchId(excludeIds);
    }
    async function navigateToInplayMatch(targetId, reason) {
      if (!targetId || String(targetId) === String(matchId)) return false;
      if (shouldBlockMatchAutoNav()) {
        console.log("[hty-inplay] \u672A\u767B\u5F55/\u767B\u5F55\u4E2D\uFF0C\u8DF3\u8FC7\u5BFC\u822A", targetId, reason || "");
        return false;
      }
      if (isMatchLocallyEnded(targetId) || isMatchIdEnded(targetId)) {
        console.warn("[hty-inplay] \u8DF3\u8FC7\u5DF2\u7ED3\u675F\u8D5B\u4E8B", targetId);
        const altId = pickNextNavigableMatchId([targetId, matchId]);
        if (altId) return navigateToInplayMatch(altId, reason || "\u8DF3\u8FC7\u5DF2\u7ED3\u675F\u8D5B\u4E8B");
        return false;
      }
      const item = activeMatches.find(function(m) {
        return String(m.matchId) === String(targetId);
      });
      if (item && !matchHasNavigablePendingWork(item)) {
        console.warn("[hty-inplay] \u8DF3\u8FC7\u65E0\u5F85\u6267\u884C\u7B56\u7565\u8D5B\u4E8B", targetId);
        rememberMatchPendingWork(targetId, 0);
        const altId = pickNextNavigableMatchId([targetId, matchId]);
        if (altId) return navigateToInplayMatch(altId, reason || "\u8DF3\u8FC7\u65E0\u5F85\u6267\u884C\u7B56\u7565");
        return false;
      }
      return openInplayMatchPage(targetId, reason || "\u8DF3\u8F6C\u6EDA\u7403\u9875");
    }
    async function maybeAutoNavigateToInplay() {
      if (placing || matchEndedHandling || shouldBlockMatchAutoNav()) return false;
      if (isUserManualMatchLockActive()) return false;
      if (!canLeaveCurrentMatchForAutoSwitch()) return false;
      if (shouldHoldCurrentMatch()) return false;
      if (Date.now() - lastInplayNavAt < INPLAY_NAV_COOLDOWN_MS) return false;
      if (!shouldAllowAutoNavigation("auto-nav")) {
        if (!hasNavigableInPlayMatches()) setWaitingKickoffState();
        return false;
      }
      await scanAllMatchesRuleMeet(false);
      const endedModal = isMatchEndedModalVisible();
      const excludeId = endedModal || isCurrentMatchEnded() ? matchId : "";
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
      const targetItem = activeMatches.find(function(m) {
        return String(m.matchId) === String(targetId);
      });
      let reason = "\u8FDB\u5165\u7B56\u7565\u6EDA\u7403\u9875";
      if (endedModal) {
        reason = "\u8D5B\u4E8B\u5DF2\u7ED3\u675F\uFF0C\u5207\u6362\u8FDB\u884C\u4E2D";
      } else if (isCurrentMatchNotStarted() && resolveMatchPhase(targetItem) === "IN_PLAY") {
        reason = "\u6709\u8FDB\u884C\u4E2D\u8D5B\u4E8B\uFF0C\u5207\u6362\u6EDA\u7403";
      } else if (targetItem && getMatchRuleMeetCount(targetItem) > 0) {
        reason = "\u89C4\u5219\u5DF2\u8FBE\u6807\uFF0C\u5207\u6362\u4E0B\u5355(" + getMatchRuleMeetCount(targetItem) + "\u6761)";
      } else if (targetItem && isKickoffReached(targetItem, KICKOFF_EARLY_MS)) {
        const km = parseKickoffMs(targetItem.kickoffTime);
        if (km && Date.now() - km <= KICKOFF_NAV_PRIORITY_MS) {
          reason = "\u6BD4\u8D5B\u5DF2\u5F00\u59CB\uFF0C\u8FDB\u5165\u6EDA\u7403";
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
      __heartbeatRunner = createHeartbeatRunner(function(tick) {
        heartbeatTick = tick;
        return [
          {
            name: "waf",
            run: async function() {
              if (!isSiteAccessBlockedPage()) return false;
              suppressNavigation(WAF_RECOVERY_COOLDOWN_MS, "WAF\u963B\u65AD\u9875");
              return true;
            }
          },
          {
            name: "list-boot",
            run: async function() {
              if (!isInplayListPage()) return false;
              void ensureListPageBoot();
              return true;
            }
          },
          {
            name: "hub-boot",
            run: async function() {
              if (!isStrandedSportEventsPage()) return false;
              void ensureStrandedSportEventsBoot();
              try {
                await loadActiveMatches(true);
                await scanAllMatchesRuleMeet(heartbeatTick % 2 === 0);
                renderPanel(true);
                await maybeEnterMatchFromHubPage("\u603B\u89C8\u9875\u8FDB\u5165\u7B56\u7565\u6BD4\u8D5B");
              } catch (e) {
                console.warn("[hty-inplay] \u603B\u89C8\u9875\u5237\u65B0/\u8FDB\u573A", e);
              }
              return true;
            }
          },
          {
            name: "wrong-sport",
            run: async function() {
              if (!isWrongSportSectionPage()) return false;
              recoverFromWrongSportSection("\u5FC3\u8DF3\u68C0\u6D4B\u5230\u975E\u8DB3\u7403\u7248\u5757");
              return true;
            }
          },
          {
            name: "idle-login",
            run: async function() {
              if (!isIdleLoginModalVisible()) return false;
              dismissIdleLoginModal();
              return true;
            }
          },
          {
            name: "login-gate",
            run: async function() {
              return shouldBlockMatchAutoNav();
            }
          },
          {
            name: "bet-submitted-finish",
            run: async function() {
              if (!(placing && isBetSubmittedDrawerVisible())) return false;
              console.warn("[hty-inplay] \u5FC3\u8DF3\uFF1A\u6295\u6CE8\u4E2D\u4F46\u5DF2\u63D0\u4EA4\uFF0C\u5F3A\u5236\u6309\u6210\u529F\u6536\u5C3E");
              placing = false;
              restorePanelAfterBet();
              setBetResult("success", "\u5DF2\u63D0\u4EA4\uFF08\u5FC3\u8DF3\u6536\u5C3E\uFF09");
              setBetStep("\u68C0\u6D4B\u5230\u5DF2\u63D0\u4EA4\uFF0C\u6B63\u5728\u540C\u6B65\u72B6\u6001\u2026");
              renderPanel(true);
              const opt = targetOption;
              if (opt) {
                const rec = buildBetRecordFromUiSuccess(opt);
                lastStrategyBetRecord = rec;
                void finalizeBetSuccess(opt, rec, true, "\u5FC3\u8DF3\u6536\u5C3E\xB7UI\u5DF2\u63D0\u4EA4");
              } else {
                dismissBetSubmittedDrawer(3).catch(function() {
                });
              }
              return true;
            }
          },
          {
            name: "match-ended",
            run: async function() {
              if (!isCurrentMatchEnded()) return false;
              await handleMatchEnded();
              return true;
            }
          },
          {
            name: "stranded-recover",
            run: async function() {
              if (!(matchId && isStrandedSportEventsPage())) return false;
              if (shouldAllowAutoNavigation("stranded-recover")) {
                recoverStrandedFromMatchContext();
              }
              return true;
            }
          },
          {
            name: "hidden-light",
            run: async function() {
              if (!(document.hidden || pageHidden)) return false;
              if (heartbeatTick % 4 === 0) await loadStrategies(true);
              return true;
            }
          },
          {
            name: "matches-dedup-rulemeet",
            run: async function() {
              await loadActiveMatches(true);
              if (!placing && await resolvePendingBetDedup()) return true;
              if (hasNavigableInPlayMatches() && getNavigableInPlayMatches().length >= 2) {
                await scanAllMatchesRuleMeet(false);
                if (!placing && !targetOption && await maybeNavigateToRuleMeetMatch()) return true;
              }
              return false;
            }
          },
          {
            name: "strategy-odds-bet",
            run: async function() {
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
            }
          }
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
        runHeartbeatTask().catch(function(e) {
          console.warn("[hty-inplay] heartbeat", e);
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
      lastMatchesListKey = "";
      lastStrategyListKey = "";
      lastStrategyHitKey = "";
      lastPanelKey = "";
      lastStatusPanelKey = "";
      lastOddsSignature = "";
      targetOption = null;
      strategyList = [];
      strategyTrigger = "";
      lastMatchScanAt = 0;
      loadActiveMatches(true);
      loadStrategies(false);
    }
    function checkUrlChange() {
      const href = window.location.href;
      const prevTab = lastWatchedCategoryTab;
      const nextTab = isOnInplayMatchPage() ? getActiveMarketCategoryTab() : "";
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
        matchId = "";
        void ensureStrandedSportEventsBoot();
        return;
      }
      if (isWrongSportSectionPage()) {
        matchId = "";
        recoverFromWrongSportSection("\u8DEF\u7531\u8FDB\u5165\u975E\u8DB3\u7403\u7248\u5757\uFF0C\u7EDF\u4E00\u62C9\u56DE\u8DB3\u7403\u6EDA\u7403\u5217\u8868");
        return;
      }
      if (isInplayListPage()) {
        matchId = "";
        void ensureListPageBoot();
        if (isKeepaliveEnterMatchPhase2()) {
          setKeepalivePhaseEnter2();
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
      history.pushState = function() {
        const ret = origPush.apply(this, arguments);
        checkUrlChange();
        return ret;
      };
      history.replaceState = function() {
        const ret = origReplace.apply(this, arguments);
        checkUrlChange();
        return ret;
      };
      window.addEventListener("popstate", checkUrlChange);
      routeWatchTimer = setInterval(checkUrlChange, 2e3);
    }
    function isIdleLoginModalVisible() {
      if (!document.body) return false;
      return !!findVisibleDialogContaining([IDLE_LOGIN_HINT, "\u91CD\u65B0\u767B\u5F55"]) || !!findVisibleDialogContaining(["\u6E29\u99A8\u63D0\u793A", IDLE_LOGIN_HINT]);
    }
    function findModalConfirmButton(blockHints) {
      const nodes = document.querySelectorAll('button, [role="button"], a');
      for (let i = 0; i < nodes.length; i++) {
        const btn = nodes[i];
        if (!isElementVisible(btn)) continue;
        const label = (btn.textContent || "").replace(/\s+/g, "");
        if (label !== "\u786E\u5B9A") continue;
        let parent = btn;
        for (let depth = 0; depth < 12 && parent; depth++) {
          const block = parent.textContent || "";
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
      "\u8D54\u7387\u5DF2\u66F4\u6539",
      "\u8D54\u7387\u5DF2\u53D8\u66F4",
      "\u8D54\u7387\u53D8\u52A8",
      "\u8D54\u7387\u53D8\u5316",
      "\u8D54\u7387\u6216\u6295\u6CE8\u9879\u5DF2\u66F4\u6539",
      "\u8D54\u7387\u3001\u6295\u6CE8\u9879\u6216\u6BD4\u5206\u5DF2\u66F4\u6539",
      "\u6295\u6CE8\u9879\u7684\u8D54\u7387\u3001\u76D8\u53E3\u6216\u6709\u6548\u6027\u5DF2\u66F4\u6539",
      "\u76D8\u53E3\u5DF2\u66F4\u6539"
    ];
    const ODDS_CHANGE_CONFIRM_LABELS = ["\u786E\u5B9A", "OK", "\u63A5\u53D7\u66F4\u6539", "\u63A5\u53D7\u53D8\u66F4\u5E76\u6295\u6CE8"];
    function textHasOddsChangeHint(text) {
      const normalized = normalizeHintText(text || "");
      if (!normalized) return false;
      if (normalized.indexOf("\u5DF2\u63D0\u4EA4") >= 0) return false;
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
      if (cart && isElementVisible(cart) && textHasOddsChangeHint(cart.textContent || "")) {
        return true;
      }
      const roots = getModalCandidateRoots();
      for (let r = 0; r < roots.length; r++) {
        if (textHasOddsChangeHint(roots[r].textContent || "")) return true;
      }
      return false;
    }
    function labelMatchesConfirm(label, wanted) {
      const normalized = normalizeHintText(label);
      if (!normalized) return false;
      for (let j = 0; j < wanted.length; j++) {
        const want = normalizeHintText(wanted[j]);
        if (normalized === want) return true;
        if (want.indexOf("\u63A5\u53D7") >= 0 && normalized.indexOf("\u63A5\u53D7") >= 0) return true;
        if (want === "OK" && /^accept$/i.test(normalized)) return true;
      }
      return false;
    }
    function findConfirmInRoot(root, labels) {
      if (!root) return null;
      const wanted = labels || ODDS_CHANGE_CONFIRM_LABELS;
      const nodes = root.querySelectorAll(
        'button, [role="button"], a, [class*="btn"], [class*="Btn"], [class*="button"], [class*="Button"], [data-testid*="confirm"], [data-testid*="Confirm"]'
      );
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!isElementVisible(el)) continue;
        if (!labelMatchesConfirm(el.textContent || "", wanted)) continue;
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area <= 0) continue;
        const t = normalizeHintText(el.textContent || "");
        const preferLarge = t.indexOf("\u63A5\u53D7") >= 0;
        const score = preferLarge ? 1e6 + rect.top * 10 + area : 1e6 - area + rect.top;
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
      if (cart && textHasOddsChangeHint(cart.textContent || "")) {
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
        setBetStep("\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u786E\u5B9A\u7EE7\u7EED\u2026");
        renderPanel(true);
        const ok = await dismissOddsChangedModalIfAny();
        if (!ok) return false;
        await humanDelay(300, 600);
      }
      return !isOddsChangedModalVisible() && !(findBetActionButton() && isAcceptChangesBtn(findBetActionButton()));
    }
    function findMatchEndedConfirmButton() {
      return findModalConfirmButton([MATCH_ENDED_HINT]) || findModalConfirmButton(["\u6E29\u99A8\u63D0\u793A", "\u5F53\u524D\u65E0\u6CD5\u8FDB\u5165"]);
    }
    function dismissIdleLoginModal() {
      if (!isIdleLoginModalVisible()) return false;
      const btn = findModalConfirmButton(["\u6E29\u99A8\u63D0\u793A", IDLE_LOGIN_HINT]) || findModalConfirmButton([IDLE_LOGIN_HINT, "\u91CD\u65B0\u767B\u5F55"]);
      if (btn) safeClick(btn);
      loginCache = { value: false, ts: 0 };
      setBetStep("\u4F1A\u8BDD\u95F2\u7F6E\u5DF2\u8FC7\u671F\uFF0C\u5C1D\u8BD5\u81EA\u52A8\u767B\u5F55\u2026");
      setBetResult("pending", "\u7B49\u5F85\u767B\u5F55");
      renderPanel(true);
      console.warn("[hty-inplay] \u68C0\u6D4B\u5230\u95F2\u7F6E\u767B\u51FA\u5F39\u7A97");
      setTimeout(function() {
        tryAutoRelogin({ urgent: true }).catch(function(e) {
          console.warn("[hty-inplay] \u95F2\u7F6E\u540E\u81EA\u52A8\u767B\u5F55", e);
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
        console.log("[hty-inplay] \u68C0\u6D4B\u5230\u8D5B\u4E8B\u6682\u4E0D\u53EF\u8FDB\u5F39\u7A97\uFF08\u975E\u5DF2\u7ED3\u675F\uFF09");
        dismissMatchBlockedModal();
        await humanDelay(400, 800);
        if (!shouldAllowAutoNavigation("blocked-modal") || isCurrentMatchEnded() || isMatchEndedModalVisible()) {
          setWaitingKickoffState();
          lastBlockedHandleAt = Date.now();
          suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, "\u6682\u4E0D\u53EF\u8FDB/\u5DF2\u7ED3\u675F");
          return true;
        }
        const item = getCurrentMatchItem();
        if (item && isKickoffReached(item, KICKOFF_EARLY_MS) && matchId && !isCurrentMatchEnded()) {
          setBetStep("\u5F00\u8D5B\u5207\u6362\u6EDA\u7403\u2026");
          lastBlockedHandleAt = Date.now();
          gotoInplayMatch(matchId, "tg", true);
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
        console.log("[hty-inplay] \u68C0\u6D4B\u5230\u8D5B\u4E8B\u5DF2\u7ED3\u675F" + (modalEnded ? "\uFF08\u5F39\u7A97\uFF09" : "\uFF08\u72B6\u6001\uFF09"));
        if (matchId && !isMatchLocallyEnded(matchId)) {
          markMatchLocallyEnded(matchId, modalEnded ? "page_modal" : "page_status");
        }
        if (isUserManualMatchActive()) clearUserManualMatchLock();
        setBetResult("pending", "\u5F53\u524D\u8D5B\u4E8B\u5DF2\u7ED3\u675F");
        setBetStep("\u8D5B\u4E8B\u5DF2\u7ED3\u675F\uFF0C\u51C6\u5907\u5207\u6362\u2026");
        renderPanel(true);
        const confirmBtn = findMatchEndedConfirmButton();
        if (confirmBtn) {
          safeClick(confirmBtn);
          await humanDelay(400, 800);
        }
        try {
          await loadActiveMatches(true);
        } catch (e) {
          console.warn("[hty-inplay] \u5237\u65B0\u7B56\u7565\u8D5B\u4E8B\u5931\u8D25", e);
        }
        const nextId = pickNextNavigableMatchId([matchId]);
        lastEndedSwitchAt = Date.now();
        if (!nextId) {
          suppressNavigation(NAV_SUPPRESS_NO_INPLAY_MS, "\u8D5B\u4E8B\u5DF2\u7ED3\u675F\u4E14\u65E0\u4E0B\u4E00\u573A");
          setWaitingKickoffState();
          targetOption = null;
          strategyStates = [];
          lastScanButtonCount = 0;
          return true;
        }
        await navigateToInplayMatch(nextId, "\u8D5B\u4E8B\u5DF2\u7ED3\u675F\uFF0C\u5207\u6362\u8FDB\u884C\u4E2D");
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
          noteCurrentMatchUnavailable("page_ended");
          handleMatchEnded().catch(function(e) {
            console.error("[hty-inplay] handleMatchEnded", e);
          });
          return;
        }
        if (isMatchBlockedModalVisible()) {
          handleMatchBlocked().catch(function(e) {
            console.error("[hty-inplay] handleMatchBlocked", e);
          });
        }
      }
      matchEndedWatchTimer = setInterval(checkEnded, 2e3);
      function onDomChange() {
        scheduleDomCheck("matchEnded", checkEnded, DOM_CHECK_DEBOUNCE_MS);
      }
      function attachObserver() {
        if (matchEndedObserver || !document.body) return;
        matchEndedObserver = new MutationObserver(onDomChange);
        matchEndedObserver.observe(document.body, { childList: true, subtree: false });
      }
      if (document.body) attachObserver();
      else document.addEventListener("DOMContentLoaded", attachObserver);
    }
    function isElementVisible(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    }
    function normalizeHintText(text) {
      return String(text || "").replace(/\s+/g, "");
    }
    function nodeTextContainsAll(node, hints) {
      const text = normalizeHintText(node.textContent || "");
      for (let i = 0; i < hints.length; i++) {
        if (text.indexOf(normalizeHintText(hints[i])) < 0) return false;
      }
      return true;
    }
    function getModalCandidateRoots() {
      const roots = [];
      const selectors = [
        '[role="dialog"]',
        "dialog",
        '[data-testid*="overlay"]',
        '[data-testid*="modal"]',
        '[data-testid*="Modal"]'
      ];
      const seen = /* @__PURE__ */ new Set();
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
      domCheckTimers[key] = setTimeout(function() {
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
      document.addEventListener("visibilitychange", function() {
        pageHidden = document.hidden;
        if (document.hidden) {
          teardownOddsObserver();
        } else {
          loginCache.ts = 0;
          syncOddsObserverState();
          runHeartbeatTask().catch(function(e) {
            console.warn("[hty-inplay] visibility resume", e);
          });
          if (panelReady && strategyList.length && !placing) {
            refreshTargetOption(true).then(function() {
              renderPanel(false, false);
            }).catch(function(e) {
              console.warn("[hty-inplay] visibility rescan", e);
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
        const label = (el.textContent || "").replace(/\s+/g, "");
        if (label === "\u6CE8\u518C") return el;
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
        '[data-testid*="UserBalance"]'
      ];
      for (let i = 0; i < positiveSelectors.length; i++) {
        const el = document.querySelector(positiveSelectors[i]);
        if (isElementVisible(el)) return true;
      }
      return false;
    }
    function isLoggedIn() {
      if (!/\/login/i.test(window.location.pathname) && hasVisibleLoggedOutAuthButtons()) {
        loginCache = { value: false, ts: Date.now() };
        return false;
      }
      const now = Date.now();
      if (now - loginCache.ts < LOGIN_CACHE_MS) return loginCache.value;
      let result = false;
      if (!/\/login/i.test(window.location.pathname)) {
        result = hasVisibleLoggedInBalanceUi();
      }
      loginCache = { value: result, ts: now };
      return result;
    }
    function setReloginStatus(msg) {
      console.log("[hty-inplay] " + msg);
      if (!matchId) return;
      setBetStep(msg);
      renderPanel(true);
    }
    function setNativeInputValue(input, value) {
      if (!input) return;
      const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (input._valueTracker) {
        input._valueTracker.setValue("");
      }
      if (desc && desc.set) desc.set.call(input, value);
      else input.value = value;
      dispatchInputEvents(input, value, "insertFromPaste");
    }
    function isSimplePasswordModalVisible() {
      if (!document.body) return false;
      return !!findVisibleDialogContaining(["\u7B80\u6613\u5BC6\u7801"]) || !!findVisibleDialogContaining(["\u56DB\u4F4D\u6570\u5B57"]) || !!findVisibleDialogContaining(["\u8BBE\u7F6E\u7B80\u6613\u5BC6\u7801"]);
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
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return isSimplePasswordInput(el);
      if (el.isContentEditable) return true;
      const ce = el.getAttribute && el.getAttribute("contenteditable");
      return ce === "" || ce === "true";
    }
    function isLikelyPageSearchInput(input) {
      if (!input || input.tagName !== "INPUT") return false;
      const type = String(input.type || "").toLowerCase();
      if (type === "search") return true;
      const hints = [
        input.placeholder,
        input.getAttribute("aria-label"),
        input.name,
        input.id,
        input.getAttribute("data-testid"),
        input.className
      ].join(" ").toLowerCase();
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
        if (rect.width > 0 && rect.height > 0 && rect.left >= mr.left - 12 && rect.right <= mr.right + 12 && rect.top >= mr.top - 12 && rect.bottom <= mr.bottom + 12) {
          return true;
        }
      }
      return false;
    }
    function isLikelyHiddenOtpInput(input) {
      if (!input || input.tagName !== "INPUT") return false;
      if (String(input.type || "").toLowerCase() !== "hidden") return false;
      const maxLen = Number(input.maxLength);
      if (maxLen > 0 && maxLen <= 6) return true;
      const mode = String(input.inputMode || input.getAttribute("inputmode") || "").toLowerCase();
      if (mode === "numeric") return true;
      const auto = String(input.autocomplete || input.getAttribute("autocomplete") || "").toLowerCase();
      if (auto.indexOf("one-time-code") >= 0) return true;
      const name = String(input.name || input.id || input.getAttribute("aria-label") || "").toLowerCase();
      return /pin|password|code|otp|verify|simple/.test(name);
    }
    function isSimplePasswordInput(input) {
      if (!input) return false;
      if (input.tagName !== "INPUT" && input.tagName !== "TEXTAREA") return false;
      if (isLikelyPageSearchInput(input)) return false;
      const type = String(input.type || "").toLowerCase();
      if (type === "hidden") {
        const modal = findSimplePasswordModalRoot();
        if (modal && modal.contains(input)) return true;
        return isLikelyHiddenOtpInput(input);
      }
      if (type === "password" || type === "tel" || type === "number" || type === "text") return true;
      const mode = String(input.inputMode || input.getAttribute("inputmode") || "").toLowerCase();
      if (mode === "numeric") return true;
      const maxLen = Number(input.maxLength);
      if (maxLen > 0 && maxLen <= 6) return true;
      const auto = String(input.autocomplete || input.getAttribute("autocomplete") || "").toLowerCase();
      if (auto.indexOf("one-time-code") >= 0) return true;
      const name = String(input.name || input.id || input.getAttribute("aria-label") || "").toLowerCase();
      return name.indexOf("pin") >= 0 || name.indexOf("password") >= 0 || name.indexOf("code") >= 0;
    }
    function isValidSimplePasswordTarget(input) {
      if (!input) return false;
      if (isLikelyPageSearchInput(input)) return false;
      const modal = findSimplePasswordModalRoot();
      if (modal && modal.contains(input) && (input.tagName === "INPUT" || input.tagName === "TEXTAREA")) {
        const type = String(input.type || "").toLowerCase();
        if (type === "hidden" || type === "text" || type === "tel" || type === "password" || type === "number") {
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
      walkDomIncludingShadow(scope, function(node) {
        if (node.tagName !== "INPUT") return;
        if (isLikelyPageSearchInput(node)) return;
        const type = String(node.type || "").toLowerCase();
        if (type === "hidden") {
          anyHidden = node;
          if (isLikelyHiddenOtpInput(node)) namedHidden = node;
          return;
        }
        if ((type === "text" || type === "tel" || type === "password" || type === "number") && modal && modal.contains(node) && !isElementVisible(node)) {
          offscreenText = node;
        }
      });
      return namedHidden || offscreenText || anyHidden;
    }
    function findSimplePasswordModalRoot() {
      return findVisibleDialogContaining(["\u8BBE\u7F6E\u7B80\u6613\u5BC6\u7801"]) || findVisibleDialogContaining(["\u7B80\u6613\u5BC6\u7801", "\u56DB\u4F4D"]) || findVisibleDialogContaining(["\u7B80\u6613\u5BC6\u7801"]) || findVisibleDialogContaining(["\u56DB\u4F4D\u6570\u5B57"]);
    }
    function getSimplePasswordSearchRoot() {
      const modal = findSimplePasswordModalRoot();
      if (!modal) return document.body;
      let root = modal;
      let node = modal;
      while (node && node !== document.body) {
        const role = node.getAttribute && node.getAttribute("role");
        const testid = node.getAttribute && node.getAttribute("data-testid") || "";
        const style = window.getComputedStyle(node);
        if (role === "dialog" || node.tagName === "DIALOG" || /modal|overlay|dialog|popup/i.test(String(node.className || "")) || /modal|overlay|dialog|popup/i.test(testid) || style.position === "fixed") {
          root = node;
        }
        node = node.parentElement;
      }
      return root || modal;
    }
    function collectSimplePasswordInputs(root) {
      const seen = /* @__PURE__ */ new Set();
      const matched = [];
      function pushInput(input) {
        if (!input || seen.has(input)) return;
        seen.add(input);
        matched.push(input);
      }
      walkDomIncludingShadow(root, function(node) {
        if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
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
      const fromTree = collectSimplePasswordInputs(searchRoot).filter(function(input) {
        return isValidSimplePasswordTarget(input);
      });
      if (modal) {
        const hidden = findHiddenOtpInput(searchRoot);
        if (hidden && isValidSimplePasswordTarget(hidden) && fromTree.indexOf(hidden) < 0) {
          fromTree.unshift(hidden);
        }
        return fromTree;
      }
      const fromBody = collectSimplePasswordInputs(document.body).filter(function(input) {
        return !isLikelyPageSearchInput(input);
      });
      const seen = /* @__PURE__ */ new Set();
      const merged = [];
      fromTree.concat(fromBody).forEach(function(input) {
        if (seen.has(input)) return;
        seen.add(input);
        merged.push(input);
      });
      if (!modal || !merged.length) return merged;
      const modalRect = modal.getBoundingClientRect();
      merged.sort(function(a, b) {
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
      walkDomIncludingShadow(root, function(node) {
        if (node.tagName !== "INPUT") return;
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
      walkDomIncludingShadow(root, function(node) {
        if (!node.children || node.children.length < 4) return;
        const kids = [];
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (!isElementVisible(child)) continue;
          if ((child.textContent || "").replace(/\s+/g, "").length > 2) continue;
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
        const searchRoot2 = getSimplePasswordSearchRoot();
        const hidden2 = findHiddenOtpInput(searchRoot2);
        if (hidden2 && isValidSimplePasswordTarget(hidden2)) return hidden2;
      }
      blurMisfocusedPageSearch();
      const active = document.activeElement;
      if (active && active !== document.body && isEditablePinTarget(active) && isValidSimplePasswordTarget(active)) {
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
        input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: inputType || "insertFromPaste",
          data: value
        }));
      } catch (e) {
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    async function insertTextIntoTarget(target, text) {
      if (!target) return false;
      target.focus();
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        setNativeInputValue(target, text);
        return true;
      }
      if (target.isContentEditable) {
        target.textContent = text;
        dispatchInputEvents(target, text, "insertFromPaste");
        return true;
      }
      try {
        if (document.execCommand("insertText", false, text)) return true;
      } catch (e) {
      }
      return false;
    }
    async function pasteSimplePassword(target, pin) {
      if (!target) return false;
      target.focus();
      safeClick(target);
      await humanDelay(100, 200);
      if (await insertTextIntoTarget(target, pin)) {
        await humanDelay(120, 220);
        if (isSimplePasswordEntered() || String(target.value || "").replace(/\D/g, "").length >= 4) {
          return true;
        }
      }
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", pin);
        target.dispatchEvent(new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        }));
        dispatchInputEvents(target, pin, "insertFromPaste");
        await humanDelay(120, 220);
        return isSimplePasswordEntered() || String(target.value || "").replace(/\D/g, "").length >= 4;
      } catch (e) {
        return false;
      }
    }
    async function typePinChar(input, ch) {
      if (!input || !isValidSimplePasswordTarget(input)) return false;
      input.focus();
      const key = String(ch);
      const code = key >= "0" && key <= "9" ? "Digit" + key : "Key" + key.toUpperCase();
      const opts = { key, code, bubbles: true, cancelable: true };
      input.dispatchEvent(new KeyboardEvent("keydown", opts));
      input.dispatchEvent(new KeyboardEvent("keypress", opts));
      if (input.tagName === "INPUT" || input.tagName === "TEXTAREA") {
        const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        const next = (input.value || "") + key;
        if (input._valueTracker) {
          input._valueTracker.setValue(input.value || "");
        }
        if (desc && desc.set) desc.set.call(input, next);
        else input.value = next;
      } else if (input.isContentEditable) {
        input.textContent = (input.textContent || "") + key;
      } else {
        try {
          document.execCommand("insertText", false, key);
        } catch (e) {
        }
      }
      dispatchInputEvents(input, key, "insertText");
      input.dispatchEvent(new KeyboardEvent("keyup", opts));
      await humanDelay(90, 180);
      return true;
    }
    async function typePinOnTarget(target, pin) {
      const digits = String(pin || "").replace(/\D/g, "").slice(0, 4);
      if (digits.length !== 4) return false;
      const input = resolvePinTarget(target);
      if (!input) return false;
      for (let i = 0; i < 4; i++) {
        if (!await typePinChar(input, digits.charAt(i))) return false;
      }
      return true;
    }
    async function fillViaVisualOtpBoxes(boxes, pin) {
      const digits = String(pin || "").replace(/\D/g, "").slice(0, 4);
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
        if (!await typePinChar(target, digits.charAt(i))) return false;
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
        const oneChar = globalInputs.filter(function(input) {
          return Number(input.maxLength) === 1;
        });
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
        const val = String(inputs[0].value || "").replace(/\D/g, "");
        return val.length >= 4;
      }
      if (inputs.length >= 4) {
        let filled = 0;
        for (let i = 0; i < 4; i++) {
          if (String(inputs[i].value || "").replace(/\D/g, "").length >= 1) filled += 1;
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
      console.warn("[hty-inplay] PIN debug(" + reason + ")", {
        modal: !!modal,
        searchRootTag: searchRoot && searchRoot.tagName,
        inputs: inputs.length,
        globalInputs: globalInputs.length,
        visualBoxes: visualBoxes.length,
        activeTag: document.activeElement && document.activeElement.tagName,
        activeType: document.activeElement && document.activeElement.type
      });
    }
    async function fillSimplePassword(pin) {
      const digits = String(pin || "").replace(/\D/g, "").slice(0, 4);
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
        setNativeInputValue(input, "");
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
          if (!await typePinChar(inputs[i], digits.charAt(i))) break;
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
      logSimplePasswordDebug("all-strategies-failed");
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
        if (rect.top > 140) continue;
        if (rect.width < 28 || rect.height < 18) continue;
        const label = (el.textContent || "").replace(/\s+/g, "");
        if (label === "\u767B\u5F55") return el;
      }
      return null;
    }
    function findDigitButtonIn(root, digit) {
      if (!root) return null;
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
        const label = (el.textContent || "").replace(/\s+/g, "");
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
      const opts = { key: "Enter", code: "Enter", bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent("keydown", opts));
      el.dispatchEvent(new KeyboardEvent("keyup", opts));
    }
    function findSimplePasswordSubmitButton() {
      const root = findSimplePasswordModalRoot();
      if (root) {
        const buttons = root.querySelectorAll('button, [role="button"], a');
        let fallback = null;
        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i];
          if (!isElementVisible(btn)) continue;
          const label = (btn.textContent || "").replace(/\s+/g, "");
          if (label === "\u786E\u5B9A" || label === "\u786E\u8BA4" || label === "\u63D0\u4EA4") return btn;
          if (label !== "\u5207\u6362\u8D26\u53F7" && label !== "\u6CE8\u518C" && label.length <= 6) fallback = btn;
        }
        if (fallback) return fallback;
      }
      return findModalConfirmButton(["\u7B80\u6613\u5BC6\u7801"]) || findModalConfirmButton(["\u56DB\u4F4D\u6570\u5B57"]) || findModalConfirmButton(["\u7B80\u6613\u5BC6\u7801", "\u56DB\u4F4D"]);
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
      lockNavigationForLogin(LOGIN_NAV_LOCK_MS, "\u81EA\u52A8\u767B\u5F55\u4E2D");
      try {
        if (isIdleLoginModalVisible()) {
          if (lite) {
            const nodes = document.querySelectorAll('button, [role="button"]');
            for (let i = 0; i < nodes.length; i++) {
              const label = (nodes[i].textContent || "").replace(/\s+/g, "");
              if (label === "\u786E\u5B9A") {
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
            console.warn("[hty-inplay] \u672A\u627E\u5230\u767B\u5F55\u6309\u94AE");
            return false;
          }
          setReloginStatus("\u81EA\u52A8\u767B\u5F55\uFF1A\u70B9\u51FB\u767B\u5F55\u2026");
          safeClick(loginBtn);
          try {
            await waitFor(isSimplePasswordModalVisible, urgent ? 6e3 : 1e4, urgent ? 250 : 400);
          } catch (e) {
            console.warn("[hty-inplay] \u7B49\u5F85\u7B80\u6613\u5BC6\u7801\u5F39\u7A97\u8D85\u65F6");
            return false;
          }
        }
        setReloginStatus("\u81EA\u52A8\u767B\u5F55\uFF1A\u8F93\u5165\u7B80\u6613\u5BC6\u7801\u2026");
        if (!await fillSimplePassword(SIMPLE_LOGIN_PIN)) {
          console.warn("[hty-inplay] \u7B80\u6613\u5BC6\u7801\u8F93\u5165\u5931\u8D25");
          setReloginStatus("\u81EA\u52A8\u767B\u5F55\uFF1A\u5BC6\u7801\u8F93\u5165\u5931\u8D25");
          return false;
        }
        await humanDelay(urgent ? 200 : 400, urgent ? 450 : 800);
        loginCache.ts = 0;
        try {
          await waitFor(function() {
            loginCache.ts = 0;
            return isLoggedIn() || !isSimplePasswordModalVisible();
          }, urgent ? 3e3 : 4e3, urgent ? 200 : 250);
        } catch (e) {
        }
        if (!isLoggedIn() && isSimplePasswordModalVisible()) {
          const submitBtn = findSimplePasswordSubmitButton();
          if (submitBtn) {
            setReloginStatus("\u81EA\u52A8\u767B\u5F55\uFF1A\u786E\u8BA4\u2026");
            safeClick(submitBtn);
            await humanDelay(urgent ? 800 : 1500, urgent ? 1400 : 2500);
          } else {
            setReloginStatus("\u81EA\u52A8\u767B\u5F55\uFF1A\u5C1D\u8BD5\u63D0\u4EA4\u5BC6\u7801\u2026");
            pressEnterOnActiveElement();
            await humanDelay(urgent ? 700 : 1200, urgent ? 1200 : 2e3);
          }
        }
        loginCache.ts = 0;
        if (isLoggedIn()) {
          console.log("[hty-inplay] \u81EA\u52A8\u767B\u5F55\u6210\u529F");
          setReloginStatus("\u81EA\u52A8\u767B\u5F55\u6210\u529F");
          if (!lite) {
            betResult = "pending";
            schedulePoll();
          }
          return true;
        }
        console.warn("[hty-inplay] \u81EA\u52A8\u767B\u5F55\u540E\u4ECD\u672A\u68C0\u6D4B\u5230\u767B\u5F55\u72B6\u6001");
        setReloginStatus("\u81EA\u52A8\u767B\u5F55\u672A\u5B8C\u6210\uFF0C\u7B49\u5F85\u91CD\u8BD5");
        return false;
      } finally {
        loginCache.ts = 0;
        const stillOnLoginUi = !isLoggedIn() && (isSimplePasswordModalVisible() || isIdleLoginModalVisible());
        lockNavigationForLogin(
          stillOnLoginUi ? LOGIN_NAV_LOCK_MS : LOGIN_NAV_SETTLE_MS,
          stillOnLoginUi ? "\u767B\u5F55\u5F39\u7A97\u4ECD\u5728" : "\u767B\u5F55\u6536\u5C3E\u9759\u9ED8"
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
          tryAutoRelogin({ urgent, lite: false }).catch(function(e) {
            console.warn("[hty-inplay] \u81EA\u52A8\u767B\u5F55", e);
          });
        }
        if (wasLoggedIn && !nowLoggedIn) {
          console.warn("[hty-inplay] \u68C0\u6D4B\u5230\u767B\u5F55\u5DF2\u5931\u6548");
          htyApiState.headers.authorization = "";
          setBetStep("\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u6B63\u5728\u81EA\u52A8\u767B\u5F55\u2026");
          renderPanel(true);
          if (!reloginInProgress) {
            tryAutoRelogin({ urgent: true }).catch(function(e) {
              console.warn("[hty-inplay] \u767B\u5F55\u5931\u6548\u540E\u81EA\u52A8\u767B\u5F55", e);
            });
          }
          if (!placing) {
            betResult = "pending";
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
      const walletUrl = htyApiState.apiBase.replace(/\/$/, "") + "/platform/payment/wallets/list";
      try {
        await gmPlatformGetText(walletUrl);
        console.log("[hty-inplay] \u4F1A\u8BDD\u4FDD\u6D3B ping \u6210\u529F");
      } catch (e) {
        console.warn("[hty-inplay] \u4F1A\u8BDD\u4FDD\u6D3B ping \u5931\u8D25", e);
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
      const ids = getNavigableInPlayMatches().map(function(item) {
        return String(item.matchId);
      });
      if (ids.length < 2) return false;
      if (placing || shouldAutoBet() || shouldHoldCurrentMatch()) return false;
      if (Date.now() - lastMatchRotateAt < MATCH_ROTATE_MS) return false;
      const nextId = pickRotatingInplayMatch(matchId);
      if (!nextId || String(nextId) === String(matchId)) return false;
      lastMatchRotateAt = Date.now();
      console.log("[hty-inplay] \u8F6E\u6362\u8FDB\u884C\u4E2D\u6BD4\u8D5B", matchId, "->", nextId, reason || "");
      await navigateToInplayMatch(nextId, reason || "\u8F6E\u6362\u8FDB\u884C\u4E2D\u6BD4\u8D5B");
      return true;
    }
    function storeKeepaliveTarget(item, targetId) {
      sessionStorage.setItem(KEEPALIVE_TARGET_MATCH_ID_KEY, targetId || "");
      sessionStorage.setItem(KEEPALIVE_MATCH_ID_KEY, targetId || matchId || "");
      if (item) {
        sessionStorage.setItem(KEEPALIVE_TARGET_HOME_KEY, item.homeName || "");
        sessionStorage.setItem(KEEPALIVE_TARGET_AWAY_KEY, item.awayName || "");
      }
    }
    async function runKeepaliveViaFootballList(targetId) {
      console.log("[hty-inplay] \u4FDD\u6D3B\uFF1A\u4EC5 API\uFF0C\u7981\u6B62\u9875\u9762\u8DF3\u8F6C", targetId || "");
      try {
        clearKeepalivePhase2();
      } catch (e) {
      }
      try {
        await sessionApiKeepAlive();
      } catch (e) {
        console.warn("[hty-inplay] API \u4FDD\u6D3B\u5931\u8D25\uFF08\u4E0D\u8DF3\u8F6C\uFF09", e);
      }
    }
    function resolveKeepaliveTargetId() {
      if (shouldHoldCurrentMatch() && matchId) {
        return String(matchId);
      }
      if (isCurrentMatchEnded() || isMatchEndedModalVisible()) {
        return pickInplayNavigableMatch(matchId);
      }
      const navigableIds = getNavigableInPlayMatches().map(function(item) {
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
      return pickInplayNavigableMatch("") || resolveStrandedTargetMatchId() || "";
    }
    async function runKeepaliveSwitch() {
      if (placing || reportSyncing || matchEndedHandling) return;
      if (isUserManualMatchLockActive()) return;
      if (shouldAutoBet() || shouldHoldCurrentMatch()) return;
      if (isMatchEndedModalVisible() || isCurrentMatchEnded()) {
        handleMatchEnded().catch(function(e) {
          console.warn("[hty-inplay] \u4FDD\u6D3B\u68C0\u6D4B\u5230\u8D5B\u4E8B\u7ED3\u675F", e);
        });
        return;
      }
      try {
        activeMatches = await fetchActiveMatches();
      } catch (e) {
        console.warn("[hty-inplay] \u4FDD\u6D3B\u5237\u65B0\u8D5B\u4E8B\u5931\u8D25", e);
      }
      try {
        await sessionApiKeepAlive();
      } catch (e) {
        console.warn("[hty-inplay] API\u4FDD\u6D3B\u5931\u8D25\uFF08\u4E0D\u8DF3\u8F6C\uFF09", e);
      }
    }
    function scheduleMatchKeepAlive() {
      if (pageSwitchTimer) return;
      getKeepalivePhase2();
      if (isOnMatchBetPage() && isKeepaliveEnterMatchPhase2()) {
        clearKeepalivePhase2();
      }
      pageSwitchTimer = setInterval(function() {
        if (placing || reportSyncing || matchEndedHandling || shouldBlockMatchAutoNav()) return;
        if (isUserManualMatchLockActive()) return;
        if (shouldAutoBet() || shouldHoldCurrentMatch()) return;
        if (isIdleLoginModalVisible()) {
          dismissIdleLoginModal();
          return;
        }
        if (isCurrentMatchEnded()) return;
        runKeepaliveSwitch().catch(function(e) {
          console.warn("[hty-inplay] \u4FDD\u6D3B\u5207\u6362\u5931\u8D25", e);
        });
      }, SESSION_KEEPALIVE_MS);
    }
    function scheduleSessionKeepAlive() {
      scheduleMatchKeepAlive();
      setInterval(function() {
        sessionApiKeepAlive().catch(function(e) {
          console.warn("[hty-inplay] session keepalive", e);
        });
      }, SESSION_API_KEEPALIVE_MS);
    }
    function scheduleOddsRescan() {
      if (!shouldRunHeavyDomWork()) return;
      if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = setTimeout(async function() {
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
      oddsObserver = new MutationObserver(function() {
        scheduleDomCheck("odds", scheduleOddsRescan, DOM_CHECK_DEBOUNCE_MS);
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
      betStep = text || "";
      updatePanelStatus();
    }
    function setBetResult(result, detail) {
      betResult = result || "pending";
      if (detail) betStep = detail;
      updatePanelStatus();
    }
    function resultLabel(loggedIn) {
      if (betResult === "success") {
        const step = betStep || "";
        if (/订单恢复|接口未捕获|后台确认|重复请求已合并|接口迟到的响应|未走完整弹窗流程/.test(step)) {
          return "\u6295\u6CE8\u6210\u529F\xB7\u6062\u590D\u786E\u8BA4";
        }
        return "\u6295\u6CE8\u6210\u529F";
      }
      if (betResult === "failed") {
        const step = betStep || "";
        if (/^失败：|^下注失败：/.test(step)) {
          return truncatePanelText(step.replace(/^下注/, ""), 28);
        }
        return "\u6295\u6CE8\u5931\u8D25";
      }
      if (betResult === "placing") return "\u6295\u6CE8\u4E2D";
      if (betResult === "skipped") return "\u5DF2\u8DF3\u8FC7";
      if (betResult === "stopped") return "\u5DF2\u505C\u6B62";
      if (!loggedIn) return "\u7B49\u5F85\u767B\u5F55";
      if (targetOption && shouldAutoBet()) return "\u5373\u5C06\u81EA\u52A8\u6295\u6CE8";
      if (targetOption) return "\u7B56\u7565\u5DF2\u547D\u4E2D";
      if (!strategyList.length) return "\u7B49\u5F85\u7B56\u7565";
      return "\u7B49\u5F85\u76D8\u53E3/\u8D54\u7387";
    }
    function resultKind(loggedIn) {
      if (betResult === "success") return "ok";
      if (betResult === "failed") return "err";
      if (betResult === "placing") return "ing";
      if (betResult === "skipped" || betResult === "stopped") return "warn";
      if (!loggedIn) return "info";
      if (targetOption && shouldAutoBet()) return "ready";
      return "info";
    }
    function upcomingText() {
      if (!strategyList.length) return "\u7B49\u5F85\u7B56\u7565\u5217\u8868\u52A0\u8F7D";
      if (!targetOption) return "\u5C1A\u672A\u547D\u4E2D\u7B56\u7565\u76D8\u53E3\uFF08\u9700\u76D8\u53E3+\u8D54\u7387\u2265\u9608\u503C\uFF09";
      return targetOption.label + " \xB7 \u9875\u9762\u76D8\u53E3 " + (targetOption.displayLine || "\u2014") + " \xB7 \u8D54\u7387 " + formatOddsDisplay(targetOption.odds) + "\uFF08\u2265" + formatOddsDisplay(targetOption.minOdds) + "\uFF09\xB7 \u6295\u6CE8 " + formatBetStakeSummary(targetOption);
    }
    function formatOddsDisplay(val) {
      if (val == null || val === "") return "\u2014";
      const n = Number(val);
      if (isNaN(n)) return String(val);
      return n.toFixed(2);
    }
    function formatPlateLineDisplay(val) {
      if (val == null || val === "") return "";
      const s = String(val).trim();
      if (hasSplitPlateNotation(s)) return s;
      const n = parseFloat(s);
      if (!isNaN(n)) return n.toFixed(1);
      return s;
    }
    function formatStrategyPlateDesc(item) {
      const market = MARKET_LABEL[item.market] || item.market || "\u2014";
      const side = PLATE_ON_LABEL[item.plateOn] || item.plateOn || "";
      const lineRaw = item.plateOnK != null && item.plateOnK !== "" ? String(item.plateOnK) : "";
      const line = lineRaw ? formatPlateLineDisplay(lineRaw) : "";
      let desc = market;
      if (side || line) desc += " " + side + line;
      return desc;
    }
    function formatStrategyItemHtml(item, state) {
      const odds = formatOddsDisplay(item.plateOddsHit);
      const amount = item.plateAmount != null ? formatOddsDisplay(item.plateAmount) : "\u2014";
      const rate = item.plateAmountRate != null ? (Number(item.plateAmountRate) * 100).toFixed(1) + "%" : "\u2014";
      let html = '<span class="tm-hty-strategy-exec tm-hty-strategy-exec-' + strategyExecKind(item) + '">' + strategyExecLabel(item) + "</span> " + formatStrategyPlateDesc(item) + ' \xB7 \u8D54\u7387\u2265<span class="tm-hty-strategy-odds">' + odds + '</span> \xB7 \u6295\u6CE8<span class="tm-hty-strategy-amount">$' + amount + "</span> \xB7 " + rate;
      if (state && state.plateMatched && state.currentOdds != null) {
        html += ' \xB7 \u5F53\u524D<span class="tm-hty-strategy-odds">' + formatOddsDisplay(state.currentOdds) + "</span>";
      }
      return html;
    }
    function executedStrategiesStorageKey(id) {
      return EXECUTED_STRATEGIES_KEY + "_" + (id || matchId || "");
    }
    function loadExecutedStrategyStore(id) {
      try {
        const raw = sessionStorage.getItem(executedStrategiesStorageKey(id));
        const store = raw ? JSON.parse(raw) : {};
        return store && typeof store === "object" ? store : {};
      } catch (e) {
        return {};
      }
    }
    function saveExecutedStrategyStore(store, id) {
      try {
        sessionStorage.setItem(executedStrategiesStorageKey(id), JSON.stringify(store || {}));
      } catch (e) {
      }
    }
    function pruneExecutedStrategyStore(store) {
      const now = Date.now();
      Object.keys(store).forEach(function(recHash) {
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
      const s = orderno != null ? String(orderno) : "";
      if (!s) return false;
      if (s.indexOf("ui-") === 0 || s.indexOf("pending-") === 0) return false;
      return true;
    }
    function rememberExecutedStrategy(recHash, orderno, option, meta) {
      if (!recHash && !(option && option.testid)) return;
      const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
      const prev = recHash ? store[recHash] : null;
      const entry = {
        orderno: orderno ? String(orderno) : prev && prev.orderno || "",
        at: Date.now(),
        // pendingSync: wait backend rule PUT; cleared by markExecutedStrategySynced
        pendingSync: meta && meta.pendingSync === false ? false : true,
        betOdds: meta && meta.betOdds != null ? meta.betOdds : prev && prev.betOdds != null ? prev.betOdds : void 0,
        betStake: meta && meta.betStake != null ? meta.betStake : prev && prev.betStake != null ? prev.betStake : void 0,
        matchId: meta && meta.matchId ? String(meta.matchId) : prev && prev.matchId || String(matchId || "")
      };
      if (recHash) store[recHash] = entry;
      if (isBetDedupEnabled() && option && option.testid) {
        store["tid:" + option.testid] = Object.assign({}, entry, { recHash: recHash || "" });
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
          strategyList[i].ruleMeetIgnore = "2";
        }
      }
      for (let j = 0; j < strategyStates.length; j++) {
        const st = strategyStates[j];
        if (!st.strategy || st.strategy.recHash !== recHash) continue;
        st.execStatus = "executed";
        st.actionable = false;
        st.hit = false;
        st.dedupBlocked = true;
        if (st.strategy) st.strategy.ruleMeetIgnore = "2";
      }
      if (targetOption && targetOption.strategy && targetOption.strategy.recHash === recHash) {
        targetOption = null;
      }
      lastStrategyListKey = "";
      lastStrategyHitKey = "";
    }
    function markBetAttemptStarted(option, recHash, stakeInput) {
      if (!recHash) return;
      markBetAttempt(recHash, option, stakeInput);
      markBetInFlight(recHash, {
        testid: option && option.testid,
        stake: stakeInput != null ? String(stakeInput) : "",
        bttsSubstitute: !!(option && option.bttsSubstitute),
        substitutedFrom: option && option.substitutedFrom ? option.substitutedFrom : null,
        market: option && option.market ? String(option.market) : "",
        side: option && option.side ? String(option.side) : "",
        label: option && option.label ? String(option.label) : ""
      });
    }
    function betInFlightStorageKey(id) {
      return BET_INFLIGHT_KEY + "_" + (id || matchId || "");
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
          recHash: recHash || "",
          testid: meta && meta.testid ? String(meta.testid) : "",
          stake: meta && meta.stake != null ? String(meta.stake) : "",
          at: meta && meta.at ? Number(meta.at) : Date.now(),
          bttsSubstitute: !!(meta && meta.bttsSubstitute),
          substitutedFrom: meta && meta.substitutedFrom ? meta.substitutedFrom : null,
          market: meta && meta.market ? String(meta.market) : "",
          side: meta && meta.side ? String(meta.side) : "",
          label: meta && meta.label ? String(meta.label) : ""
        }));
      } catch (e) {
      }
    }
    function clearBetInFlight(id) {
      try {
        sessionStorage.removeItem(betInFlightStorageKey(id));
      } catch (e) {
      }
    }
    function isBetSlipSubmittedUiLegacy() {
      const cart = document.querySelector(
        '[data-testid="SportCart"], [data-testid="overlay-container-cart-overlay-task-id"], [data-testid*="SportCart"], [data-testid*="cart-overlay"], [class*="SportCart"]'
      );
      if (cart && isElementVisible(cart)) {
        const text = cart.textContent || "";
        if (text.indexOf("\u5DF2\u63D0\u4EA4") >= 0 || /投注成功|submitte?d/i.test(text)) return true;
      }
      return !!findVisibleDialogContaining(["\u5DF2\u63D0\u4EA4"]) || !!findVisibleDialogContaining(["\u6295\u6CE8\u6210\u529F"]);
    }
    function findVisibleBetSubmittedTitle() {
      const nodes = document.querySelectorAll(
        'div, span, h1, h2, h3, p, strong, [class*="title"], [class*="Title"], [class*="status"], [class*="Status"]'
      );
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!isElementVisible(el)) continue;
        const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!raw || raw.length > 16) continue;
        const t = normalizeHintText(raw);
        if (t !== "\u5DF2\u63D0\u4EA4" && t.indexOf("\u5DF2\u63D0\u4EA4") !== 0) continue;
        let p = el.parentElement;
        for (let d = 0; d < 10 && p; d++) {
          const pt = normalizeHintText(p.textContent || "");
          if (pt.indexOf("\u53EF\u8D62") >= 0 || pt.indexOf("USDT") >= 0 || pt.indexOf("1\u6CE8") >= 0 || pt.indexOf("\u6295\u6CE8") >= 0) {
            return el;
          }
          p = p.parentElement;
        }
      }
      return null;
    }
    function isBetSubmittedDrawerVisible() {
      if (isBetSlipSubmittedUiLegacy()) return true;
      if (findVisibleDialogContaining(["\u5DF2\u63D0\u4EA4", "\u53EF\u8D62"])) return true;
      if (findVisibleDialogContaining(["\u5DF2\u63D0\u4EA4", "USDT"])) return true;
      if (findVisibleBetSubmittedTitle()) return true;
      const roots = getModalCandidateRoots();
      for (let r = 0; r < roots.length; r++) {
        const text = normalizeHintText(roots[r].textContent || "");
        if (text.indexOf("\u5DF2\u63D0\u4EA4") >= 0 && (text.indexOf("\u53EF\u8D62") >= 0 || text.indexOf("USDT") >= 0 || text.indexOf("\u6295\u6CE8") >= 0)) {
          return true;
        }
      }
      return false;
    }
    function isBetSlipSubmittedUi() {
      return isBetSubmittedDrawerVisible();
    }
    const BET_SUBMITTED_CONFIRM_LABELS = ["\u786E\u5B9A", "OK", "\u786E\u8BA4", "\u5B8C\u6210", "\u5173\u95ED"];
    function findBetSubmittedDrawerRoot() {
      const cart = getSportCartRoot();
      if (cart && isElementVisible(cart)) {
        const text = cart.textContent || "";
        if (text.indexOf("\u5DF2\u63D0\u4EA4") >= 0 || /投注成功|submitte?d/i.test(text)) return cart;
      }
      const title = findVisibleBetSubmittedTitle();
      if (title) {
        let p = title.parentElement;
        for (let d = 0; d < 8 && p; d++) {
          const pt = normalizeHintText(p.textContent || "");
          if (pt.indexOf("\u53EF\u8D62") >= 0 || pt.indexOf("USDT") >= 0) return p;
          p = p.parentElement;
        }
        return title.parentElement || title;
      }
      return findVisibleDialogContaining(["\u5DF2\u63D0\u4EA4", "\u53EF\u8D62"]) || findVisibleDialogContaining(["\u5DF2\u63D0\u4EA4", "USDT"]) || findVisibleDialogContaining(["\u5DF2\u63D0\u4EA4"]) || findVisibleDialogContaining(["\u6295\u6CE8\u6210\u529F"]);
    }
    function findBetSubmittedCloseButton(root) {
      const scope = root || document;
      const nodes = scope.querySelectorAll(
        'button, [role="button"], a, [aria-label], [data-testid*="close"], [data-testid*="Close"], [class*="close"], [class*="Close"]'
      );
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!isElementVisible(el)) continue;
        const label = normalizeHintText(el.textContent || el.getAttribute("aria-label") || "");
        const tid = String(el.getAttribute("data-testid") || "").toLowerCase();
        if (label === "\xD7" || label === "x" || label === "\u5173\u95ED" || /close/i.test(tid)) {
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
      let btn = findModalConfirmButton(["\u5DF2\u63D0\u4EA4", "\u53EF\u8D62"]) || findModalConfirmButton(["\u5DF2\u63D0\u4EA4", "USDT"]) || findModalConfirmButton(["\u5DF2\u63D0\u4EA4"]) || findModalConfirmButton(["\u6295\u6CE8\u6210\u529F"]);
      if (btn) return btn;
      if (!isBetSubmittedDrawerVisible()) return null;
      const viewportBottom = window.innerHeight;
      const candidates = document.querySelectorAll(
        'button, [role="button"], a, [class*="btn"], [class*="Btn"], [class*="button"], [class*="Button"]'
      );
      let best = null;
      let bestTop = -1;
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (!isElementVisible(el)) continue;
        if (!labelMatchesConfirm(el.textContent || "", BET_SUBMITTED_CONFIRM_LABELS)) continue;
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
        console.warn("[hty-inplay] \u5DF2\u63D0\u4EA4\u62BD\u5C49\u4ECD\u5728\uFF0C\u672A\u80FD\u81EA\u52A8\u70B9\u51FB\u786E\u5B9A\uFF08\u4ECD\u6309\u6210\u529F\u5904\u7406\uFF09");
      }
      return !isBetSubmittedDrawerVisible();
    }
    function buildBetRecordFromUiSuccess(option) {
      const ts = Date.now();
      return buildStrategyBetRecord(option, {
        orderno: "ui-" + String(matchId || "") + "-" + ts,
        delay: null,
        singles: [],
        response: { uiSubmitted: true },
        requestBody: null
      }, null);
    }
    async function waitForBetOutcomeAfterSubmit(betWaitHandle, option, sinceAt) {
      const deadline = Date.now() + BET_API_WAIT_MS + 8e3;
      let apiPayload = null;
      let apiError = null;
      let attachedGen = -1;
      function attachCurrentWaiter() {
        if (!betWaitHandle || !betWaitHandle.promise) return;
        if (attachedGen === betWaitHandle.generation) return;
        attachedGen = betWaitHandle.generation;
        const gen = attachedGen;
        const p = betWaitHandle.promise;
        p.then(function(payload) {
          if (gen !== betWaitHandle.generation) {
            if (payload && payload.orderno) {
              lastCapturedBetSuccess = { payload, at: Date.now() };
              console.warn("[hty-inplay] \u4E0B\u6CE8\u6210\u529F\u54CD\u5E94\u9047 rearm\uFF0C\u5DF2\u8F6C\u5165\u8FDF\u5230\u7F13\u5B58", payload.orderno);
            }
            return;
          }
          apiPayload = payload;
        }).catch(function(e) {
          if (gen !== betWaitHandle.generation) return;
          apiError = e;
        });
      }
      function finish(result) {
        try {
          if (betWaitHandle && typeof betWaitHandle.clear === "function") {
            betWaitHandle.clear();
          } else {
            clearBetResultWaiter();
          }
        } catch (e) {
        }
        return result;
      }
      attachCurrentWaiter();
      try {
        while (Date.now() < deadline) {
          attachCurrentWaiter();
          if (apiPayload) {
            return finish({ source: "api", payload: apiPayload });
          }
          const lateCap = consumeLastCapturedBetSuccess(option, sinceAt);
          if (lateCap) {
            return finish({ source: "api_late", payload: lateCap });
          }
          if (needsAcceptOddsChange()) {
            setBetStep("\u7B49\u5F85\u7ED3\u679C\u65F6\u8D54\u7387\u5DF2\u66F4\u6539\uFF0C\u70B9\u51FB\u63A5\u53D7\u66F4\u6539\u2026");
            renderPanel(true);
            const accepted = await clickAcceptOddsChangeButton();
            if (!accepted) await dismissOddsChangedModalIfAny();
            if (betWaitHandle && typeof betWaitHandle.rearm === "function") {
              betWaitHandle.rearm();
              attachCurrentWaiter();
            }
            await humanDelay(600, 1100);
            if (isBetSubmittedDrawerVisible()) {
            } else if (needsAcceptOddsChange()) {
              await humanDelay(400, 700);
              continue;
            } else {
              const actionBtn = findBetActionButton();
              if (actionBtn && !isAcceptChangesBtn(actionBtn) && !actionBtn.disabled) {
                setBetStep("\u63A5\u53D7\u66F4\u6539\u540E\u91CD\u65B0\u70B9\u51FB\u6295\u6CE8\u2026");
                renderPanel(true);
                if (betWaitHandle && typeof betWaitHandle.rearm === "function") {
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
            setBetStep("\u68C0\u6D4B\u5230\u5DF2\u63D0\u4EA4\uFF0C\u6309\u6210\u529F\u5904\u7406\u2026");
            renderPanel(true);
            dismissBetSubmittedDrawer(3).catch(function() {
            });
            if (apiPayload) {
              return finish({ source: "api", payload: apiPayload });
            }
            const captured = consumeLastCapturedBetSuccess(option, sinceAt);
            if (captured) {
              return finish({ source: "api_late", payload: captured });
            }
            try {
              const recovered = await tryRecoverSuccessfulBet(option, sinceAt, {
                quick: true,
                retries: 1,
                gapMs: 0
              });
              if (recovered) {
                const orderno = String(recovered.orderno || "");
                if (orderno.indexOf("ui-") === 0) {
                  return finish({ source: "ui", record: recovered });
                }
                return finish({ source: "order", record: recovered });
              }
            } catch (e) {
              console.warn("[hty-inplay] \u5DF2\u63D0\u4EA4\u540E\u5FEB\u901F\u67E5\u5355\u5931\u8D25\uFF0C\u6309 UI \u6210\u529F", e);
            }
            console.log("[hty-inplay] \u5DF2\u63D0\u4EA4\u62BD\u5C49\u786E\u8BA4\uFF0C\u6309 UI \u6210\u529F\u5904\u7406");
            return finish({ source: "ui", record: buildBetRecordFromUiSuccess(option) });
          }
          if (apiError) {
            const captured = consumeLastCapturedBetSuccess(option, sinceAt);
            if (captured) {
              return finish({ source: "api_late", payload: captured });
            }
          }
          await humanDelay(350, 550);
        }
        if (apiPayload) return finish({ source: "api", payload: apiPayload });
        if (isBetSubmittedDrawerVisible()) {
          dismissBetSubmittedDrawer(3).catch(function() {
          });
          const captured = consumeLastCapturedBetSuccess(option, sinceAt);
          if (captured) return finish({ source: "api_late", payload: captured });
          try {
            const recovered = await tryRecoverSuccessfulBet(option, sinceAt, {
              quick: true,
              retries: 1,
              gapMs: 0
            });
            if (recovered) {
              const orderno = String(recovered.orderno || "");
              if (orderno.indexOf("ui-") === 0) {
                return finish({ source: "ui", record: recovered });
              }
              return finish({ source: "order", record: recovered });
            }
          } catch (e) {
          }
          console.log("[hty-inplay] \u5DF2\u63D0\u4EA4\u62BD\u5C49\u786E\u8BA4\uFF0C\u6309 UI \u6210\u529F\u5904\u7406");
          return finish({ source: "ui", record: buildBetRecordFromUiSuccess(option) });
        }
        const lateCaptured = consumeLastCapturedBetSuccess(option, sinceAt);
        if (lateCaptured) return finish({ source: "api_late", payload: lateCaptured });
        if (apiError) throw apiError;
        throw new Error("\u4E0B\u6CE8\u63A5\u53E3\u54CD\u5E94\u8D85\u65F6");
      } catch (err) {
        try {
          if (betWaitHandle && typeof betWaitHandle.clear === "function") betWaitHandle.clear();
          else clearBetResultWaiter();
        } catch (e) {
        }
        throw err;
      }
    }
    function extractOrdersFromReport(json) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      function walk(node) {
        if (!node) return;
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) walk(node[i]);
          return;
        }
        if (typeof node !== "object") return;
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
        order.betTime,
        order.createTime,
        order.createdTime,
        order.time,
        order.created_at,
        order.placedAt,
        order.orderTime
      ];
      for (let i = 0; i < fields.length; i++) {
        const t = Date.parse(fields[i]);
        if (!isNaN(t)) return t;
      }
      return 0;
    }
    function orderLineVariants(strategy, market) {
      const plateOnK = strategy && strategy.plateOnK != null && strategy.plateOnK !== "" ? String(strategy.plateOnK) : "";
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
      return variants.filter(function(v, idx, arr) {
        return v && arr.indexOf(v) === idx;
      });
    }
    function orderMarketHits(blob, market) {
      const m = String(market || "").toLowerCase();
      if (!m) return true;
      if (blob.indexOf(m) >= 0) return true;
      if (m === "aou" && (blob.indexOf("a-ou") >= 0 || blob.indexOf("aou") >= 0)) return true;
      if (m === "hou" && (blob.indexOf("h-ou") >= 0 || blob.indexOf("hou") >= 0)) return true;
      if (m === "btts" && blob.indexOf("btts") >= 0) return true;
      if (m === "ou" && (blob.indexOf('"ou"') >= 0 || blob.indexOf("|ou|") >= 0)) return true;
      return false;
    }
    function orderPlateOnHits(blob, plateOn) {
      const p = String(plateOn || "").toLowerCase();
      if (!p) return true;
      if (blob.indexOf('"' + p + '"') >= 0) return true;
      if (blob.indexOf('"beton":"' + p) >= 0) return true;
      if (blob.indexOf('"beton": "' + p) >= 0) return true;
      if (p === "ov" && /"ov"|over|大/.test(blob)) return true;
      if (p === "ud" && /"ud"|under|小/.test(blob)) return true;
      if (p === "y" && /"y"|both|两队|btts/.test(blob)) return true;
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
      } catch (e) {
      }
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
    function enrichOptionFromBetMeta(option) {
      if (!option) return option;
      const meta = getBetMetaForOption(option);
      if (!meta || !meta.bttsSubstitute) return option;
      if (option.bttsSubstitute && option.testid && option.testid === meta.testid) return option;
      const enriched = Object.assign({}, option, {
        bttsSubstitute: true,
        substitutedFrom: meta.substitutedFrom || option.substitutedFrom || null,
        testid: meta.testid || option.testid,
        market: meta.market || "btts",
        side: meta.side || option.side || "y",
        label: meta.label || option.label || formatTargetOptionLabel(option.strategy, true)
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
      const market = getOptionBetMarket(option) || strategy.market && String(strategy.market).toLowerCase();
      const plateOn = getOptionBetPlateOn(option) || strategy.plateOn && String(strategy.plateOn).toLowerCase();
      const lineVariants = option.bttsSubstitute ? [] : orderLineVariants(strategy, market);
      const lineHit = !lineVariants.length || lineVariants.some(function(v) {
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
        htyApiState.apiBase = "";
      }
      return !!(htyApiState.apiBase || htyApiState.headers.authorization || getCachedOrdersReportText(matchId));
    }
    async function findRecentOrderForOptionOnce(option, sinceAt, fetchOpts) {
      const cutoff = sinceAt || Date.now() - BET_RECOVERY_WINDOW_MS;
      const loadOpts = Object.assign({
        passive: true,
        gmOnly: true,
        softFail: true
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
          console.warn("[hty-inplay] \u67E5\u8BE2\u8FD1\u671F\u8BA2\u5355\u5931\u8D25", e);
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
          setBetStep("\u67E5\u8BE2\u8BA2\u5355\u786E\u8BA4\u2026" + i + "/" + (retries - 1));
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
      return "";
    }
    function consumeLastCapturedBetSuccess(option, sinceAt) {
      const cap = lastCapturedBetSuccess;
      if (!cap) return null;
      if (Date.now() - cap.at > BET_API_WAIT_MS + 8e3) {
        lastCapturedBetSuccess = null;
        return null;
      }
      if (sinceAt && cap.at < sinceAt - 3e3) return null;
      lastCapturedBetSuccess = null;
      console.log("[hty-inplay] \u4F7F\u7528\u8FDF\u5230\u7684\u4E0B\u6CE8\u63A5\u53E3\u54CD\u5E94", cap.payload.orderno);
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
        setBetStep("\u68C0\u6D4B\u5230\u5DF2\u63D0\u4EA4\uFF0C\u81EA\u52A8\u70B9\u51FB\u786E\u5B9A\u2026");
        renderPanel(true);
        await dismissBetSubmittedDrawer();
        setBetStep("\u5DF2\u63D0\u4EA4\uFF0C\u6B63\u5728\u786E\u8BA4\u2026");
        renderPanel(true);
        await humanDelay(400, 700);
      }
      const fetchOpts = {
        passive: true,
        gmOnly: true,
        quick: opts.quick !== false,
        softFail: true
      };
      restoreApiState();
      restoreKnownOrdersApiBase();
      if (htyApiState.apiBase && isExcludedApiOrigin(htyApiState.apiBase)) {
        htyApiState.apiBase = "";
      }
      mergeProbeCredentials(await probeCredentialsFromPage());
      let order = null;
      if (canQueryOrdersReport() || getCachedOrdersReportText(matchId)) {
        const retries = opts.retries != null ? opts.retries : opts.quick === false || hadUiDrawer ? 3 : 1;
        const gapMs = opts.gapMs != null ? opts.gapMs : 1500;
        order = await findRecentOrderForOption(option, sinceAt, {
          retries,
          gapMs,
          fetchOpts
        });
      }
      if (order) {
        const orderno = String(
          order.orderId || order.orderno || order.orderNo || order.order_id || ""
        );
        console.log("[hty-inplay] \u5DF2\u4ECE\u8BA2\u5355\u5217\u8868\u6062\u590D\u4E0B\u6CE8\u6210\u529F", orderno);
        return buildStrategyBetRecord(option, {
          orderno,
          delay: order.delay,
          singles: [order],
          response: order,
          requestBody: null
        }, null);
      }
      if (hadUiDrawer || isBetSubmittedDrawerVisible()) {
        console.warn("[hty-inplay] UI\u5DF2\u63D0\u4EA4\u4E14GM\u67E5\u5355\u65E0\u7ED3\u679C\uFF0C\u6309\u6210\u529F\u5904\u7406");
        return buildBetRecordFromUiSuccess(option);
      }
      return null;
    }
    async function finalizeBetSuccess(option, betRecord, fromAutoBet, extraMsg) {
      const recHash = getBetRecHash(option, betRecord);
      let ruleExtra = extraMsg || "";
      markStrategyExecutedLocally(recHash);
      rememberExecutedStrategy(recHash, betRecord && betRecord.orderno, option, {
        pendingSync: true,
        betOdds: betRecord && betRecord.betOdds,
        betStake: betRecord && betRecord.betStake,
        matchId: betRecord && betRecord.matchId ? betRecord.matchId : matchId
      });
      const orderHint = betRecord && betRecord.orderno ? " \u5355\u53F7" + betRecord.orderno : "";
      const stakeText = betRecord && betRecord.betStake != null ? String(betRecord.betStake) : formatBetStakeSummary(option);
      const label = (option && option.label ? option.label : "") + " " + stakeText + " \u5DF2\u63D0\u4EA4" + orderHint;
      setBetResult("success", extraMsg ? label + "\uFF08" + extraMsg + "\uFF09" : label);
      renderPanel(true);
      if (recHash) {
        setBetStep("\u4E0A\u4F20\u7B56\u7565\u6295\u6CE8\u5355\u2026");
        renderPanel(true);
        try {
          await uploadStrategyBetRecord(betRecord);
        } catch (upErr) {
          console.warn("[hty-inplay] \u7B56\u7565\u6295\u6CE8\u5355\u4E0A\u4F20\u5F02\u5E38", upErr);
        }
        setBetStep("\u66F4\u65B0\u7B56\u7565\u72B6\u6001\u2026");
        renderPanel(true);
        try {
          await updateStrategyRuleWithRetry(recHash, "2", {
            orderno: betRecord.orderno,
            orderNo: betRecord.orderno,
            betOdds: betRecord.betOdds,
            betStake: betRecord.betStake,
            matchId: betRecord.matchId
          });
          markExecutedStrategySynced(recHash, isRealBetOrderNo(betRecord.orderno) ? betRecord.orderno : "");
          console.log("[hty-inplay] \u7B56\u7565\u72B6\u6001\u5DF2\u66F4\u65B0\u4E3A\u5DF2\u6267\u884C", recHash);
        } catch (ruleErr) {
          const msg = ruleErr && ruleErr.message ? ruleErr.message : "\u7B56\u7565\u72B6\u6001\u66F4\u65B0\u5931\u8D25";
          ruleExtra = ruleExtra ? ruleExtra + "\uFF1B" + msg : msg;
          console.warn("[hty-inplay] \u7B56\u7565\u72B6\u6001\u63A5\u53E3\u5931\u8D25\uFF0C\u5DF2\u672C\u5730\u9501\u5B9A\u9632\u91CD\uFF0C\u7A0D\u540E\u91CD\u8BD5\u540C\u6B65", recHash, msg);
        }
      }
      clearBetInFlight();
      clearBetAttempt(recHash);
      await continueAfterBetSuccess(option, ruleExtra || void 0, !!fromAutoBet, betRecord);
    }
    function purgeLocalExecutedForStrategy(store, recHash) {
      if (!store || !recHash) return;
      delete store[recHash];
      const keys = Object.keys(store);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key.indexOf("tid:") !== 0) continue;
        const entry = store[key];
        if (!entry || !entry.recHash || entry.recHash === recHash) {
          delete store[key];
        }
      }
    }
    function reconcileLocalExecutedWithApi() {
      const store = pruneExecutedStrategyStore(loadExecutedStrategyStore());
      let dirty = false;
      for (let i = 0; i < strategyList.length; i++) {
        const item = strategyList[i];
        if (!item || !item.recHash) continue;
        const apiIgnore = String(item.ruleMeetIgnore != null ? item.ruleMeetIgnore : "0");
        if (apiIgnore === "2") {
          const cur = store[item.recHash];
          if (!cur) {
            store[item.recHash] = { orderno: "", at: Date.now(), pendingSync: false };
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
          if (entry.pendingSync) {
            item.ruleMeetIgnore = "2";
            continue;
          }
          if (age < BET_RECOVERY_WINDOW_MS) {
            item.ruleMeetIgnore = "2";
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
        recHash,
        ruleMeetIgnore: String(ruleMeetIgnore != null ? ruleMeetIgnore : "2"),
        quantFlag: "2"
      };
      if (extra) {
        if (isRealBetOrderNo(extra.orderno)) payload.orderno = String(extra.orderno);
        if (isRealBetOrderNo(extra.orderNo)) payload.orderNo = String(extra.orderNo);
        if (extra.betOdds != null) payload.betOdds = extra.betOdds;
        if (extra.betStake != null) payload.betStake = extra.betStake;
        if (extra.matchId) payload.matchId = extra.matchId;
      }
      return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
          method: "PUT",
          url: ALERT_RULE_API,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify(payload),
          timeout: 15e3,
          onload: function(res) {
            try {
              const json = JSON.parse(res.responseText);
              if (String(json.code) !== "200") {
                reject(new Error(json.msg || "\u7B56\u7565\u72B6\u6001\u66F4\u65B0\u5931\u8D25"));
                return;
              }
              resolve(json);
            } catch (e) {
              reject(e);
            }
          },
          onerror: function() {
            reject(new Error("\u7B56\u7565\u72B6\u6001\u63A5\u53E3\u7F51\u7EDC\u9519\u8BEF"));
          },
          ontimeout: function() {
            reject(new Error("\u7B56\u7565\u72B6\u6001\u63A5\u53E3\u8BF7\u6C42\u8D85\u65F6"));
          }
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
          console.warn("[hty-inplay] \u7B56\u7565\u72B6\u6001\u66F4\u65B0\u91CD\u8BD5", i + 1, err && err.message ? err.message : err);
          if (i + 1 < STRATEGY_RULE_UPDATE_RETRIES) {
            await humanDelay(800, 1400);
          }
        }
      }
      throw lastErr || new Error("\u7B56\u7565\u72B6\u6001\u66F4\u65B0\u5931\u8D25");
    }
    function abortedSyncedStorageKey(id) {
      return ABORTED_SYNCED_KEY + "_" + (id || matchId || "");
    }
    function loadAbortedSyncedStore(id) {
      try {
        const raw = sessionStorage.getItem(abortedSyncedStorageKey(id));
        const store = raw ? JSON.parse(raw) : {};
        return store && typeof store === "object" ? store : {};
      } catch (e) {
        return {};
      }
    }
    function saveAbortedSyncedStore(store, id) {
      try {
        sessionStorage.setItem(abortedSyncedStorageKey(id), JSON.stringify(store || {}));
      } catch (e) {
      }
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
        if (!entry || !entry.pendingSync) continue;
        try {
          await updateStrategyRuleWithRetry(item.recHash, "2", {
            orderno: entry.orderno,
            orderNo: entry.orderno,
            betOdds: entry.betOdds,
            betStake: entry.betStake,
            matchId: entry.matchId || item.matchId || matchId
          });
          item.ruleMeetIgnore = "2";
          entry.pendingSync = false;
          dirty = true;
          console.log("[hty-inplay] \u5F85\u540C\u6B65\u7B56\u7565\u72B6\u6001\u5DF2\u8865\u4F20\u4E3A\u5DF2\u6267\u884C", item.recHash);
        } catch (err) {
          item.ruleMeetIgnore = "2";
          console.warn(
            "[hty-inplay] \u5F85\u540C\u6B65\u7B56\u7565\u72B6\u6001\u8865\u4F20\u5931\u8D25",
            item.recHash,
            err && err.message ? err.message : err
          );
        }
      }
      if (dirty) saveExecutedStrategyStore(store);
    }
    async function syncAbortedStrategyStatuses() {
      const toSync = strategyList.filter(function(item) {
        return needsAbortedStatusPut(item) && !isAbortedSyncDone(item.recHash);
      });
      if (!toSync.length) return;
      for (let i = 0; i < toSync.length; i++) {
        const item = toSync[i];
        try {
          await updateStrategyRuleWithRetry(item.recHash, "1", {
            matchId: item.matchId || matchId
          });
          item.ruleMeetIgnore = "1";
          markAbortedSyncDone(item.recHash);
          console.log("[hty-inplay] \u7B56\u7565\u72B6\u6001\u5DF2\u66F4\u65B0\u4E3A\u5DF2\u4E2D\u6B62", item.recHash);
        } catch (err) {
          console.warn(
            "[hty-inplay] \u7B56\u7565\u4E2D\u6B62\u72B6\u6001\u540C\u6B65\u5931\u8D25",
            item.recHash,
            err && err.message ? err.message : err
          );
        }
      }
      lastStrategyListKey = "";
    }
    function markStrategyExecuted(recHash, orderno, option) {
      rememberExecutedStrategy(recHash, orderno, option);
      for (let i = 0; i < strategyList.length; i++) {
        if (strategyList[i].recHash === recHash) {
          strategyList[i].ruleMeetIgnore = "2";
          break;
        }
      }
      if (targetOption && targetOption.strategy && targetOption.strategy.recHash === recHash) {
        targetOption = null;
      }
      lastStrategyListKey = "";
      lastStrategyHitKey = "";
    }
    function fetchAlertStrategies(id) {
      return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
          method: "GET",
          url: ALERT_API + "?match_id=" + encodeURIComponent(id),
          timeout: 15e3,
          onload: function(res) {
            try {
              const json = JSON.parse(res.responseText);
              if (String(json.code) !== "200") {
                reject(new Error(json.msg || "API \u8FD4\u56DE\u9519\u8BEF"));
                return;
              }
              resolve(json.data || {});
            } catch (e) {
              reject(e);
            }
          },
          onerror: function() {
            reject(new Error("\u7B56\u7565\u63A5\u53E3\u7F51\u7EDC\u9519\u8BEF"));
          },
          ontimeout: function() {
            reject(new Error("\u7B56\u7565\u63A5\u53E3\u8BF7\u6C42\u8D85\u65F6"));
          }
        });
      });
    }
    function strategyRenderKey() {
      if (strategyStatus === "err") {
        return "err|" + strategyError;
      }
      const rows = strategyList.map(function(item) {
        return [
          item.recHash || "",
          item.market || "",
          item.plateOn || "",
          item.plateOnK != null ? String(item.plateOnK) : "",
          item.plateOddsHit != null ? String(item.plateOddsHit) : "",
          item.plateAmount != null ? String(item.plateAmount) : "",
          item.plateAmountRate != null ? String(item.plateAmountRate) : "",
          item.ruleMeetIgnore != null ? String(item.ruleMeetIgnore) : "",
          item.ruleMeet != null ? String(item.ruleMeet) : "",
          item.ruleMeetInvalid != null ? String(item.ruleMeetInvalid) : "",
          item.invalidFlag != null ? String(item.invalidFlag) : "",
          item.kickoffTime || ""
        ].join(":");
      }).join(";");
      return strategyStatus + "|" + strategyTrigger + "|" + strategyList.length + "|" + rows;
    }
    async function loadStrategies(silent, skipMatchesLoad) {
      const isSilent = !!silent;
      if (!skipMatchesLoad) void loadActiveMatches(isSilent);
      if (!isSilent && !strategyList.length) {
        strategyStatus = "loading";
        strategyError = "";
        renderPanel(true);
      }
      let reconciled = false;
      try {
        const payload = await fetchAlertStrategies(matchId);
        strategyList = Array.isArray(payload.data) ? payload.data : [];
        strategyTrigger = payload.trigger != null ? String(payload.trigger) : "";
        reconciled = reconcileLocalExecutedWithApi();
        await syncPendingExecutedStrategyStatuses();
        await syncAbortedStrategyStatuses();
        strategyStatus = "ok";
        strategyError = "";
        const curMeet = countPendingRuleMeet(strategyList);
        if (curMeet > 0) {
          matchRuleMeetCache[String(matchId)] = { meetCount: curMeet, at: Date.now() };
        } else {
          delete matchRuleMeetCache[String(matchId)];
        }
        syncCurrentMatchPendingWorkCache();
        lastMatchesListKey = "";
        if (reconciled) {
          lastStrategyListKey = "";
          lastStrategyHitKey = "";
        }
      } catch (err) {
        if (!isSilent || !strategyList.length) {
          strategyList = [];
          strategyTrigger = "";
        }
        strategyStatus = "err";
        strategyError = err && err.message ? err.message : "\u52A0\u8F7D\u5931\u8D25";
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
      if (strategyStatus === "ok" && matchId && countPendingWorkStrategies(strategyList) === 0 && !placing && !isUserManualMatchLockActive()) {
        if (hasNavigableInPlayMatches()) {
          void maybeAutoNavigateToInplay();
        } else if (!isCurrentMatchEnded()) {
          setBetStep("\u672C\u573A\u7B56\u7565\u5DF2\u5168\u90E8\u7ED3\u675F\uFF0C\u6682\u65E0\u5176\u5B83\u5F85\u6267\u884C\u6BD4\u8D5B");
        }
      }
      try {
        await refreshTargetOption(true);
        renderPanel(true, false);
        maybeTriggerAutoBet(false);
      } catch (err) {
        lastScanError = err && err.message ? err.message : "\u626B\u63CF\u5931\u8D25";
        betStep = "\u626B\u63CF\u5F02\u5E38";
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
        placing ? "1" : "0",
        loggedIn ? "1" : "0",
        targetOption ? targetOption.testid : "none",
        targetOption ? targetOption.odds : "",
        isCartOpen() ? "1" : "0",
        lastScanButtonCount,
        lastScanViewMode,
        lastScanError,
        stakeMode
      ].join("|");
    }
    function updatePanelStatus(force) {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      const loggedIn = isLoggedIn();
      const key = statusPanelKey(loggedIn);
      if (!force && key === lastStatusPanelKey) return;
      lastStatusPanelKey = key;
      const matchEl = panel.querySelector(".tm-hty-match");
      const linkEl = panel.querySelector(".tm-hty-link-hty");
      const traceLinkEl = panel.querySelector(".tm-hty-link-trace");
      const upcomingEl = panel.querySelector(".tm-hty-upcoming");
      const resultEl = panel.querySelector(".tm-hty-result");
      const stepEl = panel.querySelector(".tm-hty-step");
      const loginEl = panel.querySelector(".tm-hty-login");
      const scanEl = panel.querySelector(".tm-hty-scan");
      const openCartBtn = panel.querySelector('[data-action="open-cart"]');
      const testBetBtn = panel.querySelector('[data-action="test-bet"]');
      const stakeSelect = panel.querySelector(".tm-hty-stake-select");
      const dedupToggle = panel.querySelector(".tm-hty-dedup-toggle");
      if (matchEl) {
        if (isStrandedSportEventsPage()) {
          matchEl.textContent = "\u8D5B\u4E8B\u603B\u89C8 \xB7 \u70B9\u51FB\u4E0B\u65B9\u7B56\u7565\u8D5B\u4E8B\u8DF3\u8F6C";
        } else if (isInplayListPage()) {
          matchEl.textContent = "\u6EDA\u7403\u5217\u8868 \xB7 \u70B9\u51FB\u7B56\u7565\u8D5B\u4E8B\u8DF3\u8F6C\uFF08" + stakeModeLabel(stakeMode) + "\uFF09";
        } else {
          matchEl.textContent = "\u8D5B\u4E8B " + matchId + "\uFF08\u6EDA\u7403\uFF09\xB7 \u7B56\u7565\u81EA\u52A8\u4E0B\u6CE8\uFF08" + stakeModeLabel(stakeMode) + "\uFF09";
        }
      }
      if (scanEl) {
        const full = scanStatusFull();
        scanEl.textContent = truncatePanelText(full, PANEL_TEXT_MAX);
        scanEl.title = full.length > PANEL_TEXT_MAX ? full : "";
      }
      if (linkEl) {
        linkEl.href = matchPageUrl();
        linkEl.textContent = "HTY\u6BD4\u8D5B\u9875";
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
        const step = betStep || "\u2014";
        stepEl.textContent = truncatePanelText(step, PANEL_TEXT_MAX);
        stepEl.title = step.length > PANEL_TEXT_MAX ? step : "";
      }
      if (loginEl) {
        loginEl.textContent = loggedIn ? "\u5DF2\u767B\u5F55" : "\u672A\u767B\u5F55";
        loginEl.dataset.kind = loggedIn ? "ok" : "warn";
        loginEl.title = loggedIn ? "" : "\u70B9\u51FB\u7ACB\u5373\u7528 0514 \u767B\u5F55";
      }
      if (openCartBtn) {
        openCartBtn.textContent = isCartOpen() ? "\u6295\u6CE8\u5355\u5DF2\u5F00" : "\u6253\u5F00\u6295\u6CE8\u5355";
        openCartBtn.disabled = placing;
      }
      if (testBetBtn) {
        testBetBtn.disabled = placing;
        testBetBtn.textContent = stakeMode === "strategy" ? "\u6D4B\u8BD5\u4E0B\u6CE8" : "\u6D4B\u8BD5 " + stakeModeLabel(stakeMode);
      }
      if (stakeSelect && stakeSelect.value !== stakeMode) {
        stakeSelect.value = stakeMode;
      }
      const stakeRow = panel.querySelector(".tm-hty-stake-row");
      if (stakeRow) {
        stakeRow.classList.toggle("tm-hty-stake-alert", stakeMode !== "strategy");
        stakeRow.title = stakeMode !== "strategy" ? "\u5F53\u524D\u4E3A\u56FA\u5B9A\u91D1\u989D\uFF0C\u975E\u7B56\u7565\u5B9E\u9645\u91D1\u989D" : "";
      }
      if (dedupToggle) {
        dedupToggle.checked = isBetDedupEnabled();
      }
    }
    function renderPageStrategies(panel) {
      const statusEl = panel.querySelector(".tm-hty-strategy-status");
      const listEl = panel.querySelector(".tm-hty-strategy-list");
      if (!statusEl || !listEl) return;
      const listKey = strategyRenderKey();
      const hitKey = strategyHitRenderKey();
      if (listKey === lastStrategyListKey && hitKey === lastStrategyHitKey) return;
      lastStrategyListKey = listKey;
      lastStrategyHitKey = hitKey;
      if (strategyStatus === "loading" && !strategyList.length) {
        statusEl.textContent = "\u52A0\u8F7D\u4E2D\u2026";
        statusEl.dataset.kind = "info";
        listEl.innerHTML = "";
        return;
      }
      if (strategyStatus === "err") {
        statusEl.textContent = strategyError || "\u52A0\u8F7D\u5931\u8D25";
        statusEl.dataset.kind = "err";
        if (!strategyList.length) {
          listEl.innerHTML = "";
        }
        return;
      }
      const actionableCount = strategyStates.filter(function(st) {
        return st.actionable;
      }).length;
      const hitPendingCount = strategyStates.filter(function(st) {
        return st.hit && st.execStatus === "pending";
      }).length;
      const plateCount = strategyStates.filter(function(st) {
        return st.plateMatched;
      }).length;
      const executedCount = strategyList.filter(function(item) {
        return getStrategyExecStatus(item) === "executed";
      }).length;
      const abortedCount = strategyList.filter(function(item) {
        return getStrategyExecStatus(item) === "aborted";
      }).length;
      const confirmingCount = strategyList.filter(function(item) {
        return getStrategyExecStatus(item) === "confirming";
      }).length;
      let statusText = strategyList.length + " \u6761 \xB7 #" + matchId;
      if (executedCount > 0) {
        statusText += " \xB7 " + executedCount + " \u6761\u5DF2\u6267\u884C";
      }
      if (abortedCount > 0) {
        statusText += " \xB7 " + abortedCount + " \u6761\u5DF2\u4E2D\u6B62";
      }
      if (confirmingCount > 0) {
        statusText += " \xB7 " + confirmingCount + " \u6761\u5F85\u786E\u8BA4";
      }
      if (actionableCount > 0) {
        statusText += " \xB7 " + actionableCount + " \u6761\u53EF\u4E0B\u5355";
        statusEl.dataset.kind = "ready";
      } else if (hitPendingCount > 0) {
        statusText += " \xB7 " + hitPendingCount + " \u6761\u5DF2\u6EE1\u8DB3";
        statusEl.dataset.kind = "ready";
      } else if (plateCount > 0) {
        statusText += " \xB7 " + plateCount + " \u6761\u76D8\u53E3\u5DF2\u5339\u914D";
        statusEl.dataset.kind = "info";
      } else {
        statusText += " \xB7 \u7B49\u5F85\u76D8\u53E3";
        statusEl.dataset.kind = "info";
      }
      statusEl.textContent = statusText;
      if (!strategyList.length) {
        listEl.innerHTML = '<div class="tm-hty-strategy-empty">\u6682\u65E0\u7B56\u7565</div>';
        return;
      }
      listEl.innerHTML = strategyList.map(function(item, idx) {
        const state = strategyStates[idx] || {};
        let markClass = "tm-hty-strategy-mark";
        let markText = "";
        let markTitle = "\u672A\u5339\u914D\u76D8\u53E3";
        if (state.execStatus === "executed") {
          markClass += " done";
          markText = "\u2713";
          markTitle = "\u7B56\u7565\u5DF2\u6267\u884C";
        } else if (state.execStatus === "aborted") {
          markClass += " aborted";
          markText = "\xD7";
          markTitle = "\u7B56\u7565\u5DF2\u4E2D\u6B62";
        } else if (state.execStatus === "confirming") {
          markClass += " confirming";
          if (state.hit) {
            markText = "\u2713";
            markTitle = "\u5F85\u786E\u8BA4 \xB7 \u76D8\u53E3+\u8D54\u7387\u5DF2\u6EE1\u8DB3\uFF0C\u4E0D\u53C2\u4E0E\u81EA\u52A8\u4E0B\u5355";
          } else if (state.plateMatched) {
            markText = "\u25CE";
            markTitle = "\u5F85\u786E\u8BA4 \xB7 \u76D8\u53E3\u5DF2\u5339\u914D\uFF0C\u4E0D\u53C2\u4E0E\u81EA\u52A8\u4E0B\u5355";
          } else {
            markTitle = "\u5F85\u786E\u8BA4 \xB7 \u4E0D\u53C2\u4E0E\u81EA\u52A8\u4E0B\u5355";
          }
        } else if (state.dedupBlocked) {
          markClass += " plate";
          markText = "\u25CE";
          const waitingConfirm = isScriptDedupInflight(
            { testid: state.testid, strategy: state.strategy },
            state.strategy && state.strategy.recHash
          );
          markTitle = state.hit ? waitingConfirm ? "\u672A\u6267\u884C \xB7 \u5DF2\u8FBE\u9608\u503C\uFF0C\u9632\u91CD\u7B49\u5F85\u8BA2\u5355\u786E\u8BA4\uFF08\u67E5\u65E0\u5355\u7EA6 60s \u540E\u53EF\u91CD\u8BD5\uFF09" : "\u672A\u6267\u884C \xB7 \u5DF2\u8FBE\u9608\u503C\uFF0C\u811A\u672C\u9632\u91CD\u62E6\u622A\uFF08\u540C\u6309\u94AE\u5176\u5B83\u6863\u4F4D\u5DF2\u4E0B\u6216\u8FDB\u884C\u4E2D\uFF09" : "\u672A\u6267\u884C \xB7 \u811A\u672C\u9632\u91CD\uFF1A\u672C\u7B56\u7565\u5DF2\u4E0B\u5355\uFF0C\u8DF3\u8FC7\u91CD\u590D";
        } else if (state.actionable) {
          markClass += " hit";
          markText = "\u2713";
          markTitle = "\u672A\u6267\u884C \xB7 \u76D8\u53E3+\u8D54\u7387\u5DF2\u6EE1\u8DB3\uFF0C\u53EF\u81EA\u52A8\u4E0B\u5355";
        } else if (state.hit) {
          markClass += " hit";
          markText = "\u2713";
          markTitle = "\u76D8\u53E3+\u8D54\u7387\u5DF2\u6EE1\u8DB3";
        } else if (state.plateMatched) {
          markClass += " plate";
          markText = "\u25CE";
          markTitle = "\u76D8\u53E3\u5DF2\u5339\u914D\uFF0C\u8D54\u7387\u672A\u8FBE\u9608\u503C";
        }
        const rowClass = state.actionable ? " tm-hty-strategy-item-hit" : state.execStatus === "executed" ? " tm-hty-strategy-item-done" : state.execStatus === "aborted" ? " tm-hty-strategy-item-aborted" : state.execStatus === "confirming" ? " tm-hty-strategy-item-confirming" : "";
        return '<div class="tm-hty-strategy-item' + rowClass + '"><span class="tm-hty-strategy-idx">' + (idx + 1) + '.</span><span class="' + markClass + '" title="' + markTitle + '">' + markText + '</span><span class="tm-hty-strategy-text">' + formatStrategyItemHtml(item, state) + "</span></div>";
      }).join("");
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
        panelReady ? "1" : "0",
        panelCollapsed ? "1" : "0",
        matchId,
        strategyStatus,
        strategyHitRenderKey(),
        strategyList.length,
        strategyError
      ].join("|");
      if (!force && panelKey === lastPanelKey) {
        updatePanelStatus();
        return;
      }
      lastPanelKey = panelKey;
      updatePanelStatus(true);
      renderStrategies(panel);
    }
    function shouldAutoBet() {
      if (strategyStatus !== "ok" || !strategyList.length) return false;
      if (placing || autoBetInFlight) return false;
      if (betResult === "pending" && betStep && (betStep.indexOf("\u8BF7\u52FF\u624B\u52A8\u91CD\u590D\u4E0B\u6CE8") >= 0 || betStep.indexOf("\u6682\u505C\u91CD\u590D\u4E0B\u5355") >= 0 || betStep.indexOf("\u9632\u91CD\u67E5\u5355\u4E2D") >= 0)) {
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
      const text = String(url || "").trim();
      if (!text || text === "undefined") return "";
      if (/^https?:\/\//i.test(text)) return text;
      try {
        return new URL(text, window.location.origin).href;
      } catch (e) {
        return text;
      }
    }
    function extractSiteApiBase(responseUrl) {
      const text = String(responseUrl || "").trim();
      if (!text || text === "undefined") return "";
      try {
        return new URL(text).origin;
      } catch (e) {
        const m = text.match(/^(https?:\/\/[^/?#]+)/i);
        return m ? m[1] : "";
      }
    }
    const PLATFORM_HEADER_KEYS = [
      "authorization",
      "x-uuid",
      "cks",
      "x-checksum",
      "currency",
      "time-zone",
      "device",
      "apptype",
      "devicemode",
      "browser",
      "phonebrand",
      "screen",
      "os",
      "devicetype",
      "accept-language",
      "accept"
    ];
    function mergePlatformHeaders(raw) {
      if (!raw) return;
      PLATFORM_HEADER_KEYS.forEach(function(key) {
        if (raw[key] != null && raw[key] !== "") {
          htyApiState.headers[key] = raw[key];
        }
      });
    }
    function buildPlatformRequestHeaders() {
      const src = htyApiState.headers;
      const out = {
        Accept: src.accept || "application/json, text/plain, */*",
        "Accept-Language": src["accept-language"] || "zh-cn",
        Referer: window.location.origin + "/",
        Origin: window.location.origin
      };
      if (src.currency) out.currency = src.currency;
      if (src["time-zone"]) out["time-zone"] = src["time-zone"];
      if (src.device) out.device = src.device;
      if (src.apptype) out.appType = src.apptype;
      if (src.authorization) out.authorization = src.authorization;
      if (src["x-uuid"]) out["x-uuid"] = src["x-uuid"];
      if (src.cks) out.cks = src.cks;
      if (src.devicemode) out.deviceMode = src.devicemode;
      if (src.browser) out.browser = src.browser;
      if (src.phonebrand) out.phoneBrand = src.phonebrand;
      if (src.screen) out.screen = src.screen;
      if (src.os) out.os = src.os;
      if (src.devicetype) out.deviceType = src.devicetype;
      if (src["x-checksum"]) out["x-checksum"] = src["x-checksum"];
      return out;
    }
    function buildPageContextRequestHeaders() {
      const out = Object.assign({}, buildPlatformRequestHeaders());
      delete out.Referer;
      delete out.Origin;
      delete out.referer;
      delete out.origin;
      return out;
    }
    function apiHostName(originOrUrl) {
      let raw = String(originOrUrl || "").trim();
      if (!raw) return "";
      try {
        if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.toLowerCase();
        if (raw.indexOf("/") >= 0) return new URL(raw).hostname.toLowerCase();
      } catch (e) {
      }
      return raw.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
    }
    function classifyApiHost(originOrUrl) {
      const host = apiHostName(originOrUrl);
      if (!host) return { kind: "unknown", score: 0, host: "" };
      if (/-fluid(?:[.-]|$)/.test(host)) return { kind: "cdn", score: 0, host };
      if (/(?:^|[.-])fe-source(?:[.-]|$)/.test(host)) return { kind: "cdn", score: 0, host };
      if (/(?:^|[.-])fe-static(?:[.-]|$)/.test(host)) return { kind: "cdn", score: 0, host };
      if (/(?:^|[.-])(?:static|cdn|assets)(?:[.-]|$)/.test(host)) return { kind: "cdn", score: 0, host };
      if (/shbxs\d+\./.test(host)) return { kind: "cdn", score: 0, host };
      if (/^i18n[-.]/.test(host)) return { kind: "cdn", score: 0, host };
      if (/-api-ddos(?:[.-]|$)/.test(host)) return { kind: "api", score: 95, host };
      if (/-api[-.]/.test(host)) return { kind: "api", score: 88, host };
      return { kind: "unknown", score: 0, host };
    }
    function isLikelyPlatformApiOrigin(origin) {
      return classifyApiHost(origin).kind === "api";
    }
    function isExcludedApiOrigin(origin) {
      const host = apiHostName(origin);
      if (!host) return true;
      return classifyApiHost(origin).kind === "cdn";
    }
    function scoreApiOrigin(origin) {
      const c = classifyApiHost(origin);
      return c.kind === "api" ? c.score : 0;
    }
    function isProvenPlatformApiUrl(url) {
      const u = String(url || "");
      return /\/product\/game\/bet/i.test(u) || /\/thirdparty-report\/user\/orders\/sport/i.test(u) || /\/platform\/payment\/wallets/i.test(u) || /\/product\/cashout\//i.test(u);
    }
    function extractPlatformApiBase(url) {
      const base = extractSiteApiBase(url);
      if (!base || isExcludedApiOrigin(base)) return "";
      if (isProvenPlatformApiUrl(url) && isLikelyPlatformApiOrigin(base)) return base;
      if (isLikelyPlatformApiOrigin(base)) return base;
      return "";
    }
    function purgeInvalidOrdersApiBase() {
      try {
        const saved = sessionStorage.getItem(HTY_ORDERS_API_BASE_KEY);
        if (saved && !isLikelyPlatformApiOrigin(saved)) {
          sessionStorage.removeItem(HTY_ORDERS_API_BASE_KEY);
        }
      } catch (e) {
      }
      if (htyApiState.apiBase && !isLikelyPlatformApiOrigin(htyApiState.apiBase)) {
        htyApiState.apiBase = "";
      }
    }
    function rememberKnownOrdersApiBase(base) {
      const b = String(base || "").replace(/\/$/, "");
      if (!b || !isLikelyPlatformApiOrigin(b)) return;
      htyApiState.apiBase = b;
      htyApiState.lastCaptureAt = Date.now();
      try {
        sessionStorage.setItem(HTY_ORDERS_API_BASE_KEY, b);
      } catch (e) {
      }
      persistApiState();
    }
    function restoreKnownOrdersApiBase() {
      purgeInvalidOrdersApiBase();
      try {
        const saved = sessionStorage.getItem(HTY_ORDERS_API_BASE_KEY);
        if (saved && isLikelyPlatformApiOrigin(saved)) {
          htyApiState.apiBase = saved;
        }
      } catch (e) {
      }
    }
    function discoverApiBaseCandidates() {
      const scored = [];
      const seen = {};
      function add(base, score) {
        const b = String(base || "").replace(/\/$/, "");
        if (!b || seen[b] || isExcludedApiOrigin(b)) return;
        seen[b] = 1;
        scored.push({ base: b, score });
      }
      try {
        const saved = sessionStorage.getItem(HTY_ORDERS_API_BASE_KEY);
        if (saved && isLikelyPlatformApiOrigin(saved)) add(saved, 100);
      } catch (e) {
      }
      if (htyApiState.apiBase && isLikelyPlatformApiOrigin(htyApiState.apiBase)) {
        add(htyApiState.apiBase, 90);
      }
      try {
        performance.getEntriesByType("resource").forEach(function(entry) {
          const u = entry.name || "";
          try {
            const origin = new URL(u).origin;
            if (origin === location.origin) return;
            const hostScore = scoreApiOrigin(origin);
            if (isProvenPlatformApiUrl(u) && hostScore > 0) {
              add(origin, 80 + hostScore);
            } else if (hostScore > 0) {
              add(origin, hostScore);
            }
          } catch (e) {
          }
        });
      } catch (e) {
      }
      scored.sort(function(a, b) {
        return b.score - a.score;
      });
      const out = scored.map(function(x) {
        return x.base;
      });
      if (out.length) {
        console.log("[hty-inplay] API \u5019\u9009(\u7B5B\u9009\u540E)", out.length, out);
      }
      return out.slice(0, ORDERS_DISCOVER_MAX_BASES);
    }
    function formatReportDateTime(d) {
      const pad = function(n) {
        return String(n).padStart(2, "0");
      };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    function buildOrdersReportPathQuery(opts) {
      const options = opts || {};
      const end = /* @__PURE__ */ new Date();
      const start2 = new Date(end);
      const daysBack = options.daysBack != null ? options.daysBack : 6;
      start2.setDate(start2.getDate() - daysBack);
      start2.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 0);
      let qs = "betStatus=2&startDate=" + encodeURIComponent(formatReportDateTime(start2)) + "&endDate=" + encodeURIComponent(formatReportDateTime(end)) + "&dataType=0&timeConditionType=BET";
      if (options.iids != null && options.iids !== "") {
        qs += "&iids=" + encodeURIComponent(String(options.iids));
      }
      return "/platform/thirdparty-report/user/orders/sport?" + qs;
    }
    function buildOrdersReportUrl(apiBase, opts) {
      return apiBase.replace(/\/$/, "") + buildOrdersReportPathQuery(opts);
    }
    function countOrdersInReportText(jsonText) {
      if (!jsonText) return 0;
      try {
        const json = JSON.parse(jsonText);
        const data = json && json.data;
        if (!data || typeof data !== "object") return 0;
        let count = 0;
        ["unSettlement", "settlement", "cancel"].forEach(function(key) {
          const block = data[key];
          if (block && Array.isArray(block.data)) count += block.data.length;
        });
        return count;
      } catch (e) {
        return 0;
      }
    }
    function parseOrdersReportMatchId(url) {
      const m = String(url || "").match(/[?&]iids=([^&]+)/i);
      return m ? decodeURIComponent(m[1]) : "";
    }
    function cacheOrdersReport(url, text) {
      if (!text || !/orders\/sport/i.test(url || "")) return;
      if (!isValidOrdersReportText(text)) return;
      const entry = {
        text,
        url,
        matchId: parseOrdersReportMatchId(url),
        at: Date.now()
      };
      lastCapturedOrdersReport = entry;
      try {
        sessionStorage.setItem(HTY_ORDERS_CACHE_KEY, JSON.stringify(entry));
      } catch (e) {
      }
      try {
        const base = extractPlatformApiBase(url);
        if (base) rememberKnownOrdersApiBase(base);
      } catch (e) {
      }
    }
    function reportContainsMatchId(text, mid) {
      if (!text || !mid) return false;
      const id = String(mid);
      return text.indexOf('"iid":' + id) >= 0 || text.indexOf('"iid":"' + id + '"') >= 0 || text.indexOf('"matchId":"' + id + '"') >= 0 || text.indexOf('"matchId":' + id) >= 0;
    }
    function getCachedOrdersReportText(targetMatchId) {
      let cap = lastCapturedOrdersReport;
      if (!cap || !cap.text) {
        try {
          cap = JSON.parse(sessionStorage.getItem(HTY_ORDERS_CACHE_KEY) || "null");
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
        if (!json || typeof json !== "object") return false;
        const code = json.code;
        if (code != null && String(code) !== "0" && String(code) !== "200") return false;
        return !!(json.data && typeof json.data === "object");
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
      const targetId = String(mid || matchId || "");
      if (!targetId) return null;
      restoreApiState();
      restoreKnownOrdersApiBase();
      mergeProbeCredentials(await probeCredentialsFromPage());
      if (!hasPlatformCredentials() && !htyApiState.apiBase) {
        await ensureHtyApiCredentials(4e3, null);
      }
      let cached = getCachedOrdersReportText(targetId);
      if (cached && countOrdersInReportText(cached) > 0) return cached;
      const candidates = discoverApiBaseCandidates();
      if (candidates.length) {
        try {
          console.log("[hty-inplay] \u4E3B\u52A8\u9875\u9762\u62C9\u5355", tag || "", targetId);
          const batch = await pageContextFetchMatchOrdersReport(
            targetId,
            MATCH_BET_HISTORY_DAYS,
            candidates.slice(0, ORDERS_DISCOVER_MAX_BASES)
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
          console.warn("[hty-inplay] \u4E3B\u52A8\u9875\u9762\u62C9\u5355\u5931\u8D25", tag || "", e);
        }
      }
      if (htyApiState.apiBase || htyApiState.headers.authorization) {
        const bases = htyApiState.apiBase ? [htyApiState.apiBase.replace(/\/$/, "")] : candidates.slice(0, ORDERS_DISCOVER_MAX_BASES);
        for (let i = 0; i < bases.length; i++) {
          const url = buildOrdersReportUrl(bases[i], {
            iids: targetId,
            daysBack: MATCH_BET_HISTORY_DAYS
          });
          try {
            console.log("[hty-inplay] \u4E3B\u52A8 GM \u62C9\u5355", tag || "", url);
            const text = await gmPlatformGetText(url, ORDERS_CONFIRM_GM_MS);
            if (isValidOrdersReportText(text)) {
              cacheOrdersReport(url, text);
              return text;
            }
          } catch (e) {
            console.warn("[hty-inplay] \u4E3B\u52A8 GM \u62C9\u5355\u5931\u8D25", tag || "", e);
          }
        }
      }
      return getCachedOrdersReportText(targetId);
    }
    function pageContextFetchMatchOrdersReport(targetMatchId, daysBack, candidateBases) {
      return new Promise(function(resolve, reject) {
        const reqId = "orders_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        const pathQs = buildOrdersReportPathQuery({
          iids: targetMatchId,
          daysBack: daysBack != null ? daysBack : MATCH_BET_HISTORY_DAYS
        });
        const knownBase = htyApiState.apiBase || "";
        const attemptMs = ORDERS_FETCH_ATTEMPT_MS;
        const maxBases = ORDERS_DISCOVER_MAX_BASES;
        const bases = candidateBases && candidateBases.length ? candidateBases.slice(0, maxBases) : discoverApiBaseCandidates();
        const pageHeaders = buildPageContextRequestHeaders();
        const waitMs = Math.min(REPORT_UPLOAD_TIMEOUT, Math.max(8e3, bases.length * attemptMs + 3e3));
        let settled = false;
        function finish(err, payload) {
          if (settled) return;
          settled = true;
          window.removeEventListener("message", onMsg);
          if (err) reject(err);
          else resolve(payload);
        }
        function onMsg(e) {
          if (e.source !== window || !e.data || e.data.source !== PAGE_USR_SRC) return;
          if (e.data.type !== "orders-fetch" || e.data.id !== reqId) return;
          if (e.data.ok) {
            finish(null, {
              text: e.data.text || "",
              url: e.data.url || "",
              apiBase: e.data.apiBase || ""
            });
          } else {
            finish(new Error(e.data.error || "\u8BA2\u5355\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25"));
          }
        }
        if (!bases.length) {
          finish(new Error("\u5C1A\u65E0 API \u5730\u5740\uFF0C\u8BF7\u5728\u672C\u9875\u5B8C\u6210\u4E00\u6B21\u4E0B\u6CE8\u540E\u518D\u4E0A\u4F20"));
          return;
        }
        window.addEventListener("message", onMsg);
        const script = document.createElement("script");
        script.textContent = "(function(){try{var id=" + JSON.stringify(reqId) + ";var USR_SRC=" + JSON.stringify(PAGE_USR_SRC) + ";var pathQs=" + JSON.stringify(pathQs) + ";var attemptMs=" + attemptMs + ";var candidateBases=" + JSON.stringify(bases) + ";var headers=Object.assign({}," + JSON.stringify(pageHeaders) + ');function post(ok,p){try{window.postMessage(Object.assign({source:USR_SRC,type:"orders-fetch",id:id,ok:ok},p||{}),"*");}catch(e){}}function pickAuth(v){if(!v)return"";v=String(v).trim();if(!v)return"";return /^Bearer\\s/i.test(v)?v:"Bearer "+v;}function setHdr(k,v){if(v!=null&&v!=="")headers[String(k).toLowerCase()]=v;}function scanAuth(){if(headers.authorization)return;try{[localStorage,sessionStorage].forEach(function(s){for(var i=0;i<s.length;i++){var k=s.key(i)||"";var v=s.getItem(k)||"";if(!v)continue;if(/authorization|access[_-]?token|^token$|auth|jwt|bearer/i.test(k)){var a=pickAuth(v);if(a){setHdr("authorization",a);return;}}if(/^Bearer\\s+/i.test(v)){setHdr("authorization",v);return;}if(/^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.test(v)){setHdr("authorization","Bearer "+v);return;}try{var o=JSON.parse(v);if(o&&typeof o==="object"){var t=o.token||o.accessToken||o.access_token||o.authorization;var a=pickAuth(t);if(a){setHdr("authorization",a);return;}}}catch(e){}}});}catch(e){}}function valid(text){try{var j=JSON.parse(text||"null");if(!j||typeof j!=="object")return false;var c=j.code;if(c!=null&&String(c)!=="0"&&String(c)!=="200")return false;return !!(j.data&&typeof j.data==="object");}catch(e){return false;}}function tryOne(url,base,cb){var xhr=new XMLHttpRequest();xhr.open("GET",url,true);xhr.timeout=attemptMs;xhr.withCredentials=false;Object.keys(headers).forEach(function(k){if(k==="referer"||k==="origin")return;try{xhr.setRequestHeader(k,headers[k]);}catch(e){}});xhr.onload=function(){cb(null,xhr.status,xhr.responseText||"",base,url);};xhr.onerror=function(){cb(new Error("xhr error"));};xhr.ontimeout=function(){cb(new Error("xhr timeout"));};xhr.send();}scanAuth();if(!headers.accept)headers.accept="application/json, text/plain, */*";var idx=0;function next(){if(idx>=candidateBases.length){post(false,{error:"\u8BA2\u5355\u63A5\u53E3\u4E0D\u53EF\u7528\uFF08\u6295\u6CE8\u53EF\u80FD\u5DF2\u6210\u529F\uFF0C\u4EC5\u4E0A\u4F20\u5931\u8D25\uFF09"});return;}var base=candidateBases[idx++];var url=base+pathQs;tryOne(url,base,function(err,status,text,usedBase,usedUrl){if(!err&&status>=200&&status<300&&valid(text)){post(true,{text:text,url:usedUrl,apiBase:usedBase});}else{next();}});}next();}catch(e){post(false,{error:e&&e.message?e.message:"orders script error"});}})();';
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
        setTimeout(function() {
          finish(new Error("\u8BA2\u5355\u63A5\u53E3\u8D85\u65F6\uFF08\u6295\u6CE8\u53EF\u80FD\u5DF2\u6210\u529F\uFF0C\u4EC5\u4E0A\u4F20\u5931\u8D25\uFF09"));
        }, waitMs);
      });
    }
    async function fetchMatchOrdersReportText(targetMatchId, fetchOpts) {
      const opts = fetchOpts || {};
      const passive = opts.passive !== false;
      const quick = opts.quick === true;
      const forUpload = opts.forUpload === true;
      const softFail = opts.softFail === true;
      const gmOnly = !forUpload && opts.gmOnly !== false;
      const allowPageFetch = forUpload || opts.allowPageFetch === true;
      const confirmMode = gmOnly && !forUpload;
      const gmTimeout = quick ? ORDERS_QUICK_FETCH_MS : gmOnly ? ORDERS_CONFIRM_GM_MS : REPORT_UPLOAD_TIMEOUT;
      const hookWaitMs = opts.hookWaitMs != null ? opts.hookWaitMs : forUpload ? ORDERS_UPLOAD_HOOK_WAIT_MS : quick ? ORDERS_HOOK_QUICK_WAIT_MS : passive ? ORDERS_HOOK_PASSIVE_WAIT_MS : 5e3;
      const mid = String(targetMatchId || matchId || "");
      if (!mid) throw new Error("\u65E0\u8D5B\u4E8BID");
      let cached = getCachedOrdersReportText(mid);
      if (cached) {
        console.log("[hty-inplay] \u4F7F\u7528\u5DF2\u7F13\u5B58\u7684\u8BA2\u5355\u63A5\u53E3\u54CD\u5E94", mid);
        return cached;
      }
      restoreApiState();
      restoreKnownOrdersApiBase();
      if (htyApiState.apiBase && isExcludedApiOrigin(htyApiState.apiBase)) {
        htyApiState.apiBase = "";
      }
      mergeProbeCredentials(await probeCredentialsFromPage());
      if (!quick && !hasPlatformCredentials() && allowPageFetch) {
        await ensureHtyApiCredentials(4e3, null);
      }
      if (forUpload) {
        await proactivePullOrdersReport(mid, "upload-init");
        cached = getCachedOrdersReportText(mid);
        if (cached) {
          console.log("[hty-inplay] \u4E0A\u4F20\uFF1A\u4E3B\u52A8\u62C9\u5355\u547D\u4E2D", mid);
          return cached;
        }
        console.log("[hty-inplay] \u4E0A\u4F20\uFF1A\u7B49\u5F85 hook \u6355\u83B7 orders/sport\u2026", hookWaitMs, "ms");
        cached = await waitForOrdersHookCache(mid, hookWaitMs);
        if (cached) {
          console.log("[hty-inplay] \u4E0A\u4F20\uFF1Ahook \u7F13\u5B58\u547D\u4E2D", mid);
          return cached;
        }
      }
      async function tryFetchOrdersUrl(ordersUrl, tag) {
        if (hasPlatformCredentials() || htyApiState.headers.authorization) {
          try {
            console.log("[hty-inplay] GM GET orders/sport", tag, ordersUrl);
            const text = await gmPlatformGetText(ordersUrl, gmTimeout);
            if (isValidOrdersReportText(text)) {
              cacheOrdersReport(ordersUrl, text);
              return text;
            }
          } catch (e) {
            if (!confirmMode) {
              console.warn("[hty-inplay] GM \u62C9\u5355\u5931\u8D25", tag, e);
            }
          }
        }
        if (allowPageFetch && !gmOnly) {
          try {
            console.log("[hty-inplay] \u9875\u9762 GET orders/sport", tag, ordersUrl);
            const text = await pageContextFetchText(ordersUrl, buildPageContextRequestHeaders());
            if (isValidOrdersReportText(text)) {
              cacheOrdersReport(ordersUrl, text);
              return text;
            }
          } catch (e) {
            console.warn("[hty-inplay] \u9875\u9762\u62C9\u5355\u5931\u8D25", tag, e);
          }
        }
        return null;
      }
      if (htyApiState.apiBase) {
        const directUrl = buildOrdersReportUrl(htyApiState.apiBase, {
          iids: mid,
          daysBack: MATCH_BET_HISTORY_DAYS
        });
        const text = await tryFetchOrdersUrl(directUrl, quick ? "quick-known" : "known-base");
        if (text) return text;
      }
      if (quick && !htyApiState.apiBase) {
        const quickCandidates = discoverApiBaseCandidates();
        for (let qi = 0; qi < quickCandidates.length && qi < 2; qi++) {
          const qBase = quickCandidates[qi];
          const qUrl = buildOrdersReportUrl(qBase, {
            iids: mid,
            daysBack: MATCH_BET_HISTORY_DAYS
          });
          const qText = await tryFetchOrdersUrl(qUrl, "quick-candidate-" + qi);
          if (qText) {
            rememberKnownOrdersApiBase(qBase);
            return qText;
          }
        }
      } else if (!gmOnly && !quick && !forUpload) {
        const apiCandidates2 = discoverApiBaseCandidates();
        console.log("[hty-inplay] API \u5019\u9009", apiCandidates2.length, apiCandidates2);
        if (!apiCandidates2.length) {
          if (confirmMode || softFail) return null;
          throw new Error("\u5C1A\u65E0 API \u5730\u5740\uFF0C\u8BF7\u5728\u672C\u9875\u5B8C\u6210\u4E00\u6B21\u4E0B\u6CE8\u540E\u518D\u4E0A\u4F20");
        }
      }
      if (!forUpload) {
        cached = await waitForOrdersHookCache(mid, hookWaitMs);
        if (cached) {
          console.log("[hty-inplay] hook \u7F13\u5B58\u547D\u4E2D\u8BA2\u5355\u54CD\u5E94", mid);
          return cached;
        }
      }
      if (quick) {
        if (softFail || confirmMode) return null;
        throw new Error("\u5FEB\u901F\u67E5\u5355\u65E0\u7ED3\u679C");
      }
      if (htyApiState.apiBase) {
        const retryUrl = buildOrdersReportUrl(htyApiState.apiBase, {
          iids: mid,
          daysBack: MATCH_BET_HISTORY_DAYS
        });
        const retryText = await tryFetchOrdersUrl(retryUrl, "after-hook-wait");
        if (retryText) return retryText;
      }
      const apiCandidates = discoverApiBaseCandidates();
      const maxCandidates = gmOnly ? 2 : ORDERS_DISCOVER_MAX_BASES;
      console.log("[hty-inplay] API \u5019\u9009", apiCandidates.length, apiCandidates.slice(0, maxCandidates));
      for (let i = 0; i < apiCandidates.length && i < maxCandidates; i++) {
        const base = apiCandidates[i];
        if (htyApiState.apiBase && base === htyApiState.apiBase.replace(/\/$/, "")) continue;
        const url = buildOrdersReportUrl(base, {
          iids: mid,
          daysBack: MATCH_BET_HISTORY_DAYS
        });
        const candText = await tryFetchOrdersUrl(url, "candidate-" + i);
        if (candText) {
          rememberKnownOrdersApiBase(base);
          return candText;
        }
      }
      if (allowPageFetch && apiCandidates.length) {
        try {
          console.log("[hty-inplay] \u6279\u91CF\u9875\u9762\u62C9\u5355 orders/sport\u2026");
          const batch = await pageContextFetchMatchOrdersReport(
            mid,
            MATCH_BET_HISTORY_DAYS,
            apiCandidates.slice(0, ORDERS_DISCOVER_MAX_BASES)
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
          console.warn("[hty-inplay] \u6279\u91CF\u9875\u9762\u62C9\u5355\u5931\u8D25", e);
        }
      }
      if (forUpload) {
        cached = await waitForOrdersHookCache(mid, 5e3);
        if (cached) {
          console.log("[hty-inplay] \u4E0A\u4F20\uFF1A\u5EF6\u8FDF hook \u7F13\u5B58\u547D\u4E2D", mid);
          return cached;
        }
      }
      if (softFail || confirmMode) return null;
      throw new Error("\u8BA2\u5355\u63A5\u53E3\u4E0D\u53EF\u7528\uFF08\u6295\u6CE8\u53EF\u80FD\u5DF2\u6210\u529F\uFF0C\u8BF7\u5237\u65B0\u6216\u7A0D\u540E\u91CD\u8BD5\uFF09");
    }
    function normalizeBetRecordsJsonString(raw) {
      if (raw == null) return "";
      if (typeof raw === "object") return JSON.stringify(raw);
      return String(raw).trim();
    }
    function uploadBetRecordsOnly(betJson) {
      const normalized = normalizeBetRecordsJsonString(betJson);
      if (!normalized || normalized.length < 20) {
        return Promise.reject(new Error("\u6295\u6CE8\u8BB0\u5F55\u4E3A\u7A7A"));
      }
      if (!isValidOrdersReportText(normalized)) {
        return Promise.reject(new Error("\u6295\u6CE8\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548"));
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
          hookWaitMs: afterBetSuccess ? Math.min(ORDERS_UPLOAD_HOOK_WAIT_MS + i * 4e3, 32e3) : fetchOpts && fetchOpts.hookWaitMs != null ? fetchOpts.hookWaitMs : ORDERS_UPLOAD_HOOK_WAIT_MS
        });
        if (afterBetSuccess && i > 0) {
          await proactivePullOrdersReport(mid, "upload-retry-" + (i + 1));
        }
        try {
          lastText = await fetchMatchOrdersReportText(mid, attemptOpts);
        } catch (e) {
          lastText = null;
          if (i >= attempts - 1) throw e;
          console.warn(
            "[hty-inplay] \u4E0A\u4F20\u62C9\u5355\u7B2C" + (i + 1) + "\u6B21\u5931\u8D25\uFF0C\u91CD\u8BD5\u2026",
            e && e.message ? e.message : e
          );
        }
        const count = countOrdersInReportText(lastText);
        if (count > 0) return { text: lastText, count };
        if (i < attempts - 1) {
          const gap = afterBetSuccess ? ORDERS_UPLOAD_RETRY_GAP_MS + i * 800 : 2e3;
          console.log("[hty-inplay] \u4E0A\u4F20\uFF1A\u8BA2\u5355\u5C1A\u672A\u5165\u5E93\uFF0C" + (i + 2) + "/" + attempts + " \u6B21\u91CD\u8BD5\u2026");
          await humanDelay(gap, gap + 1200);
        }
      }
      return { text: lastText, count: countOrdersInReportText(lastText) };
    }
    async function uploadMatchBetHistory(targetMatchId, extraBetPayload, uploadOpts) {
      const opts = uploadOpts || {};
      const mid = String(targetMatchId || matchId || "");
      if (!mid) throw new Error("\u65E0\u8D5B\u4E8BID");
      const fetchOpts = {
        passive: opts.passive !== false,
        forUpload: opts.forUpload === true,
        gmOnly: opts.gmOnly === true,
        allowPageFetch: opts.allowPageFetch !== false,
        hookWaitMs: opts.hookWaitMs
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
          console.warn("[hty-inplay] \u62C9\u5355\u6682\u4E0D\u53EF\u7528\uFF0C\u5148\u4E0A\u4F20 strategy \u8BB0\u5F55\uFF0C\u7A0D\u540E\u81EA\u52A8\u8865\u4F20\u8BA2\u5355", fetchErr);
          await uploadReportData(REPORT_UPLOAD.strategy, { strategy_bet_json: stratJson });
          scheduleDelayedOrdersUploadRetry(mid, extraBetPayload);
          return { orderCount: 0, bytes: 0, matchId: mid, partial: true };
        }
        throw fetchErr;
      }
      console.log(
        "[hty-inplay] \u672C\u573A\u6295\u6CE8\u8BB0\u5F55",
        orderCount,
        "\u6761",
        betJson ? betJson.length : 0,
        "\u5B57\u7B26"
      );
      const apiBase = htyApiState.apiBase || "";
      if (apiBase) {
        try {
          await uploadReportData(REPORT_UPLOAD.site, {
            site_url: apiBase,
            app_url: window.location.origin
          });
        } catch (e) {
          console.warn("[hty-inplay] \u4E0A\u4F20\u7AD9\u70B9URL\u5931\u8D25", e);
        }
      }
      if (!betJson || orderCount === 0) {
        const stratJson = extraBetPayload && extraBetPayload.strategy_bet_json;
        if (opts.allowPartial !== false && stratJson) {
          console.warn("[hty-inplay] \u8BA2\u5355\u5217\u8868\u4E3A\u7A7A\uFF0C\u5148\u4E0A\u4F20 strategy \u8BB0\u5F55\uFF0C\u7A0D\u540E\u81EA\u52A8\u8865\u4F20\u8BA2\u5355");
          await uploadReportData(REPORT_UPLOAD.strategy, { strategy_bet_json: stratJson });
          scheduleDelayedOrdersUploadRetry(mid, extraBetPayload);
          return { orderCount: 0, bytes: 0, matchId: mid, partial: true };
        }
        throw new Error("\u6295\u6CE8\u8BB0\u5F55\u4E3A\u7A7A\uFF08\u8BA2\u5355\u5C1A\u672A\u5165\u5E93\uFF09");
      }
      await uploadBetRecordsOnly(betJson);
      if (opts.uploadWallet && apiBase && htyApiState.headers.authorization) {
        try {
          const walletUrl = apiBase.replace(/\/$/, "") + "/platform/payment/wallets/list";
          const walletJson = await platformGetText(walletUrl);
          if (walletJson) {
            await uploadReportData(REPORT_UPLOAD.wallet, { wallet_records_json: walletJson });
          }
        } catch (e) {
          console.warn("[hty-inplay] \u4E0A\u4F20\u94B1\u5305\u4F59\u989D\u5931\u8D25", e);
        }
      }
      return { orderCount, bytes: betJson.length, matchId: mid };
    }
    function scheduleDelayedOrdersUploadRetry(targetMatchId, extraBetPayload) {
      if (delayedOrdersUploadTimer) {
        clearTimeout(delayedOrdersUploadTimer);
        delayedOrdersUploadTimer = null;
      }
      const mid = String(targetMatchId || matchId || "");
      if (!mid) return;
      delayedOrdersUploadTimer = setTimeout(function() {
        delayedOrdersUploadTimer = null;
        if (!matchId || String(matchId) !== mid) return;
        if (reportSyncing || matchHistoryUploading || placing) return;
        console.log("[hty-inplay] \u5EF6\u8FDF\u8865\u4F20\u8BA2\u5355", mid);
        uploadMatchBetHistory(mid, extraBetPayload, {
          passive: true,
          forUpload: true,
          allowPageFetch: true,
          allowPartial: false,
          afterBetSuccess: true
        }).then(function(result) {
          console.log("[hty-inplay] \u5EF6\u8FDF\u8865\u4F20\u8BA2\u5355\u5B8C\u6210", result);
          if (result && result.orderCount > 0) {
            setBetStep("\u6295\u6CE8\u8BB0\u5F55\u5DF2\u8865\u4F20\uFF08" + result.orderCount + "\u6761\uFF09");
            renderPanel(true);
          }
        }).catch(function(e) {
          console.warn("[hty-inplay] \u5EF6\u8FDF\u8865\u4F20\u8BA2\u5355\u4ECD\u5931\u8D25", e);
        });
      }, ORDERS_UPLOAD_DELAYED_RETRY_MS);
    }
    async function triggerAutoUploadMatchHistory(reason, opts) {
      const options = opts || {};
      if (!matchId || reportSyncing || matchHistoryUploading) return null;
      const now = Date.now();
      if (!options.force && now - lastAutoUploadMatchAt < AUTO_UPLOAD_AFTER_DEDUP_GAP_MS) {
        console.log("[hty-inplay] \u8DF3\u8FC7\u91CD\u590D\u4E0A\u4F20\uFF08\u8282\u6D41\uFF09", reason);
        return null;
      }
      if (!isLoggedIn()) return null;
      reportSyncing = true;
      try {
        console.log("[hty-inplay] \u81EA\u52A8\u4E0A\u4F20\u672C\u573A\u6295\u6CE8\u8BB0\u5F55", reason, matchId);
        if (options.updateStep !== false) {
          setBetStep("\u540C\u6B65\u6295\u6CE8\u8BB0\u5F55\u2026");
          renderPanel(true);
        }
        const extra = {};
        const stratRec = options.strategyBetRecord || lastStrategyBetRecord;
        if (stratRec && stratRec.orderno) {
          extra.strategy_bet_json = JSON.stringify(stratRec);
        }
        const result = await uploadMatchBetHistory(matchId, extra, {
          passive: true,
          uploadWallet: reason === "bet-success",
          forUpload: true,
          allowPageFetch: true,
          allowPartial: true,
          afterBetSuccess: reason === "bet-success"
        });
        lastAutoUploadMatchAt = Date.now();
        if (result && result.partial) {
          console.log("[hty-inplay] \u81EA\u52A8\u4E0A\u4F20\uFF08\u4EC5 strategy \u8BB0\u5F55\uFF09", reason, result);
        } else {
          console.log("[hty-inplay] \u81EA\u52A8\u4E0A\u4F20\u5B8C\u6210", reason, result);
        }
        if (options.updateStep !== false) {
          setBetStep("\u6295\u6CE8\u8BB0\u5F55\u5DF2\u540C\u6B65\uFF08\u672C\u573A" + result.orderCount + "\u6761\uFF09");
          renderPanel(true);
        }
        return result;
      } catch (e) {
        console.warn("[hty-inplay] \u81EA\u52A8\u4E0A\u4F20\u5931\u8D25", reason, e);
        if (options.updateStep !== false) {
          setBetStep("\u6295\u6CE8\u8BB0\u5F55\u540C\u6B65\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
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
        htyApiState.apiBase = "";
      }
      if (!htyApiState.apiBase && !htyApiState.headers.authorization) return;
      try {
        sessionStorage.setItem(HTY_API_CACHE_KEY, JSON.stringify({
          apiBase: htyApiState.apiBase || "",
          headers: Object.assign({}, htyApiState.headers),
          at: htyApiState.lastCaptureAt || Date.now()
        }));
      } catch (e) {
      }
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
      } catch (e) {
      }
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
      return new Promise(function(resolve) {
        const probeId = "cred_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        let settled = false;
        function finish(payload) {
          if (settled) return;
          settled = true;
          window.removeEventListener("message", onMsg);
          resolve(payload || null);
        }
        function onMsg(e) {
          if (e.source !== window || !e.data || e.data.source !== PAGE_USR_SRC) return;
          if (e.data.type !== "cred-probe" || e.data.id !== probeId) return;
          finish(e.data.payload || null);
        }
        window.addEventListener("message", onMsg);
        const script = document.createElement("script");
        script.textContent = "(function(){var id=" + JSON.stringify(probeId) + ";var USR_SRC=" + JSON.stringify(PAGE_USR_SRC) + `;var out={apiBase:"",headers:{}};function pickAuth(v){if(!v)return"";v=String(v).trim();if(!v)return"";return /^Bearer\\s/i.test(v)?v:"Bearer "+v;}try{function hostOf(u){try{return new URL(u).hostname.toLowerCase()}catch(e){return""}}function isCdnHost(h){return/-fluid(?:[.-]|$)/.test(h)||/(?:^|[.-])fe-source(?:[.-]|$)/.test(h)||/(?:^|[.-])(?:static|cdn|assets)(?:[.-]|$)/.test(h)||/shbxs\\d+\\./.test(h)||/^i18n[-.]/.test(h)}function isApiHost(h){if(!h||isCdnHost(h))return false;return/-api-ddos(?:[.-]|$)/.test(h)||/-api[-.]/.test(h)}function isProvenApiUrl(u){return/\\/product\\/game\\/bet|\\/thirdparty-report\\/user\\/orders\\/sport|\\/platform\\/payment\\/wallets|\\/product\\/cashout\\//i.test(u||"")}function pickApiBase(origin){try{var h=hostOf(origin);if(isApiHost(h))return String(origin).replace(/\\/$/,"")}catch(e){}return""}var entries=performance.getEntriesByType("resource");for(var i=entries.length-1;i>=0;i--){var u=entries[i].name||"";if(isProvenApiUrl(u)&&isApiHost(hostOf(u))){var b=pickApiBase(new URL(u).origin);if(b){out.apiBase=b;break;}}}if(!out.apiBase){for(var j=entries.length-1;j>=0;j--){var u2=entries[j].name||"";if(isApiHost(hostOf(u2))){var b2=pickApiBase(new URL(u2).origin);if(b2){out.apiBase=b2;break;}}}}}catch(e2){}function scanStore(store){if(!store)return;for(var i=0;i<store.length;i++){var k=store.key(i)||""; var v=store.getItem(k)||"";if(!out.headers.authorization){if(/authorization|access[_-]?token|^token$/i.test(k)){var a=pickAuth(v);if(a)out.headers.authorization=a;}else if(/^Bearer\\s/i.test(v)){out.headers.authorization=v;}}if(!out.apiBase && /api.*(url|host|base)|platform.*url|gateway/i.test(k) && /^https?:\\/\\//i.test(v)){try{out.apiBase=new URL(v).origin;}catch(e3){}}if(!out.apiBase && /https?:\\/\\/[^\\s"']+\\/platform\\//i.test(v)){var m=v.match(/(https?:\\/\\/[^\\s"']+?)\\/platform\\//i);if(m){var b3=pickApiBase(m[1]);if(b3)out.apiBase=b3;}}}}try{scanStore(localStorage);scanStore(sessionStorage);}catch(e4){}try{window.postMessage({source:USR_SRC,type:"cred-probe",id:id,payload:out},"*");}catch(e5){}})();`;
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
        setTimeout(function() {
          finish(null);
        }, 3500);
      });
    }
    function tryTriggerPlatformApiActivity() {
      const nodes = document.querySelectorAll('button, [role="button"], a');
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!isElementVisible(el)) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ");
        if (/USDT|余额|钱包|Wallet/i.test(text)) {
          safeClick(el);
          return true;
        }
      }
      return false;
    }
    function pageContextFetchText(url, headers) {
      const hdrs = headers || buildPageContextRequestHeaders();
      return new Promise(function(resolve, reject) {
        const fetchId = "fetch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        let settled = false;
        function finish(err, text) {
          if (settled) return;
          settled = true;
          window.removeEventListener("message", onMsg);
          if (err) reject(err);
          else resolve(text);
        }
        function onMsg(e) {
          if (e.source !== window || !e.data || e.data.source !== PAGE_USR_SRC) return;
          if (e.data.type !== "platform-fetch" || e.data.id !== fetchId) return;
          if (e.data.ok) finish(null, e.data.text || "");
          else finish(new Error(e.data.error || "HTTP " + (e.data.status || "")));
        }
        window.addEventListener("message", onMsg);
        const script = document.createElement("script");
        script.textContent = "(function(){var id=" + JSON.stringify(fetchId) + ";var USR_SRC=" + JSON.stringify(PAGE_USR_SRC) + ";var url=" + JSON.stringify(url) + ";var headers=Object.assign({}," + JSON.stringify(hdrs) + ');function pickAuth(v){if(!v)return"";v=String(v).trim();if(!v)return"";return /^Bearer\\s/i.test(v)?v:"Bearer "+v;}function setHdr(k,v){if(v!=null&&v!=="")headers[String(k).toLowerCase()]=v;}function scanAuth(){if(headers.authorization)return;try{[localStorage,sessionStorage].forEach(function(store){for(var i=0;i<store.length;i++){var k=store.key(i)||"";var v=store.getItem(k)||"";if(!v)continue;if(/authorization|access[_-]?token|^token$|auth|jwt|bearer/i.test(k)){var a=pickAuth(v);if(a){setHdr("authorization",a);return;}}if(/^Bearer\\s+/i.test(v)){setHdr("authorization",v);return;}if(/^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.test(v)){setHdr("authorization","Bearer "+v);return;}try{var o=JSON.parse(v);if(o&&typeof o==="object"){var t=o.token||o.accessToken||o.access_token||o.authorization||o.Authorization;var a=pickAuth(t);if(a){setHdr("authorization",a);return;}}}catch(e){}}});}catch(e){}}scanAuth();if(!headers.accept)headers.accept="application/json, text/plain, */*";var xhr=new XMLHttpRequest();xhr.open("GET",url,true);xhr.timeout=' + ORDERS_FETCH_ATTEMPT_MS + ';xhr.withCredentials=false;Object.keys(headers).forEach(function(k){if(k==="referer"||k==="origin")return;try{xhr.setRequestHeader(k,headers[k]);}catch(e){}});xhr.onload=function(){window.postMessage({source:USR_SRC,type:"platform-fetch",id:id,ok:xhr.status>=200&&xhr.status<300,status:xhr.status,text:xhr.responseText||""},"*");};xhr.onerror=function(){window.postMessage({source:USR_SRC,type:"platform-fetch",id:id,ok:false,error:"xhr error"},"*");};xhr.ontimeout=function(){window.postMessage({source:USR_SRC,type:"platform-fetch",id:id,ok:false,error:"xhr timeout"},"*");};xhr.send();})();';
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
        setTimeout(function() {
          finish(new Error("\u9875\u9762fetch\u8D85\u65F6"));
        }, REPORT_UPLOAD_TIMEOUT);
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
        setBetStep(progressStep + "\uFF1A\u89E6\u53D1\u5E73\u53F0\u63A5\u53E3\u2026");
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
          console.warn("[hty-inplay] GM\u5E73\u53F0\u8BF7\u6C42\u5931\u8D25\uFF0C\u56DE\u9000\u9875\u9762fetch", url, e);
        }
      }
      try {
        const text = await pageContextFetchText(url, buildPageContextRequestHeaders());
        if (text) return text;
      } catch (e) {
        console.warn("[hty-inplay] \u9875\u9762fetch\u5931\u8D25", url, e);
      }
      throw new Error("\u5E73\u53F0\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25");
    }
    function gmPlatformGetText(url, timeoutMs) {
      const timeout = timeoutMs != null ? timeoutMs : REPORT_UPLOAD_TIMEOUT;
      return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: buildPlatformRequestHeaders(),
          timeout,
          onload: function(res) {
            if (res.status >= 200 && res.status < 300) resolve(res.responseText);
            else reject(new Error("GET " + res.status));
          },
          onerror: function() {
            reject(new Error("\u7F51\u7EDC\u9519\u8BEF"));
          },
          ontimeout: function() {
            reject(new Error("\u8BF7\u6C42\u8D85\u65F6"));
          }
        });
      });
    }
    function uploadReportData(url, data) {
      return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          data: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
          timeout: REPORT_UPLOAD_TIMEOUT,
          onload: function(res) {
            if (res.status >= 200 && res.status < 300) resolve(res.responseText);
            else {
              const body = (res.responseText || "").trim();
              const hint = body ? body.slice(0, 160) : "";
              reject(new Error("\u4E0A\u4F20\u5931\u8D25 " + res.status + (hint ? "\uFF1A" + hint : "")));
            }
          },
          onerror: function() {
            reject(new Error("\u4E0A\u4F20\u7F51\u7EDC\u9519\u8BEF"));
          },
          ontimeout: function() {
            reject(new Error("\u4E0A\u4F20\u8D85\u65F6"));
          }
        });
      });
    }
    async function waitForHtyApiCredentials(maxMs) {
      return ensureHtyApiCredentials(maxMs);
    }
    function parseBetSubmitResponse(json) {
      if (!json || typeof json !== "object") {
        return { ok: false, error: "\u4E0B\u6CE8\u54CD\u5E94\u4E3A\u7A7A" };
      }
      const submitted = json.data && json.data.submitted;
      const failed = json.data && json.data.failed;
      const failedSingles = failed && Array.isArray(failed.singles) ? failed.singles : [];
      if (failedSingles.length) {
        return { ok: false, error: "\u4E0B\u6CE8\u88AB\u62D2\u7EDD", failedSingles };
      }
      const singles = submitted && Array.isArray(submitted.singles) ? submitted.singles : [];
      const orderno = singles.length ? String(singles[0].orderno || singles[0].orderId || singles[0].orderNo || "") : "";
      if (orderno) {
        return {
          ok: true,
          orderno,
          delay: singles[0].delay,
          singles,
          response: json
        };
      }
      const code = Number(json.code);
      if (code !== 0 && code !== 200 && String(json.code) !== "200" && json.success !== true) {
        return { ok: false, error: json.msg || "\u4E0B\u6CE8\u5931\u8D25 code=" + json.code };
      }
      return { ok: false, error: "\u54CD\u5E94\u65E0 orderno" };
    }
    function parseBetRequestBody(body) {
      if (!body) return null;
      if (typeof body === "object") return body;
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
      const betPlateOnK = option.bttsSubstitute ? "" : strategy.plateOnK != null ? String(strategy.plateOnK) : ticket && ticket.k || "";
      const record = {
        orderno: betApi.orderno,
        delay: betApi.delay,
        matchId: String(matchId || strategy.matchId || ticket && ticket.iid || ""),
        recHash: strategy.recHash || "",
        market: betMarket || ticket && ticket.market || option.market || "",
        plateOn: betPlateOn || ticket && ticket.beton || option.side || "",
        plateOnK: betPlateOnK,
        plateOddsHit: strategy.plateOddsHit,
        plateAmount: strategy.plateAmount,
        plateAmountRate: strategy.plateAmountRate,
        betOdds: option.odds != null ? Number(option.odds) : ticket && ticket.odds,
        betStake: single && single.ante != null ? Number(single.ante) : resolveBetStakeValue(option),
        oddsKey: ticket && ticket.oddsKey || option.testid || "",
        displayLine: option.displayLine || "",
        label: option.label || formatStrategyShort(strategy),
        siteUrl: window.location.origin,
        pageUrl: window.location.href,
        apiBase: htyApiState.apiBase || "",
        submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
        betRequest: req,
        betResponse: betApi.response
      };
      if (option.bttsSubstitute && option.substitutedFrom) {
        record.triggerMarket = option.substitutedFrom.market || strategy.market || "";
        record.triggerPlateOn = option.substitutedFrom.plateOn || strategy.plateOn || "";
        record.triggerPlateOnK = option.substitutedFrom.plateOnK != null ? String(option.substitutedFrom.plateOnK) : "";
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
      const p = new Promise(function(resolve, reject) {
        const timer = setTimeout(function() {
          if (!betResultWaiter || betResultWaiter.reject !== reject) return;
          clearBetResultWaiter();
          reject(new Error("\u4E0B\u6CE8\u63A5\u53E3\u54CD\u5E94\u8D85\u65F6"));
        }, BET_API_WAIT_MS);
        betResultWaiter = { resolve, reject, timer };
      });
      p.catch(function() {
      });
      return p;
    }
    function createBetWaitHandle() {
      const handle = {
        promise: null,
        generation: 0
      };
      handle.rearm = function() {
        handle.generation += 1;
        handle.promise = armBetResultWaiter();
        return handle.promise;
      };
      handle.clear = function() {
        clearBetResultWaiter();
        handle.generation += 1;
        handle.promise = null;
      };
      handle.rearm();
      return handle;
    }
    function handleBetResultMessage(data) {
      if (!data) return;
      const url = data.url || "";
      const base = extractPlatformApiBase(url);
      if (base) {
        rememberKnownOrdersApiBase(base);
      }
      const parsed = parseBetSubmitResponse(data.response);
      if (parsed.ok) {
        lastCapturedBetSuccess = {
          payload: {
            orderno: parsed.orderno,
            delay: parsed.delay,
            singles: parsed.singles,
            response: parsed.response,
            requestBody: data.requestBody
          },
          at: Date.now()
        };
        persistApiState();
      }
      if (!betResultWaiter) {
        if (parsed.ok) {
          console.log("[hty-inplay] \u6355\u83B7\u4E0B\u6CE8\u54CD\u5E94(\u65E0\u7B49\u5F85\u8005)", parsed.orderno);
        } else {
          console.warn("[hty-inplay] \u6355\u83B7\u4E0B\u6CE8\u54CD\u5E94(\u65E0\u7B49\u5F85\u8005) \u89E3\u6790\u5931\u8D25", parsed.error, data.response);
        }
        return;
      }
      const waiter = betResultWaiter;
      clearBetResultWaiter();
      if (parsed.ok) {
        console.log("[hty-inplay] \u6355\u83B7\u4E0B\u6CE8\u54CD\u5E94", parsed.orderno);
        waiter.resolve({
          orderno: parsed.orderno,
          delay: parsed.delay,
          singles: parsed.singles,
          response: parsed.response,
          requestBody: data.requestBody
        });
      } else {
        console.warn("[hty-inplay] \u4E0B\u6CE8\u54CD\u5E94\u89E3\u6790\u5931\u8D25", parsed.error, data.response);
        waiter.reject(new Error(parsed.error || "\u4E0B\u6CE8\u5931\u8D25"));
      }
    }
    async function uploadStrategyBetRecord(record) {
      if (!record || !record.orderno) return false;
      try {
        await uploadReportData(REPORT_UPLOAD.strategy, { strategy_bet_json: JSON.stringify(record) });
        console.log("[hty-inplay] \u7B56\u7565\u6295\u6CE8\u5355\u5DF2\u4E0A\u4F20", record.orderno, record.recHash);
        return true;
      } catch (e) {
        console.warn("[hty-inplay] \u7B56\u7565\u6295\u6CE8\u5355\u4E0A\u4F20\u5931\u8D25", e);
        return false;
      }
    }
    function initPlatformApiBridge() {
      window.addEventListener("message", function(e) {
        if (e.source !== window || !e.data || e.data.source !== PAGE_HOOK_SRC) return;
        if (e.data.type === "capture") {
          if (e.data.apiBase) rememberKnownOrdersApiBase(e.data.apiBase);
          mergePlatformHeaders(e.data.headers || {});
          htyApiState.lastCaptureAt = e.data.ts || Date.now();
          persistApiState();
        }
        if (e.data.type === "orders-report") {
          if (isValidOrdersReportText(e.data.text)) {
            cacheOrdersReport(e.data.url, e.data.text);
            if (e.data.apiBase) rememberKnownOrdersApiBase(e.data.apiBase);
            mergePlatformHeaders(e.data.headers || {});
            htyApiState.lastCaptureAt = e.data.ts || Date.now();
            persistApiState();
            console.log(
              "[hty-inplay] hook \u6355\u83B7\u8BA2\u5355\u63A5\u53E3\u54CD\u5E94",
              parseOrdersReportMatchId(e.data.url),
              (e.data.text || "").length,
              "\u5B57\u7B26"
            );
          }
        }
        if (e.data.type === "bet-result") {
          handleBetResultMessage(e.data);
        }
        if (e.data.type === "inplay-match-gone") {
          handleInplayMatchNotFound(e.data.matchId, e.data.msg || "api_not_found");
        }
      });
    }
    function injectPlatformApiHook() {
      const root = document.documentElement;
      if (!root || root.dataset.htyInplayApiHook === "1") return;
      root.dataset.htyInplayApiHook = "1";
      const script = document.createElement("script");
      script.textContent = "(function(){if(window.__htyInplayApiHook)return;window.__htyInplayApiHook=true;var HOOK_SRC=" + JSON.stringify(PAGE_HOOK_SRC) + ";var USR_SRC=" + JSON.stringify(PAGE_USR_SRC) + ';function absUrl(url){var t=String(url||"").trim();if(!t)return"";if(/^https?:\\/\\//i.test(t))return t;try{return new URL(t,location.origin).href}catch(e){return t}}function apiBase(url){var t=String(url||"").trim();if(!t)return"";try{return new URL(t).origin}catch(e){var m=t.match(/^(https?:\\/\\/[^/?#]+)/i);return m?m[1]:""}}function isPlatformUrl(url){return /\\/product\\/game\\/bet/i.test(url)||/\\/thirdparty-report\\//i.test(url)||/\\/platform\\/payment\\//i.test(url)||/\\/product\\/cashout\\//i.test(url)}function postBetResult(url,body,resp){try{window.postMessage({source:HOOK_SRC,type:"bet-result",url:url||"",requestBody:body,response:resp||null,ts:Date.now()},"*")}catch(e){}}function hdrObj(h){var o={};if(!h)return o;if(typeof Headers!=="undefined"&&h instanceof Headers){h.forEach(function(v,k){o[String(k).toLowerCase()]=v});return o}if(Array.isArray(h)){h.forEach(function(p){if(p&&p.length>=2)o[String(p[0]).toLowerCase()]=p[1]});return o}if(typeof h==="object"){Object.keys(h).forEach(function(k){o[String(k).toLowerCase()]=h[k]});return o}return o}function postCapture(base,headers){try{window.postMessage({source:HOOK_SRC,type:"capture",apiBase:base||"",headers:headers||{},ts:Date.now()},"*")}catch(e){}}function onBetResponse(url,body,text){if(!/\\/product\\/game\\/bet/i.test(url||""))return;try{postBetResult(url,body,JSON.parse(text||"{}"))}catch(e){postBetResult(url,body,{code:-1,msg:"parse error"})}}function isOrdersReportUrl(url){return /thirdparty-report\\/user\\/orders\\/sport/i.test(url||"")}function postOrdersReport(url,headers,text){try{window.postMessage({source:HOOK_SRC,type:"orders-report",url:url||"",text:text||"",apiBase:apiBase(url),headers:hdrObj(headers||{}),ts:Date.now()},"*")}catch(e){}}function isInplayMatchUrl(url){return /\\/product\\/business\\/sport\\/inplay\\/match/i.test(url||"")}function parseInplayMatchId(url){try{var u=new URL(url,location.origin);return u.searchParams.get("iid")||u.searchParams.get("matchId")||""}catch(e){return ""}}function postInplayMatchStatus(url,text){try{var data=JSON.parse(text||"{}");var code=String(data.code||"");var msg=String(data.msg||"");if(code==="40001"||/MATCH\\s*NOT\\s*FOUND/i.test(msg)){window.postMessage({source:HOOK_SRC,type:"inplay-match-gone",url:url||"",matchId:parseInplayMatchId(url),code:code,msg:msg,ts:Date.now()},"*")}}catch(e){}}function onPlatformRequest(url,headers){if(!isPlatformUrl(url))return;var base=apiBase(url);var h=hdrObj(headers);if(base)postCapture(base,h)}var oOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,url){this._htyMethod=String(m||"").toUpperCase();this._htyUrl=absUrl(url);this._htyHdr={};this._htyBody=null;return oOpen.apply(this,arguments)};var oSet=XMLHttpRequest.prototype.setRequestHeader;XMLHttpRequest.prototype.setRequestHeader=function(n,v){if(!this._htyHdr)this._htyHdr={};this._htyHdr[String(n).toLowerCase()]=v;return oSet.apply(this,arguments)};var oSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(body){this._htyBody=body;try{onPlatformRequest(this._htyUrl||"",this._htyHdr||{})}catch(e){}var xhr=this;var url=xhr._htyUrl||"";var reqBody=body;var hdr=xhr._htyHdr||{};if(/\\/product\\/game\\/bet/i.test(url)){xhr.addEventListener("load",function(){try{onBetResponse(url,reqBody,xhr.responseText||"")}catch(e){}})}if(isInplayMatchUrl(url)){xhr.addEventListener("load",function(){try{postInplayMatchStatus(url,xhr.responseText||"")}catch(e){}})}if(isOrdersReportUrl(url)){xhr.addEventListener("load",function(){try{postOrdersReport(url,hdr,xhr.responseText||"")}catch(e){}})}return oSend.apply(this,arguments)};var oFetch=window.fetch;if(typeof oFetch==="function"){window.fetch=function(input,init){var url="";try{url=absUrl(typeof input==="string"?input:(input&&input.url)||"")}catch(e){}try{onPlatformRequest(url,hdrObj(init&&init.headers))}catch(e){}var ret=oFetch.apply(this,arguments);if(/\\/product\\/game\\/bet/i.test(url)){return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){onBetResponse(url,init&&init.body,t)}).catch(function(){})}catch(e){}return res;});}if(isInplayMatchUrl(url)){return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){postInplayMatchStatus(url,t)}).catch(function(){})}catch(e){}return res;});}if(isOrdersReportUrl(url)){return ret.then(function(res){try{var c=res.clone();c.text().then(function(t){postOrdersReport(url,hdrObj(init&&init.headers),t)}).catch(function(){})}catch(e){}return res;});}return ret;}}})();';
      (root || document.head || document.body).appendChild(script);
      script.remove();
    }
    async function syncReportAfterBetSuccess() {
      if (reportSyncing) return;
      try {
        console.log("[hty-inplay] \u540E\u53F0\u540C\u6B65\u6295\u6CE8\u8BB0\u5F55\u2026");
        await humanDelay(REPORT_SYNC_DELAY_MS, REPORT_SYNC_DELAY_MS + 800);
        await triggerAutoUploadMatchHistory("bet-success", {
          force: true,
          updateStep: false
        });
      } catch (e) {
        console.warn("[hty-inplay] \u6295\u6CE8\u8BB0\u5F55\u540E\u53F0\u540C\u6B65\u5931\u8D25", e);
      }
    }
    async function manualUploadMatchBetHistory() {
      if (matchHistoryUploading || reportSyncing || placing) return;
      if (!matchId) {
        setBetStep("\u4E0A\u4F20\u5931\u8D25\uFF1A\u5F53\u524D\u9875\u65E0\u8D5B\u4E8BID");
        renderPanel(true);
        return;
      }
      if (!isLoggedIn()) {
        setBetStep("\u4E0A\u4F20\u672C\u573A\u8BB0\u5F55\uFF1A\u7B49\u5F85\u767B\u5F55\u2026");
        renderPanel(true);
        tryAutoRelogin().catch(function(e) {
          console.warn("[hty-inplay] \u4E0A\u4F20\u8BB0\u5F55\u524D\u81EA\u52A8\u767B\u5F55", e);
        });
        return;
      }
      matchHistoryUploading = true;
      setBetStep("\u4E0A\u4F20\u672C\u573A\u6295\u6CE8\u8BB0\u5F55\uFF1A\u62C9\u53D6 orders/sport\u2026");
      renderPanel(true);
      try {
        const result = await uploadMatchBetHistory(matchId, null, {
          passive: true,
          uploadWallet: false,
          forUpload: true,
          allowPageFetch: true,
          allowPartial: false
        });
        setBetResult("pending", "\u672C\u573A\u6295\u6CE8\u8BB0\u5F55\u5DF2\u4E0A\u4F20 " + result.orderCount + " \u6761");
        setBetStep("\u4E0A\u4F20\u5B8C\u6210 \xB7 \u8D5B\u4E8B#" + result.matchId + " \xB7 " + result.orderCount + "\u6761");
        renderPanel(true);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        setBetStep("\u4E0A\u4F20\u672C\u573A\u8BB0\u5F55\u5931\u8D25\uFF1A" + msg);
        renderPanel(true);
        console.error("[hty-inplay] \u624B\u52A8\u4E0A\u4F20\u672C\u573A\u8BB0\u5F55\u5931\u8D25", e);
      } finally {
        matchHistoryUploading = false;
      }
    }
    async function continueAfterBetSuccess(option, extraMsg, fromAutoBet, betRecord) {
      const orderHint = betRecord && betRecord.orderno ? " \u5355\u53F7" + betRecord.orderno : "";
      const stakeText = betRecord && betRecord.betStake != null ? String(betRecord.betStake) : formatBetStakeSummary(option);
      const label = option.label + " " + stakeText + " \u5DF2\u63D0\u4EA4" + orderHint;
      setBetResult("success", extraMsg ? label + "\uFF08" + extraMsg + "\uFF09" : label);
      syncReportAfterBetSuccess().catch(function(e) {
        console.error("[hty-inplay] report sync", e);
      });
      renderPanel(true);
      lastMatchScanAt = 0;
      await loadStrategies(true);
      await refreshTargetOption(true);
      renderPanel(true);
      syncTargetOptionFromStates();
      if (shouldAutoBet()) {
        setBetStep("\u4E0A\u4E00\u6761\u7B56\u7565\u5DF2\u5B8C\u6210\uFF0C\u51C6\u5907\u4E0B\u4E00\u6761");
        await humanDelay(1500, 3e3);
        maybeTriggerAutoBet(false);
        return;
      }
      betResult = "pending";
      setBetStep("\u7B49\u5F85\u5176\u4F59\u7B56\u7565\u76D8\u53E3\u4E0E\u8D54\u7387\u8FBE\u6807");
      schedulePoll();
    }
    async function placeTestBet(option, fromAutoBet) {
      if (!option || placing) return false;
      if (!option.strategy || !passesStrategyStatusGate(option.strategy)) return false;
      const recHash = option.strategy.recHash;
      if (isScriptDedupStored(option, recHash)) {
        const local = recHash ? getLocalExecutedStrategy(recHash) : null;
        console.warn("[hty-inplay] \u811A\u672C\u9632\u91CD\uFF1A\u8DF3\u8FC7\u91CD\u590D\u4E0B\u5355", recHash, option.testid);
        setBetResult("skipped", "\u811A\u672C\u9632\u91CD" + (local && local.orderno ? " \u5355\u53F7" + local.orderno : ""));
        targetOption = null;
        renderPanel(true);
        triggerAutoUploadMatchHistory("dedup-already-placed", { updateStep: false }).catch(function(e) {
          console.warn("[hty-inplay] \u9632\u91CD\u62E6\u622A\u540E\u4E0A\u4F20", e);
        });
        schedulePoll();
        return false;
      }
      if (recHash && isBetAttemptBlocked(recHash)) {
        const attempt = getBetAttempt(recHash);
        let recovered = null;
        if (isBetSubmittedDrawerVisible()) {
          setBetStep("\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u4E0B\u6CE8\uFF0C\u5C1D\u8BD5\u786E\u8BA4\u2026");
          renderPanel(true);
          recovered = await tryRecoverSuccessfulBet(option, attempt && attempt.at, { quick: true });
        } else if (canQueryOrdersReport() || getCachedOrdersReportText(matchId)) {
          setBetStep("\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u4E0B\u6CE8\uFF0C\u5C1D\u8BD5\u786E\u8BA4\u2026");
          renderPanel(true);
          recovered = await tryRecoverSuccessfulBet(option, attempt && attempt.at, { quick: true });
        }
        if (recovered) {
          lastStrategyBetRecord = recovered;
          placing = true;
          await finalizeBetSuccess(option, recovered, !!fromAutoBet, "\u540E\u53F0\u786E\u8BA4\u5DF2\u6709\u8BA2\u5355\uFF08\u9632\u91CD\u62E6\u622A\uFF09");
          placing = false;
          return true;
        }
        if (!isBetSubmittedDrawerVisible()) {
          const age = attempt ? Date.now() - Number(attempt.at || 0) : 0;
          if (age < BET_DEDUP_VERIFY_MISS_MS) {
            console.warn("[hty-inplay] \u9632\u91CD\u62E6\u622A\uFF1A\u8FD1\u671F\u5C1D\u8BD5\u672A\u786E\u8BA4\uFF0C\u6682\u505C\u91CD\u590D\u4E0B\u5355", recHash);
            setBetResult("pending", "\u6682\u505C\u91CD\u590D\u4E0B\u5355\uFF0C\u7B49\u5F85\u786E\u8BA4");
            setBetStep("\u9632\u91CD\u67E5\u5355\u4E2D\uFF08" + Math.max(1, Math.ceil((BET_DEDUP_VERIFY_MISS_MS - age) / 1e3)) + "s \u65E0\u5355\u53EF\u91CD\u8BD5\uFF09\u2026");
            renderPanel(true);
            schedulePoll();
            return false;
          }
          console.log("[hty-inplay] \u4E0A\u6B21\u4E0B\u6CE8\u672A\u6210\u529F\uFF0C\u6E05\u9664\u9632\u91CD\u6807\u8BB0\u5E76\u91CD\u8BD5", recHash);
          clearPendingBetDedup(recHash, "attempt \u8D85\u65F6\u65E0\u5355\uFF0C\u5141\u8BB8\u91CD\u8BD5");
          betResult = "pending";
          setBetStep("\u4E0A\u6B21\u4E0B\u6CE8\u5931\u8D25\uFF0C\u6761\u4EF6\u6EE1\u8DB3\u5C06\u91CD\u65B0\u5C1D\u8BD5");
          renderPanel(true);
        } else {
          console.warn("[hty-inplay] \u4E0B\u6CE8\u5C1D\u8BD5\u672A\u786E\u8BA4\uFF0C\u8DF3\u8FC7\u91CD\u590D\u4E0B\u5355", recHash);
          setBetResult("pending", "\u6682\u505C\u91CD\u590D\u4E0B\u5355\uFF0C\u7B49\u5F85\u786E\u8BA4");
          setBetStep("\u7B49\u5F85\u8BA2\u5355\u5165\u5E93\u786E\u8BA4\uFF0C\u8BF7\u52FF\u624B\u52A8\u91CD\u590D\u4E0B\u6CE8");
          renderPanel(true);
          schedulePoll();
          return false;
        }
      }
      const inflight = getBetInFlight();
      if (recHash && inflight && inflight.recHash === recHash) {
        setBetStep("\u68C0\u6D4B\u5230\u8FDB\u884C\u4E2D\u7684\u4E0B\u6CE8\uFF0C\u5C1D\u8BD5\u786E\u8BA4\u2026");
        const recovered = await tryRecoverSuccessfulBet(option, inflight.at, {
          retries: 3,
          gapMs: 2500
        });
        if (recovered) {
          lastStrategyBetRecord = recovered;
          placing = true;
          await finalizeBetSuccess(option, recovered, !!fromAutoBet, "\u540E\u53F0\u786E\u8BA4\u5DF2\u6709\u8BA2\u5355\uFF08\u672A\u8D70\u5B8C\u6574\u5F39\u7A97\u6D41\u7A0B\uFF09");
          placing = false;
          return true;
        }
        const inflightAge = Date.now() - Number(inflight.at || 0);
        if (inflightAge > BET_DEDUP_VERIFY_MISS_MS && !isBetSubmittedDrawerVisible()) {
          clearPendingBetDedup(recHash, "inflight \u8D85\u65F6\u65E0\u5355\uFF0C\u5141\u8BB8\u91CD\u8BD5");
        } else if (inflightAge > BET_RECOVERY_WINDOW_MS) {
          clearBetInFlight();
        } else {
          console.warn("[hty-inplay] \u4E0B\u6CE8\u8FDB\u884C\u4E2D\u4E14\u672A\u786E\u8BA4\uFF0C\u8DF3\u8FC7\u91CD\u590D\u4E0B\u5355", recHash);
          setBetResult("pending", "\u6682\u505C\u91CD\u590D\u4E0B\u5355\uFF0C\u7B49\u5F85\u786E\u8BA4");
          setBetStep("\u9632\u91CD\u67E5\u5355\u4E2D\uFF08" + Math.max(1, Math.ceil((BET_DEDUP_VERIFY_MISS_MS - inflightAge) / 1e3)) + "s \u65E0\u5355\u53EF\u91CD\u8BD5\uFF09\u2026");
          renderPanel(true);
          schedulePoll();
          return false;
        }
      }
      placing = true;
      collapsePanelForBet();
      setBetResult("placing", "\u51C6\u5907\u70B9\u51FB\u8D54\u7387");
      let stakeInput = "";
      try {
        stakeInput = resolveBetStakeInput(option);
      } catch (stakeErr) {
        placing = false;
        restorePanelAfterBet();
        const msg = stakeErr && stakeErr.message ? stakeErr.message : "\u6295\u6CE8\u91D1\u989D\u65E0\u6548";
        setBetResult("failed", msg);
        renderPanel(true);
        schedulePoll();
        return false;
      }
      markBetAttemptStarted(option, recHash, stakeInput);
      let betAttemptAt = 0;
      try {
        setBetStep("\u5B9A\u4F4D\u8D54\u7387\u6309\u94AE");
        const liveBtn = await ensureButtonVisible(option);
        if (!liveBtn) throw new Error("\u9875\u9762\u4E0A\u627E\u4E0D\u5230\u5BF9\u5E94\u8D54\u7387\u6309\u94AE");
        option.button = liveBtn;
        setBetStep("\u7B49\u5F85\u6295\u6CE8\u5355\u6253\u5F00");
        let opened = isCartOpen();
        if (!opened && getSportCartItemCount() > 0) {
          opened = await openBetDrawer();
        }
        if (!opened) {
          setBetStep("\u6EDA\u52A8\u5230\u8D54\u7387\u6309\u94AE");
          await humanScrollTo(liveBtn);
          setBetStep("\u70B9\u51FB " + option.label + " \u8D54\u7387");
          safeClick(liveBtn);
          await humanDelay(600, 1100);
          opened = await waitFor(isCartOpen, 12e3, 300);
        }
        if (!opened) throw new Error("\u6295\u6CE8\u5355\u672A\u6253\u5F00");
        await ensureBetCartVisible();
        await humanDelay(400, 800);
        setBetStep("\u6570\u5B57\u952E\u76D8\u8F93\u5165 " + stakeInput);
        await enterAmountViaKeypad(stakeInput);
        await humanDelay(300, 700);
        betAttemptAt = Date.now();
        setBetStep("\u7B49\u5F85\u4E0B\u6CE8\u7ED3\u679C\uFF08\u63A5\u53E3\u6216\u6210\u529F\u62BD\u5C49\uFF09\u2026");
        const betWaitHandle = createBetWaitHandle();
        await ensureBetCartVisible();
        await submitBetSlip(stakeInput, function() {
          betWaitHandle.rearm();
        });
        const outcome = await waitForBetOutcomeAfterSubmit(betWaitHandle, option, betAttemptAt);
        let betRecord;
        let outcomeHint = "";
        if (outcome.source === "api" || outcome.source === "api_late") {
          betRecord = buildStrategyBetRecord(option, outcome.payload, outcome.payload.requestBody);
        } else if (outcome.source === "order") {
          betRecord = outcome.record;
          outcomeHint = "\u8BA2\u5355\u6062\u590D\u786E\u8BA4";
        } else {
          betRecord = outcome.record;
          outcomeHint = "UI\u6210\u529F\u62BD\u5C49\u786E\u8BA4";
        }
        lastStrategyBetRecord = betRecord;
        console.log("[hty-inplay] \u4E0B\u6CE8\u6210\u529F", betRecord.orderno, betRecord.recHash, outcome.source);
        const doneRecHash = getBetRecHash(option, betRecord);
        markStrategyExecutedLocally(doneRecHash);
        rememberExecutedStrategy(doneRecHash, betRecord.orderno, option, {
          pendingSync: true,
          betOdds: betRecord.betOdds,
          betStake: betRecord.betStake,
          matchId: betRecord.matchId || matchId
        });
        placing = false;
        restorePanelAfterBet();
        setBetResult("success", (option.label || "") + " \u5DF2\u63D0\u4EA4");
        renderPanel(true);
        await finalizeBetSuccess(option, betRecord, !!fromAutoBet, outcomeHint || void 0);
        return true;
      } catch (err) {
        clearBetResultWaiter();
        let recovered = null;
        let recoverHint = "";
        const sinceAt = betAttemptAt > 0 ? betAttemptAt : Date.now() - 6e4;
        if (betAttemptAt > 0 || isBetSubmittedDrawerVisible()) {
          setBetStep("\u4E0B\u6CE8\u54CD\u5E94\u5F02\u5E38\uFF0C\u5C1D\u8BD5\u4ECE\u8BA2\u5355\u786E\u8BA4\u2026");
          renderPanel(true);
          recovered = await tryRecoverSuccessfulBet(option, sinceAt, {
            quick: isBetSubmittedDrawerVisible(),
            retries: 3,
            gapMs: 2500
          });
          if (recovered) recoverHint = "\u8BA2\u5355/UI \u6062\u590D\u786E\u8BA4";
        } else {
          const captured = consumeLastCapturedBetSuccess(option, Date.now() - 1e4);
          if (captured) {
            recovered = buildStrategyBetRecord(option, captured, captured.requestBody);
            recoverHint = "\u63A5\u53E3\u8FDF\u5230\u7684\u54CD\u5E94";
          }
        }
        if (recovered) {
          lastStrategyBetRecord = recovered;
          const hint = err && err.message ? err.message : "\u672A\u77E5\u9519\u8BEF";
          const extra = recoverHint ? recoverHint + "\uFF08" + hint + "\uFF09" : "\u63A5\u53E3\u672A\u6355\u83B7(" + hint + ")";
          const doneRecHash = getBetRecHash(option, recovered);
          markStrategyExecutedLocally(doneRecHash);
          rememberExecutedStrategy(doneRecHash, recovered.orderno, option);
          await finalizeBetSuccess(option, recovered, !!fromAutoBet, extra);
          return true;
        }
        const msg = err && err.message ? err.message : "\u672A\u77E5\u9519\u8BEF";
        const submittedUi = isBetSubmittedDrawerVisible();
        const keepAttempt = !isDefinitiveBetFailure(err) && (submittedUi || betAttemptAt > 0 && isUncertainBetFailure(err));
        if (keepAttempt) {
          markBetAttempt(recHash, option, stakeInput);
          markBetInFlight(recHash, {
            testid: option && option.testid,
            stake: stakeInput,
            at: betAttemptAt || Date.now()
          });
          if (submittedUi) {
            const uiRec = buildBetRecordFromUiSuccess(option);
            const doneRecHash = getBetRecHash(option, uiRec) || recHash;
            markStrategyExecutedLocally(doneRecHash);
            rememberExecutedStrategy(doneRecHash, uiRec.orderno, option, {
              pendingSync: true,
              betOdds: uiRec.betOdds,
              betStake: uiRec.betStake,
              matchId: uiRec.matchId || matchId
            });
            setBetResult("success", (option.label || "") + " \u5DF2\u63D0\u4EA4\uFF08\u8D85\u65F6\xB7UI\u786E\u8BA4\uFF09");
            setBetStep("\u63A5\u53E3\u8D85\u65F6\u4F46\u9875\u9762\u5DF2\u63D0\u4EA4\uFF0C\u5DF2\u9501\u5B9A\u9632\u91CD\u5E76\u540C\u6B65\u72B6\u6001");
            renderPanel(true);
            await finalizeBetSuccess(option, uiRec, !!fromAutoBet, "\u8D85\u65F6\xB7UI\u5DF2\u63D0\u4EA4");
            return true;
          }
          const lateCap = consumeLastCapturedBetSuccess(option, sinceAt);
          const uncertainRec = lateCap ? buildStrategyBetRecord(option, lateCap, lateCap.requestBody) : buildBetRecordFromUiSuccess(option);
          console.warn(
            "[hty-inplay] \u4E0B\u6CE8\u7ED3\u679C\u4E0D\u786E\u5B9A\uFF0C\u9501\u5B9A\u5E76\u540C\u6B65\u7B56\u7565\u72B6\u6001",
            msg,
            recHash,
            uncertainRec && uncertainRec.orderno
          );
          setBetResult("pending", "\u4E0B\u6CE8\u53EF\u80FD\u5DF2\u6210\u529F\uFF0C\u6682\u505C\u91CD\u590D\u4E0B\u5355\uFF08" + msg + "\uFF09");
          setBetStep("\u8D85\u65F6\u672A\u63A5\u5230\u54CD\u5E94\uFF0C\u5DF2\u9501\u5B9A\u5E76\u540C\u6B65\u7B56\u7565\u4E3A\u5DF2\u6267\u884C");
          renderPanel(true);
          await finalizeBetSuccess(option, uncertainRec, !!fromAutoBet, "\u8D85\u65F6\xB7\u9632\u91CD\u9501\u5B9A");
          return false;
        }
        clearBetInFlight();
        clearBetAttempt(recHash);
        console.warn("[hty-inplay] \u6295\u6CE8\u5931\u8D25", msg, err);
        setBetResult("failed", "\u5931\u8D25\uFF1A" + msg);
        setBetStep("\u4E0B\u6CE8\u5931\u8D25\uFF1A" + msg + "\uFF0C\u6761\u4EF6\u6EE1\u8DB3\u5C06\u91CD\u8BD5");
        renderPanel(true);
        schedulePoll();
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
        betResult = "pending";
        setBetStep("\u7B49\u5F85\u767B\u5F55\uFF0C\u5C1D\u8BD5\u81EA\u52A8\u767B\u5F55\u2026");
        tryAutoRelogin({ urgent: true }).catch(function(e) {
          console.warn("[hty-inplay] runAutoBet \u81EA\u52A8\u767B\u5F55", e);
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
      setBetStep("\u6B63\u5728\u6253\u5F00\u6295\u6CE8\u5355...");
      const ok = await openBetDrawer();
      if (ok) {
        setBetStep("\u6295\u6CE8\u5355\u5DF2\u6253\u5F00");
      } else {
        setBetStep("\u672A\u80FD\u6253\u5F00\u6295\u6CE8\u5355");
      }
      renderPanel(true);
    }
    async function testBet03() {
      if (placing) return;
      await ensureMarketView();
      await refreshTargetOption(true);
      if (!targetOption) {
        setBetResult("failed", "\u672A\u547D\u4E2D\u7B56\u7565\u76D8\u53E3\uFF0C\u8BF7\u786E\u8BA4\u76D8\u53E3\u4E0E\u8D54\u7387\u5DF2\u8FBE\u9608\u503C");
        return;
      }
      const stakeSummary = formatBetStakeSummary(targetOption);
      const msg = "\u786E\u8BA4\u6D4B\u8BD5\u4E0B\u6CE8\uFF1F\n\n\u76D8\u53E3\uFF1A" + targetOption.label + "\n\u5F53\u524D\u8D54\u7387\uFF1A" + formatOddsDisplay(targetOption.odds) + "\uFF08\u9608\u503C\u2265" + formatOddsDisplay(targetOption.minOdds) + "\uFF09\n\u6295\u6CE8\u91D1\u989D\uFF1A" + stakeSummary;
      if (!window.confirm(msg)) {
        setBetStep("\u5DF2\u53D6\u6D88\u6D4B\u8BD5\u4E0B\u6CE8");
        renderPanel(true);
        return;
      }
      await placeTestBet(targetOption);
    }
    function schedulePoll() {
      if (pollTimer) return;
      if (pollCount >= MAX_POLLS) {
        if (targetOption) {
          setBetResult("stopped", "\u7B49\u5F85\u8D85\u65F6\uFF0C\u5DF2\u505C\u6B62");
          return;
        }
        pollCount = 0;
      }
      pollTimer = setTimeout(async function() {
        pollTimer = null;
        pollCount += 1;
        if (isIdleLoginModalVisible()) {
          dismissIdleLoginModal();
          return;
        }
        if (isCurrentMatchEnded()) {
          await handleMatchEnded();
          if (isCurrentMatchEnded()) {
            setBetStep(hasNavigableInPlayMatches() ? "\u5F53\u524D\u8D5B\u4E8B\u5DF2\u7ED3\u675F\uFF0C\u51C6\u5907\u5207\u6362\u2026" : buildWaitingKickoffMessage() || "\u5F53\u524D\u8D5B\u4E8B\u5DF2\u7ED3\u675F\uFF0C\u5DF2\u505C\u6B62\u626B\u63CF");
            setBetResult("pending", "\u8D5B\u4E8B\u5DF2\u7ED3\u675F");
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
          if (placing || betResult === "placing") {
            placing = false;
            betResult = "pending";
          }
          setBetStep("\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u6B63\u5728\u81EA\u52A8\u767B\u5F55\u2026");
          renderPanel(true);
          tryAutoRelogin({ urgent: true }).catch(function(e) {
            console.warn("[hty-inplay] \u8F6E\u8BE2\u4E2D\u81EA\u52A8\u767B\u5F55", e);
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
          syncTargetOptionFromStates();
          if (!targetOption) {
            const states = evaluateStrategyStates();
            strategyStates = states;
            targetOption = findStrategyMatch();
          }
        }
        if (targetOption && betStep.indexOf("\u7B49\u5F85\u7B56\u7565\u76D8\u53E3") >= 0) {
          setBetStep("\u5DF2\u547D\u4E2D " + targetOption.label + " @" + targetOption.odds);
        }
        renderPanel(false, false);
        maybeTriggerAutoBet(false);
        if (!placing && !shouldAutoBet() && !pollTimer) {
          const rotated = await tryRotateInplayMatch("\u626B\u63CF\u8F6E\u6362");
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
      setBetStep("\u7B49\u5F85\u7B56\u7565\u76D8\u53E3\u4E0E\u8D54\u7387\u8FBE\u6807");
      schedulePoll();
    }
    function setPanelCollapsed(collapsed) {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      panelCollapsed = !!collapsed;
      panel.classList.toggle("tm-hty-collapsed", panelCollapsed);
      const btn = panel.querySelector(".tm-hty-collapse");
      if (btn) btn.textContent = panelCollapsed ? "\u25B8" : "\u25BE";
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
      setInterval(function() {
        if (placing) return;
        const open = isCartOpen();
        if (open && !lastCartOpenForPanel) {
          collapsePanelForBet();
        } else if (!open && lastCartOpenForPanel) {
          setTimeout(function() {
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
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = "#" + PANEL_ID + '{position:fixed;right:16px;bottom:16px;z-index:99999;width:360px;max-width:calc(100vw - 32px);border:1px solid #334155;border-radius:10px;background:#0f172a;color:#e2e8f0;box-shadow:0 8px 24px rgba(0,0,0,.35);font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;}#' + PANEL_ID + ".tm-hty-collapsed{width:auto;min-width:148px;}#" + PANEL_ID + ".tm-hty-collapsed .tm-hty-body,#" + PANEL_ID + ".tm-hty-collapsed .tm-hty-actions{display:none;}#" + PANEL_ID + " .tm-hty-head{position:relative;display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1e293b;font-weight:600;font-size:12px;cursor:pointer;user-select:none;}#" + PANEL_ID + " .tm-hty-title{flex:1;}#" + PANEL_ID + " .tm-hty-version{font-weight:400;color:#64748b;font-size:10px;margin-left:4px;}#" + PANEL_ID + " .tm-hty-collapse{border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:12px;padding:0 2px;}#" + PANEL_ID + " .tm-hty-body{padding:10px 10px 8px;min-width:0;}#" + PANEL_ID + " .tm-hty-row{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;min-width:0;}#" + PANEL_ID + " .tm-hty-label{flex:0 0 52px;color:#94a3b8;white-space:nowrap;}#" + PANEL_ID + " .tm-hty-value{flex:1;min-width:0;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}#" + PANEL_ID + " .tm-hty-link{color:#60a5fa;text-decoration:none;}#" + PANEL_ID + " .tm-hty-link:hover{text-decoration:underline;}#" + PANEL_ID + " .tm-hty-link-sep{color:#475569;margin:0 4px;}#" + PANEL_ID + " .tm-hty-result{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:600;font-size:11px;}#" + PANEL_ID + ' .tm-hty-result[data-kind="ready"]{background:#1d4ed8;color:#dbeafe;}#' + PANEL_ID + ' .tm-hty-result[data-kind="ing"]{background:#854d0e;color:#fef3c7;}#' + PANEL_ID + ' .tm-hty-result[data-kind="ok"]{background:#166534;color:#dcfce7;}#' + PANEL_ID + ' .tm-hty-result[data-kind="err"]{background:#991b1b;color:#fee2e2;}#' + PANEL_ID + ' .tm-hty-result[data-kind="warn"]{background:#92400e;color:#fef3c7;}#' + PANEL_ID + ' .tm-hty-result[data-kind="info"]{background:#334155;color:#cbd5e1;}#' + PANEL_ID + " .tm-hty-step{margin-top:4px;padding-top:8px;border-top:1px dashed #334155;color:#94a3b8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}#" + PANEL_ID + " .tm-hty-login{font-size:10px;color:#64748b;}#" + PANEL_ID + ' .tm-hty-login[data-kind="ok"]{color:#86efac;cursor:default;}#' + PANEL_ID + ' .tm-hty-login[data-kind="warn"]{color:#fde68a;cursor:pointer;text-decoration:underline;}#' + PANEL_ID + " .tm-hty-actions{display:flex;gap:6px;padding:0 12px 12px;flex-wrap:wrap;}#" + PANEL_ID + " .tm-hty-action-btn{flex:1 1 30%;border:1px solid #2563eb;border-radius:6px;padding:6px 8px;background:#172554;color:#dbeafe;font-size:11px;cursor:pointer;}#" + PANEL_ID + " .tm-hty-action-btn:hover:not(:disabled){background:#1d4ed8;}#" + PANEL_ID + " .tm-hty-action-btn:disabled{opacity:.45;cursor:not-allowed;}#" + PANEL_ID + " .tm-hty-strategy{margin-top:8px;padding-top:8px;border-top:1px dashed #334155;}#" + PANEL_ID + " .tm-hty-strategy-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:nowrap;}#" + PANEL_ID + " .tm-hty-strategy-title{font-weight:600;color:#cbd5e1;font-size:11px;white-space:nowrap;}#" + PANEL_ID + " .tm-hty-strategy-head > span:last-child{white-space:nowrap;}#" + PANEL_ID + " .tm-hty-matches-status,#" + PANEL_ID + " .tm-hty-strategy-status{font-size:10px;padding:1px 6px;border-radius:999px;background:#334155;color:#cbd5e1;}#" + PANEL_ID + ' .tm-hty-matches-status[data-kind="ready"],#' + PANEL_ID + ' .tm-hty-strategy-status[data-kind="ready"]{background:#1d4ed8;color:#dbeafe;}#' + PANEL_ID + ' .tm-hty-matches-status[data-kind="err"],#' + PANEL_ID + ' .tm-hty-strategy-status[data-kind="err"]{background:#991b1b;color:#fee2e2;}#' + PANEL_ID + " .tm-hty-matches-list{display:flex;flex-direction:column;align-items:flex-start;gap:2px;max-height:120px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;}#" + PANEL_ID + " .tm-hty-matches-ended{margin-top:6px;padding-top:6px;border-top:1px dashed #334155;}#" + PANEL_ID + " .tm-hty-ended-toggle{display:flex;align-items:center;gap:4px;width:100%;border:0;background:transparent;color:#94a3b8;font-size:10px;cursor:pointer;padding:2px 0;text-align:left;}#" + PANEL_ID + " .tm-hty-ended-toggle:hover{color:#cbd5e1;}#" + PANEL_ID + " .tm-hty-matches-ended-list{display:flex;flex-direction:column;align-items:flex-start;gap:2px;max-height:90px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;margin-top:4px;}#" + PANEL_ID + " .tm-hty-match-ended{opacity:.72;}#" + PANEL_ID + " .tm-hty-match-ended .tm-hty-match-pick{color:#94a3b8;}#" + PANEL_ID + " .tm-hty-strategy-list{max-height:160px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#475569 transparent;}#" + PANEL_ID + " .tm-hty-strategy-list::-webkit-scrollbar{width:4px;height:4px;}#" + PANEL_ID + " .tm-hty-strategy-list::-webkit-scrollbar-thumb{background:#475569;border-radius:4px;}#" + PANEL_ID + " .tm-hty-strategy-list::-webkit-scrollbar-track{background:transparent;}#" + PANEL_ID + " .tm-hty-match-item{display:flex;flex-wrap:nowrap;gap:4px;align-items:center;width:fit-content;max-width:100%;margin-bottom:2px;font-size:11px;color:#e2e8f0;border-radius:6px;padding:3px 4px;white-space:nowrap;}#" + PANEL_ID + " .tm-hty-match-item:hover{background:#1e293b;}#" + PANEL_ID + " .tm-hty-match-item .tm-hty-strategy-idx{flex:0 0 auto;flex-shrink:0;}#" + PANEL_ID + " .tm-hty-match-main{flex:0 0 auto;color:#e2e8f0;text-decoration:none;}#" + PANEL_ID + " .tm-hty-match-pick{flex:0 0 auto;}#" + PANEL_ID + " .tm-hty-match-main:hover{color:#93c5fd;text-decoration:underline;}#" + PANEL_ID + " .tm-hty-match-trace{flex:0 0 auto;flex-shrink:0;font-size:10px;padding:1px 4px;border-radius:4px;border:1px solid #475569;color:#94a3b8;text-decoration:none;line-height:1.4;white-space:nowrap;}#" + PANEL_ID + " .tm-hty-match-trace:hover{border-color:#60a5fa;color:#60a5fa;background:#172554;}#" + PANEL_ID + " .tm-hty-match-page{background:linear-gradient(90deg,rgba(37,99,235,.22) 0%,rgba(30,41,59,.55) 100%);border:1px solid rgba(59,130,246,.45);box-shadow:inset 2px 0 0 #3b82f6;}#" + PANEL_ID + " .tm-hty-match-page:hover{background:linear-gradient(90deg,rgba(37,99,235,.28) 0%,rgba(30,41,59,.65) 100%);}#" + PANEL_ID + " .tm-hty-match-page .tm-hty-match-main{color:#dbeafe;font-weight:600;}#" + PANEL_ID + " .tm-hty-match-badge{flex:0 0 auto;flex-shrink:0;font-size:10px;padding:1px 6px;border-radius:999px;background:#1d4ed8;color:#dbeafe;font-weight:600;white-space:nowrap;}#" + PANEL_ID + " .tm-hty-strategy-item{display:flex;gap:4px;margin-bottom:4px;font-size:11px;color:#e2e8f0;min-width:0;white-space:nowrap;}#" + PANEL_ID + " .tm-hty-strategy-idx{flex:0 0 16px;color:#64748b;}#" + PANEL_ID + " .tm-hty-strategy-mark{flex:0 0 14px;text-align:center;font-size:11px;color:#64748b;}#" + PANEL_ID + " .tm-hty-strategy-mark.hit{color:#86efac;font-weight:700;}#" + PANEL_ID + " .tm-hty-strategy-mark.plate{color:#fde68a;}#" + PANEL_ID + " .tm-hty-strategy-mark.done{color:#86efac;font-weight:700;}#" + PANEL_ID + " .tm-hty-strategy-mark.aborted{color:#fca5a5;font-weight:700;}#" + PANEL_ID + " .tm-hty-strategy-mark.confirming{color:#94a3b8;font-weight:700;}#" + PANEL_ID + " .tm-hty-strategy-exec{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;line-height:1.4;}#" + PANEL_ID + " .tm-hty-strategy-exec-pending{background:#334155;color:#cbd5e1;}#" + PANEL_ID + " .tm-hty-strategy-exec-executed{background:#dcfce7;color:#166534;}#" + PANEL_ID + " .tm-hty-strategy-exec-confirming{background:#334155;color:#94a3b8;}#" + PANEL_ID + " .tm-hty-strategy-exec-aborted{background:#451a1a;color:#fca5a5;}#" + PANEL_ID + " .tm-hty-strategy-item-hit .tm-hty-strategy-text{color:#f8fafc;}#" + PANEL_ID + " .tm-hty-strategy-item-done .tm-hty-strategy-text{color:#86efac;}#" + PANEL_ID + " .tm-hty-strategy-item-confirming .tm-hty-strategy-text{color:#94a3b8;}#" + PANEL_ID + " .tm-hty-strategy-item-aborted .tm-hty-strategy-text{color:#94a3b8;}#" + PANEL_ID + " .tm-hty-strategy-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}#" + PANEL_ID + " .tm-hty-strategy-odds{display:inline-block;padding:1px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-weight:600;font-size:10px;line-height:1.4;}#" + PANEL_ID + " .tm-hty-strategy-amount{display:inline-block;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:600;font-size:10px;line-height:1.4;}#" + PANEL_ID + " .tm-hty-strategy-empty{color:#64748b;font-size:11px;}#" + PANEL_ID + " .tm-hty-refresh{border:0;background:transparent;color:#60a5fa;cursor:pointer;font-size:10px;padding:0;}#" + PANEL_ID + " .tm-hty-bet-section{margin-top:4px;padding-top:8px;border-top:1px dashed #334155;}#" + PANEL_ID + ' .tm-hty-bet-section[data-hidden="1"]{display:none;}#' + PANEL_ID + " .tm-hty-stake-row{margin-left:-4px;margin-right:-4px;padding:6px 4px;border-radius:6px;transition:background .15s ease;}#" + PANEL_ID + " .tm-hty-stake-row.tm-hty-stake-alert{background:#fecaca;box-shadow:inset 0 0 0 1px #f87171;}#" + PANEL_ID + " .tm-hty-stake-row.tm-hty-stake-alert .tm-hty-label{color:#7f1d1d;font-weight:700;}#" + PANEL_ID + " .tm-hty-stake-row.tm-hty-stake-alert .tm-hty-stake-select{border-color:#ef4444;background:#fff1f2;color:#7f1d1d;font-weight:700;}#" + PANEL_ID + " .tm-hty-stake-select{width:100%;border:1px solid #475569;border-radius:4px;background:#1e293b;color:#f1f5f9;font-size:11px;padding:3px 6px;cursor:pointer;}#" + PANEL_ID + " .tm-hty-dedup-label{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#cbd5e1;cursor:pointer;}#" + PANEL_ID + " .tm-hty-dedup-toggle{margin:0;cursor:pointer;}";
        document.head.appendChild(style);
      }
      const panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.innerHTML = '<div class="tm-hty-head"><span class="tm-hty-title">HTY \u6EDA\u7403\u91CF\u5316<span class="tm-hty-version">v' + SCRIPT_VERSION2 + '</span></span><span class="tm-hty-login">\u68C0\u6D4B\u4E2D</span><button type="button" class="tm-hty-collapse" title="\u6298\u53E0/\u5C55\u5F00">\u25BE</button></div><div class="tm-hty-body"><div class="tm-hty-row"><span class="tm-hty-label">\u8D5B\u4E8B</span><span class="tm-hty-value tm-hty-match">\u2014</span></div><div class="tm-hty-row"><span class="tm-hty-label">\u626B\u63CF</span><span class="tm-hty-value tm-hty-scan">\u7B49\u5F85\u626B\u63CF</span></div><div class="tm-hty-row"><span class="tm-hty-label">\u94FE\u63A5</span><span class="tm-hty-value"><a class="tm-hty-link tm-hty-link-hty" href="#">HTY\u6BD4\u8D5B\u9875</a><span class="tm-hty-link-sep">\xB7</span><a class="tm-hty-link tm-hty-link-trace" href="#" target="_blank" rel="noopener">\u8D70\u52BF\u8FFD\u8E2A</a></span></div><div class="tm-hty-strategy tm-hty-matches"><div class="tm-hty-strategy-head"><span class="tm-hty-strategy-title">\u7B56\u7565\u8D5B\u4E8B</span><span><span class="tm-hty-matches-status" data-kind="info">\u52A0\u8F7D\u4E2D\u2026</span> <button type="button" class="tm-hty-refresh" data-action="refresh-strategy" title="\u5237\u65B0">\u5237\u65B0</button></span></div><div class="tm-hty-matches-list"></div><div class="tm-hty-matches-ended" data-collapsed="1" style="display:none"><button type="button" class="tm-hty-ended-toggle">\u5DF2\u7ED3\u675F (0) \u25B8</button><div class="tm-hty-matches-ended-list" style="display:none"></div></div></div><div class="tm-hty-strategy tm-hty-strategy-rules"><div class="tm-hty-strategy-head"><span class="tm-hty-strategy-title">\u7B56\u7565\u5217\u8868</span><span><span class="tm-hty-strategy-status" data-kind="info">\u52A0\u8F7D\u4E2D\u2026</span></span></div><div class="tm-hty-strategy-list"></div></div><div class="tm-hty-bet-section"><div class="tm-hty-row tm-hty-stake-row"><span class="tm-hty-label">\u6295\u6CE8\u91D1\u989D</span><span class="tm-hty-value"><select class="tm-hty-stake-select" title="\u6295\u6CE8\u91D1\u989D\u89C4\u5219"><option value="strategy">\u7B56\u7565\u5B9E\u9645\u91D1\u989D</option><option value="2.5">2.5</option><option value="1">1</option><option value="0.3">0.3</option></select></span></div><div class="tm-hty-row tm-hty-dedup-row"><span class="tm-hty-label">\u811A\u672C\u9632\u91CD</span><span class="tm-hty-value tm-hty-dedup-wrap"><label class="tm-hty-dedup-label" title="\u7B56\u7565\u72B6\u6001\u4E3A\u672A\u6267\u884C\u65F6\uFF0C\u518D\u68C0\u67E5\u672C\u9875/\u672C\u4F1A\u8BDD\u662F\u5426\u5DF2\u4E0B\u5355"><input type="checkbox" class="tm-hty-dedup-toggle" checked> \u5F00\u542F\uFF08\u9ED8\u8BA4\uFF09</label></span></div><div class="tm-hty-row"><span class="tm-hty-label">\u5373\u5C06\u6295\u6CE8</span><span class="tm-hty-value tm-hty-upcoming">\u7B49\u5F85\u9875\u9762\u52A0\u8F7D</span></div><div class="tm-hty-row"><span class="tm-hty-label">\u6295\u6CE8\u7ED3\u679C</span><span class="tm-hty-value"><span class="tm-hty-result" data-kind="info">\u7B49\u5F85\u76D8\u53E3</span></span></div><div class="tm-hty-step">\u521D\u59CB\u5316\u4E2D</div></div></div><div class="tm-hty-actions"><button type="button" class="tm-hty-action-btn" data-action="open-cart">\u6253\u5F00\u6295\u6CE8\u5355</button><button type="button" class="tm-hty-action-btn" data-action="test-bet">\u6D4B\u8BD5\u4E0B\u6CE8</button><button type="button" class="tm-hty-action-btn" data-action="upload-match-bets">\u4E0A\u4F20\u672C\u573A\u8BB0\u5F55</button></div>';
      panel.querySelector(".tm-hty-head").addEventListener("click", function(e) {
        if (e.target.closest(".tm-hty-collapse") || e.target.closest(".tm-hty-login")) return;
        togglePanelCollapsed();
      });
      panel.querySelector(".tm-hty-collapse").addEventListener("click", function(e) {
        e.stopPropagation();
        togglePanelCollapsed();
      });
      const loginEl = panel.querySelector(".tm-hty-login");
      if (loginEl) {
        loginEl.addEventListener("click", function(e) {
          e.stopPropagation();
          loginCache.ts = 0;
          if (isLoggedIn()) return;
          if (reloginInProgress) {
            setReloginStatus("\u767B\u5F55\u8FDB\u884C\u4E2D\u2026");
            return;
          }
          setReloginStatus("\u624B\u52A8\u89E6\u53D1\u767B\u5F55\u2026");
          tryAutoRelogin({ urgent: true, force: true }).catch(function(err) {
            console.warn("[hty-inplay] \u624B\u52A8\u70B9\u51FB\u767B\u5F55", err);
          });
        });
      }
      const stakeSelect = panel.querySelector(".tm-hty-stake-select");
      if (stakeSelect) {
        stakeSelect.value = stakeMode;
        const stakeRow = panel.querySelector(".tm-hty-stake-row");
        if (stakeRow) {
          stakeRow.classList.toggle("tm-hty-stake-alert", stakeMode !== "strategy");
          stakeRow.title = stakeMode !== "strategy" ? "\u5F53\u524D\u4E3A\u56FA\u5B9A\u91D1\u989D\uFF0C\u975E\u7B56\u7565\u5B9E\u9645\u91D1\u989D" : "";
        }
        stakeSelect.addEventListener("change", function(e) {
          e.stopPropagation();
          const mode = stakeSelect.value;
          if (!STAKE_MODE_OPTIONS[mode]) return;
          stakeMode = mode;
          saveStakeMode(mode);
          renderPanel(true);
        });
      }
      const dedupToggle = panel.querySelector(".tm-hty-dedup-toggle");
      if (dedupToggle) {
        dedupToggle.checked = isBetDedupEnabled();
        dedupToggle.addEventListener("change", function(e) {
          e.stopPropagation();
          betDedupEnabled = !!dedupToggle.checked;
          saveBetDedupEnabled(betDedupEnabled);
          lastStrategyHitKey = "";
          void refreshTargetOption(true).then(function() {
            renderPanel(true);
          });
        });
      }
      panel.addEventListener("click", function(e) {
        if (e.target.closest(".tm-hty-ended-toggle")) {
          e.stopPropagation();
          toggleEndedMatchesCollapsed(panel);
          return;
        }
        if (e.target.closest(".tm-hty-match-trace")) return;
        if (e.target.closest(".tm-hty-match-main")) {
          e.preventDefault();
          const link = e.target.closest(".tm-hty-match-main");
          const idMatch = (link.getAttribute("href") || "").match(/\/match\/(\d+)/i);
          const targetId = idMatch ? idMatch[1] : "";
          if (targetId) {
            markUserManualMatch(targetId);
            openInplayMatchPage(targetId, "\u7528\u6237\u9009\u62E9\u8D5B\u4E8B");
          }
          return;
        }
        const actionBtn = e.target.closest("[data-action]");
        if (!actionBtn || actionBtn.disabled) return;
        e.stopPropagation();
        if (actionBtn.dataset.action === "open-cart") manualOpenCart();
        if (actionBtn.dataset.action === "test-bet") testBet03();
        if (actionBtn.dataset.action === "upload-match-bets") manualUploadMatchBetHistory();
        if (actionBtn.dataset.action === "refresh-strategy") {
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
      setBetStep("\u7B49\u5F85\u8D5B\u4E8B\u9875\u52A0\u8F7D\u5B8C\u6210");
      await humanDelay(500, 1e3);
      try {
        await loadActiveMatches(false);
      } catch (e) {
        console.warn("[hty-inplay] \u521D\u59CB\u52A0\u8F7D\u7B56\u7565\u8D5B\u4E8B\u5931\u8D25", e);
      }
      if (await handleMatchEnded()) return;
      if (await maybeAutoNavigateToInplay()) return;
      try {
        await waitFor(function() {
          if (isCurrentMatchEnded()) return true;
          return isPageReady();
        }, 6e4, 500);
      } catch (e) {
        if (await handleMatchEnded()) return;
        if (await maybeAutoNavigateToInplay()) return;
        setBetResult("stopped", "\u9875\u9762\u52A0\u8F7D\u8D85\u65F6");
        return;
      }
      if (await handleMatchEnded()) return;
      if (await maybeAutoNavigateToInplay()) return;
      if (isCurrentMatchEnded()) return;
      if (!pickInplayNavigableMatch("") && !isPageReady()) {
        setWaitingKickoffState();
        schedulePoll();
        return;
      }
      setBetStep("\u5207\u6362\u76D8\u53E3\u89C6\u56FE\u5E76\u626B\u63CF\u2026");
      panelReady = true;
      scheduleHeartbeat();
      syncOddsObserverState();
      await loadStrategies();
      targetOption = await waitForStrategyMatch(6e4);
      renderPanel(true);
      if (!targetOption) {
        setBetResult("pending", "\u6682\u672A\u547D\u4E2D\u7B56\u7565\u76D8\u53E3\uFF0C\u6301\u7EED\u76D1\u63A7\u4E2D");
        setBetStep("\u7B49\u5F85\u7B56\u7565\u76D8\u53E3\u4E0E\u8D54\u7387\u8FBE\u6807");
        schedulePoll();
        return;
      }
      await humanDelay(1500, 3e3);
      kickoffAutoBet();
    }
    async function startListPage() {
      if (recoverFromBlockedAccessPage()) return;
      await ensureListPageBoot();
    }
    async function start() {
      if (started) return;
      if (isSiteAccessBlockedPage()) {
        suppressNavigation(WAF_RECOVERY_COOLDOWN_MS, "WAF\u963B\u65AD\u9875\u542F\u52A8");
      }
      if (recoverFromBlockedAccessPage()) return;
      started = true;
      rememberCurrentMatchReturnUrl();
      try {
        sessionStorage.removeItem(KEEPALIVE_PHASE_KEY);
        const until = parseInt(sessionStorage.getItem(NAV_BREAKER_UNTIL_KEY) || "0", 10) || 0;
        if (until && Date.now() < until) {
          sessionStorage.removeItem(NAV_BREAKER_UNTIL_KEY);
          sessionStorage.removeItem(NAV_BREAKER_LOG_KEY);
        }
      } catch (e) {
      }
      if (matchId) {
        lastInplayNavAt = Date.now();
        try {
          sessionStorage.setItem(LAST_INPLAY_NAV_AT_KEY, String(lastInplayNavAt));
          sessionStorage.setItem(LAST_INPLAY_NAV_MATCH_KEY, String(matchId));
          sessionStorage.setItem(NAV_HARD_AT_KEY, String(lastInplayNavAt));
        } catch (e) {
        }
      }
      createPanel();
      ensureWrongSportSectionGuard();
      scheduleLoginWatch();
      setInterval(function() {
        loginCache.ts = 0;
        if (isLoggedIn() || reloginInProgress) return;
        tryAutoRelogin({ urgent: placing }).catch(function(e) {
          console.warn("[hty-inplay] \u5B9A\u65F6\u81EA\u52A8\u767B\u5F55", e);
        });
      }, RELOGIN_WATCH_MS);
      scheduleSessionKeepAlive();
      setupMatchEndedWatcher();
      setupVisibilityWatch();
      scheduleHeartbeat();
      setTimeout(function() {
        startAutoBetFlow();
      }, 0);
    }
    function boot() {
      try {
        clearKeepalivePhase2();
      } catch (e) {
      }
      try {
        window.__htyAllowPageNav = false;
      } catch (e2) {
      }
      console.log(
        "[hty-inplay] boot",
        SCRIPT_VERSION2,
        "AUTO_PAGE_NAV=",
        AUTO_PAGE_NAV_ENABLED
      );
      ensureLoginNavGate();
      ensureNavPicker();
      getHeartbeatRunner();
      ensureWrongSportSectionGuard();
      if (isWrongSportSectionPage()) {
        recoverFromWrongSportSection("\u542F\u52A8\u4E8E\u975E\u8DB3\u7403\u7248\u5757\uFF0C\u7EDF\u4E00\u62C9\u56DE\u8DB3\u7403\u6EDA\u7403\u5217\u8868");
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
      document.addEventListener("DOMContentLoaded", boot);
    }
  }

  // src/main.js
  bootApp();
})();

