// ==UserScript==
// @name         8868投注助手
// @namespace    https://smartodds.xyz/
// @version      1.1
// @description  在比赛页右下角显示 match_id，点击 MatchTrace 上拉抽屉打开 trace 页面
// @include      /^https:\/\/[^/]*8868[^/]*\.app\/.*inplay.*/
// @run-at      document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const pathMatch = /\/sportEvents\/inplay\/football\/match\/(\d+)/;
  const path = window.location.pathname;
  const m = path.match(pathMatch);
  const matchId = m ? m[1] : null;

  if (!matchId) return;

  const bases = {
    smartodds: 'https://smartodds.xyz',
    socbeta: 'http://socbeta.xyz',
  };
  const paths = {
    trace: `/match/trace?match_id=${matchId}`,
    dropping: '/odds/dropping',
    exclude: '/single/bet/exclude',
  };
  function getUrl(domain, pathKey) {
    return bases[domain] + paths[pathKey];
  }

  const styles = `
    #match-trace-panel {
      position: fixed;
      bottom: 0;
      right: 20px;
      width: 360px;
      height: 165px;
      background: #1a1d24;
      border-radius: 12px 12px 0 0;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.3);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e4e6eb;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #match-trace-panel .panel-header {
      padding: 12px 16px;
      background: #252830;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #match-trace-panel .match-id-label {
      font-size: 12px;
      color: #8b8f98;
    }
    #match-trace-panel .match-id-value {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      cursor: text;
      user-select: text;
    }
    #match-trace-panel .match-id-value.match-id-edit {
      padding: 2px 6px;
      margin: -2px -6px 0 0;
    }
    #match-trace-panel .match-id-value input {
      width: 80px;
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      background: #1e293b;
      border: 1px solid #3b82f6;
      border-radius: 4px;
      padding: 2px 6px;
      outline: none;
      font-family: inherit;
    }
    #match-trace-panel .panel-header {
      padding: 12px 16px;
      background: #252830;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 10px 0;
    }
    #match-trace-panel .domain-group {
      display: inline-flex;
      gap: 4px;
      flex-shrink: 0;
      align-items: center;
    }
    #match-trace-panel .btn-domain {
      padding: 2px 8px;
      background: #2d323b;
      color: #6b7280;
      border: 1px solid #3d4550;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
    }
    #match-trace-panel .btn-domain:hover {
      background: #3d4550;
      color: #9ca3af;
      border-color: #4b5563;
    }
    #match-trace-panel .btn-domain.active {
      background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
      color: #fff;
      border-color: #1d4ed8;
      box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
    }
    #match-trace-panel .action-row {
      width: 100%;
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      align-items: center;
    }
    #match-trace-panel .action-row--link {
      gap: 16px;
      padding: 4px 0;
      min-height: 28px;
      justify-content: flex-end;
    }
    #match-trace-panel .link-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 13px;
      cursor: pointer;
      transition: color 0.2s;
      border-bottom: 1px solid transparent;
    }
    #match-trace-panel .link-item:hover {
      color: #e2e8f0;
      border-bottom-color: #64748b;
    }
    #match-trace-panel .link-item .icon {
      font-size: 14px;
      opacity: 0.9;
    }
    #match-trace-panel .action-row--btn {
      gap: 6px;
      margin-top: 4px;
    }
    #match-trace-panel .btn-action {
      flex: 1;
      padding: 5px 10px;
      min-height: 28px;
      background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    #match-trace-panel .btn-action:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 10px rgba(37, 99, 235, 0.35);
    }
    #match-trace-panel .btn-action:active {
      transform: translateY(0);
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    #match-trace-panel .btn-action.btn-action--muted {
      background: #2d323b;
      color: #94a3b8;
      border: 1px solid #3d4550;
      box-shadow: none;
    }
    #match-trace-panel .btn-action.btn-action--muted:hover {
      background: #3d4550;
      color: #cbd5e1;
      border-color: #4b5563;
    }
    #match-trace-panel .btn-action .icon {
      font-size: 13px;
    }
    #match-trace-panel .panel-body {
      flex: 1;
      padding: 12px;
      overflow: auto;
    }
    #match-trace-drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 99998;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    #match-trace-drawer-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }
    #match-trace-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 0;
      background: #0f1114;
      z-index: 100000;
      transition: height 0.3s ease-out;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #match-trace-drawer.open {
      height: 92vh;
    }
    #match-trace-drawer .drawer-handle {
      height: 36px;
      background: #252830;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    #match-trace-drawer .drawer-handle::before {
      content: '';
      width: 48px;
      height: 4px;
      background: #4b5563;
      border-radius: 2px;
    }
    #match-trace-drawer .drawer-iframe-wrap {
      flex: 1;
      min-height: 0;
    }
    #match-trace-drawer iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  `;

  function inject() {
    if (!document.body) return;

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  const panel = document.createElement('div');
  panel.id = 'match-trace-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="match-id-label">MatchId</div>
        <div class="match-id-value" data-match-id="${matchId}" title="双击编辑">${matchId}</div>
      </div>
      <div class="domain-group">
        <button type="button" class="btn-domain" data-domain="smartodds">SmartOdds</button>
        <button type="button" class="btn-domain active" data-domain="socbeta">SocBeta备用</button>
      </div>
      <div class="action-row action-row--link">
        <button type="button" class="link-item" data-path="dropping"><span class="icon">🎯</span>扫盘</button>
        <button type="button" class="link-item" data-path="exclude"><span class="icon">🎟️</span>竞彩</button>
      </div>
      <div class="action-row action-row--btn">
        <button type="button" class="btn-action" data-path="trace"><span class="icon">📍</span>追踪</button>
        <button type="button" class="btn-action btn-action--muted" data-path=""><span class="icon">♟️</span>策略</button>
        <button type="button" class="btn-action btn-action--muted" data-path=""><span class="icon">📝</span>投注</button>
      </div>
    </div>
    <div class="panel-body"></div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'match-trace-drawer-overlay';

  const drawer = document.createElement('div');
  drawer.id = 'match-trace-drawer';
  drawer.innerHTML = `
    <div class="drawer-handle" title="点击收起"></div>
    <div class="drawer-iframe-wrap">
      <iframe id="match-trace-iframe" src="about:blank"></iframe>
    </div>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const iframe = document.getElementById('match-trace-iframe');
  let selectedDomain = 'socbeta';

  function openDrawer(url) {
    iframe.src = url;
    drawer.classList.add('open');
    overlay.classList.add('visible');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('visible');
  }

  function toggleDrawer() {
    if (drawer.classList.contains('open')) {
      closeDrawer();
    }
  }

  const matchIdEl = panel.querySelector('.match-id-value');
  matchIdEl.addEventListener('dblclick', () => {
    const current = matchIdEl.dataset.matchId || matchIdEl.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.autocomplete = 'off';
    matchIdEl.textContent = '';
    matchIdEl.appendChild(input);
    matchIdEl.classList.add('match-id-edit');
    input.focus();
    input.select();
    function commit() {
      const raw = input.value.trim();
      const nextId = raw && /^\d+$/.test(raw) ? raw : null;
      matchIdEl.removeChild(input);
      matchIdEl.classList.remove('match-id-edit');
      matchIdEl.textContent = matchIdEl.dataset.matchId;
      if (nextId && nextId !== matchIdEl.dataset.matchId) {
        const pathMatchRe = /(\/sportEvents\/inplay\/football\/match\/)(\d+)/;
        const newPath = path.replace(pathMatchRe, '$1' + nextId);
        const url = window.location.origin + newPath + window.location.search;
        window.location.href = url;
      }
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
      if (e.key === 'Escape') {
        matchIdEl.removeChild(input);
        matchIdEl.classList.remove('match-id-edit');
        matchIdEl.textContent = matchIdEl.dataset.matchId;
        input.removeEventListener('blur', commit);
      }
    });
  });

  panel.querySelectorAll('.btn-domain').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDomain = btn.dataset.domain;
      panel.querySelectorAll('.btn-domain').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  panel.querySelectorAll('.btn-action, .link-item').forEach((el) => {
    const pathKey = el.dataset.path;
    if (!pathKey) return;

    if (pathKey === 'trace') {
      let clickTimer = null;
      el.addEventListener('click', () => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          clickTimer = null;
          openDrawer(getUrl(selectedDomain, pathKey));
        }, 250);
      });
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }
        window.open(getUrl(selectedDomain, pathKey), '_blank');
      });
    } else {
      el.addEventListener('click', () => {
        openDrawer(getUrl(selectedDomain, pathKey));
      });
    }
  });

  drawer.querySelector('.drawer-handle').addEventListener('click', toggleDrawer);
  overlay.addEventListener('click', closeDrawer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
