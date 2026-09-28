// ==UserScript==
// @name         Titan007 动画直播开关
// @namespace    https://titan007.com/
// @version      1.1.0
// @description  detail 页动画栏右侧磁吸开关：默认关闭并折叠动画区，悬停展开，点击开启/关闭。高清直播不受影响。
// @match        https://live.titan007.com/detail/*
// @match        http://live.titan007.com/detail/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tm-flash-live-enabled';
  const STYLE_ID = 'tm-flash-live-style';
  const SWITCH_ID = 'tm-flash-live-switch';

  function isEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setEnabled(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  function readCookie(name) {
    const dc = document.cookie || '';
    const prefix = name + '=';
    const parts = dc.split(';');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].replace(/^\s+/, '');
      if (part.indexOf(prefix) === 0) return part.substring(prefix.length);
    }
    return null;
  }

  function cookieDomain() {
    const parts = location.hostname.split('.');
    if (parts.length >= 2 && !/^\d+$/.test(parts[1] || '')) return parts.slice(-2).join('.');
    return location.hostname;
  }

  function setShowLiveCookie(on) {
    const value = on ? '1' : '0';
    const expires = new Date(Date.now() + 365 * 3600000).toUTCString();
    const base = 'showLive=' + value + ';path=/;expires=' + expires;
    document.cookie = base;
    document.cookie = base + ';domain=' + cookieDomain();
  }

  function isHdActive() {
    const tab = document.getElementById('tvLive2');
    if (!tab || tab.style.display === 'none') return false;
    return (tab.className || '').indexOf('ontab') >= 0;
  }

  function flashIframe(node) {
    if (!node || node.tagName !== 'IFRAME') return false;
    const src = node.getAttribute('src') || '';
    return /flashDetail/i.test(src);
  }

  function unloadAnimation() {
    document.querySelectorAll('#flashLive iframe, iframe').forEach((iframe) => {
      if (!flashIframe(iframe)) return;
      iframe.src = 'about:blank';
      iframe.remove();
    });
    const flash = document.getElementById('flashLive');
    if (flash && flash.querySelector('iframe')) flash.innerHTML = '';
    if (isHdActive()) return;
    const liveDiv = document.getElementById('liveDiv');
    if (liveDiv) liveDiv.style.display = 'none';
    const arrow = document.querySelector('#liveHead > i');
    if (arrow) arrow.className = 'arrow up';
  }

  function startAnimation() {
    const liveDiv = document.getElementById('liveDiv');
    if (liveDiv) liveDiv.style.display = '';
    const arrow = document.querySelector('#liveHead > i');
    if (arrow) arrow.className = 'arrow';
    const type = readCookie('flashType') === '2' ? 2 : 1;
    if (typeof window.ChangeFlashVer !== 'function') return false;
    window.ChangeFlashVer(type, false);
    return true;
  }

  function syncVisual(on) {
    const dock = document.getElementById(SWITCH_ID);
    if (!dock) return;
    dock.classList.toggle('is-on', !!on);
    dock.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function applyState(on) {
    setEnabled(on);
    setShowLiveCookie(on || isHdActive());
    syncVisual(on);
    if (on) {
      if (!startAnimation()) {
        let tries = 0;
        const timer = setInterval(() => {
          tries += 1;
          if (!isEnabled() || startAnimation() || tries > 40) clearInterval(timer);
        }, 100);
      }
      return;
    }
    unloadAnimation();
    if (!isHdActive()) setShowLiveCookie(false);
  }

  function tryPatch() {
    if (typeof window.ChangeFlashVer === 'function' && !window.ChangeFlashVer.__tmFlashGate) {
      const origChange = window.ChangeFlashVer;
      function gatedChange(type, isSaveCookie) {
        const kind = parseInt(type, 10);
        if (!isEnabled() && kind !== 4) {
          unloadAnimation();
          if (!isHdActive()) setShowLiveCookie(false);
          return;
        }
        return origChange.apply(this, arguments);
      }
      gatedChange.__tmFlashGate = true;
      window.ChangeFlashVer = gatedChange;
    }
    if (typeof window.ShowTabContent === 'function' && !window.ShowTabContent.__tmFlashGate) {
      const origShow = window.ShowTabContent;
      function gatedShow(el, id) {
        if (id === 'liveDiv' && !isEnabled() && !isHdActive()) {
          if (el) el.className = 'arrow up';
          const liveDiv = document.getElementById('liveDiv');
          if (liveDiv) liveDiv.style.display = 'none';
          setShowLiveCookie(false);
          return;
        }
        return origShow.apply(this, arguments);
      }
      gatedShow.__tmFlashGate = true;
      window.ShowTabContent = gatedShow;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#liveHead{position:relative !important;overflow:visible !important;}',
      '#' + SWITCH_ID + '{position:absolute;right:42px;top:50%;transform:translateY(-50%);z-index:20;display:flex;align-items:center;justify-content:flex-end;gap:8px;width:40px;height:28px;padding:0 2px;box-sizing:border-box;overflow:hidden;background:#fff;border:1px solid #e3e3e3;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.14);cursor:pointer;user-select:none;white-space:nowrap;transition:width .2s ease,border-color .2s,padding .2s;}',
      '#' + SWITCH_ID + ':hover{width:124px;padding-left:10px;}',
      '#' + SWITCH_ID + ' .tm-flash-live-txt{font-size:13px;line-height:1;color:#666;font-weight:600;}',
      '#' + SWITCH_ID + ' .tm-flash-live-knob{width:36px;height:20px;border-radius:10px;background:#c8c8c8;position:relative;flex:0 0 36px;transition:background .2s;}',
      '#' + SWITCH_ID + ' .tm-flash-live-knob i{width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.25);}',
      '#' + SWITCH_ID + '.is-on{border-color:#007fe4;}',
      '#' + SWITCH_ID + '.is-on .tm-flash-live-txt{color:#007fe4;}',
      '#' + SWITCH_ID + '.is-on .tm-flash-live-knob{background:#007fe4;}',
      '#' + SWITCH_ID + '.is-on .tm-flash-live-knob i{transform:translateX(16px);}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function mountSwitch() {
    const head = document.getElementById('liveHead');
    if (!head) return;
    const old = document.getElementById(SWITCH_ID);
    if (old && old.parentElement !== head) old.remove();
    if (document.getElementById(SWITCH_ID)) return;
    ensureStyle();
    const dock = document.createElement('div');
    dock.id = SWITCH_ID;
    dock.className = 'tm-flash-dock' + (isEnabled() ? ' is-on' : '');
    dock.title = '动画直播（悬停展开，点击开关）';
    dock.setAttribute('role', 'button');
    dock.setAttribute('aria-pressed', isEnabled() ? 'true' : 'false');
    dock.innerHTML = '<span class="tm-flash-live-txt">动画直播</span><span class="tm-flash-live-knob" aria-hidden="true"><i></i></span>';
    const stop = (e) => e.stopPropagation();
    dock.addEventListener('mousedown', stop);
    dock.addEventListener('click', (e) => {
      stop(e);
      e.preventDefault();
      applyState(!isEnabled());
    });
    head.appendChild(dock);
  }

  function watchLivePanel() {
    const liveDiv = document.getElementById('liveDiv');
    if (!liveDiv || liveDiv.__tmFlashWatch) return;
    liveDiv.__tmFlashWatch = true;
    new MutationObserver(() => {
      if (isEnabled() || isHdActive()) return;
      if (liveDiv.style.display !== 'none' || liveDiv.querySelector('iframe')) unloadAnimation();
    }).observe(liveDiv, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
  }

  function blockStrayFlash(node) {
    if (isEnabled() || !node) return;
    if (flashIframe(node)) {
      node.src = 'about:blank';
      node.remove();
      return;
    }
    if (node.querySelectorAll) {
      node.querySelectorAll('iframe').forEach((iframe) => {
        if (!flashIframe(iframe)) return;
        iframe.src = 'about:blank';
        iframe.remove();
      });
    }
  }

  if (!isEnabled() && readCookie('showTvLive') !== '1') {
    setShowLiveCookie(false);
  } else if (isEnabled()) {
    setShowLiveCookie(true);
  }

  const observer = new MutationObserver((records) => {
    tryPatch();
    mountSwitch();
    watchLivePanel();
    if (isEnabled()) return;
    records.forEach((record) => {
      record.addedNodes.forEach((node) => blockStrayFlash(node));
    });
  });

  function boot() {
    tryPatch();
    mountSwitch();
    watchLivePanel();
    if (!isEnabled() && readCookie('showTvLive') !== '1') unloadAnimation();
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  const patchTimer = setInterval(() => {
    tryPatch();
    mountSwitch();
    watchLivePanel();
    if (!isEnabled() && readCookie('showTvLive') !== '1') unloadAnimation();
    if (window.ChangeFlashVer && window.ChangeFlashVer.__tmFlashGate && document.getElementById(SWITCH_ID)) {
      clearInterval(patchTimer);
    }
  }, 200);
  setTimeout(() => clearInterval(patchTimer), 20000);
})();
