// ==UserScript==
// @name         Автообновление страниц
// @namespace    auto-refresh.local
// @version      1.0.1
// @description  Автоматически обновляет вкладку с заданным интервалом: 5, 10, 15 минут или свой.
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://github.com/TsukuyomiTim/Auto-Refresher/raw/refs/heads/main/auto-refresh.user.js
// @downloadURL  https://github.com/TsukuyomiTim/Auto-Refresher/raw/refs/heads/main/auto-refresh.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Состояние
  // Настройка вкладки (интервал, время следующего обновления, счётчик) хранится
  // в sessionStorage: он свой у каждой вкладки и переживает обновление страницы.
  // Общие настройки (тема, последний интервал, место кнопки) — в хранилище Tampermonkey.
  // ---------------------------------------------------------------------------
  const KEY = '__autoRefreshTask';

  function loadTask() {
    try {
      const t = JSON.parse(sessionStorage.getItem(KEY));
      if (t && t.interval > 0) return t;
    } catch { /* нет или испорчено */ }
    return null;
  }

  function saveTask(t) {
    try {
      if (t) sessionStorage.setItem(KEY, JSON.stringify(t));
      else sessionStorage.removeItem(KEY);
    } catch { /* sessionStorage недоступен */ }
  }

  let task = loadTask();
  if (task && (!task.nextAt || task.nextAt <= Date.now())) {
    // Вкладку восстановили после долгого перерыва — не дёргаем сразу, а начинаем отсчёт заново.
    task.nextAt = Date.now() + task.interval * 1000;
    saveTask(task);
  }

  let selectedSec = GM_getValue('lastInterval', 300);
  let buttonHidden = GM_getValue('buttonHidden', false);

  // ---------------------------------------------------------------------------
  // Обновление страницы
  // Один setTimeout до нужного момента. В фоновых вкладках браузер может придержать
  // его до минуты — поэтому при возврате на вкладку проверяем, не пора ли уже.
  // ---------------------------------------------------------------------------
  let reloadTimer = null;

  function schedule() {
    clearTimeout(reloadTimer);
    if (!task) return;
    const ms = Math.max(0, task.nextAt - Date.now());
    reloadTimer = setTimeout(doReload, Math.min(ms, 2147483000));
  }

  function doReload() {
    if (!task) return;
    task.count = (task.count || 0) + 1;
    task.nextAt = Date.now() + task.interval * 1000;
    saveTask(task);
    location.reload();
    schedule(); // если сайт отменил уход со страницы — следующий раз по расписанию
  }

  function start(sec) {
    task = { interval: sec, count: 0, nextAt: Date.now() + sec * 1000 };
    saveTask(task);
    GM_setValue('lastInterval', sec);
    schedule();
    refreshUI();
  }

  function stop() {
    task = null;
    saveTask(null);
    clearTimeout(reloadTimer);
    refreshUI();
  }

  document.addEventListener('visibilitychange', () => {
    if (task && !document.hidden && Date.now() >= task.nextAt) doReload();
    else updateTicker();
  });

  // ---------------------------------------------------------------------------
  // Форматирование
  // ---------------------------------------------------------------------------
  function fmtInterval(sec) {
    if (sec % 3600 === 0) return `${sec / 3600} ч`;
    if (sec % 60 === 0) return `${sec / 60} мин`;
    return `${sec} с`;
  }

  function fmtLeft(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
  }

  function plural(n, one, few, many) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  // ---------------------------------------------------------------------------
  // Интерфейс: всё внутри закрытого Shadow DOM, чтобы стили сайта не ломали
  // панель, а стили панели — сайт.
  // ---------------------------------------------------------------------------
  const CSS = `
:host { all: initial; }
.ar {
  --bg: linear-gradient(160deg, #dfe9ff 0%, #f3f0ff 45%, #e6f7f1 100%);
  --surface: rgba(255,255,255,.62); --surface-strong: rgba(255,255,255,.9);
  --fg: #1f2328; --muted: #5d6675; --border: rgba(255,255,255,.75); --chip: rgba(255,255,255,.5);
  --accent: #1a73e8; --accent-2: #6a8dff; --accent-soft: rgba(26,115,232,.15); --accent-fg: #fff;
  --danger: #e5484d; --danger-soft: rgba(229,72,77,.14); --on: #1e9e5a; --on-soft: rgba(30,158,90,.14);
  --shadow: 0 2px 10px rgba(40,60,120,.08); --timer-fg: #fff; --track: rgba(255,255,255,.3);
  --blob-1: rgba(106,141,255,.35); --blob-2: rgba(72,214,160,.25);
  --fab: rgba(255,255,255,.92); --fab-fg: #1a73e8; --panel-shadow: 0 12px 40px rgba(20,30,60,.22);
  font: 13px/1.4 system-ui, "Segoe UI", Roboto, sans-serif; color: var(--fg);
}
@media (prefers-color-scheme: dark) { .ar:not([data-theme="light"]) { DARK } }
.ar[data-theme="dark"] { DARK }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.fab {
  position: fixed; z-index: 2147483647; height: 36px; min-width: 36px; padding: 0 10px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 0; border-radius: 999px; cursor: pointer; user-select: none; touch-action: none;
  background: var(--fab); color: var(--fab-fg); box-shadow: 0 3px 12px rgba(0,0,0,.18);
  font: 600 12px/1 system-ui, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums;
  opacity: .6; transition: opacity .15s, transform .1s;
}
.fab:hover, .fab.open { opacity: 1; }
.fab:active { transform: scale(.96); }
.fab.on { background: var(--accent); color: var(--accent-fg); opacity: .85; }
.fab svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.fab.drag { opacity: 1; cursor: grabbing; }

.panel {
  position: fixed; z-index: 2147483647; width: 272px; padding: 12px; border-radius: 16px; overflow: hidden;
  background: radial-gradient(circle at 100% 0, var(--blob-1), transparent 60%),
              radial-gradient(circle at 0 100%, var(--blob-2), transparent 60%), var(--bg);
  box-shadow: var(--panel-shadow); border: 1px solid var(--border);
}
section { margin-bottom: 10px; }
.glass { background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); }

header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
h1 { font-size: 14px; margin: 0; font-weight: 650; letter-spacing: -.01em; }
.head-right { display: flex; align-items: center; gap: 6px; }
.pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: var(--chip); color: var(--muted); display: inline-flex; align-items: center; gap: 5px; }
.pill.on { background: var(--on-soft); color: var(--on); }
.pill.on::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .3; } }
.icon-btn { width: 26px; height: 26px; border-radius: 8px; cursor: pointer; color: var(--fg); display: grid; place-items: center; padding: 0; font: inherit; }
.icon-btn:hover { background: var(--surface-strong); }
.icon-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.page-card { padding: 8px 10px; border-radius: 11px; }
.page-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.page-host { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.timer { padding: 10px 12px; border-radius: 11px; color: var(--timer-fg); background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 6px 18px rgba(26,115,232,.25); }
.timer-row { display: flex; align-items: center; gap: 10px; }
.countdown { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1; }
.timer-meta { font-size: 12px; opacity: .9; line-height: 1.35; }
.progress { height: 4px; margin-top: 8px; border-radius: 99px; background: var(--track); overflow: hidden; }
.bar { height: 100%; width: 0; background: var(--timer-fg); border-radius: inherit; transition: width 1s linear; }
.note { margin: 0 0 10px; padding: 7px 10px; border-radius: 10px; font-size: 12px; color: var(--muted); text-align: center; }

.label { color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
.segmented { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; border-radius: 10px; }
.segmented button { padding: 6px 0; border: 0; border-radius: 8px; background: transparent; color: var(--fg); font: inherit; font-weight: 500; cursor: pointer; }
.segmented button:hover { background: var(--chip); }
.segmented button.active { background: var(--surface-strong); color: var(--accent); font-weight: 650; box-shadow: var(--shadow); }
.custom { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; gap: 8px; color: var(--muted); }
.field { display: flex; align-items: center; gap: 6px; padding: 0 8px; height: 30px; width: 96px; border-radius: 8px; }
.field:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.field.active { border-color: var(--accent); }
.field input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--fg); font: inherit; font-weight: 600; padding: 0; margin: 0; }
.unit { color: var(--muted); font-size: 12px; }

.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 34px; padding: 0 6px; white-space: nowrap; border: 0; border-radius: 10px; cursor: pointer; font: inherit; font-weight: 650; transition: filter .15s, opacity .15s; }
.btn svg { width: 14px; height: 14px; fill: currentColor; flex: none; }
.btn:hover:not(:disabled) { filter: brightness(1.08); }
.btn:disabled { opacity: .4; cursor: default; }
.btn-primary { background: var(--accent); color: var(--accent-fg); box-shadow: 0 4px 12px var(--accent-soft); }
.btn-danger { background: var(--danger-soft); color: var(--danger); }
`.replace(/DARK/g, `
  --bg: linear-gradient(160deg, #141826 0%, #1b1730 50%, #10201c 100%);
  --surface: rgba(255,255,255,.06); --surface-strong: rgba(255,255,255,.12);
  --fg: #e8eaed; --muted: #a0a7b4; --border: rgba(255,255,255,.09); --chip: rgba(255,255,255,.06);
  --accent: #7aa7ff; --accent-2: #a98bff; --accent-soft: rgba(122,167,255,.18); --accent-fg: #0f1115;
  --danger: #ff6b6f; --danger-soft: rgba(255,107,111,.14); --on: #4cd28a; --on-soft: rgba(76,210,138,.14);
  --shadow: 0 2px 12px rgba(0,0,0,.25); --timer-fg: #0f1115; --track: rgba(0,0,0,.2);
  --blob-1: rgba(122,167,255,.18); --blob-2: rgba(169,139,255,.16);
  --fab: rgba(32,35,42,.92); --fab-fg: #7aa7ff; --panel-shadow: 0 12px 40px rgba(0,0,0,.5);
`);

  const ICON_REFRESH = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  const host = document.createElement('div');
  host.setAttribute('data-auto-refresh', '');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${CSS}</style><div class="ar"></div>`;
  const root = shadow.querySelector('.ar');

  function applyTheme() {
    const t = GM_getValue('theme', '');
    if (t) root.dataset.theme = t;
    else delete root.dataset.theme;
  }
  function effectiveTheme() {
    return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  applyTheme();

  // Плавающая кнопка
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.title = 'Автообновление';
  root.append(fab);

  // Позиция кнопки (отступы от правого и нижнего края), можно перетаскивать
  let pos = GM_getValue('fabPos', { right: 16, bottom: 16 });
  function placeFab() {
    const maxR = Math.max(0, innerWidth - fab.offsetWidth - 4);
    const maxB = Math.max(0, innerHeight - fab.offsetHeight - 4);
    fab.style.right = `${Math.min(Math.max(4, pos.right), maxR)}px`;
    fab.style.bottom = `${Math.min(Math.max(4, pos.bottom), maxB)}px`;
  }

  let drag = null;
  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = fab.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, right: innerWidth - r.right, bottom: innerHeight - r.bottom, moved: false };
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    fab.classList.add('drag');
    pos = { right: drag.right - dx, bottom: drag.bottom - dy };
    placeFab();
    if (panel && !panel.hidden) placePanel();
  });
  fab.addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    fab.classList.remove('drag');
    if (moved) GM_setValue('fabPos', { right: parseInt(fab.style.right, 10), bottom: parseInt(fab.style.bottom, 10) });
    else togglePanel();
  });
  addEventListener('resize', () => { placeFab(); if (panel && !panel.hidden) placePanel(); });

  // Панель создаётся только при первом открытии
  let panel = null;
  const $ = (sel) => panel.querySelector(sel);

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'panel';
    panel.hidden = true;
    panel.innerHTML = `
      <header>
        <h1>Автообновление</h1>
        <div class="head-right">
          <span class="pill"></span>
          <button class="icon-btn glass" data-act="theme"></button>
          <button class="icon-btn glass" data-act="close" title="Закрыть">${ICON_CLOSE}</button>
        </div>
      </header>
      <section class="page-card glass">
        <div class="page-title"></div>
        <div class="page-host"></div>
      </section>
      <section class="timer" hidden>
        <div class="timer-row">
          <div class="countdown">0:00</div>
          <div class="timer-meta"><div>до обновления</div><div class="meta"></div></div>
        </div>
        <div class="progress"><div class="bar"></div></div>
      </section>
      <div class="note glass">Автообновление выключено</div>
      <section>
        <div class="label">Интервал</div>
        <div class="segmented glass">
          <button data-sec="300">5 мин</button>
          <button data-sec="600">10 мин</button>
          <button data-sec="900">15 мин</button>
        </div>
        <label class="custom">
          <span>Свой интервал</span>
          <span class="field glass"><input type="number" min="1" step="1" placeholder="—"><span class="unit">мин</span></span>
        </label>
      </section>
      <div class="actions">
        <button class="btn btn-primary" data-act="start">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span class="start-text">Запустить</span>
        </button>
        <button class="btn btn-danger" data-act="stop">
          <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Остановить
        </button>
      </div>`;
    root.append(panel);

    // Не отдаём нажатия клавиш сайту (у многих сайтов есть свои горячие клавиши)
    ['keydown', 'keyup', 'keypress'].forEach((t) => panel.addEventListener(t, (e) => {
      if (e.key === 'Escape') togglePanel(false);
      e.stopPropagation();
    }));

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.sec) selectInterval(Number(b.dataset.sec));
      else if (b.dataset.act === 'start') start(selectedSec);
      else if (b.dataset.act === 'stop') stop();
      else if (b.dataset.act === 'close') togglePanel(false);
      else if (b.dataset.act === 'theme') {
        GM_setValue('theme', effectiveTheme() === 'dark' ? 'light' : 'dark');
        applyTheme();
        updateThemeIcon();
      }
    });

    $('input').addEventListener('input', () => {
      const v = Math.floor(Number($('input').value));
      if (v >= 1) selectInterval(v * 60, true);
    });
  }

  function updateThemeIcon() {
    const dark = effectiveTheme() === 'dark';
    const b = $('[data-act="theme"]');
    b.innerHTML = dark ? ICON_SUN : ICON_MOON;
    b.title = dark ? 'Светлая тема' : 'Тёмная тема';
  }

  function selectInterval(sec, fromCustom = false) {
    selectedSec = sec;
    if (!panel) return;
    let isPreset = false;
    panel.querySelectorAll('.segmented button').forEach((b) => {
      const on = !fromCustom && Number(b.dataset.sec) === sec;
      if (on) isPreset = true;
      b.classList.toggle('active', on);
    });
    const input = $('input');
    if (isPreset) input.value = '';
    else if (!fromCustom) input.value = Math.max(1, Math.round(sec / 60));
    $('.field').classList.toggle('active', !isPreset);
  }

  function placePanel() {
    const r = fab.getBoundingClientRect();
    const pw = panel.offsetWidth, ph = panel.offsetHeight, gap = 8;
    let left = r.right - pw;
    if (left < 8) left = Math.min(r.left, innerWidth - pw - 8);
    let top = r.top - ph - gap;
    if (top < 8) top = Math.min(r.bottom + gap, innerHeight - ph - 8);
    panel.style.left = `${Math.max(8, left)}px`;
    panel.style.top = `${Math.max(8, top)}px`;
  }

  function onOutside(e) {
    if (e.target !== host) togglePanel(false); // клики внутри панели приходят как клики по host
  }

  function togglePanel(force) {
    if (!panel) buildPanel();
    const open = force === undefined ? panel.hidden : force;
    panel.hidden = !open;
    fab.classList.toggle('open', open);
    if (open) {
      selectInterval(task ? task.interval : selectedSec);
      updateThemeIcon();
      refreshUI();
      placePanel();
      document.addEventListener('pointerdown', onOutside, true);
    } else {
      document.removeEventListener('pointerdown', onOutside, true);
      refreshUI();
    }
  }

  // ---------------------------------------------------------------------------
  // Отрисовка. Секундный тикер работает только когда есть что показывать:
  // обновление включено, вкладка на экране и кнопка/панель видны.
  // ---------------------------------------------------------------------------
  let ticker = null;

  function tick() {
    if (!task) return;
    const left = task.nextAt - Date.now();
    const text = fmtLeft(left);
    fab.lastChild.textContent = text;
    if (panel && !panel.hidden) {
      $('.countdown').textContent = text;
      const total = task.interval * 1000;
      $('.bar').style.width = `${Math.min(100, Math.max(0, (1 - left / total) * 100))}%`;
    }
  }

  function updateTicker() {
    const need = task && !document.hidden && (!buttonHidden || (panel && !panel.hidden));
    if (need && !ticker) { tick(); ticker = setInterval(tick, 1000); }
    if (!need && ticker) { clearInterval(ticker); ticker = null; }
  }

  function refreshUI() {
    fab.hidden = buttonHidden && !(panel && !panel.hidden);
    fab.classList.toggle('on', !!task);
    fab.innerHTML = ICON_REFRESH + (task ? '<span></span>' : '');
    fab.title = task ? `Автообновление: каждые ${fmtInterval(task.interval)}` : 'Автообновление';
    placeFab();

    if (panel) {
      $('.pill').textContent = task ? 'Работает' : 'Выкл';
      $('.pill').classList.toggle('on', !!task);
      $('.page-title').textContent = document.title || location.href;
      $('.page-host').textContent = location.host;
      $('.timer').hidden = !task;
      $('.note').hidden = !!task;
      $('.start-text').textContent = task ? 'Перезапустить' : 'Запустить';
      $('[data-act="stop"]').disabled = !task;
      if (task) {
        const n = task.count || 0;
        $('.meta').textContent = `каждые ${fmtInterval(task.interval)} · ${n} ${plural(n, 'раз', 'раза', 'раз')}`;
      }
      if (!panel.hidden) placePanel();
    }
    clearInterval(ticker);
    ticker = null;
    updateTicker();
  }

  // Меню Tampermonkey (значок расширения → этот скрипт)
  GM_registerMenuCommand('Показать / скрыть кнопку', () => {
    buttonHidden = !buttonHidden;
    GM_setValue('buttonHidden', buttonHidden);
    refreshUI();
  });
  GM_registerMenuCommand('Открыть панель', () => togglePanel(true));
  GM_registerMenuCommand('Остановить на этой вкладке', stop);

  const mount = () => (document.body || document.documentElement).append(host);
  mount();
  // Некоторые сайты перерисовывают <body> целиком и выкидывают чужие элементы — возвращаем кнопку.
  // Следим только за прямыми детьми body/html, без обхода всего дерева: это почти ничего не стоит.
  const guard = new MutationObserver(() => { if (!host.isConnected) mount(); });
  guard.observe(document.documentElement, { childList: true });
  if (document.body) guard.observe(document.body, { childList: true });

  refreshUI();
  schedule();
})();
