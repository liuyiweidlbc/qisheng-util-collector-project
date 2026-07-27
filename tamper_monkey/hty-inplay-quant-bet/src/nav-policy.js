import { KEYS } from './storage-keys.js';
import {
  NAV_HARD_COOLDOWN_MS,
  NAV_BREAKER_WINDOW_MS,
  NAV_BREAKER_MAX,
  NAV_BREAKER_PAUSE_MS,
} from './config.js';

/** 禁止主动打开足球滚球列表页 */
export function isForbiddenInplayListUrl(url) {
  try {
    const u = new URL(String(url || ''), window.location.origin);
    const p = String(u.pathname || '').replace(/\/$/, '') || '/';
    return /\/sportEvents\/inplay\/football$/i.test(p) ||
      /\/sportEvents\/football\/inplay$/i.test(p);
  } catch (e) {
    const s = String(url || '');
    return /\/sportEvents\/inplay\/football\/?(\?|#|$)/i.test(s) &&
      s.indexOf('/match/') < 0;
  }
}

export function createNavPolicy(ctx) {
  const {
    getLastInplayNavAt,
    setLastInplayNavAt,
    getNavSuppressedUntil,
    setNavSuppressedUntil,
    resolveMatchIdForListRewrite,
    buildInplayMatchUrl,
    normalizeMatchBetHref,
  } = ctx;

  function readNavBreakerUntil() {
    try {
      return parseInt(sessionStorage.getItem(KEYS.NAV_BREAKER_UNTIL) || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function readNavHardAt() {
    try {
      return parseInt(sessionStorage.getItem(KEYS.NAV_HARD_AT) || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function pushNavBreakerLog(now) {
    let arr = [];
    try {
      arr = JSON.parse(sessionStorage.getItem(KEYS.NAV_BREAKER_LOG) || '[]');
    } catch (e) {
      arr = [];
    }
    if (!Array.isArray(arr)) arr = [];
    arr.push(now);
    arr = arr.filter(function (t) {
      return now - Number(t) < NAV_BREAKER_WINDOW_MS;
    });
    try {
      sessionStorage.setItem(KEYS.NAV_BREAKER_LOG, JSON.stringify(arr));
    } catch (e) { /* ignore */ }
    return arr;
  }

  function rewriteAwayFromInplayList(url, reason) {
    if (!isForbiddenInplayListUrl(url)) return url;
    const mid = resolveMatchIdForListRewrite();
    if (mid) {
      const fixed = buildInplayMatchUrl(mid);
      console.warn('[hty-inplay] 拦截滚球列表跳转，改为比赛页', reason || '', url, '->', fixed);
      return fixed;
    }
    console.error('[hty-inplay] 拦截滚球列表跳转且无目标比赛，取消导航', reason || '', url);
    return '';
  }

  function canPerformPageNavigation(reason) {
    const now = Date.now();
    const breakerUntil = readNavBreakerUntil();
    if (breakerUntil && now < breakerUntil) {
      console.warn(
        '[hty-inplay] 导航熔断中，跳过',
        reason || '',
        Math.ceil((breakerUntil - now) / 1000) + 's'
      );
      return false;
    }
    const hardAt = Math.max(getLastInplayNavAt() || 0, readNavHardAt());
    if (hardAt && now - hardAt < NAV_HARD_COOLDOWN_MS) {
      console.warn(
        '[hty-inplay] 导航硬冷却中，跳过',
        reason || '',
        Math.ceil((NAV_HARD_COOLDOWN_MS - (now - hardAt)) / 1000) + 's'
      );
      return false;
    }
    return true;
  }

  function markNavNow(matchIdForRecord, recordInplayNavigation) {
    const now = Date.now();
    if (matchIdForRecord && recordInplayNavigation) {
      recordInplayNavigation(matchIdForRecord);
    } else {
      setLastInplayNavAt(now);
      try {
        sessionStorage.setItem(KEYS.NAV_HARD_AT, String(now));
      } catch (e) { /* ignore */ }
    }
  }

  function tripBreakerIfNeeded(now, reason) {
    const log = pushNavBreakerLog(now);
    if (log.length < NAV_BREAKER_MAX) return false;
    const until = now + NAV_BREAKER_PAUSE_MS;
    try {
      sessionStorage.setItem(KEYS.NAV_BREAKER_UNTIL, String(until));
    } catch (e) { /* ignore */ }
    console.error(
      '[hty-inplay] 导航过于频繁，熔断',
      NAV_BREAKER_PAUSE_MS / 1000 + 's',
      reason || ''
    );
    setNavSuppressedUntil(Math.max(getNavSuppressedUntil(), until));
    return true;
  }

  function performPageNavigation(url, reason, matchIdForRecord, recordInplayNavigation) {
    if (!url) return false;
    url = rewriteAwayFromInplayList(url, reason);
    if (!url) return false;
    const dest = String(url).split('#')[0];
    const cur = String(window.location.href || '').split('#')[0];
    if (
      (normalizeMatchBetHref &&
        normalizeMatchBetHref(dest) === normalizeMatchBetHref(cur)) ||
      dest === cur
    ) {
      return true;
    }
    if (!canPerformPageNavigation(reason)) return false;
    const now = Date.now();
    if (tripBreakerIfNeeded(now, reason)) return false;
    markNavNow(matchIdForRecord, recordInplayNavigation);
    console.log('[hty-inplay] 页面跳转', reason || '', dest);
    window.location.href = url;
    return true;
  }

  function performPageReplace(url, reason, matchIdForRecord, recordInplayNavigation) {
    if (!url) return false;
    url = rewriteAwayFromInplayList(url, reason);
    if (!url) return false;
    const dest = String(url).split('#')[0];
    const cur = String(window.location.href || '').split('#')[0];
    if (dest === cur) return true;
    if (!canPerformPageNavigation(reason)) return false;
    const now = Date.now();
    if (tripBreakerIfNeeded(now, reason)) return false;
    markNavNow(matchIdForRecord, recordInplayNavigation);
    console.log('[hty-inplay] 页面替换', reason || '', dest);
    window.location.replace(url);
    return true;
  }

  function inplayListUrl() {
    console.error('[hty-inplay] inplayListUrl 已禁用：禁止跳转 /sportEvents/inplay/football');
    return '';
  }

  return {
    isForbiddenInplayListUrl,
    rewriteAwayFromInplayList,
    canPerformPageNavigation,
    performPageNavigation,
    performPageReplace,
    inplayListUrl,
    readNavHardAt,
  };
}
