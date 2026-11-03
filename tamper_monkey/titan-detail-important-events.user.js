// ==UserScript==
// @name         Titan007 默认重要事件
// @namespace    https://titan007.com/
// @version      1.0.0
// @description  detail 页比赛开始后不再自动切到「详细事件」，默认停留在「重要事件」。手动点击仍可切换。iframe 内不注入。
// @match        https://live.titan007.com/detail/*
// @match        http://live.titan007.com/detail/*
// @noframes
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  // 只有点击「详细事件」时放行 ShowEventDetail(1)。点「重要事件」不算。
  let allowDetail = false;
  let userChose = false;

  document.addEventListener('click', function (e) {
    const target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('#eventMenu0, #eventMenu1')) userChose = true;
    if (!target.closest('#eventMenu1')) return;
    allowDetail = true;
    setTimeout(function () { allowDetail = false; }, 0);
  }, true);

  function ensurePatch() {
    const fn = window.ShowEventDetail;
    if (typeof fn !== 'function' || fn.__tmImportantDefault) return false;
    const orig = fn.__tmImportantOrig || fn;

    function wrapped(type) {
      // initLive 在重要事件为空时会主动调用 ShowEventDetail(1)。
      if (!allowDetail && String(type) === '1') return;
      return orig.apply(this, arguments);
    }

    wrapped.__tmImportantDefault = true;
    wrapped.__tmImportantOrig = orig;
    window.ShowEventDetail = wrapped;

    if (!userChose) {
      const menu1 = document.getElementById('eventMenu1');
      if (menu1 && menu1.className === 'ontab') orig.call(window, 0);
    }
    return true;
  }

  // getHeadData 用同步 XHR，回调里才会切到详细事件。必须在 send 之前包好。
  if (!XMLHttpRequest.prototype.send.__tmImportantDefault) {
    const origSend = XMLHttpRequest.prototype.send;
    function wrappedSend() {
      ensurePatch();
      return origSend.apply(this, arguments);
    }
    wrappedSend.__tmImportantDefault = true;
    XMLHttpRequest.prototype.send = wrappedSend;
  }

  const timer = setInterval(ensurePatch, 50);
  setTimeout(function () { clearInterval(timer); }, 20000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePatch);
  } else {
    ensurePatch();
  }
})();
