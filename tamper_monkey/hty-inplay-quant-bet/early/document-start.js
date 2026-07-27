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
